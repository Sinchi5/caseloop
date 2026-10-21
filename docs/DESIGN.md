# CaseLoop design

## Problem

A child-protection referral passes through several hands (a referring agency, a CPS supervisor, a caseworker) with legal deadlines attached. In interviews with a New York CPS caseworker, the failures were rarely about missing data. They were about **handoffs nobody could see**: a submission with no notification, a deadline tracked on paper, a returned report the worker never learned about, an officer who never heard back.

**Goal:** for one referral, from report to determination, make every deadline, handoff and approval visible to the people who need it, and nothing more.

## Users and what each needs

| User | Needs to know | Must not see |
|---|---|---|
| Caseworker | What to do next, and why; what is waiting on someone else | Other workers' cases |
| CPS supervisor | What is unassigned, what is waiting on them, who is overloaded | — |
| Referring officer | Whether CPS opened, assigned, saw the child, assessed, closed | Notes, contacts, staff names, risk scoring, history, the outcome |

## Scope

**In:** one end-to-end flow; four deadlines; approvals with returns; contacts and notes; duplicate-person suggestions; role-scoped views; access log; phone layout.

**Out, on purpose:** authentication, a server, notifications by SMS or email, court filings, services and referrals out, family assessment response track, multi-county. Each is a known next step (below), not an oversight.

## Decisions and trade-offs

### 1. An append-only event log is the source of truth
Every change is a typed event (`REFERRAL_SUBMITTED`, `ASSIGNED`, `CONTACT_LOGGED`, `SUBMITTED`, `APPROVED`, `RETURNED`, …). Each case is rebuilt by folding its events (`deriveCases`). 

- *Why:* the core complaint is “there's no trail.” With a log, the trail is not a feature added later; it is the data. Read receipts, response times and the access log all fall out of it.
- *Cost:* every read is a fold. Fine at caseload scale; a server version would keep a projection table updated from the same events.
- Invalid transitions (approving something not pending, a second “first view”) are ignored rather than thrown, so a replayed or duplicated event cannot corrupt state.

### 2. Deadlines cite their source, and law is labelled separately from practice
| Clock | Window | Source |
|---|---|---|
| Start the investigation | 24 hours | NY Social Services Law §424(6)(a) |
| Safety assessment / preliminary report | 7 days | NY Social Services Law §424(3) |
| Supervisor review | 30 days | Office practice (interview) |
| Determination: indicated / unfounded | 60 days | NY Social Services Law §424(7) |
| Contact note written | 5 days after the contact | Office practice: 3–5 days (interview) |

- Clocks count from **intake**, not the incident.
- **The clock keeps running while a submission waits on a supervisor.** The statute does not pause for internal review, and hiding approval time is how the 2-day delay in the interview went unnoticed. The UI shows the wait separately so the worker isn't blamed for it.
- **A phone call does not start the investigation.** Only a face-to-face contact (home or school visit) satisfies the 24-hour clock.
- Finished late is recorded as *done late*, not *done*. The record should not flatter the outcome.

### 3. Priority: missed deadline first, then risk, then next due date
A high-risk case with time left does **not** jump a standard case whose 24-hour clock has expired: an expired start clock means a child nobody has seen. This is the most debatable rule in the system, so it is written in one function (`rankCases`) with the reasoning in a comment, and every case shows its reasons in plain words. A real deployment should decide this with supervisors, not engineers.

### 4. Duplicate people: suggest, explain, never merge
Scoring: Jaro-Winkler similarity on first and last name, birth date (exact, day/month swapped, or one digit off), and normalized address (abbreviations and unit numbers ignored). Weighted score with two thresholds (*likely* ≥ 0.88, *possible* ≥ 0.72), plus two hard “no”s regardless of score:

- a completely different birth date;
- a clearly different first name. **This rule was added because a test caught twins** (same birthday, address and last name) being flagged as one person.

