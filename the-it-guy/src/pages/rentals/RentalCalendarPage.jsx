import useCalendarRead from '../../hooks/useCalendarRead'
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { buildRentalCalendarItems } from '../../services/rentals/rentalCalendarModel'
import { listRentalManagementWorkspace } from '../../services/rentals/rentalManagementService'
import { buildRentalListingQueryOptions, buildRentalWorkspaceKey, resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export default function RentalCalendarPage() {
  const workspace = useWorkspace()
  const scope = resolveRentalWorkspaceScope(workspace)
  const source = useCalendarRead({
    intervalMs: 0,
    scopeKey: buildRentalWorkspaceKey(scope), enabled: Boolean(scope.assignedAgentId && scope.organisationId),
    read: async signal => buildRentalCalendarItems(await listRentalManagementWorkspace(scope.assignedAgentId, { ...buildRentalListingQueryOptions(scope), signal })),
  })
  const items = source.data || []
  const loading = source.status === 'loading'
  const error = source.error
  const load = source.reload
  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]"><CalendarDays size={20} /></span><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental operations</p><h1 className="text-2xl font-semibold text-[#18324b]">Rental Calendar</h1><p className="status-message">Scheduled tenancy work, occupation, inspections, and follow-ups.</p></div></div><button type="button" className="ui-pill-button" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Refresh</button></header>{error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}<section className="ui-panel ui-panel-body">{loading ? <p className="flex items-center gap-2 text-sm text-[#607891]"><Loader2 size={16} className="animate-spin" />Loading scheduled work</p> : items.length ? <div className="grid gap-3">{items.map((item) => <article key={item.id} className="grid gap-3 rounded-[8px] border border-[#dbe6f2] bg-white p-4 md:grid-cols-[120px_minmax(0,1fr)_auto]"><p className="text-sm font-semibold text-[#1f4f78]">{item.date}</p><div><p className="text-sm font-semibold text-[#18324b]">{item.title}</p><p className="mt-1 text-xs text-[#607891]">{item.tenantName || 'Tenant'} · {item.listingTitle || 'Rental listing'}</p>{item.detail ? <p className="mt-2 text-sm text-[#42617f]">{item.detail}</p> : null}</div><span className="h-fit rounded-full border border-[#dbe6f2] px-2 py-1 text-xs font-semibold text-[#42617f]">{label(item.status)}</span></article>)}</div> : <p className="rounded-[8px] border border-dashed border-[#dbe6f2] p-5 text-sm text-[#607891]">No scheduled rental work yet. Add due dates to management updates or set a lease occupation date.</p>}</section></div></section>
}
