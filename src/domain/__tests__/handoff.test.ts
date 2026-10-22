import { describe, expect, it } from 'vitest'
import { actor } from '../actors'
import { deriveCases, indicatedAt, isClosed } from '../caseState'
import { DAY } from '../clocks'
import { computeClocks } from '../clocks'
import { handoffSummary, latestHandoff } from '../handoff'
import { noticesFor } from '../notifications'
import { agencyView, can } from '../policy'
import { rank } from '../priority'
import { seedEvents } from '../seed'
import type { CaseEvent } from '../types'

const NOW = Date.parse('2026-10-21T14:00:00Z')
const events = seedEvents(NOW)
const cases = deriveCases(events)
const get = (id: string) => cases.find((c) => c.id === id)!

describe('indicated cases stay open for services', () => {
  it('an indicated case is not closed; an unfounded one is', () => {
    expect(isClosed(get('NC-0951'))).toBe(false)
    expect(indicatedAt(get('NC-0951'))).toBe(NOW - 5 * DAY)
    expect(isClosed(get('NC-0970'))).toBe(true) // unfounded
  })

  it('starts the FASP clocks from the date of indication: Initial in 7 days, Comprehensive in 90', () => {
    const clocks = computeClocks(get('NC-0951'), NOW)
    const initial = clocks.find((k) => k.def.id === 'fasp-initial')!
    const comprehensive = clocks.find((k) => k.def.id === 'fasp-comprehensive')!
    expect(initial.dueAt).toBe(NOW + 2 * DAY)
    expect(initial.status).toBe('due-soon')
    expect(initial.def.source.cite).toMatch(/OCFS CPS Program Manual ch\. 8/)
    expect(comprehensive.dueAt).toBe(NOW - 5 * DAY + 90 * DAY)
    expect(comprehensive.def.source.cite).toMatch(/18 NYCRR 428\.3\(f\)/)
  })

  it('has no FASP clocks before indication or for unfounded cases', () => {
    for (const id of ['NC-1033', 'NC-0970']) expect(computeClocks(get(id), NOW).some((k) => k.def.id.startsWith('fasp'))).toBe(false)
  })

  it('the investigation still counts as closed for the referring agency', () => {
    expect(agencyView(get('NC-0951')).steps.find((s) => s.id === 'closed')!.at).toBe(NOW - 5 * DAY)
  })

  it('the new worker can send the Initial FASP for approval', () => {
    expect(can(actor('w-rivera'), 'submit', get('NC-0951'))).toBe(true)
    const sub: CaseEvent = { id: 'f1', caseId: 'NC-0951', at: new Date(NOW).toISOString(), actorId: 'w-rivera', type: 'SUBMITTED', item: 'fasp-initial', summary: 'Plan drafted with mother' }
    const ok: CaseEvent = { id: 'f2', caseId: 'NC-0951', at: new Date(NOW + 3_600_000).toISOString(), actorId: 's-brooks', type: 'APPROVED', item: 'fasp-initial' }
    const c = deriveCases([...events, sub, ok]).find((x) => x.id === 'NC-0951')!
    expect(computeClocks(c, NOW + 2 * 3_600_000).find((k) => k.def.id === 'fasp-initial')!.status).toBe('done')
  })
})

describe('handoff when a case changes hands', () => {
  const h = latestHandoff(get('NC-0951'), NOW)!

  it('records who had it, who has it now, and who moved it', () => {
    expect(h.fromId).toBe('w-chen')
    expect(h.toId).toBe('w-rivera')
    expect(h.byId).toBe('s-brooks')
    expect(h.at).toBe(NOW - 6 * 3_600_000)
  })

  it('lists everything the new worker inherits: the FASP due and the untyped note', () => {
    expect(h.open[0].def.id).toBe('fasp-initial')
    expect(h.notes.map((n) => n.contact.loggedBy)).toEqual(['w-chen'])
    expect(handoffSummary(h, NOW)).toMatch(/Initial FASP due .* · 1 note owed/)
  })

  it('tells the new worker in the inbox, with what is open', () => {
    const n = noticesFor(actor('w-rivera'), cases, NOW).find((x) => x.caseId === 'NC-0951' && x.text.includes('moved'))!
    expect(n.text).toMatch(/Lena Brooks moved NC-0951 \(Kai R\.\) to you from James Chen\. Open now: Initial FASP due/)
    expect(n.tone).toBe('warn')
  })

  it('says why the case is near the top of the new worker\'s list', () => {
    expect(rank(get('NC-0951'), NOW).reasons).toContain('Changed hands 6 h ago, from James Chen')
  })

  it('a case assigned only once has no handoff, and reassigning to the same person changes nothing', () => {
    expect(latestHandoff(get('NC-1033'), NOW)).toBeUndefined()
    const again: CaseEvent = { id: 'x', caseId: 'NC-1033', at: new Date(NOW).toISOString(), actorId: 's-brooks', type: 'ASSIGNED', workerId: 'w-rivera' }
    expect(deriveCases([...events, again]).find((c) => c.id === 'NC-1033')!.assignments).toHaveLength(1)
  })
})

describe('formatSpan', () => {
  it('reads 47 hours as 2 days, and a day and a few hours as 1 day', async () => {
    const { formatSpan } = await import('../format')
    expect(formatSpan(47 * 3_600_000)).toBe('2 days')
    expect(formatSpan(30 * 3_600_000)).toBe('1 day')
    expect(formatSpan(5 * 3_600_000)).toBe('5 h')
  })
})
