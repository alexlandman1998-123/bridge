import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Building2, Loader2, Plus, Search, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { MobileDashboardShell } from '../../components/dashboard/PremiumDashboard'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { acknowledgeRentalMaintenanceRequest, createRentalMaintenanceRequest, listRentalMaintenanceRequests } from '../../services/rentals/rentalMaintenanceRepository.js'
import { listPersistedRentalTenancies } from '../../services/rentals/rentalApplicationRepository.js'
import { listRentalProperties } from '../../services/rentals/rentalPropertyRepository.js'
import { listRentalUnits } from '../../services/rentals/rentalUnitRepository.js'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'
import { tenancyRegisterRow } from '../../services/rentals/rentalTenancyRegisterModel'

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const categories = ['plumbing', 'electrical', 'appliance', 'security', 'structural', 'pest', 'cleaning', 'other']
const priorities = ['routine', 'urgent', 'emergency']
const blank = () => ({ tenancyId: '', category: '', priority: 'routine', description: '', mediaLink: '' })
const tabs = [['all', 'All jobs'], ['new', 'New'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['cancelled', 'Cancelled']]
async function loadPages(loadPage) {
  const rows = []
  for (let offset = 0; ; offset += 100) {
    const batch = await loadPage(offset)
    rows.push(...batch)
    if (batch.length < 100) return rows
  }
}
function JobCard({ job, tenancy, busy, onAcknowledge }) {
  const urgent = ['urgent', 'emergency'].includes(job.priority)
  return <article className="flex min-w-0 flex-col rounded-[18px] border border-[#dfe7f0] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,.04)]">
    <div className="flex items-center justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><Wrench size={21} aria-hidden="true" /></span><span className="rounded-full border border-[#dbe6f1] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#4d6782]">{label(job.status)}</span></div>
    <p className="mt-4 text-xs font-semibold text-[#60758b]">Job {job.request_id.slice(0, 8)}</p>
    <h2 className="mt-1 text-base font-semibold text-[#142132]">{label(job.category)} issue</h2>
    <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[#60758b]">{job.description || 'Description not captured'}</p>
    <div className="mt-4 flex items-start gap-2 border-t border-[#edf2f7] pt-4 text-sm text-[#20364c]"><Building2 size={16} className="mt-0.5 shrink-0 text-[#60758b]" aria-hidden="true" /><div className="min-w-0"><p className="font-semibold">{tenancy?.propertyName || 'Property not captured'}</p><p className="mt-1 text-xs text-[#60758b]">{tenancy ? `${tenancy.unitLabel} · ${tenancy.location}` : 'Tenancy details unavailable'}</p></div></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 border-b border-[#edf2f7] pb-4 text-xs"><div className="min-w-0"><dt className="text-[#60758b]">Tenant</dt><dd className="mt-1 break-words font-semibold text-[#20364c]">{tenancy?.tenantName || 'Tenant not captured'}</dd></div><div className="min-w-0"><dt className="text-[#60758b]">Landlord</dt><dd className="mt-1 break-words font-semibold text-[#20364c]">{tenancy?.landlordName || 'Landlord not captured'}</dd></div></dl>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgent ? 'bg-[#fff2ee] text-[#9f4031]' : 'bg-[#f5f8fb] text-[#60758b]'}`}>{label(job.priority)}</span><span className="text-xs text-[#60758b]">{job.reported_at ? new Date(job.reported_at).toLocaleDateString('en-ZA') : 'Date not captured'}</span></div>
    <p className="mt-3 truncate text-xs text-[#60758b]" title={job.assignee_name}>Contractor: {job.assignee_name || 'Unassigned'}</p>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">{job.tenancy_id ? <Link data-rental-control="job-tenancy" to={`/agent/rentals/tenancies/${job.tenancy_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#315f80]">Open tenancy <ArrowUpRight size={14} /></Link> : <span />}{job.status === 'submitted' ? <Button type="button" disabled={busy} onClick={() => onAcknowledge(job.request_id)}>{busy ? 'Saving…' : 'Acknowledge'}</Button> : null}</div>
  </article>
}
export default function RentalMaintenancePage() {
  const workspace = useWorkspace()
  const { organisationId, branchId } = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const scopeKey = `${organisationId}:${branchId || ''}`
  const [result, setResult] = useState({ key: '', jobs: [], tenancies: [], error: '' })
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const saveGuard = useRef(false)
  const loadVersion = useRef(0)
  const currentScope = useRef(scopeKey)
  useEffect(() => { currentScope.current = scopeKey }, [scopeKey])
  const load = useCallback(async () => {
    if (currentScope.current !== scopeKey) return
    const version = ++loadVersion.current
    if (!organisationId) { setLoading(false); return }
    setLoading(true)
    try {
      const [jobs, tenancies, properties, units] = await Promise.all([
        loadPages((offset) => listRentalMaintenanceRequests({ organisationId, branchId, offset })),
        loadPages((offset) => listPersistedRentalTenancies(organisationId, { offset })),
        loadPages((offset) => listRentalProperties({ organisationId, branchId, status: 'all', limit: 100, offset })),
        loadPages((offset) => listRentalUnits({ organisationId, branchId, limit: 100, offset })),
      ])
      if (version !== loadVersion.current) return
      const propertyMap = new Map(properties.map((item) => [item.id, item]))
      const unitMap = new Map(units.map((item) => [item.id, item]))
      const scoped = branchId ? tenancies.filter((item) => propertyMap.has(item.propertyId)) : tenancies
      const enrichedJobs = jobs.map((job) => ({ ...job, propertyDisplay: tenancyRegisterRow({}, propertyMap.get(job.property_id), unitMap.get(job.unit_id)) }))
      setResult({ key: scopeKey, jobs: enrichedJobs, tenancies: scoped.map((item) => tenancyRegisterRow(item, propertyMap.get(item.propertyId), unitMap.get(item.unitId))), error: '' })
    } catch (cause) {
      if (version === loadVersion.current) setResult({ key: scopeKey, jobs: [], tenancies: [], error: cause?.message || 'Unable to load maintenance job cards.' })
    } finally { if (version === loadVersion.current) setLoading(false) }
  }, [organisationId, branchId, scopeKey])
  useEffect(() => { void load(); return () => { loadVersion.current += 1 } }, [load])
  useEffect(() => { setDialogOpen(false); setForm(blank()); setFormError(''); setNotice(''); setActionError('') }, [scopeKey])
  const jobs = result.key === scopeKey ? result.jobs : []
  const tenancies = result.key === scopeKey ? result.tenancies : []
  const error = result.key === scopeKey ? result.error : ''
  const tenancyMap = new Map(tenancies.map((item) => [item.id, item]))
  const tenancyFor = (job) => tenancyMap.get(job.tenancy_id) || job.propertyDisplay
  const selected = tenancyMap.get(form.tenancyId)
  const eligible = tenancies.filter((item) => item.status !== 'closed')
  const rows = jobs.filter((job) => {
    const tenancy = tenancyFor(job)
    const stageMatches = tab === 'all' || tab === 'new' && job.status === 'submitted' || tab === 'in_progress' && ['acknowledged', 'triaged', 'assigned', 'in_progress', 'scheduled', 'awaiting_approval'].includes(job.status) || job.status === tab
    return stageMatches && [job.request_id, job.category, job.description, job.status, job.assignee_name, tenancy?.propertyName, tenancy?.tenantName, tenancy?.landlordName, tenancy?.location].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  })
  const change = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setFormError('') }
  async function submit(event) {
    event.preventDefault()
    if (saveGuard.current) return
    if (!selected || selected.status === 'closed') { setFormError('Select a current tenancy.'); return }
    if (!categories.includes(form.category) || !priorities.includes(form.priority) || form.description.trim().length < 10) { setFormError('Choose the issue type and priority, and describe the issue in at least 10 characters.'); return }
    const requestScope = scopeKey
    saveGuard.current = true; setSaving(true); setFormError(''); setNotice('')
    try {
      await createRentalMaintenanceRequest({ tenancyId: selected.id, category: form.category, priority: form.priority, description: form.description.trim(), media: form.mediaLink.trim() ? [{ media_link: form.mediaLink.trim(), caption: 'Issue evidence' }] : [] })
      if (currentScope.current !== requestScope) return
      setDialogOpen(false); setForm(blank()); setNotice('Maintenance issue logged.'); setTab('all'); setQuery('')
      await load()
    } catch (cause) { if (currentScope.current === requestScope) setFormError(cause?.message || 'Unable to log the maintenance issue. Your details have been kept.') }
    finally { saveGuard.current = false; setSaving(false) }
  }
  async function acknowledge(id) {
    setBusy(id); setActionError('')
    const requestScope = scopeKey
    try { await acknowledgeRentalMaintenanceRequest(id); if (currentScope.current === requestScope) await load() }
    catch (cause) { setActionError(cause?.message || 'Unable to acknowledge the job.') }
    finally { setBusy('') }
  }
  return <main className="mx-auto w-full max-w-[1600px] py-2"><MobileDashboardShell>
    <section className="rounded-[20px] border border-[#dfe7f0] bg-white p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><h1 className="text-2xl font-semibold text-[#142132]">Maintenance</h1><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-3 sm:w-80"><Search size={16} className="shrink-0 text-[#7b8ca2]" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search maintenance" placeholder="Search maintenance jobs..." className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none" /></label><Button type="button" disabled={!organisationId || loading || Boolean(error)} onClick={() => { setFormError(''); setDialogOpen(true) }}><Plus size={16} />Log issue</Button></div></div></section>
    <nav className="flex overflow-x-auto rounded-[14px] border border-[#dbe4ee] bg-white p-1" aria-label="Maintenance job stages">{tabs.map(([key, title]) => <button key={key} type="button" data-rental-control="maintenance-tab" aria-pressed={tab === key} onClick={() => setTab(key)} className={`shrink-0 rounded-[10px] px-4 py-2.5 text-sm font-semibold ${tab === key ? 'bg-[#edf5f1] text-[#187052]' : 'text-[#60758b]'}`}>{title}</button>)}</nav>
    {notice ? <p role="status" className="rounded-xl border border-[#cfe8dc] bg-[#f2fbf5] p-3 text-sm text-[#286b43]">{notice}</p> : null}
    {error || actionError ? <p role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error || actionError}</p> : null}
    {loading ? <p className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#60758b]"><Loader2 size={18} className="animate-spin" />Loading maintenance jobs…</p> : !organisationId ? <p className="rounded-xl border border-[#dfe7f0] bg-white p-8 text-center text-sm text-[#60758b]">Choose an organisation to view maintenance.</p> : !error ? rows.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Maintenance job cards">{rows.map((job) => <JobCard key={job.request_id} job={job} tenancy={tenancyFor(job)} busy={busy === job.request_id} onAcknowledge={acknowledge} />)}</section> : <p className="rounded-xl border border-dashed border-[#dfe7f0] bg-white p-10 text-center text-sm text-[#60758b]">{jobs.length ? 'No jobs match this view.' : 'No maintenance jobs yet. Log an issue to create the first job card.'}</p> : null}
    <Modal open={dialogOpen} onClose={saving ? undefined : () => setDialogOpen(false)} title="Log maintenance issue">
      <form onSubmit={submit} className="space-y-5"><fieldset disabled={saving} className="space-y-4 border-0 p-0">
        <label className="form-field"><span>Select tenancy *</span><select required value={form.tenancyId} onChange={(event) => change('tenancyId', event.target.value)}><option value="">Select a tenancy</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.propertyName} · {item.unitLabel} · {item.tenantName}</option>)}</select></label>
        {selected ? <dl className="grid grid-cols-2 gap-3 rounded-xl border border-[#dbe6f1] bg-[#f8fbff] p-4 text-sm"><div><dt className="text-xs text-[#60758b]">Tenant</dt><dd className="mt-1 break-words font-semibold text-[#20364c]">{selected.tenantName}</dd></div><div><dt className="text-xs text-[#60758b]">Landlord</dt><dd className="mt-1 break-words font-semibold text-[#20364c]">{selected.landlordName}</dd></div></dl> : null}
        {!eligible.length ? <p className="text-sm text-[#60758b]">There are no current tenancies available to log an issue against.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2"><label className="form-field"><span>Issue type *</span><select required value={form.category} onChange={(event) => change('category', event.target.value)}><option value="">Select issue type</option>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label className="form-field"><span>Priority *</span><select value={form.priority} onChange={(event) => change('priority', event.target.value)}>{priorities.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
        <label className="form-field"><span>Issue description *</span><textarea required minLength={10} rows={4} value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="Describe the issue and where it is in the property." /></label>
        <label className="form-field"><span>Photo or evidence link (optional)</span><input type="url" value={form.mediaLink} onChange={(event) => change('mediaLink', event.target.value)} placeholder="https://..." /></label>
      </fieldset>{formError ? <p role="alert" className="text-sm text-[#9f3131]">{formError}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !selected || !form.category}>{saving ? 'Saving issue…' : 'Save issue'}</Button></div></form>
    </Modal>
  </MobileDashboardShell></main>
}
