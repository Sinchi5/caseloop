import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { formatSpan, formatWhen } from '../domain/format'
import { accessTo, agencyView } from '../domain/policy'
import { RISK_FACTORS } from '../domain/risk'
import { ReferralSchema, type PersonInput, type RiskFactorId } from '../domain/types'
import { useStore } from '../store/context'
import { homeFor } from './routes'
import { Empty, Icon, LoopSteps, Section } from './parts'

export function Referrals() {
  const { me, cases, now } = useStore()
  const [params] = useSearchParams()
  if (me.role !== 'police') return <Navigate to={homeFor(me.role)} replace />

  const views = cases
    .filter((c) => accessTo(me, c) === 'status-only')
    .map(agencyView)
    .sort((a, b) => b.sentAt - a.sentAt)
  const sent = params.get('sent')
  const secs = Number(params.get('secs'))

  return (
    <div className="page narrow">
      <div className="page-head row-between">
        <div>
          <h1>My referrals</h1>
          <p className="sub">{me.org} · {me.name}</p>
        </div>
        <Link className="btn" to="/referrals/new">New referral</Link>
      </div>

      {sent && (
        <div className="banner tone-good" role="status">
          <Icon name="check" />
          <p>
            {sent} sent to Northfield County CPS. You will see each step below as it happens.
            {secs > 0 && ` The form took ${Math.floor(secs / 60)} min ${secs % 60} s.`}
          </p>
        </div>
      )}

      <p className="hint">
        For each referral you can see whether CPS opened it, assigned it, saw the child, finished the safety assessment and closed it.
        You do not see case notes, staff names or the outcome.
      </p>

      {views.length ? (
        <ul className="cards">
          {views.map((v) => {
            const pending = v.steps.find((s) => s.at === undefined)
            const prev = pending ? v.steps[v.steps.indexOf(pending) - 1] : undefined
            return (
              <li key={v.caseId} className="card">
                <Link to={`/cases/${v.caseId}`} className="card-link">
                  <div className="card-top">
                    <span className="case-id">{v.caseId}</span>
                    <span className="case-kids">{v.children.join(', ')}</span>
                    <span className="muted small">Sent {formatWhen(v.sentAt)}</span>
                  </div>
                  <LoopSteps steps={v.steps} now={now} compact />
                  <p className={`next-line ${pending?.id === 'opened' && now - v.sentAt > 2 * 3_600_000 ? 'text-bad' : ''}`}>
                    {pending ? `Waiting for: ${pending.label} (${formatSpan(now - (prev?.at ?? v.sentAt))})` : 'Loop closed.'}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>No referrals yet.</Empty>
      )}
    </div>
  )
}

type Errors = Partial<Record<string, string>>
const blank = (): PersonInput => ({ firstName: '', lastName: '', dob: '' })

export function NewReferral() {
  const { me, cases, now, record } = useStore()
  const navigate = useNavigate()
  const started = useRef(0)
  const [children, setChildren] = useState<PersonInput[]>([blank()])
  const [caregivers, setCaregivers] = useState<PersonInput[]>([blank()])
  const [risk, setRisk] = useState<RiskFactorId[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const errorSummary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    started.current = Date.now() // the clock for "the form took N minutes" starts when the form opens
  }, [])

  useEffect(() => {
    if (Object.keys(errors).length) errorSummary.current?.focus()
  }, [errors])

  if (me.role !== 'police') return <Navigate to={homeFor(me.role)} replace />

  const nextId = () => {
    const max = Math.max(...cases.map((c) => Number(c.id.replace(/\D/g, '')) || 0))
    return `NC-${String(max + 1).padStart(4, '0')}`
  }

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const caseId = nextId()
    const secs = Math.round((Date.now() - started.current) / 1000)
    const incident = Date.parse(String(f.get('incidentAt')))
    const candidate = {
      source: { kind: 'agency', agency: me.org, officerId: me.id },
      incidentAt: Number.isNaN(incident) ? '' : new Date(incident).toISOString(),
      address: String(f.get('address')),
      children: children.map((p, i) => ({ ...p, id: `${caseId}-c${i + 1}`, kind: 'child' })),
      caregivers: caregivers
        .filter((p) => p.firstName || p.lastName || p.dob)
        .map((p, i) => ({ ...p, id: `${caseId}-g${i + 1}`, kind: 'caregiver' })),
      riskFactors: risk,
      narrative: String(f.get('narrative')),
      formSeconds: secs,
    }
    const parsed = ReferralSchema.safeParse(candidate)
    if (!parsed.success) {
      const errs: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        errs[key] ??= key === 'incidentAt' ? 'Enter when it happened' : issue.message
      }
      setErrors(errs)
      return
    }
    record({ type: 'REFERRAL_SUBMITTED', caseId, referral: parsed.data })
    navigate(`/referrals?sent=${caseId}&secs=${secs}`)
  }

  const err = (k: string) =>
    // Inside the label for layout, but hidden from the label's name: screen readers get it once,
    // through aria-describedby, instead of hearing it as part of the field's name.
    errors[k] ? <span className="field-error" id={`err-${k}`} aria-hidden="true">{errors[k]}</span> : null
  const described = (k: string) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `err-${k}` } : {})

  const personRows = (
    list: PersonInput[],
    set: (x: PersonInput[]) => void,
    prefix: 'children' | 'caregivers',
    noun: string,
  ) => (
    <fieldset className="people-fields">
      <legend>{prefix === 'children' ? 'Children' : 'Caregivers'}</legend>
      {list.map((p, i) => (
        <div className="form-row three" key={i}>
          {(['firstName', 'lastName', 'dob'] as const).map((field) => {
            const key = `${prefix}.${i}.${field}`
            return (
              <label key={field}>
                {field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : 'Date of birth'}
                <input
                  type={field === 'dob' ? 'date' : 'text'}
                  value={p[field]}
                  max={field === 'dob' ? new Date(now).toISOString().slice(0, 10) : undefined}
                  onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)))}
                  {...described(key)}
                />
                {err(key)}
              </label>
            )
          })}
        </div>
      ))}
      {err(prefix)}
      <button type="button" className="btn small secondary" onClick={() => set([...list, blank()])}>
        Add another {noun}
      </button>
    </fieldset>
  )

  return (
    <div className="page narrow">
      <p className="crumb"><Link to="/referrals">My referrals</Link> /</p>
      <h1>New referral to CPS</h1>
      <p className="sub">Goes straight to Northfield County CPS intake. You will see when they open it.</p>

      {Object.keys(errors).length > 0 && (
        <div className="banner tone-bad" role="alert" tabIndex={-1} ref={errorSummary}>
          <Icon name="alert" />
          <p>Fix {Object.keys(errors).length} thing{Object.keys(errors).length > 1 ? 's' : ''} below before sending.</p>
        </div>
      )}

      <form className="form referral-form" onSubmit={submit} noValidate>
        <Section title="Where and when" id="where">
          <div className="form-row">
            <label>
              When it happened
              <input type="datetime-local" name="incidentAt" {...described('incidentAt')} />
              {err('incidentAt')}
            </label>
            <label>
              Address
              <input name="address" autoComplete="off" {...described('address')} />
              {err('address')}
            </label>
          </div>
        </Section>

        <Section title="People" id="who">
          {personRows(children, setChildren, 'children', 'child')}
          {personRows(caregivers, setCaregivers, 'caregivers', 'caregiver')}
        </Section>

        <Section title="What you saw" id="risk">
          <fieldset className="checks">
            <legend>Check everything that applies</legend>
            {RISK_FACTORS.map((rf) => (
              <label key={rf.id} className="check">
                <input
                  type="checkbox"
                  checked={risk.includes(rf.id)}
                  onChange={(e) => setRisk(e.target.checked ? [...risk, rf.id] : risk.filter((x) => x !== rf.id))}
                />
                {rf.label}
              </label>
            ))}
          </fieldset>
          <p className="hint">Illustrative list for this prototype, not a validated screening tool.</p>
          <label>
            In your own words
            <textarea name="narrative" rows={4} {...described('narrative')} />
            {err('narrative')}
          </label>
        </Section>

        <div className="btns">
          <button className="btn" type="submit">Send to CPS</button>
          <Link className="btn secondary" to="/referrals">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
