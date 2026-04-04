import { useEffect, useState } from 'react'
import { fetchBondCommissionDashboard } from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return '—'
  return currency.format(Number(value))
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function BondCommissionEarningsPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        const response = await fetchBondCommissionDashboard()
        setData(response)
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  if (loading) return <p className="status-message">Loading bond commissions...</p>
  if (error) return <p className="status-message error">{error}</p>
  if (!data) return null

  return (
    <section className="panel card-tier-standard development-attorney-report-panel">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Commission Earnings & Close-Outs</h3>
          <p>Commercial visibility over approved bond matters, paid commissions, and outstanding payout reconciliation work.</p>
        </div>
      </div>

      <div className="development-attorney-summary-grid">
        <article>
          <span>Eligible Bond Matters</span>
          <strong>{data.summary.eligibleTransactions}</strong>
        </article>
        <article>
          <span>Total Budgeted</span>
          <strong>{formatCurrency(data.summary.totalBudgeted)}</strong>
        </article>
        <article>
          <span>Total Actual Paid</span>
          <strong>{formatCurrency(data.summary.totalActual)}</strong>
        </article>
        <article>
          <span>Reconciled</span>
          <strong>{data.summary.totalReconciled}</strong>
        </article>
        <article>
          <span>Outstanding Statements</span>
          <strong>{data.summary.outstandingStatements}</strong>
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
              <th>Actual Paid</th>
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
                <td>{formatCurrency(item.actualPaidAmount)}</td>
                <td>{formatCurrency(item.varianceAmount)}</td>
                <td>{toTitleLabel(item.closeOutStatus)}</td>
                <td>{toTitleLabel(item.reconciliationStatus)}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={8} className="empty-text">
                  No approved bond matters with commission records are available yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default BondCommissionEarningsPanel
