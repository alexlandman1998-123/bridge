import { createElement } from 'react'
import { Activity, FileText, ListChecks, MessageSquarePlus, Workflow } from 'lucide-react'
import Button from '../../../components/ui/Button'

const FALLBACK_META = {
  label: 'Notes',
  badge: 'border-slate-200 bg-slate-50 text-slate-600',
  icon: 'bg-slate-50 text-slate-600 ring-slate-100',
  Icon: MessageSquarePlus,
}

function Panel({ title, children, className = '' }) {
  return (
    <section className={`rounded-[22px] border border-slate-200/75 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.045)] ${className}`.trim()}>
      {title ? <header className="px-5 py-5"><h3 className="text-base font-semibold tracking-[-0.015em] text-slate-950">{title}</h3></header> : null}
      {children}
    </section>
  )
}

function formatDateTime(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function ActivityWorkspaceTab({ entries = [], groupedEntries = [], filters = [], activeFilter = 'all', onFilterChange, composer, onOpenWorkspace }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(330px,0.34fr)]">
      <Panel title="Matter Activity" className="overflow-hidden">
        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 px-4 py-4">
          {filters.map((filter) => (
            <button key={filter.key} type="button" className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${activeFilter === filter.key ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => onFilterChange?.(filter.key)}>
              {filter.label}
            </button>
          ))}
        </div>
        <div className="space-y-5 border-t border-slate-200 p-4">
          {groupedEntries.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200" /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{group.label}</span><span className="h-px flex-1 bg-slate-200" /></div>
              <div className="space-y-3">
                {group.items.map((entry) => {
                  const meta = entry.meta || FALLBACK_META
                  return (
                    <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.icon}`}>{createElement(meta.Icon || Activity, { size: 16 })}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0"><strong className="block text-sm font-semibold text-slate-950">{entry.title}</strong><span className="mt-1 block text-xs text-slate-500">{entry.authorName} · {formatDateTime(entry.createdAt)}</span></div>
                            <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${meta.badge}`}>{entry.categoryLabel || meta.label}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.body}</p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
          {!entries.length ? <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">No activity matches this filter.</p> : null}
        </div>
      </Panel>
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        {composer}
        <Panel title="Quick Actions" className="p-4">
          <div className="grid gap-2">
            {[
              ['Documents', FileText, 'documents'],
              ['Transfer', Workflow, 'transfer'],
              ['Tasks', ListChecks, 'tasks'],
            ].map(([label, Icon, target]) => (
              <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={() => onOpenWorkspace?.(target)}>{createElement(Icon, { size: 14 })}{label}</Button>
            ))}
          </div>
        </Panel>
      </aside>
    </section>
  )
}
