import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Home,
  Loader2,
  Mail,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  LANDLORD_ADDITIONAL_CONTACT_TYPES,
  LANDLORD_ENTITY_TYPE_OPTIONS,
  LANDLORD_MANDATE_OPTIONS,
  LANDLORD_MANDATE_TYPE_OPTIONS,
  LANDLORD_PORTFOLIO_TYPE_OPTIONS,
  LANDLORD_PROPERTY_MANAGER_RESPONSIBILITIES,
  LANDLORD_PROPERTY_TYPE_OPTIONS,
  LANDLORD_RELATIONSHIP_TYPE_OPTIONS,
  LANDLORD_VACANCY_TYPE_OPTIONS,
  buildLandlordOnboardingSummary,
  createEmptyLandlordOnboardingForm,
  getLandlordOnboardingStepDefinitions,
} from '../commercialLandlordOnboardingModel'
import { formatDate, formatNumber, titleize } from '../commercialFormatters'
import {
  getCommercialLandlordOnboardingByToken,
  saveCommercialLandlordOnboardingDraft,
  submitCommercialLandlordOnboarding,
  uploadCommercialLandlordOnboardingDocument,
} from '../services/commercialLandlordService'

const PAGE_SHELL = 'min-h-screen bg-[#f4f7fb] px-4 py-5 text-[#102236] sm:px-6 lg:px-8'
const PAGE_WIDTH = 'mx-auto w-full max-w-[1180px]'
const SECTION_CARD = 'rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-6'
const INPUT_CLASS = 'w-full min-h-[46px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'
const TEXTAREA_CLASS = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'

function normalizeText(value) {
  return String(value || '').trim()
}

function setInArray(form, key, nextRows) {
  return { ...form, [key]: nextRows }
}

function createAssetManagerDraft() {
  return {
    clientKey: `asset-${Math.random().toString(36).slice(2, 10)}`,
    id: '',
    full_name: '',
    position: '',
    email: '',
    mobile: '',
    id_number: '',
    signing_capacity: '',
    authority_confirmed: true,
    can_approve_mandates: true,
    can_approve_leasing_terms: true,
    can_approve_sales_terms: true,
    is_primary: false,
    notes: '',
  }
}

function createPropertyManagerDraft() {
  return {
    clientKey: `pm-${Math.random().toString(36).slice(2, 10)}`,
    id: '',
    full_name: '',
    position: '',
    email: '',
    mobile: '',
    portfolio_region: '',
    responsibilities: [...LANDLORD_PROPERTY_MANAGER_RESPONSIBILITIES],
    is_primary: false,
    notes: '',
  }
}

function createAdditionalContactDraft() {
  return {
    clientKey: `contact-${Math.random().toString(36).slice(2, 10)}`,
    id: '',
    contact_type: 'finance_contact',
    full_name: '',
    position: '',
    email: '',
    mobile: '',
    notes: '',
  }
}

function createPropertyDraft(assetManagers = [], propertyManagers = []) {
  return {
    clientKey: `property-${Math.random().toString(36).slice(2, 10)}`,
    id: '',
    property_name: '',
    property_type: 'commercial',
    address: '',
    suburb: '',
    city: '',
    province: '',
    gla_m2: '',
    ownership_status: '',
    assigned_asset_manager_key: assetManagers[0]?.clientKey || '',
    assigned_property_manager_key: propertyManagers[0]?.clientKey || '',
    notes: '',
    vacancies: [],
  }
}

function createVacancyDraft(propertyManagers = []) {
  return {
    clientKey: `vacancy-${Math.random().toString(36).slice(2, 10)}`,
    id: '',
    vacancy_name: '',
    unit_or_floor: '',
    vacancy_type: 'office',
    available_area_m2: '',
    rental_per_m2: '',
    operating_costs: '',
    availability_date: '',
    lease_term_preference: '',
    assigned_broker: '',
    assigned_property_manager_key: propertyManagers[0]?.clientKey || '',
    notes: '',
  }
}

function createMandateDraft(properties = []) {
  return {
    id: '',
    mandate_kind: 'leasing',
    mandate_type: 'open',
    start_date: '',
    expiry_date: '',
    commission_structure: '',
    brokerage_assigned: '',
    broker_assigned: '',
    notes: '',
    property_client_key: properties[0]?.clientKey || '',
    vacancy_client_key: '',
  }
}

function createRelationshipDraft() {
  return {
    clientKey: `relationship-${Math.random().toString(36).slice(2, 10)}`,
    brokerage_name: '',
    broker_name: '',
    broker_email: '',
    broker_mobile: '',
    relationship_type: 'preferred_broker',
    mandate_type: '',
    notes: '',
  }
}

