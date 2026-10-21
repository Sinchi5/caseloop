import { HOTLINE_ID } from './actors'
import { HOUR } from './clocks'
import type { CaseEvent, Person, PersonInput, Referral, RegistryPerson, RiskFactorId } from './types'

/**
 * Made-up people and cases. Every name, address and date is invented. Each case is here to
 * show one problem from the caseworker interview, noted next to it.
 */
export const REGISTRY: readonly RegistryPerson[] = [
  { id: 'r-1', firstName: 'Jalen', lastName: 'Carter', dob: '2016-04-03', address: '14 Elm Street', priorReports: [{ year: 2024, outcome: 'indicated' }] },
  { id: 'r-2', firstName: 'Markus', lastName: 'Bell', dob: '1990-11-07', address: '220 Ridge Road', priorReports: [{ year: 2022, outcome: 'unfounded' }] },
  { id: 'r-3', firstName: 'Sofia', lastName: 'Marquez', dob: '2023-02-14', address: '9 Canal Street', priorReports: [{ year: 2023, outcome: 'unfounded' }] },
  { id: 'r-4', firstName: 'Jordan', lastName: 'Price', dob: '2012-08-30', address: '77 Hill Avenue', priorReports: [{ year: 2020, outcome: 'unfounded' }] },
  { id: 'r-5', firstName: 'Destiny', lastName: 'Ward', dob: '2015-06-21', address: '310 Lake Road', priorReports: [{ year: 2021, outcome: 'indicated' }] },
  { id: 'r-6', firstName: 'Elena', lastName: 'Ruiz', dob: '1988-03-02', address: '5 Mill Lane', priorReports: [] },
  { id: 'r-7', firstName: 'Noah', lastName: 'Grantham', dob: '2009-12-12', address: '41 Oak Court', priorReports: [{ year: 2019, outcome: 'unfounded' }] },
]

let n = 0
/** Same id scheme as the referral form: c1, c2 for children, g1, g2 for caregivers. */
const pid = (caseId: string, i: number, kind: Person['kind']): Person['id'] => `${caseId}-${kind === 'child' ? 'c' : 'g'}${i}`
const people = (caseId: string, kind: Person['kind'], list: PersonInput[]): Person[] =>
  list.map((p, i) => ({ ...p, id: pid(caseId, i + 1, kind), kind }))

