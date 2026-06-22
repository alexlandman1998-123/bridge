import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  Factory,
  MapPin,
  Save,
  Sprout,
  Store,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import CommercialAddressField from './CommercialAddressField'
import {
  buildCommercialAddressValue,
  commercialAddressDisplay,
  serializeCommercialAddressValue,
} from './commercialAddressFieldUtils'

const VACANCY_TYPES = [
  { value: 'industrial', label: 'Industrial', icon: Factory, description: 'Warehouses, factories, logistics and distribution spaces.' },
  { value: 'retail', label: 'Retail', icon: Store, description: 'Shops, centres, showrooms and retail units.' },
  { value: 'office', label: 'Office', icon: Building2, description: 'Office suites, buildings and co-working spaces.' },
  { value: 'agricultural', label: 'Agricultural', icon: Sprout, description: 'Farms, agri facilities and agricultural buildings.' },
  { value: 'other', label: 'Other', icon: ClipboardList, description: 'Specialist or mixed-use vacancy.' },
]

const STEPS = [
  { id: 'type', label: 'Vacancy Type' },
  { id: 'location', label: 'Location & Property' },
  { id: 'physical', label: 'Physical Details' },
  { id: 'terms', label: 'Rental Terms' },
  { id: 'assignment', label: 'Assignment & Status' },
  { id: 'review', label: 'Review & Create' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'available', label: 'Available' },
  { value: 'under_offer', label: 'Under Offer' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'leased', label: 'Leased' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const RENTAL_TYPE_OPTIONS = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'per_m2', label: 'Per m²' },
  { value: 'monthly_total', label: 'Monthly total' },
]

const CONDITION_OPTIONS = [
  { value: '', label: 'Select condition' },
  { value: 'white_box', label: 'White box' },
  { value: 'fitted', label: 'Fitted' },
  { value: 'shell', label: 'Shell' },
  { value: 'refurbished', label: 'Refurbished' },
  { value: 'as_is', label: 'As-is' },
]

const FOOT_TRAFFIC_OPTIONS = [
  { value: '', label: 'Select foot traffic' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'prime', label: 'Prime' },
]

const OFFICE_LAYOUT_OPTIONS = [
  { value: '', label: 'Select layout' },
  { value: 'open_plan', label: 'Open plan' },
  { value: 'cellular', label: 'Cellular offices' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'coworking', label: 'Co-working' },
]

const DEFAULT_FORM = {
  vacancy_type: '',
  property_id: '',
  landlord_id: '',
  branch_id: '',
  team_id: '',
  unit_or_floor: '',
  address_override: null,
  availability_date: '',
  available_area_m2: '',
  divisible: false,
  condition: '',
  access_notes: '',
  parking_availability: '',
  notes: '',
  asking_rental: '',
  rental_type: 'per_m2',
  operating_costs: '',
  rates: '',
  deposit: '',
  minimum_lease_term: '',
  escalation_percentage: '',
  incentives: '',
  fit_out_allowance: '',
  tenant_installation_allowance: '',
  beneficial_occupation_period: '',
  special_conditions: '',
  broker_assignment: '',
  status: 'draft',
}

const CATEGORY_DEFAULTS = {
  industrial: {
    warehouse_area_m2: '',
    office_area_m2: '',
    yard_area_m2: '',
    height_to_eaves: '',
    roller_shutter_doors: '',
    loading_bays: '',
    dock_levellers: '',
    power_supply_amps: '',
    truck_access: '',
    sprinklers: false,
    hardstand_yard: false,
    security: '',
  },
  retail: {
    trading_area_m2: '',
    storage_area_m2: '',
    shopfront_width: '',
    foot_traffic_level: '',
    anchor_tenants_nearby: '',
    signage_availability: '',
    parking_bays: '',
    backup_power: '',
    trading_hours: '',
    centre_node_name: '',
  },
  office: {
    floor_level: '',
    office_layout: '',
    number_of_offices: '',
    open_plan_area: '',
    boardrooms: '',
    kitchenette: false,
    bathrooms: '',
    parking_bays: '',
    lift_access: false,
    backup_power: '',
    fibre_internet: '',
    shared_reception: false,
  },
  agricultural: {
    land_size: '',
    under_roof_area: '',
    water_rights: '',
    irrigation: '',
    cold_storage: false,
    packhouse: false,
    power_supply: '',
    access_roads: '',
    fencing: '',
    soil_crop_suitability: '',
    staff_accommodation: false,
  },
  other: {
    custom_vacancy_description: '',
    type_specific_notes: '',
    additional_attributes: '',
  },
}

