import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock3 } from 'lucide-react'
import { getTransferStageEntryTask } from '../../../core/transactions/transferWorkspaceNavigation.js'
import { isAttorneyTaskResolved } from '../../../core/transactions/attorneyTaskOutcomes.js'

function attentionCount(phase) {
  return (phase.tasks || []).filter((task) => !isAttorneyTaskResolved(task.status) && (
    task.displayStatus === 'blocked' || task.isOverdue || task.missingDocumentCount > 0
  )).length
}

function attentionLabel(count) {
  return `${count} task${count === 1 ? ' needs' : 's need'} attention`
}

function taskIcon(task) {
  if (['completed', 'completed_externally'].includes(task.displayStatus)) return <CheckCircle2 size={20} className="text-emerald-700" />
  if (task.displayStatus === 'blocked') return <AlertTriangle size={20} className="text-rose-700" />
  if (task.displayStatus === 'waiting') return <Clock3 size={20} className="text-amber-700" />
  return <Circle size={20} className="text-slate-400" />
}

export default function TransferStageOverview({ phases = [], selectedPhase = null, onSelectStage, onOpenStage }) {
  if (!selectedPhase) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status">No transfer stages are available for this matter yet.</section>
  }

  const selectedIndex = phases.findIndex((phase) => phase.key === selectedPhase.key)
  const entryTask = getTransferStageEntryTask(selectedPhase)
  const stageAttention = attentionCount(selectedPhase)

  return <section className="grid items-start gap-5 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]" aria-label="Transfer stage overview">
    <nav className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)] xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto" aria-label="Transfer stages">
      <div className="border-b border-slate-100 px-5 py-5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">Attorney workflow</span>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Transfer Attorney</h2>
        <p className="mt-1 text-sm text-slate-500">{phases.length} stage{phases.length === 1 ? '' : 's'} in this matter</p>
      </div>
      <ol className="flex gap-2 overflow-x-auto p-3 xl:block xl:space-y-2 xl:overflow-visible">
        {phases.map((phase, index) => {
          const selected = phase.key === selectedPhase.key
          const needsAttention = attentionCount(phase)
          return <li key={phase.key} className="min-w-[230px] flex-1 xl:min-w-0">
            <button type="button" onClick={() => onSelectStage?.(phase.key)} aria-current={selected ? 'step' : undefined} className={`relative flex w-full items-start gap-3 rounded-xl border px-3 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${selected ? 'border-emerald-300 bg-emerald-50/70 text-slate-950' : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'}`}>
              <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${phase.status === 'completed' ? 'bg-emerald-700 text-white' : selected ? 'bg-white text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'}`}>{phase.status === 'completed' ? <CheckCircle2 size={17} /> : index + 1}</span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold leading-5">{phase.label}</strong>
                <span className="mt-1 block text-xs text-slate-500">{phase.total ? `${phase.completed} of ${phase.total} tasks complete` : 'No applicable tasks'}</span>
                {needsAttention ? <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle size={13} /> {attentionLabel(needsAttention)}</span> : null}
              </span>
              {selected ? <span className="mt-2 h-5 w-0.5 shrink-0 rounded-full bg-emerald-700" aria-hidden="true" /> : null}
            </button>
          </li>
        })}
      </ol>
    </nav>

    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <header className="border-b border-slate-200 bg-gradient-to-br from-white to-slate-50 px-5 py-6 sm:px-8 sm:py-8">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-800">Stage {selectedIndex + 1} of {phases.length}</span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{selectedPhase.label}</h1>
        {selectedPhase.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{selectedPhase.description}</p> : null}
        {selectedPhase.total ? <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={selectedPhase.completed} aria-valuemin={0} aria-valuemax={selectedPhase.total} aria-label="Stage progress"><span className="block h-full rounded-full bg-emerald-700" style={{ width: `${selectedPhase.percent}%` }} /></span>
          <span className="text-sm font-semibold text-slate-700">{selectedPhase.completed} of {selectedPhase.total} complete</span>
        </div> : <p className="mt-6 text-sm font-semibold text-slate-700">No applicable tasks in this stage</p>}
      </header>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Work in this stage</h2>
            <p className="mt-1 text-sm text-slate-500">Review the tasks and open the workspace to record progress.</p>
          </div>
          {stageAttention ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"><AlertTriangle size={14} /> {attentionLabel(stageAttention)}</span> : null}
        </div>
        <ol className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {selectedPhase.tasks.map((task, index) => <li key={task.key}>
            <button type="button" className="group flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 sm:px-5" onClick={() => onOpenStage?.(selectedPhase.key, task.key)}>
              <span className="mt-0.5 shrink-0" aria-hidden="true">{taskIcon(task)}</span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold text-slate-900 group-hover:text-emerald-900">{index + 1}. {task.label}</strong>
                {task.description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{task.description}</span> : null}
                <span className="mt-1 block text-xs font-medium text-slate-600 sm:hidden">{task.statusLabel || 'Not Started'}</span>
              </span>
              <span className="shrink-0 text-right"><span className="hidden text-xs font-medium text-slate-600 sm:block">{task.statusLabel || 'Not Started'}</span><ArrowRight size={17} className="ml-auto mt-1 text-slate-400 group-hover:text-emerald-800 sm:mt-2" aria-hidden="true" /></span>
            </button>
          </li>)}
        </ol>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Opening a task does not change its status.</p>
          <button type="button" disabled={!entryTask} onClick={() => onOpenStage?.(selectedPhase.key, entryTask.key)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Open stage workspace <ArrowRight size={17} /></button>
        </div>
      </div>
    </div>
  </section>
}
