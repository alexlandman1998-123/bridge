import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2, CheckCircle2, Home, MoreHorizontal, Plus, Search, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { buildDeveloperTransactionReadinessProfileFromRow } from '../core/transactions/developerTransactionReadinessProfile.js'
import { buildBondOriginatorAgentProgressViewModel } from '../modules/bond/integrations'
import { calculateApprovalProbability, calculateOperationalRisk, calculateTransactionVelocity } from '../services/financeIntelligenceService'
import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
} from '../services/portalCanonicalFieldFallbacks'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import LoadingSkeleton from './LoadingSkeleton'
import SearchInput from './ui/SearchInput'
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
  { key: 'needs_review', label: 'Needs Review' },
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

function formatUpdatedAt(value) {
  const label = formatRelativeDate(value)
  if (label === 'No update') return label
  return `Updated ${label.toLowerCase()}`
}

function formatDisplayLabel(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getFirstImageUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const next = getFirstImageUrl(item)
      if (next) return next
    }
    return ''
  }
  if (typeof value === 'object') {
    return (
      value.url ||
      value.src ||
      value.imageUrl ||
      value.image_url ||
      value.publicUrl ||
      value.public_url ||
      value.signedUrl ||
      value.signed_url ||
      value.fileUrl ||
      value.file_url ||
      ''
    )
  }
  return ''
}

function getPropertyImageUrl(row) {
  return getFirstImageUrl([
    row?.propertyImage,
    row?.imageUrl,
    row?.thumbnailUrl,
    row?.transaction?.property_image_url,
    row?.transaction?.listing_image_url,
    row?.transaction?.image_url,
    row?.transaction?.cover_image_url,
    row?.unit?.image_url,
    row?.unit?.cover_image_url,
    row?.unit?.primary_image_url,
    row?.unit?.images,
    row?.unit?.gallery_images,
    row?.development?.image_url,
    row?.development?.cover_image_url,
    row?.development?.hero_image_url,
  ])
}

function getPropertyDisplay(row) {
  const unitLabel = row?.unit?.unit_number ? `Unit ${row.unit.unit_number}` : ''
  const addressLine = row?.transaction?.property_address_line_1 || row?.property?.address_line_1 || ''
  const suburb = row?.transaction?.suburb || row?.property?.suburb || row?.development?.suburb || ''
  const description = row?.transaction?.property_description || row?.unit?.name || row?.unit?.title || ''
  const development = row?.development?.name || ''
  const title = resolvePortalPropertyLabel(row, { fallback: addressLine || unitLabel || description || 'Property pending' })
  const secondary = suburb || development || (title !== description ? description : '') || 'Listing / development pending'
  return { title, secondary }
}

function getPropertyTypeLabel(row) {
  return formatDisplayLabel(
    row?.transaction?.property_type ||
      row?.transaction?.transaction_type ||
      row?.unit?.property_type ||
      row?.unit?.type ||
      row?.development?.property_type ||
      '',
  )
}

function getInitials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'BP'
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
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

function getStageBadgeClass(mainStageKey = '') {
  const normalized = String(mainStageKey || '').toUpperCase()
  if (normalized === 'REG') return 'transaction-property-badge-green'
  if (normalized === 'XFER') return 'transaction-property-badge-blue'
  if (normalized === 'FIN' || normalized === 'DEP') return 'transaction-property-badge-amber'
  if (normalized === 'ATTY') return 'transaction-property-badge-purple'
  if (normalized === 'OTP') return 'transaction-property-badge-green'
  return 'transaction-property-badge-neutral'
}

function getProgressPercent(row, mainStageKey = '') {
  const explicit = Number(row?.workspace?.progressPercent ?? row?.progressPercent)
  if (Number.isFinite(explicit) && explicit >= 0) {
    return Math.max(0, Math.min(100, Math.round(explicit)))
  }

  return MAIN_STAGE_PROGRESS[mainStageKey] ?? (String(row?.stage || '').toLowerCase() === 'registered' ? 100 : 20)
}

