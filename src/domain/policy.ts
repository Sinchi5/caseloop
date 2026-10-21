import { firstFaceToFace, firstSeenByCps, isClosed, type CaseState } from './caseState'
import { actor, isCps } from './actors'
import { shortName } from './format'
import type { Actor } from './types'

/**
 * Who may see what. One place, so the rules can be read and tested in one sitting.
 *
 * - A caseworker sees only cases assigned to them (need to know).
 * - A supervisor sees every case in the unit.
 * - A referring agency sees only its own referrals, and only whether each step of the loop
 *   happened and when. Never case notes, contacts, risk scoring, history or the outcome.
 */
export type Access = 'full' | 'status-only' | 'none'

export function accessTo(a: Actor, c: CaseState): Access {
  switch (a.role) {
    case 'supervisor':
      return 'full'
    case 'caseworker':
      return c.assignedTo?.workerId === a.id ? 'full' : 'none'
    case 'police': {
      const src = c.referral.source
      return src.kind === 'agency' && src.agency === a.org ? 'status-only' : 'none'
    }
  }
}

export type Action =
  | 'assign'
  | 'approve'
  | 'complete-review'
  | 'log-contact'
  | 'write-note'
  | 'submit'
  | 'decide-match'
  | 'view-access-log'
  | 'send-referral'

export function can(a: Actor, action: Action, c?: CaseState): boolean {
  switch (action) {
    case 'assign':
    case 'approve':
    case 'complete-review':
    case 'view-access-log':
      return a.role === 'supervisor'
    case 'log-contact':
    case 'write-note':
    case 'submit':
    case 'decide-match':
      return a.role === 'caseworker' && !!c && c.assignedTo?.workerId === a.id && !isClosed(c)
    case 'send-referral':
      return a.role === 'police'
  }
}

export interface LoopStep {
  id: 'sent' | 'opened' | 'assigned' | 'child-seen' | 'safety' | 'closed'
  label: string
  at?: number
}

/** The only shape a referring agency ever receives. Built field by field, never by copying the case. */
export interface AgencyView {
  caseId: string
  sentAt: number
  sentBy: string
  children: string[]
  steps: LoopStep[]
}

export function agencyView(c: CaseState): AgencyView {
  return {
    caseId: c.id,
    sentAt: c.intakeAt,
    sentBy: actor(c.submittedBy).name,
    children: c.referral.children.map(shortName),
    steps: [
      { id: 'sent', label: 'Sent to CPS', at: c.intakeAt },
      { id: 'opened', label: 'Opened by CPS', at: firstSeenByCps(c, isCps) },
      { id: 'assigned', label: 'Caseworker assigned', at: c.assignedTo?.at },
      { id: 'child-seen', label: 'Child seen in person', at: firstFaceToFace(c)?.contactAt },
      {
        id: 'safety',
        label: 'Safety assessment done',
        at: c.approvals.safety?.status === 'approved' ? c.approvals.safety.decidedAt : undefined,
      },
      { id: 'closed', label: 'Investigation closed', at: isClosed(c) ? c.approvals.determination?.decidedAt : undefined },
    ],
  }
}
