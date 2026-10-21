import { Link, useNavigate } from 'react-router-dom'
import { actor } from '../domain/actors'
import { useStore } from '../store/context'
import { REPO_URL, homeFor } from './routes'

const PROBLEMS: { problem: string; fix: string; see: string; caseId?: string }[] = [
  {
    problem: 'Nobody gets told when something is sent for approval. The office says they never saw it, and the worker never finds out.',
    fix: 'Submissions show as “waiting on supervisor” on both sides with a running timer. Returns come back with a reason. Every step is in an append-only history.',
    see: 'NC-1037 waits 2 days on a supervisor; NC-1030 was returned and nobody noticed',
    caseId: 'NC-1037',
  },
  {
    problem: 'The 7-day safety check and the 30-day midpoint are tracked by hand. A case can reach day 90 without anyone noticing.',
    fix: 'Every deadline is computed from intake, cites the law it comes from, and turns “due soon” and then “overdue” on its own.',
    see: 'NC-1033 is 2 days past its safety assessment; NC-0988 is on day 88',
    caseId: 'NC-0988',
  },
  {
    problem: 'Cases are worked in the order they arrive. Nothing is marked urgent.',
    fix: 'Each list is ordered by missed deadline, then risk, then next due date, and says why in plain words.',
    see: 'Maria Rivera’s “My cases”',
  },
  {
    problem: 'People with history show up as new, or two people get merged by mistake.',
    fix: 'Possible earlier records are matched by name, birth date and address, with the reasons shown. A worker confirms or rejects; nothing merges on its own.',
    see: 'NC-1009 (Jaylen / Jalen), NC-1042 (birth date with day and month swapped)',
    caseId: 'NC-1009',
  },
  {
    problem: 'Notes due in 3–5 days slip to 3–4 weeks. Workers handwrite first, type later, or try to remember.',
    fix: 'A visit is logged from a phone in under a minute; the full note gets its own 5-day clock and shows up in “Notes owed”.',
    see: 'NC-1021 has a school visit with no note, 4 days late',
    caseId: 'NC-1021',
  },
  {
    problem: 'Adding a photo means uploading it, opening the case, adding a note, then linking the two.',
    fix: 'Photos attach to the contact in the same step, straight from the camera.',
    see: 'Any open case → Log a contact',
  },
  {
    problem: 'Nobody is told anything. People find out by going to look, or not at all.',
    fix: 'Everyone has an inbox: assigned to you, sent to you, approved, returned with the reason, a deadline coming. It is worked out from the case history, so it can’t miss one.',
    see: 'Inbox, in the top bar for every role',
  },
  {
    problem: 'Workers keep their own lists of due dates because they can’t trust the system.',
    fix: 'The list is the system. Use “Skip ahead 1 day” in the bar above and watch it change.',
    see: 'Demo bar',
  },
]

export function Home() {
  const { setActor } = useStore()
  const navigate = useNavigate()
  const go = (id: string) => {
    setActor(id)
    navigate(homeFor(actor(id).role))
  }

  return (
    <div className="page home">
      <section className="intro">
        <p className="eyebrow">A working prototype</p>
        <h1>Close the loop on child-protection referrals.</h1>
        <p className="lede">
          When a police officer refers a child to CPS, the case passes through several hands with legal deadlines attached. CaseLoop
          follows one referral from the officer, to the supervisor, to the caseworker and back, so every deadline, handoff and
          approval is visible to the people who need it, and nothing more.
        </p>
        <div className="try">
          <span>Try it as</span>
          <button type="button" className="btn" onClick={() => go('w-rivera')}>Maria Rivera, caseworker</button>
          <button type="button" className="btn secondary" onClick={() => go('s-brooks')}>Lena Brooks, supervisor</button>
          <button type="button" className="btn secondary" onClick={() => go('p-nguyen')}>Officer Tran Nguyen, police</button>
        </div>
      </section>

      <section className="section">
        <h2>Where it comes from</h2>
        <p className="prose">
          I’m Anthony Sinchi, a CS senior at the University at Buffalo. My cousin is a CPS caseworker in New York. I asked him how a case
          really moves, from the report to the State Central Register to the day it closes, and where things fall through the cracks.
          Every feature here answers one of the problems he described. The deadlines come from New York Social Services Law §424, and
          the app labels which ones are law and which are office practice.
        </p>
        <div className="table-wrap">
          <table className="table problems">
            <thead>
              <tr>
                <th scope="col">What goes wrong today</th>
                <th scope="col">What CaseLoop does</th>
                <th scope="col">See it</th>
              </tr>
            </thead>
            <tbody>
              {PROBLEMS.map((p) => (
                <tr key={p.problem}>
                  <td>{p.problem}</td>
                  <td>{p.fix}</td>
                  <td className="see">{p.see}</td>
                </tr>
              ))}
              <tr>
                <td>The officer who made the report never learns whether anyone acted on it.</td>
                <td>The referring agency sees each step (opened, assigned, child seen, assessed, closed) with times, and never the notes, staff names or outcome.</td>
                <td className="see">Officer Tran Nguyen’s “My referrals”</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>A three-minute tour</h2>
        <ol className="tour">
          <li><strong>As Officer Nguyen</strong>, send a new referral. Notice NC-1042 from tonight still says “waiting for: opened by CPS”.</li>
          <li><strong>As Lena Brooks</strong>, open the unit overview. Assign the new report; approve the safety assessment that has waited two days.</li>
          <li><strong>As Maria Rivera</strong>, your cases are already in order of what’s late. Open the new one and log a home visit.</li>
          <li><strong>Back as Officer Nguyen</strong>, the loop now shows opened, assigned and child seen, with times.</li>
          <li>Press <strong>Skip ahead 1 day</strong> and watch deadlines move and the Inbox fill up. <strong>As Lena Brooks</strong>, open Results to see how the unit is doing, and the Access log to see who looked at what.</li>
        </ol>
      </section>

      <section className="section two-col">
        <div>
          <h2>How it’s built</h2>
          <ul className="prose-list">
            <li>Every change is an event in an append-only log; each case is rebuilt from its events. The history can’t be quietly rewritten.</li>
            <li>Deadlines are pure functions of intake time and the log, tested against the statute’s windows.</li>
            <li>One policy file decides who sees what. The officer’s view is built field by field, and a test proves no notes, names or outcome leak into it.</li>
            <li>Duplicate matching uses Jaro-Winkler name similarity plus birth-date and address rules, tested on labelled pairs, including twins and siblings.</li>
            <li>TypeScript, React, Zod, Vitest, Playwright and axe accessibility checks. Works on a phone.</li>
          </ul>
          <p><a href={REPO_URL}>Source, design doc and test plan on GitHub</a></p>
        </div>
        <div>
          <h2>What it isn’t</h2>
          <ul className="prose-list">
            <li>Not a real system. Every person, case and place is made up, and nothing leaves your browser.</li>
            <li>The risk checklist is illustrative, not a validated screening tool.</li>
            <li>No sign-in: the bar at the top lets you switch people so you can see each side.</li>
            <li>Not affiliated with any agency or company.</li>
          </ul>
          <p>
            <Link to="/cases/NC-0988" onClick={() => setActor('s-brooks')}>See the day-88 case</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
