import { firstFaceToFace, firstSeenByCps, type CaseState } from './caseState'
import { CLOCKS, NOTE_WINDOW, computeClocks, type ClockDef } from './clocks'
import type { ApprovalItem } from './types'

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface ClockStat {
  def: ClockDef
  onTime: number
  late: number
  /** Past due and still not done. */
  missed: number
  /** Not due yet: left out of the rate, because nothing has been decided. */
  notDue: number
}

/** For each deadline, how many cases met it, met it late, or have missed it so far. */
export function clockStats(cases: CaseState[], now: number): ClockStat[] {
  return CLOCKS.map((def) => {
    const stat: ClockStat = { def, onTime: 0, late: 0, missed: 0, notDue: 0 }
    for (const c of cases) {
      const k = computeClocks(c, now).find((x) => x.def.id === def.id)!
      if (k.status === 'done') stat.onTime++
      else if (k.status === 'done-late') stat.late++
      else if (k.status === 'overdue') stat.missed++
      else stat.notDue++
    }
    return stat
  })
}

export interface Waits {
  /** Each finished wait, submitted -> approved or returned. */
  decided: number[]
  /** Submissions still waiting, measured to now. */
  open: number[]
}

/**
 * Supervisor approval waits, read from the event log rather than the current state:
 * a report returned and sent again counts as two waits, which is what the worker lived through.
 */
export function approvalWaits(cases: CaseState[], now: number): Waits {
  const decided: number[] = []
  const open: number[] = []
  for (const c of cases) {
    const pending = new Map<ApprovalItem, number>()
    for (const e of c.events) {
      if (e.type === 'SUBMITTED') pending.set(e.item, Date.parse(e.at))
      if ((e.type === 'APPROVED' || e.type === 'RETURNED') && pending.has(e.item)) {
        decided.push(Date.parse(e.at) - pending.get(e.item)!)
        pending.delete(e.item)
      }
    }
    for (const t of pending.values()) open.push(now - t)
  }
  return { decided, open }
}

export interface Results {
  cases: number
  /** Report received -> child seen in person. */
  toFirstVisit: { median?: number; n: number }
  /** Agency referral sent -> first opened by CPS. */
  toOpened: { median?: number; n: number }
  approvals: { median?: number; n: number; waitingNow: number; longestWaiting?: number }
  notes: { withinWindow: number; total: number }
  clocks: ClockStat[]
  /** Share of deadlines met on time among the ones that have come due. */
  onTimeRate?: number
}

export function results(cases: CaseState[], now: number, isCps: (actorId: string) => boolean): Results {
  const visits = cases.flatMap((c) => {
    const v = firstFaceToFace(c)
    return v ? [v.contactAt - c.intakeAt] : []
  })
  const opened = cases
    .filter((c) => c.referral.source.kind === 'agency')
    .flatMap((c) => {
      const t = firstSeenByCps(c, isCps)
      return t === undefined ? [] : [t - c.intakeAt]
    })
  const waits = approvalWaits(cases, now)

  // A note counts as on time if it was written within the window; an unwritten note past
  // its window counts against; an unwritten note still inside its window is left out.
  let withinWindow = 0
  let total = 0
  for (const c of cases)
    for (const k of c.contacts) {
      if (k.note) {
        total++
        if (k.note.at - k.contactAt <= NOTE_WINDOW) withinWindow++
      } else if (now - k.contactAt > NOTE_WINDOW) total++
    }

  const clocks = clockStats(cases, now)
  const due = clocks.reduce((n, s) => n + s.onTime + s.late + s.missed, 0)
  const onTime = clocks.reduce((n, s) => n + s.onTime, 0)

  return {
    cases: cases.length,
    toFirstVisit: { median: median(visits), n: visits.length },
    toOpened: { median: median(opened), n: opened.length },
    approvals: {
      median: median(waits.decided),
      n: waits.decided.length,
      waitingNow: waits.open.length,
      longestWaiting: waits.open.length ? Math.max(...waits.open) : undefined,
    },
    notes: { withinWindow, total },
    clocks,
    onTimeRate: due ? onTime / due : undefined,
  }
}
