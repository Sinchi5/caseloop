import type { ReactNode } from 'react'
import { DAY, type ClockResult, type ClockStatus } from '../domain/clocks'
import { formatRelative, formatSpan, formatWhen } from '../domain/format'
import { clockLine } from './labels'
import type { LoopStep } from '../domain/policy'
import type { Tier } from '../domain/priority'
import type { RiskLevel } from '../domain/risk'

type IconName = 'check' | 'alert' | 'clock' | 'circle' | 'hourglass' | 'camera' | 'arrow'

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'check':
      return <svg {...p}><path d="M3 8.5l3.2 3L13 4.5" /></svg>
    case 'alert':
      return <svg {...p}><path d="M8 2.2L14.5 13.5h-13L8 2.2z" /><path d="M8 6.5v3.2M8 11.6v.1" /></svg>
    case 'clock':
      return <svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.6" /></svg>
    case 'circle':
      return <svg {...p}><circle cx="8" cy="8" r="5.5" /></svg>
    case 'hourglass':
      return <svg {...p}><path d="M4 2h8M4 14h8M5 2c0 3 6 3.5 6 6s-6 3-6 6M11 2c0 3-6 3.5-6 6s6 3 6 6" /></svg>
    case 'camera':
      return <svg {...p}><path d="M2 5.5h2.5L6 3.5h4l1.5 2H14v7H2z" /><circle cx="8" cy="9" r="2.2" /></svg>
    case 'arrow':
      return <svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
  }
}

const STATUS: Record<ClockStatus | 'awaiting', { label: string; tone: string; icon: IconName }> = {
  overdue: { label: 'Overdue', tone: 'bad', icon: 'alert' },
  'due-soon': { label: 'Due soon', tone: 'warn', icon: 'clock' },
  upcoming: { label: 'Upcoming', tone: 'neutral', icon: 'circle' },
  done: { label: 'Done', tone: 'good', icon: 'check' },
  'done-late': { label: 'Done late', tone: 'muted', icon: 'check' },
  awaiting: { label: 'Waiting on supervisor', tone: 'info', icon: 'hourglass' },
}

export function StatusPill({ status }: { status: ClockStatus | 'awaiting' }) {
  const s = STATUS[status]
  return (
    <span className={`pill tone-${s.tone}`}>
      <Icon name={s.icon} size={13} />
      {s.label}
    </span>
  )
}

const TIER: Record<Tier, { label: string; tone: string; icon: IconName }> = {
  overdue: { label: 'Overdue', tone: 'bad', icon: 'alert' },
  'due-soon': { label: 'Due soon', tone: 'warn', icon: 'clock' },
  'on-track': { label: 'On track', tone: 'good', icon: 'check' },
  closed: { label: 'Closed', tone: 'muted', icon: 'check' },
}

export function TierPill({ tier }: { tier: Tier }) {
  const s = TIER[tier]
  return (
    <span className={`pill tone-${s.tone}`}>
      <Icon name={s.icon} size={13} />
      {s.label}
    </span>
  )
}

export function RiskPill({ level }: { level: RiskLevel }) {
  const label = { high: 'High risk', elevated: 'Elevated risk', standard: 'Standard risk' }[level]
  return <span className={`risk risk-${level}`}>{label}</span>
}

/** The four deadlines as a list. The source is always shown: law or office practice. */
export function ClockRows({ clocks, now }: { clocks: ClockResult[]; now: number }) {
  return (
    <ol className="clock-rows">
      {clocks.map((k) => (
        <li key={k.def.id} className={`clock-row st-${k.status}`}>
          <span className="clock-short" aria-hidden>{k.def.short}</span>
          <div className="clock-main">
            <div className="clock-label">{k.def.label}</div>
            <div className="clock-when">{clockLine(k, now)}</div>
            {k.awaitingApprovalSince !== undefined && k.completedAt === undefined && (
              <div className="clock-await">
                <Icon name="hourglass" size={13} /> Submitted {formatRelative(k.awaitingApprovalSince, now)}, waiting on supervisor
              </div>
            )}
            <div className="clock-source">
              {k.def.source.kind === 'law' ? 'Law: ' : 'Practice: '}
              {k.def.source.url ? (
                <a href={k.def.source.url} target="_blank" rel="noreferrer">{k.def.source.cite}</a>
              ) : (
                k.def.source.cite
              )}
            </div>
          </div>
          <StatusPill status={k.completedAt === undefined && k.awaitingApprovalSince !== undefined && k.status !== 'overdue' ? 'awaiting' : k.status} />
        </li>
      ))}
    </ol>
  )
}

/** A 60-day ruler: where today is against every deadline. */
export function ClockTrack({ clocks, intakeAt, now }: { clocks: ClockResult[]; intakeAt: number; now: number }) {
  const span = Math.max(62 * DAY, now - intakeAt + 2 * DAY, ...clocks.map((k) => k.dueAt - intakeAt + 3 * DAY))
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - intakeAt) / span) * 100))}%`
  const day = Math.floor((now - intakeAt) / DAY)
  return (
    <div className={`track ${clocks.some((k) => k.def.from === 'indication') ? 'track-tall' : ''}`} role="img" aria-label={`Day ${day} of the case. ${clocks.map((k) => `${k.def.label}: ${STATUS[k.status].label}`).join('. ')}.`}>
      <div className="track-rail" />
      <div className="track-fill" style={{ width: pct(now) }} />
      {clocks.map((k) => (
        <div key={k.def.id} className={`track-mark st-${k.status} ${k.def.id === 'commence' ? 'tag-up' : ''} ${k.def.from === 'indication' ? 'tag-low' : ''}`} style={{ left: pct(k.dueAt) }}>
          <span className="track-dot" />
          <span className="track-tag">{k.def.short}</span>
        </div>
      ))}
      <div className="track-now" style={{ left: pct(now) }}>
        <span>Day {day}</span>
      </div>
    </div>
  )
}

export function LoopSteps({ steps, now, compact }: { steps: LoopStep[]; now: number; compact?: boolean }) {
  const firstOpen = steps.findIndex((s) => s.at === undefined)
  return (
    <ol className={`loop ${compact ? 'loop-compact' : ''}`}>
      {steps.map((s, i) => {
        const state = s.at !== undefined ? 'done' : i === firstOpen ? 'current' : 'todo'
        return (
          <li key={s.id} className={`loop-step ls-${state}`}>
            <span className="loop-dot">{state === 'done' ? <Icon name="check" size={12} /> : null}</span>
            <span className="loop-label">{s.label}</span>
            <span className="loop-when">
              {s.at !== undefined ? formatWhen(s.at) : state === 'current' ? `Waiting, ${formatSpan(now - (steps[i - 1]?.at ?? now))}` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
