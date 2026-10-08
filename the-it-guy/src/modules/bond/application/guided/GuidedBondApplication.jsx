import { getDocumentUploadPolicy } from '../../../../lib/documentUploadPolicy.js'
import BondOnlineSigningPanel from './BondOnlineSigningPanel.jsx'
import { MARITAL_STATUS_OPTIONS, MARITAL_REGIME_OPTIONS } from '../../../../lib/buyerOnboardingFlowContract.js'
import BondApplicationStageProgress from '../workspace/BondApplicationStageProgress.jsx'
import AssetsScreen from './AssetsScreen.jsx'
import BondApplicationDocumentPreview from './BondApplicationDocumentPreview.jsx'
import DocumentsChecklistScreen from './DocumentsChecklistScreen.jsx'
export { default as DocumentsChecklistScreen } from './DocumentsChecklistScreen.jsx'
import LiabilitiesScreen from './LiabilitiesScreen.jsx'
import { evaluateBondApplicationRule } from '../flow/bondApplicationRuleEvaluator.js'
import { validateBondApplicationScreen } from '../flow/bondApplicationScreenValidation.js'
import BondApplicationBuyerNotices from '../../../../components/bond/BondApplicationBuyerNotices'
import { ArrowLeft, CheckCircle2, ChevronRight, FileText, PenLine, RotateCcw, ShieldCheck, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  GUIDED_BOND_APPLICATION_PHASE2_STEPS,
} from './phase2GuidedFlow.js'
import { useGuidedBondApplication } from './hooks/useGuidedBondApplication.js'
import { useBondApplicationDocuments } from './hooks/useBondApplicationDocuments.js'
import { useBondApplicationSubmission } from './hooks/useBondApplicationSubmission.js'
import { BondApplicationSignaturePad } from './BondApplicationSignaturePad.jsx'
import { BUYER_ENTITY_TYPE_OPTIONS, EMPLOYMENT_TYPE_VALUES, getBondApplicationRepeatableGroup } from '../flow/bondApplicationFlowContract.js'
import {
  BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
} from '../documents/index.js'
import {
  BOND_APPLICATION_SUBMISSION_STATUSES,
} from '../submission/index.js'
import {
  getBondApplicationPathValue,
} from '../flow/bondApplicationRuleEvaluator.js'
import {
  calculateAdditionalIncomeTotal,
  calculateMonthlyCommitmentTotal,
} from '../flow/bondApplicationDerivedValues.js'
const documentUploadPolicy = getDocumentUploadPolicy({ surface: 'bank_statement' })


const ZAR = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const APPLICANT_OPTIONS = [
  { value: 'sole', label: 'I am applying alone', description: 'Continue in the guided application.' },
  { value: 'joint', label: 'I am applying with another person', description: 'We will save your progress and continue in the full application.' },
  { value: 'surety', label: 'A surety will be involved', description: 'We will save your progress and continue in the full application.' },
]

const EMPLOYMENT_OPTIONS = [
  { value: 'permanent_employee', label: 'Permanent employee', supported: true },
  { value: 'contract_employee', label: 'Contract employee' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'commission_based', label: 'Commission-based' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
]

function present(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0
}

function formatCurrency(value) {
  if (!present(value)) return ''
  const amount = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? ZAR.format(amount) : String(value)
}

function maskIdentity(value) {
  const raw = String(value || '').trim()
  if (raw.length <= 4) return raw || 'Not provided'
  return `${'*'.repeat(Math.max(raw.length - 4, 0))}${raw.slice(-4)}`
}

function getFieldError(issues, path) {
  return issues.find((issue) => issue.path === path)?.message || ''
}

function setItemPathValue(source, path, value) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) return source
  const next = { ...(source || {}) }
  let current = next
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value
      return
    }
    current[part] = current[part] && typeof current[part] === 'object' && !Array.isArray(current[part]) ? { ...current[part] } : {}
    current = current[part]
  })
  return next
}

function createGuidedItemId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function maskAccount(value) {
  const raw = String(value || '').trim()
  if (raw.length <= 4) return raw || 'Not provided'
  return `${'*'.repeat(Math.max(raw.length - 4, 0))}${raw.slice(-4)}`
}

function TextInput({ id, label, value, onChange, error, type = 'text', inputMode, multiline = false }) {
  const fieldClassName = `mt-2 min-h-[46px] w-full rounded-[12px] border bg-white px-3 py-2.5 text-sm text-[#142132] outline-none transition focus:ring-2 ${
    error
      ? 'border-[#d78b7b] focus:border-[#b5472d] focus:ring-[#b5472d]/15'
      : 'border-[#d8e3ee] focus:border-[#35546c]/45 focus:ring-[#35546c]/12'
  }`
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#203549]">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          rows={4}
          className={fieldClassName}
        />
      ) : (
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldClassName}
        />
      )}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs font-medium text-[#b5472d]">{error}</p> : null}
    </label>
  )
}

function OptionCardGroup({ legend, value, options, onChange, error }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-[#203549]">{legend}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:mt-2">
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-[92px] rounded-[14px] border px-4 py-3 lg:min-h-[76px] lg:py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[#35546c]/20 ${
                selected
                  ? 'border-[#9bb8d2] bg-[#eef5fb] text-[#17314b] shadow-[0_10px_22px_rgba(15,23,42,0.06)]'
                  : 'border-[#dbe5ef] bg-white text-[#324559] hover:border-[#c4d4e4] hover:bg-[#fbfdff]'
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <strong className="text-sm font-semibold">{option.label}</strong>
                {selected ? <CheckCircle2 size={17} aria-hidden="true" /> : null}
              </span>
              {option.description ? <span className="mt-2 block text-xs leading-5 text-[#65778d]">{option.description}</span> : null}
            </button>
          )
        })}
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-[#b5472d]">{error}</p> : null}
    </fieldset>
  )
}

