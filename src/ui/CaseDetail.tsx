import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { actorName, caseworkers } from '../domain/actors'
import { indicatedAt, isClosed, matchKey, type CaseState, type Contact } from '../domain/caseState'
import { ITEM_LABEL, latestHandoff } from '../domain/handoff'
import { NOTE_SOURCE, NOTE_WINDOW, computeClocks, notesOwed } from '../domain/clocks'
import { age, formatDay, formatSpan, formatWhen, fullName } from '../domain/format'
import { findMatches } from '../domain/matching'
import { accessTo, agencyView, can } from '../domain/policy'
import { rank } from '../domain/priority'
import { riskLabel } from '../domain/risk'
import { REGISTRY } from '../domain/seed'
import type { ApprovalItem, CaseEvent, ContactKind, Person } from '../domain/types'
import { photoPreviews } from '../store/photos'
import { useStore } from '../store/context'
import { APPROVAL_ITEMS, KIND, clockLine, itemTitle } from './labels'
import { ClockRows, ClockTrack, Empty, Icon, LoopSteps, RiskPill, Section, StatusPill, TierPill } from './parts'

export function CaseDetail() {
  const { id = '' } = useParams()
  const { caseById, me, now, record, logAccess } = useStore()
  const c = caseById(id)
  const access = c ? accessTo(me, c) : 'none'

  useEffect(() => {
    if (!c || access === 'none') return
    logAccess(c.id, access)
    if (access === 'full' && c.seenBy[me.id] === undefined) record({ type: 'SEEN', caseId: c.id })
    // Only on opening the case, not on every change to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, me.id, access])

  if (!c) return <div className="page"><h1>Case not found</h1><p>There is no case {id}.</p></div>
  if (access === 'none')
    return (
      <div className="page">
        <h1>You do not have access to {c.id}</h1>
        <p className="sub">Cases are visible only to the assigned caseworker, the unit supervisor, and (as status only) the agency that sent the referral.</p>
      </div>
    )
  if (access === 'status-only') return <AgencyCase c={c} now={now} />
  return <FullCase c={c} />
}

function AgencyCase({ c, now }: { c: CaseState; now: number }) {
  const v = agencyView(c)
  return (
    <div className="page narrow">
      <p className="crumb"><Link to="/referrals">My referrals</Link> /</p>
      <h1>{v.caseId} · {v.children.join(', ')}</h1>
      <p className="sub">Sent by {v.sentBy}, {formatWhen(v.sentAt)}</p>
      <Section title="Where this referral is" id="loop">
        <LoopSteps steps={v.steps} now={now} />
      </Section>
      <p className="hint">
        You see whether each step happened and when. Case notes, staff names and the outcome stay with CPS. If a step stalls,
        call Northfield County CPS intake at (555) 010-0142.
      </p>
    </div>
  )
}

function FullCase({ c }: { c: CaseState }) {
  const { me, now } = useStore()
  const r = rank(c, now)
  const clocks = computeClocks(c, now)
  const day = Math.floor((now - c.intakeAt) / 86_400_000)
  const src = c.referral.source
  const returned = (Object.entries(c.approvals) as [ApprovalItem, NonNullable<CaseState['approvals'][ApprovalItem]>][]).filter(
    ([, a]) => a.status === 'returned',
  )

  return (
    <div className="page">
      <p className="crumb">
        <Link to={me.role === 'supervisor' ? '/unit' : '/cases'}>{me.role === 'supervisor' ? 'Unit overview' : 'My cases'}</Link> /
      </p>
      <div className="case-head">
        <div>
          <h1>
            {c.id} · {c.referral.children.map((p) => p.firstName).join(', ')} {c.referral.children[0].lastName}
          </h1>
          <p className="sub">
            {c.referral.address} · Received {formatWhen(c.intakeAt)} · Day {day} ·{' '}
            {src.kind === 'agency' ? `Referred by ${actorName(src.officerId)}, ${src.agency}` : 'State Central Register hotline'}
          </p>
          <p className="sub">
            {c.assignedTo ? `Assigned to ${actorName(c.assignedTo.workerId)}` : 'Not assigned to a caseworker'}
          </p>
        </div>
        <div className="case-pills">
          <RiskPill level={r.risk} />
          <TierPill tier={r.tier} />
        </div>
      </div>

      {returned.map(([item, a]) => (
        <div key={item} className="banner tone-warn" role="status">
          <Icon name="alert" />
          <p>
            {actorName(a.decidedBy!)} returned the {ITEM_LABEL[item]}{' '}
            {formatSpan(now - a.decidedAt!)} ago: “{a.reason}” {me.role === 'caseworker' && 'Fix it and submit again below.'}
          </p>
        </div>
      ))}

      <div className="case-grid">
        <div className="case-main">
          <Handoff c={c} />
          <Section title="Deadlines" id="deadlines">
            <ClockTrack clocks={clocks} intakeAt={c.intakeAt} now={now} />
            <ClockRows clocks={clocks} now={now} />
          </Section>
          <Matches c={c} />
          <Contacts c={c} />
          <Trail c={c} />
        </div>
        <aside className="case-side">
          <Actions c={c} />
          <Section title="Referral" id="referral">
            <ul className="factors">
              {c.referral.riskFactors.length ? (
                c.referral.riskFactors.map((f) => <li key={f}>{riskLabel(f)}</li>)
              ) : (
                <li>No risk factors marked</li>
              )}
            </ul>
            <blockquote className="narrative">{c.referral.narrative}</blockquote>
            {c.referral.formSeconds !== undefined && (
              <p className="hint">Officer filled in the form in {Math.round(c.referral.formSeconds / 60)} min.</p>
            )}
          </Section>
          <Section title="People" id="people">
            <ul className="people">
              {[...c.referral.children, ...c.referral.caregivers].map((p) => (
                <li key={p.id}>
                  <span>{fullName(p)}</span>
                  <span className="muted">
                    {p.kind === 'child' ? 'Child' : 'Caregiver'}, {age(p.dob, now)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="What the referring agency sees" id="agency-sees">
            {src.kind === 'agency' ? (
              <>
                <LoopSteps steps={agencyView(c).steps} now={now} compact />
                <p className="hint">Only these steps and their times. No notes, staff names, risk or outcome.</p>
              </>
            ) : (
              <p className="hint">This report came from the hotline, so no outside agency is following it.</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  )
}

function Handoff({ c }: { c: CaseState }) {
  const { me, now } = useStore()
  const h = latestHandoff(c, now)
  if (!h || now - h.at > 30 * 86_400_000) return null
  const mine = me.id === h.toId
  const items = h.open.length + h.notes.length + h.returned.length
  return (
    <section className="section handoff" aria-labelledby="handoff">
      <div className="section-head">
        <h2 id="handoff">{mine ? `You took this case over from ${actorName(h.fromId)}` : `Changed hands: ${actorName(h.fromId)} to ${actorName(h.toId)}`}</h2>
        <span className="muted small">{formatWhen(h.at)} · moved by {actorName(h.byId)}</span>
      </div>
      <p className="hint">Everything still open on this case, including what was started before the handoff, so nothing gets missed.</p>
      {items ? (
        <ul className="handoff-list">
          {h.open.map((k) => (
            <li key={k.def.id}>
              <StatusPill status={k.awaitingApprovalSince !== undefined && k.status !== 'overdue' ? 'awaiting' : k.status} />
              <span><strong>{k.def.label}</strong>: {clockLine(k, now)}</span>
            </li>
          ))}
          {h.notes.map((n) => (
            <li key={n.contact.id}>
              <StatusPill status={n.status} />
              <span>
                <strong>Note owed</strong> for the {KIND[n.contact.kind].toLowerCase()} with {n.contact.with} on {formatDay(n.contact.contactAt)}, logged by{' '}
                {actorName(n.contact.loggedBy)}. <Link to={`/cases/${c.id}#contact-${n.contact.id}`}>Write it</Link>
              </span>
            </li>
          ))}
          {h.returned.map((r) => (
            <li key={r.item}>
              <StatusPill status="due-soon" />
              <span><strong>{itemTitle(r.item)} returned</strong>{r.reason ? `: “${r.reason}”` : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing open. The case came over clean.</Empty>
      )}
    </section>
  )
}

function Matches({ c }: { c: CaseState }) {
  const { me, now, record } = useStore()
  const people: Person[] = [...c.referral.children, ...c.referral.caregivers]
  const found = useMemo(
    () =>
      people.flatMap((p) =>
        findMatches({ ...p, address: c.referral.address }, REGISTRY).map((m) => ({ p, m })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.id],
  )
  if (!found.length) return null
  const canDecide = can(me, 'decide-match', c)
  const decidedEvent = (pId: string, kId: string) =>
    [...c.events].reverse().find(
      (e): e is Extract<CaseEvent, { type: 'MATCH_DECIDED' }> => e.type === 'MATCH_DECIDED' && e.personId === pId && e.candidateId === kId,
    )

  return (
    <Section title="Possible earlier records" id="matches">
      <p className="hint">
        Suggested by name, birth date and address. Nothing is merged until a worker confirms it, and the decision is recorded.
      </p>
      <ul className="matches">
        {found.map(({ p, m }) => {
          const d = c.matchDecisions[matchKey(p.id, m.candidate.id)]
          const ev = decidedEvent(p.id, m.candidate.id)
          const k = m.candidate
          return (
            <li key={p.id + k.id} className={`match ${d ? `decided-${d}` : ''}`}>
              <div className="match-head">
                <strong>{fullName(p)}</strong>
                <span className={`pill tone-${m.level === 'likely' ? 'warn' : 'neutral'}`}>
                  {m.level === 'likely' ? 'Likely the same person' : 'Possibly the same person'} · {Math.round(m.score * 100)}%
                </span>
              </div>
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Field</span></th>
                    <th scope="col">This report</th>
                    <th scope="col">Earlier record</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row">Name</th><td>{fullName(p)}</td><td>{fullName(k)}</td></tr>
                  <tr><th scope="row">Born</th><td>{p.dob}</td><td>{k.dob}</td></tr>
                  <tr><th scope="row">Address</th><td>{c.referral.address}</td><td>{k.address}</td></tr>
                  <tr>
                    <th scope="row">History</th>
                    <td>This report</td>
                    <td>{k.priorReports.length ? k.priorReports.map((x) => `${x.year} ${x.outcome}`).join(', ') : 'No reports'}</td>
                  </tr>
                </tbody>
              </table>
              <ul className="why">
                {m.reasons.map((x) => <li key={x}>{x}</li>)}
              </ul>
              {d && ev ? (
                <p className="decided">
                  <Icon name="check" size={14} /> {actorName(ev.actorId)} marked these as{' '}
                  <strong>{d === 'same' ? 'the same person' : 'different people'}</strong>, {formatDay(Date.parse(ev.at))}.
                  {d === 'same' && ' Earlier history is linked to this case.'}
                </p>
              ) : canDecide ? (
                <div className="btns">
                  <button type="button" className="btn" onClick={() => record({ type: 'MATCH_DECIDED', caseId: c.id, personId: p.id, candidateId: k.id, decision: 'same' })}>
                    Same person: link history
                  </button>
                  <button type="button" className="btn secondary" onClick={() => record({ type: 'MATCH_DECIDED', caseId: c.id, personId: p.id, candidateId: k.id, decision: 'different' })}>
                    Different people
                  </button>
                </div>
              ) : (
                <p className="hint">Waiting for the assigned caseworker to confirm. {formatSpan(now - c.intakeAt)} since intake.</p>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

const toLocalInput = (t: number) => {
  const d = new Date(t)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function Contacts({ c }: { c: CaseState }) {
  const { me, now, record } = useStore()
  const canLog = can(me, 'log-contact', c)
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const owed = new Map(notesOwed(c, now).map((n) => [n.contact.id, n]))
  const list = [...c.contacts].sort((a, b) => b.contactAt - a.contactAt)

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const contactId = crypto.randomUUID()
    const files = (f.getAll('photos') as File[]).filter((x) => x.size > 0)
    for (const file of files) photoPreviews.set(`${contactId}/${file.name}`, URL.createObjectURL(file))
    const contactAt = Date.parse(String(f.get('when')))
    record({
      type: 'CONTACT_LOGGED',
      caseId: c.id,
      contactId,
      contactAt: new Date(Number.isNaN(contactAt) ? now : Math.min(contactAt, now)).toISOString(),
      kind: f.get('kind') as ContactKind,
      with: String(f.get('with')),
      summary: String(f.get('summary') ?? ''),
      photos: files.map((x) => x.name),
    })
    setOpen(false)
    setFlash(`Logged. The full note is due by ${formatDay((Number.isNaN(contactAt) ? now : contactAt) + NOTE_WINDOW)}.`)
  }

  return (
    <Section
      title="Contacts and notes"
      id="contacts"
      aside={canLog && !open ? <button type="button" className="btn small" onClick={() => { setOpen(true); setFlash(null) }}>Log a contact</button> : null}
    >
      {flash && <p className="flash" role="status"><Icon name="check" size={14} /> {flash}</p>}
      {open && (
        <form className="form contact-form" onSubmit={submit}>
          <p className="hint">Quick log from the field. Photos attach to this contact in the same step.</p>
          <div className="form-row">
            <label>
              When
              <input type="datetime-local" name="when" defaultValue={toLocalInput(now)} max={toLocalInput(now)} required />
            </label>
            <label>
              Type
              <select name="kind" defaultValue="home-visit">
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>
            With whom
            <input name="with" required placeholder="e.g. Destiny, school nurse" />
          </label>
          <label>
            Quick summary <span className="muted">(optional)</span>
            <textarea name="summary" rows={2} placeholder="One or two lines. Write the full note later." />
          </label>
          <label className="file">
            <Icon name="camera" /> Photos <span className="muted">(stay on this device in the demo)</span>
            <input type="file" name="photos" accept="image/*" capture="environment" multiple />
          </label>
          <div className="btns">
            <button className="btn" type="submit">Save contact</button>
            <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {list.length ? (
        <ul className="contacts">
          {list.map((k) => <ContactItem key={k.id} c={c} k={k} owed={owed.get(k.id)} />)}
        </ul>
      ) : (
        <Empty>No contacts yet. The 24-hour clock stops when someone sees the child in person.</Empty>
      )}
      <p className="hint">{NOTE_SOURCE.cite}.</p>
    </Section>
  )
}

function ContactItem({ c, k, owed }: { c: CaseState; k: Contact; owed?: ReturnType<typeof notesOwed>[number] }) {
  const { me, now, record } = useStore()
  const [text, setText] = useState('')
  const canWrite = can(me, 'write-note', c)
  return (
    <li className="contact" id={`contact-${k.id}`}>
      <div className="contact-head">
        <strong>{KIND[k.kind]}</strong> with {k.with}
        <span className="muted"> · {formatWhen(k.contactAt)}</span>
      </div>
      {k.summary && <p className="contact-summary">{k.summary}</p>}
      {k.photos.length > 0 && (
        <ul className="photos">
          {k.photos.map((name) => {
            const url = photoPreviews.get(`${k.id}/${name}`)
            return <li key={name}>{url ? <img src={url} alt={`Photo: ${name}`} /> : <span className="photo-name"><Icon name="camera" size={14} /> {name}</span>}</li>
          })}
        </ul>
      )}
      {k.note ? (
        <div className="note">
          <p>{k.note.text}</p>
          <p className="muted small">
            Note by {actorName(k.note.by)}, {formatSpan(k.note.at - k.contactAt)} after the contact
          </p>
        </div>
      ) : (
        <div className="note-owed">
          <div className="note-owed-head">
            <span>
              Note {owed?.status === 'overdue' ? `${formatSpan(now - owed.dueAt)} late` : `due ${formatDay(k.contactAt + NOTE_WINDOW)}`}
            </span>
            {owed && <StatusPill status={owed.status} />}
          </div>
          {canWrite && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!text.trim()) return
                record({ type: 'NOTE_WRITTEN', caseId: c.id, contactId: k.id, text })
              }}
            >
              <label>
                <span className="sr-only">Note for {KIND[k.kind].toLowerCase()} with {k.with}</span>
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the note" />
              </label>
              <button className="btn small" type="submit" disabled={!text.trim()}>Save note</button>
            </form>
          )}
        </div>
      )}
    </li>
  )
}

function Actions({ c }: { c: CaseState }) {
  const { me, now, record } = useStore()
  const closed = isClosed(c)
  const workers = caseworkers()
  const [assignee, setAssignee] = useState(c.assignedTo?.workerId ?? workers[0].id)
  const [reason, setReason] = useState('')

  if (closed) {
    const d = c.approvals.determination!
    return (
      <Section title="Closed" id="actions">
        <p>
          Determination: <strong>{d.outcome}</strong>. Approved by {actorName(d.decidedBy!)}, {formatDay(d.decidedAt!)}.
        </p>
      </Section>
    )
  }

  const pending = APPROVAL_ITEMS.filter((i) => c.approvals[i]?.status === 'pending')
  const itemName = itemTitle

  if (me.role === 'supervisor') {
    return (
      <Section title="Supervisor actions" id="actions">
        <form
          className="form inline"
          onSubmit={(e) => {
            e.preventDefault()
            record({ type: 'ASSIGNED', caseId: c.id, workerId: assignee })
          }}
        >
          <label>
            {c.assignedTo ? 'Reassign to' : 'Assign to'}
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <button className="btn small" type="submit" disabled={c.assignedTo?.workerId === assignee}>
            {c.assignedTo ? 'Reassign' : 'Assign'}
          </button>
        </form>

        {pending.map((i) => {
          const a = c.approvals[i]!
          return (
            <div key={i} className="approval">
              <p>
                <strong>{itemName(i)}</strong> from {actorName(a.submittedBy)}, waiting {formatSpan(now - a.submittedAt)}
                {a.outcome && <> · proposed: <strong>{a.outcome}</strong></>}
              </p>
              <blockquote className="narrative">{a.summary}</blockquote>
              <div className="btns">
                <button type="button" className="btn small" onClick={() => record({ type: 'APPROVED', caseId: c.id, item: i })}>Approve</button>
              </div>
              <form
                className="form inline"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!reason.trim()) return
                  record({ type: 'RETURNED', caseId: c.id, item: i, reason })
                  setReason('')
                }}
              >
                <label>
                  Return with a reason
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change" />
                </label>
                <button type="submit" className="btn small secondary" disabled={!reason.trim()}>Return</button>
              </form>
            </div>
          )
        })}

        {c.reviewCompletedAt === undefined ? (
          <div className="approval">
            <p><strong>30-day review</strong> due {formatDay(c.intakeAt + 30 * 86_400_000)}</p>
            <button type="button" className="btn small secondary" onClick={() => record({ type: 'REVIEW_COMPLETED', caseId: c.id })}>
              Mark 30-day review done
            </button>
          </div>
        ) : (
          <p className="muted small">30-day review done {formatDay(c.reviewCompletedAt)}.</p>
        )}
      </Section>
    )
  }

  if (!can(me, 'submit', c)) return null
  return (
    <Section title="Send to supervisor" id="actions">
      {indicatedAt(c) !== undefined && (
        <p className="small">
          Indicated and open for services. The FASP deadlines count from {formatDay(indicatedAt(c)!)}.
        </p>
      )}
      {(indicatedAt(c) !== undefined ? APPROVAL_ITEMS : APPROVAL_ITEMS.slice(0, 2)).map((i) => (
        <SubmitItem key={i} c={c} item={i} />
      ))}
    </Section>
  )
}

function SubmitItem({ c, item }: { c: CaseState; item: ApprovalItem }) {
  const { now, record } = useStore()
  const [summary, setSummary] = useState('')
  const [outcome, setOutcome] = useState<'indicated' | 'unfounded'>('unfounded')
  const a = c.approvals[item]
  const name = itemTitle(item)

  if (a?.status === 'approved') return <p className="muted small"><Icon name="check" size={13} /> {name} approved {formatDay(a.decidedAt!)}.</p>
  if (a?.status === 'pending')
    return (
      <p className="await-line">
        <Icon name="hourglass" size={14} /> {name} sent {formatSpan(now - a.submittedAt)} ago. Your supervisor was notified; you will see the
        decision here.
      </p>
    )
  if (item === 'determination' && c.approvals.safety?.status !== 'approved')
    return <p className="muted small">Determination: available once the safety assessment is approved.</p>
  if (item === 'fasp-comprehensive' && c.approvals['fasp-initial']?.status !== 'approved')
    return <p className="muted small">Comprehensive FASP: available once the Initial FASP is approved.</p>

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!summary.trim()) return
        record({ type: 'SUBMITTED', caseId: c.id, item, summary, outcome: item === 'determination' ? outcome : undefined })
        setSummary('')
      }}
    >
      <label>
        {name}
        {a?.status === 'returned' && <span className="muted"> (returned, send again)</span>}
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={item === 'safety' ? 'Safe / safe with a plan / unsafe, and why' : item === 'determination' ? 'Summary of findings' : 'Family strengths, needs, and the services agreed with the family'} />
      </label>
      {item === 'determination' && (
        <fieldset className="radios">
          <legend>Finding</legend>
          {(['indicated', 'unfounded'] as const).map((o) => (
            <label key={o}><input type="radio" name={`outcome-${c.id}`} checked={outcome === o} onChange={() => setOutcome(o)} /> {o[0].toUpperCase() + o.slice(1)}</label>
          ))}
        </fieldset>
      )}
      <button className="btn small" type="submit" disabled={!summary.trim()}>Send for approval</button>
    </form>
  )
}

const VERB: Record<CaseEvent['type'], (e: CaseEvent) => string> = {
  REFERRAL_SUBMITTED: () => 'sent the referral',
  SEEN: () => 'opened the case',
  ASSIGNED: (e) => `assigned it to ${actorName((e as Extract<CaseEvent, { type: 'ASSIGNED' }>).workerId)}`,
  CONTACT_LOGGED: (e) => {
    const x = e as Extract<CaseEvent, { type: 'CONTACT_LOGGED' }>
    return `logged a ${KIND[x.kind].toLowerCase()} with ${x.with}${x.photos.length ? ` (${x.photos.length} photo${x.photos.length > 1 ? 's' : ''})` : ''}`
  },
  NOTE_WRITTEN: () => 'wrote a contact note',
  SUBMITTED: (e) => `sent the ${ITEM_LABEL[(e as Extract<CaseEvent, { type: 'SUBMITTED' }>).item]} for approval`,
  APPROVED: (e) => `approved the ${ITEM_LABEL[(e as Extract<CaseEvent, { type: 'APPROVED' }>).item]}`,
  RETURNED: (e) => {
    const x = e as Extract<CaseEvent, { type: 'RETURNED' }>
    return `returned the ${ITEM_LABEL[x.item]}: “${x.reason}”`
  },
  REVIEW_COMPLETED: () => 'completed the 30-day review',
  MATCH_DECIDED: (e) => `marked a possible earlier record as ${(e as Extract<CaseEvent, { type: 'MATCH_DECIDED' }>).decision === 'same' ? 'the same person' : 'a different person'}`,
}

function Trail({ c }: { c: CaseState }) {
  const [all, setAll] = useState(false)
  const items = [...c.events].reverse()
  const shown = all ? items : items.slice(0, 8)
  return (
    <Section title="Every step, who and when" id="trail" aside={<span className="count">{items.length}</span>}>
      <p className="hint">Append-only. Nothing here can be edited or deleted, so “I never got it” has an answer.</p>
      <ol className="trail">
        {shown.map((e) => (
          <li key={e.id}>
            <time dateTime={e.at}>{formatWhen(Date.parse(e.at))}</time>
            <span>
              {e.type === 'REFERRAL_SUBMITTED' && e.referral.source.kind === 'hotline' ? (
                <>Report received from the <strong>State Central Register</strong> hotline</>
              ) : (
                <>
                  <strong>{actorName(e.actorId)}</strong> {VERB[e.type](e)}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      {items.length > 8 && (
        <button type="button" className="btn small secondary" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Section>
  )
}