The worker sees both records side by side with the reasons, and confirms or rejects. The decision is an event. **Known gap:** nicknames (Bill/William) fail the first-name rule; production needs a nickname table, and the thresholds should be tuned on real labelled pairs, measuring false merges separately from missed matches, since a false merge is the more dangerous error.

### 5. Privacy by construction
- One policy module (`policy.ts`) decides access: caseworker → own cases; supervisor → unit; referring agency → its own referrals, **status only**.
- The officer's view (`agencyView`) is **built field by field**, never by copying and removing fields from the case, so a new case field can't leak by default. A unit test serializes every officer view and asserts no note text, contact summary, staff name, risk field or outcome appears.
- Every case view, including an officer's status check, is written to an access log.
- Child names show as first name + initial in lists; full names only inside the case.
- The demo stores nothing outside the browser; photos stay in memory and are gone on reload.

### 6. Notifications are derived, not stored
A notice exists because an event happened (assigned, submitted, approved, returned, a step of the loop) or a time passed (a deadline coming due, a referral unopened after 2 hours). `noticesFor(person, cases, now)` computes them; only *when you last opened your inbox* is stored. So a notice can never disagree with the case, there's no “mark as sent” bug, and adding a rule is one function. People are never notified of their own actions. In production the same function would decide what to push by SMS or email.

### 7. Results come from the same history
`results()` computes median report-to-visit time, the share of deadlines met on time (of those that have come due), supervisor approval waits (read from the log, so a return and resend count as two waits) and note lag. No one enters data to produce them. The chart colors were checked with a color-blindness validator, and *missed* also has stripes, so it never depends on telling red from amber.

### 8. Accessibility and the field
Status is never shown by color alone (every pill has a word and an icon). All pages pass axe WCAG 2.1 AA in CI. The contact log is designed for a phone in a doorway: four fields, camera capture, under a minute.

## Data model (abridged)

```
Referral   source (agency | hotline), incidentAt, address, children[], caregivers[], riskFactors[], narrative
CaseEvent  { id, caseId, at, actorId } + one of:
           REFERRAL_SUBMITTED | SEEN | ASSIGNED | CONTACT_LOGGED | NOTE_WRITTEN |
           SUBMITTED(item) | APPROVED(item) | RETURNED(item, reason) | REVIEW_COMPLETED | MATCH_DECIDED
CaseState  derived: intakeAt, seenBy{actor→first view}, assignedTo, contacts[], approvals{safety, determination},
           reviewCompletedAt, matchDecisions, events[]
AccessEntry { at, actorId, caseId, view: full | status-only }
```

## Path to production

1. **Server and storage:** an append-only `case_events` table in Postgres (insert-only grants, no UPDATE/DELETE), projections for lists, row-level security mirroring `policy.ts`.
2. **Identity:** agency SSO with MFA; actor IDs from the identity provider, never from the client.
3. **Notifications:** the events that matter (assigned, submitted, returned, overdue) sent by SMS and email, with the same timing shown in the UI.
4. **Integration:** read-only sync from the state system of record first (for example, New York's CONNECTIONS); writes only after the read path is trusted.
5. **Compliance review:** criminal-justice data (FBI CJIS Security Policy), school records (FERPA), health information (HIPAA) and substance-use treatment records (42 CFR Part 2) each carry their own rules about who may see what. The policy module is where those rules would live and be tested.
6. **Measure what changed:** median time from report to first contact, percentage of clocks met, approval wait time, note lag. Report them per unit, not per worker.

## Sources

- NY Social Services Law §424: https://www.nysenate.gov/legislation/laws/SOS/424
- Child Welfare Information Gateway, *The Use of Safety and Risk Assessment in Child Protection Cases — New York*: https://www.childwelfare.gov/resources/use-safety-and-risk-assessment-child-protection-cases-new-york/
- Interview with a New York CPS caseworker (October 2026), shared with permission and anonymized.
