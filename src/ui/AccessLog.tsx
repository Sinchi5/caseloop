import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { actor } from '../domain/actors'
import { formatWhen } from '../domain/format'
import { can } from '../domain/policy'
import { useStore } from '../store/context'
import { homeFor } from './routes'
import { Empty } from './parts'

export function AccessLog() {
  const { me, access } = useStore()
  const [caseId, setCaseId] = useState('')
  if (!can(me, 'view-access-log')) return <Navigate to={homeFor(me.role)} replace />

  const ids = [...new Set(access.map((a) => a.caseId))].sort()
  const rows = access.filter((a) => !caseId || a.caseId === caseId).slice().reverse()

  return (
    <div className="page">
      <div className="page-head">
        <h1>Access log</h1>
        <p className="sub">Every time anyone opens a case, including officers checking status. Nothing here can be edited.</p>
      </div>
      <label className="filter">
        Case
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="">All cases</option>
          {ids.map((id) => <option key={id}>{id}</option>)}
        </select>
      </label>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Organization</th>
                <th scope="col">Case</th>
                <th scope="col">What they saw</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const who = actor(a.actorId)
                return (
                  <tr key={i}>
                    <td>{formatWhen(Date.parse(a.at))}</td>
                    <td>{who.name}</td>
                    <td>{who.org}</td>
                    <td><Link to={`/cases/${a.caseId}`}>{a.caseId}</Link></td>
                    <td>{a.view === 'full' ? 'Full case' : 'Status only'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No one has opened a case yet in this demo. Switch to a caseworker or officer and open one; it will show up here.</Empty>
      )}
    </div>
  )
}