function StepBadge({ active = false, done = false, label = '', helper = '', index = 0 }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? 'border-[#102b46] bg-[#f5f9ff]' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-[#102b46] text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {done ? <CheckCircle2 size={14} /> : index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#102236]">{label}</p>
          <p className="truncate text-xs text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  )
}

function MultiSelectPills({ options = [], values = [], onToggle = null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = values.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle?.(option.value)}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${active ? 'border-[#102b46] bg-[#102b46] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <main className={PAGE_SHELL}>
      <section className={`${PAGE_WIDTH} ${SECTION_CARD}`}>
        <h1 className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">Landlord onboarding unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message || 'Request a fresh onboarding link from your broker.'}</p>
      </section>
    </main>
  )
}

function LoadingState() {
  return (
    <main className={PAGE_SHELL}>
      <section className={`${PAGE_WIDTH} ${SECTION_CARD}`}>
        <div className="h-8 w-52 animate-pulse rounded-2xl bg-slate-200" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </section>
    </main>
  )
}

function CommercialLandlordOnboardingPage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [form, setForm] = useState(createEmptyLandlordOnboardingForm())
  const [activeStep, setActiveStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [uploadState, setUploadState] = useState({ category: '', documentRequestId: '', file: null })
  const [submitted, setSubmitted] = useState(false)

  const steps = getLandlordOnboardingStepDefinitions(form)
  const requiredDocuments = workspace?.requiredDocuments || []

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const nextWorkspace = await getCommercialLandlordOnboardingByToken(token)
        if (!active) return
        setWorkspace(nextWorkspace)
        setForm(nextWorkspace.form)
        setUploadState((previous) => ({
          ...previous,
          category: nextWorkspace.requiredDocuments?.[0]?.category || 'supporting_documents',
          documentRequestId: nextWorkspace.documentRequests?.[0]?.id || '',
        }))
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Landlord onboarding could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  const summaryRows = useMemo(() => buildLandlordOnboardingSummary(form), [form])
  const brokerMeta = workspace?.access?.contact?.metadata || workspace?.access?.contact?.contact?.metadata || {}

  function updateDetails(key, value) {
    setForm((previous) => ({
      ...previous,
      landlord_details: {
        ...previous.landlord_details,
        [key]: value,
      },
    }))
  }

  function updatePortfolio(key, value) {
    setForm((previous) => ({
      ...previous,
      portfolio: {
        ...previous.portfolio,
        [key]: value,
      },
    }))
  }

  function updateArrayRow(key, clientKey, patch) {
    setForm((previous) => setInArray(previous, key, previous[key].map((row) => row.clientKey === clientKey ? { ...row, ...patch } : row)))
  }

  function updatePropertyRow(clientKey, patch) {
    setForm((previous) => ({
      ...previous,
      properties: previous.properties.map((row) => row.clientKey === clientKey ? { ...row, ...patch } : row),
    }))
  }

  function updateVacancyRow(propertyKey, vacancyKey, patch) {
    setForm((previous) => ({
      ...previous,
      properties: previous.properties.map((property) => property.clientKey !== propertyKey
        ? property
        : {
            ...property,
            vacancies: property.vacancies.map((vacancy) => vacancy.clientKey === vacancyKey ? { ...vacancy, ...patch } : vacancy),
          }),
    }))
  }

  async function reloadWorkspace(message = '') {
    const nextWorkspace = await getCommercialLandlordOnboardingByToken(token)
    setWorkspace(nextWorkspace)
    setForm(nextWorkspace.form)
    setNotice(message)
  }

  async function handleSaveDraft() {
    setSaving(true)
    setNotice('')
    try {
      await saveCommercialLandlordOnboardingDraft(token, form)
      await reloadWorkspace('Draft saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Draft could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await submitCommercialLandlordOnboarding(token, form)
      await reloadWorkspace('Landlord onboarding submitted.')
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError?.message || 'Landlord onboarding could not be submitted.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (!uploadState.file) return
    setUploading(true)
    setError('')
    try {
      await uploadCommercialLandlordOnboardingDocument({
        token,
        file: uploadState.file,
        category: uploadState.category,
        documentRequestId: uploadState.documentRequestId,
      })
      setUploadState((previous) => ({ ...previous, file: null }))
      await reloadWorkspace('Document uploaded.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Document upload failed.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <LoadingState />
  if (error && !workspace) return <ErrorState message={error} />

  const activeStepId = steps[activeStep]?.id || 'entity'

  return (
    <main className={PAGE_SHELL}>
      <div className={`${PAGE_WIDTH} grid gap-5`}>
        <section className={SECTION_CARD}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400">Arch9 Commercial</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#102236]">Landlord Onboarding</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Complete the landlord profile, add your managers and properties, and upload the supporting documents your broker needs to structure the portfolio properly.
              </p>
            </div>
            <div className="grid min-w-[280px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Landlord</p>
                <p className="mt-1 text-sm font-semibold text-[#102236]">{workspace?.landlord?.legal_name || workspace?.landlord?.name || 'Landlord'}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Status</p>
                <p className="mt-1 text-sm font-semibold text-[#102236]">{titleize(workspace?.onboarding?.status || 'in_progress')}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Progress</p>
                <p className="mt-1 text-sm font-semibold text-[#102236]">{workspace?.progress?.completionPercentage || 0}% complete</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.75fr,0.25fr]">
          <div className="grid gap-4">
            <section className={SECTION_CARD}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {steps.map((step, index) => (
                  <StepBadge key={step.id} active={index === activeStep} done={index < activeStep} label={step.label} helper={step.helper} index={index} />
                ))}
              </div>
            </section>

            <section className={SECTION_CARD}>
              {activeStepId === 'entity' ? (
                <div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Building2 size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Who owns the property / portfolio?</h2>
                      <p className="mt-1 text-sm text-slate-500">Choose the landlord entity type so we can load the right legal fields and document requirements.</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {LANDLORD_ENTITY_TYPE_OPTIONS.map((option) => {
                      const active = form.entity_type === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((previous) => ({ ...previous, entity_type: option.value }))}
                          className={`rounded-2xl border p-4 text-left transition ${active ? 'border-[#102b46] bg-[#f5f9ff]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                        >
                          <p className="text-sm font-semibold text-[#102236]">{option.label}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{option.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {activeStepId === 'details' ? (
                <div className="grid gap-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserRound size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Landlord Details</h2>
                      <p className="mt-1 text-sm text-slate-500">Capture the legal entity details and the main operating contact for the portfolio.</p>
                    </div>
                  </div>

                  {form.entity_type === 'individual' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Full Name<input value={form.landlord_details.full_name} onChange={(event) => updateDetails('full_name', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">ID Number<input value={form.landlord_details.id_number} onChange={(event) => updateDetails('id_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Email<input type="email" value={form.landlord_details.main_email_address} onChange={(event) => updateDetails('main_email_address', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mobile Number<input value={form.landlord_details.main_contact_number} onChange={(event) => updateDetails('main_contact_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Residential Address<textarea value={form.landlord_details.residential_address} onChange={(event) => updateDetails('residential_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Postal Address<textarea value={form.landlord_details.postal_address} onChange={(event) => updateDetails('postal_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                    </div>
                  ) : null}

                  {form.entity_type === 'trust' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Trust Name<input value={form.landlord_details.trust_name} onChange={(event) => updateDetails('trust_name', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Trust Registration Number<input value={form.landlord_details.trust_registration_number} onChange={(event) => updateDetails('trust_registration_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Master&apos;s Office Reference<input value={form.landlord_details.masters_office_reference} onChange={(event) => updateDetails('masters_office_reference', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Main Contact Number<input value={form.landlord_details.main_contact_number} onChange={(event) => updateDetails('main_contact_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Main Email Address<input type="email" value={form.landlord_details.main_email_address} onChange={(event) => updateDetails('main_email_address', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Registered Address<textarea value={form.landlord_details.registered_address} onChange={(event) => updateDetails('registered_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Postal Address<textarea value={form.landlord_details.postal_address} onChange={(event) => updateDetails('postal_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                    </div>
                  ) : null}

                  {!['individual', 'trust'].includes(form.entity_type) ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Legal Entity Name<input value={form.landlord_details.legal_name} onChange={(event) => updateDetails('legal_name', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Trading Name<input value={form.landlord_details.trading_name} onChange={(event) => updateDetails('trading_name', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Registration Number<input value={form.landlord_details.registration_number} onChange={(event) => updateDetails('registration_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">VAT Number<input value={form.landlord_details.vat_number} onChange={(event) => updateDetails('vat_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                        <input type="checkbox" checked={Boolean(form.landlord_details.vat_registered)} onChange={(event) => updateDetails('vat_registered', event.target.checked)} />
                        VAT registered
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Website<input value={form.landlord_details.website} onChange={(event) => updateDetails('website', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Main Contact Number<input value={form.landlord_details.main_contact_number} onChange={(event) => updateDetails('main_contact_number', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Main Email Address<input type="email" value={form.landlord_details.main_email_address} onChange={(event) => updateDetails('main_email_address', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Registered Address<textarea value={form.landlord_details.registered_address} onChange={(event) => updateDetails('registered_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Postal Address<textarea value={form.landlord_details.postal_address} onChange={(event) => updateDetails('postal_address', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeStepId === 'contacts' ? (
                <div className="grid gap-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Users size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Managers & Contacts</h2>
                      <p className="mt-1 text-sm text-slate-500">Add the strategic and operational landlord contacts your broker will work with.</p>
                    </div>
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#102236]">Asset Managers</h3>
                        <p className="mt-1 text-sm text-slate-500">Commercial decision makers and signatories.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({ ...previous, asset_managers: [...previous.asset_managers, createAssetManagerDraft()] }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Plus size={16} />
                        Add Another
                      </button>
                    </div>
                    <div className="grid gap-4">
                      {form.asset_managers.map((manager) => (
                        <article key={manager.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#102236]">{manager.full_name || 'New asset manager'}</p>
                            {form.asset_managers.length > 1 ? (
                              <button type="button" onClick={() => setForm((previous) => ({ ...previous, asset_managers: previous.asset_managers.filter((row) => row.clientKey !== manager.clientKey) }))} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Full Name<input value={manager.full_name} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { full_name: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Position / Title<input value={manager.position} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { position: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Email<input type="email" value={manager.email} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { email: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mobile<input value={manager.mobile} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { mobile: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">ID Number<input value={manager.id_number} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { id_number: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Signing Capacity<input value={manager.signing_capacity} onChange={(event) => updateArrayRow('asset_managers', manager.clientKey, { signing_capacity: event.target.value })} className={INPUT_CLASS} /></label>
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {[
                              ['is_primary', 'Primary asset manager'],
                              ['authority_confirmed', 'Authority confirmed'],
                              ['can_approve_mandates', 'Can approve mandates'],
                              ['can_approve_leasing_terms', 'Can approve leasing terms'],
                              ['can_approve_sales_terms', 'Can approve sales terms'],
                            ].map(([key, label]) => (
                              <label key={key} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(manager[key])}
                                  onChange={(event) => {
                                    if (key === 'is_primary' && event.target.checked) {
                                      setForm((previous) => ({
                                        ...previous,
                                        asset_managers: previous.asset_managers.map((row) => ({ ...row, is_primary: row.clientKey === manager.clientKey })),
                                      }))
                                      return
                                    }
                                    updateArrayRow('asset_managers', manager.clientKey, { [key]: event.target.checked })
                                  }}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#102236]">Property Managers</h3>
                        <p className="mt-1 text-sm text-slate-500">Operational contacts for updates, access, and day-to-day property issues.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({ ...previous, property_managers: [...previous.property_managers, createPropertyManagerDraft()] }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Plus size={16} />
                        Add Another
                      </button>
                    </div>
                    <div className="grid gap-4">
                      {form.property_managers.map((manager) => (
                        <article key={manager.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#102236]">{manager.full_name || 'New property manager'}</p>
                            {form.property_managers.length > 1 ? (
                              <button type="button" onClick={() => setForm((previous) => ({ ...previous, property_managers: previous.property_managers.filter((row) => row.clientKey !== manager.clientKey) }))} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Full Name<input value={manager.full_name} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { full_name: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Position / Title<input value={manager.position} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { position: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Email<input type="email" value={manager.email} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { email: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mobile<input value={manager.mobile} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { mobile: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Portfolio / Region<input value={manager.portfolio_region} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { portfolio_region: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Responsibilities<textarea value={manager.responsibilities.join(', ')} onChange={(event) => updateArrayRow('property_managers', manager.clientKey, { responsibilities: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} rows={2} className={TEXTAREA_CLASS} /></label>
                          </div>
                          <div className="mt-4">
                            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-[#102236]">
                              <input
                                type="checkbox"
                                checked={Boolean(manager.is_primary)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setForm((previous) => ({
                                      ...previous,
                                      property_managers: previous.property_managers.map((row) => ({ ...row, is_primary: row.clientKey === manager.clientKey })),
                                    }))
                                    return
                                  }
                                  updateArrayRow('property_managers', manager.clientKey, { is_primary: event.target.checked })
                                }}
                              />
                              Primary property manager
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#102236]">Additional Contacts</h3>
                        <p className="mt-1 text-sm text-slate-500">Optional finance, legal, facilities, accounts, or marketing contacts.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({ ...previous, additional_contacts: [...previous.additional_contacts, createAdditionalContactDraft()] }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Plus size={16} />
                        Add Contact
                      </button>
                    </div>
                    <div className="grid gap-4">
                      {form.additional_contacts.length ? form.additional_contacts.map((contact) => (
                        <article key={contact.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Contact Type
                              <select value={contact.contact_type} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { contact_type: event.target.value })} className={INPUT_CLASS}>
                                {LANDLORD_ADDITIONAL_CONTACT_TYPES.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Full Name<input value={contact.full_name} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { full_name: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Role<input value={contact.position} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { position: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Email<input type="email" value={contact.email} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { email: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mobile<input value={contact.mobile} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { mobile: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Notes<textarea value={contact.notes} onChange={(event) => updateArrayRow('additional_contacts', contact.clientKey, { notes: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                          </div>
                          <button type="button" onClick={() => setForm((previous) => ({ ...previous, additional_contacts: previous.additional_contacts.filter((row) => row.clientKey !== contact.clientKey) }))} className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </article>
                      )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">No optional contacts added yet.</p>}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeStepId === 'portfolio' ? (
                <div className="grid gap-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Home size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Portfolio & Properties</h2>
                      <p className="mt-1 text-sm text-slate-500">Describe the portfolio, then add the properties and current vacancies you want the brokerage to work on.</p>
                    </div>
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <h3 className="text-sm font-semibold text-[#102236]">What type of assets does this landlord own?</h3>
                    <p className="mt-1 text-sm text-slate-500">You can select more than one asset type.</p>
                    <div className="mt-4">
                      <MultiSelectPills
                        options={LANDLORD_PORTFOLIO_TYPE_OPTIONS}
                        values={form.portfolio.asset_types}
                        onToggle={(value) => updatePortfolio(
                          'asset_types',
                          form.portfolio.asset_types.includes(value)
                            ? form.portfolio.asset_types.filter((item) => item !== value)
                            : [...form.portfolio.asset_types, value],
                        )}
                      />
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Number of Properties<input value={form.portfolio.number_of_properties} onChange={(event) => updatePortfolio('number_of_properties', event.target.value)} className={INPUT_CLASS} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Estimated Total GLA<input value={form.portfolio.estimated_total_gla} onChange={(event) => updatePortfolio('estimated_total_gla', event.target.value)} className={INPUT_CLASS} placeholder="25000" /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Primary Regions<input value={(form.portfolio.primary_regions || []).join(', ')} onChange={(event) => updatePortfolio('primary_regions', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} className={INPUT_CLASS} placeholder="Sandton, Midrand, Pretoria" /></label>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Portfolio Notes<textarea value={form.portfolio.portfolio_notes} onChange={(event) => updatePortfolio('portfolio_notes', event.target.value)} rows={3} className={TEXTAREA_CLASS} /></label>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#102236]">Properties</h3>
                        <p className="mt-1 text-sm text-slate-500">Add properties now or leave them for the broker to build out later.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({ ...previous, properties: [...previous.properties, createPropertyDraft(previous.asset_managers, previous.property_managers)] }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Plus size={16} />
                        Add Property
                      </button>
                    </div>
                    <div className="grid gap-4">
                      {form.properties.length ? form.properties.map((property) => (
                        <article key={property.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#102236]">{property.property_name || 'New property'}</p>
                            <button type="button" onClick={() => setForm((previous) => ({ ...previous, properties: previous.properties.filter((row) => row.clientKey !== property.clientKey) }))} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Property Name<input value={property.property_name} onChange={(event) => updatePropertyRow(property.clientKey, { property_name: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Property Type
                              <select value={property.property_type} onChange={(event) => updatePropertyRow(property.clientKey, { property_type: event.target.value })} className={INPUT_CLASS}>
                                {LANDLORD_PROPERTY_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Address<textarea value={property.address} onChange={(event) => updatePropertyRow(property.clientKey, { address: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Suburb<input value={property.suburb} onChange={(event) => updatePropertyRow(property.clientKey, { suburb: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">City<input value={property.city} onChange={(event) => updatePropertyRow(property.clientKey, { city: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Province<input value={property.province} onChange={(event) => updatePropertyRow(property.clientKey, { province: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">GLA<input value={property.gla_m2} onChange={(event) => updatePropertyRow(property.clientKey, { gla_m2: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Ownership Status<input value={property.ownership_status} onChange={(event) => updatePropertyRow(property.clientKey, { ownership_status: event.target.value })} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Assigned Asset Manager
                              <select value={property.assigned_asset_manager_key} onChange={(event) => updatePropertyRow(property.clientKey, { assigned_asset_manager_key: event.target.value })} className={INPUT_CLASS}>
                                <option value="">Select asset manager</option>
                                {form.asset_managers.map((manager) => (
                                  <option key={manager.clientKey} value={manager.clientKey}>{manager.full_name || 'Asset manager'}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Assigned Property Manager
                              <select value={property.assigned_property_manager_key} onChange={(event) => updatePropertyRow(property.clientKey, { assigned_property_manager_key: event.target.value })} className={INPUT_CLASS}>
                                <option value="">Select property manager</option>
                                {form.property_managers.map((manager) => (
                                  <option key={manager.clientKey} value={manager.clientKey}>{manager.full_name || 'Property manager'}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Notes<textarea value={property.notes} onChange={(event) => updatePropertyRow(property.clientKey, { notes: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                          </div>

                          <section className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-[#102236]">Vacancies</h4>
                                <p className="mt-1 text-sm text-slate-500">Add the available space for this property if there is stock to market now.</p>
                              </div>
                              <button type="button" onClick={() => setForm((previous) => ({
                                ...previous,
                                properties: previous.properties.map((row) => row.clientKey !== property.clientKey
                                  ? row
                                  : { ...row, vacancies: [...row.vacancies, createVacancyDraft(previous.property_managers)] }),
                              }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                                <Plus size={16} />
                                Add Vacancy
                              </button>
                            </div>
                            <div className="grid gap-4">
                              {property.vacancies.length ? property.vacancies.map((vacancy) => (
                                <article key={vacancy.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-[#102236]">{vacancy.vacancy_name || 'New vacancy'}</p>
                                    <button type="button" onClick={() => setForm((previous) => ({
                                      ...previous,
                                      properties: previous.properties.map((row) => row.clientKey !== property.clientKey
                                        ? row
                                        : { ...row, vacancies: row.vacancies.filter((item) => item.clientKey !== vacancy.clientKey) }),
                                    }))} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Vacancy Name<input value={vacancy.vacancy_name} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { vacancy_name: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Unit / Floor / Shop Number<input value={vacancy.unit_or_floor} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { unit_or_floor: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Vacancy Type
                                      <select value={vacancy.vacancy_type} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { vacancy_type: event.target.value })} className={INPUT_CLASS}>
                                        {LANDLORD_VACANCY_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Available Area<input value={vacancy.available_area_m2} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { available_area_m2: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Rental per m²<input value={vacancy.rental_per_m2} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { rental_per_m2: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Operating Costs<input value={vacancy.operating_costs} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { operating_costs: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Availability Date<input type="date" value={vacancy.availability_date} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { availability_date: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Lease Term Preference<input value={vacancy.lease_term_preference} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { lease_term_preference: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Assigned Broker<input value={vacancy.assigned_broker} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { assigned_broker: event.target.value })} className={INPUT_CLASS} /></label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236]">Assigned Property Manager
                                      <select value={vacancy.assigned_property_manager_key} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { assigned_property_manager_key: event.target.value })} className={INPUT_CLASS}>
                                        <option value="">Select property manager</option>
                                        {form.property_managers.map((manager) => (
                                          <option key={manager.clientKey} value={manager.clientKey}>{manager.full_name || 'Property manager'}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Notes<textarea value={vacancy.notes} onChange={(event) => updateVacancyRow(property.clientKey, vacancy.clientKey, { notes: event.target.value })} rows={2} className={TEXTAREA_CLASS} /></label>
                                  </div>
                                </article>
                              )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">No vacancies added for this property yet.</p>}
                            </div>
                          </section>
                        </article>
                      )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">No properties added yet.</p>}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeStepId === 'mandates' ? (
                <div className="grid gap-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Building2 size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Mandates & Broker Relationships</h2>
                      <p className="mt-1 text-sm text-slate-500">Tell us whether you want to create mandate context now, and note any existing broker relationships already in play.</p>
                    </div>
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <h3 className="text-sm font-semibold text-[#102236]">Mandate Request</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {LANDLORD_MANDATE_OPTIONS.map((option) => {
                        const active = form.mandate_request === option.value
                        return (
                          <button key={option.value} type="button" onClick={() => setForm((previous) => ({ ...previous, mandate_request: option.value }))} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-[#102b46] bg-[#f5f9ff]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <p className="text-sm font-semibold text-[#102236]">{option.label}</p>
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  {['leasing', 'sales', 'both'].includes(form.mandate_request) ? (
                    <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-[#102236]">Mandate Details</h3>
                          <p className="mt-1 text-sm text-slate-500">Add one or more leasing or sales mandate records.</p>
                        </div>
                        <button type="button" onClick={() => setForm((previous) => ({ ...previous, mandates: [...previous.mandates, createMandateDraft(previous.properties)] }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                          <Plus size={16} />
                          Add Mandate
                        </button>
                      </div>
                      <div className="grid gap-4">
                        {form.mandates.length ? form.mandates.map((mandate, index) => (
                          <article key={`${mandate.id || 'mandate'}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[#102236]">{titleize(mandate.mandate_kind)} mandate</p>
                              <button type="button" onClick={() => setForm((previous) => ({ ...previous, mandates: previous.mandates.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mandate Kind
                                <select value={mandate.mandate_kind} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, mandate_kind: event.target.value } : row) }))} className={INPUT_CLASS}>
                                  <option value="leasing">Leasing Mandate</option>
                                  <option value="sales">Sales Mandate</option>
                                </select>
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mandate Type
                                <select value={mandate.mandate_type} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, mandate_type: event.target.value } : row) }))} className={INPUT_CLASS}>
                                  {LANDLORD_MANDATE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Start Date<input type="date" value={mandate.start_date} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, start_date: event.target.value } : row) }))} className={INPUT_CLASS} /></label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Expiry Date<input type="date" value={mandate.expiry_date} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, expiry_date: event.target.value } : row) }))} className={INPUT_CLASS} /></label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Commission Percentage / Fee Structure<input value={mandate.commission_structure} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, commission_structure: event.target.value } : row) }))} className={INPUT_CLASS} /></label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Brokerage Assigned<input value={mandate.brokerage_assigned} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, brokerage_assigned: event.target.value } : row) }))} className={INPUT_CLASS} /></label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236]">Broker Assigned<input value={mandate.broker_assigned} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, broker_assigned: event.target.value } : row) }))} className={INPUT_CLASS} /></label>
                              <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Mandate Notes<textarea value={mandate.notes} onChange={(event) => setForm((previous) => ({ ...previous, mandates: previous.mandates.map((row, itemIndex) => itemIndex === index ? { ...row, notes: event.target.value } : row) }))} rows={2} className={TEXTAREA_CLASS} /></label>
                            </div>
                          </article>
                        )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">No mandates added yet.</p>}
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#102236]">Existing Broker Relationships</h3>
                        <p className="mt-1 text-sm text-slate-500">Optional, but helpful for future relationship intelligence and mandate planning.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({
                        ...previous,
                        broker_relationships: {
                          ...previous.broker_relationships,
                          has_existing_relationships: true,
                          relationships: [...previous.broker_relationships.relationships, createRelationshipDraft()],
                        },
                      }))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                        <Plus size={16} />
                        Add Relationship
                      </button>
                    </div>
                    <div className="grid gap-4">
                      {form.broker_relationships.relationships.length ? form.broker_relationships.relationships.map((relationship) => (
                        <article key={relationship.clientKey} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Brokerage Name<input value={relationship.brokerage_name} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, brokerage_name: event.target.value } : row),
                              },
                            }))} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Broker Name<input value={relationship.broker_name} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, broker_name: event.target.value } : row),
                              },
                            }))} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Broker Email<input type="email" value={relationship.broker_email} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, broker_email: event.target.value } : row),
                              },
                            }))} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Broker Mobile<input value={relationship.broker_mobile} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, broker_mobile: event.target.value } : row),
                              },
                            }))} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Relationship Type
                              <select value={relationship.relationship_type} onChange={(event) => setForm((previous) => ({
                                ...previous,
                                broker_relationships: {
                                  ...previous.broker_relationships,
                                  relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, relationship_type: event.target.value } : row),
                                },
                              }))} className={INPUT_CLASS}>
                                {LANDLORD_RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236]">Mandate Type<input value={relationship.mandate_type} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, mandate_type: event.target.value } : row),
                              },
                            }))} className={INPUT_CLASS} /></label>
                            <label className="grid gap-1 text-sm font-semibold text-[#102236] md:col-span-2">Notes<textarea value={relationship.notes} onChange={(event) => setForm((previous) => ({
                              ...previous,
                              broker_relationships: {
                                ...previous.broker_relationships,
                                relationships: previous.broker_relationships.relationships.map((row) => row.clientKey === relationship.clientKey ? { ...row, notes: event.target.value } : row),
                              },
                            }))} rows={2} className={TEXTAREA_CLASS} /></label>
                          </div>
                          <button type="button" onClick={() => setForm((previous) => ({
                            ...previous,
                            broker_relationships: {
                              ...previous.broker_relationships,
                              relationships: previous.broker_relationships.relationships.filter((row) => row.clientKey !== relationship.clientKey),
                            },
                          }))} className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </article>
                      )) : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">No broker relationships added yet.</p>}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeStepId === 'documents' ? (
                <div className="grid gap-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><FileText size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Documents</h2>
                      <p className="mt-1 text-sm text-slate-500">Upload the required landlord documents. You can submit even if a few items still need to follow later.</p>
                    </div>
                  </div>
                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <h3 className="text-sm font-semibold text-[#102236]">Required Documents</h3>
                    <div className="mt-4 grid gap-3">
                      {requiredDocuments.map((document) => {
                        const uploaded = (workspace?.documents || []).some((row) => {
                          const key = normalizeText(row.metadata_json?.documentKey || row.document_name || row.category).toLowerCase()
                          return key === document.key || key === document.label.toLowerCase()
                        })
                        return (
                          <div key={document.key} className={`rounded-2xl border px-4 py-3 ${uploaded ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                            <p className="text-sm font-semibold text-[#102236]">{document.label}</p>
                            <p className="mt-1 text-sm text-slate-500">{uploaded ? 'Uploaded' : 'Outstanding'}</p>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <h3 className="text-sm font-semibold text-[#102236]">Upload Document</h3>
                    <form onSubmit={handleUpload} className="mt-4 grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-1 text-sm font-semibold text-[#102236]">Document Request
                          <select value={uploadState.documentRequestId} onChange={(event) => {
                            const request = (workspace?.documentRequests || []).find((row) => row.id === event.target.value)
                            setUploadState((previous) => ({
                              ...previous,
                              documentRequestId: event.target.value,
                              category: request?.category || previous.category,
                            }))
                          }} className={INPUT_CLASS}>
                            <option value="">General upload</option>
                            {(workspace?.documentRequests || []).map((request) => (
                              <option key={request.id} value={request.id}>{request.document_name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-[#102236]">Category
                          <input value={uploadState.category} onChange={(event) => setUploadState((previous) => ({ ...previous, category: event.target.value }))} className={INPUT_CLASS} />
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm font-semibold text-[#102236]">Document
                        <input type="file" onChange={(event) => setUploadState((previous) => ({ ...previous, file: event.target.files?.[0] || null }))} className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600" />
                      </label>
                      <button type="submit" disabled={uploading || !uploadState.file} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {uploading ? 'Uploading...' : 'Upload Document'}
                      </button>
                    </form>
                  </section>
                </div>
              ) : null}

              {activeStepId === 'review' ? (
                <div className="grid gap-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><CheckCircle2 size={18} /></span>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Review & Submit</h2>
                      <p className="mt-1 text-sm text-slate-500">Check the summary below, then submit the landlord onboarding pack to your broker.</p>
                    </div>
                  </div>
                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {summaryRows.map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                          <p className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-sm font-semibold text-[#102236]">Supporting Notes</p>
                    <textarea value={form.onboarding_notes} onChange={(event) => setForm((previous) => ({ ...previous, onboarding_notes: event.target.value }))} rows={4} className={`mt-3 ${TEXTAREA_CLASS}`} placeholder="Anything the broker should know about authority, portfolio structure, timing, or pending information." />
                  </section>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {notice ? <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">{notice}</span> : null}
                  {error ? <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700">{error}</span> : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button type="button" onClick={handleSaveDraft} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save and continue later
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveStep((previous) => Math.max(0, previous - 1))} disabled={activeStep === 0 || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
                      <ChevronLeft size={16} />
                      Back
                    </button>
                    {activeStep < steps.length - 1 ? (
                      <button type="button" onClick={() => setActiveStep((previous) => Math.min(steps.length - 1, previous + 1))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
                        Next
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button type="button" onClick={handleSubmit} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Submit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="grid gap-4 self-start">
            <section className={SECTION_CARD}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Mail size={18} /></span>
                <div>
                  <h2 className="text-sm font-semibold text-[#102236]">Broker Contact</h2>
                  <p className="mt-1 text-sm text-slate-500">Reach out if you need help with the onboarding pack.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-sm font-semibold text-[#102236]">{normalizeText(brokerMeta.broker_name) || 'Your broker'}</p>
                  <p className="mt-1 text-sm text-slate-500">{normalizeText(brokerMeta.broker_email) || 'Email shared in the onboarding email'}</p>
                  <p className="mt-1 text-sm text-slate-500">{normalizeText(brokerMeta.broker_phone) || ''}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Last opened</p>
                  <p className="mt-1 text-sm font-semibold text-[#102236]">{formatDate(workspace?.onboarding?.last_opened_at) || 'This session'}</p>
                </div>
              </div>
            </section>

            <section className={SECTION_CARD}>
              <h2 className="text-sm font-semibold text-[#102236]">Live Summary</h2>
              <div className="mt-4 grid gap-3">
                {summaryRows.slice(0, 6).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Properties</p>
                  <p className="mt-1 text-sm font-semibold text-[#102236]">{formatNumber(form.properties.length)}</p>
                </div>
              </div>
            </section>
          </aside>
        </section>

        {submitted ? (
          <section className={SECTION_CARD}>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={20} />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Submission received</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Your broker has the latest landlord onboarding information. Any outstanding fields or documents will show up as follow-up requests instead of blocking the whole submission.
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}

export default CommercialLandlordOnboardingPage
