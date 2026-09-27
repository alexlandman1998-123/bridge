import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'

function taskTone(task, active) {
  if (active) return 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
  if (task.displayStatus === 'blocked') return 'border-rose-200 bg-rose-50/50 text-slate-900 hover:border-rose-300'
  return 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/30'
}

export default function TransferStageTaskNavigation({ phase, selectedTaskKey = '', onSelectTask }) {
  if (!phase?.tasks?.length) return null

  return <nav className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5" aria-label={`${phase.label} tasks`}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Stage tasks</span>
        <h2 className="mt-1 text-base font-semibold text-slate-950">Choose the work to review</h2>
      </div>
      <span className="text-xs font-medium text-slate-500">{phase.tasks.length} task{phase.tasks.length === 1 ? '' : 's'}</span>
    </div>
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {phase.tasks.map((task, index) => {
        const active = task.key === selectedTaskKey
        const complete = ['completed', 'completed_externally'].includes(task.displayStatus)
        return <li key={task.key}>
          <button type="button" aria-current={active ? 'step' : undefined} onClick={() => onSelectTask?.(task.key)} className={`flex h-full min-h-20 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${taskTone(task, active)}`}>
            <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${complete ? 'border-emerald-700 bg-emerald-700 text-white' : active ? 'border-emerald-700 bg-white text-emerald-800' : 'border-slate-300 bg-white text-slate-600'}`}>
              {complete ? <CheckCircle2 size={16} /> : task.displayStatus === 'blocked' ? <AlertTriangle size={15} /> : <span aria-hidden="true">{index + 1}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-semibold leading-5">{task.label}</strong>
              <span className="mt-1 block text-xs text-slate-500">{task.statusLabel || 'Not Started'}</span>
            </span>
            {active ? <Circle size={9} className="mt-2 shrink-0 fill-emerald-700 text-emerald-700" aria-hidden="true" /> : null}
          </button>
        </li>
      })}
    </ol>
  </nav>
}
