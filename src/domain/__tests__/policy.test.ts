import { describe, expect, it } from 'vitest'
import { actor } from '../actors'
import { deriveCases } from '../caseState'
import { accessTo, agencyView, can } from '../policy'
import { seedEvents } from '../seed'

const NOW = Date.parse('2026-10-21T14:00:00Z')
const cases = deriveCases(seedEvents(NOW))
const get = (id: string) => cases.find((c) => c.id === id)!

describe('who can open a case', () => {
  it('a caseworker sees only their own cases', () => {
    const rivera = actor('w-rivera')
    expect(accessTo(rivera, get('NC-1033'))).toBe('full')
    expect(accessTo(rivera, get('NC-0988'))).toBe('none') // Chen's case
    expect(accessTo(rivera, get('NC-1042'))).toBe('none') // unassigned
  })

  it('a supervisor sees every case', () => {
    for (const c of cases) expect(accessTo(actor('s-brooks'), c)).toBe('full')
  })

  it('an officer sees status only, and only for their own agency', () => {
    const nguyen = actor('p-nguyen')
    expect(accessTo(nguyen, get('NC-1042'))).toBe('status-only')
    expect(accessTo(nguyen, get('NC-1040'))).toBe('none') // Kessler Township's referral
    expect(accessTo(nguyen, get('NC-1033'))).toBe('none') // came from the hotline
  })
})

describe('what an officer receives', () => {
  it('contains no notes, contacts, risk, history, worker name or outcome', () => {
    for (const c of cases.filter((x) => accessTo(actor('p-nguyen'), x) === 'status-only')) {
      const view = agencyView(c)
      expect(Object.keys(view).sort()).toEqual(['caseId', 'children', 'sentAt', 'sentBy', 'steps'])
      const json = JSON.stringify(view)
      for (const k of c.contacts) {
        expect(json).not.toContain(k.summary)
        if (k.note) expect(json).not.toContain(k.note.text)
      }
      expect(json).not.toMatch(/indicated|unfounded|riskFactors|Rivera|Chen|Okafor/)
      for (const p of c.referral.children) expect(json).not.toContain(p.lastName) // initials only
    }
  })

  it('shows the closed loop: sent, opened, assigned, seen, assessed, closed', () => {
    const steps = agencyView(get('NC-0970')).steps
    expect(steps.map((s) => s.id)).toEqual(['sent', 'opened', 'assigned', 'child-seen', 'safety', 'closed'])
    expect(steps.every((s) => s.at !== undefined)).toBe(true)
  })

  it('assigning from the queue counts as opening, even without opening the case page', () => {
    const assign = { id: 'x1', caseId: 'NC-1042', at: new Date(NOW).toISOString(), actorId: 's-brooks', type: 'ASSIGNED', workerId: 'w-okafor' } as const
    const c = deriveCases([...seedEvents(NOW), assign]).find((x) => x.id === 'NC-1042')!
    const steps = agencyView(c).steps
    expect(steps.find((s) => s.id === 'opened')!.at).toBe(NOW)
    expect(steps.find((s) => s.id === 'assigned')!.at).toBe(NOW)
  })

  it('a referral nobody at CPS has opened says so', () => {
    const opened = agencyView(get('NC-1042')).steps.find((s) => s.id === 'opened')!
    expect(opened.at).toBeUndefined()
  })
})

describe('actions', () => {
  it('only the assigned worker can write to a case, and not once it is closed', () => {
    expect(can(actor('w-rivera'), 'log-contact', get('NC-1033'))).toBe(true)
    expect(can(actor('w-chen'), 'log-contact', get('NC-1033'))).toBe(false)
    expect(can(actor('w-rivera'), 'log-contact', get('NC-0970'))).toBe(false) // closed
    expect(can(actor('s-brooks'), 'log-contact', get('NC-1033'))).toBe(false)
  })
  it('only supervisors approve, assign and read the access log', () => {
    for (const a of ['approve', 'assign', 'view-access-log'] as const) {
      expect(can(actor('s-brooks'), a)).toBe(true)
      expect(can(actor('w-rivera'), a)).toBe(false)
      expect(can(actor('p-nguyen'), a)).toBe(false)
    }
  })
})
