import { actorName } from './actors'
import { isClosed, type CaseState } from './caseState'
import { HOUR, NOTE_WARN, computeClocks, notesOwed } from './clocks'
import { formatWhen, shortName } from './format'
import { accessTo, agencyView } from './policy'
import { RISK_RANK, riskLevel } from './risk'
import type { Actor, ApprovalItem } from './types'

export interface Notice {
  id: string
  at: number
  caseId: string
  tone: 'bad' | 'warn' | 'info' | 'good'
  text: string
}

/** CPS should open a police referral within this long, or the officer is told. */
export const OPEN_ALERT_AFTER = 2 * HOUR

const itemName = (i: ApprovalItem) => (i === 'safety' ? 'safety assessment' : 'determination')
const kids = (c: CaseState) => c.referral.children.map(shortName).join(', ')

/**
 * What each person should be told, derived from the event log and the clock. Nothing is
 * stored: a notice exists because something happened (an event) or a time passed (a deadline),
 * so it can never drift out of sync with the case. A person is never notified of their own action.
 */
export function noticesFor(me: Actor, cases: CaseState[], now: number): Notice[] {
  const out: Notice[] = []
  const add = (n: Notice) => {
    if (n.at <= now) out.push(n)
  }

  for (const c of cases) {
    const access = accessTo(me, c)
    if (access === 'none') continue

    if (me.role === 'police') {
      const v = agencyView(c)
      for (const s of v.steps.slice(1))
        if (s.at !== undefined) add({ id: `${c.id}:${s.id}`, at: s.at, caseId: c.id, tone: 'good', text: `${c.id} (${v.children.join(', ')}): ${s.label}` })
      const opened = v.steps.find((s) => s.id === 'opened')!
      if (opened.at === undefined)
        add({ id: `${c.id}:not-opened`, at: c.intakeAt + OPEN_ALERT_AFTER, caseId: c.id, tone: 'bad', text: `${c.id}: CPS has not opened your referral after 2 hours` })
      continue
    }

    for (const e of c.events) {
      if (e.actorId === me.id) continue
      const at = Date.parse(e.at)
      const id = `${c.id}:${e.id}`
      if (me.role === 'caseworker') {
        if (e.type === 'ASSIGNED' && e.workerId === me.id)
          add({ id, at, caseId: c.id, tone: 'info', text: `${actorName(e.actorId)} assigned you ${c.id} (${kids(c)})` })
        if (e.type === 'APPROVED')
          add({ id, at, caseId: c.id, tone: 'good', text: `${actorName(e.actorId)} approved your ${itemName(e.item)} on ${c.id}` })
        if (e.type === 'RETURNED')
          add({ id, at, caseId: c.id, tone: 'warn', text: `${actorName(e.actorId)} returned your ${itemName(e.item)} on ${c.id}: “${e.reason}”` })
      }
      if (me.role === 'supervisor') {
        if (e.type === 'REFERRAL_SUBMITTED') {
          const high = RISK_RANK[riskLevel(e.referral.riskFactors)] === 0
          const from = e.referral.source.kind === 'agency' ? e.referral.source.agency : 'the State Central Register'
          add({ id, at, caseId: c.id, tone: high ? 'bad' : 'info', text: `New report ${c.id} (${kids(c)}) from ${from}${high ? ', high risk' : ''}` })
        }
        if (e.type === 'SUBMITTED')
          add({ id, at, caseId: c.id, tone: 'warn', text: `${actorName(e.actorId)} sent the ${itemName(e.item)} on ${c.id} for your approval` })
      }
    }

    if (isClosed(c)) continue

    // Deadlines. Caseworkers hear about their own clocks; supervisors about the 24-hour start
    // on reports nobody has picked up, the 30-day review, and anything overdue in the unit.
    for (const k of computeClocks(c, now)) {
      if (k.completedAt !== undefined) continue
      const mine =
        me.role === 'caseworker'
          ? k.def.id !== 'midpoint'
          : (k.def.id === 'commence' && !c.assignedTo) || k.def.id === 'midpoint'
      const soonAt = Math.max(k.dueAt - k.def.warn, c.assignedTo?.at ?? c.intakeAt)
      if (mine && !k.awaitingApprovalSince)
        add({ id: `${c.id}:${k.def.id}:soon`, at: soonAt, caseId: c.id, tone: 'warn', text: `${c.id}: ${k.def.label.toLowerCase()} due ${formatWhen(k.dueAt)}` })
      if (mine || me.role === 'supervisor')
        add({ id: `${c.id}:${k.def.id}:overdue`, at: k.dueAt, caseId: c.id, tone: 'bad', text: `${c.id}: ${k.def.label.toLowerCase()} is overdue` })
    }

    if (me.role === 'caseworker')
      for (const n of notesOwed(c, now)) {
        add({ id: `${n.contact.id}:note:soon`, at: n.dueAt - NOTE_WARN, caseId: c.id, tone: 'warn', text: `${c.id}: note for your contact with ${n.contact.with} due ${formatWhen(n.dueAt)}` })
        add({ id: `${n.contact.id}:note:overdue`, at: n.dueAt, caseId: c.id, tone: 'bad', text: `${c.id}: note for your contact with ${n.contact.with} is overdue` })
      }
  }

  return out.sort((a, b) => b.at - a.at)
}

export const unreadCount = (notices: Notice[], readAt = -Infinity) => notices.filter((n) => n.at > readAt).length
