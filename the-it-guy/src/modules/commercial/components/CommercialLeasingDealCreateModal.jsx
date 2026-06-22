import { AlertCircle, Building2, Check, ClipboardList, DollarSign, FileText, Handshake, Home, Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  createCommercialProperty,
  createCommercialTenant,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'

const DEAL_TYPE_OPTIONS = [
  { value: 'lease', label: 'Leasing' },
  { value: 'sale', label: 'Sale' },
]

const STAGE_OPTIONS = [
  { value: 'matched', label: 'Matched' },
  { value: 'viewing_scheduled', label: 'Viewing Scheduled' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'hot_sent', label: 'HOT Sent' },
  { value: 'hot_negotiation', label: 'HOT Negotiation' },
  { value: 'hot_accepted', label: 'HOT Accepted' },
  { value: 'lease_draft', label: 'Lease Draft' },
  { value: 'lease_signed', label: 'Lease Signed' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'lost', label: 'Lost' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'lost', label: 'Lost' },
  { value: 'converted', label: 'Converted' },
]

const SOURCE_OPTIONS = [
  { value: 'broker_referral', label: 'Broker Referral' },
  { value: 'website', label: 'Website' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'email_campaign', label: 'Email Campaign' },
  { value: 'portal_enquiry', label: 'Portal Enquiry' },
  { value: 'walk_in', label: 'Walk-In' },
  { value: 'existing_relationship', label: 'Existing Relationship' },
  { value: 'other', label: 'Other' },
]

const SECTIONS = [
  { id: 'basics', label: 'Deal Basics', detail: 'Basic deal information and stage', icon: FileText },
  { id: 'tenant', label: 'Tenant / Requirement', detail: 'Link the tenant and their requirement', icon: UserRound },
  { id: 'property', label: 'Property / Vacancy', detail: 'Link the property and vacancy/listing', icon: Building2 },
  { id: 'commercials', label: 'Commercials', detail: 'Deal value, commission and close details', icon: DollarSign },
  { id: 'ownership', label: 'Internal Ownership', detail: 'Ownership, source and notes', icon: UsersRound },
]

const INITIAL_VALUES = {
  deal_name: '',
  deal_type: 'lease',
  stage: 'matched',
  status: 'active',
  assigned_broker: '',
  tenant_id: '',
  contact_id: '',
  requirement_id: '',
  property_id: '',
  stock_link_id: '',
  landlord_id: '',
  formatted_address: '',
  deal_value: '',
  estimated_commission: '',
  expected_close_date: '',
  probability_percentage: '',
  branch_id: '',
  team_id: '',
  source: '',
  notes: '',
}

const INITIAL_NEW_TENANT = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
}

const INITIAL_MANUAL_PROPERTY = {
  property_name: '',
  formatted_address: '',
}

const EMPTY_ARRAY = []

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function optionLabel(options = [], value = '', fallback = '') {
  const match = options.find((option) => String(option.value) === String(value))
  return match?.label || fallback
}

function propertyLabel(row = {}) {
  return [row.property_name || row.name || 'Unnamed property', [row.suburb, row.city].filter(Boolean).join(', ')].filter(Boolean).join(' - ')
}

function stockLabel(row = {}, type = 'vacancy') {
  if (type === 'listing') return [row.title || 'Unnamed listing', row.listing_status].filter(Boolean).join(' - ')
  return [row.vacancy_name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' - ')
}

function addressFor(row = {}) {
  return row.formatted_address || row.street_address || row.address || [row.suburb, row.city].filter(Boolean).join(', ')
}

function Field({ label, required = false, className = '', children, error = '' }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-[#183452]">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs font-semibold text-rose-600">{error}</span> : null}
    </label>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      className={`min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition placeholder:text-slate-400 focus:border-[#8eb3d5] focus:ring-4 focus:ring-blue-50 ${props.className || ''}`}
    />
  )
}

function Select(props) {
  return (
    <select
      {...props}
      className={`min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#8eb3d5] focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-400 ${props.className || ''}`}
    />
  )
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-[#102236] outline-none transition placeholder:text-slate-400 focus:border-[#8eb3d5] focus:ring-4 focus:ring-blue-50 ${props.className || ''}`}
    />
  )
}

function SectionTitle({ number, icon, title }) {
  const IconComponent = icon
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0b65d8]">
        <IconComponent size={18} />
      </span>
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#102236]">{number}. {title}</h3>
    </div>
  )
}

