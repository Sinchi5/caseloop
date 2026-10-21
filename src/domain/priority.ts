import { isClosed, type CaseState } from './caseState'
import { computeClocks, notesOwed, type ClockResult } from './clocks'
import { RISK_RANK, riskLevel, type RiskLevel } from './risk'
import { formatSpan } from './format'

export type Tier = 'overdue' | 'due-soon' | 'on-track' | 'closed'
const TIER_RANK: Record<Tier, number> = { overdue: 0, 'due-soon': 1, 'on-track': 2, closed: 3 }

export interface Ranked {
  c: CaseState
  tier: Tier
  risk: RiskLevel
  clocks: ClockResult[]
  next?: ClockResult
  reasons: string[]
}

/**
 * Order of work, most urgent first:
 *   1. a legal or office deadline already missed or about to be (tier),
 *   2. then risk from the referral,
 *   3. then whichever next deadline comes first.
 * Risk does not jump a high-risk case over a missed deadline: a missed 24-hour start on a
 * "standard" case is still a child nobody has seen. The reasons say why a case is where it is.
 */
export function rank(c: CaseState, now: number): Ranked {
  const clocks = computeClocks(c, now)
  const risk = riskLevel(c.referral.riskFactors)
  const open = clocks.filter((k) => k.completedAt === undefined)
  const next = [...open].sort((a, b) => a.dueAt - b.dueAt)[0]
  const notes = notesOwed(c, now)

  let tier: Tier = 'on-track'
  if (isClosed(c)) tier = 'closed'
  else if (open.some((k) => k.status === 'overdue') || notes.some((n) => n.status === 'overdue')) tier = 'overdue'
  else if (open.some((k) => k.status === 'due-soon') || notes.some((n) => n.status === 'due-soon')) tier = 'due-soon'

  const reasons: string[] = []
  if (tier !== 'closed') {
    for (const k of open) {
      if (k.status === 'overdue') reasons.push(`${k.def.label}: overdue by ${formatSpan(now - k.dueAt)}`)
      else if (k.status === 'due-soon') reasons.push(`${k.def.label}: due in ${formatSpan(k.dueAt - now)}`)
      if (k.awaitingApprovalSince !== undefined)
        reasons.push(`Waiting on supervisor for ${formatSpan(now - k.awaitingApprovalSince)}`)
    }
    const lateNotes = notes.filter((n) => n.status === 'overdue').length
    if (lateNotes) reasons.push(`${lateNotes} contact note${lateNotes > 1 ? 's' : ''} overdue`)
    if (risk === 'high') reasons.push('High risk at referral')
    if (!c.assignedTo) reasons.push('Not assigned to a caseworker')
  }
  return { c, tier, risk, clocks, next, reasons }
}

export function rankCases(cases: CaseState[], now: number): Ranked[] {
  return cases
    .map((c) => rank(c, now))
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        RISK_RANK[a.risk] - RISK_RANK[b.risk] ||
        (a.next?.dueAt ?? Infinity) - (b.next?.dueAt ?? Infinity),
    )
}
