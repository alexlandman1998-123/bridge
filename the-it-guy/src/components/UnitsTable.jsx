import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import OpenOnboardingButton from './OpenOnboardingButton'
import StageAgingChip from './StageAgingChip'
import { financeTypeShortLabel } from '../core/transactions/financeType'
import { getLifecycleStatus } from '../lib/stages'

const WORKFLOW_STEPS = [
  { key: 'reservation', label: 'OTP' },
  { key: 'bond', label: 'Finance' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration', label: 'Registration' },
]

function formatPurchaserType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')

  if (!normalized) {
    return 'Buyer profile pending'
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function getLifecycleClassName(stage) {
  return getLifecycleStatus(stage).toLowerCase().replaceAll(' ', '-')
}

function getPhaseLabel(row) {
  const phase = row?.unit?.phase || row?.report?.developmentPhase || ''
  return String(phase || '').trim() || 'Not set'
}

function getHandoverLabel(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()

  if (normalized === 'completed') return 'Completed'
  if (normalized === 'in_progress') return 'In Progress'
  return 'Not Started'
}

function getHandoverPillClassName(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()

  if (normalized === 'completed') {
    return 'border border-success bg-successSoft text-success'
  }

  if (normalized === 'in_progress') {
    return 'border border-info bg-infoSoft text-info'
  }

  return 'border border-borderDefault bg-mutedBg text-textMuted'
}

function getSnagSummaryLabel(summary = {}) {
  const total = Number(summary?.totalCount || 0)
  const open = Number(summary?.openCount || 0)

  if (!total) {
    return 'No snags'
  }

  if (open > 0) {
    return `${open} open`
  }

  return 'Resolved'
}

function getSnagPillClassName(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()

  if (normalized === 'open') {
    return 'border border-warning bg-warningSoft text-warning'
  }

  if (normalized === 'resolved') {
    return 'border border-success bg-successSoft text-success'
  }

  return 'border border-borderDefault bg-mutedBg text-textMuted'
}

function getProgressFillClassName(tone) {
  if (tone === 'healthy') return 'bg-success'
  if (tone === 'watch') return 'bg-warning'
  return 'bg-danger'
}

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

function getCompactHealth(row) {
  const status = String(row?.transaction?.status || row?.transaction?.operational_state || '').trim().toLowerCase()
  const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()
  const stage = String(row?.stage || '').trim().toLowerCase()

  if (['blocked', 'on_hold', 'on hold'].includes(status) || stage.includes('blocked')) {
    return { label: 'Blocked', className: 'transaction-health-blocked' }
  }
  if (row?.workspace?.stageMeta?.key === 'registration' || lifecycle === 'registered' || lifecycle === 'completed' || stage === 'registered') {
    return { label: 'On Track', className: 'transaction-health-track' }
  }
  if (row?.workspace?.stalled || row?.workspace?.atRisk) {
    return { label: 'Attention', className: 'transaction-health-attention' }
  }
  if (!row?.transaction?.updated_at && !row?.transaction?.created_at) {
    return { label: 'Waiting', className: 'transaction-health-waiting' }
  }
  return { label: 'On Track', className: 'transaction-health-track' }
}

function UnitsTable({
  rows,
  onRowClick,
  onDeleteTransaction = null,
  onEditTransaction = null,
  deletingTransactionId = null,
  title = 'Units',
  showDevelopment = false,
  headerActions = null,
  selectable = false,
  selectedUnitIds = [],
  onToggleRowSelection = null,
  onToggleAllSelection = null,
  compactOperations = false,
  sortBy = 'development',
  sortDirection = 'asc',
  onSortChange = null,
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((row) => row?.unit?.id && selectedUnitIds.includes(row.unit.id))
  const hasActions = !compactOperations && Boolean(onDeleteTransaction || onEditTransaction)
  const actionColumnCount = compactOperations ? 0 : hasActions ? 3 : 0
  const optionalOperationalColumns = compactOperations ? 0 : 4
  const dataColumnCount = compactOperations
    ? 7
    : (showDevelopment ? 1 : 0) + 3 + optionalOperationalColumns + actionColumnCount

  function renderSortableHeader(label, key) {
    const active = sortBy === key
    const nextDirection = active && sortDirection === 'asc' ? 'desc' : 'asc'

    if (!onSortChange) {
      return <>{label}</>
    }

    return (
      <button
        type="button"
        onClick={() => onSortChange(key, nextDirection)}
        className={`inline-flex items-center gap-1.5 text-label font-semibold uppercase transition ${
          active ? 'text-primary' : 'text-textMuted hover:text-textBody'
        }`}
      >
        <span>{label}</span>
        <span className="text-helper">{active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    )
  }

  return (
    <DataTable
      title={title}
      actions={headerActions}
      className="units-table-panel !overflow-hidden !p-6 max-sm:!p-4"
    >
      <DataTableInner className={`units-table developer-transactions-table ${compactOperations ? 'operations-compact-table' : ''}`.trim()}>
        <thead>
          <tr>
            {selectable ? (
              <th className="w-[56px]">
                <input
                  type="checkbox"
                  aria-label="Select all units"
                  checked={allSelected}
                  onChange={(event) => onToggleAllSelection?.(event.target.checked)}
                  onClick={(event) => event.stopPropagation()}
                />
              </th>
            ) : null}
            {compactOperations ? <th>{renderSortableHeader('Property / Development', 'development')}</th> : showDevelopment ? <th>Development</th> : null}
            {!compactOperations ? <th>Unit</th> : null}
            {compactOperations ? <th>{renderSortableHeader('Progress', 'progress')}</th> : <th>Phase</th>}
            <th>Buyer</th>
            {!compactOperations ? <th>Stage</th> : null}
            {!compactOperations ? <th>Handover</th> : null}
            {!compactOperations ? <th>Snags</th> : null}
            {!compactOperations ? <th>Stage Age</th> : null}
            {compactOperations ? <th>{renderSortableHeader('Health', 'stage')}</th> : null}
            {compactOperations ? <th>{renderSortableHeader('Finance Type', 'finance')}</th> : null}
            {compactOperations ? <th>Last Updated</th> : null}
            {compactOperations ? <th>Actions</th> : null}
            {hasActions ? <th>Update</th> : null}
            {hasActions ? <th>Onboarding Link</th> : null}
            {hasActions ? <th>Delete</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unitId = row?.unit?.id
            const showOnboardingAction = Boolean(row?.transaction?.id)
            const checked = unitId ? selectedUnitIds.includes(unitId) : false
            const progressPercent = Math.max(0, Math.min(100, Math.round(row?.workspace?.progressPercent || 0)))
            const health = getCompactHealth(row)
            const currentStepKey = row?.workspace?.stageMeta?.key || 'reservation'
            const currentStepIndex = WORKFLOW_STEPS.findIndex((step) => step.key === currentStepKey)
            const developmentLabel = row?.development?.name || 'Unassigned development'
            const unitLabel = `Unit ${row?.unit?.unit_number || '-'}`
            const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at

            return (
              <tr
                key={row?.transaction?.id || unitId}
                className="ui-data-row-clickable"
                onClick={() => unitId && onRowClick(row, unitId, row?.unit?.unit_number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (unitId) {
                      onRowClick(row, unitId, row?.unit?.unit_number)
                    }
                  }
                }}
                tabIndex={0}
                role="button"
              >
                {selectable ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select Unit ${row?.unit?.unit_number || '-'}`}
                      checked={checked}
                      onChange={(event) => onToggleRowSelection?.(unitId, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <div className="transaction-list-cell">
                      <strong className="transaction-cell-primary" title={developmentLabel}>{developmentLabel}</strong>
                      <small className="transaction-cell-secondary" title={unitLabel}>{unitLabel}</small>
                    </div>
                  </td>
                ) : showDevelopment ? (
                  <td>
                    <div className="transaction-list-cell">
                      <strong>
                        {developmentLabel}
                      </strong>
                      {row?.transaction?.property_address_line_1 || row?.transaction?.suburb ? (
                        <small>{row?.transaction?.property_address_line_1 || row?.transaction?.suburb}</small>
                      ) : null}
                    </div>
                  </td>
                ) : null}

                {!compactOperations ? (
                  <td>
                    <div className="transaction-list-cell">
                      <strong>{unitLabel}</strong>
                      <small>{financeTypeShortLabel(row?.transaction?.finance_type) || 'Finance not set'}</small>
                      {row?.transaction?.transaction_reference ? (
                        <span className="inline-flex w-fit rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-0.5 text-helper font-semibold uppercase text-textBody">
                          {row.transaction.transaction_reference}
                        </span>
                      ) : null}
                    </div>
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <div className="transaction-progress-cell">
                      <div className="transaction-progress-summary">
                        <strong>{progressPercent}%</strong>
                        <span>{row?.workspace?.stageMeta?.label || 'Reservation'}</span>
                      </div>
                      <div className="transaction-progress-track" aria-hidden="true">
                        <span
                          className={getProgressFillClassName(row?.workspace?.progressTone)}
                          style={{ width: `${Math.max(progressPercent > 0 ? 8 : 0, progressPercent)}%` }}
                        />
                      </div>
                      <div className="transaction-workflow-dots" aria-label={`Current stage: ${row?.workspace?.stageMeta?.label || 'Reservation'}`}>
                        {WORKFLOW_STEPS.map((step, stepIndex) => (
                          <span
                            key={step.key}
                            className={`transaction-workflow-dot ${
                              step.key === currentStepKey ? 'is-current' : currentStepIndex >= 0 && stepIndex < currentStepIndex ? 'is-done' : ''
                            }`.trim()}
                            title={step.label}
                          />
                        ))}
                      </div>
                    </div>
                  </td>
                ) : (
                  <td>
                    <span className="inline-flex rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-xs font-semibold text-textBody">
                      {getPhaseLabel(row)}
                    </span>
                  </td>
                )}

                <td>
                  <div className="transaction-list-cell">
                    <strong className={compactOperations ? 'transaction-cell-primary' : ''}>{row?.buyer?.name || 'Buyer pending'}</strong>
                    {compactOperations ? (
                      <small className="transaction-cell-secondary">{row?.buyer?.email || 'No contact details'}</small>
                    ) : (
                      <small>{row?.onboarding?.status ? `Onboarding: ${row.onboarding.status}` : formatPurchaserType(row?.transaction?.purchaser_type)}</small>
                    )}
                  </div>
                </td>

                {!compactOperations ? (
                  <td>
                    <div className="transaction-list-stage">
                      <span className={`status-pill ${getLifecycleClassName(row?.stage)}`}>{getLifecycleStatus(row?.stage)}</span>
                    </div>
                  </td>
                ) : null}
                {!compactOperations ? (
                  <td>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getHandoverPillClassName(row?.handover?.status)}`}>
                      {getHandoverLabel(row?.handover?.status)}
                    </span>
                  </td>
                ) : null}
                {!compactOperations ? (
                  <td>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getSnagPillClassName(row?.snagSummary?.status)}`}>
                      {getSnagSummaryLabel(row?.snagSummary)}
                    </span>
                  </td>
                ) : null}
                {!compactOperations ? (
                  <td>
                    <StageAgingChip
                      stage={row?.stage}
                      updatedAt={row?.transaction?.updated_at || row?.transaction?.created_at}
                      className="units-table-stage-age"
                    />
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <span className={`transaction-workflow-chip transaction-health-chip ${health.className}`}>
                      {health.label}
                    </span>
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <div className="transaction-list-cell">
                      <span
                        className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                          row?.workspace?.financeMeta?.chipClassName || 'border border-borderDefault bg-mutedBg text-textMuted'
                        }`}
                      >
                        {row?.workspace?.financeMeta?.label || 'Unknown'}
                      </span>
                      {row?.workspace?.financeMeta?.detail ? (
                        <small className="max-w-[190px] truncate text-helper text-textMuted">{row.workspace.financeMeta.detail}</small>
                      ) : null}
                    </div>
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <span className="transaction-cell-secondary">{formatRelativeDate(updatedAt)}</span>
                  </td>
                ) : null}

                {compactOperations ? (
                  <td>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="table-action-button transaction-row-action-primary"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (unitId) {
                          onRowClick(row, unitId, row?.unit?.unit_number)
                        }
                      }}
                    >
                      Open
                    </Button>
                  </td>
                ) : null}

                {hasActions ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    {onEditTransaction ? (
                      <Button
                        variant="primary"
                        className="table-action-button transaction-row-action-primary"
                        onClick={() => onEditTransaction(row)}
                      >
                        {row?.transaction?.id ? 'Update' : 'Start'}
                      </Button>
                    ) : (
                      <span className="text-sm text-textSoft">-</span>
                    )}
                  </td>
                ) : null}
                {hasActions ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    {showOnboardingAction ? (
                      <OpenOnboardingButton
                        transactionId={row?.transaction?.id}
                        purchaserType={row?.transaction?.purchaser_type || 'individual'}
                        label="Open Link"
                        variant="secondary"
                        className="table-action-button"
                      />
                    ) : (
                      <span className="text-sm text-textSoft">-</span>
                    )}
                  </td>
                ) : null}
                {hasActions ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    {row?.transaction?.id && onDeleteTransaction ? (
                      <Button
                        variant="ghost"
                        className="ghost-button danger-ghost table-action-button"
                        onClick={() => onDeleteTransaction(row)}
                        disabled={deletingTransactionId === row?.transaction?.id}
                      >
                        {deletingTransactionId === row?.transaction?.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    ) : (
                      <span className="text-sm text-textSoft">-</span>
                    )}
                  </td>
                ) : null}
              </tr>
            )
          })}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={(selectable ? 1 : 0) + dataColumnCount}>No active transactions found.</td>
            </tr>
          ) : null}
        </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default UnitsTable
