import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ACTORS, ROLE_LABEL } from '../domain/actors'
import { formatWhen } from '../domain/format'
import type { Role } from '../domain/types'
import { useStore } from '../store/context'
import { REPO_URL, homeFor } from './routes'

const NAV: Record<Role, { to: string; label: string }[]> = {
  caseworker: [{ to: '/cases', label: 'My cases' }],
  supervisor: [
    { to: '/unit', label: 'Unit overview' },
    { to: '/access-log', label: 'Access log' },
  ],
  police: [
    { to: '/referrals', label: 'My referrals' },
    { to: '/referrals/new', label: 'New referral' },
  ],
}

export function Layout() {
  const { me, now, offsetDays, setActor, advanceDay, reset } = useStore()
  const navigate = useNavigate()

  return (
    <div className="app">
      <div className="demo-bar" role="region" aria-label="Demo controls">
        <div className="demo-inner">
          <span className="demo-tag">Demo</span>
          <label className="demo-field">
            <span>Viewing as</span>
            <select
              value={me.id}
              onChange={(e) => {
                const next = ACTORS.find((a) => a.id === e.target.value)!
                setActor(next.id)
                navigate(homeFor(next.role))
              }}
            >
              {(['caseworker', 'supervisor', 'police'] as const).map((role) => (
                <optgroup key={role} label={ROLE_LABEL[role]}>
                  {ACTORS.filter((a) => a.role === role).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {role === 'police' ? `, ${a.org}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <span className="demo-clock" aria-live="polite">
            {formatWhen(now)}
            {offsetDays > 0 && <span className="demo-offset"> (+{offsetDays} day{offsetDays > 1 ? 's' : ''})</span>}
          </span>
          <button type="button" className="demo-btn" onClick={advanceDay}>
            Skip ahead 1 day
          </button>
          <button
            type="button"
            className="demo-btn ghost"
            onClick={() => {
              reset()
              navigate(homeFor(me.role))
            }}
          >
            Reset demo
          </button>
        </div>
      </div>

      <header className="top">
        <div className="top-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 3a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M2 3.5l1.6 4.4 4.3-1.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            CaseLoop
          </NavLink>
          <nav aria-label="Main">
            {NAV[me.role].map((n) => (
              <NavLink key={n.to} to={n.to} end>
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/" end>
              About
            </NavLink>
          </nav>
          <div className="whoami">
            <span className="who-name">{me.name}</span>
            <span className="who-org">{me.org}</span>
          </div>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <footer className="foot">
        <div className="foot-inner">
          Prototype by Anthony Sinchi. All people, cases and places are made up. Not affiliated with any agency or company.{' '}
          <a href={REPO_URL}>Source on GitHub</a>
        </div>
      </footer>
    </div>
  )
}
