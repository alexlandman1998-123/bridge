import { AlertTriangle, Bell, CalendarDays, CheckCircle2, Eye, FileText, LockKeyhole, Send, ShieldCheck, Undo2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../ui/Button'
import Field from '../../ui/Field'
import {
  buildAttorneyClientFinancialDocumentRows,
  fetchAttorneyClientFinancialDocumentWorkspace,
  saveAttorneyClientFinancialDocumentMetadata,
  sendAttorneyClientFinancialDocumentReminder,
  setAttorneyClientFinancialDocumentPublication,
} from '../../../services/documents/attorneyClientFinancialDocumentService.js'

const LABELS = Object.freeze({
  buyer_transfer_cost_invoice: 'Transfer Cost Invoice',
  seller_attorney_invoice: 'Attorney Invoice',
  buyer_final_statement: 'Final Statement',
  seller_final_statement: 'Final Statement',
})

const EMPTY_DETAILS = Object.freeze({
  invoiceReference: '',
  amount: '',
  documentDate: '',
  paymentDueDate: '',
  notes: '',
})

const OPERATIONAL_STATUS_LABELS = Object.freeze({
  published: 'Published',
  ready_to_publish: 'Ready to publish',
  overdue: 'Overdue',
  due_soon: 'Due soon',
  outstanding: 'Outstanding',
  not_available: 'Not available',
  delivered: 'Delivered',
  withdrawn: 'Withdrawn',
  failed: 'Delivery failed',
  pending: 'Pending',
  viewed: 'Viewed by client',
  awaiting_view: 'Awaiting client view',
  needs_attention: 'Needs attention',
  internal: 'Internal',
})

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function detailsFromRow(row = {}) {
  const metadata = row.metadata || {}
  return {
    invoiceReference: metadata.invoiceReference || metadata.invoice_reference || '',
    amount: metadata.amount ?? '',
    documentDate: metadata.documentDate || metadata.document_date || '',
    paymentDueDate: metadata.paymentDueDate || metadata.payment_due_date || '',
    notes: metadata.notes || '',
  }
}

function statusTone(status) {
  if (status === 'uploaded') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'not_available') return 'border-slate-200 bg-slate-50 text-slate-500'
  return 'border-orange-200 bg-orange-50 text-orange-700'
}

