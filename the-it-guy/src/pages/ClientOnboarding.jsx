import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { financeTypeLabel, normalizeFinanceType } from '../core/transactions/financeType'
import Button from '../components/ui/Button'
import {
  EMPLOYMENT_TYPE_OPTIONS,
  INDIVIDUAL_MARITAL_STRUCTURE_OPTIONS,
  PURCHASER_ENTITY_OPTIONS,
  deriveOnboardingConfiguration,
  getEmploymentTypeHelper,
  getEmploymentTypeLabel,
  getOnboardingStepDefinitions,
  getIndividualMaritalStructureValue,
  getPurchaserEntityType,
  getPurchaserTypeLabel,
  normalizePurchaserType,
  resolvePurchaserTypeFromFormData,
  validateOnboardingSubmission,
} from '../lib/purchaserPersonas'
import {
  fetchClientOnboardingByToken,
  saveClientOnboardingDraft,
  submitClientOnboarding,
} from '../lib/api'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const FUNDING_SOURCE_TYPE_OPTIONS = [
  { value: 'personal_account', label: 'Personal Account' },
  { value: 'company_account', label: 'Company Account' },
  { value: 'trust_account', label: 'Trust Account' },
  { value: 'family_contribution', label: 'Family Contribution' },
  { value: 'foreign_funds', label: 'Foreign Funds' },
  { value: 'other', label: 'Other' },
]

const FUNDING_SOURCE_STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'verified', label: 'Verified' },
]

const INPUT_CLASS =
  'w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]'
const LABEL_CLASS = 'flex min-w-0 flex-col gap-2 text-sm font-medium text-[#233247]'
const SECTION_CARD_CLASS =
  'rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] md:p-6'
const INNER_PANEL_CLASS =
  'rounded-[22px] border border-[#e2eaf3] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
const SOFT_PANEL_CLASS = 'rounded-[20px] border border-[#e3ebf4] bg-[#f8fbfe] p-5'
const MUTED_TEXT_CLASS = 'text-sm leading-6 text-[#6b7d93]'

function choiceCardClass(active) {
  return `h-full rounded-[20px] border px-5 py-5 text-left transition duration-150 ease-out ${
    active
      ? 'border-[#35546c] bg-[#35546c] text-white shadow-[0_18px_40px_rgba(53,84,108,0.18)]'
      : 'border-[#dde4ee] bg-white text-[#142132] shadow-[0_12px_28px_rgba(15,23,42,0.04)] hover:border-[#c8d6e5] hover:bg-[#fbfdff]'
  }`
}

function chipChoiceClass(active) {
  return `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 ease-out ${
    active
      ? 'border-[#35546c] bg-[#35546c] text-white'
      : 'border-[#d8e3ef] bg-white text-[#516277] hover:border-[#c4d4e5] hover:bg-[#f8fbff]'
  }`
}

function formatCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '—'
  }

  return currency.format(numeric)
}

function formatReservationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'pending') return 'Payment Pending'
  if (normalized === 'paid') return 'Paid'
  if (normalized === 'verified') return 'Verified'
  return 'Not Required'
}

function normalizeFundingSources(list = []) {
  if (!Array.isArray(list)) {
    return []
  }

  return list.map((item) => ({
    sourceType: item?.sourceType ?? item?.source_type ?? 'personal_account',
    amount: item?.amount ?? '',
    expectedPaymentDate: item?.expectedPaymentDate ?? item?.expected_payment_date ?? '',
    actualPaymentDate: item?.actualPaymentDate ?? item?.actual_payment_date ?? '',
    proofDocument: item?.proofDocument ?? item?.proof_document ?? '',
    status: item?.status || 'planned',
    notes: item?.notes || '',
  }))
}

function getInputType(field) {
  if (field.type === 'currency') return 'number'
  if (field.type === 'number') return 'number'
  return field.type || 'text'
}

