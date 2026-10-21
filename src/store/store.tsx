import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { actor } from '../domain/actors'
import { deriveCases } from '../domain/caseState'
import { DAY } from '../domain/clocks'
import { seedEvents } from '../domain/seed'
import { AccessEntrySchema, CaseEventSchema, type AccessEntry, type CaseEvent } from '../domain/types'
import { StoreContext, type NewEvent, type Store } from './context'
import { photoPreviews } from './photos'

const KEY = 'caseloop:v1'

const SavedSchema = z.object({
  v: z.literal(1),
  events: z.array(CaseEventSchema),
  access: z.array(AccessEntrySchema),
  offsetMs: z.number(),
  actorId: z.string(),
})
type Saved = z.infer<typeof SavedSchema>

function fresh(actorId = 'w-rivera'): Saved {
  return { v: 1, events: seedEvents(Date.now()), access: [], offsetMs: 0, actorId }
}

/** Saved demo state is validated, never trusted: anything that does not parse starts over. */
function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = SavedSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    }
  } catch {
    // storage blocked or corrupt: fall through to a fresh demo
  }
  return fresh()
}

type Msg =
  | { t: 'append'; e: CaseEvent }
  | { t: 'access'; entry: AccessEntry }
  | { t: 'actor'; id: string }
  | { t: 'advance'; ms: number }
  | { t: 'reset' }

function reducer(s: Saved, m: Msg): Saved {
  switch (m.t) {
    case 'append':
      return { ...s, events: [...s.events, m.e] }
    case 'access':
      return { ...s, access: [...s.access, m.entry] }
    case 'actor':
      return { ...s, actorId: m.id }
    case 'advance':
      return { ...s, offsetMs: s.offsetMs + m.ms }
    case 'reset':
      return fresh(s.actorId)
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, load)
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // private window or full storage: the demo still works for this visit
    }
  }, [s])

  const now = tick + s.offsetMs
  const cases = useMemo(() => deriveCases(s.events), [s.events])
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])

  const record = useCallback(
    (e: NewEvent) => {
      const full = { ...e, id: crypto.randomUUID(), at: new Date(Date.now() + s.offsetMs).toISOString(), actorId: s.actorId }
      dispatch({ t: 'append', e: CaseEventSchema.parse(full) })
    },
    [s.offsetMs, s.actorId],
  )

  const logAccess = useCallback(
    (caseId: string, view: AccessEntry['view']) => {
      const at = Date.now() + s.offsetMs
      const last = s.access.at(-1)
      // React dev mode mounts twice; one person opening one case once is one entry.
      if (last && last.caseId === caseId && last.actorId === s.actorId && at - Date.parse(last.at) < 5_000) return
      dispatch({ t: 'access', entry: { at: new Date(at).toISOString(), actorId: s.actorId, caseId, view } })
    },
    [s.offsetMs, s.actorId, s.access],
  )

  const value: Store = {
    now,
    me: actor(s.actorId),
    cases,
    caseById: (id) => byId.get(id),
    access: s.access,
    offsetDays: Math.round(s.offsetMs / DAY),
    record,
    logAccess,
    setActor: (id) => dispatch({ t: 'actor', id }),
    advanceDay: () => dispatch({ t: 'advance', ms: DAY }),
    reset: () => {
      photoPreviews.clear()
      dispatch({ t: 'reset' })
    },
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