function SelectField({ id, label, value, options = [], onChange, error }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#203549]">{label}</span>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 min-h-[46px] w-full rounded-[12px] border bg-white px-3 py-2.5 text-sm text-[#142132] outline-none transition focus:ring-2 ${
          error
            ? 'border-[#d78b7b] focus:border-[#b5472d] focus:ring-[#b5472d]/15'
            : 'border-[#d8e3ee] focus:border-[#35546c]/45 focus:ring-[#35546c]/12'
        }`}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error ? <p id={`${id}-error`} className="mt-1 text-xs font-medium text-[#b5472d]">{error}</p> : null}
    </label>
  )
}

function FieldRenderer({ question, state, updateField, issues }) {
  const value = getBondApplicationPathValue(state, question.path)
  const error = getFieldError(issues, question.path)
  if (question.type === 'single_select' || question.type === 'yes_no') {
    return (
      <OptionCardGroup
        legend={question.label}
        value={value ?? ''}
        options={question.options || []}
        onChange={(nextValue) => updateField(question.path, nextValue)}
        error={error}
      />
    )
  }
  if (question.type === 'select') {
    return (
      <SelectField
        id={`guided-${question.key}`}
        label={question.label}
        value={value}
        options={question.options || []}
        onChange={(nextValue) => updateField(question.path, nextValue)}
        error={error}
      />
    )
  }
  return (
    <TextInput
      id={`guided-${question.key}`}
      label={question.label}
      value={value ?? ''}
      type={question.type === 'date' ? 'date' : question.type === 'email' ? 'email' : 'text'}
      inputMode={question.type === 'currency' || question.type === 'integer' || question.type === 'decimal' || question.type === 'percentage' ? 'decimal' : question.inputMode}
      multiline={question.type === 'textarea'}
      onChange={(nextValue) => updateField(question.path, nextValue)}
      error={error}
    />
  )
}

function RepeatableGroupField({ question, group, state, updateRepeatableGroup, issues }) {
  const records = Array.isArray(getBondApplicationPathValue(state, question.path))
    ? getBondApplicationPathValue(state, question.path)
    : []
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [removeId, setRemoveId] = useState(null)
  const [draftIssues, setDraftIssues] = useState([])
  const error = getFieldError(issues, question.path)

  function startAdd() {
    const id = createGuidedItemId(group.key)
    setDraft({ id, guidedItemId: id, source: 'guided' })
    setDraftIssues([])
    setEditingId(id)
  }

  function startEdit(record) {
    const id = record.id || record.guidedItemId || record.legacyKey || createGuidedItemId(group.key)
    setDraft({ ...record, id: record.id || id, guidedItemId: record.guidedItemId || id, source: record.source || 'guided' })
    setDraftIssues([])
    setEditingId(id)
  }

  function saveItem() {
    const id = draft.id || draft.guidedItemId || editingId || createGuidedItemId(group.key)
    const normalizedDraft = { ...draft, id, guidedItemId: draft.guidedItemId || id, source: draft.source || 'guided' }
    if (group.key === 'existing_properties' && normalizedDraft.hasBond === 'no') {
      normalizedDraft.outstandingBondBalance = '0'
      normalizedDraft.monthlyBondRepayment = '0'
    }
    const index = records.findIndex((record) => (record.id || record.guidedItemId || record.legacyKey) === editingId)
    const nextRecords = index >= 0
      ? records.map((record, recordIndex) => (recordIndex === index ? normalizedDraft : record))
      : [...records, normalizedDraft]
    const candidateState = setItemPathValue(state, question.path, nextRecords)
    const screenKey = group.key === 'existing_properties' ? 'existing_properties' : group.key
    if (['debts', 'existing_properties', 'liabilities'].includes(group.key)) {
      const savedIndex = index >= 0 ? index : nextRecords.length - 1
      const errors = validateBondApplicationScreen({ applicationState: candidateState, screenKey }).issues.filter((item) => item.path.startsWith(`${question.path}.${savedIndex}.`))
      setDraftIssues(errors)
      if (errors.length) return
    }
    updateRepeatableGroup(question.path, nextRecords)
    setDraft(null)
    setEditingId(null)
  }

  function removeItem(record) {
    const id = record.id || record.guidedItemId || record.legacyKey
    updateRepeatableGroup(question.path, records.filter((item) => (item.id || item.guidedItemId || item.legacyKey) !== id))
    setRemoveId(null)
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[#203549]">{group.label}</h3>
        {error ? <p className="mt-1 text-xs font-medium text-[#b5472d]">{error}</p> : null}
      </div>
      {records.length ? (
        <div className="space-y-2">
          {records.map((record, index) => {
            const id = record.id || record.guidedItemId || record.legacyKey || `${group.key}-${index}`
            const title = getBondApplicationPathValue(record, group.summaryLabelPath) || record.type || `${group.label} ${index + 1}`
            const amount = record.monthlyAmount ?? record.monthlyInstalment ?? record.outstandingBalance ?? record.value ?? record.currentBalance
            const recordIssues = issues.filter((item) => item.path.startsWith(`${question.path}.${index}.`))
            return (
              <article key={id} className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#17283a]">{title}</h4>
                    {record.accountNumber ? <p className="mt-1 text-xs text-[#6b7d93]">Account {maskAccount(record.accountNumber)}</p> : null}
                    {amount !== undefined && amount !== null && amount !== '' ? <p className="mt-1 text-xs font-semibold text-[#4d6279]">{formatCurrency(amount)}</p> : null}
                    {recordIssues.map((item) => <p key={item.path} role="alert" className="mt-1 text-xs text-[#b5472d]">{item.message} Select Edit to update this item.</p>)}
                  </div>
                  <div className="flex items-center gap-2">
                    {removeId === id ? (
                      <>
                        <button type="button" onClick={() => removeItem(record)} className="rounded-[10px] bg-[#b5472d] px-3 py-1.5 text-xs font-semibold text-white">Remove</button>
                        <button type="button" onClick={() => setRemoveId(null)} className="rounded-[10px] border border-[#d1deeb] px-3 py-1.5 text-xs font-semibold text-[#21384d]">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(record)} className="rounded-[10px] border border-[#d1deeb] px-3 py-1.5 text-xs font-semibold text-[#21384d]">Edit</button>
                        <button type="button" onClick={() => setRemoveId(id)} className="rounded-[10px] border border-[#f1d4cf] px-3 py-1.5 text-xs font-semibold text-[#b5472d]">Remove</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[#cfdcea] bg-[#fbfdff] p-4 text-sm text-[#61748a]">No records added yet.</div>
      )}

      {editingId ? (
        <div className="rounded-[14px] border border-[#dbe5ef] bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(group.itemFields || []).map((field) => {
              if (!evaluateBondApplicationRule(field.visibleWhen, draft)) return null
              const fieldValue = getBondApplicationPathValue(draft, field.path)
              const fieldError = draftIssues.find((item) => item.path.endsWith(`.${field.path}`))?.message || ''
              if (field.type === 'select' || field.type === 'yes_no') {
                return (
                  <SelectField
                    key={field.key}
                    id={`guided-${group.key}-${field.key}`}
                    label={field.label}
                    value={fieldValue}
                    options={field.options || []}
                    onChange={(value) => setDraft((current) => setItemPathValue(current, field.path, value))}
                    error={fieldError}
                  />
                )
              }
              return (
                <TextInput
                  key={field.key}
                  id={`guided-${group.key}-${field.key}`}
                  label={field.label}
                  value={fieldValue ?? ''}
                  inputMode={field.type === 'currency' || field.type === 'integer' ? 'decimal' : undefined}
                  onChange={(value) => setDraft((current) => setItemPathValue(current, field.path, value))}
                  error={fieldError}
                />
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={saveItem} className="rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white">Save item</button>
            <button type="button" onClick={() => { setDraft(null); setEditingId(null) }} className="rounded-[12px] border border-[#d1deeb] px-4 py-2 text-sm font-semibold text-[#21384d]">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startAdd} className="inline-flex min-h-[40px] items-center rounded-[12px] border border-[#d1deeb] bg-white px-4 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]">
          {group.addLabel}
        </button>
      )}
    </div>
  )
}

function DetailRow({ label, value, sensitive = false }) {
  return (
    <div className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2.5">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[#17283a]">{sensitive ? maskIdentity(value) : value || 'Not provided'}</dd>
    </div>
  )
}

function SaveStatus({ status, error, onRetry }) {
  const label = status === 'saving'
    ? 'Saving...'
    : status === 'dirty'
      ? 'Unsaved changes'
      : status === 'retrying'
        ? 'Retrying...'
        : status === 'error'
          ? 'Unable to save'
          : 'Saved just now'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#5f7288]" aria-live="polite">
      <span>{label}</span>
      {error ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full border border-[#f1d4cf] bg-[#fff8f6] px-2 py-1 text-[#b5472d]">
          <RotateCcw size={12} aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  )
}

function Stepper({ currentStepKey, steps = GUIDED_BOND_APPLICATION_PHASE2_STEPS, screenKey, percent, documentProgress, submissionStatus }) {
  const submissionScreen = ['prepare_signature', 'awaiting_signature', 'submitted_status'].includes(screenKey)
  const submitted = submissionStatus === BOND_APPLICATION_SUBMISSION_STATUSES.submitted
  const details = steps.filter((step) => !['documents', 'review_sign'].includes(step.key))
  const completed = []
  if (details.length && details.every((step) => step.status === 'complete')) completed.push(0)
  if (documentProgress?.canContinue) completed.push(1)
  if (submissionStatus === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature || submitted) completed.push(2)
  if (submitted) completed.push(3)
  return <BondApplicationStageProgress
    activeIndex={submissionScreen ? 3 : currentStepKey === 'review_sign' ? 2 : currentStepKey === 'documents' ? 1 : 0}
    completed={completed}
    percent={percent}
  />
}

function DetailsTracker({ flow }) {
  if (['documents', 'review_sign'].includes(flow.currentStep.key)) return null
  const screens = flow.screens.filter(item => !item.editOnly && !item.transitionOnly && !['documents', 'review_sign'].includes(item.stepKey))
  const currentKey = flow.currentScreenKey === 'about_you_edit' ? 'about_you_confirmation' : flow.currentScreenKey
  const index = Math.max(0, screens.findIndex(item => item.key === currentKey))
  return (
    <div className="mt-3 border-t border-[#e6edf5] pt-3" aria-label="Details tracker">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[#61748a]" aria-live="polite">
        <span className="font-semibold text-[#203549]">{flow.currentScreen.title}</span>
        <span className="shrink-0">Details · {index + 1} of {screens.length}</span>
      </div>
      <div role="progressbar" aria-label="Position in details" aria-valuemin={1} aria-valuemax={screens.length} aria-valuenow={index + 1} className="h-1 overflow-hidden rounded-full bg-[#e4ebf3]">
        <div className="h-full rounded-full bg-[#35546c] transition-[width] duration-300" style={{ width: `${((index + 1) / screens.length) * 100}%` }} />
      </div>
    </div>
  )
}

function ApplicationConfirmationScreen({ state, updateField, issues }) {
  const property = state.application.property || {}
  const finance = state.application.finance || {}
  const buyerEntity = state.application.buyerEntity || {}
  const entityType = buyerEntity.entityType || 'individual'
  const showEntityFields = ['company', 'trust'].includes(entityType)
  return (
    <div className="space-y-5 lg:space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Your purchase</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Confirm the property and bond amounts before we move to your details.</p>
      </div>
      <div className="rounded-xl bg-[#f5f8fb] px-4 py-3 lg:py-2">
        <p className="text-xs font-medium text-[#61748a]">Property</p>
        <p className="mt-1 text-sm font-semibold text-[#142132]">{property.propertyReference || property.unitReference || property.address || 'Your property'}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextInput id="guided-purchase-price" label="Purchase price" value={finance.purchasePrice} inputMode="decimal" onChange={(value) => updateField('application.finance.purchasePrice', value)} error={getFieldError(issues, 'application.finance.purchasePrice')} />
        <TextInput id="guided-deposit" label="Deposit" value={finance.depositAmount} inputMode="decimal" onChange={(value) => updateField('application.finance.depositAmount', value)} />
        <TextInput id="guided-bond-required" label="Bond required" value={finance.requestedBondAmount} inputMode="decimal" onChange={(value) => updateField('application.finance.requestedBondAmount', value)} error={getFieldError(issues, 'application.finance.requestedBondAmount')} />
      </div>
      <OptionCardGroup
        legend="Purchaser type"
        value={entityType}
        options={BUYER_ENTITY_TYPE_OPTIONS}
        onChange={(value) => updateField('application.buyerEntity.entityType', value)}
        error={getFieldError(issues, 'application.buyerEntity.entityType')}
      />
      {showEntityFields ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            id="guided-buyer-entity-name"
            label={entityType === 'trust' ? 'Trust name' : 'Company name'}
            value={buyerEntity.name || ''}
            onChange={(value) => updateField('application.buyerEntity.name', value)}
            error={getFieldError(issues, 'application.buyerEntity.name')}
          />
          <TextInput
            id="guided-buyer-entity-registration"
            label={entityType === 'trust' ? 'Trust number' : 'Registration number'}
            value={buyerEntity.registrationNumber || ''}
            onChange={(value) => updateField('application.buyerEntity.registrationNumber', value)}
            error={getFieldError(issues, 'application.buyerEntity.registrationNumber')}
          />
        </div>
      ) : null}
    </div>
  )
}

function ApplicantStructureScreen({
  state,
  updateField,
  issues,
  participantModeEnabled = false,
  onInviteCoApplicant,
}) {
  const [inviteDraft, setInviteDraft] = useState({ fullName: '', email: '', phone: '' })
  const [inviteStatus, setInviteStatus] = useState({ loading: false, message: '', error: '' })
  const applicantOptions = participantModeEnabled
    ? APPLICANT_OPTIONS.map((option) => option.value === 'joint'
      ? { ...option, description: 'Invite your co-applicant to complete their own information securely.' }
      : option)
    : APPLICANT_OPTIONS
  const showInvite = participantModeEnabled && state.application.applicantStructure === 'joint'
  const sendInvite = async () => {
    if (!onInviteCoApplicant) return
    setInviteStatus({ loading: true, message: '', error: '' })
    try {
      const result = await onInviteCoApplicant({
        ...inviteDraft,
        idempotencyKey: `co-applicant-invite:${String(inviteDraft.email || inviteDraft.phone || inviteDraft.fullName).trim().toLowerCase()}`,
      })
      setInviteStatus({
        loading: false,
        message: result?.reused ? 'Invitation already exists for this co-applicant.' : 'Invitation sent to your co-applicant.',
        error: '',
      })
    } catch (error) {
      setInviteStatus({
        loading: false,
        message: '',
        error: error?.message || 'We could not send the invitation. Please try again.',
      })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">How are you applying?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Choose the structure that matches this bond application.</p>
      </div>
      <OptionCardGroup
        legend="Applicant structure"
        value={state.application.applicantStructure || ''}
        options={applicantOptions}
        onChange={(value) => updateField('application.applicantStructure', value)}
        error={getFieldError(issues, 'application.applicantStructure')}
      />
      {showInvite ? (
        <div className="space-y-4 rounded-[14px] border border-[#d1deeb] bg-white p-4">
          <div>
            <h3 className="text-base font-semibold text-[#142132]">Invite your co-applicant</h3>
            <p className="mt-1 text-sm leading-6 text-[#5f7288]">They will receive their own access and complete their own answers, documents and declarations.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput id="guided-co-applicant-name" label="Co-applicant full name" value={inviteDraft.fullName} onChange={(value) => setInviteDraft((draft) => ({ ...draft, fullName: value }))} />
            <TextInput id="guided-co-applicant-email" label="Email address" type="email" value={inviteDraft.email} onChange={(value) => setInviteDraft((draft) => ({ ...draft, email: value }))} />
            <TextInput id="guided-co-applicant-phone" label="Mobile number" value={inviteDraft.phone} onChange={(value) => setInviteDraft((draft) => ({ ...draft, phone: value }))} />
          </div>
          {inviteStatus.error ? <p className="text-sm font-medium text-[#b5472d]" role="alert">{inviteStatus.error}</p> : null}
          {inviteStatus.message ? <p className="text-sm font-medium text-[#2b7a53]" role="status">{inviteStatus.message}</p> : null}
          <button
            type="button"
            onClick={() => void sendInvite()}
            disabled={inviteStatus.loading || (!inviteDraft.email && !inviteDraft.phone)}
            className="inline-flex min-h-[42px] items-center rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2b465b] disabled:cursor-not-allowed disabled:bg-[#9fb0bf]"
          >
            {inviteStatus.loading ? 'Sending...' : 'Send invitation'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function AboutYouConfirmationScreen({ state, onEdit }) {
  const applicant = state.participants.primaryApplicant || {}
  const personal = applicant.personal || {}
  const contact = applicant.contact || {}
  const address = applicant.address || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">We have these details from your onboarding.</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Check them before continuing. You can update them here if needed.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Full name" value={[personal.first_name, personal.surname].filter(Boolean).join(' ')} />
        <DetailRow label="Identity or passport" value={personal.identity_number || personal.passport_number} sensitive />
        <DetailRow label="Mobile number" value={contact.phone || personal.phone || address.cellphone_number} />
        <DetailRow label="Email address" value={contact.email || personal.email || address.email_address} />
        <DetailRow label="Residential address" value={[address.residential_address_street, address.residential_address_suburb, address.residential_address_city].filter(Boolean).join(', ')} />
        <DetailRow label="Marital status" value={MARITAL_STATUS_OPTIONS.find(item => item.value === personal.marital_status)?.label || personal.marital_status} />
      </dl>
      <button type="button" onClick={onEdit} className="inline-flex min-h-[42px] items-center rounded-[12px] border border-[#d1deeb] bg-white px-4 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]">
        Update my details
      </button>
    </div>
  )
}

function AboutYouEditScreen({ state, updateField, issues }) {
  const applicant = state.participants.primaryApplicant || {}
  const personal = applicant.personal || {}
  const contact = applicant.contact || {}
  const address = applicant.address || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Update your details</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">These details save into the current application draft.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id="guided-first-name" label="First name" value={personal.first_name} onChange={(value) => updateField('participants.primaryApplicant.personal.first_name', value)} error={getFieldError(issues, 'participants.primaryApplicant.personal.first_name')} />
        <TextInput id="guided-surname" label="Surname" value={personal.surname} onChange={(value) => updateField('participants.primaryApplicant.personal.surname', value)} error={getFieldError(issues, 'participants.primaryApplicant.personal.surname')} />
        <TextInput id="guided-identity" label="Identity or passport number" value={personal.identity_number || personal.passport_number || ''} onChange={(value) => updateField('participants.primaryApplicant.personal.identity_number', value)} />
        <TextInput id="guided-phone" label="Mobile number" value={contact.phone || personal.phone || ''} onChange={(value) => updateField('participants.primaryApplicant.contact.phone', value)} error={getFieldError(issues, 'participants.primaryApplicant.contact.phone')} />
        <TextInput id="guided-email" label="Email address" value={contact.email || personal.email || ''} type="email" onChange={(value) => updateField('participants.primaryApplicant.contact.email', value)} error={getFieldError(issues, 'participants.primaryApplicant.contact.email')} />
        <SelectField id="guided-marital" label="Marital status" value={personal.marital_status || ''} options={MARITAL_STATUS_OPTIONS.filter(item => item.value)} onChange={(value) => updateField('participants.primaryApplicant.personal.marital_status', value)} />
        {personal.marital_status === 'married' ? <SelectField id="guided-marital-regime" label="Marriage regime" value={state.participants.primaryApplicant.marital?.regime || ''} options={MARITAL_REGIME_OPTIONS.filter(item => item.value && item.value !== 'not_applicable')} onChange={(value) => updateField('participants.primaryApplicant.marital.regime', value)} error={getFieldError(issues, 'participants.primaryApplicant.marital.regime')} /> : null}
        <TextInput id="guided-address-street" label="Residential street" value={address.residential_address_street || ''} onChange={(value) => updateField('participants.primaryApplicant.address.residential_address_street', value)} />
        <TextInput id="guided-address-city" label="Residential city" value={address.residential_address_city || ''} onChange={(value) => updateField('participants.primaryApplicant.address.residential_address_city', value)} />
      </div>
    </div>
  )
}

function EmploymentTypeScreen({ state, updateField, issues }) {
  const value = state.participants.primaryApplicant?.employment?.occupation_status || ''
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">How do you currently earn your main income?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Choose the option that best describes your main recurring income.</p>
      </div>
      <OptionCardGroup
        legend="Main income type"
        value={value}
        options={EMPLOYMENT_OPTIONS}
        onChange={(nextValue) => updateField('participants.primaryApplicant.employment.occupation_status', nextValue)}
        error={getFieldError(issues, 'participants.primaryApplicant.employment.occupation_status')}
      />
    </div>
  )
}

function EmploymentDetailsScreen({ state, updateField, issues }) {
  const employment = state.participants.primaryApplicant?.employment || {}
  const expenses = state.participants.primaryApplicant?.expenses || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Tell us about your employment.</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Use the details from your current permanent employment.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id="guided-employer" label="Employer name" value={employment.employer_name || ''} onChange={(value) => updateField('participants.primaryApplicant.employment.employer_name', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.employer_name')} />
        <TextInput id="guided-occupation" label="Job title or occupation" value={employment.nature_of_occupation || ''} onChange={(value) => updateField('participants.primaryApplicant.employment.nature_of_occupation', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.nature_of_occupation')} />
        <TextInput id="guided-gross-income" label="Gross monthly income" value={expenses.gross_salary || ''} inputMode="decimal" onChange={(value) => updateField('participants.primaryApplicant.expenses.gross_salary', value)} error={getFieldError(issues, 'participants.primaryApplicant.expenses.gross_salary')} />
      </div>
    </div>
  )
}

function EmploymentAdditionalDetailsScreen({ state, updateField, issues }) {
  const employment = state.participants.primaryApplicant?.employment || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">How long have you worked there?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Enter how long you have worked for your current employer.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput id="guided-employment-years" label="Years" value={employment.employment_years || ''} inputMode="numeric" onChange={(value) => updateField('participants.primaryApplicant.employment.employment_years', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.employment_years')} />
        <TextInput id="guided-employment-months" label="Months" value={employment.employment_months || ''} inputMode="numeric" onChange={(value) => updateField('participants.primaryApplicant.employment.employment_months', value)} />

      </div>
      <OptionCardGroup legend="Is your current work based in South Africa?" value={employment.works_in_south_africa || ''} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]} onChange={(value) => updateField('participants.primaryApplicant.employment.works_in_south_africa', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.works_in_south_africa')} />
      <p className="text-xs text-[#61748a]">Choose Yes if you carry out your current work in South Africa, including remote work. Choose No if you work abroad.</p>
    </div>
  )
}

function TransitionScreen({ reason }) {
  const copy = reason === 'phase_3_documents'
    ? {
        title: 'Your application details are up to date',
        body: 'We have saved your personal and financial information. The next step is to upload the documents needed for your application and complete the final declarations.',
      }
    : reason === 'phase_4_review_sign'
    ? {
        title: 'Your documents are ready',
        body: 'The next step is to review your application, accept the declarations and sign.',
      }
    : reason === 'phase2_completed'
    ? {
        title: 'You are making good progress',
        body: 'We have saved your application details. Continue to complete the remaining financial information, documents and declarations.',
      }
    : {
        title: 'Your application needs a few additional details',
        body: 'We have saved everything you have completed so far. Continue to the full application to complete the remaining information.',
      }
  return (
    <div className="space-y-4">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8f1] text-[#2b7a53]">
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">{copy.body}</p>
      </div>
    </div>
  )
}

function MonthlyCommitmentsSummaryScreen({ state }) {
  const monthlyTotal = calculateMonthlyCommitmentTotal(state)
  const incomeTotal = calculateAdditionalIncomeTotal(state)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Monthly commitment summary</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">This is a summary of the amounts you entered. It is not an approval or affordability result.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Additional monthly income" value={incomeTotal > 0 ? formatCurrency(incomeTotal) : state.participants.primaryApplicant.employment?.has_additional_income === 'no' ? 'No' : 'Not provided'} />
        <DetailRow label="Estimated monthly commitments" value={monthlyTotal > 0 ? formatCurrency(monthlyTotal) : 'Not provided'} />
      </dl>
    </div>
  )
}

function GenericQuestionScreen({ screen, state, updateField, updateRepeatableGroup, issues }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">{screen.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">{screen.key === 'debts_gate' ? 'Include home loans, vehicle finance, personal loans, credit cards, store accounts and overdrafts. You will add each account if you select Yes.' : screen.key === 'debts' ? 'Add each debt separately, including the lender, amount still owed and monthly repayment. Include accounts even if you plan to settle them.' : screen.key === 'existing_properties_gate' ? 'Include property you own alone or jointly. If you select Yes, you will add each property and any outstanding bond.' : screen.key === 'existing_properties' ? 'Add each property you currently own, its estimated value and whether it has a bond. Loan repayments belong in Existing debts too; do not add the same loan twice.' : 'Answer the questions that apply to this part of your application.'}</p>
      </div>
      <div className="grid gap-4">
        {screen.questions.map((question) => {
          if (question.type === 'repeatable_group') {
            const group = screen.repeatableGroups?.[question.groupKey]
            return (
              <RepeatableGroupField
                key={question.key}
                question={question}
                group={group}
                state={state}
                updateRepeatableGroup={updateRepeatableGroup}
                issues={issues}
              />
            )
          }
          return (
            <FieldRenderer
              key={question.key}
              question={question}
              state={state}
              updateField={updateField}
              issues={issues}
            />
          )
        })}
      </div>
    </div>
  )
}

function BranchChangeNotice({ pending, onConfirm, onCancel }) {
  if (!pending) return null
  return (
    <div className="rounded-[14px] border border-[#f2d6a6] bg-[#fff9ed] p-4 text-sm text-[#6f5120]" role="alertdialog" aria-label="Confirm income branch change">
      <p className="font-semibold text-[#50360c]">Changing this answer will remove details that only apply to your previous income type.</p>
      <p className="mt-1">Unrelated application information will be kept.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onConfirm} className="rounded-[12px] bg-[#6b4b13] px-4 py-2 text-sm font-semibold text-white">Change answer</button>
        <button type="button" onClick={onCancel} className="rounded-[12px] border border-[#e0c488] px-4 py-2 text-sm font-semibold text-[#50360c]">Keep current answer</button>
      </div>
    </div>
  )
}

function ReviewOverviewScreen({ submissionController, onEditSection }) {
  const { reviewSections, readiness, readinessAttempted } = submissionController
  const issuesByCategory = readiness.issues.reduce((accumulator, issue) => {
    const key = issue.category || 'application'
    if (!accumulator[key]) accumulator[key] = []
    accumulator[key].push(issue)
    return accumulator
  }, {})
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Review your application</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Check the information that will be used to prepare the application document for signing.</p>
      </div>
      <p role="status" className="text-sm font-semibold text-slate-700">{readiness.label}</p>
      {readinessAttempted && readiness.issues.length ? (
        <div className="rounded-[14px] border border-[#f2d6a6] bg-[#fff9ed] p-4" role="alert">
          <p className="text-sm font-semibold text-[#50360c]">A few details still need your attention before the application can be signed.</p>
          <div className="mt-3 space-y-2">
            {Object.entries(issuesByCategory).map(([category, issues]) => (
              <div key={category}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a6b2b]">{category.replaceAll('_', ' ')}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#6f5120]">
                  {issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <BondApplicationDocumentPreview presentation={submissionController.reviewDocument} />
      <details className="rounded-2xl border border-[#dbe5ef] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#17283a]">Edit application sections</summary>
      <div className="mt-3 grid gap-3">
        {reviewSections.map((section) => (
          <article key={section.key} className="rounded-[16px] border border-[#dbe5ef] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#17283a]">{section.title}</h3>
                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${section.status === 'needs_attention' ? 'bg-[#fff3ed] text-[#b5472d]' : 'bg-[#eef8f1] text-[#2b7a53]'}`}>
                  {section.status === 'needs_attention' ? 'Needs attention' : 'Complete'}
                </span>
              </div>
              <button type="button" onClick={() => onEditSection(section)} className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d]">
                <PenLine size={14} aria-hidden="true" />
                Edit
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm leading-6 text-[#61748a]">
              {(section.summary || []).map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          </article>
        ))}
      </div>
      </details>
    </div>
  )
}

