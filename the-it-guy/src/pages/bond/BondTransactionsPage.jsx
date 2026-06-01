import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageHeader from '../../components/bond/BondPageHeader'
import BondPageShell from '../../components/bond/BondPageShell'
import BondTransactionTable, { APPLICATION_PROGRESS_STAGE_OPTIONS, resolveBondProgressStage } from '../../components/bond/BondTransactionTable'
import { BOND_TRANSACTION_VIEW_PARAM, bondViews, getBondTransactionView, getBondTransactionViewFromStatus } from '../../config/bondViews'
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

function normalizeStatusFilter(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/_/g, '-')
  if (['all', 'active', 'needs-action', 'at-risk', 'completed'].includes(normalized)) {
    return normalized
  }
  return ''
}

function statusFilterFromLegacyStatus(status = 'all') {
  const normalized = normalizeText(status).toLowerCase()
  if (['at_risk', 'at-risk'].includes(normalized)) return 'at-risk'
  if (normalized === 'registered') return 'completed'
  if (normalized === 'declined') return 'completed'
  if (normalized === 'cancelled') return 'completed'
  if (normalized === 'all') return 'all'
  if (normalized === 'active') return 'active'
  return 'active'
}

function normalizeSortMode(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/_/g, '-')
  if (normalized === 'last_activity' || normalized === 'last-activity') return 'last_activity'
  return 'last_activity'
}

function parseRowsForQuery(rows = []) {
  return Array.isArray(rows) ? rows : []
}

function parseActivityAt(row = {}) {
  const date = new Date(row?.lastActivityAt || 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getDefaultSortRows(rows = []) {
  return [...parseRowsForQuery(rows)].sort((left, right) => parseActivityAt(right) - parseActivityAt(left))
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

function matchesStatusFilter(row = {}, filter = 'all') {
  const status = normalizeText(row?.status).toLowerCase()
  const nextAction = normalizeText(row?.nextAction).toLowerCase()

  if (filter === 'active') {
    return !['registered', 'at_risk', 'cancelled'].includes(status)
  }
  if (filter === 'needs-action') {
    return !['registered', 'cancelled'].includes(status) && nextAction && nextAction !== 'no next action set'
  }
  if (filter === 'at-risk') {
    return status === 'at_risk'
  }
  if (filter === 'completed') {
    return status === 'registered'
  }
  return true
}

function matchesStageFilter(row = {}, filter = 'all') {
  if (filter === 'all') return true
  return resolveBondProgressStage(row) === filter
}

const STATUS_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'needs-action', label: 'Needs Action' },
  { key: 'at-risk', label: 'At Risk' },
  { key: 'completed', label: 'Completed' },
]

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
  const selectedStatusFilter = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const explicit = normalizeStatusFilter(params.get('filter'))
    if (explicit) return explicit
    return statusFilterFromLegacyStatus(selectedView.status)
  }, [location.search, selectedView.status])
  const selectedStageFilter = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const stage = normalizeText(params.get('stage') || 'all')
    return APPLICATION_PROGRESS_STAGE_OPTIONS.some((option) => option.key === stage) ? stage : 'all'
  }, [location.search])
  const selectedSortMode = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeSortMode(params.get('sort'))
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
        error: String(error?.message || 'application_tracker_load_failed'),
        snapshot: null,
      })
    }
  }, [selectedDevelopmentId, selectedStatus, service, workspaceContext, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions()
  }, [loadTransactions])

  const filteredRows = useMemo(() => {
    const baselineRows = getDefaultSortRows(state.snapshot?.rows).filter((row) => matchesSearch(row, search))
    const statusFilteredRows = baselineRows.filter((row) => matchesStatusFilter(row, selectedStatusFilter))
    return statusFilteredRows.filter((row) => matchesStageFilter(row, selectedStageFilter))
  }, [search, selectedStageFilter, selectedStatusFilter, state.snapshot?.rows, selectedSortMode])

  const handleStatusFilterChange = useCallback(
    (nextFilter) => {
      const params = new URLSearchParams(location.search)
      if (nextFilter === 'all') params.delete('filter')
      else params.set('filter', nextFilter)
      if (selectedDevelopmentId && selectedDevelopmentId !== 'all') {
        params.set('developmentId', selectedDevelopmentId)
      } else {
        params.delete('developmentId')
      }
      if (selectedSortMode && selectedSortMode !== 'last_activity') {
        params.set('sort', selectedSortMode)
      } else {
        params.delete('sort')
      }
      if (selectedStageFilter !== 'all') {
        params.set('stage', selectedStageFilter)
      } else {
        params.delete('stage')
      }
      navigate(`${bondViews.transactions.basePath}?${params.toString()}`)
    },
    [location.search, navigate, selectedDevelopmentId, selectedSortMode, selectedStageFilter],
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

  const handleStageFilterChange = useCallback(
    (event) => {
      const nextStage = event.target.value
      const params = new URLSearchParams(location.search)
      if (nextStage === 'all') params.delete('stage')
      else params.set('stage', nextStage)
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
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load the applications tracker.</p>
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

      <div className="rounded-[18px] border border-[#dce6f2] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUS_FILTER_OPTIONS.map((option) => {
            const active = option.key === selectedStatusFilter
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleStatusFilterChange(option.key)}
                className={`inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold transition ${
                  active
                    ? 'bg-[#102448] text-white shadow-[0_10px_20px_rgba(16,36,72,0.16)]'
                    : 'text-[#536d87] hover:bg-[#f2f7fd] hover:text-[#17324b]'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications..."
              className="h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] pl-11 pr-4 text-sm text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
            />
          </label>

          <select
            value={selectedDevelopmentId}
            onChange={handleDevelopmentChange}
            className="h-11 rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
          >
            {(snapshot?.developmentOptions || [{ id: 'all', label: 'All Developments' }]).map((option) => (
              <option key={option.id || option.value} value={option.value || option.id}>
                {option.label || option.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStageFilter}
            onChange={handleStageFilterChange}
            className="h-11 rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
          >
            {APPLICATION_PROGRESS_STAGE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[#72869b]">Sort</label>
            <select
              value={selectedSortMode}
              disabled
              className="h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-[#f9fbff] px-4 text-sm font-medium text-[#17324d] outline-none"
            >
              <option value="last_activity">Last activity</option>
            </select>
          </div>
        </div>
      </div>

      {snapshot ? <BondTransactionTable rows={filteredRows} /> : null}

      {state.loading ? (
        <BondEmptyState title="Loading linked bond applications..." description="We are assembling the finance and transfer view now." />
      ) : null}
    </BondPageShell>
  )
}
