import { describe, expect, it } from 'vitest'
import { deriveCases, type CaseState } from '../caseState'
import { CLOCKS, DAY, HOUR, computeClocks, notesOwed, statusFor } from '../clocks'
import type { CaseEvent } from '../types'

const T0 = Date.parse('2026-10-01T12:00:00Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()
let i = 0
const e = (ms: number, actorId: string, rest: Record<string, unknown>) =>
  ({ id: `e${++i}`, caseId: 'C1', at: at(ms), actorId, ...rest }) as CaseEvent

const referral: CaseEvent = e(0, 'p-nguyen', {
  type: 'REFERRAL_SUBMITTED',
  referral: {
    source: { kind: 'agency', agency: 'Northfield Police Dept.', officerId: 'p-nguyen' },
    incidentAt: at(-HOUR),
    address: '1 Test Street',
    children: [{ id: 'C1-c1', kind: 'child', firstName: 'Test', lastName: 'Child', dob: '2018-01-01' }],
    caregivers: [],
    riskFactors: [],
    narrative: 'A test referral narrative long enough.',
  },
})
const build = (...more: CaseEvent[]): CaseState => deriveCases([referral, ...more])[0]
const clock = (c: CaseState, now: number, id: string) => computeClocks(c, now).find((k) => k.def.id === id)!

describe('legal clocks, NY Social Services Law §424', () => {
  it('uses the windows the statute sets: 24 hours, 7 days, 60 days', () => {
    const byId = Object.fromEntries(CLOCKS.map((k) => [k.id, k]))
    expect(byId.commence.window).toBe(24 * HOUR)
    expect(byId.safety.window).toBe(7 * DAY)
    expect(byId.determination.window).toBe(60 * DAY)
    expect(byId.commence.source.cite).toContain('§424(6)(a)')
    expect(byId.safety.source.cite).toContain('§424(3)')
    expect(byId.determination.source.cite).toContain('§424(7)')
  })

  it('labels the 30-day review as office practice, not law', () => {
    expect(CLOCKS.find((k) => k.id === 'midpoint')!.source.kind).toBe('practice')
  })

  it('counts from intake, not from the incident', () => {
    expect(clock(build(), T0, 'commence').dueAt).toBe(T0 + 24 * HOUR)
  })

  it('moves upcoming -> due soon -> overdue as time passes', () => {
    const c = build()
    expect(clock(c, T0 + 1 * HOUR, 'commence').status).toBe('upcoming')
    expect(clock(c, T0 + 19 * HOUR, 'commence').status).toBe('due-soon')
    expect(clock(c, T0 + 24 * HOUR, 'commence').status).toBe('due-soon') // exactly on time is not late
    expect(clock(c, T0 + 24 * HOUR + 1, 'commence').status).toBe('overdue')
  })

  it('a phone call does not start the investigation; seeing the child does', () => {
    const phone = e(2 * HOUR, 'w-rivera', { type: 'CONTACT_LOGGED', contactId: 'k1', contactAt: at(2 * HOUR), kind: 'phone', with: 'Mother', summary: '', photos: [] })
    expect(clock(build(phone), T0 + 30 * HOUR, 'commence').status).toBe('overdue')
    const visit = e(20 * HOUR, 'w-rivera', { type: 'CONTACT_LOGGED', contactId: 'k2', contactAt: at(20 * HOUR), kind: 'home-visit', with: 'Child', summary: '', photos: [] })
    expect(clock(build(phone, visit), T0 + 30 * HOUR, 'commence').status).toBe('done')
  })

  it('records a contact made late as done-late, not done', () => {
    const visit = e(30 * HOUR, 'w-rivera', { type: 'CONTACT_LOGGED', contactId: 'k', contactAt: at(30 * HOUR), kind: 'home-visit', with: 'Child', summary: '', photos: [] })
    expect(clock(build(visit), T0 + 40 * HOUR, 'commence').status).toBe('done-late')
  })

  it('keeps the clock running while a submission waits on a supervisor', () => {
    const sub = e(5 * DAY, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe' })
    const k = clock(build(sub), T0 + 8 * DAY, 'safety')
    expect(k.status).toBe('overdue')
    expect(k.awaitingApprovalSince).toBe(T0 + 5 * DAY)
  })

  it('a returned submission is not done, and approval completes it', () => {
    const sub = e(2 * DAY, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe' })
    const ret = e(3 * DAY, 's-brooks', { type: 'RETURNED', item: 'safety', reason: 'Add school contact' })
    expect(clock(build(sub, ret), T0 + 4 * DAY, 'safety').completedAt).toBeUndefined()
    const sub2 = e(4 * DAY, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe, school seen' })
    const ok = e(4 * DAY + HOUR, 's-brooks', { type: 'APPROVED', item: 'safety' })
    expect(clock(build(sub, ret, sub2, ok), T0 + 5 * DAY, 'safety').status).toBe('done')
  })

  it('ignores an approval with nothing pending', () => {
    const ok = e(2 * DAY, 's-brooks', { type: 'APPROVED', item: 'safety' })
    expect(build(ok).approvals.safety).toBeUndefined()
  })
})

describe('contact notes (office practice: within 3–5 days)', () => {
  it('a contact without a note is owed, due five days after the contact', () => {
    const k = e(DAY, 'w-rivera', { type: 'CONTACT_LOGGED', contactId: 'k1', contactAt: at(DAY), kind: 'home-visit', with: 'Child', summary: '', photos: [] })
    const owed = notesOwed(build(k), T0 + 7 * DAY)
    expect(owed).toHaveLength(1)
    expect(owed[0].dueAt).toBe(T0 + 6 * DAY)
    expect(owed[0].status).toBe('overdue')
  })

  it('writing the note clears it', () => {
    const k = e(DAY, 'w-rivera', { type: 'CONTACT_LOGGED', contactId: 'k1', contactAt: at(DAY), kind: 'home-visit', with: 'Child', summary: '', photos: [] })
    const nte = e(2 * DAY, 'w-rivera', { type: 'NOTE_WRITTEN', contactId: 'k1', text: 'Typed up.' })
    expect(notesOwed(build(k, nte), T0 + 7 * DAY)).toHaveLength(0)
  })
})

describe('statusFor', () => {
  it('is pure arithmetic on the due time', () => {
    expect(statusFor(100, 10, 50)).toBe('upcoming')
    expect(statusFor(100, 10, 95)).toBe('due-soon')
    expect(statusFor(100, 10, 101)).toBe('overdue')
    expect(statusFor(100, 10, 200, 99)).toBe('done')
    expect(statusFor(100, 10, 200, 150)).toBe('done-late')
  })
})