function DeclarationsScreen({ submissionController }) {
  const { declarations, declarationValues, updateDeclaration } = submissionController
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Declarations and consents</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Read each declaration and choose the statements you accept. Required declarations must be accepted before signing.</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Bond application declarations</legend>
        {declarations.map((declaration) => (
          <label key={declaration.key} className={`block rounded-[16px] border p-4 ${declaration.required ? 'border-[#dbe5ef] bg-white' : 'border-[#e7edf4] bg-[#fbfdff]'}`}>
            <span className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={Boolean(declarationValues[declaration.key])}
                onChange={(event) => updateDeclaration(declaration.key, event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#9bb0c4] text-[#35546c] focus:ring-[#35546c]/20"
              />
              <span>
                <span className="block text-sm font-semibold text-[#17283a]">{declaration.title}</span>
                <span className="mt-1 block text-sm leading-6 text-[#61748a]">{declaration.text}</span>
                <span className="mt-2 inline-flex rounded-full bg-[#f2f6fa] px-2 py-1 text-xs font-semibold text-[#5f7288]">
                  {declaration.required ? 'Required' : 'Optional'}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

function PrepareSignatureScreen({ onlineSigning,  submissionController, applicationState, updateField }) {
  const { readiness, preparing, error, submission, prepareForSignature } = submissionController
  const status = String(submission?.status || '').toLowerCase()
  const awaiting = status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature
  const signature = applicationState?.application?.signatureEvidence || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Prepare for signing</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Review your details and confirm the declarations. Choose to sign online or download a copy to sign by hand and upload here.</p>
      </div>
      {!readiness.ready && readiness.issues.length ? (
        <div className="rounded-[14px] border border-[#f2d6a6] bg-[#fff9ed] p-4" role="alert">
          <p className="text-sm font-semibold text-[#50360c]">A few details still need your attention before the application can be signed.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#6f5120]">
            {readiness.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
          </ul>
        </div>
      ) : null}
      {error ? <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] p-4 text-sm text-[#b5472d]" role="alert">{error}</div> : null}
      {awaiting ? (
        <div className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] p-4 text-sm text-[#40566d]">
          Your application is prepared and awaiting your signature.
        </div>
      ) : null}
      {!awaiting && !onlineSigning ? (
        <div className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfdff] p-4">
          <BondApplicationSignaturePad
            value={signature.dataUrl || ''}
            signerName={submissionController.signerIdentity?.fullName || ''}
            onChange={(dataUrl) => updateField('application.signatureEvidence', {
              dataUrl,
              signerName: submissionController.signerIdentity?.fullName || '',
              signedAt: dataUrl ? new Date().toISOString() : '',
              method: 'html_canvas',
              confirmed: signature.confirmed || false,
            })}
          />
          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-[#40566d]">
            <input type="checkbox" checked={Boolean(signature.confirmed)} onChange={(event) => updateField('application.signatureEvidence', { ...signature, confirmed: event.target.checked })} className="mt-1 h-4 w-4 rounded border-[#9bb0c4] text-[#35546c]" />
            <span>I confirm that the information in this bond application is complete and accurate to the best of my knowledge.</span>
          </label>
        </div>
      ) : null}
      {onlineSigning ? <BondOnlineSigningPanel availability={onlineSigning.availability} client={onlineSigning.client} onPrepare={submissionController.prepareOnline} /> : null}
      {submissionController.wetInkAvailable && !awaiting ? <div className="rounded-2xl border border-[#dbe5ef] p-4">
        <h3 className="font-semibold text-[#142132]">Prefer to sign by hand?</h3>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Download this fixed application version, sign and date it, then upload the complete PDF here. Your consultant will check it before accepting it.</p>
        <button type="button" disabled={preparing} onClick={() => void submissionController.prepareWetInk()} className="mt-3 min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50">Download, sign and upload</button>
      </div> : null}
      <div className="flex flex-wrap gap-2">
        {!awaiting && !onlineSigning ? (
          <button type="button" disabled={preparing} onClick={() => void prepareForSignature()} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#9aa9b8]">
            <FileText size={16} aria-hidden="true" />
            {preparing ? 'Saving signature...' : 'Sign application'}
          </button>
        ) : (
          awaiting ? <p className="text-sm font-medium text-[#40566d]">Your application is ready for signature.</p> : null
        )}
      </div>
    </div>
  )
}

function AwaitingSignatureScreen({ submissionController }) {
  const { submission, refreshing, refreshStatus, makeChanges, error } = submissionController
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Awaiting your signature</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Your application has been prepared from the information you reviewed.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Submission version" value={submission?.submission_version || submission?.submissionVersion || 'Not prepared'} />
        <DetailRow label="Prepared" value={submission?.prepared_at || 'Not provided'} />
        <DetailRow label="Status" value={submission?.status || 'Awaiting signature'} />
      </dl>
      {error ? <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] p-4 text-sm text-[#b5472d]" role="alert">{error}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void refreshStatus()} className="rounded-[12px] border border-[#d1deeb] px-4 py-2 text-sm font-semibold text-[#21384d]">{refreshing ? 'Refreshing...' : 'Refresh status'}</button>
        <button type="button" onClick={() => void makeChanges()} className="rounded-[12px] border border-[#f2d6a6] px-4 py-2 text-sm font-semibold text-[#6f5120]">Make changes</button>
      </div>
    </div>
  )
}

function SubmittedApplicationScreen({ submissionController }) {
  const { submission } = submissionController
  return (
    <div className="space-y-5">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8f1] text-[#2b7a53]">
        <CheckCircle2 size={22} aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Your bond application has been submitted</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Your bond consultant can now review the application and supporting documents. We will show updates or additional requests here.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Submission version" value={submission?.submission_version || submission?.submissionVersion || 'Not provided'} />
        <DetailRow label="Submitted" value={submission?.submitted_at || submission?.submittedAt || 'Not provided'} />
        <DetailRow label="Signed" value={submission?.signed_at || submission?.signedAt || 'Not provided'} />
      </dl>
    </div>
  )
}

const INCOME_BANKS = ['Absa', 'African Bank', 'Capitec', 'Discovery Bank', 'FNB', 'Investec', 'Nedbank', 'Standard Bank', 'TymeBank']

export function IncomeBankScreen({ state, updateRepeatableGroup, issues = [] }) {
  const path = 'participants.primaryApplicant.bankAccounts'
  const accounts = state.participants.primaryApplicant.bankAccounts || []
  const account = accounts.find(item => item.legacyKey === 'primary') || accounts[0]
  const knownBank = INCOME_BANKS.find(name => name.toLowerCase() === String(account?.bankName || '').replace(/_/g, ' ').toLowerCase())
  const [otherBank, setOtherBank] = useState(Boolean(account?.bankName && !knownBank))
  const [statementFiles, setStatementFiles] = useState([])
  const selfEmployed = EMPLOYMENT_TYPE_VALUES.selfEmployed.includes(state.participants.primaryApplicant.employment?.occupation_status)
  function setBank(bankName) {
    const next = { ...(account || {}), legacyKey: 'primary', bankName }
    updateRepeatableGroup(path, account ? accounts.map(item => item === account ? next : item) : [next])
  }
  const error = issues.find(item => item.path === path || item.path === `${path}.${Math.max(0, accounts.indexOf(account))}.bankName`)?.message
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold text-[#142132]">Where do you receive your income?</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Select the bank where you receive your salary or main income.</p></div>
    <div className="rounded-xl bg-[#f5f8fb] p-4 text-sm leading-6 text-[#4d6279]">Your bond consultant uses your bank statements to verify income and expenses for the banks assessing your application.</div>
    <div className="max-w-xl space-y-3">
      <SelectField id="guided-income-bank" label="Your income bank" value={otherBank ? '__other' : knownBank || ''} options={[...INCOME_BANKS.map(name => ({value:name,label:name})), {value:'__other',label:'Another bank'}]} onChange={value => { setOtherBank(value === '__other'); setBank(value === '__other' ? '' : value) }} error={otherBank ? '' : error} />
      {otherBank ? <TextInput id="guided-income-bank-other" label="Bank name" value={account?.bankName || ''} onChange={setBank} error={error} /> : null}
    </div>
    <section className="space-y-3 rounded-xl border border-[#dbe5ef] p-4" aria-labelledby="supporting-bank-statements">
      <h3 id="supporting-bank-statements" className="text-sm font-semibold">Supporting bank statements</h3>
      <p className="text-sm leading-6 text-[#61748a]">{selfEmployed
        ? 'Provide your latest 6 consecutive months of personal bank statements. If you use a business bank account, also provide the latest 6 consecutive months of business statements.'
        : 'Provide your latest 3 consecutive months of bank statements for the account where you receive your salary or main income.'}</p>
      <p className="text-sm leading-6 text-[#61748a]">Include every page for the full period. You can provide one combined statement or separate monthly statements.</p>
      <div className="space-y-3 rounded-xl border border-dashed border-[#cfdcea] bg-[#fbfdff] p-4">
        <label htmlFor="guided-bank-statement-files" className="block text-sm font-semibold text-[#21384d]">Choose bank statements</label>
        <input
          id="guided-bank-statement-files"
          type="file" title={documentUploadPolicy.helpText}
          multiple
          accept={documentUploadPolicy.accept}
          aria-describedby="guided-bank-statement-selection-note"
          className="block min-h-11 w-full text-sm text-[#61748a] file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[#35546c] file:px-4 file:text-sm file:font-semibold file:text-white"
          onChange={(event) => {
            const selected = Array.from(event.target.files || [])
            setStatementFiles((current) => [...current, ...selected.filter((file) => !current.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))])
            event.target.value = ''
          }}
        />
        <span className="block text-xs font-normal text-slate-500">{documentUploadPolicy.helpText}</span>
        <p id="guided-bank-statement-selection-note" className="text-xs leading-5 text-[#61748a]">PDF, JPG or PNG. Selected files stay in this browser session on this screen; they have not been sent or saved to your application.</p>
        {statementFiles.length ? <ul className="space-y-2" aria-label="Selected bank statements">
          {statementFiles.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#dbe5ef] bg-white p-3">
            <div className="min-w-0"><p className="break-all text-sm font-medium text-[#21384d]">{file.name}</p><p className="text-xs text-[#61748a]">Selected · not sent</p></div>
            <button type="button" onClick={() => setStatementFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`} className="min-h-11 px-3 text-xs font-semibold text-[#b5472d]">Remove</button>
          </li>)}
        </ul> : null}
        <button type="button" disabled aria-describedby="guided-bank-statement-delivery-note" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#9aa9b8] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed"><UploadCloud size={16} aria-hidden="true" />Send statements to bond consultant</button>
        <p id="guided-bank-statement-delivery-note" className="text-sm leading-6 text-[#61748a]" role="status">Sending will be available here once your bond consultant’s secure upload connection is set up. No files have been sent.</p>
      </div>
      <p className="text-xs leading-5 text-[#61748a]">Bank statements contain sensitive financial information. This selector does not upload files to Arch9. Your consultant’s secure connection is needed to send them directly and keep only their status here.</p>
    </section>
    <p className="text-xs leading-5 text-[#61748a]">Existing loans and credit accounts are collected in the next debt questions.</p>
  </div>
}

const OTHER_MONTHLY_COST_TYPES = [
  { value: 'insurance', label: 'Insurance', description: 'Life, vehicle or household insurance. Exclude medical aid entered earlier.' },
  { value: 'phone_internet', label: 'Phone and internet', description: 'Your monthly mobile phone and home internet costs.' },
  { value: 'utilities', label: 'Water and electricity', description: 'Your usual monthly water, electricity and other utility charges.' },
  { value: 'subscriptions', label: 'Subscriptions and memberships', description: 'For example, streaming services, gym memberships or professional memberships.' },
  { value: 'domestic_help', label: 'Domestic help', description: 'Regular payments for a domestic worker, gardener or similar household help.' },
  { value: 'other', label: 'Another regular monthly cost', description: 'Describe a regular cost that does not fit the options above.' },
]

export function MonthlyCommitmentsScreen({ state, updateRepeatableGroup, issues = [] }) {
  const path = 'participants.primaryApplicant.monthlyCommitments'
  const records = state.participants.primaryApplicant.monthlyCommitments || []
  const items = records.filter(item => !item.legacyKey)
  function patch(item, values) {
    updateRepeatableGroup(path, records.map(record => record === item ? { ...record, ...values } : record))
  }
  function add() {
    const id = createGuidedItemId('monthly_commitments')
    updateRepeatableGroup(path, [...records, { id, guidedItemId: id, source: 'guided', description: '', monthlyAmount: '' }])
  }
  return <div className="space-y-4">
    <div><h2 className="text-xl font-semibold text-[#142132]">Other recurring commitments</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Check insurance, phone and internet, utilities, subscriptions and household help. Include only costs you pay regularly.</p></div>
    <p className="rounded-xl bg-[#f5f8fb] p-3 text-xs leading-5 text-[#61748a]">Rent, groceries, transport, medical aid, education and maintenance were captured earlier. Loan repayments are collected in the debts section. Do not include them again here.</p>
    <OptionCardGroup legend="Do you have any additional monthly costs?" value={items.length ? 'yes' : 'no'} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]} onChange={value => { if (value === 'yes' && !items.length) add(); if (value === 'no') updateRepeatableGroup(path, records.filter(item => item.legacyKey)) }} />
    {items.map((item, index) => {
      const matchingType = OTHER_MONTHLY_COST_TYPES.find(type => type.label === item.description)
      const selectedType = item.category || matchingType?.value || (item.description ? 'other' : '')
      const type = OTHER_MONTHLY_COST_TYPES.find(option => option.value === selectedType)
      const errorPath = `${path}.${records.indexOf(item)}`
      return <article key={item.id || item.guidedItemId || index} className="rounded-xl border border-[#dbe5ef] p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Monthly cost {index + 1}</h3><button type="button" className="text-xs font-semibold text-[#b5472d]" onClick={() => updateRepeatableGroup(path, records.filter(record => record !== item))}>Remove cost {index + 1}</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id={`commitment-${index}-type`} label="Type of monthly cost" value={selectedType} options={OTHER_MONTHLY_COST_TYPES} onChange={value => patch(item, { category: value, description: value === 'other' ? '' : OTHER_MONTHLY_COST_TYPES.find(option => option.value === value)?.label || '' })} error={selectedType === 'other' ? '' : issues.find(issue => issue.path === `${errorPath}.description`)?.message} />
          <TextInput id={`commitment-${index}-amount`} label="Monthly amount (R)" value={item.monthlyAmount ?? ''} inputMode="decimal" onChange={value => patch(item, {monthlyAmount:value})} error={issues.find(issue => issue.path === `${errorPath}.monthlyAmount`)?.message} />
        </div>
        {type ? <p className="mt-2 text-xs leading-5 text-[#61748a]">{type.description} Use a monthly average if the amount varies.</p> : null}
        {selectedType === 'other' ? <div className="mt-3"><TextInput id={`commitment-${index}-description`} label="Describe the monthly cost" value={item.description || ''} onChange={value => patch(item, {description:value})} error={issues.find(issue => issue.path === `${errorPath}.description`)?.message} /></div> : null}
      </article>
    })}
    {items.length ? <><button type="button" className="min-h-11 rounded-xl border border-[#d1deeb] px-4 text-sm font-semibold" onClick={add}>Add another monthly cost</button><div className="flex items-center justify-between rounded-xl bg-[#f5f8fb] p-4 text-sm"><span>Other monthly costs</span><strong>{formatCurrency(items.reduce((sum, item) => sum + (Number(String(item.monthlyAmount || '').replace(/[ ,]/g, '')) || 0), 0))}</strong></div></> : <p className="text-sm text-[#61748a]">No additional monthly costs. Select Continue to review your monthly commitments.</p>}
  </div>
}

function CurrentScreen({
  onlineSigning,
  controller,
  documentsController,
  submissionController,
  participantModeEnabled = false,
  onInviteCoApplicant,
  onOpenDocument,
  onOpenDocuments,
}) {
  const { currentScreenKey, applicationState, updateField, updateRepeatableGroup, validationIssues, handoffReason, flow } = controller
  if (currentScreenKey === 'application_confirmation') return <ApplicationConfirmationScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'applicant_structure') return <ApplicantStructureScreen state={applicationState} updateField={updateField} issues={validationIssues} participantModeEnabled={participantModeEnabled} onInviteCoApplicant={onInviteCoApplicant} />
  if (currentScreenKey === 'about_you_confirmation') return <AboutYouConfirmationScreen state={applicationState} onEdit={controller.openAboutYouEdit} />
  if (currentScreenKey === 'about_you_edit') return <AboutYouEditScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'employment_type') return <EmploymentTypeScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'monthly_commitments_summary') return <MonthlyCommitmentsSummaryScreen state={applicationState} />
  if (currentScreenKey === 'document_checklist') return <DocumentsChecklistScreen documentsController={documentsController} onOpenDocument={onOpenDocument} onOpenDocuments={onOpenDocuments} />
  if (currentScreenKey === 'review_overview') return <ReviewOverviewScreen submissionController={submissionController} onEditSection={(section) => void controller.openScreen(section.screenKey)} />
  if (currentScreenKey === 'declarations') return <DeclarationsScreen submissionController={submissionController} />
  if (currentScreenKey === 'prepare_signature') return <PrepareSignatureScreen onlineSigning={onlineSigning} submissionController={submissionController} applicationState={applicationState} updateField={updateField} />
  if (currentScreenKey === 'awaiting_signature') return <AwaitingSignatureScreen submissionController={submissionController} />
  if (currentScreenKey === 'submitted_status') return <SubmittedApplicationScreen submissionController={submissionController} />
  if (flow.currentScreen?.transitionOnly) return <TransitionScreen reason={handoffReason || (currentScreenKey === 'phase4_review_sign_handoff' ? 'phase_4_review_sign' : currentScreenKey === 'phase3_documents_handoff' ? 'phase_3_documents' : '')} />
  if (currentScreenKey === 'bank_accounts') return <IncomeBankScreen state={applicationState} updateRepeatableGroup={updateRepeatableGroup} issues={validationIssues} />
  if (currentScreenKey === 'assets') return <AssetsScreen state={applicationState} updateRepeatableGroup={updateRepeatableGroup} issues={validationIssues} />
  if (currentScreenKey === 'liabilities') return <LiabilitiesScreen state={applicationState} updateRepeatableGroup={updateRepeatableGroup} issues={validationIssues} />
  if (currentScreenKey === 'monthly_other_commitments') return <MonthlyCommitmentsScreen state={applicationState} updateRepeatableGroup={updateRepeatableGroup} issues={validationIssues} />
  if (currentScreenKey === 'employment_details') return <EmploymentDetailsScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'employment_additional_details') return <EmploymentAdditionalDetailsScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (flow.currentScreen) {
    const repeatableGroups = Object.fromEntries(
      (flow.currentScreen.questions || [])
        .filter((question) => question.type === 'repeatable_group')
        .map((question) => [question.groupKey, getBondApplicationRepeatableGroup(question.groupKey)])
        .filter(([, group]) => Boolean(group)),
    )
    return (
      <GenericQuestionScreen
        screen={{ ...flow.currentScreen, repeatableGroups }}
        state={applicationState}
        updateField={updateField}
        updateRepeatableGroup={updateRepeatableGroup}
        issues={validationIssues}
      />
    )
  }
  return <TransitionScreen reason={handoffReason} />
}

export default function GuidedBondApplication({
  showHandoffNotices = true,
  portal,
  token,
  saveClientPortalOnboardingDraft,
  requiredDocuments = [],
  documents = [],
  additionalRequirements = [],
  preview = false,
  onReconcileDocumentRequirements,
  onUploadRequiredDocument,
  onRefreshDocuments,
  onOpenDocument,
  onOpenDocuments,
  onPrepareSubmission,
  onPrepareWetInk,
  onPrepareOnlineSigning,
  onlineSigning,
  onRefreshSubmission,
  onCancelPendingSubmission,
  participantModeEnabled = false,
  onInviteCoApplicant,
  onBackToPortal,
  onSaveAndExit,
  onLegacyHandoff,
}) {
  const headingRef = useRef(null)
  const controller = useGuidedBondApplication({
    portal,
    token,
    saveClientPortalOnboardingDraft,
    onLegacyHandoff,
    onSaveAndExit,
  })
  const documentsController = useBondApplicationDocuments({
    applicationState: controller.applicationState,
    requiredDocuments,
    documents,
    additionalRequirements,
    onReconcileDocumentRequirements,
    saveLatestApplication: controller.saveCurrent,
    onUploadRequiredDocument,
    onRefreshDocuments,
    active: controller.currentScreenKey === 'document_checklist',
  })
  const submissionController = useBondApplicationSubmission({
    applicationState: controller.applicationState,
    documentChecklist: documentsController.checklist,
    documentProgress: documentsController.progress,
    saveStatus: controller.saveStatus,
    saveLatestApplication: controller.saveCurrent,
    onPrepareSubmission,
    onPrepareWetInk,
    onPrepareOnlineSigning,
    onRefreshSubmission,
    onCancelPendingSubmission,
    onFinalized: () => void controller.openScreen('submitted_status'),
  })
  const screen = controller.flow.currentScreen
  const submissionStatus = String(submissionController.submission?.status || '').toLowerCase()
  const reviewSignScreen = controller.flow.currentStep?.key === 'review_sign'
  const documentScreen = controller.flow.currentStep?.key === 'documents'
  const progressPercent = submissionStatus === BOND_APPLICATION_SUBMISSION_STATUSES.submitted || controller.currentScreenKey === 'submitted_status'
    ? 100
    : reviewSignScreen
      ? Math.max(88, controller.flow.progress.percent)
      : documentScreen
        ? Math.max(76, Math.min(87, 76 + Math.round((documentsController.progress.percent || 0) * 0.11)))
        : controller.flow.progress.percent
  const progress = {
    currentStep: controller.flow.currentStep,
    currentStepIndex: controller.flow.currentStepIndex,
    stepCount: controller.flow.steps.length,
    percent: progressPercent,
  }
  const isTransition = Boolean(controller.flow.currentScreen?.transitionOnly)
  const disablePrimary = controller.saveStatus === 'saving' || controller.saveStatus === 'retrying'

  useEffect(() => {
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [controller.currentScreenKey])

  async function handleBack() {
    const result = await controller.goBack()
    if (!result.ok && result.reason === 'first_screen') {
      onBackToPortal?.()
    }
  }

  async function handleContinue() {
    if (controller.currentScreenKey === 'document_checklist') {
      const result = await documentsController.continueToReview()
      if (!result.ok) return
      await controller.continueForward({
        documentRuleSetVersion: BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION,
        documentRequirementFingerprint: result.fingerprint,
      })
      return
    }
    if (controller.currentScreenKey === 'prepare_signature') {
      const result = await submissionController.prepareForSignature()
      if (result.ok) await controller.openScreen(String(result.submission?.status || '').toLowerCase() === BOND_APPLICATION_SUBMISSION_STATUSES.submitted ? 'submitted_status' : 'awaiting_signature')
      return
    }
    if (controller.currentScreenKey === 'awaiting_signature') {
      submissionController.startSigning()
      return
    }
    if (controller.currentScreenKey === 'submitted_status') {
      return
    }
    if (isTransition) {
      await controller.handoffToLegacy()
      return
    }
    await controller.continueForward()
  }

  return (
    <section className="space-y-6 rounded-[22px] border border-[#dbe5ef] bg-white p-4 sm:p-6 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-4 lg:space-y-0 lg:overflow-hidden lg:p-5">
      {showHandoffNotices && token ? <BondApplicationBuyerNotices token={token} /> : null}
      <header className="border-b border-[#e6edf5] pb-5 lg:shrink-0 lg:pb-3">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-3">
          <h1 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Bond application</h1>
          <div className="flex items-center gap-3">
            {preview ? <span className="text-xs text-[#61748a]">Preview · saved for this session</span> : <SaveStatus status={controller.saveStatus} error={controller.saveError} onRetry={() => void controller.retrySave().catch(() => {})} />}
            <button type="button" onClick={() => void controller.saveAndExit().catch(() => {})} disabled={disablePrimary} className="min-h-11 rounded-xl border border-[#d1deeb] px-3 text-xs font-semibold text-[#21384d] disabled:opacity-60">Save and exit</button>
          </div>
        </div>
        <Stepper currentStepKey={progress.currentStep.key} steps={controller.flow.steps} screenKey={controller.currentScreenKey} percent={progress.percent} documentProgress={documentsController.progress} submissionStatus={submissionStatus} />
        <DetailsTracker flow={controller.flow} />
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-4 lg:min-h-0 lg:max-w-none lg:overflow-y-auto lg:overscroll-contain lg:pr-1" aria-label="Application section">
        <p className="text-xs text-[#61748a]">{controller.flow.progress.completedRequired} of {controller.flow.progress.totalRequired} required details complete</p>
          {controller.saveError ? (
            <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] px-3 py-3 text-sm leading-6 text-[#b5472d]" role="alert">
              {controller.saveError}
            </div>
          ) : null}
          <article ref={headingRef} tabIndex={-1} aria-label={screen.title} className="outline-none">
            <BranchChangeNotice
              pending={controller.pendingBranchChange}
              onConfirm={controller.confirmBranchChange}
              onCancel={controller.cancelBranchChange}
            />
            {controller.pendingBranchChange ? <div className="h-5" /> : null}
            <CurrentScreen
              onlineSigning={onlineSigning}
              controller={controller}
              documentsController={documentsController}
              onOpenDocument={onOpenDocument}
              onOpenDocuments={onOpenDocuments}
              submissionController={submissionController}
              participantModeEnabled={participantModeEnabled}
              onInviteCoApplicant={onInviteCoApplicant}
            />
          </article>
      </div>

      <footer className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-[#dbe5ef] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 lg:static lg:-mx-5 lg:-mb-5 lg:shrink-0 lg:px-5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 lg:max-w-none">
          <button type="button" onClick={() => void handleBack().catch(() => {})} disabled={disablePrimary} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-4 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60">
            <ArrowLeft size={15} aria-hidden="true" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-[#6b7d93] sm:inline">{preview ? 'Preview only · changes stay in this session.' : 'Saved through your secure application link.'}</span>
            <button type="button" onClick={() => void handleContinue().catch(() => {})} disabled={disablePrimary || (['prepare_signature', 'awaiting_signature'].includes(controller.currentScreenKey) && !submissionController.signingAvailability.available)} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]">
              {controller.currentScreenKey === 'document_checklist' ? 'Continue to review' : controller.currentScreenKey === 'prepare_signature' ? 'Prepare application' : controller.currentScreenKey === 'awaiting_signature' ? 'Sign application' : controller.currentScreenKey === 'phase3_documents_handoff' ? 'Continue to documents' : isTransition ? 'Continue application' : 'Continue'}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </section>
  )
}
