import { useMobileLeadCreate } from '../../components/mobile-shell/mobileLeadCreateContext.js'
import LeadSourceLogo from '../../components/mobile-shell/LeadSourceLogo.jsx'
import './mobile-lead-list.css'
import { BriefcaseBusiness, ChevronRight, Plus, Upload } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet'
import MobileTransactionCard from '../../components/mobile-shell/MobileTransactionCard'
import { isMobileCreateType, mobileDraftMatchesModule } from '../../components/mobile-shell/mobileCreateConfig'
import { MobileCard, MobileEmptyState, MobileErrorState, MobileLoadingState, MobileSearchBar } from '../../components/mobile-shell/MobileShellStates'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { getCachedMobileDashboardSnapshot, getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService'
import { getOfflineDrafts } from '../../services/mobileProductivityService'
import { resolveMobileRoleCategory } from '../../config/mobileShell.js'
import { listAgentLeadWorkspaceRows } from '../../services/agentLeadWorkspaceService'
import { isLeadAssignedToActor, isNewAgentLead } from '../../services/mobileTodayModel.js'

const MobileLeadCreateFlow = lazy(() => import('../../components/mobile-shell/MobileLeadCreateFlow.jsx'))

const LEAD_TYPES = [
  { key: 'buyer', label: 'Buyer', description: 'Looking to buy a property' },
  { key: 'seller', label: 'Seller', description: 'Wants to sell a property' },
  { key: 'tenant', label: 'Tenant', description: 'Looking for a property to rent' },
  { key: 'landlord', label: 'Landlord', description: 'Wants to let a property' },
]

const MODULE_COPY = {
  transactions: {
    title: 'Transactions',
    intro: 'Track live deals and the next field action.',
    search: 'Search transactions or filter by status',
    emptyTitle: 'No active transactions yet.',
    emptyBody: 'Your transactions will appear here once created.',
  },
  leads: {
    title: 'Leads',
    intro: 'A mobile-safe list shell for new and active leads.',
    search: 'Search leads or filter by source',
    emptyTitle: 'No leads yet.',
    emptyBody: 'New leads will appear here once they are captured.',
  },
  documents: {
    title: 'Documents',
    intro: 'Review document requests and pending uploads.',
    search: 'Search documents or filter by status',
    emptyTitle: 'No documents awaiting review.',
    emptyBody: 'Document requests and uploads will appear here.',
    actionLabel: 'Upload',
    actionIcon: Upload,
  },
  notifications: {
    title: 'Notifications',
    intro: 'Unread updates and workspace alerts.',
    emptyTitle: 'No notifications.',
    emptyBody: 'You are all caught up for now.',
  },
  reports: {
    title: 'Reports',
    intro: 'Management reporting will be simplified for mobile in a later phase.',
    emptyTitle: 'No mobile reports yet.',
    emptyBody: 'A focused report view will appear here once enabled.',
  },
  matters: {
    title: 'Matters',
    intro: 'A field-ready matter list for attorney users.',
    search: 'Search matters or filter by priority',
    emptyTitle: 'No active matters yet.',
    emptyBody: 'Your matters will appear here once assigned.',
  },
  applications: {
    title: 'Applications',
    intro: 'A mobile queue for bond applications.',
    search: 'Search applications or filter by stage',
    emptyTitle: 'No active applications yet.',
    emptyBody: 'Bond applications will appear here once created.',
  },
  pipeline: {
    title: 'Pipeline',
    intro: 'A mobile view for commercial pipeline movement.',
    search: 'Search pipeline or filter by stage',
    emptyTitle: 'No pipeline items yet.',
    emptyBody: 'Commercial pipeline activity will appear here.',
  },
  listings: {
    title: 'Listings',
    intro: 'Commercial listing work packaged for mobile follow-up.',
    search: 'Search listings or filter by status',
    emptyTitle: 'No listings yet.',
    emptyBody: 'Listings will appear here once available.',
  },
  deals: {
    title: 'Deals',
    intro: 'Commercial deal flow for quick field checks.',
    search: 'Search deals or filter by status',
    emptyTitle: 'No active deals yet.',
    emptyBody: 'Deals will appear here once created.',
  },
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function resolveMobileOrganisationId(workspace = {}, organisation = null) {
  return normalizeText(
    organisation?.organisation?.id ||
      organisation?.organisation?.organisationId ||
      organisation?.organisation?.workspaceId ||
      workspace.currentWorkspace?.organisationId ||
      workspace.currentWorkspace?.organisation_id ||
      workspace.currentWorkspace?.id ||
      workspace.workspace?.id,
  )
}

function resolveMobileLeadActor(workspace = {}) {
  return {
    ...(workspace.profile || {}),
    role: workspace.role,
    roleKey: workspace.role,
    workspaceRole: workspace.workspaceRole || workspace.organisationMembershipRole,
    organisationRole: workspace.organisationMembershipRole,
    id: workspace.profile?.id,
    email: workspace.profile?.email,
  }
}

function formatLeadMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(number)
}

function formatLeadAge(value) {
  if (!value) return 'Recently'
  const created = new Date(value).getTime()
  if (!Number.isFinite(created)) return 'Recently'
  const days = Math.max(0, Math.floor((Date.now() - created) / 86_400_000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function getLeadDisplay(row = {}) {
  const contact = row.contact || {}
  const title = normalizeText(
    row.name ||
      contact.fullName ||
      [contact.firstName || contact.first_name, contact.lastName || contact.last_name].map(normalizeText).filter(Boolean).join(' '),
  ) || 'Unnamed lead'
  const property = normalizeText(
    row.enquiredPropertyAddress ||
      row.sellerPropertyAddress ||
      row.formattedAddress ||
      row.streetAddress ||
      row.areaInterest ||
      row.propertyInterest ||
      row.enquiredPropertyTitle,
  ) || 'Property interest pending'
  const value = formatLeadMoney(row.enquiredPropertyPrice || row.estimatedValue || row.estimated_value || row.budget)
  const stage = normalizeText(row.stage || row.status) || 'New'
  const source = normalizeText(row.source || row.leadSource || row.lead_source) || 'Platform'
  const assignedAgent = normalizeText(row.assignedAgent || row.assignedAgentName || row.assignedAgentEmail) || 'Unassigned'
  const nextAction = normalizeText(row.nextTask?.title || row.latestActivity?.title || row.recommendations?.[0]?.title) || 'Open journey'
  const slaStatus = normalizeText(row.slaStatus || row.ownershipStatus).toLowerCase()
  return {
    title,
    property,
    value,
    stage,
    source,
    assignedAgent,
    nextAction,
    age: formatLeadAge(row.createdAt || row.created_at),
    isOverdue: slaStatus.includes('overdue') || slaStatus.includes('escalated'),
  }
}

function MobileLeadCard({ item, onOpen }) {
  const display = getLeadDisplay(item)
  return <button type="button" className="mobile-lead-list-card" onClick={() => onOpen(item)}>
    <span className="mobile-lead-list-identity">
      <strong>{display.title}</strong>
      <LeadSourceLogo source={display.source} className="mobile-lead-list-source" />
    </span>
    <span className="mobile-lead-list-property">{display.property}</span>
    <span className="mobile-lead-list-next">{display.nextAction}</span>
    <span className="mobile-lead-list-facts">
      <span><span>Agent</span><strong>{display.assignedAgent}</strong></span>
      <span><span>Received</span><strong>{display.age}</strong></span>
      <span><span>Value</span><strong>{display.value || 'Pending'}</strong></span>
    </span>
    <span className="mobile-lead-list-open"><span>Open journey</span><ChevronRight size={16} aria-hidden="true" /></span>
  </button>
}

function GenericModuleCard({ copy }) {
  return (
    <MobileCard surface="dark">
      <span className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/12 text-[#9fe0bd]">
        <BriefcaseBusiness className="h-5 w-5" />
      </span>
      <h2 className="mt-5 text-[24px] font-semibold text-white">{copy.title}</h2>
      <p className="mt-2 text-[15px] leading-7 text-[#dce8f2]">{copy.intro}</p>
    </MobileCard>
  )
}

export default function MobileModulePage({ moduleKey }) {
  const workspace = useWorkspace()
  const developer = resolveMobileRoleCategory(workspace) === 'developer'
  const organisationContext = useOptionalOrganisation()
  const navigate = useNavigate()
  const leadCreate = useMobileLeadCreate()
  const [searchParams, setSearchParams] = useSearchParams()
  const copy = MODULE_COPY[moduleKey] || MODULE_COPY.transactions
  const ActionIcon = copy.actionIcon
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const [state, setState] = useState(() => {
    const cached = moduleKey === 'transactions' ? getCachedMobileDashboardSnapshot({ workspace, organisation: organisationContext?.organisation, allowStale: true }) : null
    return {
      workspace, organisation: organisationContext?.organisation,
      loading: moduleKey === 'leads' || (moduleKey === 'transactions' && !cached),
      error: '',
      snapshot: cached || (moduleKey === 'transactions' ? getMobileDashboardSnapshot({ workspace }) : null),
      leads: [],
    }
  })
  const createType = searchParams.get('create') || ''
  const selectedLeadType = LEAD_TYPES.find(item => item.key === searchParams.get('leadType'))
  const createOpen = isMobileCreateType(createType) && (
    (moduleKey === 'transactions' && createType === 'transaction') ||
    (moduleKey === 'leads' && (createType === 'lead' || createType === 'prospect'))
  )

  useEffect(() => {
    if (moduleKey !== 'transactions') return undefined
    let active = true
    getMobileDashboardSnapshotAsync({ workspace, organisation: organisationContext?.organisation || null })
      .then((snapshot) => {
        if (!active) return
        setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: '', snapshot, leads: [] })
      })
      .catch((error) => {
        if (!active) return
        if (resolveMobileRoleCategory(workspace) === 'developer') {
          setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: error?.message || "We couldn't load transactions.", snapshot: null, leads: [] })
          return
        }
        try {
          setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: '', snapshot: getMobileDashboardSnapshot({ workspace }), leads: [] })
        } catch {
          setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: error?.message || "We couldn't load transactions.", snapshot: null, leads: [] })
        }
      })
    return () => {
      active = false
    }
  }, [moduleKey, organisationContext?.organisation, workspace])

  useEffect(() => {
    if (moduleKey !== 'leads') return undefined
    const organisationId = resolveMobileOrganisationId(workspace, organisationContext)
    if (!organisationId) {
      setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: '', snapshot: null, leads: [] })
      return undefined
    }
    let active = true
    setState((current) => ({ ...current, loading: true, error: '' }))
    listAgentLeadWorkspaceRows({
      organisationId,
      actor: resolveMobileLeadActor(workspace),
    })
      .then((payload) => {
        if (!active) return
        setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: '', snapshot: null, leads: Array.isArray(payload?.rows) ? payload.rows : [] })
      })
      .catch((error) => {
        if (!active) return
        setState({ workspace, organisation: organisationContext?.organisation, loading: false, error: error?.message || "We couldn't load leads.", snapshot: null, leads: [] })
      })
    return () => {
      active = false
    }
  }, [moduleKey, organisationContext, workspace])

  const rows = useMemo(() => {
    return state.snapshot?.transactions || state.snapshot?.activeWork || []
  }, [state.snapshot?.transactions, state.snapshot?.activeWork])
  const pendingDrafts = useMemo(() => (
    drafts.filter((draft) => mobileDraftMatchesModule(draft, moduleKey))
  ), [drafts, moduleKey])
  const leadRows = useMemo(() => {
    const rows = Array.isArray(state.leads) ? state.leads : []
    return rows.filter(row => (searchParams.get('stage') !== 'new' || isNewAgentLead(row)) &&
      (searchParams.get('scope') !== 'assigned' || isLeadAssignedToActor(row, resolveMobileLeadActor(workspace))))
  }, [state.leads, searchParams, workspace])

  function openTransaction(item) {
    navigate(item.to || '/mobile/transaction/unknown', { state: { mobileWorkspaceItem: item } })
  }

  function openLead(item) {
    navigate(`/mobile/lead/${encodeURIComponent(item.id || item.leadId || item.lead_id || 'unknown')}`, {
      state: { mobileWorkspaceItem: item, mobileWorkspaceDisplay: getLeadDisplay(item) },
    })
  }

  function clearCreateIntent() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    nextParams.delete('leadType')
    setSearchParams(nextParams, { replace: true })
  }

  function handleDraftSaved() {
    setDrafts(getOfflineDrafts())
  }

  function openModuleCreate() {
    if (moduleKey === 'leads') {
      navigate('/mobile/leads?create=lead')
    }
  }

  if (state.loading || ((moduleKey === 'transactions' || moduleKey === 'leads') && (state.workspace !== workspace || state.organisation !== organisationContext?.organisation))) return <MobileLoadingState label={`Loading ${copy.title}`} />
  if (state.error) return <MobileErrorState body={state.error} />

  if (moduleKey === 'transactions') {
    return (
      <div className="mobile-transactions">
        <section className={`mobile-transactions-intro${developer ? ' mobile-transactions-header-card' : ''}`} aria-label="Transaction summary">
          <h1>Transactions</h1>
          <p>{developer ? <>{rows.length} Active<span className="sr-only"> transaction{rows.length === 1 ? '' : 's'}</span></> : <>{rows.length} active transaction{rows.length === 1 ? '' : 's'}</>}</p>
        </section>

        <section className="mobile-transactions-list" aria-label="Active transactions">
          {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
          {rows.length ? (
            rows.map((item) => <MobileTransactionCard key={item.id} item={item} onOpen={openTransaction} />)
          ) : (
            pendingDrafts.length ? null : (
              <MobileEmptyState
                title="No matching transactions."
                body={state.snapshot?.activeWork?.length ? 'Try another stage or search term.' : 'Your transactions will appear here once created.'}
                actionLabel="New Transaction"
                onAction={() => navigate('/mobile/transactions?create=transaction')}
              />
            )
          )}
        </section>

        <MobileCreateSheet
          open={createOpen}
          type={createType}
          route="/mobile/transactions"
          onClose={clearCreateIntent}
          onSaved={handleDraftSaved}
        />
      </div>
    )
  }

  if (moduleKey === 'leads') {
    return (
      <div className="mobile-lead-list-page">
        <header className="mobile-lead-list-header"><h1>{searchParams.get('stage') === 'new' ? 'New leads' : 'Leads'}</h1><button type="button" aria-label="Add lead" onClick={() => {
          if (leadCreate) { leadCreate.openLeadCreate(); return }
          const next = new URLSearchParams(searchParams)
          next.set('create', 'lead'); next.delete('leadType'); setSearchParams(next)
        }}><Plus size={20} aria-hidden="true" /></button></header>
        {searchParams.get('stage') === 'new' && <section>
          <button type="button" className="min-h-11 text-sm text-[#166b50]" onClick={() => {
            const next = new URLSearchParams(searchParams)
            next.delete('stage'); next.delete('scope'); setSearchParams(next)
          }}>View all leads</button>
        </section>}

        <section className="mobile-lead-list" aria-label="Leads">
          {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
          {leadRows.length ? (
            leadRows.map((item) => <MobileLeadCard key={item.id || item.leadId || item.lead_id} item={item} onOpen={openLead} />)
          ) : (
            pendingDrafts.length ? null : (
              <MobileEmptyState
                title={searchParams.get('stage') === 'new' ? 'No new leads.' : copy.emptyTitle}
                body={searchParams.get('stage') === 'new' ? 'New leads assigned to you will appear here.' : copy.emptyBody}
              />
            )
          )}
        </section>
        {createOpen && createType === 'lead' && <Suspense fallback={null}><MobileLeadCreateFlow initialType={selectedLeadType?.key || ''} onClose={clearCreateIntent} /></Suspense>}
        <MobileCreateSheet open={createOpen && createType !== 'lead'} type={createType} route="/mobile/leads" onClose={clearCreateIntent} onSaved={handleDraftSaved} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[34px] font-bold leading-tight text-[#10243a]">{copy.title}</h1>
          <p className="mt-2 text-[16px] leading-7 text-[#60758d]">{copy.intro}</p>
        </div>
        {copy.actionLabel ? (
          <button
            type="button"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#1f7a5a] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(31,122,90,0.24)]"
            onClick={openModuleCreate}
          >
            {ActionIcon ? <ActionIcon className="h-4 w-4" /> : null}
            {copy.actionLabel}
          </button>
        ) : null}
      </section>

      {copy.search ? <MobileSearchBar placeholder={copy.search} /> : null}
      <GenericModuleCard copy={copy} />

      <section className="space-y-3">
        {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
        {pendingDrafts.length ? null : <MobileEmptyState title={copy.emptyTitle} body={copy.emptyBody} />}
      </section>

      <MobileCreateSheet
        open={createOpen}
        type={createType}
        route={`/mobile/${moduleKey}`}
        onClose={clearCreateIntent}
        onSaved={handleDraftSaved}
      />
    </div>
  )
}
