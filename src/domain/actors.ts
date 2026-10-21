import type { Actor } from './types'

export const CPS_ORG = 'Northfield County CPS'

export const ACTORS: readonly Actor[] = [
  { id: 'w-rivera', name: 'Maria Rivera', role: 'caseworker', org: CPS_ORG },
  { id: 'w-chen', name: 'James Chen', role: 'caseworker', org: CPS_ORG },
  { id: 'w-okafor', name: 'Dana Okafor', role: 'caseworker', org: CPS_ORG },
  { id: 's-brooks', name: 'Lena Brooks', role: 'supervisor', org: CPS_ORG },
  { id: 'p-nguyen', name: 'Officer Tran Nguyen', role: 'police', org: 'Northfield Police Dept.' },
  { id: 'p-alvarez', name: 'Sgt. Rosa Alvarez', role: 'police', org: 'Kessler Township Police' },
]

const byId = new Map(ACTORS.map((a) => [a.id, a]))

export function actor(id: string): Actor {
  const a = byId.get(id)
  if (!a) throw new Error(`Unknown actor ${id}`)
  return a
}

export const actorName = (id: string) => byId.get(id)?.name ?? 'Unknown user'
export const isCps = (id: string) => byId.get(id)?.org === CPS_ORG
export const caseworkers = () => ACTORS.filter((a) => a.role === 'caseworker')

export const ROLE_LABEL = { caseworker: 'Caseworker', supervisor: 'CPS supervisor', police: 'Police officer' } as const
