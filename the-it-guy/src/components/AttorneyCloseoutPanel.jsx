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

function stripMarkup(value) {
  if (!value) return ''
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function formatDocumentStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'accepted' || normalized === 'verified') return 'Verified'
  if (normalized === 'uploaded' || normalized === 'under_review') return 'Uploaded'
  if (normalized === 'reupload_required') return 'Reupload Required'
  return 'Missing'
}

function getDocumentStatusTone(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'accepted' || normalized === 'verified') {
    return 'border-[#cde8d8] bg-[#eff9f2] text-[#1b7c45]'
  }
  if (normalized === 'uploaded' || normalized === 'under_review') {
    return 'border-[#d7e4f5] bg-[#f3f8ff] text-[#365a86]'
  }
  if (normalized === 'reupload_required') {
    return 'border-[#f7d4d4] bg-[#fff4f4] text-[#b54747]'
  }
  return 'border-[#e3e9f3] bg-[#f7f9fc] text-[#63758f]'
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
        <div className="space-y-6">
          <section className="rounded-[22px] border border-[#dce6f2] bg-white p-5 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Unit', unit?.unit_number || '—'],
                ['Purchaser', stripMarkup(buyer?.name) || 'Unassigned'],
                ['Attorney', stripMarkup(closeout.attorneyFirmName) || 'Unassigned'],
                ['Budgeted', formatCurrency(closeout.budgetedAmount)],
                ['Actual', formatCurrency(closeout.actualBilledAmount)],
                ['Variance', formatCurrency(closeout.varianceAmount)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfdff] px-4 py-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#142132]">{value}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="rounded-[22px] border border-[#dce6f2] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
              <header className="mb-5">
                <h4 className="text-[1rem] font-semibold tracking-[-0.01em] text-[#142132]">Budget vs Actual</h4>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                  Capture the final billed amount and the invoice or statement references for this registered transfer.
                </p>
              </header>

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

            <aside className="rounded-[22px] border border-[#dce6f2] bg-[#fbfdff] p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
              <header>
                <h4 className="text-[1rem] font-semibold tracking-[-0.01em] text-[#142132]">Attorney Close Out</h4>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Operational summary and final legal completion details.</p>
              </header>

              <dl className="mt-4 grid gap-3">
                {[
                  ['Close-out owner', stripMarkup(closeout.attorneyFirmName) || 'Unassigned'],
                  ['Status', toTitleLabel(closeout.closeOutStatus)],
                  ['Reconciliation', toTitleLabel(closeout.reconciliationStatus)],
                  ['Completion date', formatDate(closeout.closedAt)],
                  ['Ready for review', formatDate(closeout.readyForReviewAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[14px] border border-[#e5ebf4] bg-white px-3 py-2.5">
                    <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-[#15253d]">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 rounded-[14px] border border-[#e5ebf4] bg-white px-3 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">Notes / Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#31465f]">
                  {stripMarkup(closeout.notes) || 'No attorney close-out summary captured yet.'}
                </p>
              </div>
            </aside>
          </section>

          <section className="rounded-[22px] border border-[#dce6f2] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
            <header className="mb-4">
              <h4 className="text-[1rem] font-semibold tracking-[-0.01em] text-[#142132]">Close-Out Checklist</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">These items must be complete before the transaction can move from registered to closed.</p>
            </header>

            {checklistItems.length ? (
              <div className="space-y-3">
                {checklistItems.map((item) => (
                  <article
                    key={item.key}
                    className={[
                      'flex flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-3',
                      item.complete ? 'border-[#cde8d8] bg-[#f2faf5]' : 'border-[#e3e9f3] bg-[#f8fafd]',
                    ].join(' ')}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#20344e]">{stripMarkup(item.label) || 'Checklist item'}</p>
                      <p className="mt-1 text-xs text-[#7a8da7]">
                        {item.complete ? `Completed ${formatDate(closeout.closedAt || closeout.readyForReviewAt)}` : 'Not completed yet'}
                      </p>
                    </div>
                    <span
                      className={[
                        'inline-flex min-w-[110px] items-center justify-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em]',
                        item.complete ? 'border-[#c0e2cf] bg-[#e8f8ef] text-[#1b7c45]' : 'border-[#e2e8f2] bg-[#f5f7fb] text-[#61738e]',
                      ].join(' ')}
                    >
                      {item.complete ? 'Complete' : 'Outstanding'}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d7e1ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                No close-out checklist items added yet.
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-[#dce6f2] bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
            <header className="mb-4">
              <h4 className="text-[1rem] font-semibold tracking-[-0.01em] text-[#142132]">Close-Out Documents</h4>
              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                Upload and verify the final invoice, statement, and registration confirmation for this close-out.
              </p>
            </header>

            {(closeout.documents || []).length ? (
              <div className="space-y-3">
                {(closeout.documents || []).map((item) => (
                  <article key={item.key} className="rounded-[16px] border border-[#e3e9f3] bg-[#fbfdff] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h5 className="text-sm font-semibold text-[#172941]">{stripMarkup(item.label) || 'Close-out document'}</h5>
                        <p className="text-xs text-[#70829a]">{item.isRequired ? 'Required for final close-out' : 'Optional supporting document'}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getDocumentStatusTone(item.status)}`}>
                        {formatDocumentStatusLabel(item.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-[12px] border border-[#e3e9f3] bg-white px-3 py-2">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">Document Name</p>
                        <p className="mt-1 truncate text-xs font-medium text-[#29405b]" title={stripMarkup(item.filename) || ''}>
                          {stripMarkup(item.filename) || 'No file uploaded yet'}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#e3e9f3] bg-white px-3 py-2">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">Document Type</p>
                        <p className="mt-1 text-xs font-medium text-[#29405b]">{item.isRequired ? 'Required' : 'Optional'}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#e3e9f3] bg-white px-3 py-2">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7a8da7]">Uploaded</p>
                        <p className="mt-1 text-xs font-medium text-[#29405b]">{item.uploadedAt ? formatDate(item.uploadedAt) : 'Awaiting upload'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
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
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[#e3e9f3] bg-white px-3 py-1 text-xs text-[#7a8da7]">
                          No document uploaded
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#d7e1ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                No close-out documents uploaded yet.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}

export default AttorneyCloseoutPanel
