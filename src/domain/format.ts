const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "3 days", "5 h", "20 min". Rounded down, so "overdue by 1 day" means at least a full day. */
export function formatSpan(ms: number): string {
  const a = Math.abs(ms)
  if (a >= 2 * DAY) return `${Math.floor(a / DAY)} days`
  if (a >= DAY) return '1 day'
  if (a >= HOUR) return `${Math.floor(a / HOUR)} h`
  return `${Math.max(1, Math.floor(a / MIN))} min`
}

export function formatWhen(t: number): string {
  return new Date(t).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDay(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatRelative(t: number, now: number): string {
  const d = t - now
  return d >= 0 ? `in ${formatSpan(d)}` : `${formatSpan(d)} ago`
}

export function age(dob: string, now: number): number {
  const b = new Date(dob + 'T00:00:00')
  const n = new Date(now)
  let years = n.getFullYear() - b.getFullYear()
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) years--
  return years
}

/** "Jaylen C." — enough for a list, less than a full name on screen. */
export const shortName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName[0]}.`
export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`
