import MatterConversation from './MatterConversation'
import { useState } from 'react'
import { CheckCircle2, Circle, Clock3 } from 'lucide-react'
import { sharedJourneyHeaderPhases } from '../../services/sharedMatterJourneyReader.js'
const laneLabels = { transfer: 'Transfer', bond: 'Bond registration', cancellation: 'Bond cancellation' }
const workflowLabels = { transfer: 'Transfer workflow', bond: 'Bond workflow', cancellation: 'Cancellation attorney workflow' }
const statuses = {
  not_started: 'Not started', in_progress: 'In progress', waiting: 'Waiting', blocked: 'Blocked',
  completed: 'Completed', completed_externally: 'Completed externally', not_applicable: 'Not applicable',
}

export default function SharedLegalJourney({ result, showConversation = false, conversationRequiresPortal = false, horizontal = false }) {
  const [selectedPhases, setSelectedPhases] = useState({})
  if (!result || result.status !== 'ready') {
    return <section aria-label="Legal journey" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Legal journey unavailable. Refresh to try again.
    </section>
  }
  const journey = result.snapshot
  if (!journey.lanes.length) return <p className="p-4 text-sm text-slate-600">No legal workflow has been set up yet.</p>
  return <section aria-label="Legal journey" data-shared-legal-revision={journey.revision} className={horizontal ? 'space-y-5' : 'space-y-4 rounded-xl border border-slate-200 bg-white p-4'}>
    {!horizontal ? <div className="flex justify-between gap-4">
      <h2 className="font-semibold text-slate-900">Legal journey</h2>
      <span className="text-sm text-slate-600">{journey.legalProgress.percent === null ? 'No applicable tasks' : `${journey.legalProgress.percent}% complete`}</span>
    </div> : null}
    {journey.lanes.map(lane => {
      const complete = phase => phase.progress.applicableCount > 0 && phase.progress.completedCount === phase.progress.applicableCount
      const attorneyPhases = sharedJourneyHeaderPhases(result, lane.key)
      const currentPhase = attorneyPhases.find(phase => phase.hasCurrentTask)
        || lane.phases[0]
      const selectedPhase = lane.phases.find(phase => phase.key === selectedPhases[lane.key]) || currentPhase
      const taskList = phase => <ul className="divide-y divide-slate-100 border-t border-slate-100 px-3">
        {phase.tasks.map(task => <li key={task.id} data-task-id={task.id} data-task-key={task.key} data-task-status={task.status} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span>{task.label}</span><span className={task.status === 'blocked' ? 'text-amber-800' : 'text-slate-600'}>{statuses[task.status]}</span>
        </li>)}
      </ul>
      return <section key={lane.key} aria-label={laneLabels[lane.key]} className={horizontal ? 'space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm' : 'space-y-3'}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{horizontal ? workflowLabels[lane.key] : laneLabels[lane.key]}</h3>
        <span className="text-sm font-medium text-emerald-800">{lane.progress.completedCount}/{lane.progress.applicableCount} complete</span>
      </header>
      {horizontal ? <>
        <nav aria-label={`${laneLabels[lane.key]} phases`} className="overflow-x-auto rounded-lg border border-slate-200 p-3">
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${Math.max(lane.phases.length, 1)}, minmax(160px, 1fr))` }}>
            <div aria-hidden="true" className="absolute left-20 right-20 top-6 h-px bg-slate-200" />
            {attorneyPhases.map(phase => {
              const done = complete(phase)
              const current = phase.key === currentPhase?.key && !done
              const Icon = done ? CheckCircle2 : current ? Clock3 : Circle
              return <button key={phase.key} type="button" aria-pressed={phase.key === selectedPhase?.key} aria-current={current ? 'step' : undefined}
                onClick={() => setSelectedPhases(previous => ({ ...previous, [lane.key]: phase.key }))}
                className={`relative flex min-w-0 flex-col items-center rounded-lg px-3 py-2 text-center transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${phase.key === selectedPhase?.key ? 'bg-emerald-50' : ''}`}>
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white ${done ? 'border-emerald-600 text-emerald-700' : current ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-400'}`}><Icon size={16} /></span>
                <strong className="mt-2 text-sm font-semibold text-slate-900">{phase.label}</strong>
                <span className="mt-1 text-xs text-slate-600">{phase.progress.completedCount}/{phase.progress.applicableCount} complete</span>
                <span className="mt-1 text-xs text-slate-500">{phase.status === 'not_started' ? 'Pending' : statuses[phase.status]}</span>
              </button>
            })}
          </div>
        </nav>
        {selectedPhase ? <section aria-label={`${laneLabels[lane.key]} · ${selectedPhase.label}`} className="rounded-lg border border-slate-200">
          <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <h4 className="text-sm font-semibold text-slate-900">{selectedPhase.label}</h4>
            <span className="text-xs text-slate-600">{selectedPhase.progress.completedCount}/{selectedPhase.progress.applicableCount} complete{selectedPhase.progress.notApplicableCount > 0 ? ` · ${selectedPhase.progress.notApplicableCount} N/A` : ''}</span>
          </header>
          {taskList(selectedPhase)}
        </section> : null}
      </> : lane.phases.map(phase => <details key={phase.key} className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-slate-800">
          {phase.label} <span className="ml-2 text-slate-500">{phase.progress.completedCount}/{phase.progress.applicableCount} complete</span>
          {phase.progress.notApplicableCount > 0 ? <span className="ml-2 text-slate-500">· {phase.progress.notApplicableCount} N/A</span> : null}
        </summary>
        {taskList(phase)}
      </details>)}
    </section>})}
    {showConversation ? <MatterConversation transactionId={journey.transactionId} revision={journey.revision} requirePortal={conversationRequiresPortal} /> : null}
  </section>
}
