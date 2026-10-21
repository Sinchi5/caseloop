import { Navigate } from 'react-router-dom'
import { isCps } from '../domain/actors'
import { formatSpan } from '../domain/format'
import { results, type ClockStat } from '../domain/metrics'
import { useStore } from '../store/context'
import { homeFor } from './routes'
import { Icon, Section } from './parts'

const pct = (x: number) => `${Math.round(x * 100)}%`
const span = (ms?: number) => (ms === undefined ? '–' : formatSpan(ms))

export function Results() {
  const { me, cases, now } = useStore()
  if (me.role !== 'supervisor') return <Navigate to={homeFor(me.role)} replace />
  const r = results(cases, now, isCps)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Results</h1>
        <p className="sub">
          {me.org} · {r.cases} cases. Everything here is computed from the case history, so nobody has to count by hand.
        </p>
      </div>

      <div className="kpis" role="list">
        <Kpi value={span(r.toFirstVisit.median)} label="Report to child seen" note={`median of ${r.toFirstVisit.n} cases · law allows 24 h`} />
        <Kpi value={r.onTimeRate === undefined ? '–' : pct(r.onTimeRate)} label="Deadlines met on time" note="of the deadlines that have come due" />
        <Kpi
          value={span(r.approvals.median)}
          label="Wait for supervisor approval"
          note={`median of ${r.approvals.n} decisions${r.approvals.waitingNow ? ` · ${r.approvals.waitingNow} waiting now, longest ${span(r.approvals.longestWaiting)}` : ''}`}
        />
        <Kpi value={r.notes.total ? pct(r.notes.withinWindow / r.notes.total) : '–'} label="Notes written within 5 days" note={`${r.notes.withinWindow} of ${r.notes.total} contacts`} />
        <Kpi value={span(r.toOpened.median)} label="Police referral to opened by CPS" note={`median of ${r.toOpened.n} referrals`} />
      </div>

      <Section title="Each deadline: on time, late, or missed" id="by-deadline">
        <div className="legend" aria-hidden>
          <span><i className="sw sw-good" /> On time</span>
          <span><i className="sw sw-warn" /> Late</span>
          <span><i className="sw sw-bad" /> Missed so far</span>
        </div>
        <ul className="bars">
          {r.clocks.map((s) => <Bar key={s.def.id} s={s} />)}
        </ul>
        <details className="table-view">
          <summary>Show as a table</summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Deadline</th>
                  <th scope="col" className="num">On time</th>
                  <th scope="col" className="num">Late</th>
                  <th scope="col" className="num">Missed</th>
                  <th scope="col" className="num">Not due yet</th>
                </tr>
              </thead>
              <tbody>
                {r.clocks.map((s) => (
                  <tr key={s.def.id}>
                    <th scope="row">{s.def.label}</th>
                    <td className="num">{s.onTime}</td>
                    <td className="num">{s.late}</td>
                    <td className="num">{s.missed}</td>
                    <td className="num">{s.notDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <p className="hint">
        <Icon name="circle" size={13} /> With ten made-up cases these numbers mean nothing on their own. The point is that they come
        for free: the same history that runs the deadlines also measures them, per unit, every day. These are the numbers to compare
        before and after a change.
      </p>
    </div>
  )
}

function Kpi({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="kpi" role="listitem">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-note">{note}</span>
    </div>
  )
}

function Bar({ s }: { s: ClockStat }) {
  const due = s.onTime + s.late + s.missed
  const parts = [
    { n: s.onTime, cls: 'good', word: 'on time' },
    { n: s.late, cls: 'warn', word: 'late' },
    { n: s.missed, cls: 'bad', word: 'missed' },
  ]
  const summary = due
    ? parts.filter((p) => p.n).map((p) => `${p.n} ${p.word}`).join(' · ')
    : 'None due yet'
  return (
    <li className="bar-row">
      <div className="bar-label">
        <span className="bar-name">{s.def.label}</span>
        <span className="bar-short">{s.def.short}</span>
      </div>
      <div className="bar-track" role="img" aria-label={`${s.def.label}: ${summary}${s.notDue ? `, ${s.notDue} not due yet` : ''}`}>
        {parts.map((p) =>
          p.n ? (
            <span key={p.cls} className={`seg seg-${p.cls}`} style={{ flexGrow: p.n }} title={`${p.n} ${p.word}`} />
          ) : null,
        )}
      </div>
      <div className="bar-value">
        {summary}
        {s.notDue > 0 && <span className="muted"> · {s.notDue} not due</span>}
      </div>
    </li>
  )
}
