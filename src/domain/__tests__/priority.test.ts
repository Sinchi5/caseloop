import { describe, expect, it } from 'vitest'
import { deriveCases } from '../caseState'
import { rankCases } from '../priority'
import { riskLevel } from '../risk'
import { seedEvents } from '../seed'
import { CaseEventSchema } from '../types'

const NOW = Date.parse('2026-10-21T14:00:00Z')
const events = seedEvents(NOW)
const ranked = rankCases(deriveCases(events), NOW)
const tierOf = (id: string) => ranked.find((r) => r.c.id === id)!.tier

describe('demo data', () => {
  it('every seeded event passes the same schema the app uses to load saved data', () => {
    for (const e of events) expect(() => CaseEventSchema.parse(e)).not.toThrow()
  })

  it('gives every person in a case a unique id', () => {
    for (const c of deriveCases(events)) {
      const ids = [...c.referral.children, ...c.referral.caregivers].map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('each case lands where its story says it should', () => {
    expect(tierOf('NC-1033')).toBe('overdue') // safety 2 days late
    expect(tierOf('NC-0988')).toBe('overdue') // day 88
    expect(tierOf('NC-1030')).toBe('overdue') // returned, never resubmitted
    expect(tierOf('NC-1021')).toBe('overdue') // a note 4 days late
    expect(tierOf('NC-1041')).toBe('due-soon') // 4 hours left to see the child
    expect(tierOf('NC-1037')).toBe('due-soon')
    expect(tierOf('NC-1009')).toBe('on-track')
    expect(tierOf('NC-0970')).toBe('closed')
  })
})

describe('rankCases', () => {
  it('puts missed deadlines first, then risk, then the next due date', () => {
    const tiers = ranked.map((r) => r.tier)
    const order = ['overdue', 'due-soon', 'on-track', 'closed']
    expect([...tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(tiers)
    const overdue = ranked.filter((r) => r.tier === 'overdue')
    expect(overdue[0].risk).toBe('high')
  })

  it('explains itself', () => {
    const r = ranked.find((x) => x.c.id === 'NC-1037')!
    expect(r.reasons.some((x) => x.startsWith('Waiting on supervisor for 2 days'))).toBe(true)
    const day88 = ranked.find((x) => x.c.id === 'NC-0988')!
    expect(day88.reasons[0]).toMatch(/Determination.*overdue by 28 days/)
  })
})

describe('riskLevel', () => {
  it('one critical factor is enough for high', () => {
    expect(riskLevel(['strangulation'])).toBe('high')
    expect(riskLevel(['prior-calls'])).toBe('standard')
    expect(riskLevel(['weapon-in-home', 'substance-use'])).toBe('elevated')
    expect(riskLevel(['weapon-in-home', 'substance-use', 'prior-calls'])).toBe('high')
  })
})
