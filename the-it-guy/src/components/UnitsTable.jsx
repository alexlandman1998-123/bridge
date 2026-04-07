import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import OpenOnboardingButton from './OpenOnboardingButton'
import StageAgingChip from './StageAgingChip'
import { financeTypeShortLabel } from '../core/transactions/financeType'
import { getLifecycleStatus } from '../lib/stages'

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
    return 'border border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  if (normalized === 'in_progress') {
    return 'border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]'
  }

  return 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
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
    return 'border border-[#f5d7a8] bg-[#fff8eb] text-[#8a5a12]'
  }

  if (normalized === 'resolved') {
    return 'border border-[#b7e4c7] bg-[#f1fbf4] text-[#166534]'
  }

  return 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
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
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((row) => selectedUnitIds.includes(row.unit.id))
  const hasActions = Boolean(onDeleteTransaction || onEditTransaction)
  const actionColumnCount = hasActions ? 3 : 0
  const optionalOperationalColumns = compactOperations ? 0 : 4
  const dataColumnCount = (showDevelopment ? 1 : 0) + 3 + optionalOperationalColumns + actionColumnCount

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
              {showDevelopment ? <th>Development</th> : null}
              <th>Unit</th>
              <th>Phase</th>
              <th>Buyer</th>
              {!compactOperations ? <th>Stage</th> : null}
              {!compactOperations ? <th>Handover</th> : null}
              {!compactOperations ? <th>Snags</th> : null}
              {!compactOperations ? <th>Stage Age</th> : null}
              {hasActions ? <th>Update</th> : null}
              {hasActions ? <th>Onboarding Link</th> : null}
              {hasActions ? <th>Delete</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row?.transaction?.id || row?.unit?.id}
                className="ui-data-row-clickable"
                onClick={() => row?.unit?.id && onRowClick(row.unit.id, row.unit.unit_number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (row?.unit?.id) {
                      onRowClick(row.unit.id, row.unit.unit_number)
                    }
                  }
                }}
                tabIndex={0}
                role="button"
              >
                {(() => {
                  const showOnboardingAction = Boolean(row?.transaction?.id)
                  const checked = selectedUnitIds.includes(row.unit.id)

                  return (
                    <>
                {selectable ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select Unit ${row?.unit?.unit_number || '-'}`}
                      checked={checked}
                      onChange={(event) => onToggleRowSelection?.(row?.unit?.id, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                {showDevelopment ? (
                  <td>
                    <div className={`transaction-list-cell ${compactOperations ? 'transaction-list-cell-inline' : ''}`.trim()}>
                      <strong className={compactOperations ? 'inline-block max-w-[220px] truncate' : ''}>{row.development?.name || 'Unassigned development'}</strong>
                      {!compactOperations && (row.transaction?.property_address_line_1 || row.transaction?.suburb) ? (
                        <small>{row.transaction?.property_address_line_1 || row.transaction?.suburb}</small>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                <td>
                  <div className={`transaction-list-cell ${compactOperations ? 'transaction-list-cell-inline' : ''}`.trim()}>
                    <strong>Unit {row?.unit?.unit_number || '-'}</strong>
                    <small>
                      {financeTypeShortLabel(row.transaction?.finance_type) || 'Finance not set'}
                    </small>
                    {!compactOperations && row.transaction?.transaction_reference ? (
                      <span className="inline-flex w-fit rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#5a6e85]">
                        {row.transaction.transaction_reference}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <span className="inline-flex rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">
                    {getPhaseLabel(row)}
                  </span>
                </td>
                <td>
                  <div className={`transaction-list-cell ${compactOperations ? 'transaction-list-cell-inline' : ''}`.trim()}>
                    <strong>{row.buyer?.name || 'Buyer pending'}</strong>
                    {!compactOperations ? <small>
                      {row.onboarding?.status ? `Onboarding: ${row.onboarding.status}` : formatPurchaserType(row.transaction?.purchaser_type)}
                    </small> : null}
                  </div>
                </td>
                {!compactOperations ? (
                  <td>
                    <div className="transaction-list-stage">
                      <span className={`status-pill ${getLifecycleClassName(row.stage)}`}>{getLifecycleStatus(row.stage)}</span>
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
                      stage={row.stage}
                      updatedAt={row.transaction?.updated_at || row.transaction?.created_at}
                      className="units-table-stage-age"
                    />
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
                      <span className="text-sm text-[#8aa0b8]">-</span>
                    )}
                  </td>
                ) : null}
                {hasActions ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    {showOnboardingAction ? (
                      <OpenOnboardingButton
                        transactionId={row.transaction.id}
                        purchaserType={row.transaction?.purchaser_type || 'individual'}
                        label="Open Link"
                        variant="secondary"
                        className="table-action-button"
                      />
                    ) : (
                      <span className="text-sm text-[#8aa0b8]">-</span>
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
                        disabled={deletingTransactionId === row.transaction.id}
                      >
                        {deletingTransactionId === row.transaction.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    ) : (
                      <span className="text-sm text-[#8aa0b8]">-</span>
                    )}
                  </td>
                ) : null}
                    </>
                  )
                })()}
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={(selectable ? 1 : 0) + dataColumnCount}
                >
                  No active transactions found.
                </td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default UnitsTable
