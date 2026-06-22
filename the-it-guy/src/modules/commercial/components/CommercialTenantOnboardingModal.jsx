import { AlertCircle, Building2, Check, ChevronDown, ChevronUp, ClipboardList, FileText, UserRound, UsersRound, X } from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { resolveCommercialAccessContext } from '../services/commercialApi'

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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending_occupation', label: 'Pending Occupation' },
  { value: 'expired', label: 'Expired' },
  { value: 'notice_given', label: 'Notice Given' },
  { value: 'renewal_pending', label: 'Renewal Pending' },
  { value: 'terminated', label: 'Vacated' },
]

const INDUSTRY_OPTIONS = [
  'Agriculture',
  'Automotive',
  'Financial Services',
  'Healthcare',
  'Industrial',
  'Logistics',
  'Manufacturing',
  'Professional Services',
  'Retail',
  'Technology',
  'Other',
].map((label) => ({ value: label.toLowerCase().replace(/\s+/g, '_'), label }))

const SECTIONS = [
  { id: 'tenant', label: 'Tenant Details', detail: 'Contact / company information', icon: UsersRound },
  { id: 'link', label: 'Property / Lease Link', detail: 'Link to property, vacancy and landlord', icon: Building2 },
  { id: 'lease', label: 'Lease Details', detail: 'Key lease and commercial terms', icon: FileText },
  { id: 'ownership', label: 'Internal Ownership', detail: 'Ownership and workflow details', icon: UserRound },
  { id: 'notes', label: 'Notes', detail: 'Additional notes and comments', icon: ClipboardList },
]

