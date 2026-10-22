import { actorName } from './actors'
import type { CaseState } from './caseState'
import { computeClocks, notesOwed, type ClockResult, type NoteOwed } from './clocks'
import { formatDay } from './format'
import type { ApprovalItem } from './types'

export const ITEM_LABEL: Record<ApprovalItem, string> = {
  safety: 'safety assessment',
  determination: 'determination',
  'fasp-initial': 'Initial FASP',
  'fasp-comprehensive': 'Comprehensive FASP',
}

export interface Handoff {
  fromId: string
  toId: string
  byId: string
  at: number
  /** Deadlines not yet met, soonest first. */
  open: ClockResult[]
  /** Contacts with no typed note, with who logged them. */
  notes: NoteOwed[]
  waitingOnSupervisor: ApprovalItem[]
  returned: { item: ApprovalItem; reason?: string }[]
}

/**
 * What a worker inherits when a case changes hands. Built from the case as it stands now, so
 * nothing the previous worker left behind (a FASP due, a visit with no note, a report sent
 * back by the supervisor) can be missed by whoever picks it up.
 *
 * Added after a caseworker's feedback on 21 Oct 2026: he inherited a case and didn't know a
 * FASP was due from the previous worker until it had to be done right away.
 */
export function latestHandoff(c: CaseState, now: number): Handoff | undefined {
  if (c.assignments.length < 2) return undefined
  const to = c.assignments[c.assignments.length - 1]
  const from = c.assignments[c.assignments.length - 2]
  const items = Object.entries(c.approvals) as [ApprovalItem, NonNullable<CaseState['approvals'][ApprovalItem]>][]
  return {
    fromId: from.workerId,
    toId: to.workerId,
    byId: to.by,
    at: to.at,
    open: computeClocks(c, now)
      .filter((k) => k.completedAt === undefined)
      .sort((a, b) => a.dueAt - b.dueAt),
    notes: notesOwed(c, now),
    waitingOnSupervisor: items.filter(([, a]) => a.status === 'pending').map(([i]) => i),
    returned: items.filter(([, a]) => a.status === 'returned').map(([i, a]) => ({ item: i, reason: a.reason })),
  }
}

/** One line for an inbox: "1 overdue · Initial FASP due Fri, Oct 24 · 1 note owed". */
export function handoffSummary(h: Handoff, now: number): string {
  const parts: string[] = []
  const overdue = h.open.filter((k) => k.dueAt < now && !k.awaitingApprovalSince)
  if (overdue.length) parts.push(`${overdue.length} overdue (${overdue.map((k) => k.def.label).join(', ')})`)
  const next = h.open.find((k) => k.dueAt >= now)
  if (next) parts.push(`${next.def.label} due ${formatDay(next.dueAt)}`)
  if (h.notes.length) parts.push(`${h.notes.length} note${h.notes.length > 1 ? 's' : ''} owed`)
  if (h.returned.length) parts.push(`${h.returned.map((r) => ITEM_LABEL[r.item]).join(', ')} returned`)
  if (h.waitingOnSupervisor.length) parts.push(`${h.waitingOnSupervisor.length} waiting on supervisor`)
  return parts.length ? parts.join(' · ') : 'nothing open'
}

export const handoffLine = (h: Handoff) => `${actorName(h.byId)} moved this case from ${actorName(h.fromId)} to ${actorName(h.toId)} on ${formatDay(h.at)}`