function getHealth(row, mainStageKey = '') {
  const developerReadiness = buildDeveloperTransactionReadinessProfileFromRow(row)
  if (developerReadiness?.healthLabel) {
    if (developerReadiness.healthTone === 'danger') {
      return { label: developerReadiness.healthLabel, className: 'transaction-health-attention' }
    }
    if (developerReadiness.healthTone === 'warning') {
      return { label: developerReadiness.healthLabel, className: 'transaction-health-waiting' }
    }
    return { label: developerReadiness.healthLabel, className: 'transaction-health-track' }
  }

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

function getBuyerBondOriginatorRequestSummary(row) {
  const summary = row?.buyerBondOriginatorRequestSummary || row?.transaction?.buyerBondOriginatorRequestSummary || null
  if (summary?.requested) return summary

  const request =
    row?.buyerBondOriginatorRequest ||
    row?.transaction?.buyer_bond_originator_request ||
    row?.transaction?.buyerBondOriginatorRequest ||
    null
  if (!request?.requested) return null

  const status = String(request.status || '').trim().toLowerCase()
  const companyName = String(request.companyName || request.company_name || 'buyer-appointed bond originator').trim()
  const actionRequired =
    row?.buyerBondOriginatorRequestActionRequired === true ||
    row?.transaction?.buyer_bond_originator_request_action_required === true ||
    status === 'pending_approval'

  return {
    requested: true,
    status,
    actionRequired,
    label: actionRequired ? 'Buyer originator review' : 'Buyer originator request',
    summary:
      row?.transaction?.buyer_bond_originator_request_summary ||
      (actionRequired
        ? `Buyer nominated ${companyName}. Agent or developer approval is required.`
        : `Buyer nominated ${companyName}.`),
    companyName,
  }
}

function getBondOriginatorAgentProgressSummary(row) {
  const source =
    row?.bondOriginatorAgentProgressView ||
    row?.bond_originator_agent_progress_view ||
    row?.transaction?.bondOriginatorAgentProgressView ||
    row?.transaction?.bond_originator_agent_progress_view ||
    null
  if (!source) return null
  const model = buildBondOriginatorAgentProgressViewModel({ exportPackage: source })
  return model.available ? model : null
}

function getEmptyStateCopy(isPrincipalView) {
  if (isPrincipalView) {
    return 'Transactions will appear here once leads are converted, offers are accepted, or a deal is created directly.'
  }
  return 'Your assigned transactions will appear here once a lead is converted, an offer is accepted, or a deal is allocated to you.'
}

function rowMatchesQuickFilter(row, filterKey, searchTerm = '') {
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
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase()
  if (normalizedSearch) {
    const buyerBondOriginatorRequest = getBuyerBondOriginatorRequestSummary(row)
    const bondOriginatorProgress = getBondOriginatorAgentProgressSummary(row)
    const health = getHealth(row, mainStage).label.toLowerCase()
    const searchHaystack = [
      row?.buyer?.name,
      row?.buyer?.email,
      row?.buyer?.phone,
      row?.development?.name,
      row?.unit?.unit_number,
      row?.transaction?.property_address_line_1,
      transaction.transaction_reference,
      transaction.reference,
      transaction.property_description,
      financeType,
      stage,
      mainStage,
      health,
      buyerBondOriginatorRequest?.label,
      buyerBondOriginatorRequest?.summary,
      buyerBondOriginatorRequest?.companyName,
      bondOriginatorProgress?.statusLabel,
      bondOriginatorProgress?.headline,
      bondOriginatorProgress?.summary,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ')

    if (!searchHaystack.includes(normalizedSearch)) return false
  }

  if (filterKey === 'all') return true
  if (filterKey === 'needs_review') return getBuyerBondOriginatorRequestSummary(row)?.actionRequired === true
  if (filterKey === 'development') return Boolean(row?.development?.id) || typeText.includes('development')
  if (filterKey === 'second_hand') return typeText.includes('second') || typeText.includes('private') || (!row?.development?.id && !typeText.includes('commercial'))
  if (filterKey === 'commercial') return typeText.includes('commercial')
  if (filterKey === 'cash') return financeType === 'cash'
  if (filterKey === 'bond') return financeType === 'bond' || financeType === 'combination'
  if (filterKey === 'registered') return mainStage === 'REG' || stage.includes('registered')
  if (filterKey === 'blocked') return getHealth(row, mainStage).label.toLowerCase() === 'blocked'
  if (filterKey === 'active') return !['REG'].includes(mainStage) && !['registered', 'completed', 'archived', 'cancelled'].includes(stage)
  return true
}

function buildVisibleTransactionRowModel(row, index) {
  const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || null
  const canOpenRow = Boolean(row?.transaction?.id || row?.unit?.id)
  const mainStage = formatMainStage(row)
  const health = getHealth(row, mainStage.key)
  const progressPercent = getProgressPercent(row, mainStage.key)
  const approvalConfidence = calculateApprovalProbability(row)
  const operationalRisk = calculateOperationalRisk(row)
  const velocity = calculateTransactionVelocity(row)

  return {
    row,
    index,
    updatedAt,
    canOpenRow,
    mainStage,
    health,
    progressPercent,
    transactionConfidence: Math.round((approvalConfidence.score * 0.55) + ((100 - operationalRisk.riskScore) * 0.25) + (velocity.velocityScore * 0.2)),
    buyerName: resolvePortalBuyerName(row),
    propertyDisplay: getPropertyDisplay(row),
    propertyImageUrl: getPropertyImageUrl(row),
    propertyTypeLabel: getPropertyTypeLabel(row),
    transactionReference: row?.transaction?.transaction_reference || row?.transaction?.reference || '',
    buyerBondOriginatorRequest: getBuyerBondOriginatorRequestSummary(row),
    bondOriginatorProgress: getBondOriginatorAgentProgressSummary(row),
  }
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
  description = '',
  compactLayout = false,
  searchValue = '',
  onSearchChange = null,
  loading = false,
}) {
  const [page, setPage] = useState(1)
  const [quickFilter, setQuickFilter] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
  const pageSize = 20
  const searchFilter = onSearchChange ? String(searchValue || '') : localSearch

  const filteredRows = useMemo(
    () => (rows || []).filter((row) => rowMatchesQuickFilter(row, quickFilter, searchFilter)),
    [searchFilter, quickFilter, rows],
  )
  const totalPages = Math.max(1, Math.ceil((filteredRows?.length || 0) / pageSize))
  const currentPage = Math.min(page, totalPages)
  const hasAnyRows = Boolean((rows || []).length)

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (filteredRows || []).slice(start, start + pageSize)
  }, [currentPage, filteredRows])
  const visibleRowModels = useMemo(
    () => visibleRows.map((row, index) => buildVisibleTransactionRowModel(row, index)),
    [visibleRows],
  )

  const pageStart = filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0
  const pageEnd = Math.min(filteredRows.length, currentPage * pageSize)

  function handleSearchChange(nextValue) {
    if (onSearchChange) {
      onSearchChange(nextValue)
    } else {
      setLocalSearch(nextValue)
    }
    setPage(1)
  }

  return (
    <DataTable
      title={title}
      copy={description}
      actions={
        onCreateTransaction ? (
          <div className="agent-transactions-header-actions">
            <Button type="button" className="agent-transactions-create-button" onClick={onCreateTransaction}>
              <Plus size={16} />
              Create Deal
            </Button>
          </div>
        ) : null
      }
      className={`table-panel agent-transactions-panel${compactLayout ? ' transactions-page-compact' : ''}`}
    >
      {hasAnyRows ? (
        <div className="transaction-ops-filter-bar" aria-label="Transaction quick filters">
          <div className="transaction-ops-filter-toolbar">
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
            {compactLayout ? (
              <SearchInput
                className="agent-transactions-search"
                value={searchFilter}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search transactions…"
              />
            ) : null}
            <span className="transaction-ops-count">Showing {pageStart}-{pageEnd}</span>
          </div>
        </div>
      ) : null}

      {loading && !hasAnyRows ? (
        <LoadingSkeleton lines={6} className="rounded-[18px] border border-borderDefault bg-surface" />
      ) : filteredRows.length === 0 ? (
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
        <DataTableInner className={`units-table agent-transactions-table transaction-ops-table${compactLayout ? ' agent-transactions-compact-table' : ''}`.trim()}>
          <thead>
            <tr>
              <th className="agent-transactions-sticky-first">Property</th>
              <th>Buyer</th>
              <th>Progress</th>
              <th>Health</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRowModels.map((model) => {
              const {
                row,
                index,
                updatedAt,
                canOpenRow,
                mainStage,
                health,
                progressPercent,
                transactionConfidence,
                buyerName,
                propertyDisplay,
                propertyImageUrl,
                propertyTypeLabel,
                transactionReference,
                buyerBondOriginatorRequest,
                bondOriginatorProgress,
              } = model
              const healthLabel = health.label === 'Attention' ? 'Needs Attention' : health.label

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
                  <td className="agent-transactions-sticky-first" data-label="Property">
                    <div className="transaction-property-cell">
                      <span className="transaction-property-thumb" aria-hidden="true">
                        {propertyImageUrl ? (
                          <img src={propertyImageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="transaction-property-placeholder">
                            <Home size={24} />
                          </span>
                        )}
                      </span>
                      <span className="transaction-property-copy">
                        <strong className="transaction-property-title" title={propertyDisplay.title}>{propertyDisplay.title}</strong>
                        <small className="transaction-property-suburb" title={propertyDisplay.secondary}>{propertyDisplay.secondary}</small>
                        <span className={`transaction-property-badge ${getStageBadgeClass(mainStage.key)}`}>{mainStage.label}</span>
                        {transactionReference ? (
                          <small className="transaction-property-ref" title={transactionReference}>Ref {transactionReference}</small>
                        ) : null}
                        {buyerBondOriginatorRequest?.requested ? (
                          <StatusBadge
                            className={`transaction-workflow-chip buyer-originator-request-chip ${
                              buyerBondOriginatorRequest.actionRequired ? 'transaction-chip-watch' : 'transaction-chip-muted'
                            }`.trim()}
                            title={buyerBondOriginatorRequest.summary}
                          >
                            {buyerBondOriginatorRequest.actionRequired ? 'Buyer originator review' : buyerBondOriginatorRequest.label}
                          </StatusBadge>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td data-label="Buyer">
                    <div className="transaction-buyer-profile">
                      <span className="transaction-buyer-avatar" aria-hidden="true">
                        {buyerName === 'Buyer pending' ? <UserRound size={18} /> : getInitials(buyerName)}
                      </span>
                      <span className="transaction-buyer-copy">
                        <strong className="transaction-buyer-name" title={buyerName}>{buyerName}</strong>
                        <small className="transaction-buyer-meta" title={row?.buyer?.email || row?.buyer?.phone || ''}>{row?.buyer?.email || row?.buyer?.phone || 'No contact details'}</small>
                        {propertyTypeLabel ? (
                          <small className="transaction-buyer-type">
                            <Building2 size={13} />
                            {propertyTypeLabel}
                          </small>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td data-label="Progress">
                    <div className="transaction-progress-cell">
                      <div className="transaction-progress-summary">
                        <strong>{progressPercent}%</strong>
                        <small>{transactionConfidence}% confidence</small>
                      </div>
                      <span className="transaction-progress-stage">{mainStage.label}</span>
                      {bondOriginatorProgress ? (
                        <StatusBadge
                          className="transaction-workflow-chip transaction-chip-muted"
                          title={bondOriginatorProgress.summary}
                        >
                          Bond: {bondOriginatorProgress.statusLabel}
                        </StatusBadge>
                      ) : null}
                      <div className="transaction-progress-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(progressPercent > 0 ? 8 : 0, progressPercent)}%` }} />
                      </div>
                      <span className="transaction-updated-label">{formatUpdatedAt(updatedAt)}</span>
                    </div>
                  </td>
                  <td data-label="Health">
                    <StatusBadge className={`transaction-workflow-chip transaction-health-chip ${health.className}`}>{healthLabel}</StatusBadge>
                  </td>
                  <td
                    data-label="Actions"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
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
                      <details className="transaction-row-menu">
                        <summary aria-label="More transaction actions">
                          <MoreHorizontal size={16} />
                        </summary>
                        {onDeleteTransaction && row?.transaction?.id ? (
                          <button
                            type="button"
                            className="transaction-row-menu-item danger"
                            onClick={() => onDeleteTransaction(row)}
                            disabled={deletingTransactionId === row.transaction.id}
                          >
                            {deletingTransactionId === row.transaction.id ? 'Deleting...' : 'Delete'}
                          </button>
                        ) : (
                          <span className="transaction-row-menu-item is-muted">No extra actions</span>
                        )}
                      </details>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </DataTableInner>
      )}

      {!loading && filteredRows.length > pageSize ? (
        <div className="agent-transactions-pagination">
          <p>Page {currentPage} of {totalPages}</p>
          <div>
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
