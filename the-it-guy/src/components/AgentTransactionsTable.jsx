import { getAgentReadinessState } from '../core/transactions/agentSelectors'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

function formatPurchaserType(value) {
  const normalized = String(value || 'individual')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatDate(value) {
  const parsed = new Date(value || 0)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getMissingSummary(row) {
  const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
  const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
  const missingCountFromSource = Number(row?.documentSummary?.missingCount)
  const missingCount = Number.isFinite(missingCountFromSource)
    ? missingCountFromSource
    : Math.max(totalRequired - uploadedCount, 0)

  return `${missingCount} missing`
}

function getUnitLabel(row) {
  const scope = getTransactionScopeForRow(row)
  if (scope === 'private') {
    return 'Private'
  }
  return `Unit ${row?.unit?.unit_number || '-'}`
}

function getDevelopmentLabel(row) {
  const scope = getTransactionScopeForRow(row)
  if (scope === 'private') {
    return (
      row?.transaction?.property_description ||
      row?.transaction?.property_address_line_1 ||
      [row?.transaction?.suburb, row?.transaction?.city].filter(Boolean).join(', ') ||
      'Private property matter'
    )
  }
  return row?.development?.name || '-'
}

function AgentTransactionsTable({ rows, onRowClick, onDeleteTransaction = null, deletingTransactionId = null, title = 'My Transactions' }) {
  return (
    <DataTable title={title} actions={<span className="meta-chip">{rows.length} transactions</span>} className="table-panel">
      <DataTableInner className="units-table">
          <thead>
            <tr>
              <th>Development</th>
              <th>Unit</th>
              <th>Buyer</th>
              <th>Purchaser Type</th>
              <th>Stage</th>
              <th>Readiness</th>
              <th>Missing Docs</th>
              <th>Last Updated</th>
              {onDeleteTransaction ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const readiness = getAgentReadinessState(row)
              const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || null
              const canOpenRow = Boolean(row?.unit?.id)

              return (
                <tr
                  key={row?.transaction?.id || row?.unit?.id || `${row?.buyer?.id || 'row'}-${row?.stage || 'stage'}`}
                  className={canOpenRow ? 'ui-data-row-clickable' : ''}
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
                  <td>{getDevelopmentLabel(row)}</td>
                  <td>{getUnitLabel(row)}</td>
                  <td>{row?.buyer?.name || '-'}</td>
                  <td>{formatPurchaserType(row?.transaction?.purchaser_type)}</td>
                  <td>{row?.stage || '-'}</td>
                  <td>
                    <StatusBadge className={`tag readiness-chip readiness-chip-${readiness.tone}`}>{readiness.label}</StatusBadge>
                  </td>
                  <td>{getMissingSummary(row)}</td>
                  <td>{formatDate(updatedAt)}</td>
                  {onDeleteTransaction ? (
                    <td onClick={(event) => event.stopPropagation()}>
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
                    </td>
                  ) : null}
                </tr>
              )
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={onDeleteTransaction ? 9 : 8}>No transactions found.</td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default AgentTransactionsTable
