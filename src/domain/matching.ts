import type { PersonInput, RegistryPerson } from './types'

/** Jaro-Winkler similarity, 0..1. Standard for short names with typos and spelling variants. */
export function jaroWinkler(a: string, b: string): number {
  const s1 = a.toLowerCase()
  const s2 = b.toLowerCase()
  if (s1 === s2) return 1
  if (!s1.length || !s2.length) return 0
  const range = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1)
  const m1 = new Array<boolean>(s1.length).fill(false)
  const m2 = new Array<boolean>(s2.length).fill(false)
  let matches = 0
  for (let i = 0; i < s1.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(s2.length, i + range + 1); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue
      m1[i] = m2[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let t = 0
  for (let i = 0, k = 0; i < s1.length; i++) {
    if (!m1[i]) continue
    while (!m2[k]) k++
    if (s1[i] !== s2[k]) t++
    k++
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - t / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && s1[prefix] === s2[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

const STREET_WORDS: Record<string, string> = {
  st: 'street', ave: 'avenue', av: 'avenue', rd: 'road', dr: 'drive', ln: 'lane',
  ct: 'court', pl: 'place', blvd: 'boulevard', n: 'north', s: 'south', e: 'east', w: 'west',
}

/** "14 Elm St., Apt 2" -> "14 elm street". Unit numbers are dropped: families move between units. */
export function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(apt|apartment|unit|fl|floor)\s*\w+\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(' ')
}

type DobMatch = 'exact' | 'day-month-swapped' | 'one-digit-off' | 'different'

export function compareDob(a: string, b: string): DobMatch {
  if (a === b) return 'exact'
  const [ya, ma, da] = a.split('-')
  const [yb, mb, db] = b.split('-')
  if (ya === yb && ma === db && da === mb) return 'day-month-swapped'
  let diff = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++
  return diff === 1 ? 'one-digit-off' : 'different'
}

export type MatchLevel = 'likely' | 'possible' | 'none'

export interface MatchResult {
  candidate: RegistryPerson
  score: number
  level: MatchLevel
  /** Plain-language reasons, shown to the worker so they can judge it themselves. */
  reasons: string[]
}

const W = { last: 0.3, first: 0.2, dob: 0.35, address: 0.15 }
export const LIKELY = 0.88
export const POSSIBLE = 0.72
export const FIRST_NAME_FLOOR = 0.75

/**
 * Score one incoming person against one known person. Never merges anything:
 * the result is a suggestion a worker confirms or rejects, and that decision is logged.
 */
export function scoreMatch(p: PersonInput & { address: string }, k: RegistryPerson): MatchResult {
  const reasons: string[] = []
  const last = jaroWinkler(p.lastName, k.lastName)
  const first = jaroWinkler(p.firstName, k.firstName)
  if (last === 1) reasons.push('Same last name')
  else if (last >= 0.9) reasons.push(`Last name close: ${p.lastName} / ${k.lastName}`)
  if (first === 1) reasons.push('Same first name')
  else if (first >= 0.85) reasons.push(`First name spelled differently: ${p.firstName} / ${k.firstName}`)

  const dob = compareDob(p.dob, k.dob)
  const dobScore = { exact: 1, 'day-month-swapped': 0.75, 'one-digit-off': 0.6, different: 0 }[dob]
  if (dob === 'exact') reasons.push('Same date of birth')
  if (dob === 'day-month-swapped') reasons.push('Date of birth with day and month swapped')
  if (dob === 'one-digit-off') reasons.push('Date of birth one digit off (possible typo)')

  const sameAddress = normalizeAddress(p.address) === normalizeAddress(k.address)
  if (sameAddress) reasons.push('Same address as a prior report')

  const score = W.last * last + W.first * first + W.dob * dobScore + W.address * (sameAddress ? 1 : 0)
  // Hard "no"s, whatever the score: a completely different birth date, or a clearly different
  // first name (twins share a birthday, an address and a last name). Known gap: nicknames such
  // as Bill / William fail the first-name check; a real build needs a nickname table.
  const hardNo = dob === 'different' || first < FIRST_NAME_FLOOR
  const level: MatchLevel = hardNo ? 'none' : score >= LIKELY ? 'likely' : score >= POSSIBLE ? 'possible' : 'none'
  return { candidate: k, score: Math.round(score * 100) / 100, level, reasons }
}

export function findMatches(p: PersonInput & { address: string }, registry: readonly RegistryPerson[]): MatchResult[] {
  return registry
    .map((k) => scoreMatch(p, k))
    .filter((r) => r.level !== 'none')
    .sort((a, b) => b.score - a.score)
}
