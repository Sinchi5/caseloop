import { firstFaceToFace, type CaseState, type Contact } from './caseState'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export type ClockId = 'commence' | 'safety' | 'midpoint' | 'determination'

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
}

const SSL_424 = 'https://www.nysenate.gov/legislation/laws/SOS/424'

export const CLOCKS: readonly ClockDef[] = [
  {
    id: 'commence',
    label: 'Start the investigation (see the child)',
    short: '24 h',
    window: 24 * HOUR,
    warn: 6 * HOUR,
    source: { kind: 'law', cite: 'NY Social Services Law §424(6)(a)', url: SSL_424 },
  },
  {
    id: 'safety',
    label: 'Safety assessment and preliminary report',
    short: '7 d',
    window: 7 * DAY,
    warn: 2 * DAY,
    source: { kind: 'law', cite: 'NY Social Services Law §424(3)', url: SSL_424 },
  },
  {
    id: 'midpoint',
    label: '30-day supervisor review',
    short: '30 d',
    window: 30 * DAY,
    warn: 3 * DAY,
    source: { kind: 'practice', cite: 'Office practice, from a caseworker interview' },
  },
  {
    id: 'determination',
    label: 'Determination: indicated or unfounded',
    short: '60 d',
    window: 60 * DAY,
    warn: 7 * DAY,
    source: { kind: 'law', cite: 'NY Social Services Law §424(7)', url: SSL_424 },
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
    case 'determination': {
      const a = c.approvals[id]
      if (!a) return {}
      if (a.status === 'approved') return { at: a.decidedAt }
      if (a.status === 'pending') return { pendingSince: a.submittedAt }
      return {}
    }
  }
}

export function computeClocks(c: CaseState, now: number): ClockResult[] {
  const closed = c.approvals.determination?.status === 'approved'
  return CLOCKS.map((def) => {
    const dueAt = c.intakeAt + def.window
    const { at, pendingSince } = completion(c, def.id)
    // A 30-day review that never happened stops mattering once the case is closed.
    const completedAt = at ?? (closed && def.id === 'midpoint' ? c.approvals.determination?.decidedAt : undefined)
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