function ProgressStep({ section, index, complete, current }) {
  const Icon = section.icon
  return (
    <div className="relative flex gap-3">
      {index < SECTIONS.length - 1 ? <span className="absolute left-4 top-9 h-full w-px bg-slate-200" /> : null}
      <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
        complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : current ? 'border-[#0b65d8] bg-[#0b65d8] text-white' : 'border-slate-200 bg-slate-100 text-[#36516d]'
      }`}>
        {complete ? <Check size={15} /> : index + 1}
      </span>
      <div className={`min-w-0 rounded-2xl px-3 py-2 ${current ? 'bg-[#eef5ff]' : ''}`}>
        <div className="flex items-center gap-2">
          <Icon size={15} className={current ? 'text-[#0b65d8]' : 'text-[#36516d]'} />
          <p className="text-sm font-semibold text-[#102236]">{section.label}</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{section.detail}</p>
      </div>
    </div>
  )
}

function CommercialLeasingDealCreateModal({ open, lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [newTenantOpen, setNewTenantOpen] = useState(false)
  const [newTenant, setNewTenant] = useState(INITIAL_NEW_TENANT)
  const [manualPropertyOpen, setManualPropertyOpen] = useState(false)
  const [manualProperty, setManualProperty] = useState(INITIAL_MANUAL_PROPERTY)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  const properties = useMemo(() => rawLookups.properties || EMPTY_ARRAY, [rawLookups.properties])
  const vacancies = useMemo(() => rawLookups.vacancies || EMPTY_ARRAY, [rawLookups.vacancies])
  const listings = useMemo(() => rawLookups.listings || EMPTY_ARRAY, [rawLookups.listings])
  const selectedProperty = useMemo(
    () => properties.find((property) => String(property.id) === String(values.property_id)) || null,
    [properties, values.property_id],
  )
  const stockOptions = useMemo(() => {
    const scopedVacancies = vacancies
      .filter((row) => !values.property_id || String(row.property_id || '') === String(values.property_id))
      .map((row) => ({ value: `vacancy:${row.id}`, label: stockLabel(row, 'vacancy'), row, type: 'vacancy' }))
    const scopedListings = listings
      .filter((row) => !values.property_id || String(row.property_id || '') === String(values.property_id))
      .map((row) => ({ value: `listing:${row.id}`, label: stockLabel(row, 'listing'), row, type: 'listing' }))
    return [...scopedVacancies, ...scopedListings]
  }, [listings, vacancies, values.property_id])
  const selectedStock = useMemo(
    () => stockOptions.find((option) => option.value === values.stock_link_id) || null,
    [stockOptions, values.stock_link_id],
  )
  const tenantName = values.tenant_id
    ? optionLabel(lookups.tenants, values.tenant_id)
    : normalizeText(newTenant.name)
  const notesCount = values.notes.length

  if (!open) return null

  function updateValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function handlePropertyChange(propertyId) {
    const property = properties.find((row) => String(row.id) === String(propertyId))
    setValues((current) => ({
      ...current,
      property_id: propertyId,
      stock_link_id: '',
      landlord_id: property?.landlord_id || '',
      formatted_address: addressFor(property),
    }))
  }

  function handleStockChange(stockLinkId) {
    const option = stockOptions.find((item) => item.value === stockLinkId)
    const row = option?.row || {}
    setValues((current) => ({
      ...current,
      stock_link_id: stockLinkId,
      landlord_id: row.landlord_id || selectedProperty?.landlord_id || current.landlord_id,
      formatted_address: addressFor(row) || addressFor(selectedProperty) || current.formatted_address,
    }))
  }

  function validate() {
    const nextErrors = {}
    if (!normalizeText(values.deal_name)) nextErrors.deal_name = 'Deal name is required.'
    if (!normalizeText(values.deal_type)) nextErrors.deal_type = 'Deal type is required.'
    if (!normalizeText(values.stage)) nextErrors.stage = 'Stage is required.'
    if (!normalizeText(values.status)) nextErrors.status = 'Status is required.'
    if (!normalizeText(values.assigned_broker)) nextErrors.assigned_broker = 'Assigned broker is required.'
    if (!values.tenant_id && !normalizeText(newTenant.name)) nextErrors.tenant_id = 'Select or create a tenant/company.'

    const draftMode = values.status === 'draft'
    if (!draftMode && !normalizeText(values.property_id)) nextErrors.property_id = 'Linked property is required unless this is a draft.'
    if (!draftMode && !normalizeText(values.stock_link_id)) nextErrors.stock_link_id = 'Linked vacancy or listing is required unless this is a draft.'
    if (newTenantOpen && normalizeText(newTenant.name) && !normalizeText(newTenant.phone) && !normalizeText(newTenant.email)) {
      nextErrors.new_tenant_contact = 'Add a phone or email for the new tenant.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    setSubmitError('')
    try {
      const context = await resolveCommercialOrganisationContext()
      let tenantId = values.tenant_id
      let propertyId = values.property_id
      let formattedAddress = values.formatted_address || manualProperty.formatted_address

      if (!tenantId && normalizeText(newTenant.name)) {
        const tenant = await createCommercialTenant({
          organisation_id: context.organisationId,
          branch_id: values.branch_id || null,
          team_id: values.team_id || null,
          broker_id: values.assigned_broker,
          name: normalizeText(newTenant.name),
          contact_person: normalizeText(newTenant.contact_person),
          phone: normalizeText(newTenant.phone),
          email: normalizeText(newTenant.email),
          status: 'active',
          notes: 'Created inline from leasing deal capture.',
        })
        tenantId = tenant?.id || ''
      }

      if (!propertyId && manualPropertyOpen && normalizeText(manualProperty.property_name)) {
        const property = await createCommercialProperty({
          organisation_id: context.organisationId,
          branch_id: values.branch_id || null,
          team_id: values.team_id || null,
          broker_id: values.assigned_broker,
          property_name: normalizeText(manualProperty.property_name),
          formatted_address: normalizeText(manualProperty.formatted_address),
          address: normalizeText(manualProperty.formatted_address),
          landlord_id: values.landlord_id || null,
          property_type: 'commercial',
          status: 'active',
          notes: 'Captured manually from leasing deal creation.',
        })
        propertyId = property?.id || ''
        formattedAddress = property?.formatted_address || manualProperty.formatted_address || formattedAddress
      }

      const stock = selectedStock
      const notes = [
        normalizeText(values.notes),
        values.source ? `Source: ${optionLabel(SOURCE_OPTIONS, values.source)}` : '',
        !values.tenant_id && normalizeText(newTenant.name) ? `Inline tenant: ${normalizeText(newTenant.name)}` : '',
        manualPropertyOpen && normalizeText(manualProperty.property_name) ? `Manual property: ${normalizeText(manualProperty.property_name)}` : '',
      ].filter(Boolean).join('\n\n')

      const payload = {
        deal_name: normalizeText(values.deal_name),
        deal_type: values.deal_type,
        stage: values.stage,
        status: values.status,
        assigned_broker: values.assigned_broker,
        broker_id: values.assigned_broker,
        tenant_id: tenantId || null,
        contact_id: values.contact_id || null,
        requirement_id: values.requirement_id || null,
        property_id: propertyId || null,
        vacancy_id: stock?.type === 'vacancy' ? stock.row.id : (stock?.row?.vacancy_id || null),
        listing_id: stock?.type === 'listing' ? stock.row.id : null,
        landlord_id: values.landlord_id || selectedStock?.row?.landlord_id || selectedProperty?.landlord_id || null,
        formatted_address: formattedAddress || null,
        branch_id: values.branch_id || null,
        team_id: values.team_id || null,
        deal_value: toNumber(values.deal_value),
        estimated_commission: toNumber(values.estimated_commission),
        expected_close_date: values.expected_close_date || null,
        probability_percentage: toNumber(values.probability_percentage),
        notes,
      }

      await onSubmit(payload)
      setValues(INITIAL_VALUES)
      setNewTenant(INITIAL_NEW_TENANT)
      setManualProperty(INITIAL_MANUAL_PROPERTY)
      setNewTenantOpen(false)
      setManualPropertyOpen(false)
      onClose()
    } catch (error) {
      setSubmitError(error?.message || 'The leasing deal could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const complete = {
    basics: values.deal_name && values.deal_type && values.stage && values.status && values.assigned_broker,
    tenant: values.tenant_id || newTenant.name,
    property: values.property_id && values.stock_link_id,
    commercials: values.deal_value || values.estimated_commission || values.expected_close_date,
    ownership: values.branch_id || values.team_id || values.source || values.notes,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_26px_70px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eee9ff] text-[#6d35d8]">
              <Handshake size={24} />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">Create Leasing Deal</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Capture a deal directly when it did not originate from canvassing or lead conversion.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-[#102236] transition hover:bg-slate-50" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-[#fbfdff] p-5 md:block">
            <div className="grid gap-5">
              {SECTIONS.map((section, index) => (
                <ProgressStep
                  key={section.id}
                  section={section}
                  index={index}
                  complete={Boolean(complete[section.id])}
                  current={!Object.values(complete).slice(0, index + 1).every(Boolean)}
                />
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0b65d8]">
                <AlertCircle size={16} />
                Tip
              </div>
              <p className="mt-3 text-sm leading-6 text-[#526b86]">Deals are normally created from a lead. Use this form only when the lead process was skipped.</p>
              <div className="mt-4 border-t border-blue-100 pt-4 text-sm font-semibold text-[#102236]">
                Primary workflow
                <div className="mt-3 grid gap-1 text-center text-sm font-medium text-[#60758d]">
                  <span>Canvassing</span>
                  <span>↓</span>
                  <span>Lead</span>
                  <span>↓</span>
                  <span>Convert to Deal</span>
                  <span>↓</span>
                  <span>Tenant / Lease</span>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
            {submitError ? (
              <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{submitError}</div>
            ) : null}

            <section className="border-b border-slate-200 pb-6">
              <SectionTitle number="1" icon={FileText} title="Deal Basics" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Deal Name" required error={errors.deal_name}>
                  <Input value={values.deal_name} onChange={(event) => updateValue('deal_name', event.target.value)} placeholder="e.g. ABC Consulting - Sandton Gate 500m2" />
                </Field>
                <Field label="Deal Type" required error={errors.deal_type}>
                  <Select value={values.deal_type} onChange={(event) => updateValue('deal_type', event.target.value)}>
                    {DEAL_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Stage" required error={errors.stage}>
                  <Select value={values.stage} onChange={(event) => updateValue('stage', event.target.value)}>
                    {STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Status" required error={errors.status}>
                  <Select value={values.status} onChange={(event) => updateValue('status', event.target.value)}>
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Assigned Broker" required error={errors.assigned_broker}>
                  <Select value={values.assigned_broker} onChange={(event) => updateValue('assigned_broker', event.target.value)}>
                    <option value="">Select broker...</option>
                    {(lookups.brokers || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="border-b border-slate-200 py-6">
              <SectionTitle number="2" icon={UserRound} title="Tenant / Requirement" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Tenant / Company" required error={errors.tenant_id || errors.new_tenant_contact}>
                  <div className="relative">
                    <Select value={values.tenant_id} onChange={(event) => updateValue('tenant_id', event.target.value)} disabled={newTenantOpen && Boolean(newTenant.name)}>
                      <option value="">Search tenant or create new...</option>
                      {(lookups.tenants || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                    <Search size={17} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
                  </div>
                </Field>
                <Field label="Contact">
                  <Select value={values.contact_id} onChange={(event) => updateValue('contact_id', event.target.value)}>
                    <option value="">Select contact...</option>
                    {(lookups.contacts || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <div className="lg:col-span-2">
                  <button type="button" onClick={() => setNewTenantOpen((current) => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-[#0b65d8] transition hover:bg-blue-100">
                    <Plus size={16} />
                    Create new tenant
                  </button>
                  {newTenantOpen ? (
                    <div className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-2">
                      <Field label="Tenant / Company Name" required>
                        <Input value={newTenant.name} onChange={(event) => setNewTenant((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. ABC Consulting" />
                      </Field>
                      <Field label="Contact Person">
                        <Input value={newTenant.contact_person} onChange={(event) => setNewTenant((current) => ({ ...current, contact_person: event.target.value }))} placeholder="e.g. John Smith" />
                      </Field>
                      <Field label="Contact Number">
                        <Input value={newTenant.phone} onChange={(event) => setNewTenant((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 082 123 4567" />
                      </Field>
                      <Field label="Email Address">
                        <Input type="email" value={newTenant.email} onChange={(event) => setNewTenant((current) => ({ ...current, email: event.target.value }))} placeholder="e.g. john@company.co.za" />
                      </Field>
                    </div>
                  ) : null}
                </div>
                <Field label="Linked Requirement">
                  <Select value={values.requirement_id} onChange={(event) => updateValue('requirement_id', event.target.value)}>
                    <option value="">Select requirement (optional)</option>
                    {(lookups.requirements || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="border-b border-slate-200 py-6">
              <SectionTitle number="3" icon={Building2} title="Property / Vacancy" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Linked Property" required error={errors.property_id}>
                  <Select value={values.property_id} onChange={(event) => handlePropertyChange(event.target.value)} disabled={manualPropertyOpen && Boolean(manualProperty.property_name)}>
                    <option value="">Select property...</option>
                    {properties.map((property) => <option key={property.id} value={property.id}>{propertyLabel(property)}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Vacancy / Listing" required error={errors.stock_link_id}>
                  <Select value={values.stock_link_id} onChange={(event) => handleStockChange(event.target.value)} disabled={!values.property_id}>
                    <option value="">{values.property_id ? 'Select vacancy / listing...' : 'Select property first...'}</option>
                    {stockOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Landlord">
                  <Select value={values.landlord_id} onChange={(event) => updateValue('landlord_id', event.target.value)} disabled={Boolean(values.property_id || values.stock_link_id)}>
                    <option value="">{values.landlord_id ? optionLabel(lookups.landlords, values.landlord_id, 'Linked landlord') : 'Auto-filled from vacancy'}</option>
                    {(lookups.landlords || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Property Address">
                  <Input value={values.formatted_address} onChange={(event) => updateValue('formatted_address', event.target.value)} placeholder="Auto-filled from property" />
                </Field>
                <div className="lg:col-span-2">
                  <button type="button" onClick={() => setManualPropertyOpen((current) => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-[#0b65d8] transition hover:bg-blue-100">
                    <Plus size={16} />
                    Capture property manually
                  </button>
                  {manualPropertyOpen ? (
                    <div className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-2">
                      <Field label="Property Name">
                        <Input value={manualProperty.property_name} onChange={(event) => setManualProperty((current) => ({ ...current, property_name: event.target.value }))} placeholder="e.g. Sandton Gate" />
                      </Field>
                      <Field label="Property Address">
                        <Input value={manualProperty.formatted_address} onChange={(event) => setManualProperty((current) => ({ ...current, formatted_address: event.target.value }))} placeholder="Street, suburb or node" />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="border-b border-slate-200 py-6">
              <SectionTitle number="4" icon={DollarSign} title="Commercials" />
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Deal Value">
                  <Input type="number" min="0" value={values.deal_value} onChange={(event) => updateValue('deal_value', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Estimated Commission">
                  <Input type="number" min="0" value={values.estimated_commission} onChange={(event) => updateValue('estimated_commission', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Expected Close Date">
                  <Input type="date" value={values.expected_close_date} onChange={(event) => updateValue('expected_close_date', event.target.value)} />
                </Field>
                <Field label="Probability Percentage" className="lg:col-span-2">
                  <Input type="number" min="0" max="100" value={values.probability_percentage} onChange={(event) => updateValue('probability_percentage', event.target.value)} placeholder="e.g. 75" />
                </Field>
              </div>
            </section>

            <section className="pt-6">
              <SectionTitle number="5" icon={UsersRound} title="Internal Ownership" />
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Branch / Office">
                  <Select value={values.branch_id} onChange={(event) => updateValue('branch_id', event.target.value)}>
                    <option value="">Select branch / office...</option>
                    {(lookups.branches || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Team">
                  <Select value={values.team_id} onChange={(event) => updateValue('team_id', event.target.value)}>
                    <option value="">Select team...</option>
                    {(lookups.teams || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Source / Method">
                  <Select value={values.source} onChange={(event) => updateValue('source', event.target.value)}>
                    <option value="">Select source...</option>
                    {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Notes" className="lg:col-span-3">
                  <div className="relative">
                    <Textarea maxLength={500} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} placeholder="Any additional notes..." />
                    <span className="absolute bottom-3 right-3 text-xs font-semibold text-slate-400">{notesCount}/500</span>
                  </div>
                </Field>
              </div>
            </section>

            {tenantName ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <div className="flex items-start gap-3">
                  <Home size={18} className="mt-0.5 text-[#0b65d8]" />
                  <p className="text-sm leading-6 text-slate-600">
                    <span className="font-semibold text-[#102236]">{tenantName}</span> will be linked to this leasing deal. Move the stage to Lease Signed when the deal is ready to become a tenant / lease record.
                  </p>
                </div>
              </div>
            ) : null}
          </main>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-[#0b335b] px-7 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(11,51,91,0.18)] transition hover:bg-[#0f426f] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Deal'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialLeasingDealCreateModal
