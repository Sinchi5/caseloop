import { createContext, useContext } from 'react'
import type { CaseState } from '../domain/caseState'
import type { Notice } from '../domain/notifications'
import type { AccessEntry, Actor, CaseEvent } from '../domain/types'

/** Distributive Omit, so each event type keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewEvent = DistributiveOmit<CaseEvent, 'id' | 'at' | 'actorId'>

export interface Store {
  now: number
  me: Actor
  notices: Notice[]
  /** When the current person last opened their inbox. */
  readAt: number
  markRead: () => void
  cases: CaseState[]
  caseById: (id: string) => CaseState | undefined
  access: AccessEntry[]
  offsetDays: number
  record: (e: NewEvent) => void
  logAccess: (caseId: string, view: AccessEntry['view']) => void
  setActor: (id: string) => void
  advanceDay: () => void
  reset: () => void
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
