import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const CATEGORY_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'retail', label: 'Retail' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'development_land', label: 'Development Land' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'active', label: 'Active' },
  { value: 'under_offer', label: 'Under Offer' },
]

const LISTING_TYPE_OPTIONS = [
  { value: 'lease', label: 'To Let' },
  { value: 'sale', label: 'For Sale' },
  { value: 'investment', label: 'Investment' },
  { value: 'development', label: 'Development' },
]

const CATEGORY_FIELDS = {
  office: [
    { name: 'office_grade', label: 'Office Grade' },
    { name: 'gla', label: 'GLA', type: 'number' },
    { name: 'parking_bays', label: 'Parking Bays', type: 'number' },
    { name: 'open_parking', label: 'Open Parking', type: 'number' },
    { name: 'basement_parking', label: 'Basement Parking', type: 'number' },
    { name: 'backup_generator', label: 'Backup Generator', type: 'checkbox' },
    { name: 'backup_water', label: 'Backup Water', type: 'checkbox' },
    { name: 'fibre', label: 'Fibre', type: 'checkbox' },
    { name: 'occupation_date', label: 'Occupation Date', type: 'date' },
    { name: 'rental', label: 'Rental', type: 'number' },
    { name: 'operating_costs', label: 'Operating Costs', type: 'number' },
    { name: 'municipal_costs', label: 'Municipal Costs', type: 'number' },
    { name: 'security', label: 'Security' },
    { name: 'access_control', label: 'Access Control' },
  ],
  industrial: [
    { name: 'warehouse_size', label: 'Warehouse Size', type: 'number' },
    { name: 'yard_size', label: 'Yard Size', type: 'number' },
    { name: 'power_supply', label: 'Power Supply' },
    { name: 'three_phase_power', label: '3 Phase Power', type: 'checkbox' },
    { name: 'amperage', label: 'Amperage', type: 'number' },
    { name: 'roller_doors', label: 'Roller Doors', type: 'number' },
    { name: 'dock_levellers', label: 'Dock Levellers', type: 'number' },
    { name: 'height_to_eaves', label: 'Height To Eaves', type: 'number' },
    { name: 'truck_access', label: 'Truck Access', type: 'checkbox' },
    { name: 'superlink_access', label: 'Superlink Access', type: 'checkbox' },
    { name: 'sprinklers', label: 'Sprinklers', type: 'checkbox' },
    { name: 'cranes', label: 'Cranes' },
    { name: 'security', label: 'Security' },
    { name: 'loading_areas', label: 'Loading Areas' },
  ],
  retail: [
    { name: 'centre_name', label: 'Centre Name' },
    { name: 'shop_number', label: 'Shop Number' },
    { name: 'gla', label: 'GLA', type: 'number' },
    { name: 'anchor_tenants', label: 'Anchor Tenants' },
    { name: 'foot_traffic', label: 'Foot Traffic' },
    { name: 'parking_availability', label: 'Parking Availability' },
    { name: 'loading_access', label: 'Loading Access' },
    { name: 'visibility_rating', label: 'Visibility Rating' },
    { name: 'trading_hours', label: 'Trading Hours' },
    { name: 'signage_opportunities', label: 'Signage Opportunities' },
  ],
  agricultural: [
    { name: 'farm_size', label: 'Farm Size', type: 'number' },
    { name: 'arable_hectares', label: 'Arable Hectares', type: 'number' },
    { name: 'irrigated_hectares', label: 'Irrigated Hectares', type: 'number' },
    { name: 'water_rights', label: 'Water Rights' },
    { name: 'boreholes', label: 'Boreholes', type: 'number' },
    { name: 'dams', label: 'Dams', type: 'number' },
    { name: 'pivot_systems', label: 'Pivot Systems' },
    { name: 'livestock_capacity', label: 'Livestock Capacity', type: 'number' },
    { name: 'staff_housing', label: 'Staff Housing', type: 'checkbox' },
    { name: 'main_house', label: 'Main House', type: 'checkbox' },
    { name: 'pack_house', label: 'Pack House', type: 'checkbox' },
    { name: 'cold_storage', label: 'Cold Storage', type: 'checkbox' },
    { name: 'silos', label: 'Silos', type: 'checkbox' },
    { name: 'equipment_included', label: 'Equipment Included' },
  ],
  mixed_use: [
    { name: 'gla', label: 'GLA', type: 'number' },
    { name: 'land_size', label: 'Land Size', type: 'number' },
    { name: 'zoning', label: 'Zoning' },
    { name: 'retail_component', label: 'Retail Component' },
    { name: 'office_component', label: 'Office Component' },
    { name: 'industrial_component', label: 'Industrial Component' },
    { name: 'parking_bays', label: 'Parking Bays', type: 'number' },
    { name: 'services_installed', label: 'Services Installed' },
  ],
  development_land: [
    { name: 'land_size', label: 'Land Size', type: 'number' },
    { name: 'zoning', label: 'Zoning' },
    { name: 'bulk_rights', label: 'Bulk Rights' },
    { name: 'coverage', label: 'Coverage' },
    { name: 'far', label: 'FAR' },
    { name: 'services_installed', label: 'Services Installed' },
    { name: 'subdivision_potential', label: 'Subdivision Potential', type: 'checkbox' },
    { name: 'environmental_status', label: 'Environmental Status' },
    { name: 'municipality', label: 'Municipality' },
  ],
}

