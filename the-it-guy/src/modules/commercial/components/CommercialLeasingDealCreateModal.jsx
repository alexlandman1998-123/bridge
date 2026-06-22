import { Building2, DollarSign, FileText, UsersRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'

const STAGE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'viewing', label: 'Viewing' },
  { value: 'heads_of_terms', label: 'Heads of Terms' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'lease_drafting', label: 'Lease Drafting' },
  { value: 'signed', label: 'Signed' },
  { value: 'completed', label: 'Completed' },
  { value: 'lost', label: 'Lost' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'lost', label: 'Lost' },
  { value: 'converted', label: 'Converted' },
]

const INITIAL_VALUES = {
  deal_name: '',
  stage: 'lead',
  status: 'active',
  expected_close_date: '',
  probability_percentage: '',
  company_id: '',
  contact_id: '',
  tenant_id: '',
  landlord_id: '',
  property_id: '',
  stock_link_id: '',
  formatted_address: '',
  branch_id: '',
  team_id: '',
  assigned_broker: '',
  deal_value: '',
  estimated_commission: '',
}

const EMPTY_ARRAY = []

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const cleaned = String(value).replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrencyInput(value) {
  const numericValue = toNumber(value)
  if (numericValue === null) return ''
  return `R ${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(numericValue).replace(/,/g, ' ')}`
}

function optionLabel(options = [], value = '', fallback = '') {
  const match = options.find((option) => String(option.value) === String(value))
  return match?.label || fallback
}

function propertyLabel(row = {}) {
  return [row.property_name || row.name || 'Unnamed property', [row.suburb, row.city].filter(Boolean).join(', ')].filter(Boolean).join(' - ')
}

function stockLabel(row = {}, type = 'vacancy') {
  if (type === 'listing') return [row.title || row.vacancy_name || 'Unnamed vacancy', row.listing_status].filter(Boolean).join(' - ')
  return [row.vacancy_name || row.name || 'Unnamed vacancy', row.unit_or_floor].filter(Boolean).join(' - ')
}

function addressFor(row = {}) {
  return row.formatted_address || row.street_address || row.address || [row.suburb, row.city].filter(Boolean).join(', ')
}

