import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BondEmptyState from '../../components/bond/BondEmptyState'
import BondPageShell from '../../components/bond/BondPageShell'
import BondReportingScopeBanner from '../../components/bond/BondReportingScopeBanner'
import BondSectionCard from '../../components/bond/BondSectionCard'
import BondTransactionStatusBadge from '../../components/bond/BondTransactionStatusBadge'
import BondTransactionTable from '../../components/bond/BondTransactionTable'
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

  const selectedStatus = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeText(params.get('status') || 'all') || 'all'
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
  }, [selectedStatus, service, workspaceContext, workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTransactions()
  }, [loadTransactions])

  const filteredRows = useMemo(
    () => (state.snapshot?.rows || []).filter((row) => matchesSearch(row, search)),
    [search, state.snapshot?.rows],
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
      <BondSectionCard
        className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]"
        eyebrow="Bond Transactions"
        title="Linked property deals through registration"
        description="Track the property transaction after finance involvement starts. Bond applications stay linked here through approval, grant signing, attorney instruction, transfer progress, and final registration."
        action={(
          <label className="relative w-full xl:max-w-[360px]">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search buyer, property, bank, stage…"
              className="h-12 w-full rounded-[16px] border border-[#dbe5f0] bg-white pl-11 pr-4 text-sm text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
            />
          </label>
        )}
      />

      <BondReportingScopeBanner reportingScope={snapshot?.reportingScope || null} />

      {snapshot ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {snapshot.statusCards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                const params = new URLSearchParams(location.search)
                params.set('status', card.key)
                navigate(`/transactions?${params.toString()}`)
              }}
              className={`rounded-[20px] border p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.03)] transition hover:border-[#ccd9e8] ${selectedStatus === card.key ? 'border-[#b8cce0] bg-[#f7fbff]' : 'border-[#e3ebf5] bg-white'}`.trim()}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5]">{card.label}</p>
              <p className="mt-3 text-[1.75rem] font-semibold tracking-[-0.03em] text-[#142132]">{card.count}</p>
              {selectedStatus === card.key ? <p className="mt-2 text-xs font-semibold text-[#31506a]">Current filter</p> : null}
            </button>
          ))}
        </section>
      ) : null}

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
