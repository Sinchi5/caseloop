import { describe, expect, it } from 'vitest'
import { actor, isCps } from '../actors'
import { deriveCases } from '../caseState'
import { DAY, HOUR } from '../clocks'
import { approvalWaits, median, results } from '../metrics'
import { noticesFor, unreadCount } from '../notifications'
import { seedEvents } from '../seed'
import type { CaseEvent } from '../types'

const NOW = Date.parse('2026-10-21T14:00:00Z')
const events = seedEvents(NOW)
const cases = deriveCases(events)

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeUndefined()
  })
})

describe('results', () => {
  const r = results(cases, NOW, isCps)

  it('counts each deadline as on time, late, missed or not yet due, and nothing twice', () => {
    for (const s of r.clocks) expect(s.onTime + s.late + s.missed + s.notDue).toBe(cases.length)
    const safety = r.clocks.find((s) => s.def.id === 'safety')!
    expect(safety.missed).toBe(2) // NC-1033 never sent, NC-1030 returned and never resent
  })

  it('measures report-to-visit only for cases where the child was seen', () => {
    expect(r.toFirstVisit.n).toBe(cases.filter((c) => c.contacts.some((k) => k.kind === 'home-visit' || k.kind === 'school-visit')).length)
    expect(r.toFirstVisit.median).toBeGreaterThan(0)
  })

  it('leaves the on-time rate between 0 and 1, from deadlines that have come due', () => {
    expect(r.onTimeRate).toBeGreaterThan(0)
    expect(r.onTimeRate).toBeLessThan(1)
  })

  it('counts a note still inside its window as neither on time nor late', () => {
    // NC-1009's phone call 2 days ago has no note yet and is still in its window
    const all = cases.flatMap((c) => c.contacts)
    expect(r.notes.total).toBe(all.filter((k) => k.note || NOW - k.contactAt > 5 * DAY).length)
  })
})

describe('approvalWaits', () => {
  it('reads waits from the log, so a return and a resend are two waits', () => {
    const base = cases.find((c) => c.id === 'NC-1030')!
    const resend: CaseEvent[] = [
      { id: 'a', caseId: 'NC-1030', at: new Date(NOW - 2 * DAY).toISOString(), actorId: 'w-chen', type: 'SUBMITTED', item: 'safety', summary: 'With school contact' },
      { id: 'b', caseId: 'NC-1030', at: new Date(NOW - 2 * DAY + 3 * HOUR).toISOString(), actorId: 's-brooks', type: 'APPROVED', item: 'safety' },
    ]
    const c = deriveCases([...base.events, ...resend])[0]
    expect(approvalWaits([c], NOW).decided).toEqual([1 * DAY, 3 * HOUR])
  })

  it('reports what is still waiting', () => {
    const w = approvalWaits(cases, NOW)
    expect(w.open).toEqual([2 * DAY]) // NC-1037
  })
})

describe('notifications', () => {
  it('tells a caseworker their work was returned, with the reason', () => {
    const n = noticesFor(actor('w-chen'), cases, NOW)
    expect(n.some((x) => x.caseId === 'NC-1030' && x.tone === 'warn' && x.text.includes('Add the school contact'))).toBe(true)
  })

  it('tells a supervisor what is waiting on them and what is new', () => {
    const n = noticesFor(actor('s-brooks'), cases, NOW)
    expect(n.some((x) => x.text.includes('sent the safety assessment on NC-1037'))).toBe(true)
    expect(n.some((x) => x.text.startsWith('New report NC-1042') && x.tone === 'bad')).toBe(true)
    expect(n.some((x) => x.text.startsWith('New report NC-1041') && x.text.includes('State Central Register'))).toBe(true)
  })

  it('tells an officer when CPS has not opened a referral, and only about their own referrals', () => {
    const n = noticesFor(actor('p-nguyen'), cases, NOW)
    expect(n.some((x) => x.caseId === 'NC-1042' && x.text.includes('not opened'))).toBe(true)
    expect(n.every((x) => ['NC-1042', 'NC-1037', 'NC-1030', 'NC-0970'].includes(x.caseId))).toBe(true)
    expect(JSON.stringify(n)).not.toMatch(/Rivera|Chen|Brooks|indicated|unfounded/)
  })

  it('never notifies someone of their own action', () => {
    const n = noticesFor(actor('w-rivera'), cases, NOW)
    expect(n.some((x) => x.text.startsWith('Maria Rivera'))).toBe(false)
  })

  it('does not announce anything that has not happened yet', () => {
    for (const a of ['w-rivera', 's-brooks', 'p-nguyen'])
      expect(noticesFor(actor(a), cases, NOW).every((x) => x.at <= NOW)).toBe(true)
  })

  it('a deadline alert appears once the deadline is close', () => {
    const at = (t: number) => noticesFor(actor('w-rivera'), cases, t).filter((x) => x.id === 'NC-1037:determination:soon')
    expect(at(NOW)).toHaveLength(0)
    expect(at(NOW + 54 * DAY)).toHaveLength(1)
  })

  it('counts unread from the last time the inbox was opened', () => {
    const n = noticesFor(actor('s-brooks'), cases, NOW)
    expect(unreadCount(n)).toBe(n.length)
    expect(unreadCount(n, NOW)).toBe(0)
  })
})
