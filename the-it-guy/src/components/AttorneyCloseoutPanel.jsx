import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchTransactionAttorneyCloseout,
  saveTransactionAttorneyCloseout,
  uploadTransactionAttorneyCloseoutDocument,
} from '../lib/api'

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

function formatDate(value) {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Not set'
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function AttorneyCloseoutPanel({ transaction, unit, buyer, visible = true }) {
  const [closeout, setCloseout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    budgetedAmount: '',
    actualBilledAmount: '',
    invoiceReference: '',
    invoiceDate: '',
    statementDate: '',
    notes: '',
  })

  const load = useCallback(async () => {
    if (!transaction?.id || !visible) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await fetchTransactionAttorneyCloseout(transaction.id)
      setCloseout(response)
      setForm({
        budgetedAmount: response?.budgetedAmount ?? '',
        actualBilledAmount: response?.actualBilledAmount ?? '',
        invoiceReference: response?.invoiceReference || '',
        invoiceDate: response?.invoiceDate || '',
        statementDate: response?.statementDate || '',
        notes: response?.notes || '',
      })
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [transaction?.id, visible])

  useEffect(() => {
    void load()
  }, [load])

  const checklistItems = useMemo(() => {
    if (!closeout) {
      return []
    }

    return [
      {
        key: 'registered',
        label: 'Registration confirmed',
        complete: Boolean(closeout.readiness?.isRegistered),
      },
      {
        key: 'budget',
        label: 'Budgeted amount configured',
        complete: Boolean(closeout.readiness?.hasBudget),
      },
      {
        key: 'actual',
        label: 'Actual billed amount entered',
        complete: Boolean(closeout.readiness?.hasActual),
      },
      {
        key: 'documents',
        label: 'Required close-out documents uploaded',
        complete: Boolean(closeout.readiness?.allRequiredDocsUploaded),
      },
    ]
  }, [closeout])

  if (!visible) {
    return null
  }

  async function handleSave(action = 'save') {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const response = await saveTransactionAttorneyCloseout(transaction.id, {
        ...form,
        markReadyForReview: action === 'ready',
        markClosed: action === 'close',
      })
      setCloseout(response)
      setForm({
        budgetedAmount: response?.budgetedAmount ?? '',
        actualBilledAmount: response?.actualBilledAmount ?? '',
        invoiceReference: response?.invoiceReference || '',
        invoiceDate: response?.invoiceDate || '',
        statementDate: response?.statementDate || '',
        notes: response?.notes || '',
      })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadDocument(documentTypeKey, label, file) {
    if (!file || !transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const response = await uploadTransactionAttorneyCloseoutDocument({
        transactionId: transaction.id,
        closeoutId: closeout?.id || null,
        file,
        documentTypeKey,
        label,
      })
      setCloseout(response)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel-section attorney-closeout-panel no-print">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Attorney Close-Out</h3>
          <p>Commercial reconciliation after registration. Registered and closed are intentionally separate states.</p>
        </div>
        {closeout ? (
          <span className="meta-chip">
            {toTitleLabel(closeout.closeOutStatus)} • {toTitleLabel(closeout.reconciliationStatus)}
          </span>
        ) : null}
      </div>

      {loading ? <p className="status-message">Loading attorney close-out...</p> : null}
      {error ? <p className="status-message error">{error}</p> : null}

      {!loading && !closeout ? (
        <p className="empty-text">Attorney close-out becomes available once the transaction is registered and the close-out tables are active.</p>
      ) : null}

      {closeout ? (
        <>
          <div className="development-attorney-summary-grid">
            <article>
              <span>Unit</span>
              <strong>{unit?.unit_number || '—'}</strong>
            </article>
            <article>
              <span>Purchaser</span>
              <strong>{buyer?.name || 'Unassigned'}</strong>
            </article>
            <article>
              <span>Attorney</span>
              <strong>{closeout.attorneyFirmName}</strong>
            </article>
            <article>
              <span>Budgeted</span>
              <strong>{formatCurrency(closeout.budgetedAmount)}</strong>
            </article>
            <article>
              <span>Actual</span>
              <strong>{formatCurrency(closeout.actualBilledAmount)}</strong>
            </article>
            <article>
              <span>Variance</span>
              <strong>{formatCurrency(closeout.varianceAmount)}</strong>
            </article>
          </div>

          <div className="unit-overview-layout attorney-closeout-layout">
            <section className="panel-section">
              <div className="section-header">
                <div className="section-header-copy">
                  <h4>Budget vs Actual</h4>
                  <p>Capture the final billed amount and the invoice / statement references for this registered transfer.</p>
                </div>
              </div>

              <form className="stack-form client-form" onSubmit={(event) => event.preventDefault()}>
                <div className="client-two-col">
                  <label>
                    Budgeted Amount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.budgetedAmount}
                      onChange={(event) => setForm((previous) => ({ ...previous, budgetedAmount: event.target.value }))}
                    />
                  </label>
                  <label>
                    Actual Billed Amount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.actualBilledAmount}
                      onChange={(event) => setForm((previous) => ({ ...previous, actualBilledAmount: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="client-three-col">
                  <label>
                    Invoice Reference
                    <input
                      type="text"
                      value={form.invoiceReference}
                      onChange={(event) => setForm((previous) => ({ ...previous, invoiceReference: event.target.value }))}
                    />
                  </label>
                  <label>
                    Invoice Date
                    <input
                      type="date"
                      value={form.invoiceDate}
                      onChange={(event) => setForm((previous) => ({ ...previous, invoiceDate: event.target.value }))}
                    />
                  </label>
                  <label>
                    Statement Date
                    <input
                      type="date"
                      value={form.statementDate}
                      onChange={(event) => setForm((previous) => ({ ...previous, statementDate: event.target.value }))}
                    />
                  </label>
                </div>

                <label>
                  Close-Out Notes
                  <textarea rows={4} value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} />
                </label>

                <div className="client-form-actions">
                  <button type="button" className="ghost-button" onClick={() => void handleSave('save')} disabled={saving}>
                    Save Close-Out
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleSave('ready')} disabled={saving}>
                    Mark Ready For Review
                  </button>
                  <button type="button" onClick={() => void handleSave('close')} disabled={saving || closeout.closeOutStatus === 'closed'}>
                    {closeout.closeOutStatus === 'closed' ? 'Closed' : 'Close Transaction'}
                  </button>
                </div>
              </form>
            </section>

            <aside className="panel-section">
              <div className="section-header">
                <div className="section-header-copy">
                  <h4>Close-Out Checklist</h4>
                  <p>These items must be complete before the transaction can move from registered to closed.</p>
                </div>
              </div>

              <ul className="attorney-closeout-checklist">
                {checklistItems.map((item) => (
                  <li key={item.key} className={item.complete ? 'is-complete' : ''}>
                    <span>{item.label}</span>
                    <strong>{item.complete ? 'Complete' : 'Outstanding'}</strong>
                  </li>
                ))}
              </ul>

              <div className="attorney-closeout-meta">
                <span>Ready for Review</span>
                <strong>{formatDate(closeout.readyForReviewAt)}</strong>
                <span>Closed At</span>
                <strong>{formatDate(closeout.closedAt)}</strong>
              </div>
            </aside>
          </div>

          <section className="panel-section">
            <div className="section-header">
              <div className="section-header-copy">
                <h4>Close-Out Documents</h4>
                <p>Upload the final invoice, statement, and registration confirmation directly against the close-out record.</p>
              </div>
            </div>

            <div className="attorney-closeout-doc-grid">
              {(closeout.documents || []).map((item) => (
                <article key={item.key} className="attorney-closeout-doc-card">
                  <div>
                    <h5>{item.label}</h5>
                    <p>{item.isRequired ? 'Required for final close-out' : 'Optional supporting document'}</p>
                  </div>
                  <span className={`meta-chip${item.status === 'uploaded' || item.status === 'accepted' ? ' success' : ''}`}>
                    {toTitleLabel(item.status)}
                  </span>
                  <div className="attorney-closeout-doc-meta">
                    <small>{item.filename || 'No file uploaded yet'}</small>
                    <small>{item.uploadedAt ? formatDate(item.uploadedAt) : 'Awaiting upload'}</small>
                  </div>
                  <div className="unit-access-actions">
                    <label className="ghost-button">
                      Upload
                      <input
                        type="file"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) {
                            void handleUploadDocument(item.key, item.label, file)
                          }
                          event.target.value = ''
                        }}
                      />
                    </label>
                    {item.url ? (
                      <a className="ghost-button" href={item.url} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  )
}

export default AttorneyCloseoutPanel
