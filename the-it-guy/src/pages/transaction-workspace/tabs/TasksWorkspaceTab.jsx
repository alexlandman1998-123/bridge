import { createElement } from 'react'
import { Activity, CircleDollarSign, FileText, Workflow } from 'lucide-react'
import Button from '../../../components/ui/Button'

const STATUS_META = {
  completed: { label: 'Completed', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  in_progress: { label: 'In Progress', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  waiting: { label: 'Waiting', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  blocked: { label: 'Blocked', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  not_started: { label: 'Not Started', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
}

function Panel({ title, children, className = '' }) {
  return (
    <section className={`rounded-[22px] border border-slate-200/75 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.045)] ${className}`.trim()}>
      {title ? <header className="px-5 py-5"><h3 className="text-base font-semibold tracking-[-0.015em] text-slate-950">{title}</h3></header> : null}
      {children}
    </section>
  )
}

function titleCase(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getPriorityMeta(item = {}) {
  const priority = String(item.priority || '').toLowerCase()
  const status = String(item.status || '').toLowerCase()
  if (['critical', 'high', 'urgent', 'blocked', 'overdue', 'needs_correction'].includes(priority) || ['blocked', 'overdue', 'needs_correction'].includes(status)) return STATUS_META.blocked
  if (['medium', 'required', 'waiting', 'due_today', 'due_soon', 'review_pending'].includes(priority) || ['waiting', 'due_today', 'due_soon', 'review_pending'].includes(status)) return STATUS_META.waiting
  return STATUS_META.in_progress
}

export default function TasksWorkspaceTab({ items = [], overviewItems = [], onOpenTask, onRunTask, onOpenWorkspace }) {
  const visibleItems = items.length ? items : overviewItems
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.32fr)]">
      <Panel title="Tasks" className="overflow-hidden">
        <div className="divide-y divide-slate-100 border-t border-slate-200">
          {visibleItems.map((item, index) => {
            const status = item.status || item.workflow?.statusKey || 'in_progress'
            const meta = STATUS_META[status] || getPriorityMeta(item)
            return (
              <article key={item.id || `${item.title}-${index}`} className="px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span>
                      <strong className="text-sm font-semibold text-slate-950">{item.title}</strong>
                      <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${meta.border} ${meta.bg} ${meta.text}`}>{meta.label || titleCase(status)}</span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.description || item.workflow?.summary || 'Review the linked matter task.'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                      <span>{item.workflow?.title || item.workflow || 'Matter'}</span>
                      {item.dueDate ? <span>Due {formatDate(item.dueDate)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => onOpenTask?.(item)}>Open</Button>
                    <Button type="button" size="sm" onClick={() => onRunTask?.(item)}>Start</Button>
                  </div>
                </div>
              </article>
            )
          })}
          {!visibleItems.length ? <p className="px-4 py-8 text-sm text-slate-500">No open tasks are visible right now.</p> : null}
        </div>
      </Panel>
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Panel title="Quick Actions" className="p-4">
          <div className="grid gap-2">
            {[
              ['Documents', FileText, 'documents'],
              ['Transfer', Workflow, 'transfer'],
              ['Finance', CircleDollarSign, 'finance'],
              ['Activity', Activity, 'activity'],
            ].map(([label, Icon, target]) => (
              <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={() => onOpenWorkspace?.(target)}>
                {createElement(Icon, { size: 14 })}{label}
              </Button>
            ))}
          </div>
        </Panel>
      </aside>
    </section>
  )
}