function DocumentCard({ row, details, canUpload, busyKey, onDetailsChange, onSaveDetails, onUpload, onPublicationChange, onSendReminder }) {
  const document = row.document || null
  const documentUrl = document?.url || document?.signedUrl || document?.signed_url || ''
  const statusLabel = row.status === 'uploaded' ? 'Uploaded' : row.status === 'not_available' ? 'Available after registration' : 'Outstanding'
  const isBusy = busyKey === row.key

  return (
    <article className="rounded-[16px] border border-[#e1e8f0] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef5fb] text-[#28577d]">
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[#142132]">{LABELS[row.key] || row.key}</h4>
            <p className="mt-1 text-xs leading-5 text-[#667a91]">
              {row.requirementLevel === 'required' ? 'Required' : 'Optional'} · Internal attorney document
            </p>
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${statusTone(row.status)}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[12px] border border-[#e6edf4] bg-[#f9fbfd] px-3 py-2.5">
          <span className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Current file</span>
          <strong className="mt-1 block truncate text-xs text-[#29405b]">{document?.name || 'No file uploaded'}</strong>
        </div>
        <div className="rounded-[12px] border border-[#e6edf4] bg-[#f9fbfd] px-3 py-2.5">
          <span className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Due</span>
          <strong className="mt-1 block text-xs text-[#29405b]">{row.dueDate ? formatDate(row.dueDate) : 'Not configured'}</strong>
        </div>
      </div>

      {row.invoice ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-[#52677f]">
            Invoice reference
            <Field value={details.invoiceReference} onChange={(event) => onDetailsChange('invoiceReference', event.target.value)} disabled={!row.available || !canUpload} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#52677f]">
            Amount
            <Field type="number" min="0" step="0.01" value={details.amount} onChange={(event) => onDetailsChange('amount', event.target.value)} disabled={!row.available || !canUpload} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#52677f]">
            Invoice date
            <Field type="date" value={details.documentDate} onChange={(event) => onDetailsChange('documentDate', event.target.value)} disabled={!row.available || !canUpload} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#52677f]">
            Payment due date
            <Field type="date" value={details.paymentDueDate} onChange={(event) => onDetailsChange('paymentDueDate', event.target.value)} disabled={!row.available || !canUpload} />
          </label>
        </div>
      ) : (
        <label className="mt-4 grid gap-1.5 text-xs font-semibold text-[#52677f]">
          Statement date
          <Field type="date" value={details.documentDate} onChange={(event) => onDetailsChange('documentDate', event.target.value)} disabled={!row.available || !canUpload} />
        </label>
      )}

      <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#52677f]">
        Internal notes
        <Field as="textarea" rows={2} value={details.notes} onChange={(event) => onDetailsChange('notes', event.target.value)} disabled={!row.available || !canUpload} />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onSaveDetails} disabled={!row.available || !canUpload || isBusy}>
          {isBusy ? 'Saving…' : 'Save details'}
        </Button>
        <label className={`inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-xs font-semibold ${row.available && canUpload && !isBusy ? 'cursor-pointer border-[#cfddea] bg-[#f8fbff] text-[#28577d]' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}>
          <Upload size={14} />
          {document ? 'Replace file' : 'Upload file'}
          <input
            type="file"
            hidden
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={!row.available || !canUpload || isBusy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onUpload(file)
              event.target.value = ''
            }}
          />
        </label>
        {documentUrl ? (
          <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#d8e4f0] px-3 text-xs font-semibold text-[#28577d]">
            <Eye size={14} /> View
          </a>
        ) : null}
        {document && row.published ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => onPublicationChange('withdrawn')} disabled={!canUpload || isBusy}>
            <Undo2 size={14} /> Withdraw from {row.recipientRole}
          </Button>
        ) : document ? (
          <Button type="button" size="sm" onClick={() => onPublicationChange('published')} disabled={!row.available || !canUpload || isBusy}>
            <Send size={14} /> Publish to {row.recipientRole}
          </Button>
        ) : null}
        {row.assuranceStatus === 'awaiting_view' ? (
          <Button type="button" size="sm" variant="secondary" onClick={onSendReminder} disabled={!canUpload || isBusy || !row.canSendReminder}>
            <Bell size={14} /> {row.canSendReminder ? 'Send view reminder' : 'Reminder sent recently'}
          </Button>
        ) : null}
      </div>
      {row.published ? (
        <div className={`mt-3 flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
          row.assuranceStatus === 'viewed'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : row.assuranceStatus === 'needs_attention'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          {row.assuranceStatus === 'needs_attention' ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
          {row.assuranceStatus === 'viewed'
            ? `Viewed by the ${row.recipientRole} on ${formatDate(row.viewReceipt?.createdAt)}`
            : row.assuranceStatus === 'needs_attention'
              ? `Publication check required: ${row.assuranceIssues.join(', ').replaceAll('_', ' ')}`
              : `Delivered to the ${row.recipientRole} portal; no view receipt yet.`}
        </div>
      ) : null}
      {row.published && row.reminderCount ? (
        <p className="mt-2 text-xs font-medium text-[#667a91]">
          {row.reminderCount} reminder{row.reminderCount === 1 ? '' : 's'} delivered · Last {formatDate(row.lastReminder?.createdAt)}
        </p>
      ) : null}
      {row.reminderStatus === 'due' || row.reminderStatus === 'escalated' ? (
        <p className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${row.reminderStatus === 'escalated' ? 'text-red-700' : 'text-violet-700'}`}>
          <AlertTriangle size={13} />
          {row.reminderStatus === 'escalated'
            ? `Attorney follow-up required: unviewed for ${row.publicationAgeDays} days.`
            : `Follow-up due: unviewed for ${row.publicationAgeDays} days.`}
        </p>
      ) : null}
    </article>
  )
}

function AttorneyClientFinancialDocumentsPanel({
  transaction,
  documents = [],
  requirements = [],
  organisationId,
  attorneyFirmId,
  canUpload = false,
  onUpload,
}) {
  const [workspace, setWorkspace] = useState({ settings: [], metadata: [], history: [], accessEvents: [], reminderEvents: [] })
  const [details, setDetails] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const hydratedMetadataVersions = useRef({})

  useEffect(() => {
    let active = true
    async function load() {
      if (!transaction?.id) return
      try {
        setLoading(true)
        setError('')
        const result = await fetchAttorneyClientFinancialDocumentWorkspace({
          transactionId: transaction.id,
          organisationId,
          attorneyFirmId,
        })
        if (active) setWorkspace(result)
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Unable to load client financial documents.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [attorneyFirmId, organisationId, transaction?.id])

  const rows = useMemo(
    () => buildAttorneyClientFinancialDocumentRows({ transaction, documents, requirements, ...workspace }),
    [documents, requirements, transaction, workspace],
  )

  useEffect(() => {
    setDetails((previous) => {
      const next = { ...previous }
      for (const row of rows) {
        const metadataVersion = row.metadata?.updatedAt || row.metadata?.updated_at || row.metadata?.id || 'none'
        if (!Object.prototype.hasOwnProperty.call(previous, row.key) || hydratedMetadataVersions.current[row.key] !== metadataVersion) {
          next[row.key] = detailsFromRow(row)
          hydratedMetadataVersions.current[row.key] = metadataVersion
        }
      }
      return next
    })
  }, [rows])

  const groups = [
    { key: 'buyer', label: 'Buyer documents', rows: rows.filter((row) => row.recipientRole === 'buyer') },
    { key: 'seller', label: 'Seller documents', rows: rows.filter((row) => row.recipientRole === 'seller') },
  ]

  function updateDetails(key, field, value) {
    setDetails((previous) => ({
      ...previous,
      [key]: { ...(previous[key] || EMPTY_DETAILS), [field]: value },
    }))
  }

  async function saveDetails(row) {
    try {
      setBusyKey(row.key)
      setError('')
      setMessage('')
      const saved = await saveAttorneyClientFinancialDocumentMetadata({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
        documentDefinitionKey: row.key,
        input: details[row.key] || EMPTY_DETAILS,
      })
      setWorkspace((previous) => ({
        ...previous,
        metadata: [...previous.metadata.filter((item) => item.documentDefinitionKey !== row.key), saved],
      }))
      setMessage(`${LABELS[row.key]} details saved.`)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save document details.')
    } finally {
      setBusyKey('')
    }
  }

  async function upload(row, file) {
    try {
      setBusyKey(row.key)
      setError('')
      setMessage('')
      if (row.published && row.document?.id) {
        const withdrawn = await setAttorneyClientFinancialDocumentPublication({
          transactionId: transaction.id,
          organisationId,
          attorneyFirmId,
          documentDefinitionKey: row.key,
          documentId: row.document.id,
          action: 'withdrawn',
        })
        setWorkspace((previous) => ({
          ...previous,
          metadata: [...previous.metadata.filter((item) => item.documentDefinitionKey !== row.key), withdrawn],
        }))
      }
      await onUpload?.({ row, file })
      const refreshed = await fetchAttorneyClientFinancialDocumentWorkspace({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
      })
      setWorkspace(refreshed)
      setMessage(`${LABELS[row.key]} uploaded internally.`)
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the document.')
    } finally {
      setBusyKey('')
    }
  }

  async function changePublication(row, action) {
    try {
      setBusyKey(row.key)
      setError('')
      setMessage('')
      await setAttorneyClientFinancialDocumentPublication({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
        documentDefinitionKey: row.key,
        documentId: row.document?.id,
        action,
      })
      const refreshed = await fetchAttorneyClientFinancialDocumentWorkspace({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
      })
      setWorkspace(refreshed)
      setMessage(`${LABELS[row.key]} ${action === 'published' ? `published to the ${row.recipientRole} portal` : 'withdrawn from the portal'}.`)
    } catch (publicationError) {
      setError(publicationError?.message || 'Unable to change portal publication.')
    } finally {
      setBusyKey('')
    }
  }

  async function sendReminder(row) {
    try {
      setBusyKey(row.key)
      setError('')
      setMessage('')
      await sendAttorneyClientFinancialDocumentReminder({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
        documentDefinitionKey: row.key,
        documentId: row.document?.id,
      })
      const refreshed = await fetchAttorneyClientFinancialDocumentWorkspace({
        transactionId: transaction.id,
        organisationId,
        attorneyFirmId,
      })
      setWorkspace(refreshed)
      setMessage(`View reminder delivered to the ${row.recipientRole} portal.`)
    } catch (reminderError) {
      setError(reminderError?.message || 'Unable to send the view reminder.')
    } finally {
      setBusyKey('')
    }
  }

  const operationalSummary = rows.reduce((summary, row) => {
    if (row.operationalStatus === 'overdue') summary.overdue += 1
    if (row.operationalStatus === 'ready_to_publish') summary.ready += 1
    if (row.operationalStatus === 'published') summary.published += 1
    if (row.assuranceStatus === 'awaiting_view') summary.awaitingView += 1
    if (row.assuranceStatus === 'needs_attention') summary.needsAttention += 1
    if (['due', 'escalated'].includes(row.reminderStatus)) summary.followUp += 1
    return summary
  }, { overdue: 0, ready: 0, published: 0, awaitingView: 0, needsAttention: 0, followUp: 0 })

  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-[#f8fbff] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#142132]">Client Financial Documents</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8e4f0] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52677f]">
              <LockKeyhole size={12} /> Internal by default
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
            Prepare buyer and seller invoices and statements, then publish each approved file to the intended client portal.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e4f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#52677f]">
          <CalendarDays size={14} /> Final statements after registration
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-[12px] border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-700">{operationalSummary.overdue} overdue</div>
        <div className="rounded-[12px] border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700">{operationalSummary.ready} ready to publish</div>
        <div className="rounded-[12px] border border-emerald-100 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">{operationalSummary.published} published</div>
        <div className="rounded-[12px] border border-amber-100 bg-white px-3 py-2 text-xs font-semibold text-amber-700">{operationalSummary.awaitingView} awaiting view</div>
        <div className="rounded-[12px] border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-700">{operationalSummary.needsAttention} checks required</div>
        <div className="rounded-[12px] border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-violet-700">{operationalSummary.followUp} follow-ups due</div>
      </div>

      {loading ? <p className="mt-4 text-sm text-[#60758d]">Loading financial document workspace…</p> : null}
      {error ? <p className="mt-4 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={16} />{message}</p> : null}

      {!loading ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {groups.map((group) => (
            <section key={group.key} className="rounded-[16px] border border-[#dce6f0] bg-white/70 p-4">
              <h4 className="text-sm font-semibold text-[#20344e]">{group.label}</h4>
              <div className="mt-3 space-y-4">
                {group.rows.map((row) => (
                  <DocumentCard
                    key={row.key}
                    row={row}
                    details={details[row.key] || EMPTY_DETAILS}
                    canUpload={canUpload}
                    busyKey={busyKey}
                    onDetailsChange={(field, value) => updateDetails(row.key, field, value)}
                    onSaveDetails={() => void saveDetails(row)}
                    onUpload={(file) => upload(row, file)}
                    onPublicationChange={(action) => void changePublication(row, action)}
                    onSendReminder={() => void sendReminder(row)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {!loading && workspace.history?.length ? (
        <section className="mt-5 rounded-[16px] border border-[#dce6f0] bg-white p-4">
          <h4 className="text-sm font-semibold text-[#20344e]">Delivery history</h4>
          <div className="mt-3 divide-y divide-[#e8eef5]">
            {workspace.history.slice(0, 8).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <span className="font-semibold text-[#29405b]">
                  {LABELS[event.documentDefinitionKey] || event.documentDefinitionKey} {event.action} for {event.recipientRole}
                </span>
                <span className="text-[#71839a]">
                  {OPERATIONAL_STATUS_LABELS[event.deliveryStatus] || event.deliveryStatus} · {formatDate(event.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && workspace.accessEvents?.length ? (
        <section className="mt-5 rounded-[16px] border border-[#dce6f0] bg-white p-4">
          <h4 className="text-sm font-semibold text-[#20344e]">Client receipt history</h4>
          <div className="mt-3 divide-y divide-[#e8eef5]">
            {workspace.accessEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <span className="font-semibold text-[#29405b]">
                  {LABELS[event.documentDefinitionKey] || event.documentDefinitionKey} {event.eventType} by {event.recipientRole}
                </span>
                <span className="text-[#71839a]">{formatDate(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && workspace.reminderEvents?.length ? (
        <section className="mt-5 rounded-[16px] border border-[#dce6f0] bg-white p-4">
          <h4 className="text-sm font-semibold text-[#20344e]">Reminder history</h4>
          <div className="mt-3 divide-y divide-[#e8eef5]">
            {workspace.reminderEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <span className="font-semibold text-[#29405b]">
                  {LABELS[event.documentDefinitionKey] || event.documentDefinitionKey} reminder #{event.reminderNumber} to {event.recipientRole}
                </span>
                <span className="text-[#71839a]">
                  {event.reminderKind} · {OPERATIONAL_STATUS_LABELS[event.deliveryStatus] || event.deliveryStatus} · {formatDate(event.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

export default AttorneyClientFinancialDocumentsPanel
