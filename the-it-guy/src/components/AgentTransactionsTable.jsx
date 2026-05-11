import { useMemo, useState } from 'react'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

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

function formatTransferStage(row) {
  const mainStage = String(row?.mainStage || row?.transaction?.current_main_stage || '').trim().toUpperCase()
  const stage = String(row?.stage || '').trim().toLowerCase()

  if (mainStage === 'REG' || stage === 'registered') return 'Registered'
  if (mainStage === 'XFER') return 'Transfer in Progress'
  if (mainStage === 'ATTY') return 'Attorney Prep'
  return 'Pre-transfer'
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

function getReference(row) {
  const reference = String(row?.transaction?.transaction_reference || '').trim()
  if (reference) return reference
  const id = String(row?.transaction?.id || '').trim()
  return id ? `TXN-${id.slice(0, 8).toUpperCase()}` : 'Pending'
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

function getAssignedAgentLabel(row) {
  return String(row?.transaction?.assigned_agent || row?.transaction?.assigned_agent_email || 'Unassigned').trim()
}

function getEmptyStateCopy(isPrincipalView) {
  if (isPrincipalView) {
    return "No transactions yet. Once leads are converted into deals, they’ll appear here across your organisation scope."
  }
  return "No transactions yet. Once your assigned leads are converted into deals, they’ll appear here automatically."
}

function AgentTransactionsTable({
  rows,
  onRowClick,
  onDeleteTransaction = null,
  deletingTransactionId = null,
  title = 'Transactions',
  isPrincipalView = false,
}) {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil((rows?.length || 0) / pageSize))
  const currentPage = Math.min(page, totalPages)

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (rows || []).slice(start, start + pageSize)
  }, [currentPage, rows])

  const pageStart = rows.length ? (currentPage - 1) * pageSize + 1 : 0
  const pageEnd = Math.min(rows.length, currentPage * pageSize)

  return (
    <DataTable
      title={title}
      actions={
        <div className="flex items-center gap-2">
          <span className="meta-chip">{rows.length} transactions</span>
          {rows.length > pageSize ? (
            <span className="meta-chip">Showing {pageStart}-{pageEnd}</span>
          ) : null}
        </div>
      }
      className="table-panel"
    >
      <DataTableInner className="units-table min-w-[1680px]">
        <thead>
          <tr>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[170px]">Transaction Reference</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[170px]">Buyer / Client</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[170px]">Property / Unit</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[190px]">Development / Listing</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[160px]">Assigned Agent</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[130px]">Main Stage</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[170px]">Finance Stage</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[145px]">Transfer Stage</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[130px]">Status</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[125px]">Last Updated</th>
            <th className="sticky top-0 z-[2] bg-[#f7faff] min-w-[170px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => {
            const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || null
            const canOpenRow = Boolean(row?.unit?.id)
            const mainStage = formatMainStage(row)
            const financeStage = formatFinanceStage(row)
            const transferStage = formatTransferStage(row)
            const status = formatTransactionStatus(row)

            return (
              <tr
                key={row?.transaction?.id || row?.unit?.id || `${row?.buyer?.id || 'row'}-${row?.stage || 'stage'}`}
                className={`${canOpenRow ? 'ui-data-row-clickable' : ''} ${index % 2 === 0 ? 'bg-white' : 'bg-[#fcfdff]'}`.trim()}
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
                <td>
                  <div className="transaction-list-cell">
                    <strong className="inline-block max-w-[150px] truncate" title={getReference(row)}>{getReference(row)}</strong>
                    <small className="inline-block max-w-[150px] truncate" title={row?.transaction?.id || ''}>{row?.transaction?.id || 'No id'}</small>
                  </div>
                </td>
                <td>
                  <div className="transaction-list-cell">
                    <strong className="inline-block max-w-[150px] truncate" title={row?.buyer?.name || 'Buyer pending'}>{row?.buyer?.name || 'Buyer pending'}</strong>
                    <small className="inline-block max-w-[150px] truncate" title={row?.buyer?.email || ''}>{row?.buyer?.email || row?.buyer?.phone || 'No contact details'}</small>
                  </div>
                </td>
                <td>
                  <div className="transaction-list-cell">
                    <strong className="inline-block max-w-[150px] truncate" title={getPropertyLabel(row)}>{getPropertyLabel(row)}</strong>
                    <small className="inline-block max-w-[150px] truncate" title={row?.transaction?.property_address_line_1 || row?.transaction?.suburb || ''}>
                      {row?.transaction?.property_address_line_1 || row?.transaction?.suburb || 'Address pending'}
                    </small>
                  </div>
                </td>
                <td>
                  <span className="inline-block max-w-[170px] truncate" title={getDevelopmentLabel(row)}>{getDevelopmentLabel(row)}</span>
                </td>
                <td>
                  <span className="inline-block max-w-[140px] truncate" title={getAssignedAgentLabel(row)}>{getAssignedAgentLabel(row)}</span>
                </td>
                <td>
                  <StatusBadge className={`tag ${mainStage.tone === 'success' ? 'bg-[#edf9f2] border-[#d5eadf] text-[#1f7a45]' : mainStage.tone === 'warning' ? 'bg-[#fff6ea] border-[#f0ddbf] text-[#946024]' : ''}`}>
                    {mainStage.label}
                  </StatusBadge>
                </td>
                <td>
                  <div className="transaction-list-cell">
                    <StatusBadge>{financeStage.label}</StatusBadge>
                    <small className="inline-block max-w-[160px] truncate" title={financeStage.detail}>{financeStage.detail}</small>
                  </div>
                </td>
                <td>
                  <StatusBadge>{transferStage}</StatusBadge>
                </td>
                <td>
                  <StatusBadge className={status.className}>{status.label}</StatusBadge>
                </td>
                <td>{formatDate(updatedAt)}</td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="flex flex-wrap gap-2">
                    {row?.transaction?.id ? (
                      <Button
                        variant="secondary"
                        className="table-action-button"
                        onClick={() => onRowClick(row)}
                      >
                        Open
                      </Button>
                    ) : null}
                    {onDeleteTransaction && row?.transaction?.id ? (
                      <Button
                        variant="ghost"
                        className="ghost-button danger-ghost table-action-button"
                        onClick={() => onDeleteTransaction(row)}
                        disabled={deletingTransactionId === row.transaction.id}
                      >
                        {deletingTransactionId === row.transaction.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={11}>{getEmptyStateCopy(isPrincipalView)}</td>
            </tr>
          ) : null}
        </tbody>
      </DataTableInner>

      {rows.length > pageSize ? (
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
