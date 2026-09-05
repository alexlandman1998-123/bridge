import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, ClipboardList, Loader2 } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getRentalCrmDashboard } from '../../services/rentals/rentalCrmDashboardService'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const METRICS = [
  { key: 'total', label: 'Visible rental leads' },
  { key: 'listingReady', label: 'Listings ready' },
  { key: 'applicationsSubmitted', label: 'Applications submitted' },
  { key: 'placementReady', label: 'Placement ready' },
]

export default function RentalCrmDashboardPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const options = useMemo(() => ({ assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' }), [scope])
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!scope.organisationId) { setDashboard(null); setLoading(false); return }
    try { setLoading(true); setError(''); setDashboard(await getRentalCrmDashboard(scope.organisationId, options)) } catch (loadError) { setError(loadError?.message || 'Unable to load the rental CRM dashboard.') } finally { setLoading(false) }
  }, [options, scope.organisationId])
  useEffect(() => { void load() }, [load])

  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><BarChart3 size={20} /><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental pipeline</p><h1 className="text-2xl font-semibold text-[#18324b]">CRM Dashboard</h1><p className="mt-1 text-sm text-[#607891]">A live, read-only view of the rental leads and follow-ups in your current scope.</p></div></div></header>{error ? <p className="rounded-[12px] border border-[#f2c6c6] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}{loading ? <p className="py-12 text-center text-sm text-[#607891]"><Loader2 className="mr-2 inline animate-spin" size={15} />Loading rental CRM…</p> : dashboard ? <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{METRICS.map(({ key, label }) => <article key={key} className="ui-panel ui-panel-body"><p className="text-3xl font-semibold text-[#18324b]">{dashboard.leads[key]}</p><p className="mt-1 text-sm text-[#607891]">{label}</p></article>)}</div><div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"><section className="ui-panel ui-panel-body"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[#18324b]">Pipeline distribution</h2><p className="mt-1 text-sm text-[#607891]">{dashboard.leads.landlords} landlord · {dashboard.leads.tenants} tenant leads</p></div><Link className="text-sm font-semibold text-[#1f4f78]" to="/agent/rentals/pipeline/leads">Open leads</Link></div>{[['Landlord', dashboard.pipelines.landlords], ['Tenant', dashboard.pipelines.tenants]].map(([title, stages]) => <div key={title} className="mt-5"><h3 className="text-sm font-semibold text-[#18324b]">{title}</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{stages.filter((stage) => stage.count).map((stage) => <div key={stage.stage} className="flex items-center justify-between rounded-[10px] bg-[#f5f8fb] px-3 py-2 text-sm"><span className="text-[#50677e]">{stage.label}</span><span className="font-semibold text-[#18324b]">{stage.count}</span></div>)}{!stages.some((stage) => stage.count) ? <p className="text-sm text-[#607891]">No leads in this pipeline.</p> : null}</div></div>)}</section><section className="ui-panel ui-panel-body"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 text-[#b36a00]" /><div><h2 className="text-lg font-semibold text-[#18324b]">Needs attention</h2><p className="mt-1 text-sm text-[#607891]">These counts highlight work; they do not make compliance or placement decisions.</p></div></div><div className="mt-4 grid gap-3">{dashboard.attention.length ? dashboard.attention.map((item) => <div key={item.key} className="rounded-[10px] border border-[#f0dfbd] bg-[#fffaf0] px-3 py-3 text-sm text-[#6d511d]"><span className="font-semibold">{item.count}</span> {item.label}{item.count === 1 ? '' : 's'}</div>) : <p className="text-sm text-[#607891]">Nothing is currently flagged in this scope.</p>}</div><div className="mt-5 grid gap-2"><Link className="text-sm font-semibold text-[#1f4f78]" to="/agent/rentals/pipeline/service-levels"><ClipboardList className="mr-1 inline" size={15} />{dashboard.followUps.overdue} overdue · {dashboard.followUps.open} open follow-ups</Link><Link className="text-sm font-semibold text-[#1f4f78]" to="/agent/rentals/pipeline/fica">Review FICA readiness</Link><Link className="text-sm font-semibold text-[#1f4f78]" to="/agent/rentals/pipeline/mandates">Review landlord mandates</Link></div></section></div></> : <p className="py-12 text-center text-sm text-[#607891]">No rental CRM data is available in this scope.</p>}</div></section>
}
