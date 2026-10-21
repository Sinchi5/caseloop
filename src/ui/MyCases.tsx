import { Link, Navigate } from 'react-router-dom'
import { notesOwed } from '../domain/clocks'
import { age, formatDay, formatSpan, shortName } from '../domain/format'
import { rankCases, type Ranked, type Tier } from '../domain/priority'
import { useStore } from '../store/context'
import { homeFor } from './routes'
import { KIND, clockLine } from './labels'
import { Empty, Icon, RiskPill, Section, StatusPill, TierPill } from './parts'

export function CaseCard({ r, now, showWorker }: { r: Ranked; now: number; showWorker?: string }) {
  const { c } = r
  const next = r.next
  return (
    <li className={`card case-card tier-${r.tier}`}>
      <Link to={`/cases/${c.id}`} className="card-link">
        <div className="card-top">
          <span className="case-id">{c.id}</span>
          <span className="case-kids">
            {c.referral.children.map((p) => `${shortName(p)} (${age(p.dob, now)})`).join(', ')}
          </span>
          <span className="card-pills">
            <RiskPill level={r.risk} />
            <TierPill tier={r.tier} />
          </span>
        </div>
        {r.reasons.length > 0 ? (
          <ul className="reasons">
            {r.reasons.slice(0, 3).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : next ? (
          <p className="next-line">
            Next: {next.def.label.toLowerCase()}. {clockLine(next, now)}
          </p>
        ) : (
          <p className="next-line">Closed {formatDay(c.approvals.determination!.decidedAt!)}</p>
        )}
        <div className="chips" aria-label="Deadlines">
          {r.clocks.map((k) => (
            <span key={k.def.id} className={`chip st-${k.status}`} title={`${k.def.label}: ${clockLine(k, now)}`}>
              {k.def.short}
              <span className="sr-only">: {k.status.replace('-', ' ')}</span>
            </span>
          ))}
          <span className="card-day">Day {Math.floor((now - c.intakeAt) / 86_400_000)}</span>
          {showWorker && <span className="card-worker">{showWorker}</span>}
          <Icon name="arrow" />
        </div>
      </Link>
    </li>
  )
}

const GROUPS: { tier: Tier; title: string; empty: string }[] = [
  { tier: 'overdue', title: 'Needs action now', empty: 'Nothing overdue.' },
  { tier: 'due-soon', title: 'Due soon', empty: 'Nothing due in the next few days.' },
  { tier: 'on-track', title: 'On track', empty: 'No other open cases.' },
]

export function MyCases() {
  const { me, cases, now } = useStore()
  if (me.role !== 'caseworker') return <Navigate to={homeFor(me.role)} replace />

  const mine = cases.filter((c) => c.assignedTo?.workerId === me.id)
  const ranked = rankCases(mine, now)
  const open = ranked.filter((r) => r.tier !== 'closed')
  const closed = ranked.filter((r) => r.tier === 'closed')
  const owed = mine
    .flatMap((c) => notesOwed(c, now).map((n) => ({ ...n, c })))
    .sort((a, b) => a.dueAt - b.dueAt)
  const waiting = mine.filter((c) => Object.values(c.approvals).some((a) => a?.status === 'pending')).length
  const returned = mine.flatMap((c) =>
    Object.entries(c.approvals)
      .filter(([, a]) => a?.status === 'returned')
      .map(([item, a]) => ({ c, item, a: a! })),
  )

  return (
    <div className="page">
      <div className="page-head">
        <h1>My cases</h1>
        <p className="sub">
          {me.name} · {open.length} open
        </p>
      </div>

      <div className="stats" role="list">
        <Stat n={open.filter((r) => r.tier === 'overdue').length} label="Overdue" tone="bad" />
        <Stat n={open.filter((r) => r.tier === 'due-soon').length} label="Due soon" tone="warn" />
        <Stat n={owed.length} label="Notes owed" tone={owed.some((o) => o.status === 'overdue') ? 'bad' : 'neutral'} />
        <Stat n={waiting} label="Waiting on supervisor" tone="info" />
      </div>

      {returned.length > 0 && (
        <div className="banner tone-warn" role="status">
          <Icon name="alert" />
          <div>
            {returned.map(({ c, item, a }) => (
              <p key={c.id + item}>
                <Link to={`/cases/${c.id}`}>{c.id}</Link>: your {item === 'safety' ? 'safety assessment' : 'determination'} was returned{' '}
                {formatSpan(now - a.decidedAt!)} ago. “{a.reason}”
              </p>
            ))}
          </div>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = open.filter((r) => r.tier === g.tier)
        return (
          <Section key={g.tier} title={g.title} id={`g-${g.tier}`} aside={<span className="count">{list.length}</span>}>
            {list.length ? (
              <ul className="cards">
                {list.map((r) => (
                  <CaseCard key={r.c.id} r={r} now={now} />
                ))}
              </ul>
            ) : (
              <Empty>{g.empty}</Empty>
            )}
          </Section>
        )
      })}

      <Section title="Notes owed" id="notes-owed" aside={<span className="count">{owed.length}</span>}>
        <p className="hint">
          Log a visit in the field in under a minute; the full note is due within 5 days. Nothing to keep on paper.
        </p>
        {owed.length ? (
          <ul className="rows">
            {owed.map((o) => (
              <li key={o.contact.id} className="row">
                <Link to={`/cases/${o.c.id}#contact-${o.contact.id}`}>
                  <span className="row-main">
                    <strong>{o.c.id}</strong> · {KIND[o.contact.kind]} with {o.contact.with} · {formatDay(o.contact.contactAt)}
                  </span>
                  <span className="row-side">
                    {o.status === 'overdue' ? `${formatSpan(now - o.dueAt)} late` : `due ${formatDay(o.dueAt)}`}
                    <StatusPill status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>All contacts have notes.</Empty>
        )}
      </Section>

      {closed.length > 0 && (
        <details className="closed">
          <summary>Closed cases ({closed.length})</summary>
          <ul className="cards">
            {closed.map((r) => (
              <CaseCard key={r.c.id} r={r} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={`stat tone-${n ? tone : 'neutral'}`} role="listitem">
      <span className="stat-n">{n}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

