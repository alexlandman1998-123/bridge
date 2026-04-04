import { useEffect, useState } from 'react'
import { fetchAttorneyBillablesDashboard } from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) {
    return '—'
  }

  return currency.format(Number(value))
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function AttorneyBillablesPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const response = await fetchAttorneyBillablesDashboard()
        setData(response)
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  if (loading) {
    return <p className="status-message">Loading attorney billables...</p>
  }

  if (error) {
    return <p className="status-message error">{error}</p>
  }

  if (!data) {
    return null
  }

  return (
    <section className="panel card-tier-standard development-attorney-report-panel">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Billables & Close-Outs</h3>
          <p>Commercial visibility over registered matters, billed fees, and outstanding post-registration close-out work.</p>
        </div>
      </div>

      <div className="development-attorney-summary-grid">
        <article>
          <span>Registered Matters</span>
          <strong>{data.summary.registeredTransactions}</strong>
        </article>
        <article>
          <span>Total Budgeted</span>
          <strong>{formatCurrency(data.summary.totalBudgeted)}</strong>
        </article>
        <article>
          <span>Total Actual</span>
          <strong>{formatCurrency(data.summary.totalActual)}</strong>
        </article>
        <article>
          <span>Reconciled</span>
          <strong>{data.summary.totalReconciled}</strong>
        </article>
        <article>
          <span>Outstanding Invoices</span>
          <strong>{data.summary.outstandingInvoices}</strong>
        </article>
        <article>
          <span>Outstanding Close-Outs</span>
          <strong>{data.summary.outstandingCloseouts}</strong>
        </article>
      </div>

      <div className="table-shell">
        <table className="table attorney-report-table">
          <thead>
            <tr>
              <th>Development</th>
              <th>Unit</th>
              <th>Purchaser</th>
              <th>Budgeted</th>
              <th>Actual</th>
              <th>Variance</th>
              <th>Close-Out</th>
              <th>Reconciliation</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((item) => (
              <tr key={item.id}>
                <td>{item.developmentName}</td>
                <td>{item.unitNumber}</td>
                <td>{item.buyerName}</td>
                <td>{formatCurrency(item.budgetedAmount)}</td>
                <td>{formatCurrency(item.actualBilledAmount)}</td>
                <td>{formatCurrency(item.varianceAmount)}</td>
                <td>{toTitleLabel(item.closeOutStatus)}</td>
                <td>{toTitleLabel(item.reconciliationStatus)}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={8} className="empty-text">
                  No registered matters with close-out records are available yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default AttorneyBillablesPanel
