import { ArrowRight, ArrowUpRight, BriefcaseBusiness, CheckCircle2, MoreHorizontal, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { getFinanceReadinessSummary, shouldShowBondReadinessCta } from '../core/finance/financeReadinessSelectors'
import { calculateApprovalProbability, calculateOperationalRisk, calculateTransactionVelocity } from '../services/financeIntelligenceService'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

const MAIN_STAGE_PROGRESS = {
  AVAIL: 0,
  DEP: 20,
  OTP: 35,
  FIN: 52,
  ATTY: 68,
  XFER: 84,
  REG: 100,
}

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'development', label: 'Development' },
  { key: 'second_hand', label: 'Second-Hand' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'cash', label: 'Cash' },
  { key: 'bond', label: 'Bond' },
  { key: 'registered', label: 'Registered' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'active', label: 'Active' },
]

function parseDate(value) {
  const parsed = new Date(value || 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDaysSince(value) {
  const parsed = parseDate(value)
  if (!parsed) return null
  const delta = Date.now() - parsed.getTime()
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.floor(delta / (1000 * 60 * 60 * 24))
}

function formatRelativeDate(value) {
  const days = getDaysSince(value)
  if (days === null) return 'No update'
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function formatMainStage(row) {
  const key = String(row?.mainStage || row?.transaction?.current_main_stage || '').trim() || getMainStageFromDetailedStage(row?.stage || '')
  if (!key) return { key: '', label: 'Unmapped', tone: 'default' }
  const normalized = key.toUpperCase()
  let tone = 'default'
  if (['REG'].includes(normalized)) tone = 'success'
  if (['XFER', 'ATTY'].includes(normalized)) tone = 'warning'
  return {
    key: normalized,
    label: MAIN_STAGE_LABELS[normalized] || normalized,
    tone,
  }
}

function formatFinanceStage(row) {
  const financeType = String(row?.transaction?.finance_type || '').trim().toLowerCase()
  const nextAction = String(row?.transaction?.next_action || '').trim()
  if (!financeType && !nextAction) return { label: 'Not set', detail: 'No finance workflow yet' }

  const label = financeType === 'bond'
    ? 'Bond'
    : financeType === 'cash'
      ? 'Cash'
      : financeType === 'combination'
        ? 'Combination'
        : financeType || 'Finance'

  return {
    label,
    detail: nextAction || 'Awaiting finance update',
  }
}

function formatTransactionStatus(row) {
  const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
  if (lifecycle === 'registered') return { label: 'Registered', className: 'border border-[#d5eadf] bg-[#edf9f2] text-[#1f7a45]' }
  if (lifecycle === 'completed') return { label: 'Completed', className: 'border border-[#d5eadf] bg-[#edf9f2] text-[#1f7a45]' }
  if (lifecycle === 'archived') return { label: 'Archived', className: 'border border-[#dce6f2] bg-[#f5f8fc] text-[#5a6f88]' }
  if (lifecycle === 'cancelled') return { label: 'Cancelled', className: 'border border-[#efd4d2] bg-[#fff4f3] text-[#a53f36]' }
  if (String(row?.stage || '').trim().toLowerCase() === 'registered') {
    return { label: 'Registered', className: 'border border-[#d5eadf] bg-[#edf9f2] text-[#1f7a45]' }
  }
  return { label: 'Active', className: 'border border-[#d8e4f2] bg-[#f3f8fd] text-[#29567f]' }
}

function getPropertyLabel(row) {
  const unitLabel = row?.unit?.unit_number ? `Unit ${row.unit.unit_number}` : ''
  const addressLabel = [
    row?.transaction?.property_address_line_1,
    row?.transaction?.suburb,
  ].filter(Boolean).join(', ')
  return unitLabel || addressLabel || 'Property pending'
}

function getDevelopmentLabel(row) {
  return row?.development?.name || row?.transaction?.property_description || 'Listing / development pending'
}

function getProgressPercent(row, mainStageKey = '') {
  const explicit = Number(row?.workspace?.progressPercent ?? row?.progressPercent)
  if (Number.isFinite(explicit) && explicit >= 0) {
    return Math.max(0, Math.min(100, Math.round(explicit)))
  }

  return MAIN_STAGE_PROGRESS[mainStageKey] ?? (String(row?.stage || '').toLowerCase() === 'registered' ? 100 : 20)
}

function getHealth(row, mainStageKey = '') {
  const status = String(row?.transaction?.status || row?.transaction?.operational_state || '').trim().toLowerCase()
  const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
  const stage = String(row?.stage || '').trim().toLowerCase()
  const daysSinceUpdate = getDaysSince(row?.transaction?.updated_at || row?.transaction?.created_at)

  if (['blocked', 'on_hold', 'on hold'].includes(status) || stage.includes('blocked')) {
    return { label: 'Blocked', className: 'transaction-health-blocked' }
  }
  if (['archived', 'cancelled'].includes(lifecycle)) {
    return { label: 'Waiting', className: 'transaction-health-waiting' }
  }
  if (mainStageKey === 'REG' || lifecycle === 'registered' || lifecycle === 'completed') {
    return { label: 'On Track', className: 'transaction-health-track' }
  }
  if (daysSinceUpdate !== null && daysSinceUpdate >= 10) {
    return { label: 'Attention', className: 'transaction-health-attention' }
  }
  if (!row?.transaction?.updated_at && !row?.transaction?.created_at) {
    return { label: 'Waiting', className: 'transaction-health-waiting' }
  }
  return { label: 'On Track', className: 'transaction-health-track' }
}

function getEmptyStateCopy(isPrincipalView) {
  if (isPrincipalView) {
    return 'Transactions will appear here once leads are converted, offers are accepted, or a deal is created directly.'
  }
  return 'Your assigned transactions will appear here once a lead is converted, an offer is accepted, or a deal is allocated to you.'
}

function getTableMetrics(rows = []) {
  return rows.reduce(
    (accumulator, row) => {
      const status = formatTransactionStatus(row).label.toLowerCase()
      const mainStage = formatMainStage(row).key
      accumulator.total += 1
      if (status === 'active') accumulator.active += 1
      if (status === 'registered' || mainStage === 'REG') accumulator.registered += 1
      if (['ATTY', 'XFER'].includes(mainStage)) accumulator.transfer += 1
      if (String(row?.transaction?.finance_type || '').trim().toLowerCase() === 'bond') accumulator.bond += 1
      return accumulator
    },
    { total: 0, active: 0, registered: 0, transfer: 0, bond: 0 },
  )
}

function rowMatchesQuickFilter(row, filterKey) {
  if (filterKey === 'all') return true
  const transaction = row?.transaction || {}
  const financeType = String(transaction.finance_type || '').trim().toLowerCase()
  const typeText = [
    transaction.transaction_type,
    transaction.property_type,
    transaction.scope,
    transaction.source_type,
    row?.development?.id ? 'development' : '',
  ].join(' ').toLowerCase()
  const stage = String(row?.stage || transaction.lifecycle_state || '').toLowerCase()
  const mainStage = formatMainStage(row).key
  const health = getHealth(row, mainStage).label.toLowerCase()

  if (filterKey === 'development') return Boolean(row?.development?.id) || typeText.includes('development')
  if (filterKey === 'second_hand') return typeText.includes('second') || typeText.includes('private') || (!row?.development?.id && !typeText.includes('commercial'))
  if (filterKey === 'commercial') return typeText.includes('commercial')
  if (filterKey === 'cash') return financeType === 'cash'
  if (filterKey === 'bond') return financeType === 'bond' || financeType === 'combination'
  if (filterKey === 'registered') return mainStage === 'REG' || stage.includes('registered')
  if (filterKey === 'blocked') return health === 'blocked'
  if (filterKey === 'active') return !['REG'].includes(mainStage) && !['registered', 'completed', 'archived', 'cancelled'].includes(stage)
  return true
}

function AgentTransactionsTable({
  rows,
  onRowClick,
  onDeleteTransaction = null,
  deletingTransactionId = null,
  title = 'Transactions',
  isPrincipalView = false,
  onCreateTransaction = null,
  onOpenPipeline = null,
}) {
  const [page, setPage] = useState(1)
  const [quickFilter, setQuickFilter] = useState('all')
  const pageSize = 20
  const filteredRows = useMemo(
    () => (rows || []).filter((row) => rowMatchesQuickFilter(row, quickFilter)),
    [quickFilter, rows],
  )
  const totalPages = Math.max(1, Math.ceil((filteredRows?.length || 0) / pageSize))
  const currentPage = Math.min(page, totalPages)
  const metrics = useMemo(() => getTableMetrics(rows || []), [rows])
  const hasAnyRows = Boolean((rows || []).length)
  const hasActiveFilter = quickFilter !== 'all'

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (filteredRows || []).slice(start, start + pageSize)
  }, [currentPage, filteredRows])

  const pageStart = filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0
  const pageEnd = Math.min(filteredRows.length, currentPage * pageSize)

  return (
    <DataTable
      title={title}
      copy={isPrincipalView ? 'Organisation-wide transaction oversight across agents, stages, and bottlenecks.' : 'Your assigned transaction workload, stages, and next operational actions.'}
      actions={
        hasAnyRows ? (
          <div className="agent-transactions-metrics">
            <div className="agent-transaction-metric">
              <strong>{metrics.total}</strong>
              <span>Transactions</span>
            </div>
            <div className="agent-transaction-metric">
              <strong>{metrics.active}</strong>
              <span>Active</span>
            </div>
            <div className="agent-transaction-metric">
              <strong>{metrics.transfer}</strong>
              <span>Transfer</span>
            </div>
            <div className="agent-transaction-metric">
              <strong>{metrics.registered}</strong>
              <span>Registered</span>
            </div>
          </div>
        ) : (
          <div className="agent-transactions-empty-summary">
            <span>Waiting for first deal</span>
            <strong>0 live transactions</strong>
          </div>
        )
      }
      className="table-panel agent-transactions-panel"
    >
      {hasAnyRows ? (
        <div className="transaction-ops-filter-bar" aria-label="Transaction quick filters">
          <div className="transaction-ops-filter-list">
            {QUICK_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`transaction-ops-filter ${quickFilter === filter.key ? 'is-active' : ''}`.trim()}
                onClick={() => {
                  setQuickFilter(filter.key)
                  setPage(1)
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {filteredRows.length > pageSize ? (
            <span className="transaction-ops-count">Showing {pageStart}-{pageEnd}</span>
          ) : null}
        </div>
      ) : null}

      {filteredRows.length === 0 ? (
        <div className={`agent-transactions-empty-state ${hasAnyRows ? 'is-filtered' : 'is-first-run'}`.trim()}>
          <span className="agent-transactions-empty-icon">
            {hasAnyRows ? <Search size={22} /> : <BriefcaseBusiness size={24} />}
          </span>
          <div className="agent-transactions-empty-copy">
            <span className="agent-transactions-empty-kicker">{hasAnyRows ? 'Nothing matched' : 'Transactions workspace'}</span>
            <strong>{hasAnyRows ? 'No transactions match this view' : 'No transactions yet'}</strong>
            <p>
              {hasAnyRows
                ? 'Clear the selected filter to return to all transaction activity.'
                : getEmptyStateCopy(isPrincipalView)}
            </p>
          </div>

          {hasAnyRows ? (
            <Button type="button" variant="secondary" onClick={() => setQuickFilter('all')}>
              Clear filters
            </Button>
          ) : (
            <>
              <div className="agent-transactions-empty-actions">
                {onCreateTransaction ? (
                  <Button type="button" onClick={onCreateTransaction}>
                    <Plus size={16} />
                    Create transaction
                  </Button>
                ) : null}
                {onOpenPipeline ? (
                  <Button type="button" variant="secondary" onClick={onOpenPipeline}>
                    Open pipeline
                    <ArrowRight size={16} />
                  </Button>
                ) : null}
              </div>
              <div className="agent-transactions-empty-steps" aria-label="How transactions start">
                {[
                  'Convert a qualified lead',
                  'Capture buyer and seller details',
                  'Track finance, transfer, and registration',
                ].map((step) => (
                  <span key={step}>
                    <CheckCircle2 size={15} />
                    {step}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <DataTableInner className="units-table agent-transactions-table transaction-ops-table">
          <thead>
            <tr>
              <th className="agent-transactions-sticky-first">Listing / Development</th>
              <th>Client</th>
              <th>Progress</th>
              <th>Health</th>
              <th>Finance Type</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
            const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || null
            const canOpenRow = Boolean(row?.transaction?.id || row?.unit?.id)
            const mainStage = formatMainStage(row)
            const financeStage = formatFinanceStage(row)
            const health = getHealth(row, mainStage.key)
            const progressPercent = getProgressPercent(row, mainStage.key)
            const approvalConfidence = calculateApprovalProbability(row)
            const operationalRisk = calculateOperationalRisk(row)
            const velocity = calculateTransactionVelocity(row)
            const transactionConfidence = Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2))
            const buyerName = row?.buyer?.name || 'Buyer pending'
            const propertyLabel = getPropertyLabel(row)
            const developmentLabel = getDevelopmentLabel(row)

            return (
              <tr
                key={row?.transaction?.id || row?.unit?.id || `${row?.buyer?.id || 'row'}-${row?.stage || 'stage'}`}
                className={`${canOpenRow ? 'ui-data-row-clickable' : ''} ${index % 2 === 0 ? 'agent-transactions-row-even' : 'agent-transactions-row-odd'}`.trim()}
                onClick={() => {
                  if (!canOpenRow) return
                  onRowClick(row)
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && canOpenRow) {
                    event.preventDefault()
                    onRowClick(row)
                  }
                }}
                tabIndex={canOpenRow ? 0 : -1}
                role={canOpenRow ? 'button' : undefined}
              >
                <td className="agent-transactions-sticky-first" data-label="Listing / Development">
                  <div className="transaction-list-cell">
                    <strong className="transaction-cell-primary" title={developmentLabel}>{developmentLabel}</strong>
                    <small className="transaction-cell-secondary" title={propertyLabel}>{propertyLabel}</small>
                  </div>
                </td>
                <td data-label="Client">
                  <div className="transaction-list-cell">
                    <strong className="transaction-cell-primary" title={buyerName}>{buyerName}</strong>
                    <small className="transaction-cell-secondary" title={row?.buyer?.email || ''}>{row?.buyer?.email || row?.buyer?.phone || 'No contact details'}</small>
                  </div>
                </td>
                <td data-label="Progress">
                  <div className="transaction-progress-cell">
                    <div className="transaction-progress-summary">
                    <strong>{progressPercent}%</strong>
                    <small>{transactionConfidence}% confidence</small>
                  </div>
                    <div className="transaction-progress-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(progressPercent > 0 ? 8 : 0, progressPercent)}%` }} />
                    </div>
                    <span className="transaction-progress-stage">{mainStage.label}</span>
                  </div>
                </td>
                <td data-label="Health">
                  <StatusBadge className={`transaction-workflow-chip transaction-health-chip ${health.className}`}>{health.label}</StatusBadge>
                </td>
                <td data-label="Finance Type">
                  <StatusBadge className="transaction-workflow-chip transaction-chip-info">{financeStage.label}</StatusBadge>
                  {shouldShowBondReadinessCta(row) ? (
                    <small className="transaction-cell-secondary">
                      {getFinanceReadinessSummary(row).readinessScore.score}% buyer readiness · {approvalConfidence.probabilityBand}
                    </small>
                  ) : (
                    <small className="transaction-cell-secondary">Proof of funds readiness</small>
                  )}
                </td>
                <td data-label="Last Updated">
                  <span className="transaction-cell-secondary">{formatRelativeDate(updatedAt)}</span>
                </td>
                <td data-label="Actions" onClick={(event) => event.stopPropagation()}>
                  <div className="transaction-row-actions">
                    {row?.transaction?.id ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="table-action-button transaction-row-action-primary"
                        onClick={() => onRowClick(row)}
                      >
                        <ArrowUpRight size={14} />
                        Open
                      </Button>
                    ) : null}
                    {onDeleteTransaction && row?.transaction?.id ? (
                      <details className="transaction-row-menu">
                        <summary aria-label="More transaction actions">
                          <MoreHorizontal size={16} />
                        </summary>
                        <button
                          type="button"
                          className="transaction-row-menu-item danger"
                          onClick={() => onDeleteTransaction(row)}
                          disabled={deletingTransactionId === row.transaction.id}
                        >
                          {deletingTransactionId === row.transaction.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </details>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
          </tbody>
        </DataTableInner>
      )}

      {filteredRows.length > pageSize ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-borderDefault pt-4">
          <p className="text-sm text-textMuted">Page {currentPage} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </DataTable>
  )
}

export default AgentTransactionsTable