const INITIAL_VALUES = {
  tenant_id: '',
  tenant_name: '',
  contact_person: '',
  contact_number: '',
  email: '',
  registration_number: '',
  vat_number: '',
  industry: '',
  website: '',
  property_id: '',
  vacancy_id: '',
  landlord_id: '',
  deal_id: '',
  lease_start_date: '',
  lease_end_date: '',
  occupation_date: '',
  monthly_rental: '',
  status: 'active',
  rental_per_m2: '',
  escalation_percentage: '',
  deposit_amount: '',
  renewal_option: false,
  renewal_notice_date: '',
  broker_id: '',
  branch_id: '',
  team_id: '',
  source: '',
  notes: '',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSearch(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function optionLabel(options = [], value = '', fallback = '') {
  const match = options.find((option) => String(option.value) === String(value))
  return match?.label || fallback
}

function monthsBetween(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return ''
  const years = end.getFullYear() - start.getFullYear()
  const months = end.getMonth() - start.getMonth()
  const dayOffset = end.getDate() >= start.getDate() ? 0 : -1
  return Math.max(0, years * 12 + months + dayOffset)
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '0.00'
  return parsed.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getTenantArea(tenant = {}) {
  return [tenant.suburb, tenant.city].filter(Boolean).join(', ') || tenant.formatted_address || tenant.current_location || '-'
}

function getActiveLeaseCount(leases = [], tenantId = '') {
  const activeStatuses = new Set(['active', 'executed', 'renewal_pending'])
  return leases.filter((lease) => String(lease.tenant_id || '') === String(tenantId || '') && activeStatuses.has(String(lease.status || '').toLowerCase())).length
}

function buildDuplicateMatch(values, rawLookups, ignoredDuplicateId, selectedExistingTenant) {
  if (selectedExistingTenant?.id) return null
  const query = normalizeSearch(values.tenant_name)
  if (query.length < 3) return null
  return (rawLookups.tenants || []).find((tenant) => {
    if (String(tenant.id || '') === String(ignoredDuplicateId || '')) return false
    const name = normalizeSearch(tenant.name)
    return name && (name.includes(query) || query.includes(name))
  }) || null
}

function Field({ id, label, required, error, help, children, span = '' }) {
  return (
    <label className={`grid gap-1.5 ${span}`}>
      <span className="text-xs font-semibold text-[#18304a]">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {help ? <span className="text-xs text-slate-400">{help}</span> : null}
      {error ? <span id={`${id}-error`} className="text-xs font-semibold text-rose-600">{error}</span> : null}
    </label>
  )
}

function SectionTitle({ number, icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <div className="rounded-2xl bg-[#f1f6fb] p-2 text-[#133f66]">
        {createElement(Icon, { size: 18 })}
      </div>
      <h3 className="text-base font-semibold tracking-[-0.025em] text-[#102236]">{number}. {title}</h3>
    </div>
  )
}

function CommercialTenantOnboardingModal({ open, mode = 'create', lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [activeSection, setActiveSection] = useState('tenant')
  const [selectedExistingTenant, setSelectedExistingTenant] = useState(null)
  const [ignoredDuplicateId, setIgnoredDuplicateId] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const property = useMemo(
    () => (rawLookups.properties || []).find((row) => String(row.id || '') === String(values.property_id || '')) || null,
    [rawLookups.properties, values.property_id],
  )
  const filteredVacancies = useMemo(() => (
    (rawLookups.vacancies || []).filter((row) => !values.property_id || String(row.property_id || '') === String(values.property_id))
  ), [rawLookups.vacancies, values.property_id])
  const vacancy = useMemo(
    () => filteredVacancies.find((row) => String(row.id || '') === String(values.vacancy_id || '')) || null,
    [filteredVacancies, values.vacancy_id],
  )
  const leaseTermMonths = useMemo(() => monthsBetween(values.lease_start_date, values.lease_end_date), [values.lease_start_date, values.lease_end_date])
  const rentableArea = toNumber(vacancy?.available_area_m2) || toNumber(property?.gla_m2)
  const calculatedRentalPerM2 = values.monthly_rental && rentableArea ? Number(values.monthly_rental) / rentableArea : null
  const duplicateMatch = useMemo(
    () => buildDuplicateMatch(values, rawLookups, ignoredDuplicateId, selectedExistingTenant),
    [ignoredDuplicateId, rawLookups, selectedExistingTenant, values],
  )

  useEffect(() => {
    if (!open) return
    let active = true
    async function loadDefaults() {
      const context = await resolveCommercialAccessContext().catch(() => null)
      const currentBroker = (lookups.brokers || []).find((broker) => String(broker.value || '') === String(context?.userId || ''))
      const brokerId = currentBroker?.value || (lookups.brokers || []).find((broker) => broker.value)?.value || ''
      if (!active) return
      setValues({
        ...INITIAL_VALUES,
        broker_id: brokerId,
        branch_id: context?.branchId || '',
        team_id: context?.teamId || '',
      })
    }
    void loadDefaults()
    setActiveSection('tenant')
    setSelectedExistingTenant(null)
    setIgnoredDuplicateId('')
    setAdvancedOpen(false)
    setErrors({})
    setSaveError('')
    setSaving(false)
    return () => {
      active = false
    }
  }, [lookups.brokers, open])

  useEffect(() => {
    const landlordId = vacancy?.landlord_id || property?.landlord_id || ''
    setValues((previous) => (
      previous.landlord_id === landlordId ? previous : { ...previous, landlord_id: landlordId }
    ))
  }, [property, vacancy])

  useEffect(() => {
    if (!values.vacancy_id) return
    const stillValid = filteredVacancies.some((row) => String(row.id || '') === String(values.vacancy_id))
    if (!stillValid) {
      setValues((previous) => ({ ...previous, vacancy_id: '' }))
    }
  }, [filteredVacancies, values.vacancy_id])

  if (!open) return null

  const sectionComplete = {
    tenant: Boolean(normalizeText(values.tenant_name) && normalizeText(values.contact_person) && normalizeText(values.contact_number) && normalizeText(values.email)),
    link: Boolean(values.property_id && values.vacancy_id && values.landlord_id),
    lease: Boolean(values.lease_start_date && values.lease_end_date && normalizeText(values.monthly_rental) && values.status),
    ownership: Boolean(values.broker_id),
    notes: Boolean(values.notes) || Boolean(values.broker_id),
  }

  function updateField(name, value) {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      if (!previous[name]) return previous
      const next = { ...previous }
      delete next[name]
      return next
    })
  }

  function selectExistingTenant(tenant) {
    setSelectedExistingTenant(tenant)
    setValues((previous) => ({
      ...previous,
      tenant_id: tenant.id || '',
      tenant_name: tenant.name || previous.tenant_name,
      contact_person: tenant.contact_person || previous.contact_person,
      contact_number: tenant.phone || previous.contact_number,
      email: tenant.email || previous.email,
      industry: tenant.industry || previous.industry,
      branch_id: tenant.branch_id || previous.branch_id,
      team_id: tenant.team_id || previous.team_id,
      broker_id: tenant.broker_id || previous.broker_id,
    }))
    setIgnoredDuplicateId(tenant.id || '')
  }

  function validate() {
    const nextErrors = {}
    if (!normalizeText(values.tenant_name)) nextErrors.tenant_name = 'Tenant name is required.'
    if (!normalizeText(values.contact_person)) nextErrors.contact_person = 'Contact person is required.'
    if (!normalizeText(values.contact_number)) nextErrors.contact_number = 'Contact number is required.'
    if (!normalizeText(values.email)) nextErrors.email = 'Email address is required.'
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) nextErrors.email = 'Enter a valid email address.'
    if (!values.property_id) nextErrors.property_id = 'Property is required.'
    if (!values.vacancy_id) nextErrors.vacancy_id = 'Vacancy / unit is required.'
    if (!values.landlord_id) nextErrors.landlord_id = 'Landlord is required.'
    if (!values.lease_start_date) nextErrors.lease_start_date = 'Lease start date is required.'
    if (!values.lease_end_date) nextErrors.lease_end_date = 'Lease end date is required.'
    if (values.lease_start_date && values.lease_end_date && new Date(values.lease_end_date) < new Date(values.lease_start_date)) nextErrors.lease_end_date = 'Lease end date must be after the start date.'
    if (!normalizeText(values.monthly_rental)) nextErrors.monthly_rental = 'Monthly rental is required.'
    if (values.monthly_rental && !Number.isFinite(Number(values.monthly_rental))) nextErrors.monthly_rental = 'Monthly rental must be a number.'
    if (!values.status) nextErrors.status = 'Status is required.'
    if (!values.broker_id) nextErrors.broker_id = 'Broker owner is required.'
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    setSaveError('')
    if (Object.keys(nextErrors).length) {
      const firstField = Object.keys(nextErrors)[0]
      if (['tenant_name', 'contact_person', 'contact_number', 'email'].includes(firstField)) setActiveSection('tenant')
      else if (['property_id', 'vacancy_id', 'landlord_id'].includes(firstField)) setActiveSection('link')
      else if (['lease_start_date', 'lease_end_date', 'monthly_rental', 'status'].includes(firstField)) setActiveSection('lease')
      else setActiveSection('ownership')
      return
    }

    try {
      setSaving(true)
      await onSubmit?.({
        ...values,
        lease_term_months: leaseTermMonths || null,
        rental_per_m2: calculatedRentalPerM2 || (values.rental_per_m2 ? Number(values.rental_per_m2) : null),
        monthly_rental: values.monthly_rental ? Number(values.monthly_rental) : null,
        escalation_percentage: values.escalation_percentage ? Number(values.escalation_percentage) : null,
        deposit_amount: values.deposit_amount ? Number(values.deposit_amount) : null,
        source_label: optionLabel(SOURCE_OPTIONS, values.source, ''),
      })
      onClose?.()
    } catch (error) {
      setSaveError(error?.message || 'Tenant could not be saved. Please check the form and try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#7aa7d8] focus:ring-4 focus:ring-[#dbeafe]'
  const disabledClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.035em] text-[#102236]">Create Tenant</h2>
            <p className="mt-1 text-sm text-slate-500">Capture tenant information and link them to a property, vacancy and lease.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-[#f8fbff] p-5 md:flex md:flex-col md:justify-between">
            <div className="relative grid gap-4">
              <div className="absolute left-[17px] top-7 h-[calc(100%-56px)] w-px bg-slate-200" />
              {SECTIONS.map((section, index) => {
                const complete = sectionComplete[section.id]
                const active = activeSection === section.id
                return (
                  <button key={section.id} type="button" onClick={() => setActiveSection(section.id)} className={`relative z-10 grid grid-cols-[36px_1fr] gap-3 rounded-2xl p-2 text-left transition ${active ? 'bg-white shadow-sm ring-1 ring-blue-100' : 'hover:bg-white/70'}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : active ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                      {complete ? <Check size={15} /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1 text-sm font-semibold ${active ? 'text-[#1267a3]' : 'text-[#203852]'}`}>
                        {createElement(section.icon, { size: 14 })}
                        {section.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{section.detail}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white p-4 text-sm text-slate-500">
              <p className="flex items-center gap-2 font-semibold text-[#1267a3]"><AlertCircle size={15} />All set?</p>
              <p className="mt-2 leading-5">Once saved, the tenant profile, lease record and occupied vacancy link are created together.</p>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto overscroll-contain p-5">
            {saveError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{saveError}</div> : null}

            <div className="grid gap-5">
              <section onFocus={() => setActiveSection('tenant')} className="grid gap-4">
                <SectionTitle number="1" icon={UsersRound} title="Tenant / Company Details" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="tenant_name" label="Tenant / Company Name" required error={errors.tenant_name}>
                    <input value={values.tenant_name} onChange={(event) => {
                      setSelectedExistingTenant(null)
                      setValues((previous) => ({ ...previous, tenant_id: '', tenant_name: event.target.value }))
                      setErrors((previous) => {
                        if (!previous.tenant_name) return previous
                        const next = { ...previous }
                        delete next.tenant_name
                        return next
                      })
                    }} placeholder="e.g. ABC Properties (Pty) Ltd" className={inputClass} />
                  </Field>
                  <Field id="contact_person" label="Contact Person" required error={errors.contact_person}>
                    <input value={values.contact_person} onChange={(event) => updateField('contact_person', event.target.value)} placeholder="e.g. John Smith" className={inputClass} />
                  </Field>
                  <Field id="contact_number" label="Contact Number" required error={errors.contact_number}>
                    <input value={values.contact_number} onChange={(event) => updateField('contact_number', event.target.value)} placeholder="e.g. 082 123 4567" className={inputClass} />
                  </Field>
                  <Field id="email" label="Email Address" required error={errors.email}>
                    <input type="email" value={values.email} onChange={(event) => updateField('email', event.target.value)} placeholder="e.g. john@abcproperties.co.za" className={inputClass} />
                  </Field>
                </div>

                {duplicateMatch ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800">Existing Tenant Found</p>
                    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-[#102236]">{duplicateMatch.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{getTenantArea(duplicateMatch)}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{getActiveLeaseCount(rawLookups.leases || [], duplicateMatch.id)} Active Leases</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => selectExistingTenant(duplicateMatch)} className="rounded-xl bg-[#102b46] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#163a5b]">View Existing</button>
                        <button type="button" onClick={() => setIgnoredDuplicateId(duplicateMatch.id || '')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">Continue Creating</button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {selectedExistingTenant ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    Using existing tenant profile: {selectedExistingTenant.name}
                  </div>
                ) : null}

                <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-4">
                  <Field id="registration_number" label="Registration Number">
                    <input value={values.registration_number} onChange={(event) => updateField('registration_number', event.target.value)} placeholder="e.g. 2015/123456/07" className={inputClass} />
                  </Field>
                  <Field id="vat_number" label="VAT Number">
                    <input value={values.vat_number} onChange={(event) => updateField('vat_number', event.target.value)} placeholder="e.g. 1234567890" className={inputClass} />
                  </Field>
                  <Field id="industry" label="Industry">
                    <select value={values.industry} onChange={(event) => updateField('industry', event.target.value)} className={inputClass}>
                      <option value="">Select...</option>
                      {INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="website" label="Website">
                    <input value={values.website} onChange={(event) => updateField('website', event.target.value)} placeholder="e.g. www.abc.co.za" className={inputClass} />
                  </Field>
                </div>
              </section>

              <section onFocus={() => setActiveSection('link')} className="grid gap-4">
                <SectionTitle number="2" icon={Building2} title="Property / Lease Link" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="property_id" label="Property" required error={errors.property_id}>
                    <select value={values.property_id} onChange={(event) => {
                      updateField('property_id', event.target.value)
                      updateField('vacancy_id', '')
                    }} className={inputClass}>
                      <option value="">Select property...</option>
                      {(lookups.properties || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="vacancy_id" label="Vacancy / Unit" required error={errors.vacancy_id}>
                    <select value={values.vacancy_id} onChange={(event) => updateField('vacancy_id', event.target.value)} className={inputClass}>
                      <option value="">Select vacancy / unit...</option>
                      {filteredVacancies.map((row) => <option key={row.id} value={row.id}>{[row.vacancy_name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' - ')}</option>)}
                    </select>
                  </Field>
                  <Field id="landlord_id" label="Landlord" required error={errors.landlord_id} help="Populated from the selected property or vacancy.">
                    <select value={values.landlord_id} disabled className={disabledClass}>
                      <option value="">{property || vacancy ? 'No landlord linked' : 'Select property and vacancy...'}</option>
                      {(lookups.landlords || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="deal_id" label="Linked Deal">
                    <select value={values.deal_id} onChange={(event) => updateField('deal_id', event.target.value)} className={inputClass}>
                      <option value="">Select deal...</option>
                      {(lookups.deals || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
              </section>

              <section onFocus={() => setActiveSection('lease')} className="grid gap-4">
                <SectionTitle number="3" icon={FileText} title="Lease Details" />
                <div className="grid gap-4 md:grid-cols-3">
                  <Field id="lease_start_date" label="Lease Start Date" required error={errors.lease_start_date}>
                    <input type="date" value={values.lease_start_date} onChange={(event) => updateField('lease_start_date', event.target.value)} className={inputClass} />
                  </Field>
                  <Field id="lease_end_date" label="Lease End Date" required error={errors.lease_end_date}>
                    <input type="date" value={values.lease_end_date} onChange={(event) => updateField('lease_end_date', event.target.value)} className={inputClass} />
                  </Field>
                  <Field id="occupation_date" label="Occupation Date">
                    <input type="date" value={values.occupation_date} onChange={(event) => updateField('occupation_date', event.target.value)} className={inputClass} />
                  </Field>
                  <Field id="monthly_rental" label="Monthly Rental" required error={errors.monthly_rental}>
                    <div className="flex min-h-11 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-[#7aa7d8] focus-within:ring-4 focus-within:ring-[#dbeafe]">
                      <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">R</span>
                      <input type="number" step="any" value={values.monthly_rental} onChange={(event) => updateField('monthly_rental', event.target.value)} placeholder="0.00" className="min-w-0 flex-1 px-3 text-sm font-medium text-[#102236] outline-none" />
                    </div>
                  </Field>
                  <Field id="lease_term_months" label="Lease Term (Months)">
                    <input value={leaseTermMonths === '' ? '' : String(leaseTermMonths)} readOnly placeholder="Calculated" className={disabledClass} />
                  </Field>
                  <Field id="status" label="Status" required error={errors.status}>
                    <select value={values.status} onChange={(event) => updateField('status', event.target.value)} className={inputClass}>
                      {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f8fbff]">
                  <button type="button" onClick={() => setAdvancedOpen((current) => !current)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#133f66]">
                    <span>Advanced Lease Terms <span className="font-medium text-slate-500">(Optional)</span></span>
                    {advancedOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </button>
                  {advancedOpen ? (
                    <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-4">
                      <Field id="rental_per_m2" label="Rental per m2">
                        <div className="flex min-h-11 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">R</span>
                          <input value={calculatedRentalPerM2 ? formatMoney(calculatedRentalPerM2) : values.rental_per_m2} onChange={(event) => updateField('rental_per_m2', event.target.value)} readOnly={Boolean(calculatedRentalPerM2)} placeholder="0.00" className={`min-w-0 flex-1 px-3 text-sm font-medium outline-none ${calculatedRentalPerM2 ? 'bg-slate-50 text-slate-500' : 'text-[#102236]'}`} />
                        </div>
                      </Field>
                      <Field id="escalation_percentage" label="Escalation Percentage">
                        <input type="number" step="any" value={values.escalation_percentage} onChange={(event) => updateField('escalation_percentage', event.target.value)} placeholder="0" className={inputClass} />
                      </Field>
                      <Field id="deposit_amount" label="Deposit Amount">
                        <div className="flex min-h-11 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-[#7aa7d8] focus-within:ring-4 focus-within:ring-[#dbeafe]">
                          <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">R</span>
                          <input type="number" step="any" value={values.deposit_amount} onChange={(event) => updateField('deposit_amount', event.target.value)} placeholder="0.00" className="min-w-0 flex-1 px-3 text-sm font-medium text-[#102236] outline-none" />
                        </div>
                      </Field>
                      <div className="grid gap-3">
                        <Field id="renewal_option" label="Renewal Option">
                          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236]">
                            <input type="checkbox" checked={values.renewal_option} onChange={(event) => updateField('renewal_option', event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                            Yes
                          </label>
                        </Field>
                        <Field id="renewal_notice_date" label="Renewal Notice Date">
                          <input type="date" value={values.renewal_notice_date} onChange={(event) => updateField('renewal_notice_date', event.target.value)} className={inputClass} />
                        </Field>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section onFocus={() => setActiveSection('ownership')} className="grid gap-4">
                <SectionTitle number="4" icon={UserRound} title="Internal Ownership" />
                <div className="grid gap-4 md:grid-cols-4">
                  <Field id="broker_id" label="Broker Owner" required error={errors.broker_id}>
                    <select value={values.broker_id} onChange={(event) => updateField('broker_id', event.target.value)} className={inputClass}>
                      <option value="">Select broker...</option>
                      {(lookups.brokers || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="branch_id" label="Branch">
                    <select value={values.branch_id} onChange={(event) => updateField('branch_id', event.target.value)} className={inputClass}>
                      <option value="">Select branch...</option>
                      {(lookups.branches || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="team_id" label="Team">
                    <select value={values.team_id} onChange={(event) => updateField('team_id', event.target.value)} className={inputClass}>
                      <option value="">Select team...</option>
                      {(lookups.teams || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                  <Field id="source" label="Source">
                    <select value={values.source} onChange={(event) => updateField('source', event.target.value)} className={inputClass}>
                      <option value="">Select source...</option>
                      {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
              </section>

              <section onFocus={() => setActiveSection('notes')} className="grid gap-4">
                <SectionTitle number="5" icon={ClipboardList} title="Notes" />
                <label className="grid gap-1.5">
                  <textarea value={values.notes} maxLength={500} onChange={(event) => updateField('notes', event.target.value)} placeholder="Any additional notes..." rows={4} className={`${inputClass} py-3`} />
                  <span className="text-right text-xs font-semibold text-slate-400">{values.notes.length} / 500</span>
                </label>
              </section>
            </div>
          </main>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-2xl bg-[#102b46] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Save Tenant'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialTenantOnboardingModal
