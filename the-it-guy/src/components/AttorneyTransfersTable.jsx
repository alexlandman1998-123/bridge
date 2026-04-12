import { deriveAttorneyOperationalStateForRow } from '../core/transactions/attorneyOperationalEngine'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || (!row?.development?.id && !row?.unit?.id)
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

function getSellerLabel(row) {
  return row?.transaction?.seller_name || row?.transaction?.seller || row?.onboardingFormData?.formData?.seller_name || 'Not captured'
}

function getAgentLabel(row) {
  return row?.transaction?.assigned_agent || row?.transaction?.agent || 'Unassigned'
}

function getDaysOpen(row) {
  const createdAt = new Date(row?.transaction?.created_at || 0)
  if (Number.isNaN(createdAt.getTime())) return 0
  const diffMs = Date.now() - createdAt.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
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

function getStatusTone(statusLabel) {
  if (statusLabel === 'Registered') return 'readiness-chip-success'
  if (statusLabel === 'Lodged') return 'readiness-chip-info'
  if (statusLabel === 'On Hold / Blocked') return 'readiness-chip-warning'
  if (statusLabel === 'Archived' || statusLabel === 'Cancelled') return 'readiness-chip-neutral'
  if (statusLabel === 'Completed') return 'readiness-chip-success'
  return 'readiness-chip-neutral'
}

function AttorneyTransfersTable({ rows, onRowClick, title = 'Transactions' }) {
  return (
    <DataTable
      title={title}
      actions={
        <div className="flex items-center justify-end">
          <span className="meta-chip whitespace-nowrap">{rows.length} matters</span>
        </div>
      }
      className="attorney-transfers-panel"
    >
      <DataTableInner className="units-table attorney-transfers-table">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              <th>Property / Unit</th>
              <th>Development</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Current Stage</th>
              <th>Days Open</th>
              <th>Status</th>
              <th>Agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const operational = deriveAttorneyOperationalStateForRow(row)
              const stageKey = operational.stageKey
              const stageLabel = operational.stageLabel
              const daysOpen = getDaysOpen(row)
              const statusLabel = getStatusLabel(row, operational, stageKey)

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
                  <td>
                    <strong>{getPropertyUnitLabel(row)}</strong>
                  </td>
                  <td>{getDevelopmentLabel(row)}</td>
                  <td>{row?.buyer?.name || 'Client pending'}</td>
                  <td>{getSellerLabel(row)}</td>
                  <td>
                    <StatusBadge className="tag readiness-chip readiness-chip-info whitespace-nowrap">{stageLabel}</StatusBadge>
                  </td>
                  <td>{daysOpen}</td>
                  <td><StatusBadge className={`tag readiness-chip whitespace-nowrap ${getStatusTone(statusLabel)}`}>{statusLabel}</StatusBadge></td>
                  <td>{getAgentLabel(row)}</td>
                </tr>
              )
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>No matters found.</td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default AttorneyTransfersTable
