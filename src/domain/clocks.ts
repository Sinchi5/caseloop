import { firstFaceToFace, indicatedAt, investigationClosedAt, type CaseState, type Contact } from './caseState'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export type ClockId = 'commence' | 'safety' | 'midpoint' | 'determination' | 'fasp-initial' | 'fasp-comprehensive'

export interface Source {
  kind: 'law' | 'practice'
  cite: string
  url?: string
}

export interface ClockDef {
  id: ClockId
  label: string
  short: string
  window: number
  /** How long before the due time a clock turns "due soon". */
  warn: number
  source: Source
  /** What the window counts from: the report, or the date the case was indicated. */
  from: 'intake' | 'indication'
}

const SSL_424 = 'https://www.nysenate.gov/legislation/laws/SOS/424'
const CPS_MANUAL_CH8 = 'https://ocfs.ny.gov/programs/cps/manual/2025/2025-CPS-Manual-Ch08.pdf'

export const CLOCKS: readonly ClockDef[] = [
  {
    id: 'commence',
    label: 'Start the investigation (see the child)',
    short: '24 h',
    window: 24 * HOUR,
    warn: 6 * HOUR,
    source: { kind: 'law', cite: 'NY Social Services Law §424(6)(a)', url: SSL_424 },
    from: 'intake',
  },
  {
    id: 'safety',
    label: 'Safety assessment and preliminary report',
    short: '7 d',
    window: 7 * DAY,
    warn: 2 * DAY,
    source: { kind: 'law', cite: 'NY Social Services Law §424(3)', url: SSL_424 },
    from: 'intake',
  },
  {
    id: 'midpoint',
    label: '30-day supervisor review',
    short: '30 d',
    window: 30 * DAY,
    warn: 3 * DAY,
    source: { kind: 'practice', cite: 'Office practice, from a caseworker interview' },
    from: 'intake',
  },
  {
    id: 'determination',
    label: 'Determination: indicated or unfounded',
    short: '60 d',
    window: 60 * DAY,
    warn: 7 * DAY,
    source: { kind: 'law', cite: 'NY Social Services Law §424(7)', url: SSL_424 },
    from: 'intake',
  },
]

/**
 * Once a case is indicated and stays open for services, the family assessment and service
 * plan (FASP) clocks start. From the OCFS CPS Program Manual, ch. 8 (2025): the Initial FASP
 * within 7 days of the date of indication; the Comprehensive FASP within 90 days of the case
 * initiation date (18 NYCRR 428.3(f)). Simplification: the prototype treats the date of
 * indication as the case initiation date. Reassessment intervals are left out on purpose:
 * published sources disagree (7 months vs 210 days), so they need confirming with OCFS first.
 */
export const FASP_CLOCKS: readonly ClockDef[] = [
  {
    id: 'fasp-initial',
    label: 'Initial FASP',
    short: 'FASP 7 d',
    window: 7 * DAY,
    warn: 2 * DAY,
    source: { kind: 'law', cite: 'OCFS CPS Program Manual ch. 8: within 7 days of indication', url: CPS_MANUAL_CH8 },
    from: 'indication',
  },
  {
    id: 'fasp-comprehensive',
    label: 'Comprehensive FASP',
    short: 'FASP 90 d',
    window: 90 * DAY,
    warn: 10 * DAY,
    source: { kind: 'law', cite: '18 NYCRR 428.3(f): within 90 days of case initiation', url: CPS_MANUAL_CH8 },
    from: 'indication',
  },
]

/** Notes "should be in within 3 to 5 days"; we hold the outer edge. */
export const NOTE_WINDOW = 5 * DAY
export const NOTE_WARN = 2 * DAY
export const NOTE_SOURCE: Source = { kind: 'practice', cite: 'Office practice: notes within 3–5 days of a contact' }

export type ClockStatus = 'done' | 'done-late' | 'overdue' | 'due-soon' | 'upcoming'

export interface ClockResult {
  def: ClockDef
  dueAt: number
  status: ClockStatus
  completedAt?: number
  /** Submitted and waiting on a supervisor since this time. The clock keeps running. */
  awaitingApprovalSince?: number
}

export function statusFor(dueAt: number, warn: number, now: number, completedAt?: number): ClockStatus {
  if (completedAt !== undefined) return completedAt <= dueAt ? 'done' : 'done-late'
  if (now > dueAt) return 'overdue'
  if (dueAt - now <= warn) return 'due-soon'
  return 'upcoming'
}

function completion(c: CaseState, id: ClockId): { at?: number; pendingSince?: number } {
  switch (id) {
    case 'commence':
      return { at: firstFaceToFace(c)?.contactAt }
    case 'midpoint':
      return { at: c.reviewCompletedAt }
    case 'safety':
    case 'determination':
    case 'fasp-initial':
    case 'fasp-comprehensive': {
      const a = c.approvals[id]
      if (!a) return {}
      if (a.status === 'approved') return { at: a.decidedAt }
      if (a.status === 'pending') return { pendingSince: a.submittedAt }
      return {}
    }
  }
}

export function computeClocks(c: CaseState, now: number): ClockResult[] {
  const investigationDone = investigationClosedAt(c)
  const indicated = indicatedAt(c)
  const defs = indicated === undefined ? CLOCKS : [...CLOCKS, ...FASP_CLOCKS]
  return defs.map((def) => {
    const base = def.from === 'indication' ? indicated! : c.intakeAt
    const dueAt = base + def.window
    const { at, pendingSince } = completion(c, def.id)
    // A 30-day review that never happened stops mattering once the investigation is over.
    const completedAt = at ?? (def.id === 'midpoint' ? investigationDone : undefined)
    return {
      def,
      dueAt,
      completedAt,
      awaitingApprovalSince: pendingSince,
      status: statusFor(dueAt, def.warn, now, completedAt),
    }
  })
}

export interface NoteOwed {
  contact: Contact
  dueAt: number
  status: ClockStatus
}

export function notesOwed(c: CaseState, now: number): NoteOwed[] {
  return c.contacts
    .filter((x) => !x.note)
    .map((contact) => {
      const dueAt = contact.contactAt + NOTE_WINDOW
      return { contact, dueAt, status: statusFor(dueAt, NOTE_WARN, now) }
    })
}

export const isOpenStatus = (s: ClockStatus) => s === 'overdue' || s === 'due-soon' || s === 'upcoming'
