import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  Factory,
  Handshake,
  Sprout,
  Store,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizePropertyCategory } from '../../../lib/propertyTaxonomy'
import {
  buildListingPayload,
  buildReviewSections,
  createInitialValues,
  getCategoryFields,
  getTermFields,
  getWizardSteps,
  listingStatusOptions,
  LISTING_INTENT_OPTIONS,
  PROPERTY_CATEGORY_OPTIONS,
  validateWizardStep,
  VISIBILITY_OPTIONS,
} from './commercialListingWizardModel'
import CommercialAddressField from './CommercialAddressField'
import { buildManualCommercialAddressValue } from './commercialAddressFieldUtils'

const CATEGORY_ICONS = {
  commercial: Building2,
  industrial: Factory,
  retail: Store,
  agricultural: Sprout,
}

const INTENT_ICONS = {
  lease: BriefcaseBusiness,
  sale: Handshake,
}

function fieldClass(error) {
  return `min-h-11 w-full rounded-2xl border ${error ? 'border-rose-300' : 'border-slate-200'} bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]`
}

function optionLabel(options = [], value = '', fallback = '-') {
  return options.find((option) => option.value === value)?.label || fallback
}

function buildPropertyOptions(rawLookups = {}, category = '') {
  const targetCategory = normalizePropertyCategory(category, { fallback: '' })
  return (rawLookups.properties || [])
    .filter((row) => {
      if (!targetCategory) return true
      const rowCategory = normalizePropertyCategory(row.property_type || row.property_category, { fallback: '' })
      return !rowCategory || rowCategory === targetCategory
    })
    .map((row) => ({
      value: row.id,
      label: [row.property_name || 'Unnamed property', [row.suburb, row.city].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    }))
}

function buildVacancyOptions(rawLookups = {}, propertyId = '') {
  return (rawLookups.vacancies || [])
    .filter((row) => !propertyId || row.property_id === propertyId)
    .map((row) => ({
      value: row.id,
      label: [row.vacancy_name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' · '),
    }))
}

function readPropertyPreview(rawLookups = {}, propertyId = '') {
  return (rawLookups.properties || []).find((row) => row.id === propertyId) || null
}

function readVacancyPreview(rawLookups = {}, vacancyId = '') {
  return (rawLookups.vacancies || []).find((row) => row.id === vacancyId) || null
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-[#102236]">{title}</h3>
        {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CommercialListingWizard({ open, lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [values, setValues] = useState(() => createInitialValues(lookups))
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdListing, setCreatedListing] = useState(null)

  const steps = useMemo(() => getWizardSteps(values), [values])
  const propertyOptions = useMemo(() => buildPropertyOptions(rawLookups, values.property_category), [rawLookups, values.property_category])
  const vacancyOptions = useMemo(() => buildVacancyOptions(rawLookups, values.property_id), [rawLookups, values.property_id])
  const propertyPreview = useMemo(() => readPropertyPreview(rawLookups, values.property_id), [rawLookups, values.property_id])
  const vacancyPreview = useMemo(() => readVacancyPreview(rawLookups, values.existing_vacancy_id), [rawLookups, values.existing_vacancy_id])
  const categoryFields = useMemo(() => getCategoryFields(values.property_category), [values.property_category])
  const termFields = useMemo(() => getTermFields(values.listing_intent), [values.listing_intent])
  const reviewSections = useMemo(
    () => buildReviewSections(values, { ...lookups, properties: propertyOptions, vacancies: vacancyOptions }),
    [lookups, propertyOptions, vacancyOptions, values],
  )

  useEffect(() => {
    if (!open) return
    setStepIndex(0)
    setValues(createInitialValues(lookups))
    setFieldErrors({})
    setSaving(false)
    setError('')
    setCreatedListing(null)
  }, [lookups, open])

  if (!open) return null

  function setValue(name, value) {
    setValues((current) => {
      const next = { ...current, [name]: value }
      if (name === 'listing_intent' && (!current.listing_status || current.listing_status === 'draft')) next.listing_status = 'draft'
      if (name === 'property_category' && current.property_id) next.property_id = ''
      if (name === 'property_id' && current.existing_vacancy_id) next.existing_vacancy_id = ''
      return next
    })
    setFieldErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function setNewPropertyAddress(value) {
    const addressValue = value || null
    setValues((current) => ({
      ...current,
      new_property_address_value: addressValue,
      new_property_address: addressValue?.formattedAddress || '',
      new_property_suburb: addressValue?.suburb || current.new_property_suburb || '',
      new_property_city: addressValue?.city || current.new_property_city || '',
      new_property_province: addressValue?.province || current.new_property_province || '',
      new_property_country: addressValue?.country || current.new_property_country || 'South Africa',
    }))
    setFieldErrors((current) => {
      if (!current.new_property_address) return current
      const next = { ...current }
      delete next.new_property_address
      return next
    })
  }

  function validateCurrentStep(targetIndex = stepIndex) {
    const nextErrors = validateWizardStep(targetIndex, values)
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function nextStep() {
    if (!validateCurrentStep(stepIndex)) return
    setStepIndex((current) => Math.min(steps.length - 1, current + 1))
  }

  function previousStep() {
    setStepIndex((current) => Math.max(0, current - 1))
  }

  async function submit(event) {
    event.preventDefault()
    if (!validateCurrentStep(steps.length - 1)) return

    setSaving(true)
    setError('')
    try {
      const payload = buildListingPayload(values, { ...lookups, properties: propertyOptions, vacancies: vacancyOptions })
      const created = await onSubmit?.(payload)
      if (!created?.id) {
        onClose?.()
        return
      }
      setCreatedListing(created)
    } catch (submitError) {
      setError(submitError?.message || 'Listing could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function resetWizard() {
    setStepIndex(0)
    setValues(createInitialValues(lookups))
    setFieldErrors({})
    setSaving(false)
    setError('')
    setCreatedListing(null)
  }

  function goToPath(path, state) {
    onClose?.()
    navigate(path, state ? { state } : undefined)
  }

  function createDealDraft() {
    if (!createdListing?.id) return
    goToPath(`/commercial/${values.listing_intent === 'lease' ? 'leasing' : 'sales'}?tab=opportunities`, {
      openCommercialCreate: true,
      commercialCreateDraft: {
        deal_name: `${createdListing.title || 'Commercial listing'} Opportunity`,
        deal_type: values.listing_intent,
        listing_id: createdListing.id,
        property_id: createdListing.property_id || '',
        vacancy_id: createdListing.vacancy_id || '',
        landlord_id: createdListing.landlord_id || '',
        branch_id: createdListing.branch_id || '',
        team_id: createdListing.team_id || '',
        assigned_broker: createdListing.broker_id || '',
        status: 'active',
        stage: 'new',
      },
    })
  }

  function renderSelect(name, label, options, placeholder = 'Select...', help = '', disabled = false) {
    return (
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
        <select
          value={values[name] || ''}
          onChange={(event) => setValue(name, event.target.value)}
          disabled={disabled}
          className={fieldClass(fieldErrors[name])}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {help ? <span className="text-xs text-slate-400">{help}</span> : null}
        {fieldErrors[name] ? <span className="text-xs font-semibold text-rose-600">{fieldErrors[name]}</span> : null}
      </label>
    )
  }

  function renderInput(field, { span = '' } = {}) {
    const type = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'
    const value = field.type === 'checkbox' ? Boolean(values[field.name]) : values[field.name] ?? ''

    return (
      <label key={field.name} className={span === 'full' || field.span === 'full' ? 'grid gap-1.5 lg:col-span-2' : 'grid gap-1.5'}>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{field.label}</span>
        {field.type === 'textarea' ? (
          <textarea
            rows={4}
            value={value}
            onChange={(event) => setValue(field.name, event.target.value)}
            className={`${fieldClass(fieldErrors[field.name])} py-3`}
          />
        ) : field.type === 'checkbox' ? (
          <span className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => setValue(field.name, event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Yes
          </span>
        ) : field.type === 'select' ? (
          <select
            value={values[field.name] || ''}
            onChange={(event) => setValue(field.name, event.target.value)}
            className={fieldClass(fieldErrors[field.name])}
          >
            <option value="">Select...</option>
            {((field.optionsFrom === 'vacancies' ? vacancyOptions : lookups[field.optionsFrom]) || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            step={field.type === 'number' ? 'any' : undefined}
            value={value}
            onChange={(event) => setValue(field.name, event.target.value)}
            className={fieldClass(fieldErrors[field.name])}
          />
        )}
        {field.suffix ? <span className="text-xs text-slate-400">{field.suffix}</span> : null}
        {field.required && !fieldErrors[field.name] ? <span className="text-xs text-slate-400">Required</span> : null}
        {fieldErrors[field.name] ? <span className="text-xs font-semibold text-rose-600">{fieldErrors[field.name]}</span> : null}
      </label>
    )
  }

  function renderIntentStep() {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {LISTING_INTENT_OPTIONS.map((option) => {
          const Icon = INTENT_ICONS[option.value]
          const selected = values.listing_intent === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setValue('listing_intent', option.value)}
              className={`rounded-2xl border p-5 text-left transition ${selected ? 'border-[#102b46] bg-[#eef5fb]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-[#102b46] text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon size={18} />
              </span>
              <p className="mt-4 text-base font-semibold text-[#102236]">{option.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
            </button>
          )
        })}
        {fieldErrors.listing_intent ? <p className="text-sm font-semibold text-rose-600">{fieldErrors.listing_intent}</p> : null}
      </div>
    )
  }

  function renderCategoryStep() {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {PROPERTY_CATEGORY_OPTIONS.map((option) => {
          const Icon = CATEGORY_ICONS[option.value]
          const selected = values.property_category === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setValue('property_category', option.value)}
              className={`rounded-2xl border p-5 text-left transition ${selected ? 'border-[#102b46] bg-[#eef5fb]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-[#102b46] text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon size={18} />
              </span>
              <p className="mt-4 text-base font-semibold text-[#102236]">{option.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{option.description}</p>
            </button>
          )
        })}
        {fieldErrors.property_category ? <p className="text-sm font-semibold text-rose-600">{fieldErrors.property_category}</p> : null}
      </div>
    )
  }

  function renderPropertyStep() {
    return (
      <div className="grid gap-4">
        <SectionCard title="Property Link" description="Choose an existing property or capture a new one for this listing.">
          <div className="grid gap-4">
            <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
              {[
                { value: 'existing', label: 'Link Existing' },
                { value: 'new', label: 'Create New' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('property_link_mode', option.value)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${values.property_link_mode === option.value ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {values.property_link_mode === 'existing' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {renderSelect('property_id', 'Property', propertyOptions, 'Select property...')}
                {renderSelect('landlord_id', 'Landlord / owner', lookups.landlords || [], 'Select landlord...')}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {renderInput({ name: 'new_property_name', label: 'Property name' })}
                {renderSelect('landlord_id', 'Landlord / owner', lookups.landlords || [], 'Select landlord...')}
                <div className="lg:col-span-2">
                  <CommercialAddressField
                    mode="full_address"
                    value={values.new_property_address_value || buildManualCommercialAddressValue(values.new_property_address)}
                    placeholder="Start typing the property address..."
                    description="Select a Google Places result to fill suburb, city, province, postal code, and map data. Manual entries are allowed."
                    error={fieldErrors.new_property_address}
                    onChange={setNewPropertyAddress}
                    onManualInput={setNewPropertyAddress}
                  />
                </div>
                {renderInput({ name: 'new_property_suburb', label: 'Suburb' })}
                {renderInput({ name: 'new_property_city', label: 'City' })}
                {renderInput({ name: 'new_property_province', label: 'Province' })}
                {renderInput({ name: 'new_property_country', label: 'Country' })}
              </div>
            )}
            {propertyPreview ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                <p className="font-semibold text-[#102236]">{propertyPreview.property_name}</p>
                <p className="mt-1">{[propertyPreview.address, propertyPreview.suburb, propertyPreview.city, propertyPreview.province].filter(Boolean).join(', ') || 'Location pending'}</p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Ownership & Assignment" description="This keeps the new listing routed correctly through the commercial workspace.">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderSelect('broker_id', 'Assigned broker', lookups.brokers || [], 'Select broker...')}
            {renderSelect('branch_id', 'Branch / office', lookups.branches || [], 'Select branch...')}
            {renderSelect('team_id', 'Team', lookups.teams || [], 'Select team...')}
            {renderInput({ name: 'new_landlord_name', label: 'New landlord / owner name' })}
            {renderInput({ name: 'new_landlord_contact', label: 'New landlord contact' })}
          </div>
        </SectionCard>
      </div>
    )
  }

  function renderDetailsStep() {
    return (
      <div className="grid gap-4">
        <SectionCard title="Listing Details" description="Capture the essentials first, then the property-specific commercial context.">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderInput({ name: 'title', label: 'Listing title' })}
            {renderSelect('listing_status', 'Listing status', listingStatusOptions(values.listing_intent), 'Select status...')}
            {renderSelect('visibility', 'Visibility', VISIBILITY_OPTIONS, 'Select visibility...')}
            {renderInput({ name: 'description', label: 'Description', type: 'textarea', span: 'full' }, { span: 'full' })}
            {renderInput({ name: 'featured', label: 'Featured', type: 'checkbox' })}
          </div>
        </SectionCard>

        <SectionCard
          title={`${optionLabel(PROPERTY_CATEGORY_OPTIONS, values.property_category, 'Commercial')} Details`}
          description="Only the fields that matter for this property category are shown here."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {categoryFields.map((field) => renderInput(field))}
          </div>
        </SectionCard>
      </div>
    )
  }

  function renderTermsStep() {
    return (
      <div className="grid gap-4">
        <SectionCard
          title={values.listing_intent === 'sale' ? 'Sale Details' : 'Lease Terms'}
          description={values.listing_intent === 'sale'
            ? 'Capture the disposal and investment inputs that make this sales listing usable from day one.'
            : 'Capture vacancy, rental, and occupation details for the leasing workflow.'}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {termFields.map((field) => renderInput(field))}
          </div>
          {vacancyPreview ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p className="font-semibold text-[#102236]">{vacancyPreview.vacancy_name || 'Linked vacancy'}</p>
              <p className="mt-1">{[vacancyPreview.unit_or_floor, vacancyPreview.available_area_m2 ? `${vacancyPreview.available_area_m2}m2` : '', vacancyPreview.availability_date].filter(Boolean).join(' · ') || 'Existing vacancy details will be reused.'}</p>
            </div>
          ) : null}
        </SectionCard>
      </div>
    )
  }

  function renderMediaStep() {
    return (
      <div className="grid gap-4">
        <SectionCard title="Media" description="Capture what is already available now. More assets can still be added after creation.">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderInput({ name: 'photo_urls', label: 'Photo links', type: 'textarea', span: 'full' }, { span: 'full' })}
            {renderInput({ name: 'brochure_url', label: 'Brochure link' })}
            {renderInput({ name: 'floor_plan_url', label: 'Floor plan link' })}
          </div>
        </SectionCard>

        <SectionCard title="Documents & Notes" description="Keep supporting material and internal context close to the listing from the start.">
          <div className="grid gap-4 lg:grid-cols-2">
            {renderInput({ name: 'supporting_document_urls', label: 'Supporting document links', type: 'textarea', span: 'full' }, { span: 'full' })}
            {renderInput({ name: 'internal_notes', label: 'Internal notes', type: 'textarea', span: 'full' }, { span: 'full' })}
          </div>
        </SectionCard>
      </div>
    )
  }

  function renderReviewStep() {
    return (
      <div className="grid gap-4">
        {reviewSections.map((section) => (
          <SectionCard key={section.id} title={section.title}>
            <dl className="grid gap-3 lg:grid-cols-2">
              {section.rows.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        ))}
      </div>
    )
  }

  function renderSuccessState() {
    return (
      <div className="grid gap-5 p-5">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Check size={18} />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-[#102236]">Listing Created</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {createdListing?.title || 'Your commercial listing'} is now in the workspace with the commercial flow context saved.
          </p>
        </div>

        <SectionCard title="Next Actions">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => goToPath(`/commercial/listings/${createdListing.id}`)} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              View Listing
            </button>
            <button type="button" onClick={() => goToPath(`/commercial/listings/${createdListing.id}?tab=documents`)} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Add Images
            </button>
            <button type="button" onClick={createDealDraft} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Create Deal
            </button>
            <button type="button" onClick={resetWizard} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Create Another Listing
            </button>
            {values.listing_intent === 'lease' && createdListing?.vacancy_id ? (
              <button type="button" onClick={() => goToPath(`/commercial/vacancies/${createdListing.vacancy_id}`)} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                View Vacancy
              </button>
            ) : null}
            {createdListing?.property_id ? (
              <button type="button" onClick={() => goToPath(`/commercial/properties/${createdListing.property_id}`)} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                View Property
              </button>
            ) : null}
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={submit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Create Listing</p>
            <h2 className="mt-1 text-xl font-semibold text-[#102236]">Commercial new listing flow</h2>
            {!createdListing ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {steps.map((step, index) => (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${stepIndex >= index ? 'bg-[#102b46] text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {stepIndex > index ? <Check size={13} /> : index + 1}
                    {step.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        {createdListing ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{renderSuccessState()}</div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

              {stepIndex === 0 ? renderIntentStep() : null}
              {stepIndex === 1 ? renderCategoryStep() : null}
              {stepIndex === 2 ? renderPropertyStep() : null}
              {stepIndex === 3 ? renderDetailsStep() : null}
              {stepIndex === 4 ? renderTermsStep() : null}
              {stepIndex === 5 ? renderMediaStep() : null}
              {stepIndex === 6 ? renderReviewStep() : null}
            </div>

            <footer className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-slate-200 p-5">
              <button type="button" onClick={stepIndex === 0 ? onClose : previousStep} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <ArrowLeft size={15} />
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </button>
              {stepIndex < steps.length - 1 ? (
                <button type="button" onClick={nextStep} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                  Continue
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Creating...' : 'Create listing'}
                </button>
              )}
            </footer>
          </>
        )}
      </form>
    </div>
  )
}

export default CommercialListingWizard
