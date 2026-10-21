import type { RiskFactorId } from './types'

export interface RiskFactor {
  id: RiskFactorId
  label: string
  weight: number
  /** One critical factor alone makes a referral high risk. */
  critical?: boolean
}

/**
 * Illustrative factors for the prototype. NOT a validated instrument: a real build would use
 * the agency's own screening tool (CARE was modelled on a validated domestic-violence assessment).
 */
export const RISK_FACTORS: readonly RiskFactor[] = [
  { id: 'visible-injury', label: 'Child has a visible injury', weight: 3, critical: true },
  { id: 'threat-to-kill', label: 'Threats to kill a caregiver or child', weight: 3, critical: true },
  { id: 'strangulation', label: 'Caregiver reports being choked or strangled', weight: 3, critical: true },
  { id: 'child-under-4', label: 'Child under 4 in the home', weight: 2 },
  { id: 'infant-unsafe-sleep', label: 'Unsafe sleep setup for an infant', weight: 2 },
  { id: 'weapon-in-home', label: 'Firearm or weapon in the home', weight: 2 },
  { id: 'substance-use', label: 'Caregiver impaired by drugs or alcohol', weight: 2 },
  { id: 'prior-calls', label: 'Earlier police calls to this address', weight: 1 },
  { id: 'child-witnessed', label: 'Child saw or heard the violence', weight: 1 },
  { id: 'no-other-adult-contact', label: 'No school or other adult sees the child regularly', weight: 1 },
]

const byId = new Map(RISK_FACTORS.map((f) => [f.id, f]))

export type RiskLevel = 'high' | 'elevated' | 'standard'

export function riskLevel(ids: readonly RiskFactorId[]): RiskLevel {
  const factors = ids.map((id) => byId.get(id)).filter((f): f is RiskFactor => !!f)
  if (factors.some((f) => f.critical)) return 'high'
  const total = factors.reduce((n, f) => n + f.weight, 0)
  if (total >= 5) return 'high'
  if (total >= 2) return 'elevated'
  return 'standard'
}

export const riskLabel = (id: RiskFactorId) => byId.get(id)?.label ?? id

export const RISK_RANK: Record<RiskLevel, number> = { high: 0, elevated: 1, standard: 2 }
