import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
  Save,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  PROPERTY_DISCLOSURE_DECISION,
  createBlankDisclosureIssue,
  getDisclosureCategories,
  getPropertyDisclosureStatus,
  getPropertyDisclosureStatusLabel,
  normalizePropertyDisclosure,
} from '../../../lib/propertyDisclosure'
import {
  getCommercialOnboardingWorkspaceData,
  submitCommercialOnboarding,
  updateCommercialOnboardingProgress,
  uploadCommercialOnboardingDocument,
} from '../services/commercialOnboardingApi'

const PAGE_CLASS = 'mx-auto w-full max-w-6xl px-4 py-5 text-[#1f2b24] sm:px-6 lg:px-8'
const CARD_CLASS = 'rounded-[28px] border border-[#e4dccd] bg-white p-5 shadow-[0_18px_45px_rgba(37,48,39,0.07)] sm:p-6'
const PANEL_CLASS = 'rounded-3xl border border-[#eadfcd] bg-[#fbf7ef] p-4'
const INPUT_CLASS = 'min-h-11 rounded-2xl border border-[#ded6c8] bg-white px-3 text-sm font-medium text-[#2d3a31] outline-none transition focus:border-[#6f8f72] focus:ring-4 focus:ring-[#e5efdf]'
const TEXTAREA_CLASS = 'rounded-2xl border border-[#ded6c8] bg-white px-3 py-3 text-sm font-medium text-[#2d3a31] outline-none transition focus:border-[#6f8f72] focus:ring-4 focus:ring-[#e5efdf]'

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

function sectionByKey(plan, key) {
  return (plan.sections || []).find((section) => section.key === key) || null
}

function buildStepGroups(plan, clientType = 'tenant') {
  const detailsKey = clientType === 'seller' ? 'seller-details' : 'tenant-details'
  const propertyKey = clientType === 'seller' ? 'sale-information' : 'requirement'
  return [
    {
      id: 'welcome',
      label: 'Welcome',
      helper: 'Start here',
      sections: [],
    },
    {
      id: 'entity',
      label: 'Entity / Personal Details',
      helper: 'Legal party and profile',
      sections: [sectionByKey(plan, 'entity'), sectionByKey(plan, detailsKey)].filter(Boolean),
    },
    {
      id: 'contacts',
      label: 'Contacts & Signatories',
      helper: 'Decision makers',
      sections: [sectionByKey(plan, 'signatory')].filter(Boolean),
    },
    {
      id: 'property',
      label: clientType === 'seller' ? 'Property Details' : 'Requirement Details',
      helper: clientType === 'seller' ? 'Asset being sold' : 'Space required',
      sections: [sectionByKey(plan, propertyKey), sectionByKey(plan, 'category')].filter(Boolean),
    },
    {
      id: 'deal',
      label: 'Deal Details',
      helper: 'Timing and terms',
      sections: [sectionByKey(plan, 'deal-details')].filter(Boolean),
    },
    ...(clientType === 'seller'
      ? [{
          id: 'disclosure',
          label: 'Property Disclosure',
          helper: 'Known issues and declaration',
          sections: [],
        }]
      : []),
    {
      id: 'documents',
      label: 'Documents',
      helper: 'Checklist and uploads',
      sections: [],
    },
    {
      id: 'review',
      label: 'Review & Submit',
      helper: 'Final check',
      sections: [],
    },
  ]
}

function fieldWrapperClass(field = {}) {
  return field.width === 'full' || field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.textarea
    ? 'md:col-span-2'
    : ''
}

function FieldControl({ field, value, onChange }) {
  if (!field) return null
  if (field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.checkbox) {
    return (
      <label className={`flex min-h-11 items-center gap-3 rounded-2xl border border-[#ded6c8] bg-white px-4 py-3 text-sm font-semibold text-[#1f2b24] ${fieldWrapperClass(field)}`}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-[#cfc5b5] text-[#2f6f4e] focus:ring-[#dce8d3]"
        />
        <span>{field.label}</span>
      </label>
    )
  }
  if (field.type === COMMERCIAL_ONBOARDING_FIELD_TYPES.select) {
    return (
      <label className={`grid gap-1 text-sm font-semibold text-[#1f2b24] ${fieldWrapperClass(field)}`}>
        {field.label}
        <select value={normalizeText(value)} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS}>
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
      <label className={`grid gap-1 text-sm font-semibold text-[#1f2b24] ${fieldWrapperClass(field)}`}>
        {field.label}
        <textarea value={normalizeText(value)} onChange={(event) => onChange(event.target.value)} rows={4} placeholder={field.placeholder || ''} className={TEXTAREA_CLASS} />
      </label>
    )
  }
  return (
    <label className={`grid gap-1 text-sm font-semibold text-[#1f2b24] ${fieldWrapperClass(field)}`}>
      {field.label}
      <input type={field.type || COMMERCIAL_ONBOARDING_FIELD_TYPES.text} value={normalizeText(value)} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder || ''} className={INPUT_CLASS} />
    </label>
  )
}

