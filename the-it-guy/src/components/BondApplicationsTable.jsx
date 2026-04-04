import { getBondApplicationStage } from '../core/transactions/bondSelectors'
import DataTable, { DataTableInner } from './ui/DataTable'

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return 'R 0'
  }

  return CURRENCY.format(amount)
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

function stageLabelFromKey(key) {
  if (key === 'docs_requested') return 'Documents Requested'
  if (key === 'docs_received') return 'Documents Received'
  if (key === 'application_submitted') return 'Application Submitted'
  if (key === 'bank_reviewing') return 'Bank Reviewing'
  if (key === 'approval_granted') return 'Approval Granted'
  if (key === 'declined') return 'Declined'
  return 'Documents Requested'
}

function BondApplicationsTable({ rows, onRowClick, title = 'Applications Queue' }) {
  return (
    <DataTable title={title} actions={<span className="meta-chip">{rows.length} applications</span>} className="bond-applications-panel">
      <DataTableInner className="units-table bond-applications-table">
          <thead>
            <tr>
              <th className="w-[12%]">Unit</th>
              <th className="w-[19%]">Development</th>
              <th className="w-[18%]">Buyer</th>
              <th className="w-[16%]">Loan Amount</th>
              <th className="w-[17%]">Application Stage</th>
              <th className="w-[10%]">Bank</th>
              <th className="w-[8%]">Last Update</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const stageKey = getBondApplicationStage(row)
              const stageLabel = stageLabelFromKey(stageKey)
              const updatedAt = row?.transaction?.updated_at || row?.transaction?.created_at || null

              return (
                <tr
                  key={row?.transaction?.id || row?.unit?.id || `bond-row-${row?.buyer?.id || Math.random()}`}
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
                  <td>Unit {row?.unit?.unit_number || '-'}</td>
                  <td>{row?.development?.name || '-'}</td>
                  <td>{row?.buyer?.name || '-'}</td>
                  <td>{formatCurrency(row?.transaction?.sales_price ?? row?.unit?.price)}</td>
                  <td>{stageLabel}</td>
                  <td>{row?.transaction?.bank || 'Not set'}</td>
                  <td>{formatDate(updatedAt)}</td>
                </tr>
              )
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No applications found.</td>
              </tr>
            ) : null}
          </tbody>
      </DataTableInner>
    </DataTable>
  )
}

export default BondApplicationsTable