function normalizeText(value) {
  return String(value || '').trim()
}

function labelFor(options = [], value = '', fallback = '-') {
  const match = options.find((option) => String(option.value) === String(value))
  return match?.label || fallback
}

function numberOrNull(value) {
  const text = normalizeText(value)
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function getProperty(rawLookups = {}, propertyId = '') {
  return (rawLookups.properties || []).find((row) => String(row.id) === String(propertyId)) || null
}

function getInitialForm(record = {}, rawLookups = {}, lookups = {}) {
  const propertyId = normalizeText(record.property_id)
  const property = getProperty(rawLookups, propertyId)
  const broker = normalizeText(record.broker_assignment || record.broker_id) || lookups.brokers?.[0]?.value || ''
  const metadata = record.metadata_json && typeof record.metadata_json === 'object' ? record.metadata_json : {}
  return {
    ...DEFAULT_FORM,
    ...record,
    address_override: buildCommercialAddressValue(record, {}, 'formatted_address') ||
      (metadata.address_override ? buildCommercialAddressValue({ formatted_address: metadata.address_override }) : null),
    vacancy_type: record.vacancy_type || metadata.vacancy_type || '',
    property_id: propertyId,
    landlord_id: normalizeText(record.landlord_id || property?.landlord_id),
    branch_id: normalizeText(record.branch_id || property?.branch_id),
    team_id: normalizeText(record.team_id || property?.team_id),
    broker_assignment: broker,
    status: normalizeText(record.status) || 'draft',
  }
}

function mergeCategoryDefaults(type, current = {}) {
  return { ...(CATEGORY_DEFAULTS[type] || CATEGORY_DEFAULTS.other), ...current }
}

function buildVacancyName(form = {}, lookups = {}) {
  const propertyLabel = labelFor(lookups.properties || [], form.property_id, 'Vacancy')
  const propertyName = propertyLabel.split(' · ')[0] || 'Vacancy'
  const unit = normalizeText(form.unit_or_floor)
  const typeLabel = labelFor(VACANCY_TYPES, form.vacancy_type, 'Commercial')
  return [propertyName, unit, `${typeLabel} vacancy`].filter(Boolean).join(' · ')
}

const PROPERTY_ADDRESS_MAPPING = { streetAddress: 'address' }

function buildPayload(form = {}, category = {}, lookups = {}, property = null) {
  const inheritedAddress = property ? buildCommercialAddressValue(property, PROPERTY_ADDRESS_MAPPING, 'address') : null
  const addressValue = form.address_override || inheritedAddress
  const addressPayload = serializeCommercialAddressValue(addressValue)
  const physicalDetails = {
    available_area_m2: numberOrNull(form.available_area_m2),
    divisible: Boolean(form.divisible),
    condition: normalizeText(form.condition),
    access_notes: normalizeText(form.access_notes),
    parking_availability: normalizeText(form.parking_availability),
  }

  const rentalTerms = {
    asking_rental: numberOrNull(form.asking_rental),
    rental_type: normalizeText(form.rental_type),
    operating_costs: numberOrNull(form.operating_costs),
    rates: numberOrNull(form.rates),
    deposit: numberOrNull(form.deposit),
    minimum_lease_term: normalizeText(form.minimum_lease_term),
    escalation_percentage: numberOrNull(form.escalation_percentage),
    incentives: normalizeText(form.incentives),
    fit_out_allowance: numberOrNull(form.fit_out_allowance),
    tenant_installation_allowance: numberOrNull(form.tenant_installation_allowance),
    beneficial_occupation_period: normalizeText(form.beneficial_occupation_period),
    special_conditions: normalizeText(form.special_conditions),
  }

  return {
    vacancy_name: buildVacancyName(form, lookups),
    property_id: normalizeText(form.property_id),
    landlord_id: normalizeText(form.landlord_id) || null,
    branch_id: normalizeText(form.branch_id) || null,
    team_id: normalizeText(form.team_id) || null,
    unit_or_floor: normalizeText(form.unit_or_floor) || null,
    available_area_m2: numberOrNull(form.available_area_m2),
    asking_rental: numberOrNull(form.asking_rental),
    availability_date: normalizeText(form.availability_date) || null,
    broker_assignment: normalizeText(form.broker_assignment),
    status: normalizeText(form.status) || 'draft',
    incentives: normalizeText(form.incentives) || null,
    fit_out_allowance: numberOrNull(form.fit_out_allowance),
    notes: normalizeText(form.notes) || null,
    ...addressPayload,
    metadata_json: {
      vacancy_type: normalizeText(form.vacancy_type),
      address_override: commercialAddressDisplay(form.address_override) || null,
      address_source: form.address_override ? 'vacancy_override' : property?.id ? 'property' : 'manual',
      physical_details: physicalDetails,
      rental_terms: rentalTerms,
      category_attributes: category,
      source: 'guided_vacancy_create_modal',
    },
  }
}

function validateStep(stepIndex, form = {}, category = {}) {
  const errors = {}
  const step = STEPS[stepIndex]?.id
  if (step === 'type' && !normalizeText(form.vacancy_type)) errors.vacancy_type = 'Choose a vacancy type.'
  if (step === 'location') {
    if (!normalizeText(form.property_id) && !commercialAddressDisplay(form.address_override)) errors.property_id = 'Choose a property or capture an address.'
    if (!normalizeText(form.availability_date)) errors.availability_date = 'Add an availability date.'
  }
  if (step === 'physical') {
    if (normalizeText(form.available_area_m2) && !Number.isFinite(Number(form.available_area_m2))) errors.available_area_m2 = 'Available area must be a number.'
    Object.entries(category || {}).forEach(([key, value]) => {
      if (String(key).includes('_m2') || ['parking_bays', 'number_of_offices', 'boardrooms', 'bathrooms'].includes(key)) {
        if (normalizeText(value) && !Number.isFinite(Number(value))) errors[key] = 'Use a number.'
      }
    })
  }
  if (step === 'terms') {
    ;['asking_rental', 'operating_costs', 'rates', 'deposit', 'fit_out_allowance', 'tenant_installation_allowance', 'escalation_percentage'].forEach((key) => {
      if (normalizeText(form[key]) && !Number.isFinite(Number(form[key]))) errors[key] = 'Use a number.'
    })
  }
  if (step === 'assignment') {
    if (!normalizeText(form.broker_assignment)) errors.broker_assignment = 'Assign a broker before saving.'
    if (!normalizeText(form.status)) errors.status = 'Choose a status.'
  }
  if (step === 'review') {
    Object.assign(errors, validateStep(0, form, category), validateStep(1, form, category), validateStep(3, form, category), validateStep(4, form, category))
  }
  return errors
}

function FieldError({ error }) {
  if (!error) return null
  return <p className="text-xs font-semibold text-rose-600">{error}</p>
}

function FieldWrap({ label, error, children, span = '' }) {
  return (
    <label className={`grid gap-1.5 ${span === 'full' ? 'md:col-span-2' : ''}`.trim()}>
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      {children}
      <FieldError error={error} />
    </label>
  )
}

function TextInput({ value, onChange, type = 'text', placeholder = '', error = false }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      step={type === 'number' ? 'any' : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={`min-h-12 rounded-2xl border bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:ring-4 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-[#6bbf93] focus:ring-emerald-100'}`}
    />
  )
}

function SelectInput({ value, onChange, options = [], placeholder = 'Select...', error = false }) {
  return (
    <select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className={`min-h-12 rounded-2xl border bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:ring-4 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-[#6bbf93] focus:ring-emerald-100'}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

function TextArea({ value, onChange, placeholder = '', error = false }) {
  return (
    <textarea
      rows={4}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`min-h-[96px] rounded-2xl border bg-white px-3 py-3 text-sm font-medium text-[#102236] outline-none transition focus:ring-4 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-[#6bbf93] focus:ring-emerald-100'}`}
    />
  )
}

function ToggleField({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex min-h-12 items-center justify-between rounded-2xl border px-3 text-left text-sm font-semibold transition ${checked ? 'border-[#6bbf93] bg-emerald-50 text-[#0f5132]' : 'border-slate-200 bg-white text-[#102236] hover:border-emerald-200'}`}
    >
      {label}
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${checked ? 'border-[#16834f] bg-[#16834f] text-white' : 'border-slate-300 text-transparent'}`}>
        <Check size={13} />
      </span>
    </button>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</p>
    </div>
  )
}

function CommercialVacancyCreateModal({ open, record, lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [category, setCategory] = useState(CATEGORY_DEFAULTS.other)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const activeStep = STEPS[stepIndex]
  const selectedType = VACANCY_TYPES.find((type) => type.value === form.vacancy_type)
  const selectedProperty = useMemo(() => getProperty(rawLookups, form.property_id), [form.property_id, rawLookups])
  const propertyOptions = lookups.properties || []
  const landlordOptions = lookups.landlords || []
  const brokerOptions = lookups.brokers || []
  const branchOptions = lookups.branches || []
  const teamOptions = lookups.teams || []

  useEffect(() => {
    if (!open) return
    const nextForm = getInitialForm(record || {}, rawLookups, lookups)
    setForm(nextForm)
    setCategory(mergeCategoryDefaults(nextForm.vacancy_type || 'other', record?.metadata_json?.category_attributes || {}))
    setStepIndex(0)
    setErrors({})
    setSaveError('')
  }, [lookups, open, rawLookups, record])

  useEffect(() => {
    if (!selectedProperty) return
    setForm((previous) => ({
      ...previous,
      landlord_id: previous.landlord_id || selectedProperty.landlord_id || '',
      branch_id: previous.branch_id || selectedProperty.branch_id || '',
      team_id: previous.team_id || selectedProperty.team_id || '',
    }))
  }, [selectedProperty])

  if (!open) return null

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: '' }))
  }

  function updateCategory(key, value) {
    setCategory((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: '' }))
  }

  function chooseType(type) {
    updateField('vacancy_type', type)
    setCategory(mergeCategoryDefaults(type))
  }

  function goNext() {
    const nextErrors = validateStep(stepIndex, form, category)
    setErrors(nextErrors)
    setSaveError('')
    if (Object.keys(nextErrors).length) return
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))
  }

  async function submit(statusOverride = '') {
    const nextForm = statusOverride ? { ...form, status: statusOverride } : form
    const nextErrors = validateStep(5, nextForm, category)
    setErrors(nextErrors)
    setSaveError('')
    if (Object.keys(nextErrors).length) return
    try {
      setSaving(true)
      await onSubmit?.(buildPayload(nextForm, category, lookups, selectedProperty))
      onClose?.()
    } catch (error) {
      setSaveError(error?.message || 'Vacancy could not be saved. Please check the details and try again.')
    } finally {
      setSaving(false)
    }
  }

  function renderStep() {
    if (activeStep.id === 'type') {
      return (
        <section>
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#16834f]">Step 1</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">What type of vacancy are you adding?</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {VACANCY_TYPES.map((type) => {
              const Icon = type.icon
              const selected = form.vacancy_type === type.value
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => chooseType(type.value)}
                  className={`min-h-[132px] rounded-3xl border p-4 text-left transition ${selected ? 'border-[#6bbf93] bg-emerald-50 shadow-[0_18px_42px_rgba(22,131,79,0.12)]' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? 'bg-[#16834f] text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Icon size={20} />
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-[#16834f] bg-[#16834f] text-white' : 'border-slate-300 text-transparent'}`}>
                      <Check size={14} />
                    </span>
                  </div>
                  <p className="mt-4 text-base font-semibold text-[#102236]">{type.label}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{type.description}</p>
                </button>
              )
            })}
          </div>
          <FieldError error={errors.vacancy_type} />
        </section>
      )
    }

    if (activeStep.id === 'location') {
      return (
        <section>
          <StepHeading eyebrow="Step 2" title="Location & Property" copy="Anchor the vacancy to a property first, then refine the unit, landlord, and team ownership." />
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrap label="Property" error={errors.property_id}>
              <SelectInput value={form.property_id} onChange={(value) => updateField('property_id', value)} options={propertyOptions} placeholder="Select property" error={Boolean(errors.property_id)} />
            </FieldWrap>
            <FieldWrap label="Landlord">
              <SelectInput value={form.landlord_id} onChange={(value) => updateField('landlord_id', value)} options={landlordOptions} placeholder="Select landlord" />
            </FieldWrap>
            <FieldWrap label="Branch / office">
              <SelectInput value={form.branch_id} onChange={(value) => updateField('branch_id', value)} options={branchOptions} placeholder="Select branch" />
            </FieldWrap>
            <FieldWrap label="Team">
              <SelectInput value={form.team_id} onChange={(value) => updateField('team_id', value)} options={teamOptions} placeholder="Select team" />
            </FieldWrap>
            <FieldWrap label="Unit / floor / section">
              <TextInput value={form.unit_or_floor} onChange={(value) => updateField('unit_or_floor', value)} placeholder="e.g. Unit 4, Ground floor, North wing" />
            </FieldWrap>
            <FieldWrap label="Availability date" error={errors.availability_date}>
              <TextInput type="date" value={form.availability_date} onChange={(value) => updateField('availability_date', value)} error={Boolean(errors.availability_date)} />
            </FieldWrap>
            <div className="md:col-span-2">
              <CommercialAddressField
                mode="full_address"
                value={form.address_override}
                placeholder={selectedProperty ? 'Optional: search if the vacancy address differs from the property...' : 'Start typing the vacancy address...'}
                description={selectedProperty
                  ? `Inheriting: ${[selectedProperty.formatted_address || selectedProperty.address, selectedProperty.suburb, selectedProperty.city].filter(Boolean).join(', ') || 'selected property address'}`
                  : 'Use this when the property record has not been created yet. Manual entries are allowed.'}
                error={errors.property_id && !normalizeText(form.property_id) ? errors.property_id : ''}
                onChange={(value) => updateField('address_override', value)}
                onManualInput={(value) => updateField('address_override', value)}
              />
            </div>
          </div>
        </section>
      )
    }

    if (activeStep.id === 'physical') {
      return (
        <section>
          <StepHeading eyebrow="Step 3" title="Physical Details" copy="Capture the shared physical profile, then add the details that matter for this vacancy type." />
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrap label="Available area m²" error={errors.available_area_m2}>
              <TextInput type="number" value={form.available_area_m2} onChange={(value) => updateField('available_area_m2', value)} error={Boolean(errors.available_area_m2)} />
            </FieldWrap>
            <FieldWrap label="Condition">
              <SelectInput value={form.condition} onChange={(value) => updateField('condition', value)} options={CONDITION_OPTIONS} />
            </FieldWrap>
            <ToggleField checked={form.divisible} onChange={(value) => updateField('divisible', value)} label="Divisible / can be split" />
            <FieldWrap label="Parking availability">
              <TextInput value={form.parking_availability} onChange={(value) => updateField('parking_availability', value)} placeholder="e.g. 25 open bays, basement parking available" />
            </FieldWrap>
            <FieldWrap label="Access notes" span="full">
              <TextArea value={form.access_notes} onChange={(value) => updateField('access_notes', value)} placeholder="Access control, yard access, loading access, entrances, or constraints." />
            </FieldWrap>
            {renderCategoryFields()}
            <FieldWrap label="Notes" span="full">
              <TextArea value={form.notes} onChange={(value) => updateField('notes', value)} placeholder="Broker notes, owner instructions, matching guidance." />
            </FieldWrap>
          </div>
        </section>
      )
    }

    if (activeStep.id === 'terms') {
      return (
        <section>
          <StepHeading eyebrow="Step 4" title="Rental Terms" copy="Structure the economics clearly so brokers can compare and negotiate with confidence." />
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrap label="Asking rental" error={errors.asking_rental}>
              <TextInput type="number" value={form.asking_rental} onChange={(value) => updateField('asking_rental', value)} error={Boolean(errors.asking_rental)} />
            </FieldWrap>
            <FieldWrap label="Rental type">
              <SelectInput value={form.rental_type} onChange={(value) => updateField('rental_type', value)} options={RENTAL_TYPE_OPTIONS} />
            </FieldWrap>
            <FieldWrap label="Operating costs" error={errors.operating_costs}>
              <TextInput type="number" value={form.operating_costs} onChange={(value) => updateField('operating_costs', value)} error={Boolean(errors.operating_costs)} />
            </FieldWrap>
            <FieldWrap label="Rates" error={errors.rates}>
              <TextInput type="number" value={form.rates} onChange={(value) => updateField('rates', value)} error={Boolean(errors.rates)} />
            </FieldWrap>
            <FieldWrap label="Deposit" error={errors.deposit}>
              <TextInput type="number" value={form.deposit} onChange={(value) => updateField('deposit', value)} error={Boolean(errors.deposit)} />
            </FieldWrap>
            <FieldWrap label="Minimum lease term">
              <TextInput value={form.minimum_lease_term} onChange={(value) => updateField('minimum_lease_term', value)} placeholder="e.g. 36 months" />
            </FieldWrap>
            <FieldWrap label="Escalation %" error={errors.escalation_percentage}>
              <TextInput type="number" value={form.escalation_percentage} onChange={(value) => updateField('escalation_percentage', value)} error={Boolean(errors.escalation_percentage)} />
            </FieldWrap>
            <FieldWrap label="Fit-out allowance" error={errors.fit_out_allowance}>
              <TextInput type="number" value={form.fit_out_allowance} onChange={(value) => updateField('fit_out_allowance', value)} error={Boolean(errors.fit_out_allowance)} />
            </FieldWrap>
            <FieldWrap label="Tenant installation allowance" error={errors.tenant_installation_allowance}>
              <TextInput type="number" value={form.tenant_installation_allowance} onChange={(value) => updateField('tenant_installation_allowance', value)} error={Boolean(errors.tenant_installation_allowance)} />
            </FieldWrap>
            <FieldWrap label="Beneficial occupation period">
              <TextInput value={form.beneficial_occupation_period} onChange={(value) => updateField('beneficial_occupation_period', value)} placeholder="e.g. 1 month" />
            </FieldWrap>
            <FieldWrap label="Incentives" span="full">
              <TextArea value={form.incentives} onChange={(value) => updateField('incentives', value)} placeholder="Owner incentives, rent-free periods, deal sweeteners." />
            </FieldWrap>
            <FieldWrap label="Special conditions" span="full">
              <TextArea value={form.special_conditions} onChange={(value) => updateField('special_conditions', value)} placeholder="Commercial terms, exclusions, approvals, timing constraints." />
            </FieldWrap>
          </div>
        </section>
      )
    }

    if (activeStep.id === 'assignment') {
      return (
        <section>
          <StepHeading eyebrow="Step 5" title="Assignment & Status" copy="Assign ownership and choose whether this vacancy is still a draft or ready for the market." />
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrap label="Assigned broker" error={errors.broker_assignment}>
              <SelectInput value={form.broker_assignment} onChange={(value) => updateField('broker_assignment', value)} options={brokerOptions} placeholder="Select broker" error={Boolean(errors.broker_assignment)} />
            </FieldWrap>
            <FieldWrap label="Status" error={errors.status}>
              <SelectInput value={form.status} onChange={(value) => updateField('status', value)} options={STATUS_OPTIONS} placeholder="Select status" error={Boolean(errors.status)} />
            </FieldWrap>
            <FieldWrap label="Branch / office">
              <SelectInput value={form.branch_id} onChange={(value) => updateField('branch_id', value)} options={branchOptions} placeholder="Select branch" />
            </FieldWrap>
            <FieldWrap label="Team">
              <SelectInput value={form.team_id} onChange={(value) => updateField('team_id', value)} options={teamOptions} placeholder="Select team" />
            </FieldWrap>
          </div>
        </section>
      )
    }

    return (
      <section>
        <StepHeading eyebrow="Step 6" title="Review & Create" copy="Confirm the key details before creating the vacancy." />
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryItem label="Vacancy type" value={selectedType?.label} />
          <SummaryItem label="Property" value={labelFor(propertyOptions, form.property_id)} />
          <SummaryItem label="Address" value={commercialAddressDisplay(form.address_override) || [selectedProperty?.formatted_address || selectedProperty?.address, selectedProperty?.suburb, selectedProperty?.city].filter(Boolean).join(', ')} />
          <SummaryItem label="Landlord" value={labelFor(landlordOptions, form.landlord_id)} />
          <SummaryItem label="Unit / floor" value={form.unit_or_floor || 'Not specified'} />
          <SummaryItem label="Available area" value={form.available_area_m2 ? `${form.available_area_m2} m²` : 'Not specified'} />
          <SummaryItem label="Rental" value={form.asking_rental ? `${form.asking_rental} (${labelFor(RENTAL_TYPE_OPTIONS, form.rental_type, form.rental_type)})` : 'Not specified'} />
          <SummaryItem label="Availability date" value={form.availability_date} />
          <SummaryItem label="Assigned broker" value={labelFor(brokerOptions, form.broker_assignment)} />
          <SummaryItem label="Status" value={labelFor(STATUS_OPTIONS, form.status)} />
          <SummaryItem label="Key highlights" value={buildHighlights()} />
        </div>
      </section>
    )
  }

  function renderCategoryFields() {
    if (form.vacancy_type === 'industrial') {
      return (
        <>
          <CategoryNumber name="warehouse_area_m2" label="Warehouse area m²" />
          <CategoryNumber name="office_area_m2" label="Office area m²" />
          <CategoryNumber name="yard_area_m2" label="Yard area m²" />
          <CategoryText name="height_to_eaves" label="Height to eaves" />
          <CategoryText name="roller_shutter_doors" label="Roller shutter doors" />
          <CategoryText name="loading_bays" label="Loading bays" />
          <CategoryText name="dock_levellers" label="Dock levellers" />
          <CategoryText name="power_supply_amps" label="Power supply / amps" />
          <CategoryText name="truck_access" label="Truck access" />
          <ToggleField checked={Boolean(category.sprinklers)} onChange={(value) => updateCategory('sprinklers', value)} label="Sprinklers" />
          <ToggleField checked={Boolean(category.hardstand_yard)} onChange={(value) => updateCategory('hardstand_yard', value)} label="Hardstand yard" />
          <CategoryText name="security" label="Security" span="full" />
        </>
      )
    }
    if (form.vacancy_type === 'retail') {
      return (
        <>
          <CategoryNumber name="trading_area_m2" label="Trading area m²" />
          <CategoryNumber name="storage_area_m2" label="Storage area m²" />
          <CategoryText name="shopfront_width" label="Shopfront width" />
          <FieldWrap label="Foot traffic level"><SelectInput value={category.foot_traffic_level || ''} onChange={(value) => updateCategory('foot_traffic_level', value)} options={FOOT_TRAFFIC_OPTIONS} /></FieldWrap>
          <CategoryText name="anchor_tenants_nearby" label="Anchor tenants nearby" />
          <CategoryText name="signage_availability" label="Signage availability" />
          <CategoryNumber name="parking_bays" label="Parking bays" />
          <CategoryText name="backup_power" label="Generator / backup power" />
          <CategoryText name="trading_hours" label="Trading hours" />
          <CategoryText name="centre_node_name" label="Centre / node name" />
        </>
      )
    }
    if (form.vacancy_type === 'office') {
      return (
        <>
          <CategoryText name="floor_level" label="Floor level" />
          <FieldWrap label="Office layout"><SelectInput value={category.office_layout || ''} onChange={(value) => updateCategory('office_layout', value)} options={OFFICE_LAYOUT_OPTIONS} /></FieldWrap>
          <CategoryNumber name="number_of_offices" label="Number of offices" />
          <CategoryText name="open_plan_area" label="Open-plan area" />
          <CategoryNumber name="boardrooms" label="Boardrooms" />
          <ToggleField checked={Boolean(category.kitchenette)} onChange={(value) => updateCategory('kitchenette', value)} label="Kitchenette" />
          <CategoryNumber name="bathrooms" label="Bathrooms" />
          <CategoryNumber name="parking_bays" label="Parking bays" />
          <ToggleField checked={Boolean(category.lift_access)} onChange={(value) => updateCategory('lift_access', value)} label="Lift access" />
          <CategoryText name="backup_power" label="Backup power" />
          <CategoryText name="fibre_internet" label="Fibre / internet" />
          <ToggleField checked={Boolean(category.shared_reception)} onChange={(value) => updateCategory('shared_reception', value)} label="Shared reception" />
        </>
      )
    }
    if (form.vacancy_type === 'agricultural') {
      return (
        <>
          <CategoryText name="land_size" label="Land size" />
          <CategoryText name="under_roof_area" label="Under-roof area" />
          <CategoryText name="water_rights" label="Water rights" />
          <CategoryText name="irrigation" label="Irrigation" />
          <ToggleField checked={Boolean(category.cold_storage)} onChange={(value) => updateCategory('cold_storage', value)} label="Cold storage" />
          <ToggleField checked={Boolean(category.packhouse)} onChange={(value) => updateCategory('packhouse', value)} label="Packhouse" />
          <CategoryText name="power_supply" label="Power supply" />
          <CategoryText name="access_roads" label="Access roads" />
          <CategoryText name="fencing" label="Fencing" />
          <CategoryText name="soil_crop_suitability" label="Soil / crop suitability" />
          <ToggleField checked={Boolean(category.staff_accommodation)} onChange={(value) => updateCategory('staff_accommodation', value)} label="Staff accommodation" />
        </>
      )
    }
    return (
      <>
        <CategoryText name="custom_vacancy_description" label="Custom vacancy description" span="full" textarea />
        <CategoryText name="type_specific_notes" label="Use type-specific notes" span="full" textarea />
        <CategoryText name="additional_attributes" label="Flexible additional attributes" span="full" textarea />
      </>
    )
  }

  function CategoryText({ name, label, span = '', textarea = false }) {
    return (
      <FieldWrap label={label} span={span} error={errors[name]}>
        {textarea ? (
          <TextArea value={category[name] || ''} onChange={(value) => updateCategory(name, value)} error={Boolean(errors[name])} />
        ) : (
          <TextInput value={category[name] || ''} onChange={(value) => updateCategory(name, value)} error={Boolean(errors[name])} />
        )}
      </FieldWrap>
    )
  }

  function CategoryNumber({ name, label }) {
    return (
      <FieldWrap label={label} error={errors[name]}>
        <TextInput type="number" value={category[name] || ''} onChange={(value) => updateCategory(name, value)} error={Boolean(errors[name])} />
      </FieldWrap>
    )
  }

  function buildHighlights() {
    const values = Object.entries(category || {})
      .filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined)
      .slice(0, 4)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value === true ? 'Yes' : value}`)
    return values.join(' · ') || 'No type-specific highlights yet'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-0 py-0 backdrop-blur-sm sm:px-4 sm:py-5">
      <div className="flex h-[100dvh] w-full max-w-[1060px] flex-col overflow-hidden border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)] sm:h-auto sm:max-h-[calc(100dvh-40px)] sm:rounded-[28px]">
        <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#16834f]">
                  {activeStep.label} · {stepIndex + 1} of {STEPS.length}
                </span>
                {selectedType ? <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">{selectedType.label}</span> : null}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Create Vacancy</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Add available commercial space and capture the details brokers need to match tenants properly.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => submit('draft')} disabled={saving} className="hidden min-h-10 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-[#16834f] transition hover:bg-emerald-100 disabled:opacity-60 sm:inline-flex">
                <Save size={15} />
                Save Draft
              </button>
              <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Close create vacancy modal">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-6 gap-2">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => index <= stepIndex ? setStepIndex(index) : null}
                className={`h-2 rounded-full transition ${index <= stepIndex ? 'bg-[#16834f]' : 'bg-slate-200'} ${index <= stepIndex ? 'cursor-pointer' : 'cursor-default'}`}
                aria-label={step.label}
              />
            ))}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[#fbfcfb] px-5 py-5 sm:px-6">
          {saveError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</div> : null}
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.05)] sm:p-6">
            {renderStep()}
          </div>
        </main>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0 || saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => submit('draft')} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-[#16834f] transition hover:bg-emerald-100 disabled:opacity-60">
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              {stepIndex === STEPS.length - 1 ? (
                <button type="button" onClick={() => submit()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#16834f] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(22,131,79,0.22)] transition hover:bg-[#0f6b3e] disabled:opacity-60">
                  <Check size={16} />
                  {saving ? 'Creating...' : 'Create Vacancy'}
                </button>
              ) : (
                <button type="button" onClick={goNext} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#16834f] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(22,131,79,0.22)] transition hover:bg-[#0f6b3e] disabled:opacity-60">
                  Next
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function StepHeading({ eyebrow, title, copy }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-[#16834f]">{eyebrow}</p>
      <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#102236]">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{copy}</p>
    </div>
  )
}

export default CommercialVacancyCreateModal
