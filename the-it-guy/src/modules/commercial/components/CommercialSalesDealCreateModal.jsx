import { AlertCircle, Building2, Check, ClipboardList, DollarSign, FileText, Handshake, Home, Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  createCommercialCompany,
  createCommercialLandlord,
  createCommercialProperty,
  resolveCommercialOrganisationContext,
} from '../services/commercialApi'

const DEAL_TYPE_OPTIONS = [
  { value: 'sale', label: 'Sale' },
]

const STAGE_OPTIONS = [
  { value: 'matched', label: 'Matched' },
  { value: 'viewing_scheduled', label: 'Viewing Scheduled' },
  { value: 'offer_submitted', label: 'Offer Submitted' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'otp_drafting', label: 'OTP Drafting' },
  { value: 'otp_signed', label: 'OTP Signed' },
  { value: 'finance', label: 'Finance' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'registered', label: 'Registered' },
  { value: 'lost', label: 'Lost' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'lost', label: 'Lost' },
  { value: 'registered', label: 'Registered' },
]

const FUNDING_STATUS_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bond_required', label: 'Bond Required' },
  { value: 'pre_approved', label: 'Pre-approved' },
  { value: 'finance_pending', label: 'Finance Pending' },
  { value: 'unknown', label: 'Unknown' },
]

const SOURCE_OPTIONS = [
  { value: 'manual_override', label: 'Manual Override' },
  { value: 'lead_conversion', label: 'Lead Conversion' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'portal_enquiry', label: 'Portal Enquiry' },
  { value: 'email_campaign', label: 'Email Campaign' },
  { value: 'existing_relationship', label: 'Existing Relationship' },
  { value: 'walk_in', label: 'Walk-In' },
  { value: 'other', label: 'Other' },
]

const ASSET_CLASS_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'office', label: 'Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed-use' },
  { value: 'agricultural', label: 'Agricultural' },
]

const SECTIONS = [
  { id: 'basics', label: 'Deal Basics', detail: 'Basic deal information and stage', icon: FileText },
  { id: 'buyer', label: 'Buyer / Requirement', detail: 'Link the buyer and their requirement', icon: UserRound },
  { id: 'property', label: 'Property / Listing', detail: 'Link the property listing and seller', icon: Building2 },
  { id: 'commercials', label: 'Commercials', detail: 'Sale price, commission and close details', icon: DollarSign },
  { id: 'ownership', label: 'Internal Ownership', detail: 'Ownership, source and notes', icon: UsersRound },
]

const INITIAL_VALUES = {
  deal_name: '',
  deal_type: 'sale',
  stage: 'matched',
  status: 'active',
  assigned_broker: '',
  company_id: '',
  contact_id: '',
  requirement_id: '',
  funding_status: 'unknown',
  property_id: '',
  listing_id: '',
  seller_id: '',
  formatted_address: '',
  deal_value: '',
  estimated_commission: '',
  expected_close_date: '',
  probability_percentage: '',
  branch_id: '',
  team_id: '',
  source: 'manual_override',
  notes: '',
}

const INITIAL_NEW_BUYER = {
  company_name: '',
  contact_person: '',
  phone: '',
  email: '',
}

const INITIAL_MANUAL_PROPERTY = {
  property_name: '',
  formatted_address: '',
  area_node: '',
  asset_class: '',
  seller_id: '',
  seller_name: '',
}

const EMPTY_ARRAY = []

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
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

function listingLabel(row = {}) {
  return [row.title || 'Unnamed sales listing', row.listing_status].filter(Boolean).join(' - ')
}

function addressFor(row = {}) {
  return row.formatted_address || row.street_address || row.address || [row.suburb, row.city].filter(Boolean).join(', ')
}

function isSalesListing(row = {}) {
  const listingType = normalizeLower(row.listing_type)
  const category = normalizeLower(row.listing_category)
  const title = normalizeLower(row.title)
  if (!listingType && !category && !title) return true
  return [listingType, category, title].some((value) => value.includes('sale') || value.includes('sell') || value.includes('disposal'))
}

function isBuyerRequirement(row = {}) {
  const type = normalizeLower(row.requirement_type)
  const clientType = normalizeLower(row.client_type)
  return clientType.includes('buyer') || ['purchase', 'sale', 'investment'].some((value) => type.includes(value))
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

function CommercialSalesDealCreateModal({ open, lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [newBuyerOpen, setNewBuyerOpen] = useState(false)
  const [newBuyer, setNewBuyer] = useState(INITIAL_NEW_BUYER)
  const [manualPropertyOpen, setManualPropertyOpen] = useState(false)
  const [manualProperty, setManualProperty] = useState(INITIAL_MANUAL_PROPERTY)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  const properties = useMemo(() => rawLookups.properties || EMPTY_ARRAY, [rawLookups.properties])
  const listings = useMemo(() => rawLookups.listings || EMPTY_ARRAY, [rawLookups.listings])
  const requirements = useMemo(() => rawLookups.requirements || EMPTY_ARRAY, [rawLookups.requirements])
  const selectedProperty = useMemo(
    () => properties.find((property) => String(property.id) === String(values.property_id)) || null,
    [properties, values.property_id],
  )
  const salesListings = useMemo(
    () => listings
      .filter(isSalesListing)
      .filter((listing) => !values.property_id || String(listing.property_id || '') === String(values.property_id))
      .map((listing) => ({ value: listing.id, label: listingLabel(listing), row: listing })),
    [listings, values.property_id],
  )
  const allSalesListings = useMemo(
    () => listings.filter(isSalesListing).map((listing) => ({ value: listing.id, label: listingLabel(listing), row: listing })),
    [listings],
  )
  const selectedListing = useMemo(
    () => allSalesListings.find((option) => String(option.value) === String(values.listing_id)) || null,
    [allSalesListings, values.listing_id],
  )
  const buyerRequirements = useMemo(
    () => requirements.filter(isBuyerRequirement).map((row) => ({ value: row.id, label: row.requirement_name || 'Buyer requirement' })),
    [requirements],
  )
  const buyerName = values.company_id
    ? optionLabel(lookups.companies, values.company_id)
    : normalizeText(newBuyer.company_name)
  const notesCount = values.notes.length

  useEffect(() => {
    if (!open || values.assigned_broker) return
    let cancelled = false
    async function resolveBrokerDefault() {
      try {
        const context = await resolveCommercialOrganisationContext()
        const userId = context.userId || ''
        if (!userId || cancelled) return
        const brokerOption = (lookups.brokers || []).find((option) => String(option.value) === String(userId))
        if (brokerOption?.value) {
          setValues((current) => current.assigned_broker ? current : { ...current, assigned_broker: brokerOption.value })
        }
      } catch {
        // Broker defaults are a convenience only; missing context should not block manual capture.
      }
    }
    void resolveBrokerDefault()
    return () => {
      cancelled = true
    }
  }, [lookups.brokers, open, values.assigned_broker])

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
      listing_id: '',
      seller_id: property?.landlord_id || current.seller_id,
      formatted_address: addressFor(property) || current.formatted_address,
    }))
  }

  function handleListingChange(listingId) {
    const option = allSalesListings.find((item) => String(item.value) === String(listingId))
    const listing = option?.row || {}
    const property = properties.find((row) => String(row.id) === String(listing.property_id || ''))
    setValues((current) => ({
      ...current,
      listing_id: listingId,
      property_id: listing.property_id || current.property_id,
      seller_id: listing.landlord_id || property?.landlord_id || current.seller_id,
      formatted_address: addressFor(listing) || addressFor(property) || current.formatted_address,
    }))
  }

  function validate() {
    const nextErrors = {}
    if (!normalizeText(values.deal_name)) nextErrors.deal_name = 'Deal name is required.'
    if (!normalizeText(values.deal_type)) nextErrors.deal_type = 'Deal type is required.'
    if (!normalizeText(values.stage)) nextErrors.stage = 'Stage is required.'
    if (!normalizeText(values.status)) nextErrors.status = 'Status is required.'
    if (!normalizeText(values.assigned_broker)) nextErrors.assigned_broker = 'Assigned broker is required.'
    if (!values.company_id && !normalizeText(newBuyer.company_name)) nextErrors.company_id = 'Select or create a buyer/company.'
    if (!normalizeText(values.deal_value)) nextErrors.deal_value = 'Sale price is required.'
    if (!normalizeText(values.expected_close_date)) nextErrors.expected_close_date = 'Expected close date is required.'

    if (!values.listing_id) {
      if (!normalizeText(manualProperty.formatted_address) && !normalizeText(values.formatted_address)) nextErrors.manual_property_address = 'Property address is required without a sales listing.'
      if (!normalizeText(manualProperty.asset_class)) nextErrors.manual_asset_class = 'Asset class is required without a sales listing.'
      if (!normalizeText(manualProperty.seller_id) && !normalizeText(manualProperty.seller_name) && !normalizeText(values.seller_id)) nextErrors.manual_seller = 'Seller / owner is required without a sales listing.'
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
      let companyId = values.company_id
      let propertyId = values.property_id
      let sellerId = values.seller_id || manualProperty.seller_id
      let formattedAddress = values.formatted_address || manualProperty.formatted_address

      if (!companyId && normalizeText(newBuyer.company_name)) {
        const company = await createCommercialCompany({
          organisation_id: context.organisationId,
          branch_id: values.branch_id || null,
          team_id: values.team_id || null,
          broker_id: values.assigned_broker,
          company_name: normalizeText(newBuyer.company_name),
          phone: normalizeText(newBuyer.phone),
          email: normalizeText(newBuyer.email),
          company_type: 'buyer',
          status: 'active',
          notes: 'Created inline from sales deal capture.',
        })
        companyId = company?.id || ''
      }

      if (!sellerId && normalizeText(manualProperty.seller_name)) {
        const seller = await createCommercialLandlord({
          organisation_id: context.organisationId,
          branch_id: values.branch_id || null,
          team_id: values.team_id || null,
          broker_id: values.assigned_broker,
          name: normalizeText(manualProperty.seller_name),
          landlord_type: 'seller',
          status: 'active',
          notes: 'Created inline as seller / owner from sales deal capture.',
        })
        sellerId = seller?.id || ''
      }

      if (!propertyId && manualPropertyOpen && normalizeText(manualProperty.property_name || manualProperty.formatted_address)) {
        const property = await createCommercialProperty({
          organisation_id: context.organisationId,
          branch_id: values.branch_id || null,
          team_id: values.team_id || null,
          broker_id: values.assigned_broker,
          landlord_id: sellerId || null,
          property_name: normalizeText(manualProperty.property_name) || normalizeText(manualProperty.formatted_address),
          property_type: manualProperty.asset_class || 'commercial',
          address: normalizeText(manualProperty.formatted_address),
          formatted_address: normalizeText(manualProperty.formatted_address),
          suburb: normalizeText(manualProperty.area_node),
          status: 'active',
          notes: 'Captured manually from sales deal creation.',
        })
        propertyId = property?.id || ''
        formattedAddress = property?.formatted_address || manualProperty.formatted_address || formattedAddress
      }

      const notes = [
        normalizeText(values.notes),
        `Creation Source: Manual Override`,
        values.source ? `Source: ${optionLabel(SOURCE_OPTIONS, values.source)}` : '',
        values.funding_status ? `Funding Status: ${optionLabel(FUNDING_STATUS_OPTIONS, values.funding_status)}` : '',
        !values.company_id && normalizeText(newBuyer.company_name) ? `Inline buyer: ${normalizeText(newBuyer.company_name)}` : '',
        normalizeText(newBuyer.contact_person) ? `Buyer contact person: ${normalizeText(newBuyer.contact_person)}` : '',
        !values.listing_id && normalizeText(manualProperty.asset_class) ? `Manual asset class: ${optionLabel(ASSET_CLASS_OPTIONS, manualProperty.asset_class, manualProperty.asset_class)}` : '',
        !values.listing_id && normalizeText(manualProperty.area_node) ? `Area / Node: ${normalizeText(manualProperty.area_node)}` : '',
      ].filter(Boolean).join('\n\n')

      const payload = {
        deal_name: normalizeText(values.deal_name),
        deal_type: 'sale',
        stage: values.stage,
        status: values.status,
        assigned_broker: values.assigned_broker,
        broker_id: values.assigned_broker,
        company_id: companyId || null,
        contact_id: values.contact_id || null,
        requirement_id: values.requirement_id || null,
        tenant_id: null,
        landlord_id: sellerId || selectedListing?.row?.landlord_id || selectedProperty?.landlord_id || null,
        property_id: propertyId || selectedListing?.row?.property_id || null,
        listing_id: values.listing_id || null,
        vacancy_id: null,
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
      setNewBuyer(INITIAL_NEW_BUYER)
      setManualProperty(INITIAL_MANUAL_PROPERTY)
      setNewBuyerOpen(false)
      setManualPropertyOpen(false)
      onClose()
    } catch (error) {
      setSubmitError(error?.message || 'The sales deal could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const complete = {
    basics: values.deal_name && values.deal_type && values.stage && values.status && values.assigned_broker,
    buyer: values.company_id || newBuyer.company_name,
    property: values.listing_id || (manualProperty.formatted_address && manualProperty.asset_class && (manualProperty.seller_id || manualProperty.seller_name || values.seller_id)),
    commercials: values.deal_value && values.expected_close_date,
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
              <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">Create Sales Deal</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Capture a deal directly when it did not originate from lead conversion.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-[#102236] transition hover:bg-slate-50" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[285px_minmax(0,1fr)]">
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
              <p className="mt-3 text-sm leading-6 text-[#526b86]">Sales deals are normally created from a buyer or seller lead. Use this form only when the lead process was skipped.</p>
              <div className="mt-4 border-t border-blue-100 pt-4 text-sm font-semibold text-[#102236]">
                Primary workflow
                <div className="mt-3 grid gap-1 text-center text-sm font-medium text-[#60758d]">
                  <span>Canvassing</span>
                  <span>↓</span>
                  <span>Lead</span>
                  <span>↓</span>
                  <span>Sales Deal</span>
                  <span>↓</span>
                  <span>Transaction</span>
                  <span>↓</span>
                  <span>Registration</span>
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
                  <Input value={values.deal_name} onChange={(event) => updateValue('deal_name', event.target.value)} placeholder="e.g. ABC Investments - Sandton Office Block" />
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
              <SectionTitle number="2" icon={UserRound} title="Buyer / Requirement" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Buyer / Company" required error={errors.company_id}>
                  <div className="relative">
                    <Select value={values.company_id} onChange={(event) => updateValue('company_id', event.target.value)} disabled={newBuyerOpen && Boolean(newBuyer.company_name)}>
                      <option value="">Search buyer or create new...</option>
                      {(lookups.companies || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                  <button type="button" onClick={() => setNewBuyerOpen((current) => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-[#0b65d8] transition hover:bg-blue-100">
                    <Plus size={16} />
                    Create new buyer
                  </button>
                  {newBuyerOpen ? (
                    <div className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-2">
                      <Field label="Buyer / Company Name" required>
                        <Input value={newBuyer.company_name} onChange={(event) => setNewBuyer((current) => ({ ...current, company_name: event.target.value }))} placeholder="e.g. ABC Investments" />
                      </Field>
                      <Field label="Contact Person">
                        <Input value={newBuyer.contact_person} onChange={(event) => setNewBuyer((current) => ({ ...current, contact_person: event.target.value }))} placeholder="e.g. John Smith" />
                      </Field>
                      <Field label="Contact Number">
                        <Input value={newBuyer.phone} onChange={(event) => setNewBuyer((current) => ({ ...current, phone: event.target.value }))} placeholder="e.g. 082 123 4567" />
                      </Field>
                      <Field label="Email Address">
                        <Input type="email" value={newBuyer.email} onChange={(event) => setNewBuyer((current) => ({ ...current, email: event.target.value }))} placeholder="e.g. buyer@company.co.za" />
                      </Field>
                    </div>
                  ) : null}
                </div>
                <Field label="Linked Buyer Requirement">
                  <Select value={values.requirement_id} onChange={(event) => updateValue('requirement_id', event.target.value)}>
                    <option value="">Select buyer requirement (optional)</option>
                    {buyerRequirements.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Funding Status">
                  <Select value={values.funding_status} onChange={(event) => updateValue('funding_status', event.target.value)}>
                    {FUNDING_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="border-b border-slate-200 py-6">
              <SectionTitle number="3" icon={Building2} title="Property / Listing" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Linked Property">
                  <Select value={values.property_id} onChange={(event) => handlePropertyChange(event.target.value)} disabled={manualPropertyOpen && Boolean(manualProperty.property_name)}>
                    <option value="">Select property...</option>
                    {properties.map((property) => <option key={property.id} value={property.id}>{propertyLabel(property)}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Sales Listing" required>
                  <Select value={values.listing_id} onChange={(event) => handleListingChange(event.target.value)} disabled={manualPropertyOpen && !values.property_id}>
                    <option value="">Select listing...</option>
                    {(values.property_id ? salesListings : allSalesListings).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Seller" error={errors.manual_seller}>
                  <Select value={values.seller_id || manualProperty.seller_id} onChange={(event) => {
                    updateValue('seller_id', event.target.value)
                    setManualProperty((current) => ({ ...current, seller_id: event.target.value }))
                  }} disabled={Boolean(values.listing_id)}>
                    <option value="">{values.seller_id ? optionLabel(lookups.landlords, values.seller_id, 'Linked seller') : 'Auto-filled from listing'}</option>
                    {(lookups.landlords || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Property Address" error={errors.manual_property_address}>
                  <Input value={values.formatted_address} onChange={(event) => updateValue('formatted_address', event.target.value)} placeholder="Auto-filled from property" readOnly={Boolean(values.listing_id)} className={values.listing_id ? 'bg-slate-50 text-slate-500' : ''} />
                </Field>
                <div className="lg:col-span-2">
                  <button type="button" onClick={() => setManualPropertyOpen((current) => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-[#0b65d8] transition hover:bg-blue-100">
                    <Plus size={16} />
                    Capture property manually
                  </button>
                  {manualPropertyOpen ? (
                    <div className="mt-3 grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 lg:grid-cols-2">
                      <Field label="Property Name">
                        <Input value={manualProperty.property_name} onChange={(event) => setManualProperty((current) => ({ ...current, property_name: event.target.value }))} placeholder="e.g. Sandton Office Block" />
                      </Field>
                      <Field label="Property Address" required error={errors.manual_property_address}>
                        <Input value={manualProperty.formatted_address} onChange={(event) => setManualProperty((current) => ({ ...current, formatted_address: event.target.value }))} placeholder="Street, suburb or node" />
                      </Field>
                      <Field label="Area / Node">
                        <Input value={manualProperty.area_node} onChange={(event) => setManualProperty((current) => ({ ...current, area_node: event.target.value }))} placeholder="e.g. Sandton" />
                      </Field>
                      <Field label="Asset Class" required error={errors.manual_asset_class}>
                        <Select value={manualProperty.asset_class} onChange={(event) => setManualProperty((current) => ({ ...current, asset_class: event.target.value }))}>
                          <option value="">Select asset class...</option>
                          {ASSET_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Seller / Owner" required error={errors.manual_seller}>
                        <Input value={manualProperty.seller_name} onChange={(event) => setManualProperty((current) => ({ ...current, seller_name: event.target.value, seller_id: '' }))} placeholder="e.g. ABC Properties (Pty) Ltd" />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="border-b border-slate-200 py-6">
              <SectionTitle number="4" icon={DollarSign} title="Commercials" />
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Sale Price" required error={errors.deal_value}>
                  <Input type="number" min="0" value={values.deal_value} onChange={(event) => updateValue('deal_value', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Estimated Commission">
                  <Input type="number" min="0" value={values.estimated_commission} onChange={(event) => updateValue('estimated_commission', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Expected Close Date" required error={errors.expected_close_date}>
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

            {buyerName ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <div className="flex items-start gap-3">
                  <Home size={18} className="mt-0.5 text-[#0b65d8]" />
                  <p className="text-sm leading-6 text-slate-600">
                    <span className="font-semibold text-[#102236]">{buyerName}</span> will be linked to this sales deal. Convert it to a transaction when offer acceptance, OTP and registration workflows are ready.
                  </p>
                </div>
              </div>
            ) : null}
          </main>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
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

export default CommercialSalesDealCreateModal