function initialValues() {
  return {
    listing_category: 'office',
    listing_type: 'lease',
    listing_status: 'draft',
    title: '',
    description: '',
    pricing: '',
    pricing_notes: '',
    featured: false,
    available_from: '',
    landlord_id: '',
    property_id: '',
    vacancy_id: '',
    branch_id: '',
    team_id: '',
    broker_id: '',
    new_landlord_name: '',
    new_landlord_contact: '',
    new_property_name: '',
    new_property_area: '',
    new_vacancy_name: '',
    new_vacancy_unit: '',
  }
}

function serializeField(field, value) {
  if (field.type === 'checkbox') return Boolean(value)
  if (field.type === 'number') return String(value ?? '').trim() ? Number(value) : null
  return String(value ?? '').trim() || null
}

function fieldClass(error) {
  return `min-h-11 w-full rounded-2xl border ${error ? 'border-rose-300' : 'border-slate-200'} bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]`
}

function CommercialListingWizard({ open, lookups = {}, onClose, onSubmit }) {
  const [step, setStep] = useState(1)
  const [values, setValues] = useState(initialValues)
  const [dynamicValues, setDynamicValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const categoryFields = useMemo(() => CATEGORY_FIELDS[values.listing_category] || [], [values.listing_category])

  useEffect(() => {
    if (!open) return
    setStep(1)
    setValues(initialValues())
    setDynamicValues({})
    setSaving(false)
    setError('')
    setFieldErrors({})
  }, [open])

  if (!open) return null

  function setValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function validate(nextStep = step) {
    const nextErrors = {}
    if (nextStep >= 1 && !values.listing_category) nextErrors.listing_category = 'Choose a category.'
    if (nextStep >= 3 && !String(values.title || '').trim()) nextErrors.title = 'Listing title is required.'
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function next() {
    if (!validate(step)) return
    setStep((current) => Math.min(3, current + 1))
  }

  function back() {
    setStep((current) => Math.max(1, current - 1))
  }

  async function submit(event) {
    event.preventDefault()
    if (!validate(3)) return
    setSaving(true)
    setError('')
    try {
      const metadata = {}
      categoryFields.forEach((field) => {
        const serialized = serializeField(field, dynamicValues[field.name])
        if (serialized !== null && serialized !== '') metadata[field.name] = serialized
      })
      await onSubmit?.({
        ...values,
        pricing: String(values.pricing || '').trim() ? Number(values.pricing) : null,
        metadata_json: metadata,
        marketing_json: { status: values.listing_status === 'active' ? 'live' : 'draft' },
        media_json: { photos: [], videos: [], brochure: null },
        performance_json: { views: 0, enquiries: 0, requirements_matched: 0, deals_created: 0, conversion_rate: 0 },
      })
      onClose?.()
    } catch (submitError) {
      setError(submitError?.message || 'Listing could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function renderSelect(name, label, options) {
    return (
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
        <select value={values[name]} onChange={(event) => setValue(name, event.target.value)} className={fieldClass(fieldErrors[name])}>
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {fieldErrors[name] ? <span className="text-xs font-semibold text-rose-600">{fieldErrors[name]}</span> : null}
      </label>
    )
  }

  function renderInput(name, label, type = 'text', span = '') {
    return (
      <label className={span === 'full' ? 'grid gap-1.5 md:col-span-2' : 'grid gap-1.5'}>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
        {type === 'textarea' ? (
          <textarea rows={4} value={values[name]} onChange={(event) => setValue(name, event.target.value)} className={`${fieldClass(fieldErrors[name])} py-3`} />
        ) : type === 'checkbox' ? (
          <span className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236]">
            <input type="checkbox" checked={Boolean(values[name])} onChange={(event) => setValue(name, event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Featured
          </span>
        ) : (
          <input type={type} value={values[name]} step={type === 'number' ? 'any' : undefined} onChange={(event) => setValue(name, event.target.value)} className={fieldClass(fieldErrors[name])} />
        )}
        {fieldErrors[name] ? <span className="text-xs font-semibold text-rose-600">{fieldErrors[name]}</span> : null}
      </label>
    )
  }

  function renderDynamicField(field) {
    const value = dynamicValues[field.name] ?? ''
    return (
      <label key={field.name} className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{field.label}</span>
        {field.type === 'checkbox' ? (
          <span className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236]">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => setDynamicValues((current) => ({ ...current, [field.name]: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Yes
          </span>
        ) : (
          <input
            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            value={value}
            onChange={(event) => setDynamicValues((current) => ({ ...current, [field.name]: event.target.value }))}
            className={fieldClass()}
          />
        )}
      </label>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Add Listing</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">Commercial listing workspace</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[1, 2, 3].map((item) => (
                <span key={item} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${step >= item ? 'bg-[#102b46] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {step > item ? <Check size={13} /> : item}
                  {item === 1 ? 'Category' : item === 2 ? 'Asset Chain' : 'Listing Data'}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

          {step === 1 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('listing_category', option.value)}
                  className={`min-h-24 rounded-2xl border p-4 text-left transition ${values.listing_category === option.value ? 'border-[#102b46] bg-[#eef5fb] text-[#102236]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="text-base font-semibold">{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-3">
                {renderSelect('landlord_id', 'Landlord', lookups.landlords || [])}
                {renderSelect('property_id', 'Property', lookups.properties || [])}
                {renderSelect('vacancy_id', 'Vacancy', lookups.vacancies || [])}
              </div>
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 md:grid-cols-2">
                {renderInput('new_landlord_name', 'New Landlord Name')}
                {renderInput('new_landlord_contact', 'New Landlord Contact')}
                {renderInput('new_property_name', 'New Property Name')}
                {renderInput('new_property_area', 'New Property Area')}
                {renderInput('new_vacancy_name', 'New Vacancy Name')}
                {renderInput('new_vacancy_unit', 'New Vacancy Unit')}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {renderSelect('branch_id', 'Branch / Office', lookups.branches || [])}
                {renderSelect('team_id', 'Team', lookups.teams || [])}
                {renderSelect('broker_id', 'Broker', lookups.brokers || [])}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                {renderInput('title', 'Listing Title')}
                {renderSelect('listing_type', 'Listing Type', LISTING_TYPE_OPTIONS)}
                {renderSelect('listing_status', 'Listing Status', STATUS_OPTIONS)}
                {renderInput('pricing', 'Pricing', 'number')}
                {renderInput('available_from', 'Available From', 'date')}
                {renderInput('featured', 'Featured', 'checkbox')}
                {renderInput('pricing_notes', 'Pricing Notes', 'text', 'full')}
                {renderInput('description', 'Description', 'textarea', 'full')}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <h3 className="text-sm font-semibold text-[#102236]">{CATEGORY_OPTIONS.find((option) => option.value === values.listing_category)?.label} intelligence</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {categoryFields.map(renderDynamicField)}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={step === 1 ? onClose : back} className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft size={15} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button type="button" onClick={next} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              Continue
              <ArrowRight size={15} />
            </button>
          ) : (
            <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Saving...' : 'Create listing'}
            </button>
          )}
        </footer>
      </form>
    </div>
  )
}

export default CommercialListingWizard
