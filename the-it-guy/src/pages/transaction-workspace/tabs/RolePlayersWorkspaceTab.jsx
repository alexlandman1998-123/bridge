import { Activity, UsersRound } from 'lucide-react'
import Button from '../../../components/ui/Button'

function Panel({ title, children, className = '' }) {
  return (
    <section className={`rounded-[22px] border border-slate-200/75 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.045)] ${className}`.trim()}>
      {title ? <header className="px-5 py-5"><h3 className="text-base font-semibold tracking-[-0.015em] text-slate-950">{title}</h3></header> : null}
      {children}
    </section>
  )
}

export default function RolePlayersWorkspaceTab({ contacts = [], teamCards = [], onOpenAssignments, onOpenActivity }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.34fr)]">
      <Panel title="Role Players" className="overflow-hidden">
        <div className="grid gap-3 border-t border-slate-200 p-4 md:grid-cols-2">
          {contacts.map((row) => (
            <article key={row.key} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><span className="text-xs font-medium text-slate-500">{row.role}</span><strong className="mt-1 block truncate text-sm font-semibold text-slate-950">{row.contact}</strong><span className="mt-1 block truncate text-xs text-slate-500">{row.company}</span></div>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{row.status}</span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600"><span className="truncate">{row.email}</span><span className="truncate">{row.phone}</span></div>
            </article>
          ))}
        </div>
      </Panel>
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Panel title="Legal Team" className="p-4">
          <div className="space-y-2">{teamCards.map((card) => <article key={card.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="block text-xs font-medium text-slate-500">{card.label}</span><strong className="mt-1 block text-sm font-semibold text-slate-950">{card.company}</strong><span className="mt-1 block text-xs text-slate-500">{card.status}</span></article>)}</div>
        </Panel>
        <Panel title="Actions" className="p-4">
          <div className="grid gap-2">
            <Button type="button" variant="secondary" size="sm" className="justify-start" onClick={onOpenAssignments}><UsersRound size={14} />Manage Assignments</Button>
            <Button type="button" variant="secondary" size="sm" className="justify-start" onClick={onOpenActivity}><Activity size={14} />View Activity</Button>
          </div>
        </Panel>
      </aside>
    </section>
  )
}
