import { BriefcaseBusiness, ChevronRight, Plus, Upload, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet'
import { isMobileCreateType, mobileDraftMatchesModule } from '../../components/mobile-shell/mobileCreateConfig'
import { MobileCard, MobileEmptyState, MobileErrorState, MobileFilterChips, MobileLoadingState, MobileSearchBar } from '../../components/mobile-shell/MobileShellStates'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { getMobileDashboardSnapshot, getMobileDashboardSnapshotAsync } from '../../services/mobileDashboardService'
import { getOfflineDrafts } from '../../services/mobileProductivityService'

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
    actionLabel: 'New Lead',
    actionIcon: Plus,
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

const TRANSACTION_FILTERS = ['All', 'Lead', 'OTP', 'Finance', 'Transfer', 'Registration', 'Closed', 'At Risk']

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

function GenericModuleCard({ copy }) {
  const Icon = copy.actionLabel?.includes('Lead') ? UsersRound : BriefcaseBusiness
  return (
    <MobileCard surface="dark">
      <span className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white/12 text-[#9fe0bd]">
        <Icon className="h-5 w-5" />
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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const [state, setState] = useState(() => ({
    loading: moduleKey === 'transactions',
    error: '',
    snapshot: moduleKey === 'transactions' ? getMobileDashboardSnapshot({ workspace }) : null,
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

  const rows = useMemo(() => {
    const source = state.snapshot?.activeWork || []
    const normalizedQuery = query.trim().toLowerCase()
    const normalizedFilter = filter.toLowerCase()
    return source.filter((item) => {
      const haystack = `${item.title} ${item.eyebrow} ${item.stage} ${item.status}`.toLowerCase()
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery)
      const matchesFilter = filter === 'All' || haystack.includes(normalizedFilter) || (filter === 'At Risk' && haystack.includes('overdue'))
      return matchesQuery && matchesFilter
    })
  }, [filter, query, state.snapshot?.activeWork])
  const pendingDrafts = useMemo(() => (
    drafts.filter((draft) => mobileDraftMatchesModule(draft, moduleKey))
  ), [drafts, moduleKey])

  function openTransaction(item) {
    navigate(item.to || '/mobile/transaction/unknown')
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
          <p className="mt-2 text-[16px] leading-7 text-[#60758d]">Track live deals and the next field action.</p>
        </section>

        <MobileSearchBar placeholder="Search transactions..." value={query} onChange={setQuery} />
        <MobileFilterChips items={TRANSACTION_FILTERS} active={filter} onChange={setFilter} />

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
