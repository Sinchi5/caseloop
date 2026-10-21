import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { actorName, caseworkers, isCps } from '../domain/actors'
import { firstSeenByCps, type CaseState } from '../domain/caseState'
import { notesOwed } from '../domain/clocks'
import { formatDay, formatSpan, shortName } from '../domain/format'
import { rankCases } from '../domain/priority'
import { useStore } from '../store/context'
import { homeFor } from './routes'
import { CaseCard, Stat } from './MyCases'
import { clockLine } from './labels'
import { Empty, Icon, RiskPill, Section, StatusPill } from './parts'

export function Unit() {
  const { me, cases, now, record } = useStore()
  if (me.role !== 'supervisor') return <Navigate to={homeFor(me.role)} replace />

  const ranked = rankCases(cases, now)
  const open = ranked.filter((r) => r.tier !== 'closed')
  const unassigned = open.filter((r) => !r.c.assignedTo)
  const approvals = cases
    .flatMap((c) =>
      (['safety', 'determination'] as const)
        .filter((i) => c.approvals[i]?.status === 'pending')
        .map((i) => ({ c, i, a: c.approvals[i]! })),
    )
    .sort((x, y) => x.a.submittedAt - y.a.submittedAt)
  const reviews = open
    .filter((r) => r.c.reviewCompletedAt === undefined && r.c.assignedTo)
    .map((r) => ({ r, k: r.clocks.find((k) => k.def.id === 'midpoint')! }))
    .filter(({ k }) => k.status === 'overdue' || k.status === 'due-soon')

  const team = caseworkers().map((w) => {
    const mine = open.filter((r) => r.c.assignedTo?.workerId === w.id)
    return {
      w,
      open: mine.length,
      overdue: mine.filter((r) => r.tier === 'overdue').length,
      notesLate: mine.flatMap((r) => notesOwed(r.c, now)).filter((n) => n.status === 'overdue').length,
      waiting: approvals.filter((x) => x.c.assignedTo?.workerId === w.id).length,
    }
  })

  return (
    <div className="page">
      <div className="page-head">
        <h1>Unit overview</h1>
        <p className="sub">{me.org} · {me.name}</p>
      </div>

      <div className="stats" role="list">
        <Stat n={unassigned.length} label="Not assigned" tone="bad" />
        <Stat n={approvals.length} label="Waiting on you" tone="warn" />
        <Stat n={open.filter((r) => r.tier === 'overdue').length} label="Cases overdue" tone="bad" />
        <Stat n={open.length} label="Open cases" tone="neutral" />
      </div>

      <div className="two-col">
        <Section title="New reports, not assigned" id="intake" aside={<span className="count">{unassigned.length}</span>}>
          {unassigned.length ? (
            <ul className="rows">
              {unassigned.map((r) => <IntakeRow key={r.c.id} c={r.c} />)}
            </ul>
          ) : (
            <Empty>Every report has a caseworker.</Empty>
          )}
        </Section>

        <Section title="Waiting on you" id="approvals" aside={<span className="count">{approvals.length}</span>}>
          {approvals.length ? (
            <ul className="rows">
              {approvals.map(({ c, i, a }) => {
                const k = rankCases([c], now)[0].clocks.find((x) => x.def.id === i)!
                return (
                  <li key={c.id + i} className="row stack">
                    <div className="row-main">
                      <Link to={`/cases/${c.id}`}><strong>{c.id}</strong></Link> · {i === 'safety' ? 'Safety assessment' : 'Determination'} from{' '}
                      {actorName(a.submittedBy)}
                      <div className="muted small">
                        Waiting {formatSpan(now - a.submittedAt)} · {clockLine(k, now)}
                      </div>
                    </div>
                    <div className="row-side">
                      <button type="button" className="btn small" onClick={() => record({ type: 'APPROVED', caseId: c.id, item: i })}>Approve</button>
                      <Link className="btn small secondary" to={`/cases/${c.id}#actions`}>Review</Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>Nothing waiting on you.</Empty>
          )}
        </Section>
      </div>

      {reviews.length > 0 && (
        <Section title="30-day reviews due" id="reviews" aside={<span className="count">{reviews.length}</span>}>
          <ul className="rows">
            {reviews.map(({ r, k }) => (
              <li key={r.c.id} className="row">
                <span className="row-main">
                  <Link to={`/cases/${r.c.id}`}><strong>{r.c.id}</strong></Link> · {actorName(r.c.assignedTo!.workerId)} · {clockLine(k, now)}
                </span>
                <span className="row-side">
                  <StatusPill status={k.status} />
                  <button type="button" className="btn small secondary" onClick={() => record({ type: 'REVIEW_COMPLETED', caseId: r.c.id })}>Mark done</button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Team" id="team">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Caseworker</th>
                <th scope="col" className="num">Open</th>
                <th scope="col" className="num">Overdue</th>
                <th scope="col" className="num">Notes late</th>
                <th scope="col" className="num">Waiting on you</th>
              </tr>
            </thead>
            <tbody>
              {team.map((t) => (
                <tr key={t.w.id}>
                  <th scope="row">{t.w.name}</th>
                  <td className="num">{t.open}</td>
                  <td className={`num ${t.overdue ? 'cell-bad' : ''}`}>{t.overdue}</td>
                  <td className={`num ${t.notesLate ? 'cell-bad' : ''}`}>{t.notesLate}</td>
                  <td className={`num ${t.waiting ? 'cell-warn' : ''}`}>{t.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="All open cases, most urgent first" id="all" aside={<span className="count">{open.length}</span>}>
        <ul className="cards">
          {open.map((r) => (
            <CaseCard key={r.c.id} r={r} now={now} showWorker={r.c.assignedTo ? actorName(r.c.assignedTo.workerId) : 'Unassigned'} />
          ))}
        </ul>
      </Section>
    </div>
  )
}

function IntakeRow({ c }: { c: CaseState }) {
  const { now, cases, record } = useStore()
  const r = rankCases([c], now)[0]
  const k = r.clocks.find((x) => x.def.id === 'commence')!
  const seen = firstSeenByCps(c, isCps)
  const load = (id: string) => cases.filter((x) => x.assignedTo?.workerId === id && x.approvals.determination?.status !== 'approved').length
  const workers = caseworkers().sort((a, b) => load(a.id) - load(b.id))
  const [w, setW] = useState(workers[0].id)
  const src = c.referral.source

  return (
    <li className="row stack">
      <div className="row-main">
        <Link to={`/cases/${c.id}`}><strong>{c.id}</strong></Link> · {c.referral.children.map(shortName).join(', ')} · <RiskPill level={r.risk} />
        <div className="muted small">
          {src.kind === 'agency' ? src.agency : 'Hotline'} · received {formatSpan(now - c.intakeAt)} ago ·{' '}
          {seen === undefined ? <strong className="text-bad">not opened yet</strong> : `opened ${formatDay(seen)}`}
        </div>
        <div className={`small st-text-${k.status}`}>
          <Icon name="clock" size={13} /> See the child: {clockLine(k, now)}
        </div>
      </div>
      <form
        className="row-side assign"
        onSubmit={(e) => {
          e.preventDefault()
          record({ type: 'ASSIGNED', caseId: c.id, workerId: w })
        }}
      >
        <label>
          <span className="sr-only">Assign {c.id} to</span>
          <select value={w} onChange={(e) => setW(e.target.value)}>
            {workers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({load(x.id)} open)
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn small">Assign</button>
      </form>
    </li>
  )
}
