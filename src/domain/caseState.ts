import type { ApprovalItem, CaseEvent, ContactKind, Referral } from './types'

export interface Contact {
  id: string
  contactAt: number
  loggedAt: number
  loggedBy: string
  kind: ContactKind
  with: string
  summary: string
  photos: string[]
  note?: { text: string; at: number; by: string }
}

export interface Approval {
  status: 'pending' | 'approved' | 'returned'
  summary: string
  outcome?: 'indicated' | 'unfounded'
  submittedAt: number
  submittedBy: string
  decidedAt?: number
  decidedBy?: string
  reason?: string
}

export interface CaseState {
  id: string
  referral: Referral
  intakeAt: number
  submittedBy: string
  /** First time each actor opened the case. Read receipts for the closed loop. */
  seenBy: Record<string, number>
  assignedTo?: { workerId: string; at: number; by: string }
  /** Every assignment in order; more than one means the case changed hands. */
  assignments: { workerId: string; at: number; by: string }[]
  contacts: Contact[]
  approvals: Partial<Record<ApprovalItem, Approval>>
  reviewCompletedAt?: number
  matchDecisions: Record<string, 'same' | 'different'>
  events: CaseEvent[]
}

export const matchKey = (personId: string, candidateId: string) => `${personId}:${candidateId}`

const ms = (iso: string) => Date.parse(iso)

/** Apply one event. Events that make no sense for the current state are ignored, never thrown. */
export function applyEvent(state: CaseState | undefined, e: CaseEvent): CaseState | undefined {
  if (e.type === 'REFERRAL_SUBMITTED') {
    if (state) return state
    return {
      id: e.caseId,
      referral: e.referral,
      intakeAt: ms(e.at),
      submittedBy: e.actorId,
      seenBy: {},
      assignments: [],
      contacts: [],
      approvals: {},
      matchDecisions: {},
      events: [e],
    }
  }
  if (!state) return undefined
  const s: CaseState = { ...state, events: [...state.events, e] }

  switch (e.type) {
    case 'SEEN':
      if (s.seenBy[e.actorId] !== undefined) return state // idempotent: only the first view counts
      s.seenBy = { ...s.seenBy, [e.actorId]: ms(e.at) }
      return s
    case 'ASSIGNED':
      if (s.assignedTo?.workerId === e.workerId) return state
      s.assignedTo = { workerId: e.workerId, at: ms(e.at), by: e.actorId }
      s.assignments = [...s.assignments, s.assignedTo]
      return s
    case 'CONTACT_LOGGED':
      s.contacts = [
        ...s.contacts,
        {
          id: e.contactId,
          contactAt: ms(e.contactAt),
          loggedAt: ms(e.at),
          loggedBy: e.actorId,
          kind: e.kind,
          with: e.with,
          summary: e.summary,
          photos: e.photos,
        },
      ]
      return s
    case 'NOTE_WRITTEN':
      s.contacts = s.contacts.map((c) =>
        c.id === e.contactId ? { ...c, note: { text: e.text, at: ms(e.at), by: e.actorId } } : c,
      )
      return s
    case 'SUBMITTED': {
      const prev = s.approvals[e.item]
      if (prev?.status === 'approved') return state
      s.approvals = {
        ...s.approvals,
        [e.item]: {
          status: 'pending',
          summary: e.summary,
          outcome: e.outcome,
          submittedAt: ms(e.at),
          submittedBy: e.actorId,
        },
      }
      return s
    }
    case 'APPROVED':
    case 'RETURNED': {
      const prev = s.approvals[e.item]
      if (!prev || prev.status !== 'pending') return state
      s.approvals = {
        ...s.approvals,
        [e.item]: {
          ...prev,
          status: e.type === 'APPROVED' ? 'approved' : 'returned',
          decidedAt: ms(e.at),
          decidedBy: e.actorId,
          reason: e.type === 'RETURNED' ? e.reason : undefined,
        },
      }
      return s
    }
    case 'REVIEW_COMPLETED':
      if (s.reviewCompletedAt !== undefined) return state
      s.reviewCompletedAt = ms(e.at)
      return s
    case 'MATCH_DECIDED':
      s.matchDecisions = { ...s.matchDecisions, [matchKey(e.personId, e.candidateId)]: e.decision }
      return s
  }
}

/** Rebuild every case from the log, in time order. */
export function deriveCases(events: CaseEvent[]): CaseState[] {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at))
  const byId = new Map<string, CaseState>()
  for (const e of sorted) {
    const next = applyEvent(byId.get(e.caseId), e)
    if (next) byId.set(e.caseId, next)
  }
  return [...byId.values()]
}

/** Face-to-face contact with the family starts the investigation; a phone call or collateral does not. */
export function firstFaceToFace(c: CaseState): Contact | undefined {
  return c.contacts
    .filter((x) => x.kind === 'home-visit' || x.kind === 'school-visit')
    .sort((a, b) => a.contactAt - b.contactAt)[0]
}

/** The investigation ends when the determination is approved, whatever it found. */
export function investigationClosedAt(c: CaseState): number | undefined {
  const d = c.approvals.determination
  return d?.status === 'approved' ? d.decidedAt : undefined
}

/** An indicated case stays open for services (and FASP deadlines); an unfounded one closes. */
export function indicatedAt(c: CaseState): number | undefined {
  const d = c.approvals.determination
  return d?.status === 'approved' && d.outcome === 'indicated' ? d.decidedAt : undefined
}

export function isClosed(c: CaseState): boolean {
  return investigationClosedAt(c) !== undefined && indicatedAt(c) === undefined
}

/**
 * First time anyone at CPS (not the referring agency) opened or acted on the case.
 * Acting counts as opening: a supervisor who assigns a report from the queue has seen it.
 */
export function firstSeenByCps(c: CaseState, isCps: (actorId: string) => boolean): number | undefined {
  const times = [
    ...Object.entries(c.seenBy).filter(([id]) => isCps(id)).map(([, t]) => t),
    ...c.events.filter((e) => e.type !== 'REFERRAL_SUBMITTED' && isCps(e.actorId)).map((e) => Date.parse(e.at)),
  ]
  return times.length ? Math.min(...times) : undefined
}
