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

function UnitsTable({
  rows,
  onRowClick,
  onDeleteTransaction = null,
  deletingTransactionId = null,
  title = 'Units',
  showDevelopment = false,
  headerActions = null,
  selectable = false,
  selectedUnitIds = [],
  onToggleRowSelection = null,
  onToggleAllSelection = null,
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((row) => selectedUnitIds.includes(row.unit.id))

  return (
    <DataTable
      title={title}
      actions={headerActions}
      className="units-table-panel !overflow-hidden !p-6 max-sm:!p-4"
    >
      <DataTableInner className="units-table developer-transactions-table">
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
              <th>Buyer</th>
              <th>Stage</th>
              <th>Stage Age</th>
              {onDeleteTransaction ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.unit.id}
                className="ui-data-row-clickable"
                onClick={() => onRowClick(row.unit.id, row.unit.unit_number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onRowClick(row.unit.id, row.unit.unit_number)
                  }
                }}
                tabIndex={0}
                role="button"
              >
                {(() => {
                  const showOnboardingAction = Boolean(row?.transaction?.id) && !row?.transaction?.buyer_id && !row?.buyer?.id
                  const checked = selectedUnitIds.includes(row.unit.id)

                  return (
                    <>
                {selectable ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select Unit ${row.unit.unit_number}`}
                      checked={checked}
                      onChange={(event) => onToggleRowSelection?.(row.unit.id, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                {showDevelopment ? (
                  <td>
                    <div className="transaction-list-cell">
                      <strong>{row.development?.name || 'Unassigned development'}</strong>
                      <small>{row.transaction?.property_address_line_1 || row.transaction?.suburb || 'Development transaction'}</small>
                    </div>
                  </td>
                ) : null}
                <td>
                  <div className="transaction-list-cell">
                    <strong>Unit {row.unit.unit_number}</strong>
                    <small>
                      {financeTypeShortLabel(row.transaction?.finance_type) || 'Finance not set'}
                      {row.transaction?.transaction_reference ? ` • ${row.transaction.transaction_reference}` : ''}
                    </small>
                  </div>
                </td>
                <td>
                  <div className="transaction-list-cell">
                    <strong>{row.buyer?.name || 'Buyer pending'}</strong>
                    <small>{formatPurchaserType(row.transaction?.purchaser_type)}</small>
                  </div>
                </td>
                <td>
                  <div className="transaction-list-stage">
                    <span className={`status-pill ${getLifecycleClassName(row.stage)}`}>{getLifecycleStatus(row.stage)}</span>
                    <small className="transaction-list-stage-detail">{row.stage || 'Stage pending'}</small>
                  </div>
                </td>
                <td>
                  <StageAgingChip
                    stage={row.stage}
                    updatedAt={row.transaction?.updated_at || row.transaction?.created_at}
                    className="units-table-stage-age"
                  />
                </td>
                {onDeleteTransaction ? (
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      {showOnboardingAction ? (
                        <OpenOnboardingButton
                          transactionId={row.transaction.id}
                          purchaserType={row.transaction?.purchaser_type || 'individual'}
                          label="Onboarding"
                          variant="secondary"
                          className="table-action-button"
                        />
                      ) : null}
                      {row?.transaction?.id ? (
                        <Button
                          variant="ghost"
                          className="ghost-button danger-ghost table-action-button"
                          onClick={() => onDeleteTransaction(row)}
                          disabled={deletingTransactionId === row.transaction.id}
                        >
                          {deletingTransactionId === row.transaction.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                ) : null}
                    </>
                  )
                })()}
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={(selectable ? 1 : 0) + (showDevelopment ? (onDeleteTransaction ? 7 : 6) : onDeleteTransaction ? 6 : 5)}>
                  No units found.
                </td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default UnitsTable
