import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, CalendarDays, ClipboardList, Loader2, MessageSquare, Plus, RefreshCw, Wrench } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { buildRentalManagementSummary, RENTAL_MANAGEMENT_EVENT_STATUSES, RENTAL_MANAGEMENT_EVENT_TYPES } from '../../services/rentals/rentalManagementModel'
import { createRentalManagementEvent, listRentalManagementWorkspace } from '../../services/rentals/rentalManagementService'
import { buildRentalListingQueryOptions, resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const INITIAL_FORM = Object.freeze({ leaseReference: '', type: 'inspection', status: 'open', dueDate: '', note: '' })
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function RentalManagementPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [leases, setLeases] = useState([])
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!scope.organisationId || !scope.assignedAgentId) { setLeases([]); setEvents([]); setLoading(false); return }
    try {
      setLoading(true); setError('')
      const data = await listRentalManagementWorkspace(scope.assignedAgentId, buildRentalListingQueryOptions(scope))
      setLeases(data.leases); setEvents(data.events)
      setForm((current) => current.leaseReference || !data.leases[0] ? current : { ...current, leaseReference: data.leases[0].reference })
    } catch (reason) { setError(reason?.message || 'Unable to load rental management.') } finally { setLoading(false) }
  }, [scope])

  useEffect(() => { void load() }, [load])
  const summary = useMemo(() => buildRentalManagementSummary({ leases, events }), [leases, events])
  const selectedLease = useMemo(() => leases.find((lease) => lease.reference === form.leaseReference) || null, [form.leaseReference, leases])
  const cards = [
    ['Active tenancies', summary.activeTenancies, Building2], ['Renewals due', summary.renewalsDue, CalendarDays], ['Open maintenance', summary.openMaintenance, Wrench], ['Arrears follow-ups', summary.arrearsFollowUps, ClipboardList],
  ]
  const update = (name, value) => { setForm((current) => ({ ...current, [name]: value })); setError('') }
  async function submit(event) { event.preventDefault(); try { setSaving(true); const created = await createRentalManagementEvent(selectedLease, form, { assignedAgentId: scope.assignedAgentId, performedBy: scope.assignedAgentId }); setEvents((current) => [created, ...current]); setForm((current) => ({ ...INITIAL_FORM, leaseReference: current.leaseReference })) } catch (reason) { setError(reason?.message || 'Unable to save management update.') } finally { setSaving(false) } }

  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]"><Wrench size={20} aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental operations</p><h1 className="text-2xl font-semibold text-[#18324b]">Rental Management</h1><p className="status-message">Coordinate tenancy follow-ups without creating a rent collection or payout ledger.</p></div></div><button type="button" className="ui-pill-button" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Refresh</button></header><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, value, Icon]) => <article key={title} className="ui-panel ui-panel-body"><Icon size={18} className="text-[#42617f]" /><p className="mt-3 text-2xl font-semibold text-[#18324b]">{loading ? '...' : value}</p><p className="mt-1 text-sm text-[#607891]">{title}</p></article>)}</section><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]"><section className="ui-panel ui-panel-body"><div><p className="text-xs font-semibold uppercase text-[#607891]">Management queue</p><h2 className="mt-1 text-lg font-semibold text-[#18324b]">Open tenancy work</h2></div>{loading ? <div className="mt-6 flex items-center gap-2 text-sm text-[#607891]"><Loader2 size={16} className="animate-spin" />Loading tenancy work</div> : events.length ? <div className="mt-5 grid gap-3">{events.map((item) => <article key={item.id} className="rounded-[8px] border border-[#dbe6f2] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#18324b]">{label(item.type)}</p><p className="mt-1 text-xs text-[#607891]">{item.tenantName || 'Tenant'} · {item.listingTitle || 'Rental listing'}</p></div><span className="rounded-full border border-[#dbe6f2] px-2 py-1 text-xs font-semibold text-[#42617f]">{label(item.status)}</span></div><p className="mt-3 text-sm text-[#42617f]">{item.note}</p>{item.dueDate ? <p className="mt-2 text-xs font-semibold text-[#607891]">Due {item.dueDate}</p> : null}</article>)}</div> : <p className="mt-5 rounded-[8px] border border-dashed border-[#dbe6f2] p-5 text-sm text-[#607891]">No management updates recorded yet.</p>}</section><form onSubmit={submit} className="ui-panel ui-panel-body"><div className="flex items-center gap-2"><MessageSquare size={18} className="text-[#42617f]" /><div><p className="text-xs font-semibold uppercase text-[#607891]">New update</p><h2 className="text-lg font-semibold text-[#18324b]">Log tenancy work</h2></div></div><div className="mt-5 grid gap-4"><label className="form-field"><span>Tenancy</span><select value={form.leaseReference} onChange={(event) => update('leaseReference', event.target.value)} disabled={!leases.length}>{leases.length ? leases.map((lease) => <option key={lease.reference} value={lease.reference}>{lease.tenantName || 'Tenant'} - {lease.listingTitle || 'Rental listing'}</option>) : <option value="">Create a lease workflow first</option>}</select></label><label className="form-field"><span>Work type</span><select value={form.type} onChange={(event) => update('type', event.target.value)}>{RENTAL_MANAGEMENT_EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{RENTAL_MANAGEMENT_EVENT_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label className="form-field"><span>Due date</span><input type="date" value={form.dueDate} onChange={(event) => update('dueDate', event.target.value)} /></label><label className="form-field"><span>Note</span><textarea required rows={5} value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="Record the follow-up, supplier issue, inspection outcome, or communication." /></label></div>{error ? <p className="mt-4 rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}<div className="mt-5 flex justify-end"><button type="submit" disabled={saving || !selectedLease} className="ui-pill-button ui-pill-button-active">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Log update</button></div></form></div></div></section>
}
