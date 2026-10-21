import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRelative, formatWhen } from '../domain/format'
import { useStore } from '../store/context'
import { Empty, Icon } from './parts'

const ICON = { bad: 'alert', warn: 'clock', info: 'circle', good: 'check' } as const

export function Inbox() {
  const { me, notices, readAt, markRead, now } = useStore()
  // Remember what was unread when the page opened, then mark it read, so the
  // highlight survives this visit but the badge clears.
  const [seenBefore] = useState(readAt)
  useEffect(() => {
    markRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id])

  const list = notices.slice(0, 40)
  const unread = list.filter((n) => n.at > seenBefore).length

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Inbox</h1>
        <p className="sub">
          {unread ? `${unread} new since you last looked` : 'Nothing new since you last looked'} · {me.name}
        </p>
      </div>
      <p className="hint">
        {me.role === 'police'
          ? 'You are told when CPS opens, assigns, sees the child, finishes the safety assessment and closes each of your referrals, and if a referral sits unopened.'
          : 'You are told when work is assigned to you, sent to you, approved or returned, and before each deadline. Nobody has to remember to send these: they come from what happened in the case.'}
      </p>
      {list.length ? (
        <ul className="inbox">
          {list.map((n) => (
            <li key={n.id} className={`notice tone-${n.tone} ${n.at > seenBefore ? 'unread' : ''}`}>
              <Link to={`/cases/${n.caseId}`}>
                <span className="notice-icon"><Icon name={ICON[n.tone]} /></span>
                <span className="notice-text">
                  {n.at > seenBefore && <span className="sr-only">New: </span>}
                  {n.text}
                </span>
                <time dateTime={new Date(n.at).toISOString()} title={formatWhen(n.at)}>{formatRelative(n.at, now)}</time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing yet.</Empty>
      )}
    </div>
  )
}
