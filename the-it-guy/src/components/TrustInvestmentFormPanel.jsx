import { useEffect, useMemo, useState } from 'react'
import { TRUST_INVESTMENT_FORM_STATUSES } from '../lib/api'

function formatValue(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined) return '-'

  const text = String(value).trim()
  return text || '-'
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }

  return parsed.toLocaleString()
}

function TrustInvestmentFormPanel({
  form,
  onStatusChange,
  saving = false,
  embedded = false,
  showHeader = true,
}) {
  const [statusValue, setStatusValue] = useState(form?.status || 'Not Started')

  useEffect(() => {
    setStatusValue(form?.status || 'Not Started')
  }, [form?.status])

  const summaryItems = useMemo(
    () => [
      { label: 'Status', value: form?.status || 'Not Started' },
      { label: 'Submitted', value: formatDateTime(form?.submittedAt) },
      { label: 'Reviewed', value: formatDateTime(form?.reviewedAt) },
      { label: 'Approved', value: formatDateTime(form?.approvedAt) },
    ],
    [form?.approvedAt, form?.reviewedAt, form?.status, form?.submittedAt],
  )

  if (!form) {
    return <p className="empty-text">Trust investment form data is not available yet.</p>
  }

  const fields = [
    ['Attorney Firm', form.attorneyFirmName],
    ['Purchaser Full Name', form.purchaserFullName],
    ['Purchaser ID / Registration', form.purchaserIdentityOrRegistrationNumber],
    ['Full Name', form.fullName],
    ['Identity / Registration', form.identityOrRegistrationNumber],
    ['Income Tax Number', form.incomeTaxNumber],
    ['South African Resident', form.southAfricanResident],
    ['Physical Address', form.physicalAddress],
    ['Postal Address', form.postalAddress],
    ['Telephone Number', form.telephoneNumber],
    ['Fax Number', form.faxNumber],
    ['Balance To', form.balanceTo],
    ['Bank Name', form.bankName],
    ['Account Number', form.accountNumber],
    ['Branch Number', form.branchNumber],
    ['Source of Funds', form.sourceOfFunds],
    ['Declaration Accepted', form.declarationAccepted],
    ['Signature Name', form.signatureName],
    ['Signed Date', form.signedDate],
  ]

  const canUpdateStatus = Boolean(form.id)

  return (
    <section className={`request-panel ${embedded ? 'request-panel-embedded' : ''}`}>
      {showHeader ? (
        <div className="section-header">
          <div className="section-header-copy">
            <h3>Trust Investment Instruction Form</h3>
            <p>Client-completed Instruction to Invest Trust Moneys form for this transaction.</p>
          </div>
        </div>
      ) : null}

      <div className="trust-form-summary-grid">
        {summaryItems.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="trust-status-actions no-print">
        <label>
          Internal status
          <select
            value={statusValue}
            onChange={(event) => setStatusValue(event.target.value)}
            disabled={saving || !canUpdateStatus}
          >
            {TRUST_INVESTMENT_FORM_STATUSES.map((status) => (
              <option value={status} key={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ghost-button"
          disabled={saving || !canUpdateStatus || statusValue === (form.status || 'Not Started')}
          onClick={() => onStatusChange?.(statusValue)}
        >
          Update Status
        </button>
      </div>

      <dl className="detail-list detail-list-grid trust-form-detail-grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default TrustInvestmentFormPanel
