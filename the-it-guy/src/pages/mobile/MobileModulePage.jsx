import { BriefcaseBusiness, ChevronRight, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet'
import { isMobileCreateType, mobileDraftMatchesModule } from '../../components/mobile-shell/mobileCreateConfig'
import { MobileCard, MobileEmptyState, MobileErrorState, MobileLoadingState, MobileSearchBar } from '../../components/mobile-shell/MobileShellStates'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService'
import { getOfflineDrafts } from '../../services/mobileProductivityService'
import { listAgentLeadWorkspaceRows } from '../../services/agentLeadWorkspaceService'

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

function getPlatformLogo(source = '') {
  const normalized = normalizeText(source).toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (normalized.includes('property24') || normalized === 'p24') {
    return { src: '/lead-sources/property24.png', alt: 'Property24' }
  }
  if (normalized.includes('privateproperty')) {
    return { src: '/lead-sources/private-property.jpeg', alt: 'Private Property' }
  }
  return null
}

function TransactionThumb({ title = '' }) {
  return (
    <span className="relative h-[78px] w-[78px] shrink-0 overflow-hidden rounded-[22px] bg-[#dce8f2]">
      <span className="absolute inset-0 bg-[linear-gradient(135deg,#dce8f2_0%,#1f7a5a_58%,#10243a_100%)]" />
      <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-[#10243a]">
        {String(title || 'A').slice(0, 1).toUpperCase()}
      </span>
    </span>
  )
}

function MobileTransactionCard({ item, onOpen }) {
  return (
    <button
      type="button"
      className="flex w-full gap-4 rounded-[28px] border border-white/80 bg-white p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
      onClick={() => onOpen(item)}
    >
      <TransactionThumb title={item.title} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold text-[#10243a]">{item.title}</span>
            <span className="mt-1 block truncate text-[13px] text-[#60758d]">{item.eyebrow}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
        </span>
        <span className="mt-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-[#e8f6ef] px-3 py-1 text-[12px] font-semibold text-[#1f7a5a]">{item.stage}</span>
          <span className="text-[12px] font-semibold text-[#60758d]">{item.progress || 0}%</span>
        </span>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[#edf3f8]">
          <span className="block h-full rounded-full bg-[#1f7a5a]" style={{ width: `${Math.max(Math.min(item.progress || 0, 100), 4)}%` }} />
        </span>
        <span className="mt-3 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[13px] font-semibold text-[#10243a]">{item.status}</span>
          {item.value ? <span className="shrink-0 text-[13px] font-semibold text-[#10243a]">{item.value}</span> : null}
        </span>
      </span>
    </button>
  )
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
  const nextAction = normalizeText(row.nextTask?.title || row.latestActivity?.title || row.recommendations?.[0]?.title) || 'Open buyer journey'
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
  const platformLogo = getPlatformLogo(display.source)
  return (
    <button
      type="button"
      className="w-full overflow-hidden rounded-[28px] border border-white/80 bg-white text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
      onClick={() => onOpen(item)}
    >
      <span className="block bg-[linear-gradient(135deg,#fff6e5_0%,#f8fafc_45%,#e8f6ef_100%)] px-4 py-3">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="mt-1 block truncate text-[18px] font-semibold text-[#10243a]">{display.title}</span>
          </span>
          <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white px-2 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
            {platformLogo ? (
              <img src={platformLogo.src} alt={platformLogo.alt} className="max-h-7 max-w-full object-contain" loading="lazy" />
            ) : (
              <span className="text-[11px] font-bold uppercase text-[#1f7a5a]">{display.source.slice(0, 2) || 'PL'}</span>
            )}
          </span>
        </span>
      </span>
      <span className="block p-4">
        <span className="block truncate text-[14px] font-semibold text-[#10243a]">{display.property}</span>
        <span className="mt-1 block text-[13px] text-[#60758d]">{display.nextAction}</span>
        <span className="mt-4 grid grid-cols-3 gap-2">
          <span className="rounded-2xl bg-[#f8fafc] p-3">
            <span className="block text-[10px] font-semibold uppercase text-[#60758d]">Agent</span>
            <span className="mt-1 block truncate text-[12px] font-bold text-[#10243a]">{display.assignedAgent}</span>
          </span>
          <span className="rounded-2xl bg-[#f8fafc] p-3">
            <span className="block text-[10px] font-semibold uppercase text-[#60758d]">Age</span>
            <span className="mt-1 block truncate text-[12px] font-bold text-[#10243a]">{display.age}</span>
          </span>
          <span className="rounded-2xl bg-[#f8fafc] p-3">
            <span className="block text-[10px] font-semibold uppercase text-[#60758d]">Value</span>
            <span className="mt-1 block truncate text-[12px] font-bold text-[#10243a]">{display.value || 'Pending'}</span>
          </span>
        </span>
        <span className="mt-4 flex items-center justify-between rounded-2xl bg-[#10243a] px-4 py-3 text-white">
          <span className="text-[13px] font-semibold">Open buyer journey</span>
          <ChevronRight className="h-4 w-4" />
        </span>
      </span>
    </button>
  )
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
  const organisationContext = useOptionalOrganisation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const copy = MODULE_COPY[moduleKey] || MODULE_COPY.transactions
  const ActionIcon = copy.actionIcon
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const [state, setState] = useState(() => ({
    loading: moduleKey === 'transactions' || moduleKey === 'leads',
    error: '',
    snapshot: moduleKey === 'transactions' ? getMobileDashboardSnapshot({ workspace }) : null,
    leads: [],
  }))
  const createType = searchParams.get('create') || ''
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
        setState({ loading: false, error: '', snapshot })
      })
      .catch((error) => {
        if (!active) return
        try {
          setState({ loading: false, error: '', snapshot: getMobileDashboardSnapshot({ workspace }) })
        } catch {
          setState({ loading: false, error: error?.message || "We couldn't load transactions.", snapshot: null })
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
      setState({ loading: false, error: '', snapshot: null, leads: [] })
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
        setState({ loading: false, error: '', snapshot: null, leads: Array.isArray(payload?.rows) ? payload.rows : [] })
      })
      .catch((error) => {
        if (!active) return
        setState({ loading: false, error: error?.message || "We couldn't load leads.", snapshot: null, leads: [] })
      })
    return () => {
      active = false
    }
  }, [moduleKey, organisationContext, workspace])

  const rows = useMemo(() => {
    return state.snapshot?.activeWork || []
  }, [state.snapshot?.activeWork])
  const pendingDrafts = useMemo(() => (
    drafts.filter((draft) => mobileDraftMatchesModule(draft, moduleKey))
  ), [drafts, moduleKey])
  const leadRows = useMemo(() => {
    return state.leads || []
  }, [state.leads])

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

  if (state.loading) return <MobileLoadingState label={`Loading ${copy.title}`} />
  if (state.error) return <MobileErrorState body={state.error} />

  if (moduleKey === 'transactions') {
    return (
      <div className="space-y-6">
        <section className="pt-2">
          <h1 className="text-[34px] font-bold leading-tight text-[#10243a]">Transactions</h1>
        </section>

        <section className="space-y-3">
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
      <div className="space-y-6">
        <section className="pt-2">
          <h1 className="text-[34px] font-bold leading-tight text-[#10243a]">Leads</h1>
        </section>

        <section className="space-y-3">
          {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
          {leadRows.length ? (
            leadRows.map((item) => <MobileLeadCard key={item.id || item.leadId || item.lead_id} item={item} onOpen={openLead} />)
          ) : (
            pendingDrafts.length ? null : (
              <MobileEmptyState
                title={state.leads.length ? 'No matching leads.' : copy.emptyTitle}
                body={state.leads.length ? 'Try another source, stage, or search term.' : copy.emptyBody}
              />
            )
          )}
        </section>
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
