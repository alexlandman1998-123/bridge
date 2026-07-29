import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, FileText, PenLine, RotateCcw, ShieldCheck, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  GUIDED_BOND_APPLICATION_PHASE2_STEPS,
} from './phase2GuidedFlow.js'
import { useGuidedBondApplication } from './hooks/useGuidedBondApplication.js'
import { useBondApplicationDocuments } from './hooks/useBondApplicationDocuments.js'
import { useBondApplicationSubmission } from './hooks/useBondApplicationSubmission.js'
import { getBondApplicationRepeatableGroup } from '../flow/bondApplicationFlowContract.js'
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
  calculateAssetTotal,
  calculateLiabilityTotal,
  calculateMonthlyCommitmentTotal,
} from '../flow/bondApplicationDerivedValues.js'

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
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-[92px] rounded-[14px] border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#35546c]/20 ${
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
  const error = getFieldError(issues, question.path)

  function startAdd() {
    const id = createGuidedItemId(group.key)
    setDraft({ id, guidedItemId: id, source: 'guided' })
    setEditingId(id)
  }

  function startEdit(record) {
    const id = record.id || record.guidedItemId || record.legacyKey || createGuidedItemId(group.key)
    setDraft({ ...record, id: record.id || id, guidedItemId: record.guidedItemId || id, source: record.source || 'guided' })
    setEditingId(id)
  }

  function saveItem() {
    const id = draft.id || draft.guidedItemId || editingId || createGuidedItemId(group.key)
    const normalizedDraft = { ...draft, id, guidedItemId: draft.guidedItemId || id, source: draft.source || 'guided' }
    const index = records.findIndex((record) => (record.id || record.guidedItemId || record.legacyKey) === editingId)
    const nextRecords = index >= 0
      ? records.map((record, recordIndex) => (recordIndex === index ? normalizedDraft : record))
      : [...records, normalizedDraft]
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
            return (
              <article key={id} className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#17283a]">{title}</h4>
                    {record.accountNumber ? <p className="mt-1 text-xs text-[#6b7d93]">Account {maskAccount(record.accountNumber)}</p> : null}
                    {amount !== undefined && amount !== null && amount !== '' ? <p className="mt-1 text-xs font-semibold text-[#4d6279]">{formatCurrency(amount)}</p> : null}
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
              const fieldValue = getBondApplicationPathValue(draft, field.path)
              const fieldError = issues.find((item) => item.path?.includes(`${question.path}.`) && item.path?.endsWith(field.path))?.message || ''
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

function Stepper({ currentStepKey, steps = GUIDED_BOND_APPLICATION_PHASE2_STEPS }) {
  return (
    <ol className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
      {steps.map((step, index) => {
        const active = step.key === currentStepKey
        const completed = step.status === 'complete'
        return (
          <li key={step.key}>
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex min-h-[44px] items-center rounded-[12px] border px-3 py-2 text-xs font-semibold ${
                active
                  ? 'border-[#9bb8d2] bg-white text-[#17314b] shadow-[0_8px_18px_rgba(15,23,42,0.06)]'
                  : completed
                    ? 'border-[#cfe4d8] bg-[#f2faf5] text-[#28724d]'
                    : 'border-[#e1e9f2] bg-[#f8fbff] text-[#74869b]'
              }`}
            >
              <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#edf3f8] text-[0.68rem]">{index + 1}</span>
              <span className="truncate">{step.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function SummaryRail({ state, documentProgress = null }) {
  const property = state.application.property || {}
  const finance = state.application.finance || {}
  const applicantStructure = state.application.applicantStructure
  const monthlyTotal = calculateMonthlyCommitmentTotal(state)
  const incomeTotal = calculateAdditionalIncomeTotal(state)
  const assetTotal = calculateAssetTotal(state)
  const liabilityTotal = calculateLiabilityTotal(state)
  const documentStatus = documentProgress
    ? documentProgress.totalRequired > 0
      ? `${documentProgress.completedRequired} of ${documentProgress.totalRequired} received`
      : 'No active requests'
    : 'Next step'
  return (
    <aside className="space-y-3 lg:sticky lg:top-5 lg:h-fit">
      <article className="rounded-[18px] border border-[#dbe5ef] bg-white p-4">
        <h3 className="text-sm font-semibold text-[#142132]">Your purchase</h3>
        <dl className="mt-3 space-y-2 text-sm text-[#5f7288]">
          <div><dt className="text-xs uppercase tracking-[0.1em] text-[#8191a5]">Property</dt><dd className="font-semibold text-[#17283a]">{property.developmentName || property.propertyReference || 'Property pending'}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.1em] text-[#8191a5]">Unit</dt><dd className="font-semibold text-[#17283a]">{property.unitReference || 'Unit pending'}</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.1em] text-[#8191a5]">Bond required</dt><dd className="font-semibold text-[#17283a]">{formatCurrency(finance.requestedBondAmount) || 'Not provided'}</dd></div>
        </dl>
      </article>
      <article className="rounded-[18px] border border-[#dbe5ef] bg-white p-4">
        <h3 className="text-sm font-semibold text-[#142132]">Application status</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Primary applicant</dt><dd className="font-semibold text-[#17283a]">In progress</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Employment and income</dt><dd className="font-semibold text-[#17283a]">{incomeTotal > 0 ? 'In progress' : 'In progress'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Monthly commitments</dt><dd className="font-semibold text-[#17283a]">{monthlyTotal > 0 ? formatCurrency(monthlyTotal) : 'In progress'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Assets</dt><dd className="font-semibold text-[#17283a]">{assetTotal > 0 ? formatCurrency(assetTotal) : 'In progress'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Liabilities</dt><dd className="font-semibold text-[#17283a]">{liabilityTotal > 0 ? formatCurrency(liabilityTotal) : 'In progress'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Co-applicant</dt><dd className="font-semibold text-[#17283a]">{applicantStructure === 'joint' ? 'Continue application' : 'Not added'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Documents</dt><dd className="font-semibold text-[#17283a]">{documentStatus}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#6b7d93]">Final signature</dt><dd className="font-semibold text-[#17283a]">Pending</dd></div>
        </dl>
      </article>
    </aside>
  )
}

function ApplicationConfirmationScreen({ state, updateField, issues }) {
  const property = state.application.property || {}
  const finance = state.application.finance || {}
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Your purchase</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Confirm the property and bond amounts before we move to your details.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Development" value={property.developmentName} />
        <DetailRow label="Unit" value={property.unitReference} />
        <DetailRow label="Property reference" value={property.propertyReference} />
        <DetailRow label="Purchase price" value={formatCurrency(finance.purchasePrice)} />
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id="guided-purchase-price" label="Purchase price" value={finance.purchasePrice} inputMode="decimal" onChange={(value) => updateField('application.finance.purchasePrice', value)} error={getFieldError(issues, 'application.finance.purchasePrice')} />
        <TextInput id="guided-deposit" label="Deposit" value={finance.depositAmount} inputMode="decimal" onChange={(value) => updateField('application.finance.depositAmount', value)} />
        <TextInput id="guided-bond-required" label="Bond required" value={finance.requestedBondAmount} inputMode="decimal" onChange={(value) => updateField('application.finance.requestedBondAmount', value)} error={getFieldError(issues, 'application.finance.requestedBondAmount')} />
      </div>
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
        <DetailRow label="Marital status" value={personal.marital_status} />
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
        <TextInput id="guided-marital" label="Marital status" value={personal.marital_status || ''} onChange={(value) => updateField('participants.primaryApplicant.personal.marital_status', value)} />
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
        <TextInput id="guided-employee-number" label="Employee number" value={employment.employee_number || ''} onChange={(value) => updateField('participants.primaryApplicant.employment.employee_number', value)} />
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
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">The current application stores employment duration as years and months.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput id="guided-employment-years" label="Years" value={employment.employment_years || ''} inputMode="numeric" onChange={(value) => updateField('participants.primaryApplicant.employment.employment_years', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.employment_years')} />
        <TextInput id="guided-employment-months" label="Months" value={employment.employment_months || ''} inputMode="numeric" onChange={(value) => updateField('participants.primaryApplicant.employment.employment_months', value)} />
        <TextInput id="guided-works-sa" label="Works in South Africa" value={employment.works_in_south_africa || ''} onChange={(value) => updateField('participants.primaryApplicant.employment.works_in_south_africa', value)} error={getFieldError(issues, 'participants.primaryApplicant.employment.works_in_south_africa')} />
      </div>
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
        <DetailRow label="Additional monthly income" value={incomeTotal > 0 ? formatCurrency(incomeTotal) : 'Not provided'} />
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
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Answer the questions that apply to this part of your application.</p>
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

function DocumentStatusBadge({ statusLabel }) {
  return (
    <span className="inline-flex rounded-full border border-[#d8e3ee] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold text-[#40566d]">
      {statusLabel}
    </span>
  )
}

function DocumentRequirementCard({ item, uploadState, onUpload, onRetry }) {
  const requirement = item.requirement
  const inputId = `guided-document-${requirement.key}`
  const uploadStatus = uploadState[requirement.key]?.status || ''
  const uploadError = uploadState[requirement.key]?.error || ''
  const primaryDocument = item.documents?.[0] || null
  const canUpload = ['missing', 'partially_satisfied', 'rejected'].includes(item.status)
  const actionLabel = item.status === 'rejected' ? 'Replace document' : 'Upload document'
  return (
    <article className="rounded-[16px] border border-[#dbe5ef] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#17283a]">{requirement.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#61748a]">{requirement.description}</p>
          {requirement.reason ? <p className="mt-1 text-xs text-[#7a8da3]">{requirement.reason}</p> : null}
        </div>
        <DocumentStatusBadge statusLabel={item.statusLabel} />
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-[#61748a] sm:grid-cols-2">
        <div><dt className="font-semibold text-[#40566d]">Required files</dt><dd>{item.requiredCount}</dd></div>
        <div><dt className="font-semibold text-[#40566d]">Received</dt><dd>{item.uploadedCount}</dd></div>
        {primaryDocument ? (
          <div className="sm:col-span-2"><dt className="font-semibold text-[#40566d]">Document</dt><dd className="break-words">{primaryDocument.name || primaryDocument.document_label || 'Uploaded document'}</dd></div>
        ) : null}
      </dl>
      {canUpload ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]">
            <UploadCloud size={16} aria-hidden="true" />
            {uploadStatus === 'uploading' ? 'Uploading...' : actionLabel}
          </label>
          <input
            id={inputId}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onUpload(item, file)
              event.target.value = ''
            }}
            aria-label={`${actionLabel}: ${requirement.title}`}
          />
          {uploadStatus === 'error' ? (
            <button type="button" onClick={() => void onRetry(item)} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#f1d4cf] bg-[#fff8f6] px-4 py-2 text-sm font-semibold text-[#b5472d]">
              <RotateCcw size={15} aria-hidden="true" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {uploadError ? <p className="mt-2 text-xs font-semibold text-[#b5472d]" role="alert">{uploadError}</p> : null}
    </article>
  )
}

function DocumentsChecklistScreen({ documentsController }) {
  const { groups, progress, error, uploadState, uploadDocument, retryUpload, reconciling } = documentsController
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Documents for your application</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">We have used your application details to work out what is needed. Documents you have already provided are shown below, so you do not need to upload them again.</p>
      </div>
      <div className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfdff] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#17283a]">Document progress</p>
            <p className="mt-1 text-xs text-[#61748a]">{progress.completedRequired} of {progress.totalRequired} required documents received</p>
          </div>
          <span className="text-lg font-semibold text-[#17314b]">{progress.percent}%</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e4ebf3]">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#2f8a64_100%)] transition-all duration-300" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      {error ? (
        <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] px-3 py-3 text-sm leading-6 text-[#b5472d]" role="alert">
          {error}
        </div>
      ) : null}
      {reconciling ? <p className="text-sm text-[#61748a]" aria-live="polite">Refreshing document checklist...</p> : null}
      {groups.length ? groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{group.title}</h3>
          <div className="space-y-3">
            {group.items.map((item) => (
              <DocumentRequirementCard
                key={item.requirement.key}
                item={item}
                uploadState={uploadState}
                onUpload={uploadDocument}
                onRetry={retryUpload}
              />
            ))}
          </div>
        </section>
      )) : (
        <div className="rounded-[14px] border border-dashed border-[#cfdcea] bg-[#fbfdff] p-4 text-sm text-[#61748a]">
          No active document requests are available for this application yet.
        </div>
      )}
      {!progress.canContinue && progress.blockingMissing.length ? (
        <div className="flex items-start gap-2 rounded-[14px] border border-[#f2d6a6] bg-[#fff9ed] p-4 text-sm text-[#6f5120]" role="status">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Upload the required-before-signature documents before continuing to review.</p>
        </div>
      ) : null}
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
      <div className="grid gap-3">
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

function PrepareSignatureScreen({ submissionController }) {
  const { readiness, preparing, error, submission, prepareForSignature, startSigning } = submissionController
  const status = String(submission?.status || '').toLowerCase()
  const awaiting = status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Prepare for signing</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">We will prepare a locked application document from the information you reviewed. Signing happens in the secure signing page.</p>
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
      <div className="flex flex-wrap gap-2">
        {!awaiting ? (
          <button type="button" disabled={preparing} onClick={() => void prepareForSignature()} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#9aa9b8]">
            <FileText size={16} aria-hidden="true" />
            {preparing ? 'Preparing...' : 'Prepare application'}
          </button>
        ) : (
          <button type="button" onClick={startSigning} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white">
            Sign application
          </button>
        )}
      </div>
    </div>
  )
}

function AwaitingSignatureScreen({ submissionController }) {
  const { submission, refreshing, refreshStatus, startSigning, makeChanges, error } = submissionController
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Awaiting your signature</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f7288]">Your application has been prepared from the information you reviewed. Sign it to complete your submission.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Submission version" value={submission?.submission_version || submission?.submissionVersion || 'Not prepared'} />
        <DetailRow label="Prepared" value={submission?.prepared_at || 'Not provided'} />
        <DetailRow label="Status" value={submission?.status || 'Awaiting signature'} />
      </dl>
      {error ? <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] p-4 text-sm text-[#b5472d]" role="alert">{error}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={startSigning} className="rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white">Sign application</button>
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

function CurrentScreen({
  controller,
  documentsController,
  submissionController,
  participantModeEnabled = false,
  onInviteCoApplicant,
}) {
  const { currentScreenKey, applicationState, updateField, updateRepeatableGroup, validationIssues, handoffReason, flow } = controller
  if (currentScreenKey === 'application_confirmation') return <ApplicationConfirmationScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'applicant_structure') return <ApplicantStructureScreen state={applicationState} updateField={updateField} issues={validationIssues} participantModeEnabled={participantModeEnabled} onInviteCoApplicant={onInviteCoApplicant} />
  if (currentScreenKey === 'about_you_confirmation') return <AboutYouConfirmationScreen state={applicationState} onEdit={controller.openAboutYouEdit} />
  if (currentScreenKey === 'about_you_edit') return <AboutYouEditScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'employment_type') return <EmploymentTypeScreen state={applicationState} updateField={updateField} issues={validationIssues} />
  if (currentScreenKey === 'monthly_commitments_summary') return <MonthlyCommitmentsSummaryScreen state={applicationState} />
  if (currentScreenKey === 'document_checklist') return <DocumentsChecklistScreen documentsController={documentsController} />
  if (currentScreenKey === 'review_overview') return <ReviewOverviewScreen submissionController={submissionController} onEditSection={(section) => void controller.openScreen(section.screenKey)} />
  if (currentScreenKey === 'declarations') return <DeclarationsScreen submissionController={submissionController} />
  if (currentScreenKey === 'prepare_signature') return <PrepareSignatureScreen submissionController={submissionController} />
  if (currentScreenKey === 'awaiting_signature') return <AwaitingSignatureScreen submissionController={submissionController} />
  if (currentScreenKey === 'submitted_status') return <SubmittedApplicationScreen submissionController={submissionController} />
  if (flow.currentScreen?.transitionOnly) return <TransitionScreen reason={handoffReason || (currentScreenKey === 'phase4_review_sign_handoff' ? 'phase_4_review_sign' : currentScreenKey === 'phase3_documents_handoff' ? 'phase_3_documents' : '')} />
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
  portal,
  token,
  saveClientPortalOnboardingDraft,
  requiredDocuments = [],
  documents = [],
  onReconcileDocumentRequirements,
  onUploadRequiredDocument,
  onRefreshDocuments,
  onPrepareSubmission,
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
    onReconcileDocumentRequirements,
    onUploadRequiredDocument,
    onRefreshDocuments,
  })
  const submissionController = useBondApplicationSubmission({
    applicationState: controller.applicationState,
    documentChecklist: documentsController.checklist,
    documentProgress: documentsController.progress,
    saveStatus: controller.saveStatus,
    saveLatestApplication: controller.saveCurrent,
    onPrepareSubmission,
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
      if (result.ok) await controller.openScreen('awaiting_signature')
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
    <section className="space-y-5 rounded-[22px] border border-[#dbe5ef] bg-[#f8fbff] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:px-5 sm:py-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#dbe5ef] bg-white px-4 py-3">
        <button type="button" onClick={onBackToPortal} className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to portal
        </button>
        <SaveStatus status={controller.saveStatus} error={controller.saveError} onRetry={() => void controller.retrySave()} />
        <button type="button" onClick={() => void controller.saveAndExit()} disabled={disablePrimary} className="inline-flex min-h-[38px] items-center rounded-[10px] bg-[#35546c] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]">
          Save and exit
        </button>
      </header>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Complete your bond application</span>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-[-0.03em] text-[#142132] outline-none">
          {screen.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[#5f7288]">
          We have prefilled what we can from your onboarding and only ask for what is still needed.
        </p>
      </div>

      <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
          <span>Step {progress.currentStepIndex + 1} of {progress.stepCount}: {progress.currentStep.label}</span>
          <span>{progress.percent}%</span>
        </div>
        <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-[#e4ebf3]">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#2f8a64_100%)] transition-all duration-300" style={{ width: `${progress.percent}%` }} />
        </div>
        <Stepper currentStepKey={progress.currentStep.key} steps={controller.flow.steps} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {controller.saveError ? (
            <div className="rounded-[14px] border border-[#f1d4cf] bg-[#fff8f6] px-3 py-3 text-sm leading-6 text-[#b5472d]" role="alert">
              {controller.saveError}
            </div>
          ) : null}
          <article className="rounded-[18px] border border-[#dbe5ef] bg-white p-5">
            <BranchChangeNotice
              pending={controller.pendingBranchChange}
              onConfirm={controller.confirmBranchChange}
              onCancel={controller.cancelBranchChange}
            />
            {controller.pendingBranchChange ? <div className="h-5" /> : null}
            <CurrentScreen
              controller={controller}
              documentsController={documentsController}
              submissionController={submissionController}
              participantModeEnabled={participantModeEnabled}
              onInviteCoApplicant={onInviteCoApplicant}
            />
          </article>
          <div className="lg:hidden">
            <SummaryRail state={controller.applicationState} documentProgress={documentsController.progress} />
          </div>
        </div>
        <div className="hidden lg:block">
          <SummaryRail state={controller.applicationState} documentProgress={documentsController.progress} />
        </div>
      </div>

      <footer className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-[#dbe5ef] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => void handleBack()} disabled={disablePrimary} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-4 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60">
            <ArrowLeft size={15} aria-hidden="true" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-medium text-[#6b7d93] sm:inline">Saved through your secure application link.</span>
            <button type="button" onClick={() => void handleContinue()} disabled={disablePrimary} className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]">
              {controller.currentScreenKey === 'document_checklist' ? 'Continue to review' : controller.currentScreenKey === 'prepare_signature' ? 'Prepare application' : controller.currentScreenKey === 'awaiting_signature' ? 'Sign application' : controller.currentScreenKey === 'phase3_documents_handoff' ? 'Continue to documents' : isTransition ? 'Continue application' : 'Continue'}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </section>
  )
}
