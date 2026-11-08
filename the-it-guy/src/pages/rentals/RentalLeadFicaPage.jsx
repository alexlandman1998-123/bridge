import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { RENTAL_LEAD_FICA_ITEMS, RENTAL_LEAD_FICA_STATUSES } from '../../services/rentals/rentalLeadFicaModel'
import { completeRentalLeadFica, getRentalLeadFicaChecklist, saveRentalLeadFicaChecklist } from '../../services/rentals/rentalLeadFicaService'
import { advanceRentalLead, listRentalLeads } from '../../services/rentals/rentalLeadService'
import { buildRentalWorkspaceKey, resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function RentalLeadFicaPage() {
  const workspace = useWorkspace(); const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace]); const actor = useMemo(() => ({ id: scope.assignedAgentId, userId: scope.assignedAgentId, email: workspace?.profile?.email || workspace?.user?.email || '', name: workspace?.profile?.fullName || workspace?.profile?.name || '' }), [scope.assignedAgentId, workspace?.profile?.email, workspace?.profile?.fullName, workspace?.profile?.name, workspace?.user?.email]); const options = useMemo(() => ({ assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' }), [scope]); const [leads, setLeads] = useState([]); const [leadId, setLeadId] = useState(''); const [checklist, setChecklist] = useState({}); const [evidenceReference, setEvidenceReference] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const selected = leads.find((lead) => lead.id === leadId)
  const scopeKey = buildRentalWorkspaceKey(scope)
  const currentScope = useRef(scopeKey)
  currentScope.current = scopeKey
  const loadVersion = useRef(0)
  const actionGuard = useRef(false)
  const context = { organisationId: scope.organisationId, actor, scope: options }
  const load = useCallback(async () => {
    const version = ++loadVersion.current
    const active = () => currentScope.current === scopeKey && version === loadVersion.current
    setLeads([]); setLeadId(''); setChecklist({}); setEvidenceReference('')
    if (!scope.organisationId) { setLoading(false); return }
    try {
      setLoading(true); setError('')
      const items = (await listRentalLeads(scope.organisationId, options)).filter(lead => lead.role === 'tenant' && ['screening_pending', 'fica_pending'].includes(lead.stage))
      if (!active()) return
      setLeads(items); setLeadId(items[0]?.id || '')
    } catch (loadError) { if (active()) setError(loadError?.message || 'Unable to load FICA readiness.') }
    finally { if (active()) { setLoading(false); setSaving(false) } }
  }, [options, scope.organisationId, scopeKey])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setChecklist(selected ? getRentalLeadFicaChecklist(selected) : {}) }, [selected])
  const update = (item, status) => setChecklist(current => ({ ...current, [item]: status }))
  async function run(action, apply) {
    if (!selected || actionGuard.current) return
    actionGuard.current = true
    setSaving(true); setError('')
    try {
      const result = await action()
      if (currentScope.current === scopeKey) apply(result)
    } catch (cause) { if (currentScope.current === scopeKey) setError(cause?.message || 'Unable to save FICA readiness.') }
    finally { actionGuard.current = false; if (currentScope.current === scopeKey) setSaving(false) }
  }
  const save = () => run(() => saveRentalLeadFicaChecklist(selected, checklist, context), ({ updated }) => {
    setLeads(current => current.map(lead => lead.id === selected.id ? { ...lead, raw: { ...lead.raw, ...updated }, updatedAt: updated.updatedAt } : lead))
  })
  const start = () => run(() => advanceRentalLead(selected, { ...context, toStage: 'fica_pending' }), updated => {
    setLeads(current => current.map(lead => lead.id === selected.id ? updated : lead))
  })
  const complete = () => run(() => completeRentalLeadFica(selected, checklist, evidenceReference, context), updated => {
    const remaining = leads.filter(lead => lead.id !== updated.id)
    setLeads(remaining); setLeadId(remaining[0]?.id || ''); setEvidenceReference('')
  })
  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><ShieldCheck size={20} /><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental pipeline</p><h1 className="text-2xl font-semibold text-[#18324b]">FICA Readiness</h1></div></div></header>{error ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}<section className="ui-panel ui-panel-body max-w-3xl"><label className="form-field"><span>Tenant lead</span><select disabled={saving || loading} value={leadId} onChange={(event) => setLeadId(event.target.value)}>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {label(lead.stage)}</option>)}</select></label>{loading ? <p className="py-8 text-center text-sm text-[#607891]"><Loader2 className="mr-2 inline animate-spin" size={15} />Loading FICA readiness…</p> : selected ? <div className="mt-5 grid gap-4">{RENTAL_LEAD_FICA_ITEMS.map((item) => <label key={item} className="form-field"><span>{label(item)}</span><select value={checklist[item] || 'not_requested'} onChange={(event) => update(item, event.target.value)}>{RENTAL_LEAD_FICA_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>)}<label className="form-field"><span>FICA evidence reference</span><input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Document pack, case, or verification reference" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save()} className="ui-pill-button">Save checklist</button>{selected.stage === 'screening_pending' ? <button type="button" disabled={saving} onClick={() => void start()} className="ui-pill-button ui-pill-button-active">Start FICA</button> : <button type="button" disabled={saving} onClick={() => void complete()} className="ui-pill-button ui-pill-button-active">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Mark FICA complete</button>}</div></div> : <p className="py-8 text-center text-sm text-[#607891]">No tenant leads currently need FICA readiness.</p>}</section></div></section>
}
