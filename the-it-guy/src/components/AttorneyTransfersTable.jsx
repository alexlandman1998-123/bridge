import {
  getAttorneyOperationalState,
  getAttorneyTransferStage,
  stageLabelFromAttorneyKey,
} from '../core/transactions/attorneySelectors'
import { getReportNextAction } from '../core/transactions/reportNextAction'
import { normalizeFinanceType } from '../core/transactions/financeType'
import DataTable, { DataTableInner } from './ui/DataTable'
import StatusBadge from './ui/StatusBadge'

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '-'
  return `R ${Math.round(amount).toLocaleString('en-ZA')}`
}

function isPrivateMatter(row) {
  const type = String(row?.transaction?.transaction_type || '').toLowerCase()
  return type === 'private' || (!row?.development?.id && !row?.unit?.id)
}

function getMatterLabel(row) {
  if (isPrivateMatter(row)) {
    return row?.transaction?.property_address_line_1 || row?.transaction?.property_description || 'Private property matter'
  }

  return row?.development?.name || '-'
}

function getMatterSubLabel(row) {
  if (isPrivateMatter(row)) {
    return [
      row?.transaction?.suburb,
      row?.transaction?.city,
    ]
      .filter(Boolean)
      .join(', ') || row?.transaction?.property_description || 'Standalone conveyancing matter'
  }

  return `Unit ${row?.unit?.unit_number || '-'}`
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
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr>
              <th>Matter / Property</th>
              <th>Client</th>
              <th>Type</th>
              <th>Current Stage</th>
              <th>Document Readiness</th>
              <th>Financial Status</th>
              <th>File Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const stageKey = getAttorneyTransferStage(row)
              const stageLabel = stageLabelFromAttorneyKey(stageKey)
              const operational = getAttorneyOperationalState(row)
              const purchasePrice = Number(row?.transaction?.purchase_price || row?.transaction?.sales_price || row?.unit?.price || row?.unit?.list_price || 0)
              const financeType = normalizeFinanceType(row?.transaction?.finance_type || 'cash')
              const typeLabel = isPrivateMatter(row) ? 'Private' : 'Development'
              const fileStatus = stageKey === 'registered' ? 'Registered' : row?.transaction?.id ? 'Live matter' : 'No active matter'

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
                    <div className="attorney-queue-cell">
                      <span>{getMatterLabel(row)}</span>
                      <small>{getMatterSubLabel(row)}</small>
                    </div>
                  </td>
                  <td>{row?.buyer?.name || 'Client pending'}</td>
                  <td>
                    <StatusBadge className="tag readiness-chip readiness-chip-info whitespace-nowrap">{typeLabel}</StatusBadge>
                  </td>
                  <td>
                    <div className="attorney-queue-cell">
                      <span>{stageLabel}</span>
                      <small>{operational.daysSinceUpdate}d in stage</small>
                    </div>
                  </td>
                  <td>
                    <span className={`ui-badge tag readiness-chip readiness-chip-${operational.documentReadiness.tone}`}>
                      {operational.documentReadiness.label}
                    </span>
                  </td>
                  <td>
                    <div className="attorney-queue-cell">
                      <span>{operational.financeStatus.label}</span>
                      <small>{financeType}</small>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`ui-badge tag readiness-chip whitespace-nowrap ${
                        fileStatus === 'Registered' ? 'readiness-chip-success' : fileStatus === 'Live matter' ? 'readiness-chip-info' : 'readiness-chip-neutral'
                      }`}
                    >
                      {fileStatus}
                    </span>
                  </td>
                  <td>{formatCurrency(purchasePrice)}</td>
                </tr>
              )
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>No matters found.</td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default AttorneyTransfersTable
