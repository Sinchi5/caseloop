import { z } from 'zod'

const isoDateTime = z.iso.datetime({ offset: true })
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const RoleSchema = z.enum(['caseworker', 'supervisor', 'police'])
export type Role = z.infer<typeof RoleSchema>

export interface Actor {
  id: string
  name: string
  role: Role
  org: string
}

export const RiskFactorIdSchema = z.enum([
  'visible-injury',
  'threat-to-kill',
  'strangulation',
  'child-under-4',
  'infant-unsafe-sleep',
  'weapon-in-home',
  'substance-use',
  'prior-calls',
  'child-witnessed',
  'no-other-adult-contact',
])
export type RiskFactorId = z.infer<typeof RiskFactorIdSchema>

export const PersonInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  dob: isoDate,
})
export type PersonInput = z.infer<typeof PersonInputSchema>

export const PersonSchema = PersonInputSchema.extend({
  id: z.string(),
  kind: z.enum(['child', 'caregiver']),
})
export type Person = z.infer<typeof PersonSchema>

/** A person already known to the state system, with prior history. */
export interface RegistryPerson extends PersonInput {
  id: string
  address: string
  priorReports: { year: number; outcome: 'indicated' | 'unfounded' }[]
}

export const ReferralSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agency'), agency: z.string(), officerId: z.string() }),
  z.object({ kind: z.literal('hotline') }),
])
export type ReferralSource = z.infer<typeof ReferralSourceSchema>

export const ReferralSchema = z.object({
  source: ReferralSourceSchema,
  incidentAt: isoDateTime,
  address: z.string().trim().min(5, 'Enter the full address'),
  children: z.array(PersonSchema).min(1, 'Add at least one child'),
  caregivers: z.array(PersonSchema),
  riskFactors: z.array(RiskFactorIdSchema),
  narrative: z.string().trim().min(20, 'Describe what you saw in at least 20 characters').max(2000),
  /** How long the officer spent on the form, for the CARE "about six minutes" comparison. */
  formSeconds: z.number().int().nonnegative().optional(),
})
export type Referral = z.infer<typeof ReferralSchema>

export const ContactKindSchema = z.enum(['home-visit', 'school-visit', 'phone', 'collateral'])
export type ContactKind = z.infer<typeof ContactKindSchema>

export const ApprovalItemSchema = z.enum(['safety', 'determination'])
export type ApprovalItem = z.infer<typeof ApprovalItemSchema>

const base = {
  id: z.string(),
  caseId: z.string(),
  at: isoDateTime,
  actorId: z.string(),
}

/** Every change to a case is one of these, appended and never edited. */
export const CaseEventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('REFERRAL_SUBMITTED'), referral: ReferralSchema }),
  z.object({ ...base, type: z.literal('SEEN') }),
  z.object({ ...base, type: z.literal('ASSIGNED'), workerId: z.string() }),
  z.object({
    ...base,
    type: z.literal('CONTACT_LOGGED'),
    contactId: z.string(),
    contactAt: isoDateTime,
    kind: ContactKindSchema,
    with: z.string().trim().min(1),
    summary: z.string().trim(),
    photos: z.array(z.string()),
  }),
  z.object({ ...base, type: z.literal('NOTE_WRITTEN'), contactId: z.string(), text: z.string().trim().min(1) }),
  z.object({
    ...base,
    type: z.literal('SUBMITTED'),
    item: ApprovalItemSchema,
    summary: z.string().trim().min(1),
    outcome: z.enum(['indicated', 'unfounded']).optional(),
  }),
  z.object({ ...base, type: z.literal('APPROVED'), item: ApprovalItemSchema }),
  z.object({ ...base, type: z.literal('RETURNED'), item: ApprovalItemSchema, reason: z.string().trim().min(1) }),
  z.object({ ...base, type: z.literal('REVIEW_COMPLETED') }),
  z.object({
    ...base,
    type: z.literal('MATCH_DECIDED'),
    personId: z.string(),
    candidateId: z.string(),
    decision: z.enum(['same', 'different']),
  }),
])
export type CaseEvent = z.infer<typeof CaseEventSchema>
export type CaseEventType = CaseEvent['type']

export const AccessEntrySchema = z.object({
  at: isoDateTime,
  actorId: z.string(),
  caseId: z.string(),
  view: z.enum(['full', 'status-only']),
})
export type AccessEntry = z.infer<typeof AccessEntrySchema>
