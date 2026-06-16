import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import CommercialBranding from '../components/CommercialBranding'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatDate } from '../commercialFormatters'
import {
  buildCommercialOnboardingCompletion,
  buildCommercialOnboardingPlan,
  COMMERCIAL_ONBOARDING_FIELD_TYPES,
  normalizeAssetCategory,
  normalizeEntityType,
} from '../services/commercialOnboardingRules'
import {
  getCommercialOnboardingWorkspaceData,
  submitCommercialOnboarding,
  updateCommercialOnboardingProgress,
  uploadCommercialOnboardingDocument,
} from '../services/commercialOnboardingApi'

const PAGE_CLASS = 'mx-auto w-full max-w-6xl px-4 py-5 text-[#102236] sm:px-6 lg:px-8'
const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveInitialResponses(workspace = {}) {
  return {
    ...(workspace.onboarding?.responses || {}),
    entityType: normalizeEntityType(workspace.onboarding?.entityType || workspace.onboarding?.responses?.entityType || ''),
    assetCategory: normalizeAssetCategory(workspace.onboarding?.assetCategory || workspace.onboarding?.responses?.assetCategory || 'office'),
  }
}

function FieldControl({ field, value, onChange }) {
  if (!field) return null
  if (field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.checkbox) {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] px-4 py-3 text-sm font-semibold text-[#102236]">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-[#102b46] focus:ring-[#dbeafe]"
        />
        <span>{field.label}</span>
      </label>
    )
  }
  if (field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.select) {
    return (
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        {field.label}
        <select
          value={normalizeText(value)}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
        >
          <option value="">Select...</option>
          {(typeof field.options === 'function' ? field.options(value) : field.options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.textarea) {
    return (
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        {field.label}
        <textarea
          value={normalizeText(value)}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
        />
      </label>
    )
  }
  return (
    <label className="grid gap-1 text-sm font-semibold text-[#102236]">
      {field.label}
      <input
        type={field.type || COMMERCIAL_ONBOARDING_FIELD_TYPES.text}
        value={normalizeText(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder || ''}
        className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
      />
    </label>
  )
}

function UploadPanel({ workspace, requiredDocuments = [], onUploaded, setError }) {
  const [file, setFile] = useState(null)
  const [documentRequestId, setDocumentRequestId] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!requiredDocuments.length) return
    setCategory(requiredDocuments[0]?.label || requiredDocuments[0]?.key || '')
  }, [requiredDocuments])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) {
      setError('Choose a document to upload.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await uploadCommercialOnboardingDocument({
        token: workspace.access.token,
        file,
        category,
        documentRequestId,
        notes,
      })
      setFile(null)
      setNotes('')
      setDocumentRequestId('')
      await onUploaded?.()
    } catch (uploadError) {
      setError(uploadError?.message || 'Document upload failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-[#102236]">
          Request
          <select value={documentRequestId} onChange={(event) => setDocumentRequestId(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none">
            <option value="">General upload</option>
            {workspace.documentRequests.map((request) => (
              <option key={request.id} value={request.id}>{request.title}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#102236]">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none">
            <option value="">Select...</option>
            {requiredDocuments.map((doc) => (
              <option key={doc.key} value={doc.label}>{doc.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        Document
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600" />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-[#102236]">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none" />
      </label>
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        Upload Document
      </button>
    </form>
  )
}

function CommercialOnboardingPortalPage() {
  const { token } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [responses, setResponses] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await getCommercialOnboardingWorkspaceData(token)
      setWorkspace(data)
      setResponses(resolveInitialResponses(data))
    } catch (loadError) {
      setError(loadError?.message || 'Commercial onboarding could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const plan = useMemo(() => buildCommercialOnboardingPlan({
    clientType: workspace?.onboarding?.clientType || 'tenant',
    assetCategory: responses.assetCategory || workspace?.onboarding?.assetCategory || 'office',
    entityType: responses.entityType || workspace?.onboarding?.entityType || '',
    vatRegistered: Boolean(responses.vatRegistered),
    existingBond: Boolean(responses.existingBond),
    existingTenants: Boolean(responses.existingTenants),
  }), [responses.assetCategory, responses.entityType, responses.existingBond, responses.existingTenants, responses.vatRegistered, workspace?.onboarding?.assetCategory, workspace?.onboarding?.clientType, workspace?.onboarding?.entityType])

  const completion = useMemo(() => buildCommercialOnboardingCompletion({
    plan,
    responses,
    documents: workspace?.documents || [],
    documentRequests: workspace?.documentRequests || [],
  }), [plan, responses, workspace?.documentRequests, workspace?.documents])

  const visibleDocuments = plan.documents || []
  const clientTypeLabel = workspace?.onboarding?.clientType === 'seller' ? 'Seller' : 'Tenant'
  const organisationLabel = workspace?.access?.brokerLabel || workspace?.summary?.brokerName || 'Commercial broker'

  async function handleSaveProgress() {
    if (!workspace?.access?.token) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateCommercialOnboardingProgress(workspace.access.token, {
        responses,
        clientType: workspace.onboarding?.clientType || 'tenant',
        transactionType: workspace.onboarding?.transactionType || 'lease',
        assetCategory: responses.assetCategory || workspace.onboarding?.assetCategory || 'office',
        entityType: responses.entityType || '',
        sourceRecord: workspace.onboarding?.sourceRecord || {},
        status: 'in_progress',
      })
      setWorkspace(updated)
      setResponses(resolveInitialResponses(updated))
    } catch (saveError) {
      setError(saveError?.message || 'Progress could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!workspace?.access?.token) return
    setSubmitting(true)
    setError('')
    try {
      const updated = await submitCommercialOnboarding(workspace.access.token)
      setWorkspace(updated)
      setResponses(resolveInitialResponses(updated))
    } catch (submitError) {
      setError(submitError?.message || 'Onboarding could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  function updateResponse(name, value) {
    setResponses((current) => ({
      ...current,
      [name]: value,
    }))
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f8fb]">
        <div className={PAGE_CLASS}>
          <div className="h-28 animate-pulse rounded-3xl bg-white" />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="h-32 animate-pulse rounded-3xl bg-white" />
            <div className="h-32 animate-pulse rounded-3xl bg-white" />
            <div className="h-32 animate-pulse rounded-3xl bg-white" />
          </div>
        </div>
      </main>
    )
  }

  if (error && !workspace) {
    return <CommercialEmptyState title="Commercial onboarding unavailable" description={error} />
  }

  if (!workspace) {
    return <CommercialEmptyState title="Commercial onboarding unavailable" description="The secure onboarding link could not be resolved." />
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <div className={PAGE_CLASS}>
        <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CommercialBranding compact />
              <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Secure Commercial Onboarding</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#102236]">{workspace.summary?.propertyName || 'Commercial onboarding'}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                {clientTypeLabel} onboarding for {workspace.summary?.propertyName || workspace.summary?.brokerName || 'your commercial record'}.
                Complete the grouped sections, upload the missing documents, and save progress as you go.
              </p>
            </div>
            <div className="grid min-w-[280px] gap-3 rounded-3xl border border-slate-200 bg-[#fbfcfe] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Status</span>
                <CommercialStatusPill value={workspace.onboarding?.status || 'sent'} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Completion</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{completion.completionPercentage}%</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Broker</p>
                <p className="mt-1 text-sm font-semibold text-[#102236]">{organisationLabel}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Last Email</p>
                <p className="mt-1 text-sm font-semibold text-[#102236]">{formatDate(workspace.summary?.lastEmailSentAt) !== '-' ? formatDate(workspace.summary?.lastEmailSentAt) : 'Not sent yet'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <article className={CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Missing Fields</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{completion.missingFields.length}</p>
          </article>
          <article className={CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Missing Documents</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{completion.missingDocuments.length}</p>
          </article>
          <article className={CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Last Opened</p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{formatDate(workspace.summary?.lastOpenedAt) !== '-' ? formatDate(workspace.summary?.lastOpenedAt) : 'Not opened yet'}</p>
          </article>
          <article className={CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Submitted</p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{formatDate(workspace.summary?.lastSubmittedAt) !== '-' ? formatDate(workspace.summary?.lastSubmittedAt) : 'Not submitted yet'}</p>
          </article>
        </section>

        {error ? (
          <section className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
            {error}
          </section>
        ) : null}

        {completion.missingFields.length || completion.missingDocuments.length ? (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Outstanding items</p>
                <p className="mt-1 text-sm leading-6 text-amber-900/80">
                  {completion.missingFields.length ? `Fields missing: ${completion.missingFields.slice(0, 5).join(', ')}.` : ''}
                  {completion.missingDocuments.length ? ` Documents missing: ${completion.missingDocuments.slice(0, 5).map((item) => item.label).join(', ')}.` : ''}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-5 grid gap-5">
          {plan.sections.map((section) => {
            const fields = section.fields || []
            const docs = section.documents || []
            return (
              <section key={section.key} className={CARD_CLASS}>
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">{section.title}</h2>
                  {section.description ? <p className="text-sm leading-6 text-slate-500">{section.description}</p> : null}
                </div>
                {fields.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {fields.map((field) => (
                      <FieldControl
                        key={field.name}
                        field={field}
                        value={responses[field.name]}
                        onChange={(value) => updateResponse(field.name, value)}
                      />
                    ))}
                  </div>
                ) : null}
                {docs.length ? (
                  <div className="mt-4 grid gap-3">
                    {docs.map((doc) => {
                      const uploaded = (workspace.documents || []).some((item) => {
                        const target = normalizeText(item.category || item.title || '').toLowerCase()
                        const needle = normalizeText(doc.label || doc.key).toLowerCase()
                        return Boolean(target && needle && (target.includes(needle) || needle.includes(target)))
                      })
                      return (
                        <article key={doc.key} className={`rounded-2xl border px-4 py-3 ${uploaded ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-[#fbfcfe] text-slate-700'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{doc.label}</p>
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em]">{doc.required ? 'Required' : 'Optional'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {uploaded ? <CheckCircle2 size={16} className="text-emerald-600" /> : <FileText size={16} className="text-slate-400" />}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className={CARD_CLASS}>
            <div className="flex items-start gap-3">
              <ClipboardList size={18} className="mt-1 text-[#123b61]" />
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">Required Documents</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Upload the items that match the selected entity type. The checklist updates as the form evolves.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {workspace.documentRequests.length ? (
                workspace.documentRequests.map((request) => (
                  <article key={request.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#102236]">{request.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{request.category} · {request.status}</p>
                      </div>
                      <CommercialStatusPill value={request.status} />
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No document requests have been generated yet. Save your entity type first.</p>
              )}
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Uploaded documents</h3>
              <div className="mt-3 grid gap-3">
                {workspace.documents.length ? workspace.documents.map((document) => (
                  <article key={document.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-sm font-semibold text-[#102236]">{document.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{document.category} · {document.status}</p>
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No documents uploaded yet.</p>}
              </div>
            </div>
          </section>

          <section className="grid gap-5">
            <section className={CARD_CLASS}>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">Upload Document</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Upload only the missing items and the portal will track completion for you.</p>
              <div className="mt-4">
                <UploadPanel workspace={workspace} requiredDocuments={visibleDocuments} onUploaded={refresh} setError={setError} />
              </div>
            </section>

            <section className={CARD_CLASS}>
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">Review</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Save progress now and submit once the remaining items are complete.</p>
              <div className="mt-4 flex flex-col gap-3">
                <button type="button" onClick={() => void handleSaveProgress()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  Save Progress
                </button>
                <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Submit Onboarding
                </button>
              </div>
            </section>
          </section>
        </section>
      </div>
    </main>
  )
}

export default CommercialOnboardingPortalPage
