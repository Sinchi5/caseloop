# Test plan

Three kinds of evidence, from cheapest to most convincing: the rules are right (unit tests), the flows work in a real browser (end-to-end), and a caseworker can actually use it (a timed walkthrough).

## 1. Domain rules (Vitest, `npm test`)

| File | What it proves |
|---|---|
| `clocks.test.ts` | Windows match the statute (24 h, 7 d, 60 d) and cite §424(6)(a), §424(3), §424(7); the 30-day review is labelled practice; clocks count from intake; upcoming → due soon → overdue at the right moments (exactly on time is not late); a phone call doesn't start the investigation, a visit does; late completion is *done late*; the clock keeps running while waiting on a supervisor; a returned submission isn't done; notes are owed 5 days after a contact. |
| `matching.test.ts` | Jaro-Winkler matches Winkler's published reference values; address normalization; birth-date typo detection; **labelled pairs**: every “same person” pair is flagged (spelling variant, moved house, day/month swapped, last-name typo) and no “different person” pair is (sibling, similar name, **twins**). Every match explains itself. |
| `policy.test.ts` | A caseworker sees only their own cases; a supervisor sees all; an officer sees status only, only for their agency. **The officer's view contains no notes, contacts, risk, history, staff names or outcome**, checked by serializing every view. Assigning from the queue counts as opening. Only the assigned worker can write; nobody writes to a closed case. |
| `priority.test.ts` | Every seeded event passes the same schema used to load saved data; each demo case lands in the tier its story says; ordering is missed deadline > risk > next due; reasons are specific (“waiting on supervisor for 2 days”, “overdue by 28 days”). |

## 2. Flows in a real browser (Playwright + axe, `npm run test:e2e`)

Runs against the production build, the same files that get deployed.

- **The whole loop:** an officer fills in and sends a referral → the supervisor sees it as *not opened yet* and assigns it → the caseworker finds it, logs a home visit, and the 24-hour clock shows *Done* → the officer sees *waiting for: safety assessment done*, with no caseworker name or visit details.
- **Approval reaches the worker:** a supervisor approves from the overview; the worker sees it approved, and the trail records who approved it.
- **Privacy:** an officer can't see notes or staff names on their own referral, can't open a hotline case at all, and their status check appears in the access log.
- **Validation:** an empty referral shows an error summary and marks invalid fields for screen readers.
- **Time:** *Skip ahead 1 day* moves a case from *due soon* to *overdue*.
- **Accessibility:** nine pages across all three roles pass axe with WCAG 2.1 A/AA rules.
- **Phone:** no sideways scrolling on the landing page, the case list or a case page at Pixel 7 size.

## 3. A caseworker walkthrough (human, ~15 minutes)

Automated tests show the software does what I intended. Only a caseworker can show I intended the right thing.

**Setup.** Fresh demo (*Reset demo*), on the caseworker's own phone if possible. Say up front: this is fake data; don't mention real cases, names or places; you can stop anytime; I'll only write down times and your opinions about the tool.

**Before each task**, ask: *“How would you find this out today?”* and note the answer and roughly how long it takes.

| # | Task | Done when | Target |
|---|---|---|---|
| 1 | As Maria Rivera: “Which case needs you first, and why?” | Names NC-1033 and the reason | < 30 s |
| 2 | “You just visited Destiny at school. Log it, with a photo, and tell me when your note is due.” | Contact saved, due date read out | < 60 s |
| 3 | As Lena Brooks: “What is waiting on you, and how long has it waited?” Approve it. | NC-1037, 2 days, approved | < 45 s |

**Then ask:**
1. What would you not trust here?
2. What's missing that you'd need on day one?
3. Is there anything on the officer's screen you think police should *not* see? Anything they should?
4. Is “missed deadline before risk” the right order? When wouldn't it be?

**Results** (filled in after the session):

| Task | Today (how / how long) | In CaseLoop (time) | Completed? | Notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Changes made because of the session go in the commit history with the reason.
