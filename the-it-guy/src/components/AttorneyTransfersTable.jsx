import { ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { deriveAttorneyOperationalStateForRow } from '../core/transactions/attorneyOperationalEngine'
import { financeTypeShortLabel } from '../core/transactions/financeType'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

const STAGE_PROGRESS = {
  instruction: 18,
  awaiting_documents: 30,
  transfer_preparation: 48,
  lodgement: 76,
  registration_preparation: 86,
  registered: 100,
}

const WORKFLOW_STEPS = [
  { key: 'instruction', label: 'Instruction' },
  { key: 'awaiting_documents', label: 'Documents' },
  { key: 'transfer_preparation', label: 'Transfer' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registered', label: 'Registration' },
]

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

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || type === 'private_property' || (!row?.development?.id && !row?.unit?.id)
}

function getPropertyUnitLabel(row) {
  if (isPrivateMatter(row)) {
    return row?.transaction?.property_address_line_1 || row?.transaction?.property_description || 'Private property matter'
  }

  return `Unit ${row?.unit?.unit_number || '-'}`
}

function getDevelopmentLabel(row) {
  if (isPrivateMatter(row)) {
    return (
      [
        row?.transaction?.property_address_line_1,
        row?.transaction?.suburb,
        row?.transaction?.city,
      ]
        .filter(Boolean)
        .join(', ') || 'Standalone matter'
    )
  }

  return row?.development?.name || '-'
}

function getAgentLabel(row) {
  return row?.transaction?.assigned_agent || row?.transaction?.agent || 'Unassigned'
}

function parseDate(value) {
  const parsed = new Date(value || 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDaysSince(value) {
  const parsed = parseDate(value)
  if (!parsed) return null
  const diffMs = Date.now() - parsed.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatRelativeDate(value) {
  const days = getDaysSince(value)
  if (days === null) return 'No update'
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function getStatusLabel(row, operational, stageKey) {
  const explicitStatus = String(row?.transaction?.status || '').trim().toLowerCase()
  const lifecycleState = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
  if (lifecycleState === 'archived') return 'Archived'
  if (lifecycleState === 'cancelled') return 'Cancelled'
  if (lifecycleState === 'completed') return 'Completed'
  if (explicitStatus === 'blocked' || explicitStatus === 'on_hold' || explicitStatus === 'on hold') return 'On Hold / Blocked'
  if (stageKey === 'registered') return 'Registered'
  if (['lodgement', 'registration_preparation'].includes(stageKey)) {
    return 'Lodged'
  }
  if (operational.stateKey === 'blocked' || operational.inactivity?.daysSinceLastActivity >= 10) {
    return 'On Hold / Blocked'
  }
  return 'Active'
}

function getHealthClassName(statusLabel) {
  if (statusLabel === 'Registered' || statusLabel === 'Completed' || statusLabel === 'Active') return 'transaction-health-track'
  if (statusLabel === 'Lodged') return 'transaction-health-attention'
  if (statusLabel === 'On Hold / Blocked') return 'transaction-health-blocked'
  return 'transaction-health-waiting'
}

function getTransactionTypeLabel(row) {
  if (!isPrivateMatter(row)) {
    return 'Development'
  }

  const propertyType = String(row?.transaction?.property_type || '')
    .trim()
    .toLowerCase()

  if (propertyType === 'commercial') {
    return 'Private Commercial'
  }

  if (propertyType === 'farm') {
    return 'Private Farm'
  }

  return 'Private Residential'
}

function getProgressPercent(stageKey) {
  return STAGE_PROGRESS[stageKey] ?? 35
}

function rowMatchesQuickFilter(row, filterKey, operational, statusLabel) {
  if (filterKey === 'all') return true
  const transaction = row?.transaction || {}
  const financeType = String(transaction.finance_type || '').trim().toLowerCase()
  const typeText = [
    transaction.transaction_type,
    transaction.property_type,
    transaction.scope,
    transaction.source_type,
    isPrivateMatter(row) ? 'second hand private' : 'development',
  ].join(' ').toLowerCase()
  const stageKey = operational?.stageKey || ''

  if (filterKey === 'development') return !isPrivateMatter(row)
  if (filterKey === 'second_hand') return isPrivateMatter(row) && !typeText.includes('commercial')
  if (filterKey === 'commercial') return typeText.includes('commercial')
  if (filterKey === 'cash') return financeType === 'cash'
  if (filterKey === 'bond') return financeType === 'bond' || financeType === 'combination'
  if (filterKey === 'registered') return stageKey === 'registered' || statusLabel === 'Registered'
  if (filterKey === 'blocked') return statusLabel === 'On Hold / Blocked' || operational?.stateKey === 'blocked'
  if (filterKey === 'active') return !['registered'].includes(stageKey) && !['Archived', 'Cancelled', 'Completed'].includes(statusLabel)
  return true
}

function AttorneyTransfersTable({ rows, onRowClick, title = 'Transactions' }) {
  const [quickFilter, setQuickFilter] = useState('all')
  const preparedRows = useMemo(
    () => rows.map((row) => {
      const operational = deriveAttorneyOperationalStateForRow(row)
      const statusLabel = getStatusLabel(row, operational, operational.stageKey)
      return { row, operational, statusLabel }
    }),
    [rows],
  )
  const visibleRows = useMemo(
    () => preparedRows.filter((item) => rowMatchesQuickFilter(item.row, quickFilter, item.operational, item.statusLabel)),
    [preparedRows, quickFilter],
  )

  return (
    <DataTable
      title={title}
      actions={
        <div className="flex items-center justify-end">
          <span className="meta-chip whitespace-nowrap">{rows.length} matters</span>
        </div>
      }
      className="attorney-transfers-panel agent-transactions-panel"
    >
      <div className="transaction-ops-filter-bar" aria-label="Matter quick filters">
        {QUICK_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`transaction-ops-filter ${quickFilter === filter.key ? 'is-active' : ''}`.trim()}
            onClick={() => setQuickFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <DataTableInner className="units-table attorney-transfers-table transaction-ops-table">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[20%]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[4%]" />
          </colgroup>
          <thead>
            <tr>
              <th>Property / Development</th>
              <th>Buyer</th>
              <th>Progress</th>
              <th>Health</th>
              <th>Finance Type</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, operational, statusLabel }) => {
              const stageKey = operational.stageKey
              const stageLabel = operational.stageLabel
              const progressPercent = getProgressPercent(stageKey)
              const healthClassName = getHealthClassName(statusLabel)
              const currentStepIndex = WORKFLOW_STEPS.findIndex((step) => step.key === stageKey)
              const financeLabel = financeTypeShortLabel(row?.transaction?.finance_type) || 'Unknown'
              const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at

              return (
                <tr
                  key={row?.transaction?.id || row?.unit?.id || `${row?.transaction?.property_address_line_1}-${row?.buyer?.name}`}
                  className="ui-data-row-clickable"
                  onClick={() => onRowClick(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onRowClick(row)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td data-label="Property / Development">
                    <div className="transaction-list-cell">
                      <strong className="transaction-cell-primary">
                        {!isPrivateMatter(row) ? getDevelopmentLabel(row) : getPropertyUnitLabel(row)}
                      </strong>
                      <small className="transaction-cell-secondary">
                        {!isPrivateMatter(row) ? getPropertyUnitLabel(row) : getTransactionTypeLabel(row)}
                      </small>
                    </div>
                  </td>
                  <td data-label="Buyer">
                    <div className="transaction-list-cell">
                      <strong className="transaction-cell-primary">{row?.buyer?.name || row?.transaction?.buyer_name || 'Client pending'}</strong>
                      <small className="transaction-cell-secondary">{row?.buyer?.email || row?.transaction?.buyer_email || getAgentLabel(row)}</small>
                    </div>
                  </td>
                  <td data-label="Progress">
                    <div className="transaction-progress-cell">
                      <div className="transaction-progress-summary">
                        <strong>{progressPercent}%</strong>
                        <span>{stageLabel}</span>
                      </div>
                      <div className="transaction-progress-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(progressPercent > 0 ? 8 : 0, progressPercent)}%` }} />
                      </div>
                      <div className="transaction-workflow-dots" aria-label={`Current stage: ${stageLabel}`}>
                        {WORKFLOW_STEPS.map((step, stepIndex) => (
                          <span
                            key={step.key}
                            className={`transaction-workflow-dot ${
                              step.key === stageKey ? 'is-current' : currentStepIndex >= 0 && stepIndex < currentStepIndex ? 'is-done' : ''
                            }`.trim()}
                            title={step.label}
                          />
                        ))}
                      </div>
                    </div>
                  </td>
                  <td data-label="Health">
                    <StatusBadge className={`transaction-workflow-chip transaction-health-chip ${healthClassName}`}>{statusLabel === 'On Hold / Blocked' ? 'Blocked' : statusLabel === 'Active' ? 'On Track' : statusLabel}</StatusBadge>
                  </td>
                  <td data-label="Finance Type">
                    <StatusBadge className="transaction-workflow-chip transaction-chip-info">{financeLabel}</StatusBadge>
                  </td>
                  <td data-label="Last Updated">
                    <span className="transaction-cell-secondary">{formatRelativeDate(updatedAt)}</span>
                  </td>
                  <td data-label="Actions" onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="table-action-button transaction-row-action-primary"
                      onClick={() => onRowClick(row)}
                    >
                      <ArrowUpRight size={14} />
                      Open
                    </Button>
                  </td>
                </tr>
              )
            })}

            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7}>No matters found.</td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default AttorneyTransfersTable