function getCompactStepLabel(step) {
  switch (step?.key) {
    case 'intro':
      return 'Context'
    case 'purchaser_entity':
      return 'Buyer'
    case 'individual_structure':
      return 'Structure'
    case 'finance_type':
      return 'Finance'
    case 'details':
      return 'Details'
    case 'review':
      return 'Review'
    default:
      return step?.title || 'Step'
  }
}

function ClientOnboarding() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)
  const [formData, setFormData] = useState({})
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [completionBannerVisible, setCompletionBannerVisible] = useState(false)
  const [welcomeAcknowledged, setWelcomeAcknowledged] = useState(false)

  const loadData = useCallback(async () => {
    if (!token) {
      setError('Missing onboarding token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchClientOnboardingByToken(token)
      const initialPurchaserType = normalizePurchaserType(data.formData?.purchaser_type || data.purchaserType)
      setPayload(data)
      setFormData({
        ...(data.formData || {}),
        purchaser_type: initialPurchaserType,
        purchaser_entity_type: data.formData?.purchaser_entity_type || getPurchaserEntityType(initialPurchaserType),
        individual_marital_structure:
          data.formData?.individual_marital_structure || getIndividualMaritalStructureValue(initialPurchaserType),
        accrual_applies:
          data.formData?.accrual_applies ||
          (initialPurchaserType === 'married_anc_accrual' ? 'yes' : initialPurchaserType === 'married_anc' ? 'no' : ''),
        purchase_finance_type: normalizeFinanceType(data.formData?.purchase_finance_type || data.transaction?.finance_type || 'cash'),
        funding_sources: normalizeFundingSources(data.formData?.funding_sources || data.fundingSources || []),
      })
    } catch (loadError) {
      setError(loadError.message || 'Unable to load onboarding form.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: payload?.purchaserType || payload?.transaction?.purchaser_type || 'individual',
    transaction: payload?.transaction,
  })
  const purchaserTypeLabel = getPurchaserTypeLabel(purchaserType)
  const purchaserEntityType = String(formData.purchaser_entity_type || getPurchaserEntityType(purchaserType)).trim().toLowerCase()
  const individualMaritalStructure = String(
    formData.individual_marital_structure || getIndividualMaritalStructureValue(purchaserType),
  )
    .trim()
    .toLowerCase()
  const normalizedFinanceType = normalizeFinanceType(
    formData.purchase_finance_type || payload?.transaction?.finance_type || 'cash',
  )
  const buyerDisplayName = String(payload?.buyer?.name || '').trim() || 'Client'
  const propertyAddressLine = String(
    payload?.unit?.address ||
      payload?.transaction?.property_address ||
      payload?.transaction?.propertyAddress ||
      '',
  ).trim()
  const onboardingLocationLabel = propertyAddressLine
    ? propertyAddressLine
    : [payload?.unit?.development?.name, payload?.unit?.unit_number ? `Unit ${payload.unit.unit_number}` : '']
        .filter(Boolean)
        .join(' | ')
  const purchasePrice = formData.purchase_price ?? payload?.transaction?.purchase_price ?? payload?.transaction?.sales_price
  const cashAmount = formData.cash_amount ?? payload?.transaction?.cash_amount
  const bondAmount = formData.bond_amount ?? payload?.transaction?.bond_amount
  const depositAmount = formData.deposit_amount ?? payload?.transaction?.deposit_amount
  const reservationRequired =
    formData.reservation_required === true ||
    String(formData.reservation_required || '').toLowerCase() === 'yes' ||
    Boolean(payload?.transaction?.reservation_required)
  const reservationAmount = formData.reservation_amount ?? payload?.transaction?.reservation_amount
  const reservationStatus = formData.reservation_status ?? payload?.transaction?.reservation_status ?? 'not_required'
  const fundingSources = normalizeFundingSources(formData.funding_sources || payload?.fundingSources || [])
  const stepDefinitions = useMemo(
    () =>
      getOnboardingStepDefinitions({ ...formData, funding_sources: fundingSources }, { transaction: payload?.transaction }).filter(
        (step) => step.key !== 'intro',
      ),
    [formData, fundingSources, payload?.transaction],
  )
  const activeStep = stepDefinitions[activeStepIndex] || stepDefinitions[0]
  const onboardingConfiguration = useMemo(
    () =>
      deriveOnboardingConfiguration(
        {
          ...formData,
          purchaser_type: purchaserType,
          purchase_finance_type: normalizedFinanceType,
          funding_sources: fundingSources,
        },
        { transaction: payload?.transaction },
      ),
    [formData, fundingSources, normalizedFinanceType, payload?.transaction, purchaserType],
  )
  const stepGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(stepDefinitions.length, 1)}, minmax(0, 1fr))`,
      minWidth: stepDefinitions.length > 6 ? `${stepDefinitions.length * 150}px` : '100%',
    }),
    [stepDefinitions.length],
  )
  const stepCompletionPercent = stepDefinitions.length
    ? Math.round(((activeStepIndex + 1) / stepDefinitions.length) * 100)
    : 0

  useEffect(() => {
    if (!activeStep) {
      setActiveStepIndex(0)
      return
    }

    setFormData((previous) => {
      let next = previous
      let changed = false

      for (const section of activeStep.sections || []) {
        if (!section.repeatable || !section.createItem || (section.minItems || 0) <= 0) {
          continue
        }

        const currentItems = Array.isArray(next[section.key]) ? next[section.key] : []
        if (currentItems.length >= section.minItems) {
          continue
        }

        const additions = Array.from({ length: section.minItems - currentItems.length }, () => section.createItem())
        next = {
          ...next,
          [section.key]: [...currentItems, ...additions],
        }
        changed = true
      }

      return changed ? next : previous
    })
  }, [activeStep])

  function updateField(key, value) {
    setFormData((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  function updateRepeatableField(sectionKey, index, fieldKey, value) {
    const current = Array.isArray(formData[sectionKey]) ? formData[sectionKey] : []
    const next = current.map((item, itemIndex) => (itemIndex === index ? { ...item, [fieldKey]: value } : item))
    updateField(sectionKey, next)
  }

  function addRepeatableItem(sectionConfig) {
    const current = Array.isArray(formData[sectionConfig.key]) ? formData[sectionConfig.key] : []
    updateField(sectionConfig.key, [...current, sectionConfig.createItem()])
  }

  function removeRepeatableItem(sectionConfig, index) {
    const current = Array.isArray(formData[sectionConfig.key]) ? formData[sectionConfig.key] : []
    updateField(
      sectionConfig.key,
      current.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  async function handleSaveDraft() {
    try {
      setSaving(true)
      setError('')
      await saveClientOnboardingDraft({
        token,
        formData: {
          ...formData,
          purchaser_type: purchaserType,
          purchase_finance_type: normalizedFinanceType,
          funding_sources: fundingSources,
        },
      })
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save draft.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    try {
      setSaving(true)
      setError('')
      validateOnboardingSubmission(
        {
          ...formData,
          purchaser_type: purchaserType,
          purchase_finance_type: normalizedFinanceType,
          funding_sources: fundingSources,
        },
        { transaction: payload?.transaction },
      )
      await submitClientOnboarding({
        token,
        formData: {
          ...formData,
          purchaser_type: purchaserType,
          purchase_finance_type: normalizedFinanceType,
          funding_sources: fundingSources,
        },
      })
      setCompletionBannerVisible(true)
      await loadData()
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit onboarding.')
    } finally {
      setSaving(false)
    }
  }

  function validateCurrentStep() {
    try {
      setError('')

      if (activeStep?.key === 'purchaser_entity' && !purchaserEntityType) {
        throw new Error('Select who is buying this property to continue.')
      }

      if (activeStep?.key === 'purchaser_structure') {
        if (!individualMaritalStructure) {
          throw new Error('Select the individual purchasing structure to continue.')
        }

        if (individualMaritalStructure === 'married_out_of_community' && !String(formData.accrual_applies || '').trim()) {
          throw new Error('Confirm whether the accrual system applies to continue.')
        }
      }

      if (activeStep?.key === 'finance_type' && !normalizedFinanceType) {
        throw new Error('Select the finance type to continue.')
      }

      if (activeStep?.key === 'employment_type' && !String(formData.employment_type || '').trim()) {
        throw new Error('Select the employment type to continue.')
      }

      if (activeStep?.key === 'details') {
        validateOnboardingSubmission(
          {
            ...formData,
            purchaser_type: purchaserType,
            purchase_finance_type: normalizedFinanceType,
            funding_sources: fundingSources,
          },
          { transaction: payload?.transaction },
        )
      }

      return true
    } catch (validationError) {
      setError(validationError.message || 'Please complete the required fields before continuing.')
      return false
    }
  }

  function handleNextStep() {
    if (!validateCurrentStep()) {
      return
    }

    setActiveStepIndex((previous) => Math.min(previous + 1, stepDefinitions.length - 1))
  }

  function handlePreviousStep() {
    setActiveStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function renderField(fieldConfig, value, onChange) {
    const commonProps = {
      required: Boolean(fieldConfig.required),
      placeholder: fieldConfig.placeholder || '',
    }

    if (fieldConfig.type === 'textarea') {
      return <textarea className={`${INPUT_CLASS} min-h-[120px] resize-y`} value={value || ''} onChange={(event) => onChange(event.target.value)} {...commonProps} />
    }

    if (fieldConfig.type === 'select') {
      const options = fieldConfig.key === 'sourceType' ? FUNDING_SOURCE_TYPE_OPTIONS : fieldConfig.key === 'status' ? FUNDING_SOURCE_STATUS_OPTIONS : fieldConfig.options || []
      return (
        <select className={INPUT_CLASS} value={value || ''} onChange={(event) => onChange(event.target.value)} {...commonProps}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (fieldConfig.type === 'radio') {
      return (
        <div className="flex flex-wrap gap-2.5">
          {(fieldConfig.options || []).map((option) => (
            <label key={option.value} className={chipChoiceClass(String(value || '') === option.value)}>
              <input
                type="radio"
                name={fieldConfig.key}
                checked={String(value || '') === option.value}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )
    }

    if (fieldConfig.type === 'checkbox') {
      return (
        <span className="inline-flex items-start gap-3 rounded-[16px] border border-[#dde4ee] bg-[#f8fbff] px-4 py-3">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-[#c9d5e3] accent-[#35546c]"
          />
          <span className="text-sm leading-6 text-[#233247]">
            {fieldConfig.label}
            {fieldConfig.required ? <span className="ml-1 text-[#b42318]">*</span> : null}
          </span>
        </span>
      )
    }

    return (
      <input
        className={INPUT_CLASS}
        type={getInputType(fieldConfig)}
        min={fieldConfig.min}
        step={fieldConfig.step}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        {...commonProps}
      />
    )
  }

  function renderSection(sectionConfig) {
    if (sectionConfig.repeatable) {
      const entries = Array.isArray(formData[sectionConfig.key]) ? formData[sectionConfig.key] : []
      return (
        <section key={sectionConfig.key} className={INNER_PANEL_CLASS}>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{sectionConfig.title}</h4>
              {sectionConfig.description ? <p className={MUTED_TEXT_CLASS}>{sectionConfig.description}</p> : null}
            </div>
            <Button type="button" variant="secondary" onClick={() => addRepeatableItem(sectionConfig)}>
              <Plus size={14} /> {sectionConfig.addLabel}
            </Button>
          </div>

          <div className="space-y-5">
            {entries.map((entry, index) => (
              <article key={`${sectionConfig.key}-${index}`} className={SOFT_PANEL_CLASS}>
                <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="text-base font-semibold text-[#142132]">
                    {sectionConfig.itemLabel} {index + 1}
                  </strong>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#b42318] hover:bg-[#fff5f4]"
                    onClick={() => removeRepeatableItem(sectionConfig, index)}
                    disabled={entries.length <= (sectionConfig.minItems || 0)}
                  >
                    <Trash2 size={14} /> Remove
                  </Button>
                </header>

                <div className="grid gap-4 md:grid-cols-2">
                  {(sectionConfig.fields || []).map((fieldConfig) => (
                    <label
                      key={`${sectionConfig.key}-${index}-${fieldConfig.key}`}
                      className={`${LABEL_CLASS} ${fieldConfig.type === 'checkbox' || fieldConfig.fullWidth ? 'md:col-span-2' : ''}`}
                    >
                      {fieldConfig.type !== 'checkbox' ? (
                        <>
                          {fieldConfig.label}
                          {fieldConfig.required ? <span className="ml-1 text-[#b42318]">*</span> : null}
                        </>
                      ) : null}
                      {renderField(fieldConfig, entry[fieldConfig.key], (nextValue) =>
                        updateRepeatableField(sectionConfig.key, index, fieldConfig.key, nextValue),
                      )}
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )
    }

    return (
      <section key={sectionConfig.key} className={INNER_PANEL_CLASS}>
        <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">{sectionConfig.title}</h4>
        {sectionConfig.description ? <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>{sectionConfig.description}</p> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {(sectionConfig.fields || []).map((fieldConfig) => (
            <label
              key={fieldConfig.key}
              className={`${LABEL_CLASS} ${fieldConfig.type === 'checkbox' || fieldConfig.fullWidth ? 'md:col-span-2' : ''}`}
            >
              {fieldConfig.type !== 'checkbox' ? (
                <>
                  {fieldConfig.label}
                  {fieldConfig.required ? <span className="ml-1 text-[#b42318]">*</span> : null}
                </>
              ) : null}
              {renderField(fieldConfig, formData[fieldConfig.key], (nextValue) => updateField(fieldConfig.key, nextValue))}
            </label>
          ))}
        </div>
      </section>
    )
  }

  function renderActiveStepBody() {
    if (activeStep.key === 'intro') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section className={INNER_PANEL_CLASS}>
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.unit?.development?.name || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Unit</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.unit?.unit_number || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchaser</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.buyer?.name || '—'}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchase Price</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(purchasePrice)}</strong>
              </article>
            </div>
          </section>

          <section className={INNER_PANEL_CLASS}>
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">What this form is for</h4>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#516277]">
              <li>Collects the purchaser and finance information needed to prepare the sale agreement correctly.</li>
              <li>Helps the team identify which documents must later appear in your client portal.</li>
              <li>Captures the correct legal buying structure from the start.</li>
              <li>Keeps this step focused on information capture only, without asking for supporting documents yet.</li>
            </ul>
          </section>
        </div>
      )
    }

    if (activeStep.key === 'purchaser_entity') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <p className={MUTED_TEXT_CLASS}>Choose the purchaser type first. We will only ask the questions relevant to that structure.</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {PURCHASER_ENTITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(purchaserEntityType === option.value)}
                onClick={() => updateField('purchaser_entity_type', option.value)}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${purchaserEntityType === option.value ? 'text-white/80' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>
        </section>
      )
    }

    if (activeStep.key === 'purchaser_structure') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">How is the individual purchase structured?</h4>
          <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>This helps us prepare the sale agreement correctly and understand who must sign.</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {INDIVIDUAL_MARITAL_STRUCTURE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(individualMaritalStructure === option.value)}
                onClick={() => updateField('individual_marital_structure', option.value)}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${individualMaritalStructure === option.value ? 'text-white/80' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>

          {individualMaritalStructure === 'married_out_of_community' ? (
            <div className="mt-5 rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-5">
              <h5 className="text-base font-semibold text-[#142132]">Does the accrual system apply?</h5>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ].map((option) => (
                  <label key={option.value} className={chipChoiceClass(String(formData.accrual_applies || '') === option.value)}>
                    <input
                      type="radio"
                      name="accrual_applies"
                      checked={String(formData.accrual_applies || '') === option.value}
                      onChange={() => updateField('accrual_applies', option.value)}
                      className="sr-only"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )
    }

    if (activeStep.key === 'finance_type') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { value: 'bond', label: 'Bond', caption: 'Mortgage finance with bank / lender workflow' },
              { value: 'cash', label: 'Cash', caption: 'Cash-funded purchase with proof-of-funds requirement' },
              { value: 'combination', label: 'Hybrid', caption: 'Part bond, part cash contribution' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(normalizedFinanceType === option.value)}
                onClick={() => updateField('purchase_finance_type', option.value)}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${normalizedFinanceType === option.value ? 'text-white/80' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>

          {['bond', 'combination'].includes(normalizedFinanceType) ? (
            <div className="mt-5 rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-5">
              <h5 className="text-base font-semibold text-[#142132]">Do you need help sorting your bond?</h5>
              <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>OOBA can assist you at no cost and help move the finance process forward faster.</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { value: 'yes', label: 'Yes, please' },
                  { value: 'no', label: 'No, I have this covered' },
                ].map((option) => (
                  <label key={option.value} className={chipChoiceClass(String(formData.bond_help_requested || '') === option.value)}>
                    <input
                      type="radio"
                      name="bond_help_requested"
                      checked={String(formData.bond_help_requested || '') === option.value}
                      onChange={() => updateField('bond_help_requested', option.value)}
                      className="sr-only"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )
    }

    if (activeStep.key === 'employment_type') {
      return (
        <section className={INNER_PANEL_CLASS}>
          <p className={MUTED_TEXT_CLASS}>
            This helps Bridge request the correct finance documents so OOBA and the finance lane can work directly from the portal.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={choiceCardClass(String(formData.employment_type || '') === option.value)}
                onClick={() => updateField('employment_type', option.value)}
              >
                <strong className="block text-base font-semibold">{option.label}</strong>
                <span className={`mt-3 block text-sm leading-6 ${String(formData.employment_type || '') === option.value ? 'text-white/80' : 'text-[#6b7d93]'}`}>{option.caption}</span>
              </button>
            ))}
          </div>

          {String(formData.employment_type || '').trim() ? (
            <div className="mt-5 rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-5">
              <h5 className="text-base font-semibold text-[#142132]">{getEmploymentTypeLabel(formData.employment_type)} selected</h5>
              <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>{getEmploymentTypeHelper(formData.employment_type)}</p>
            </div>
          ) : null}
        </section>
      )
    }

    if (activeStep.key === 'details') {
      return <div className="space-y-5">{(activeStep.sections || []).map(renderSection)}</div>
    }

    if (activeStep.key === 'review') {
      return (
        <div className="space-y-4">
          <section className={INNER_PANEL_CLASS}>
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchaser Type</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{purchaserTypeLabel}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Finance Type</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{financeTypeLabel(normalizedFinanceType)}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Purchase Price</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(purchasePrice)}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Primary Purchaser</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{payload.buyer?.name || '—'}</strong>
              </article>
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-[#516277]">
              <li>Your information will be used to prepare the sale agreement correctly.</li>
              <li>Bridge will prepare your document request list from the information you have submitted here.</li>
              <li>Next, you will receive access to the client portal where you can upload documents.</li>
            </ul>
          </section>

          <section className={INNER_PANEL_CLASS}>
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Finance Summary</h4>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Cash Amount</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(cashAmount)}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Bond Amount</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(bondAmount)}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Estimated Deposit</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(depositAmount)}</strong>
              </article>
              <article className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Reservation</span>
                <strong className="mt-2 block text-lg font-semibold text-[#142132]">
                  {reservationRequired
                    ? `${formatCurrency(reservationAmount)} • ${formatReservationStatus(reservationStatus)}`
                    : 'Not Required'}
                </strong>
              </article>
            </div>
          </section>

          {fundingSources.length ? (
            <section className={INNER_PANEL_CLASS}>
              <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Funding Sources</h4>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {fundingSources.map((source, index) => (
                  <article key={`funding-source-${index}`} className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">
                      {FUNDING_SOURCE_TYPE_OPTIONS.find((item) => item.value === source.sourceType)?.label || 'Funding Source'}
                    </span>
                    <strong className="mt-2 block text-lg font-semibold text-[#142132]">{formatCurrency(source.amount)}</strong>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{source.expectedPaymentDate ? `Expected ${source.expectedPaymentDate}` : 'Expected payment date not set yet.'}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className={INNER_PANEL_CLASS}>
            <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Documents you will need</h4>
            <p className={`mt-2 ${MUTED_TEXT_CLASS}`}>
              These are the first documents Bridge will request once your information sheet has been reviewed.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {onboardingConfiguration.requiredDocuments.map((item) => (
                <article key={item.key} className="rounded-[18px] border border-[#e0e8f1] bg-[#fbfdff] p-4">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">{item.groupLabel}</span>
                  <strong className="mt-2 block text-base font-semibold text-[#142132]">{item.label}</strong>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )
    }

    return null
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <p className="rounded-[18px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#516277] shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
            Loading onboarding form...
          </p>
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <section className={SECTION_CARD_CLASS}>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">Client Onboarding</h1>
            <p className="mt-4 rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
          </section>
        </div>
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-5 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
          <section className={SECTION_CARD_CLASS}>
            <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">Client Onboarding</h1>
            <p className="mt-4 rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">
              Unable to load onboarding data.
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-[1240px] rounded-[34px] border border-[#dbe5ef] bg-[#f7fafc] p-4 shadow-[0_28px_70px_rgba(15,23,42,0.1)] md:p-6">
        <div className="flex flex-col gap-5">
          <section className="overflow-hidden rounded-[30px] border border-[#d7e1ec] bg-white shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
            <div className="bg-[linear-gradient(135deg,#35546c_0%,#4f7593_100%)] px-6 py-7 text-white md:px-8 md:py-8">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/70">bridge.</p>
              <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-4xl">
                  <h1 className="text-[1.75rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white md:text-[2.45rem]">Information Sheet</h1>
                  <p className="mt-3 text-sm font-medium text-white/78 md:text-base">{onboardingLocationLabel || 'Property Purchase'}</p>
                </div>
                {welcomeAcknowledged ? (
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-sm">
                    Step {activeStepIndex + 1} of {stepDefinitions.length}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 border-t border-[#e4edf6] bg-[#f8fbff] px-6 py-5 md:grid-cols-3 md:px-8">
              <article className="rounded-[20px] border border-[#dde7f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development</span>
                <strong className="mt-2 block text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{payload.unit?.development?.name || '—'}</strong>
              </article>
              <article className="rounded-[20px] border border-[#dde7f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Unit</span>
                <strong className="mt-2 block text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{payload.unit?.unit_number || '—'}</strong>
              </article>
              <article className="rounded-[20px] border border-[#dde7f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Progress</span>
                <strong className="mt-2 block text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{stepCompletionPercent}% complete</strong>
                <span className="mt-1 block text-sm text-[#6b7d93]">Step {activeStepIndex + 1} of {stepDefinitions.length}</span>
              </article>
            </div>
          </section>

          {completionBannerVisible ? (
            <p className="rounded-[18px] border border-[#cfe8da] bg-[#effaf3] px-4 py-3 text-sm font-medium text-[#22824d]">
              Information submitted. The internal team can now prepare the sale agreement and the correct document requirements for your portal.
            </p>
          ) : null}
          {error ? <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p> : null}

          {!welcomeAcknowledged ? (
            <section className="overflow-hidden rounded-[30px] border border-[#d8e3ef] bg-[linear-gradient(145deg,#edf5fc_0%,#f7fbff_46%,#ffffff_100%)] shadow-[0_24px_56px_rgba(15,23,42,0.1)]">
              <div className="grid gap-8 p-6 md:gap-10 md:p-8 xl:grid-cols-[minmax(0,1.15fr)_340px] xl:gap-12">
                <div className="space-y-7">
                  <span className="inline-flex items-center rounded-full border border-[#d8e7f6] bg-white/90 px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#35546c] shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
                    Welcome
                  </span>
                  <div className="space-y-4">
                    <h2 className="text-[2rem] font-semibold tracking-[-0.05em] text-[#142132] md:text-[2.6rem]">Welcome {buyerDisplayName}</h2>
                    <p className="max-w-3xl text-base leading-7 text-[#4b5d73] md:text-lg">
                      We are excited to guide you through the process. This information sheet helps Bridge collect the right purchase, finance,
                      and legal details upfront so your team can move faster and keep communication streamlined.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      'You will only see the questions relevant to your purchase structure.',
                      'Bridge will use your answers to prepare the correct document request list.',
                      'After submission, you will receive access to the client portal for document uploads.',
                    ].map((item) => (
                      <article key={item} className="rounded-[20px] border border-[#dde7f1] bg-white/90 p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.08)]">
                        <p className="text-sm leading-6 text-[#516277]">{item}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-[26px] border border-[#dbe5ef] bg-white/92 p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)] md:p-7">
                  <div className="space-y-5">
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6b7d93]">
                      Before you begin
                    </span>
                    <h3 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">One guided onboarding flow</h3>
                    <p className="text-sm leading-6 text-[#516277]">
                      Once you proceed, Bridge will take you directly into the information sheet. On future visits, this welcome screen will be skipped.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="mt-6"
                    onClick={() => setWelcomeAcknowledged(true)}
                  >
                    Proceed <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="overflow-hidden rounded-[28px] border border-[#d8e3ef] bg-[linear-gradient(135deg,#edf4fb_0%,#e3edf8_48%,#f4f8fc_100%)] p-5 shadow-[0_20px_42px_rgba(15,23,42,0.08)] md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Progress</strong>
                    <span className="mt-1 block text-sm text-[#6b7d93]">
                      Step {activeStepIndex + 1} of {stepDefinitions.length}
                    </span>
                  </div>
                  <span className="text-2xl font-semibold tracking-[-0.04em] text-[#35546c]">{stepCompletionPercent}%</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[#35546c] transition-[width] duration-300" style={{ width: `${stepCompletionPercent}%` }} />
                </div>
                <div className="mt-5 overflow-x-auto pb-1">
                  <div className="grid gap-3" style={stepGridStyle}>
                    {stepDefinitions.map((step, index) => (
                      <button
                        key={step.key}
                        type="button"
                        className={`rounded-[18px] border px-3 py-3 text-left transition duration-150 ease-out ${
                          index === activeStepIndex
                            ? 'border-[#35546c] bg-[#35546c] text-white'
                            : index < activeStepIndex
                              ? 'border-[#cfe8da] bg-[#effaf3] text-[#22824d]'
                              : 'border-white/85 bg-white/88 text-[#516277] hover:border-[#cbd8e5] hover:bg-white'
                        }`}
                        onClick={() => setActiveStepIndex(index)}
                      >
                        <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] opacity-75">{index + 1}</span>
                        <strong className="mt-2 block text-[0.94rem] font-semibold leading-5">{getCompactStepLabel(step)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className={SECTION_CARD_CLASS}>
                {activeStep.key !== 'intro' ? (
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#142132]">{activeStep.title}</h3>
                      <p className={MUTED_TEXT_CLASS}>{activeStep.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#d8e7f6] bg-[#f6fbff] px-4 py-2 text-sm font-semibold text-[#35546c]">
                      Step {activeStepIndex + 1} of {stepDefinitions.length}
                    </span>
                  </div>
                ) : null}

                {renderActiveStepBody()}

                <div className="mt-6 flex flex-col gap-3 border-t border-[#edf2f7] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => void handleSaveDraft()} disabled={saving}>
                    Save Draft
                  </Button>
                  <div className="flex flex-wrap items-center gap-3">
                    {activeStepIndex > 0 ? (
                      <Button type="button" variant="ghost" onClick={handlePreviousStep}>
                        <ChevronLeft size={14} /> Back
                      </Button>
                    ) : null}
                    {activeStep.key !== 'review' ? (
                      <Button type="button" onClick={handleNextStep}>
                        Next <ChevronRight size={14} />
                      </Button>
                    ) : (
                      <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
                        Submit Information Sheet
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default ClientOnboarding
