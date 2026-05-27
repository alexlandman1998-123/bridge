import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondPageShell from '../../components/bond/BondPageShell'
import BondReportingScopeBanner from '../../components/bond/BondReportingScopeBanner'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondTransactionStatusBadge from '../../components/bond/BondTransactionStatusBadge'
import BondTransactionTable from '../../components/bond/BondTransactionTable'
import BondViewTabs from '../../components/bond/BondViewTabs'
import {
  BOND_TRANSACTION_VIEW_PARAM,
  bondViews,
  getBondTransactionView,
  getBondTransactionViewFromStatus,
} from '../../config/bondViews'
import { useWorkspace } from '../../context/WorkspaceContext'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

function matchesSearch(row = {}, query = '') {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) return true
  const haystack = [
    row.client,
    row.applicationReference,
    row.transactionReference,
    row.property,
    row.partner,
    row.attorney,
    row.consultant,
    row.processor,
    row.bank,
    row.financeStageLabel,
    row.transferStageLabel,
    row.nextAction,
    row.riskStatus,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ')
  return haystack.includes(normalizedQuery)
}

export default function BondTransactionsPage({
  service = bondCommandCenterService,
  initialState = null,
}) {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      snapshot: null,
    },
  )

  const selectedView = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const view = normalizeText(params.get(BOND_TRANSACTION_VIEW_PARAM))
    if (view) return getBondTransactionView(view)
    const legacyStatus = normalizeText(params.get('status') || 'all') || 'all'
    return getBondTransactionViewFromStatus(legacyStatus)
  }, [location.search])
  const selectedStatus = selectedView.status || 'all'
  const selectedDevelopmentId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeText(params.get('developmentId')) || 'all'
  }, [location.search])

  const loadTransactions = useCallback(async () => {
    if (!workspaceId) {
      setState({
        loading: false,
        error: 'missing_workspace_context',
        snapshot: null,
      })
      return
    }

    setState((previous) => ({ ...previous, loading: true, error: '' }))

    try {
      const snapshot = await service.getBondTransactionTrackerSnapshot(workspaceContext, workspaceId, {
        status: selectedStatus,
        developmentId: selectedDevelopmentId,
      })
      setState({
        loading: false,
        error: '',
        snapshot,
      })
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'transaction_tracker_load_failed'),
        snapshot: null,
      })
    }
  }, [selectedDevelopmentId, selectedStatus, service, workspaceContext, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions()
  }, [loadTransactions])

  const filteredRows = useMemo(
    () => (state.snapshot?.rows || []).filter((row) => matchesSearch(row, search)),
    [search, state.snapshot?.rows],
  )
  const tabCounts = useMemo(() => {
    const cardsByStatus = new Map((state.snapshot?.statusCards || []).map((card) => [card.key, card.count]))
    return bondViews.transactions.tabs.reduce((accumulator, tab) => {
      accumulator[tab.key] = Number(cardsByStatus.get(tab.status) || 0)
      return accumulator
    }, {})
  }, [state.snapshot?.statusCards])

  const handleViewChange = useCallback(
    (viewKey) => {
      const tab = getBondTransactionView(viewKey)
      const params = new URLSearchParams(location.search)
      params.set(BOND_TRANSACTION_VIEW_PARAM, tab.key)
      params.delete('status')
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate],
  )

  const handleDevelopmentChange = useCallback(
    (event) => {
      const nextDevelopmentId = event.target.value
      const params = new URLSearchParams(location.search)
      if (nextDevelopmentId === 'all') params.delete('developmentId')
      else params.set('developmentId', nextDevelopmentId)
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate],
  )

  if (!workspaceId) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  if (!state.loading && state.error) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load the transaction tracker.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please refresh or try another workspace.</p>
      </section>
    )
  }

  const snapshot = state.snapshot

  return (
    <BondPageShell>
      <BondPageHeader
        title={bondViews.transactions.title}
        description={bondViews.transactions.description}
        primaryLabel={bondViews.transactions.primaryActionLabel}
        secondaryLabel={bondViews.transactions.secondaryActionLabel}
        onPrimary={() => navigate('/bond/pipeline?view=new')}
      />
      <BondViewTabs
        tabs={bondViews.transactions.tabs}
        value={selectedView.key}
        counts={tabCounts}
        onChange={handleViewChange}
      />

      <BondSectionCard
        className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]"
        eyebrow="Search"
        title="Search active bond files"
        description="Search across buyer, property, bank, agent, attorney, consultant, stage, next action, and transaction references."
        action={(
          <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-[620px]">
            <select
              value={selectedDevelopmentId}
              onChange={handleDevelopmentChange}
              className="h-12 rounded-[16px] border border-[#dbe5f0] bg-white px-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
            >
              {(state.snapshot?.developmentOptions || [{ id: 'all', label: 'All Developments' }]).map((option) => (
                <option key={option.id || option.value} value={option.value || option.id}>
                  {option.label || option.name}
                </option>
              ))}
            </select>
            <label className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search buyer, property, bank, stage…"
                className="h-12 w-full rounded-[16px] border border-[#dbe5f0] bg-white pl-11 pr-4 text-sm text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
              />
            </label>
          </div>
        )}
      />

      <BondReportingScopeBanner reportingScope={snapshot?.reportingScope || null} />

      {snapshot ? (
        <div className="flex flex-wrap items-center gap-3">
          <BondTransactionStatusBadge status={snapshot.selectedStatus === 'all' ? 'active' : snapshot.selectedStatus} label={snapshot.statusLabel} />
          <p className="text-sm text-[#60758d]">{filteredRows.length} transactions in view</p>
        </div>
      ) : null}

      {!state.loading && snapshot?.totalRows === 0 ? (
        <BondEmptyState title={snapshot.emptyState.title} description={snapshot.emptyState.description} />
      ) : null}

      {snapshot ? <BondTransactionTable rows={filteredRows} /> : null}

      {state.loading ? (
        <BondEmptyState title="Loading linked bond transactions…" description="We are assembling the finance and transfer view now." />
      ) : null}
    </BondPageShell>
  )
}
