import { AlertTriangle, Check, ChevronDown } from 'lucide-react'

const completed = (task) => ['completed', 'completed_externally'].includes(task.displayStatus || task.status)

function statusLabel(task) {
  if (task.status === 'not_applicable') return 'Not applicable'
  if (completed(task)) {
    const date = task.completedAt && new Date(task.completedAt)
    const dateText = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(date)
      : ''
    return dateText ? `Completed · ${dateText}` : 'Completed'
  }
  if (task.displayStatus === 'blocked') return 'Blocked'
  if (task.displayStatus === 'in_progress') return 'In progress'
  return 'Not started'
}

export default function TransferStageTaskNavigation({ phase, selectedTaskKey = '', onSelectTask }) {
  if (!phase?.tasks?.length) return null
  const selectedIndex = Math.max(0, phase.tasks.findIndex((task) => task.key === selectedTaskKey))
  const showTaskCards = phase.tasks.length <= 6
  return <nav className="mt-3 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label={`${phase.label} tasks`}>
    <label className={`relative block ${showTaskCards ? 'xl:hidden' : ''}`}>
      <span className="sr-only">Choose a task in {phase.label}</span>
      <select className="w-full appearance-none rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 pr-10 text-sm font-semibold text-emerald-950" value={phase.tasks[selectedIndex]?.key || ''} onChange={(event) => onSelectTask?.(event.target.value)}>
        {phase.tasks.map((task, index) => <option key={task.key} value={task.key}>{index + 1} of {phase.tasks.length} · {task.label} · {statusLabel(task)}</option>)}
      </select>
      <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-800" />
    </label>
    <ol className={`${showTaskCards ? 'hidden xl:grid' : 'hidden'} min-w-0 gap-1`} style={showTaskCards ? { gridTemplateColumns: `repeat(${phase.tasks.length}, minmax(0, 1fr))` } : undefined}>
      {phase.tasks.map((task, index) => {
        const active = task.key === selectedTaskKey
        const done = completed(task)
        return <li key={task.key} className="min-w-0">
          <button type="button" aria-current={active ? 'step' : undefined} onClick={() => onSelectTask?.(task.key)} className={`flex min-h-[92px] w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 2xl:gap-2.5 2xl:px-3 ${active ? 'border-emerald-400 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
            <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? 'border-emerald-700 bg-emerald-700 text-white' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              {done && !active ? <Check size={15} /> : task.displayStatus === 'blocked' ? <AlertTriangle size={14} /> : index + 1}
            </span>
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm font-semibold leading-5" title={task.label}>{task.label}</strong><span className={`mt-1 block text-xs ${active ? 'text-emerald-800' : 'text-slate-500'}`}>{statusLabel(task)}</span></span>
            {done && active ? <Check size={15} className="shrink-0 text-emerald-700" /> : null}
          </button>
        </li>
      })}
    </ol>
  </nav>
}