function StepButton({ step, index, active, done, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[210px] rounded-2xl border px-4 py-3 text-left transition md:min-w-0 ${active ? 'border-[#2f6f4e] bg-[#edf5e8]' : done ? 'border-[#b9d4b7] bg-[#f4faef]' : 'border-[#eadfcd] bg-white hover:bg-[#fbf7ef]'}`}
    >
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-[#2f6f4e] text-white' : done ? 'bg-[#6f8f72] text-white' : 'bg-[#f0eadf] text-[#6f6659]'}`}>
          {done ? <CheckCircle2 size={14} /> : index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1f2b24]">{step.label}</p>
          <p className="truncate text-xs text-[#7a7165]">{step.helper}</p>
        </div>
      </div>
    </button>
  )
}

function SectionCard({ section, responses, onChange }) {
  const fields = section.fields || []
  return (
    <section className={PANEL_CLASS}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1f2b24]">{section.title}</h2>
        {section.description ? <p className="mt-1 text-sm leading-6 text-[#6f6659]">{section.description}</p> : null}
      </div>
      {fields.length ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <FieldControl key={field.name} field={field} value={responses[field.name]} onChange={(value) => onChange(field.name, value)} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function CommercialDisclosurePanel({ disclosure, onDecisionChange, onChange, onAddIssue, onUpdateIssue, onRemoveIssue }) {
  const normalized = normalizePropertyDisclosure(disclosure || {}, { kind: 'commercial' })
  const categories = getDisclosureCategories('commercial')
  const hasKnownIssues = normalized.decision === PROPERTY_DISCLOSURE_DECISION.disclose
  const statusLabel = getPropertyDisclosureStatusLabel(getPropertyDisclosureStatus(normalized))

  return (
    <section className={PANEL_CLASS}>
      <div className="flex items-start gap-3">
        <ClipboardList size={18} className="mt-1 text-[#2f6f4e]" />
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1f2b24]">Property Disclosure</h2>
          <p className="mt-1 text-sm leading-6 text-[#6f6659]">Help buyers and brokers understand any known defects, disputes, risks or material facts relating to the property.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {[
          [PROPERTY_DISCLOSURE_DECISION.none, 'No known defects or issues', 'Declare that no known material matters need to be disclosed.'],
          [PROPERTY_DISCLOSURE_DECISION.disclose, 'Yes, there are matters to disclose', 'Capture structured details for each known issue.'],
        ].map(([value, title, description]) => (
          <button
            key={value}
            type="button"
            onClick={() => onDecisionChange(value)}
            className={`rounded-2xl border px-4 py-4 text-left transition ${normalized.decision === value ? 'border-[#2f6f4e] bg-[#edf5e8]' : 'border-[#eadfcd] bg-white hover:bg-[#fbf7ef]'}`}
          >
            <p className="text-sm font-semibold text-[#1f2b24]">{title}</p>
            <p className="mt-1 text-sm leading-6 text-[#6f6659]">{description}</p>
          </button>
        ))}
      </div>

      <p className="mt-4 rounded-2xl border border-[#eadfcd] bg-white px-4 py-3 text-sm font-semibold text-[#6f6659]">Status: <span className="text-[#1f2b24]">{statusLabel}</span></p>

      {hasKnownIssues ? (
        <div className="mt-5 grid gap-3">
          {categories.map((category) => {
            const issues = normalized.issues.filter((issue) => issue.categoryKey === category.key)
            return (
              <details key={category.key} className="rounded-2xl border border-[#eadfcd] bg-white p-4" open={issues.length > 0 || category.key === 'tenancies'}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1f2b24]">{category.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[#7a7165]">{category.issueTypes.join(', ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        onAddIssue(category.key)
                      }}
                      className="rounded-full border border-[#d8cdbc] bg-[#fbf7ef] px-3 py-2 text-xs font-semibold text-[#1f2b24]"
                    >
                      Add
                    </button>
                  </div>
                </summary>
                <div className="mt-4 grid gap-3">
                  {issues.length ? issues.map((issue) => (
                    <article key={issue.id} className="rounded-2xl border border-[#eadfcd] bg-[#fbf7ef] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#1f2b24]">Disclosure item</p>
                        <button type="button" onClick={() => onRemoveIssue(issue.id)} className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">Remove</button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
                          Issue Type
                          <select value={issue.issueType} onChange={(event) => onUpdateIssue(issue.id, 'issueType', event.target.value)} className={INPUT_CLASS}>
                            <option value="">Select...</option>
                            {category.issueTypes.map((issueType) => <option key={issueType} value={issueType}>{issueType}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
                          Date first identified
                          <input value={issue.dateFirstIdentified} onChange={(event) => onUpdateIssue(issue.id, 'dateFirstIdentified', event.target.value)} className={INPUT_CLASS} placeholder="January 2026" />
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24] md:col-span-2">
                          Description
                          <textarea value={issue.description} onChange={(event) => onUpdateIssue(issue.id, 'description', event.target.value)} rows={4} className={TEXTAREA_CLASS} />
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
                          Current status
                          <input value={issue.currentStatus} onChange={(event) => onUpdateIssue(issue.id, 'currentStatus', event.target.value)} className={INPUT_CLASS} />
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
                          Supporting documents
                          <input value={issue.supportingDocuments} onChange={(event) => onUpdateIssue(issue.id, 'supportingDocuments', event.target.value)} className={INPUT_CLASS} />
                        </label>
                      </div>
                    </article>
                  )) : <p className="rounded-2xl border border-dashed border-[#eadfcd] bg-[#fbf7ef] px-4 py-3 text-sm text-[#6f6659]">No disclosure items added for {category.label}.</p>}
                </div>
              </details>
            )
          })}
          <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
            Other known issues
            <textarea value={normalized.otherDisclosure} onChange={(event) => onChange('otherDisclosure', event.target.value)} rows={4} className={TEXTAREA_CLASS} />
          </label>
        </div>
      ) : null}

      {normalized.decision ? (
        <div className="mt-5 rounded-2xl border border-[#b9d4b7] bg-[#f1f8ed] p-4">
          <p className="text-sm leading-6 text-[#2f6f4e]">I declare that the information provided above is true and complete to the best of my knowledge and that I have disclosed all known material facts relating to the property.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[#ded6c8] bg-white px-4 py-3 text-sm font-semibold text-[#1f2b24] md:col-span-2">
              <input type="checkbox" checked={Boolean(normalized.declarationAccepted)} onChange={(event) => onChange('declarationAccepted', event.target.checked)} className="h-4 w-4 rounded border-[#cfc5b5] text-[#2f6f4e] focus:ring-[#dce8d3]" />
              I accept the seller declaration
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
              Signature
              <input value={normalized.signature} onChange={(event) => onChange('signature', event.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
              Date
              <input type="date" value={normalized.signedAt} onChange={(event) => onChange('signedAt', event.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DocumentChecklist({ workspace, documents = [] }) {
  return (
    <div className="grid gap-3">
      {documents.map((doc) => {
        const uploaded = (workspace.documents || []).some((item) => {
          const target = normalizeText(item.category || item.title || '').toLowerCase()
          const needle = normalizeText(doc.label || doc.key).toLowerCase()
          return Boolean(target && needle && (target.includes(needle) || needle.includes(target)))
        })
        return (
          <article key={doc.key} className={`rounded-2xl border px-4 py-3 ${uploaded ? 'border-[#b9d4b7] bg-[#f1f8ed]' : 'border-[#eadfcd] bg-white'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1f2b24]">{doc.label}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">{doc.required ? 'Required' : 'Optional'}</p>
              </div>
              {uploaded ? <CheckCircle2 size={18} className="text-[#2f6f4e]" /> : <FileText size={18} className="text-[#9b9285]" />}
            </div>
          </article>
        )
      })}
    </div>
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
    <form onSubmit={handleSubmit} className={PANEL_CLASS}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
          Request
          <select value={documentRequestId} onChange={(event) => setDocumentRequestId(event.target.value)} className={INPUT_CLASS}>
            <option value="">General upload</option>
            {workspace.documentRequests.map((request) => (
              <option key={request.id} value={request.id}>{request.title}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-[#1f2b24]">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)} className={INPUT_CLASS}>
            <option value="">Select...</option>
            {requiredDocuments.map((doc) => (
              <option key={doc.key} value={doc.label}>{doc.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-sm font-semibold text-[#1f2b24]">
        Document
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-2xl border border-dashed border-[#cfc5b5] bg-white px-3 py-3 text-sm text-[#6f6659]" />
      </label>
      <label className="mt-3 grid gap-1 text-sm font-semibold text-[#1f2b24]">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={TEXTAREA_CLASS} />
      </label>
      <button type="submit" disabled={saving || !file} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2f6f4e] px-4 text-sm font-semibold text-white transition hover:bg-[#285f43] disabled:opacity-60">
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
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const autosaveTimer = useRef(null)
  const lastSavedSnapshot = useRef('')
  const readyForAutosave = useRef(false)

  async function refresh({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    try {
      readyForAutosave.current = false
      const data = await getCommercialOnboardingWorkspaceData(token)
      const nextResponses = resolveInitialResponses(data)
      setWorkspace(data)
      setResponses(nextResponses)
      lastSavedSnapshot.current = JSON.stringify(nextResponses)
    } catch (loadError) {
      setError(loadError?.message || 'Commercial onboarding could not be loaded.')
    } finally {
      if (!silent) setLoading(false)
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
    vatRegistered: Boolean(responses.vatRegistered || responses.vatApplicable),
    existingBond: Boolean(responses.existingBond),
    existingTenants: Boolean(responses.existingTenants),
  }), [responses.assetCategory, responses.entityType, responses.existingBond, responses.existingTenants, responses.vatApplicable, responses.vatRegistered, workspace?.onboarding?.assetCategory, workspace?.onboarding?.clientType, workspace?.onboarding?.entityType])

  const completion = useMemo(() => buildCommercialOnboardingCompletion({
    plan,
    responses,
    documents: workspace?.documents || [],
    documentRequests: workspace?.documentRequests || [],
  }), [plan, responses, workspace?.documentRequests, workspace?.documents])

  const clientType = workspace?.onboarding?.clientType === 'seller' ? 'seller' : 'tenant'
  const clientTypeLabel = clientType === 'seller' ? 'Seller' : 'Tenant'
  const organisationLabel = workspace?.access?.brokerLabel || workspace?.summary?.brokerName || 'Commercial broker'
  const visibleDocuments = plan.documents || []
  const steps = useMemo(() => buildStepGroups(plan, clientType), [clientType, plan])
  const currentStep = steps[activeStep] || steps[0]
  const progressPercent = Math.round(((activeStep + 1) / Math.max(steps.length, 1)) * 100)

  useEffect(() => {
    setActiveStep((current) => Math.min(current, Math.max(steps.length - 1, 0)))
  }, [steps.length])

  useEffect(() => {
    if (!workspace?.access?.token || loading) return undefined
    const snapshot = JSON.stringify(responses)
    if (!readyForAutosave.current) {
      readyForAutosave.current = true
      lastSavedSnapshot.current = snapshot
      return undefined
    }
    if (snapshot === lastSavedSnapshot.current) return undefined

    setNotice('Autosaving...')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      try {
        await updateCommercialOnboardingProgress(workspace.access.token, {
          responses,
          clientType,
          transactionType: workspace.onboarding?.transactionType || (clientType === 'seller' ? 'sale' : 'lease'),
          assetCategory: responses.assetCategory || workspace.onboarding?.assetCategory || 'office',
          entityType: responses.entityType || '',
          sourceRecord: workspace.onboarding?.sourceRecord || {},
          status: 'in_progress',
        })
        lastSavedSnapshot.current = snapshot
        setNotice('Saved')
      } catch (saveError) {
        setNotice('')
        setError(saveError?.message || 'Autosave could not complete.')
      }
    }, 900)

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [clientType, loading, responses, workspace?.access?.token, workspace?.onboarding?.assetCategory, workspace?.onboarding?.sourceRecord, workspace?.onboarding?.transactionType])

  async function handleSaveProgress() {
    if (!workspace?.access?.token) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const updated = await updateCommercialOnboardingProgress(workspace.access.token, {
        responses,
        clientType,
        transactionType: workspace.onboarding?.transactionType || (clientType === 'seller' ? 'sale' : 'lease'),
        assetCategory: responses.assetCategory || workspace.onboarding?.assetCategory || 'office',
        entityType: responses.entityType || '',
        sourceRecord: workspace.onboarding?.sourceRecord || {},
        status: 'in_progress',
      })
      const nextResponses = resolveInitialResponses(updated)
      setWorkspace(updated)
      setResponses(nextResponses)
      lastSavedSnapshot.current = JSON.stringify(nextResponses)
      setNotice('Progress saved')
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
    setNotice('')
    try {
      await handleSaveProgress()
      const updated = await submitCommercialOnboarding(workspace.access.token)
      const nextResponses = resolveInitialResponses(updated)
      setWorkspace(updated)
      setResponses(nextResponses)
      lastSavedSnapshot.current = JSON.stringify(nextResponses)
      setNotice('Submission received')
    } catch (submitError) {
      setError(submitError?.message || 'Onboarding could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  function updateResponse(name, value) {
    setResponses((current) => ({ ...current, [name]: value }))
  }

  function patchDisclosure(patch = {}) {
    setResponses((current) => {
      const disclosure = normalizePropertyDisclosure(current.propertyDisclosure || {}, { kind: 'commercial' })
      return {
        ...current,
        propertyDisclosure: normalizePropertyDisclosure({ ...disclosure, ...patch }, { kind: 'commercial' }),
      }
    })
  }

  function updateDisclosureDecision(decision) {
    setResponses((current) => {
      const disclosure = normalizePropertyDisclosure(current.propertyDisclosure || {}, { kind: 'commercial' })
      return {
        ...current,
        propertyDisclosure: normalizePropertyDisclosure({
          ...disclosure,
          decision,
          issues: decision === PROPERTY_DISCLOSURE_DECISION.none ? [] : disclosure.issues,
          otherDisclosure: decision === PROPERTY_DISCLOSURE_DECISION.none ? '' : disclosure.otherDisclosure,
          declarationAccepted: false,
          signature: '',
          signedAt: '',
        }, { kind: 'commercial' }),
      }
    })
  }

  function addDisclosureIssue(categoryKey) {
    setResponses((current) => {
      const disclosure = normalizePropertyDisclosure(current.propertyDisclosure || {}, { kind: 'commercial' })
      return {
        ...current,
        propertyDisclosure: normalizePropertyDisclosure({
          ...disclosure,
          decision: PROPERTY_DISCLOSURE_DECISION.disclose,
          issues: [...disclosure.issues, createBlankDisclosureIssue(categoryKey)],
        }, { kind: 'commercial' }),
      }
    })
  }

  function updateDisclosureIssue(issueId, key, value) {
    setResponses((current) => {
      const disclosure = normalizePropertyDisclosure(current.propertyDisclosure || {}, { kind: 'commercial' })
      return {
        ...current,
        propertyDisclosure: normalizePropertyDisclosure({
          ...disclosure,
          issues: disclosure.issues.map((issue) => issue.id === issueId ? { ...issue, [key]: value } : issue),
        }, { kind: 'commercial' }),
      }
    })
  }

  function removeDisclosureIssue(issueId) {
    setResponses((current) => {
      const disclosure = normalizePropertyDisclosure(current.propertyDisclosure || {}, { kind: 'commercial' })
      return {
        ...current,
        propertyDisclosure: normalizePropertyDisclosure({
          ...disclosure,
          issues: disclosure.issues.filter((issue) => issue.id !== issueId),
        }, { kind: 'commercial' }),
      }
    })
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f1e8]">
        <div className={PAGE_CLASS}>
          <div className="h-32 animate-pulse rounded-[32px] bg-white" />
          <div className="mt-5 h-96 animate-pulse rounded-[32px] bg-white" />
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
    <main className="min-h-screen bg-[#f7f1e8]">
      <div className={PAGE_CLASS}>
        <section className={CARD_CLASS}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CommercialBranding compact />
              <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#6f8f72]">Secure Arch9 Commercial Onboarding</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1f2b24]">{clientTypeLabel} onboarding</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6659]">
                {workspace.summary?.propertyName || workspace.summary?.brokerName || 'Commercial record'} is ready for your details. Work through one section at a time, save as you go, and submit after review.
              </p>
            </div>
            <div className="grid min-w-[260px] gap-3 rounded-3xl border border-[#eadfcd] bg-[#fbf7ef] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Status</span>
                <CommercialStatusPill value={workspace.onboarding?.status || 'sent'} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Form Progress</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8dcc8]">
                  <div className="h-full rounded-full bg-[#2f6f4e]" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="mt-2 text-sm font-semibold text-[#1f2b24]">{progressPercent}% through sections</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Completion</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#1f2b24]">{completion.completionPercentage}%</p>
              </div>
              <p className="text-sm font-semibold text-[#6f6659]">{organisationLabel}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 overflow-x-auto pb-1">
          <div className="grid min-w-max gap-3 md:min-w-0 md:grid-cols-4 xl:grid-cols-7">
            {steps.map((step, index) => (
              <StepButton key={step.id} step={step} index={index} active={index === activeStep} done={index < activeStep} onClick={() => setActiveStep(index)} />
            ))}
          </div>
        </section>

        {error ? (
          <section className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">{error}</section>
        ) : null}

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className={CARD_CLASS}>
            {currentStep.id === 'welcome' ? (
              <div className="grid gap-5">
                <section className={PANEL_CLASS}>
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#1f2b24]">Welcome</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6659]">
                    This onboarding pack adapts to your legal structure and commercial role. You can save at any point, return through the same secure link, and upload documents as they become available.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-2xl border border-[#eadfcd] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Missing Fields</p>
                      <p className="mt-2 text-2xl font-semibold text-[#1f2b24]">{completion.missingFields.length}</p>
                    </article>
                    <article className="rounded-2xl border border-[#eadfcd] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Missing Documents</p>
                      <p className="mt-2 text-2xl font-semibold text-[#1f2b24]">{completion.missingDocuments.length}</p>
                    </article>
                    <article className="rounded-2xl border border-[#eadfcd] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Last Opened</p>
                      <p className="mt-2 text-sm font-semibold text-[#1f2b24]">{formatDate(workspace.summary?.lastOpenedAt) !== '-' ? formatDate(workspace.summary?.lastOpenedAt) : 'This session'}</p>
                    </article>
                  </div>
                </section>
              </div>
            ) : null}

            {currentStep.sections?.length ? (
              <div className="grid gap-5">
                {currentStep.sections.map((section) => (
                  <SectionCard key={section.key} section={section} responses={responses} onChange={updateResponse} />
                ))}
              </div>
            ) : null}

            {currentStep.id === 'disclosure' ? (
              <CommercialDisclosurePanel
                disclosure={responses.propertyDisclosure}
                onDecisionChange={updateDisclosureDecision}
                onChange={patchDisclosure}
                onAddIssue={addDisclosureIssue}
                onUpdateIssue={updateDisclosureIssue}
                onRemoveIssue={removeDisclosureIssue}
              />
            ) : null}

            {currentStep.id === 'documents' ? (
              <div className="grid gap-5">
                <section className={PANEL_CLASS}>
                  <div className="flex items-start gap-3">
                    <ClipboardList size={18} className="mt-1 text-[#2f6f4e]" />
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1f2b24]">Document Checklist</h2>
                      <p className="mt-1 text-sm leading-6 text-[#6f6659]">The required documents update when the entity type, VAT status, bond status, and occupancy details change.</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <DocumentChecklist workspace={workspace} documents={visibleDocuments} />
                  </div>
                </section>
                <UploadPanel workspace={workspace} requiredDocuments={visibleDocuments} onUploaded={() => refresh({ silent: true })} setError={setError} />
                <section className={PANEL_CLASS}>
                  <h3 className="text-sm font-semibold text-[#1f2b24]">Uploaded Documents</h3>
                  <div className="mt-3 grid gap-3">
                    {workspace.documents.length ? workspace.documents.map((document) => (
                      <article key={document.id} className="rounded-2xl border border-[#eadfcd] bg-white p-4">
                        <p className="text-sm font-semibold text-[#1f2b24]">{document.title}</p>
                        <p className="mt-1 text-sm text-[#6f6659]">{document.category} - {document.status}</p>
                      </article>
                    )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[#6f6659]">No documents uploaded yet.</p>}
                  </div>
                </section>
              </div>
            ) : null}

            {currentStep.id === 'review' ? (
              <div className="grid gap-5">
                <section className={PANEL_CLASS}>
                  <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1f2b24]">Review Before Submit</h2>
                  <p className="mt-1 text-sm leading-6 text-[#6f6659]">Check the essentials below. If anything is still missing, you can submit and the broker will receive the outstanding list.</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['Role', clientTypeLabel],
                      ['Entity Type', responses.entityType || '-'],
                      ['Asset Category', responses.assetCategory || '-'],
                      ...(clientType === 'seller'
                        ? [['Property Disclosure', getPropertyDisclosureStatusLabel(getPropertyDisclosureStatus(responses.propertyDisclosure || {}))]]
                        : []),
                      ['Completion', `${completion.completionPercentage}%`],
                      ['Missing Fields', String(completion.missingFields.length)],
                      ['Missing Documents', String(completion.missingDocuments.length)],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-2xl border border-[#eadfcd] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">{label}</p>
                        <p className="mt-1 text-sm font-semibold text-[#1f2b24]">{value}</p>
                      </article>
                    ))}
                  </div>
                </section>
                {(completion.missingFields.length || completion.missingDocuments.length) ? (
                  <section className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
                      <div>
                        <p className="text-sm font-semibold">Outstanding items</p>
                        <p className="mt-1 text-sm leading-6 text-amber-900/80">
                          {completion.missingFields.length ? `Fields: ${completion.missingFields.slice(0, 6).join(', ')}. ` : ''}
                          {completion.missingDocuments.length ? `Documents: ${completion.missingDocuments.slice(0, 6).map((item) => item.label).join(', ')}.` : ''}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 border-t border-[#eadfcd] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-6 text-sm font-semibold text-[#6f6659]">{notice}</div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => void handleSaveProgress()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#d8cdbc] bg-white px-4 text-sm font-semibold text-[#1f2b24] transition hover:bg-[#fbf7ef] disabled:opacity-60">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
                <div className="grid grid-cols-2 gap-3 sm:flex">
                  <button type="button" onClick={() => setActiveStep((previous) => Math.max(0, previous - 1))} disabled={activeStep === 0 || saving || submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#d8cdbc] bg-white px-4 text-sm font-semibold text-[#1f2b24] transition hover:bg-[#fbf7ef] disabled:opacity-60">
                    <ChevronLeft size={16} />
                    Back
                  </button>
                  {activeStep < steps.length - 1 ? (
                    <button type="button" onClick={() => setActiveStep((previous) => Math.min(steps.length - 1, previous + 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2f6f4e] px-4 text-sm font-semibold text-white transition hover:bg-[#285f43]">
                      Next
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2f6f4e] px-4 text-sm font-semibold text-white transition hover:bg-[#285f43] disabled:opacity-60">
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Submit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="grid gap-5 self-start">
            <section className={CARD_CLASS}>
              <div className="flex items-start gap-3">
                <Mail size={18} className="mt-1 text-[#2f6f4e]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#1f2b24]">Broker Contact</h2>
                  <p className="mt-1 text-sm leading-6 text-[#6f6659]">{organisationLabel}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-[#eadfcd] bg-[#fbf7ef] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Last Email</p>
                  <p className="mt-1 text-sm font-semibold text-[#1f2b24]">{formatDate(workspace.summary?.lastEmailSentAt) !== '-' ? formatDate(workspace.summary?.lastEmailSentAt) : 'Not sent yet'}</p>
                </div>
                <div className="rounded-2xl border border-[#eadfcd] bg-[#fbf7ef] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a7165]">Submitted</p>
                  <p className="mt-1 text-sm font-semibold text-[#1f2b24]">{formatDate(workspace.summary?.lastSubmittedAt) !== '-' ? formatDate(workspace.summary?.lastSubmittedAt) : 'Not submitted yet'}</p>
                </div>
              </div>
            </section>

            <section className={CARD_CLASS}>
              <h2 className="text-sm font-semibold text-[#1f2b24]">Document Requests</h2>
              <div className="mt-4 grid gap-3">
                {workspace.documentRequests.length ? workspace.documentRequests.slice(0, 5).map((request) => (
                  <article key={request.id} className="rounded-2xl border border-[#eadfcd] bg-[#fbf7ef] p-4">
                    <p className="text-sm font-semibold text-[#1f2b24]">{request.title}</p>
                    <p className="mt-1 text-sm text-[#6f6659]">{request.category}</p>
                    <div className="mt-2"><CommercialStatusPill value={request.status} /></div>
                  </article>
                )) : <p className="rounded-2xl bg-[#fbf7ef] px-4 py-3 text-sm text-[#6f6659]">Save entity details to generate the checklist.</p>}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

export default CommercialOnboardingPortalPage
