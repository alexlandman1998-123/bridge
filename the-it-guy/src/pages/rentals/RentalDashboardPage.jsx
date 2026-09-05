import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, ClipboardList, FileSignature, Loader2, RefreshCw, TriangleAlert, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { buildRentalDashboardSnapshot } from '../../services/rentals/rentalDashboardModel'
import { listPersistedRentalApplications, listPersistedRentalTenancies } from '../../services/rentals/rentalApplicationRepository.js'
import { listRentalLeads } from '../../services/rentals/rentalLeadService'
import { listRentalListingsForAgent } from '../../services/rentals/rentalListingDraftService'
import { listRentalManagementWorkspace } from '../../services/rentals/rentalManagementService'
import { buildRentalListingQueryOptions, resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope'

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function RentalDashboardPage() {
  const workspace = useWorkspace()
  const scope = useMemo(() => resolveRentalWorkspaceScope(workspace), [workspace])
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!scope.organisationId || !scope.assignedAgentId) { setSnapshot(buildRentalDashboardSnapshot()); setLoading(false); return }
    try {
      setLoading(true); setError('')
      const options = buildRentalListingQueryOptions(scope)
      const [listings, leads, applications, leases, management] = await Promise.all([
        listRentalListingsForAgent(scope.assignedAgentId, options),
        listRentalLeads(scope.organisationId, { assignedAgentId: scope.assignedAgentId, branchId: scope.branchId, scopeLevel: scope.scopeLevel, includeAllOrganisationLeads: scope.scopeLevel === 'organisation' }),
        listPersistedRentalApplications(scope.organisationId),
        listPersistedRentalTenancies(scope.organisationId),
        listRentalManagementWorkspace(scope.assignedAgentId, options),
      ])
      setSnapshot(buildRentalDashboardSnapshot({ listings, leads, applications, leases, managementEvents: management.events }))
    } catch (reason) { setError(reason?.message || 'Unable to load the Rentals dashboard.') } finally { setLoading(false) }
  }, [scope])

  useEffect(() => { void load() }, [load])
  const cards = [
    ['Active listings', snapshot?.activeListings, Building2, '/agent/rentals/listings'], ['Tenant leads', snapshot?.tenantLeads, Users, '/agent/rentals/pipeline/leads'], ['Open applications', snapshot?.openApplications, ClipboardList, '/agent/rentals/applications'], ['Active tenancies', snapshot?.activeTenancies, FileSignature, '/agent/rentals/tenancies'],
  ]
  return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><span className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white text-[#42617f]"><Building2 size={20} /></span><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental operations</p><h1 className="text-2xl font-semibold text-[#18324b]">Rentals Dashboard</h1><p className="status-message">See the work moving from landlord acquisition through tenancy care.</p></div></div><button type="button" className="ui-pill-button" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Refresh</button></header>{error ? <p className="rounded-[8px] border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm font-semibold text-[#9f3131]">{error}</p> : null}<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, value, Icon, to]) => <Link key={title} to={to} className="ui-panel ui-panel-body transition hover:border-[#aac1d8]">{createElement(Icon, { size: 18, className: 'text-[#42617f]' })}<p className="mt-3 text-2xl font-semibold text-[#18324b]">{loading ? '...' : value || 0}</p><p className="mt-1 text-sm text-[#607891]">{title}</p></Link>)}</section><section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(330px,0.72fr)]"><div className="ui-panel ui-panel-body"><p className="text-xs font-semibold uppercase text-[#607891]">Pipeline health</p><h2 className="mt-1 text-lg font-semibold text-[#18324b]">Rental work at a glance</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="border-l-2 border-[#dbe6f2] pl-3"><p className="text-xs font-semibold uppercase text-[#7b8ca2]">Landlord leads</p><p className="mt-1 text-xl font-semibold text-[#18324b]">{loading ? '...' : snapshot?.landlordLeads || 0}</p></div><div className="border-l-2 border-[#dbe6f2] pl-3"><p className="text-xs font-semibold uppercase text-[#7b8ca2]">Management work</p><p className="mt-1 text-xl font-semibold text-[#18324b]">{loading ? '...' : snapshot?.openManagement || 0}</p></div><div className="border-l-2 border-[#dbe6f2] pl-3"><p className="text-xs font-semibold uppercase text-[#7b8ca2]">Open applications</p><p className="mt-1 text-xl font-semibold text-[#18324b]">{loading ? '...' : snapshot?.openApplications || 0}</p></div></div></div><div className="ui-panel ui-panel-body"><div className="flex items-center gap-2"><TriangleAlert size={18} className="text-[#a57620]" /><div><p className="text-xs font-semibold uppercase text-[#607891]">Attention</p><h2 className="text-lg font-semibold text-[#18324b]">Follow-up queue</h2></div></div>{loading ? <p className="mt-5 text-sm text-[#607891]">Loading follow-ups...</p> : snapshot?.attention?.length ? <div className="mt-5 grid gap-3">{snapshot.attention.map((item, index) => <div key={`${item.type}-${item.leaseReference || item.tenantName}-${index}`} className="rounded-[8px] border border-[#dbe6f2] bg-white p-3"><p className="text-sm font-semibold text-[#20364d]">{label(item.type)}</p><p className="mt-1 text-xs text-[#607891]">{item.tenantName || 'Tenant'} · {item.listingTitle || 'Rental listing'}</p>{item.dueDate ? <p className="mt-2 text-xs font-semibold text-[#42617f]">Due {item.dueDate}</p> : null}</div>)}</div> : <p className="mt-5 rounded-[8px] border border-dashed border-[#dbe6f2] p-4 text-sm text-[#607891]">No rental follow-ups need attention right now.</p>}</div></section></div></section>
}