function Field({ label, required = false, className = '', children, error = '', hint = '' }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-[#526985]">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs leading-5 text-slate-500">{hint}</span> : null}
      {error ? <span className="text-xs font-semibold text-rose-600">{error}</span> : null}
    </label>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-[#102236] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0b65d8] focus:ring-4 focus:ring-blue-100/70 disabled:bg-slate-50 disabled:text-slate-400 ${props.className || ''}`}
    />
  )
}

function Select(props) {
  return (
    <select
      {...props}
      className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-[#102236] outline-none transition hover:border-slate-300 focus:border-[#0b65d8] focus:ring-4 focus:ring-blue-100/70 disabled:bg-slate-50 disabled:text-slate-400 ${props.className || ''}`}
    />
  )
}

function Section({ number, icon, title, children }) {
  const Icon = icon
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-100 bg-[#eef5ff] text-[#0b65d8]">
          <Icon size={16} />
        </span>
        <h3 className="text-base font-semibold text-[#102236]">{number}. {title}</h3>
      </div>
      {children}
    </section>
  )
}

function CommercialLeasingDealCreateModal({ open, lookups = {}, rawLookups = {}, onClose, onSubmit }) {
  const [values, setValues] = useState(INITIAL_VALUES)
  const [useCustomAddress, setUseCustomAddress] = useState(false)
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
  const showAddressField = !values.property_id || useCustomAddress

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
    setUseCustomAddress(false)
    setValues((current) => ({
      ...current,
      property_id: propertyId,
      stock_link_id: '',
      landlord_id: property?.landlord_id || current.landlord_id,
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
    if (!normalizeText(values.stage)) nextErrors.stage = 'Stage is required.'
    if (!normalizeText(values.assigned_broker)) nextErrors.assigned_broker = 'Assigned broker is required.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    setSubmitError('')
    try {
      const stock = selectedStock
      const payload = {
        deal_name: normalizeText(values.deal_name),
        deal_type: 'lease',
        stage: values.stage,
        status: values.status || 'active',
        expected_close_date: values.expected_close_date || null,
        probability_percentage: toNumber(values.probability_percentage),
        company_id: values.company_id || null,
        contact_id: values.contact_id || null,
        tenant_id: values.tenant_id || null,
        landlord_id: values.landlord_id || selectedStock?.row?.landlord_id || selectedProperty?.landlord_id || null,
        property_id: values.property_id || null,
        vacancy_id: stock?.type === 'vacancy' ? stock.row.id : (stock?.row?.vacancy_id || null),
        listing_id: stock?.type === 'listing' ? stock.row.id : null,
        formatted_address: showAddressField ? normalizeText(values.formatted_address) || null : addressFor(selectedProperty) || null,
        branch_id: values.branch_id || null,
        team_id: values.team_id || null,
        assigned_broker: values.assigned_broker,
        broker_id: values.assigned_broker,
        deal_value: toNumber(values.deal_value),
        estimated_commission: toNumber(values.estimated_commission),
      }

      await onSubmit(payload)
      setValues(INITIAL_VALUES)
      setUseCustomAddress(false)
      onClose()
    } catch (error) {
      setSubmitError(error?.message || 'The leasing deal could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-[880px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_26px_70px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-7 py-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#102236]">Create Leasing Deal</h2>
            <p className="mt-2 text-sm font-normal text-[#526985]">Link the tenant, landlord, property and broker details for this lease opportunity.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-[#526985] transition hover:bg-slate-50 hover:text-[#102236]" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#fbfcfe] px-7 py-6">
          {submitError ? (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{submitError}</div>
          ) : null}

          <div className="grid gap-6">
            <Section number="1" icon={FileText} title="Deal Overview">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Deal Name" required error={errors.deal_name}>
                  <Input value={values.deal_name} onChange={(event) => updateValue('deal_name', event.target.value)} placeholder="e.g. Waterfall Office Park Lease" />
                </Field>
                <Field label="Stage" required error={errors.stage}>
                  <Select value={values.stage} onChange={(event) => updateValue('stage', event.target.value)}>
                    {STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={values.status} onChange={(event) => updateValue('status', event.target.value)}>
                    {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Expected Close Date">
                  <Input type="date" value={values.expected_close_date} onChange={(event) => updateValue('expected_close_date', event.target.value)} />
                </Field>
                <Field label="Probability %">
                  <Input type="number" min="0" max="100" value={values.probability_percentage} onChange={(event) => updateValue('probability_percentage', event.target.value)} placeholder="e.g. 75" />
                </Field>
              </div>
            </Section>

            <Section number="2" icon={UsersRound} title="Parties">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Company">
                  <Select value={values.company_id} onChange={(event) => updateValue('company_id', event.target.value)}>
                    <option value="">Select company</option>
                    {(lookups.companies || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Contact">
                  <Select value={values.contact_id} onChange={(event) => updateValue('contact_id', event.target.value)}>
                    <option value="">Select contact</option>
                    {(lookups.contacts || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field
                  label="Linked Tenant"
                  hint={values.tenant_id ? '' : 'No tenant linked. Select an existing tenant or create one from the tenant workspace.'}
                >
                  <Select value={values.tenant_id} onChange={(event) => updateValue('tenant_id', event.target.value)}>
                    <option value="">Select tenant</option>
                    {(lookups.tenants || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Landlord">
                  <Select value={values.landlord_id} onChange={(event) => updateValue('landlord_id', event.target.value)}>
                    <option value="">{values.landlord_id ? optionLabel(lookups.landlords, values.landlord_id, 'Linked landlord') : 'Select landlord'}</option>
                    {(lookups.landlords || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>
            </Section>

            <Section number="3" icon={Building2} title="Property & Vacancy">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Linked Property"
                  hint={values.property_id ? '' : 'No property linked yet. Search for a property or use a custom address.'}
                >
                  <Select value={values.property_id} onChange={(event) => handlePropertyChange(event.target.value)}>
                    <option value="">Select property</option>
                    {properties.map((property) => <option key={property.id} value={property.id}>{propertyLabel(property)}</option>)}
                  </Select>
                </Field>
                <Field label="Linked Vacancy">
                  <Select value={values.stock_link_id} onChange={(event) => handleStockChange(event.target.value)} disabled={!values.property_id}>
                    <option value="">{values.property_id ? 'Select vacancy' : 'Select property first'}</option>
                    {stockOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-[#526985]">
                    <input
                      type="checkbox"
                      checked={useCustomAddress}
                      onChange={(event) => setUseCustomAddress(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#0b65d8] focus:ring-[#0b65d8]"
                    />
                    Use custom address
                  </label>
                </div>
                {showAddressField ? (
                  <Field label="Property Address" className="md:col-span-2">
                    <Input value={values.formatted_address} onChange={(event) => updateValue('formatted_address', event.target.value)} placeholder="Start typing the property address..." />
                  </Field>
                ) : null}
              </div>
            </Section>

            <Section number="4" icon={UsersRound} title="Assignment">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Branch / Office">
                  <Select value={values.branch_id} onChange={(event) => updateValue('branch_id', event.target.value)}>
                    <option value="">Select branch / office</option>
                    {(lookups.branches || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Team">
                  <Select value={values.team_id} onChange={(event) => updateValue('team_id', event.target.value)}>
                    <option value="">Select team</option>
                    {(lookups.teams || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="Assigned Broker" required error={errors.assigned_broker}>
                  <Select value={values.assigned_broker} onChange={(event) => updateValue('assigned_broker', event.target.value)}>
                    <option value="">Select broker</option>
                    {(lookups.brokers || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
              </div>
            </Section>

            <Section number="5" icon={DollarSign} title="Commercials">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Deal Value">
                  <Input
                    inputMode="decimal"
                    value={values.deal_value}
                    onChange={(event) => updateValue('deal_value', event.target.value)}
                    onBlur={() => updateValue('deal_value', formatCurrencyInput(values.deal_value))}
                    placeholder="R 2 500 000"
                  />
                </Field>
                <Field label="Estimated Commission">
                  <Input
                    inputMode="decimal"
                    value={values.estimated_commission}
                    onChange={(event) => updateValue('estimated_commission', event.target.value)}
                    onBlur={() => updateValue('estimated_commission', formatCurrencyInput(values.estimated_commission))}
                    placeholder="R 125 000"
                  />
                </Field>
              </div>
            </Section>
          </div>
        </main>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-7 py-5">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="h-11 rounded-xl bg-[#0b335b] px-[18px] text-sm font-semibold text-white shadow-[0_12px_22px_rgba(11,51,91,0.18)] transition hover:bg-[#0f426f] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : 'Create Leasing Deal'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialLeasingDealCreateModal
