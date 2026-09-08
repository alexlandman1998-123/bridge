import MatterConversation from './MatterConversation'
const laneLabels = { transfer: 'Transfer', bond: 'Bond registration', cancellation: 'Bond cancellation' }
const statuses = {
  not_started: 'Not started', in_progress: 'In progress', waiting: 'Waiting', blocked: 'Blocked',
  completed: 'Completed', completed_externally: 'Completed externally', not_applicable: 'Not applicable',
}

export default function SharedLegalJourney({ result, showConversation = false, conversationRequiresPortal = false }) {
  if (!result || result.status !== 'ready') {
    return <section aria-label="Legal journey" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Legal journey unavailable. Refresh to try again.
    </section>
  }
  const journey = result.snapshot
  if (!journey.lanes.length) return <p className="p-4 text-sm text-slate-600">No legal workflow has been set up yet.</p>
  return <section aria-label="Legal journey" data-shared-legal-revision={journey.revision} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex justify-between gap-4">
      <h2 className="font-semibold text-slate-900">Legal journey</h2>
      <span className="text-sm text-slate-600">{journey.legalProgress.percent === null ? 'No applicable tasks' : `${journey.legalProgress.percent}% complete`}</span>
    </div>
    {journey.lanes.map(lane => <section key={lane.key} aria-label={laneLabels[lane.key]} className="space-y-2">
      <h3 className="text-sm font-semibold text-emerald-800">{laneLabels[lane.key]} · {lane.progress.completedCount}/{lane.progress.applicableCount} complete</h3>
      {lane.phases.map(phase => <details key={phase.key} className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-slate-800">
          {phase.label} <span className="ml-2 text-slate-500">{phase.progress.completedCount}/{phase.progress.applicableCount} complete</span>
          {phase.progress.notApplicableCount > 0 ? <span className="ml-2 text-slate-500">· {phase.progress.notApplicableCount} N/A</span> : null}
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 px-3">
          {phase.tasks.map(task => <li key={task.id} data-task-id={task.id} data-task-status={task.status} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span>{task.label}</span><span className={task.status === 'blocked' ? 'text-amber-800' : 'text-slate-600'}>{statuses[task.status]}</span>
          </li>)}
        </ul>
      </details>)}
    </section>)}
    {showConversation ? <MatterConversation transactionId={journey.transactionId} revision={journey.revision} requirePortal={conversationRequiresPortal} /> : null}
  </section>
}
