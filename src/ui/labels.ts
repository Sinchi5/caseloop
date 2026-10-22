import { formatDay, formatRelative, formatSpan, formatWhen } from '../domain/format'
import type { ClockResult } from '../domain/clocks'
import { ITEM_LABEL } from '../domain/handoff'
import type { ApprovalItem } from '../domain/types'

export const APPROVAL_ITEMS: readonly ApprovalItem[] = ['safety', 'determination', 'fasp-initial', 'fasp-comprehensive']
/** "Safety assessment", "Initial FASP": for the start of a sentence. */
export const itemTitle = (i: ApprovalItem) => ITEM_LABEL[i][0].toUpperCase() + ITEM_LABEL[i].slice(1)

export const KIND = { 'home-visit': 'Home visit', 'school-visit': 'School visit', phone: 'Phone call', collateral: 'Collateral contact' } as const

export function clockLine(k: ClockResult, now: number): string {
  if (k.completedAt !== undefined) return `${k.status === 'done-late' ? 'Done late' : 'Done'} ${formatDay(k.completedAt)}`
  if (k.status === 'overdue') return `Overdue by ${formatSpan(now - k.dueAt)} (was due ${formatDay(k.dueAt)})`
  return `Due ${formatWhen(k.dueAt)}, ${formatRelative(k.dueAt, now)}`
}
