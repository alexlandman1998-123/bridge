import { ArrowUpRight, BriefcaseBusiness, FileText, Search } from 'lucide-react'
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

function getWorkflowToneClass(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['registered', 'completed', 'active'].includes(normalized)) {
    return 'transaction-chip-success'
  }
  if (['bond', 'cash', 'combination', 'transfer in progress', 'attorney prep'].includes(normalized)) {
    return 'transaction-chip-info'
  }
  if (['pre-transfer', 'not set', 'unmapped'].includes(normalized)) {
    return 'transaction-chip-muted'
  }
  return 'transaction-chip-watch'
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

function getOrganisationLabel(row) {
  const explicit = String(row?.organisation?.name || row?.organisation?.display_name || '').trim()
  if (explicit) return explicit
  const id = String(row?.transaction?.organisation_id || '').trim()
  return id ? `Org ${id.slice(0, 8)}` : 'Organisation pending'
}

function getBranchLabel(row) {
  const explicit = String(row?.branch?.name || row?.transaction?.assigned_branch_name || '').trim()
  if (explicit) return explicit
  const id = String(row?.transaction?.assigned_branch_id || row?.transaction?.branch_id || '').trim()
  return id ? `Branch ${id.slice(0, 8)}` : ''
}

function getEmptyStateCopy(isPrincipalView) {
  if (isPrincipalView) {
    return "No transactions yet. Once leads are converted into deals, they’ll appear here across your organisation scope."
  }
  return "No transactions yet. Once your assigned leads are converted into deals, they’ll appear here automatically."
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
  const metrics = useMemo(() => getTableMetrics(rows || []), [rows])

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return (rows || []).slice(start, start + pageSize)
  }, [currentPage, rows])

  const pageStart = rows.length ? (currentPage - 1) * pageSize + 1 : 0
  const pageEnd = Math.min(rows.length, currentPage * pageSize)

  return (
    <DataTable
      title={title}
      copy={isPrincipalView ? 'Organisation-wide transaction oversight across agents, stages, and bottlenecks.' : 'Your assigned transaction workload, stages, and next operational actions.'}
      actions={
        <div className="agent-transactions-metrics">
          <span className="meta-chip">{metrics.total} transactions</span>
          <span className="meta-chip">{metrics.active} active</span>
          <span className="meta-chip">{metrics.transfer} transfer</span>
          <span className="meta-chip">{metrics.registered} registered</span>
          {rows.length > pageSize ? (
            <span className="meta-chip">Showing {pageStart}-{pageEnd}</span>
          ) : null}
        </div>
      }
      className="table-panel agent-transactions-panel"
    >
      <DataTableInner className="units-table agent-transactions-table">
        <thead>
          <tr>
            <th className="agent-transactions-sticky-first">Transaction Reference</th>
            <th>Buyer / Client</th>
            <th>Property / Unit</th>
            <th>Development / Listing</th>
            {isPrincipalView ? <th>Organisation / Branch</th> : null}
            <th>Assigned Agent</th>
            <th>Main Stage</th>
            <th>Finance Stage</th>
            <th>Transfer Stage</th>
            <th>Status</th>
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
            const transferStage = formatTransferStage(row)
            const status = formatTransactionStatus(row)
            const reference = getReference(row)
            const buyerName = row?.buyer?.name || 'Buyer pending'
            const propertyLabel = getPropertyLabel(row)
            const developmentLabel = getDevelopmentLabel(row)
            const agentLabel = getAssignedAgentLabel(row)

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
                <td className="agent-transactions-sticky-first" data-label="Transaction Reference">
                  <div className="transaction-list-cell">
                    <strong className="transaction-cell-primary" title={reference}>{reference}</strong>
                    <small className="transaction-cell-secondary" title={row?.transaction?.id || ''}>
                      {row?.transaction?.transaction_type ? String(row.transaction.transaction_type).replace(/_/g, ' ') : row?.transaction?.id || 'No id'}
                    </small>
                  </div>
                </td>
                <td data-label="Buyer / Client">
                  <div className="transaction-list-cell">
                    <strong className="transaction-cell-primary" title={buyerName}>{buyerName}</strong>
                    <small className="transaction-cell-secondary" title={row?.buyer?.email || ''}>{row?.buyer?.email || row?.buyer?.phone || 'No contact details'}</small>
                  </div>
                </td>
                <td data-label="Property / Unit">
                  <div className="transaction-list-cell">
                    <strong className="transaction-cell-primary" title={propertyLabel}>{propertyLabel}</strong>
                    <small className="transaction-cell-secondary" title={row?.transaction?.property_address_line_1 || row?.transaction?.suburb || ''}>
                      {row?.transaction?.property_address_line_1 || row?.transaction?.suburb || 'Address pending'}
                    </small>
                  </div>
                </td>
                <td data-label="Development / Listing">
                  <span className="transaction-cell-primary" title={developmentLabel}>{developmentLabel}</span>
                </td>
                {isPrincipalView ? (
                  <td data-label="Organisation / Branch">
                    <div className="transaction-list-cell">
                      <strong className="transaction-cell-primary" title={getOrganisationLabel(row)}>{getOrganisationLabel(row)}</strong>
                      <small className="transaction-cell-secondary" title={getBranchLabel(row)}>{getBranchLabel(row) || 'All branches'}</small>
                    </div>
                  </td>
                ) : null}
                <td data-label="Assigned Agent">
                  <span className="transaction-cell-primary" title={agentLabel}>{agentLabel}</span>
                </td>
                <td data-label="Main Stage">
                  <StatusBadge className={`transaction-workflow-chip ${getWorkflowToneClass(mainStage.label)} ${mainStage.tone === 'success' ? 'transaction-chip-success' : mainStage.tone === 'warning' ? 'transaction-chip-watch' : ''}`.trim()}>
                    {mainStage.label}
                  </StatusBadge>
                </td>
                <td data-label="Finance Stage">
                  <div className="transaction-list-cell">
                    <StatusBadge className={`transaction-workflow-chip ${getWorkflowToneClass(financeStage.label)}`}>{financeStage.label}</StatusBadge>
                    <small className="transaction-cell-secondary" title={financeStage.detail}>{financeStage.detail}</small>
                  </div>
                </td>
                <td data-label="Transfer Stage">
                  <StatusBadge className={`transaction-workflow-chip ${getWorkflowToneClass(transferStage)}`}>{transferStage}</StatusBadge>
                </td>
                <td data-label="Status">
                  <StatusBadge className={`transaction-workflow-chip ${status.className}`}>{status.label}</StatusBadge>
                </td>
                <td data-label="Last Updated">{formatDate(updatedAt)}</td>
                <td data-label="Actions" onClick={(event) => event.stopPropagation()}>
                  <div className="transaction-row-actions">
                    {row?.transaction?.id ? (
                      <Button
                        variant="secondary"
                        className="table-action-button transaction-row-action-primary"
                        onClick={() => onRowClick(row)}
                      >
                        <ArrowUpRight size={14} />
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
              <td className="agent-transactions-empty" colSpan={isPrincipalView ? 12 : 11}>
                <div className="agent-transactions-empty-state">
                  <span className="agent-transactions-empty-icon">
                    {isPrincipalView ? <BriefcaseBusiness size={22} /> : <FileText size={22} />}
                  </span>
                  <strong>No transactions yet.</strong>
                  <p>{getEmptyStateCopy(isPrincipalView).replace('No transactions yet. ', '')}</p>
                  <small><Search size={14} /> Try clearing filters or search terms if you expected to see activity.</small>
                </div>
              </td>
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