export function seedEvents(now: number): CaseEvent[] {
  n = 0
  const out: CaseEvent[] = []
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString()
  const id = (caseId: string) => `${caseId}-e${++n}`

  function referral(
    caseId: string,
    hoursAgo: number,
    source: Referral['source'],
    r: { address: string; children: PersonInput[]; caregivers: PersonInput[]; risk: RiskFactorId[]; narrative: string; formSeconds?: number },
  ) {
    out.push({
      id: id(caseId),
      caseId,
      at: iso(hoursAgo),
      actorId: source.kind === 'agency' ? source.officerId : HOTLINE_ID,
      type: 'REFERRAL_SUBMITTED',
      referral: {
        source,
        incidentAt: iso(hoursAgo + 1),
        address: r.address,
        children: people(caseId, 'child', r.children),
        caregivers: people(caseId, 'caregiver', r.caregivers),
        riskFactors: r.risk,
        narrative: r.narrative,
        formSeconds: r.formSeconds,
      },
    })
  }
  const push = (caseId: string, hoursAgo: number, actorId: string, e: Record<string, unknown>) =>
    out.push({ id: id(caseId), caseId, at: iso(hoursAgo), actorId, ...e } as CaseEvent)
  const contact = (caseId: string, hoursAgo: number, actorId: string, cid: string, kind: string, withWho: string, summary: string) =>
    push(caseId, hoursAgo, actorId, { type: 'CONTACT_LOGGED', contactId: cid, contactAt: iso(hoursAgo), kind, with: withWho, summary, photos: [] })
  const note = (caseId: string, hoursAgo: number, actorId: string, cid: string, text: string) =>
    push(caseId, hoursAgo, actorId, { type: 'NOTE_WRITTEN', contactId: cid, text })

  const NPD = { kind: 'agency', agency: 'Northfield Police Dept.', officerId: 'p-nguyen' } as const
  const KPD = { kind: 'agency', agency: 'Kessler Township Police', officerId: 'p-alvarez' } as const
  const HOTLINE = { kind: 'hotline' } as const

  // NC-1042 — new tonight from police, nobody at CPS has opened it yet. Caregiver's birth date
  // has day and month swapped against a known person ("history shows up as new").
  referral('NC-1042', 3, NPD, {
    address: '220 Ridge Road',
    children: [{ firstName: 'Ava', lastName: 'Bell', dob: '2023-05-02' }],
    caregivers: [{ firstName: 'Marcus', lastName: 'Bell', dob: '1990-07-11' }, { firstName: 'Tasha', lastName: 'Bell', dob: '1993-01-19' }],
    risk: ['strangulation', 'child-under-4', 'child-witnessed'],
    narrative: 'Responded to a domestic call. Mother reports being choked by partner in front of the 3-year-old. Partner left before arrival. Child unharmed on sight, crying.',
    formSeconds: 312,
  })

  // NC-1041 — opened by the supervisor 18 hours ago and still not assigned. 24-hour clock almost out.
  referral('NC-1041', 20, HOTLINE, {
    address: '5 Mill Lane',
    children: [{ firstName: 'Mateo', lastName: 'Ruiz', dob: '2014-09-10' }],
    caregivers: [{ firstName: 'Elena', lastName: 'Ruiz', dob: '1988-03-02' }],
    risk: ['no-other-adult-contact', 'prior-calls'],
    narrative: 'Neighbor reports the 12-year-old has not been to school in three weeks and is often outside late at night alone.',
  })
  push('NC-1041', 18, 's-brooks', { type: 'SEEN' })

  // NC-1037 — safety assessment submitted two days ago; supervisor never acted. No notification existed.
  referral('NC-1037', 6 * 24 + 2, NPD, {
    address: '18 Birch Place',
    children: [{ firstName: 'Noah', lastName: 'Grant', dob: '2017-10-05' }],
    caregivers: [{ firstName: 'Kevin', lastName: 'Grant', dob: '1985-06-30' }],
    risk: ['weapon-in-home', 'substance-use'],
    narrative: 'Welfare check. Father intoxicated, unsecured handgun on kitchen table within reach of the 9-year-old.',
    formSeconds: 405,
  })
  push('NC-1037', 6 * 24 + 1, 's-brooks', { type: 'SEEN' })
  push('NC-1037', 6 * 24, 's-brooks', { type: 'ASSIGNED', workerId: 'w-rivera' })
  push('NC-1037', 6 * 24 - 1, 'w-rivera', { type: 'SEEN' })
  contact('NC-1037', 6 * 24 - 8, 'w-rivera', 'NC-1037-k1', 'home-visit', 'Noah and father', 'Gun now in a locked safe; father agreed to safety plan.')
  note('NC-1037', 5 * 24, 'w-rivera', 'NC-1037-k1', 'Home visit. Firearm secured in locked safe, key held by paternal aunt. Father engaged, agreed to outpatient assessment. Noah calm, no marks observed.')
  push('NC-1037', 2 * 24, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe with plan: firearm secured, aunt checking in daily.' })

  // NC-1033 — safety assessment two days overdue. Child matches a known person exactly.
  referral('NC-1033', 9 * 24, HOTLINE, {
    address: '310 Lake Road, Apt 4',
    children: [{ firstName: 'Destiny', lastName: 'Ward', dob: '2015-06-21' }],
    caregivers: [{ firstName: 'Monique', lastName: 'Ward', dob: '1991-09-14' }],
    risk: ['visible-injury'],
    narrative: 'School nurse reports bruising on the upper arm in the shape of a grip. Child said she "fell".',
  })
  push('NC-1033', 9 * 24 - 2, 's-brooks', { type: 'SEEN' })
  push('NC-1033', 9 * 24 - 3, 's-brooks', { type: 'ASSIGNED', workerId: 'w-rivera' })
  push('NC-1033', 9 * 24 - 5, 'w-rivera', { type: 'SEEN' })
  contact('NC-1033', 9 * 24 - 20, 'w-rivera', 'NC-1033-k1', 'school-visit', 'Destiny, school nurse', 'Bruises photographed by nurse, child interviewed.')
  note('NC-1033', 8 * 24, 'w-rivera', 'NC-1033-k1', 'Interviewed Destiny at school with nurse present. Bruising consistent with grip. Child gave two different accounts.')

  // NC-1021 — 30-day review coming up; a school visit 9 days ago still has no typed note.
  referral('NC-1021', 28 * 24, HOTLINE, {
    address: '62 Spruce Street',
    children: [{ firstName: 'Leo', lastName: 'Martin', dob: '2018-01-22' }],
    caregivers: [{ firstName: 'Rachel', lastName: 'Martin', dob: '1994-04-04' }],
    risk: ['prior-calls'],
    narrative: 'Anonymous caller reports shouting from the apartment most nights and a young child crying.',
  })
  push('NC-1021', 28 * 24 - 1, 's-brooks', { type: 'SEEN' })
  push('NC-1021', 28 * 24 - 2, 's-brooks', { type: 'ASSIGNED', workerId: 'w-rivera' })
  push('NC-1021', 28 * 24 - 3, 'w-rivera', { type: 'SEEN' })
  contact('NC-1021', 27 * 24, 'w-rivera', 'NC-1021-k1', 'home-visit', 'Leo and mother', 'Home clean, food present. Mother stressed, new job.')
  note('NC-1021', 26 * 24, 'w-rivera', 'NC-1021-k1', 'Initial home visit. No safety concerns observed. Referred mother to parenting support.')
  push('NC-1021', 23 * 24, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe. No immediate danger.' })
  push('NC-1021', 23 * 24 - 4, 's-brooks', { type: 'APPROVED', item: 'safety' })
  contact('NC-1021', 9 * 24, 'w-rivera', 'NC-1021-k2', 'school-visit', 'Leo, teacher', 'Teacher says attendance is good, Leo is doing well.')

  // NC-1009 — on track. Child likely matches a known person whose name is spelled differently.
  referral('NC-1009', 45 * 24, HOTLINE, {
    address: '14 Elm St., Apt 2',
    children: [{ firstName: 'Jaylen', lastName: 'Carter', dob: '2016-04-03' }],
    caregivers: [{ firstName: 'Brianna', lastName: 'Carter', dob: '1992-12-01' }],
    risk: ['child-witnessed', 'prior-calls'],
    narrative: 'Child told a coach that his mom’s boyfriend hits her and he hides in the closet.',
  })
  push('NC-1009', 45 * 24 - 1, 's-brooks', { type: 'SEEN' })
  push('NC-1009', 45 * 24 - 2, 's-brooks', { type: 'ASSIGNED', workerId: 'w-rivera' })
  push('NC-1009', 45 * 24 - 3, 'w-rivera', { type: 'SEEN' })
  contact('NC-1009', 44 * 24, 'w-rivera', 'NC-1009-k1', 'home-visit', 'Jaylen and mother', 'Boyfriend moved out per mother. Order of protection filed.')
  note('NC-1009', 42 * 24, 'w-rivera', 'NC-1009-k1', 'Home visit. Mother confirms boyfriend moved out; she filed for an order of protection. Jaylen calm and talkative.')
  push('NC-1009', 40 * 24, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe. Offending adult out of the home.' })
  push('NC-1009', 39 * 24, 's-brooks', { type: 'APPROVED', item: 'safety' })
  push('NC-1009', 16 * 24, 's-brooks', { type: 'REVIEW_COMPLETED' })
  contact('NC-1009', 2 * 24, 'w-rivera', 'NC-1009-k2', 'phone', 'Mother', 'Order of protection granted.')

  // NC-0988 — day 88, determination 28 days late, and nobody noticed.
  referral('NC-0988', 88 * 24, HOTLINE, {
    address: '9 Canal Street',
    children: [{ firstName: 'Sofia', lastName: 'Marquez', dob: '2023-02-14' }],
    caregivers: [{ firstName: 'Luis', lastName: 'Marquez', dob: '1987-08-08' }],
    risk: ['child-under-4'],
    narrative: 'Pediatrician reports missed appointments and weight loss over six months.',
  })
  push('NC-0988', 88 * 24 - 2, 's-brooks', { type: 'SEEN' })
  push('NC-0988', 88 * 24 - 3, 's-brooks', { type: 'ASSIGNED', workerId: 'w-chen' })
  push('NC-0988', 88 * 24 - 4, 'w-chen', { type: 'SEEN' })
  push('NC-0988', 87 * 24, 'w-chen', { type: 'MATCH_DECIDED', personId: 'NC-0988-c1', candidateId: 'r-3', decision: 'same' })
  contact('NC-0988', 87 * 24, 'w-chen', 'NC-0988-k1', 'home-visit', 'Sofia and father', 'Feeding plan with pediatrician started.')
  note('NC-0988', 86 * 24, 'w-chen', 'NC-0988-k1', 'Home visit. Father overwhelmed after job loss. Linked to WIC and pediatric nutrition clinic.')
  push('NC-0988', 83 * 24, 'w-chen', { type: 'SUBMITTED', item: 'safety', summary: 'Safe with services.' })
  push('NC-0988', 82 * 24, 's-brooks', { type: 'APPROVED', item: 'safety' })
  push('NC-0988', 58 * 24, 's-brooks', { type: 'REVIEW_COMPLETED' })

  // NC-1030 — safety assessment returned with a reason; the worker never saw it. Now overdue.
  referral('NC-1030', 12 * 24, NPD, {
    address: '77 Hill Avenue',
    children: [{ firstName: 'Jordan', lastName: 'Pryce', dob: '2012-08-30' }],
    caregivers: [{ firstName: 'Angela', lastName: 'Pryce', dob: '1980-02-27' }],
    risk: ['prior-calls', 'substance-use'],
    narrative: 'Third call this month. Mother passed out in the car with the engine running; 14-year-old called 911.',
    formSeconds: 288,
  })
  push('NC-1030', 12 * 24 - 1, 's-brooks', { type: 'SEEN' })
  push('NC-1030', 12 * 24 - 2, 's-brooks', { type: 'ASSIGNED', workerId: 'w-chen' })
  push('NC-1030', 12 * 24 - 6, 'w-chen', { type: 'SEEN' })
  contact('NC-1030', 11 * 24, 'w-chen', 'NC-1030-k1', 'home-visit', 'Jordan and mother', 'Mother agreed to detox intake. Grandmother staying over.')
  note('NC-1030', 10 * 24, 'w-chen', 'NC-1030-k1', 'Home visit. Mother acknowledges alcohol use, agreed to detox intake Monday. Maternal grandmother staying in the home.')
  push('NC-1030', 6 * 24, 'w-chen', { type: 'SUBMITTED', item: 'safety', summary: 'Safe with grandmother in the home.' })
  push('NC-1030', 5 * 24, 's-brooks', { type: 'RETURNED', item: 'safety', reason: 'Add the school contact before I can approve.' })

  // NC-0970 — closed on time. The referring officer can see the loop closed.
  referral('NC-0970', 70 * 24, NPD, {
    address: '4 Harbor View',
    children: [{ firstName: 'Mia', lastName: 'Lopez', dob: '2023-07-07' }],
    caregivers: [{ firstName: 'Carlos', lastName: 'Lopez', dob: '1989-05-15' }],
    risk: ['child-under-4'],
    narrative: 'Toddler found alone in a parked car outside a store for about 15 minutes.',
    formSeconds: 251,
  })
  push('NC-0970', 70 * 24 - 1, 's-brooks', { type: 'SEEN' })
  push('NC-0970', 70 * 24 - 2, 's-brooks', { type: 'ASSIGNED', workerId: 'w-rivera' })
  push('NC-0970', 70 * 24 - 3, 'w-rivera', { type: 'SEEN' })
  contact('NC-0970', 69 * 24, 'w-rivera', 'NC-0970-k1', 'home-visit', 'Mia and father', 'One-time lapse; father remorseful.')
  note('NC-0970', 68 * 24, 'w-rivera', 'NC-0970-k1', 'Home visit. Isolated incident, no other concerns. Safety education given.')
  push('NC-0970', 66 * 24, 'w-rivera', { type: 'SUBMITTED', item: 'safety', summary: 'Safe.' })
  push('NC-0970', 65 * 24, 's-brooks', { type: 'APPROVED', item: 'safety' })
  push('NC-0970', 40 * 24, 's-brooks', { type: 'REVIEW_COMPLETED' })
  push('NC-0970', 16 * 24, 'w-rivera', { type: 'SUBMITTED', item: 'determination', outcome: 'unfounded', summary: 'Isolated lapse, no ongoing risk.' })
  push('NC-0970', 15 * 24, 's-brooks', { type: 'APPROVED', item: 'determination' })

  // NC-1040 — another agency's referral, on track. Northfield officers must not see it.
  referral('NC-1040', 2 * 24, KPD, {
    address: '12 Quarry Road',
    children: [{ firstName: 'Eli', lastName: 'Foster', dob: '2016-11-11' }, { firstName: 'Nora', lastName: 'Foster', dob: '2021-03-03' }],
    caregivers: [{ firstName: 'Dana', lastName: 'Foster', dob: '1990-10-10' }],
    risk: ['child-witnessed', 'weapon-in-home'],
    narrative: 'Argument between parents, father displayed a knife. Both children present.',
    formSeconds: 365,
  })
  push('NC-1040', 2 * 24 - 1, 's-brooks', { type: 'SEEN' })
  push('NC-1040', 2 * 24 - 1.5, 's-brooks', { type: 'ASSIGNED', workerId: 'w-okafor' })
  push('NC-1040', 2 * 24 - 2, 'w-okafor', { type: 'SEEN' })
  contact('NC-1040', 2 * 24 - 9, 'w-okafor', 'NC-1040-k1', 'home-visit', 'Eli, Nora, mother', 'Father staying with his brother.')
  note('NC-1040', 30, 'w-okafor', 'NC-1040-k1', 'Home visit. Father out of the home voluntarily. Both children seen, no injuries.')

  return out
}

