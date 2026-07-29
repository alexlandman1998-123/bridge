import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  Building2,
  CheckCircle2,
  CircleHelp,
  Home,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION,
  getOrCreateAgencyIntakeIdempotencyKey,
  readAgencyIntakeAttribution,
  resolveAgencyPublicIntake,
  rotateAgencyIntakeIdempotencyKey,
  submitAgencyPublicIntake,
} from '../services/agencyPublicIntakeService'

const BACKGROUND_IMAGES = {
  buy: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=82',
  sell: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=82',
}

const INITIAL_FORM = Object.freeze({
  name: '',
  email: '',
  phone: '',
  budgetMin: '',
  budgetMax: '',
  areas: '',
  propertyType: '',
  bedrooms: '',
  bathrooms: '',
  financeStatus: '',
  buyerTimeline: '',
  propertyAddress: '',
  suburb: '',
  sellerPropertyType: '',
  estimatedValue: '',
  sellerTimeline: '',
  message: '',
  privacyConsent: false,
  website: '',
})

const PROPERTY_TYPES = ['', 'House', 'Apartment', 'Townhouse', 'Vacant Land', 'Commercial', 'Development']
const FINANCE_STATUSES = [
  ['', 'Please select'],
  ['cash', 'Cash buyer'],
  ['bond_needed', 'Bond needed'],
  ['pre_approved', 'Pre-approved'],
  ['bond_in_progress', 'Bond in progress'],
  ['not_ready', 'Still exploring'],
]
const TIMELINES = [
  ['', 'Please select'],
  ['now', 'Immediately'],
  ['1_3_months', '1-3 months'],
  ['3_6_months', '3-6 months'],
  ['6_plus_months', '6+ months'],
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = '') {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function normalizeThemeColour(value = '', fallback = '') {
  const text = normalizeText(value)
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text.slice(1).split('').map((char) => `${char}${char}`).join('')}`
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  return fallback
}

function hexToRgb(hex = '#102f34') {
  const safeHex = normalizeThemeColour(hex, '#102f34').slice(1)
  const value = Number.parseInt(safeHex, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hexToRgba(hex = '#102f34', alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getContrastTextColour(hex = '#f7cf22') {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#102f34' : '#ffffff'
}

function buildTheme(agency = {}) {
  const primary = normalizeThemeColour(agency.primaryColour, '#102f34')
  const secondary = normalizeThemeColour(agency.secondaryColour, '#173f45')
  const accent = normalizeThemeColour(agency.accentColour, '#f7cf22')
  return {
    primary,
    secondary,
    accent,
    accentText: getContrastTextColour(accent),
    overlay: `linear-gradient(115deg, ${hexToRgba(primary, 0.91)} 0%, ${hexToRgba(secondary, 0.79)} 48%, ${hexToRgba(primary, 0.58)} 100%)`,
    lowerOverlay: `linear-gradient(180deg, ${hexToRgba(primary, 0.08)} 0%, ${hexToRgba(primary, 0.74)} 100%)`,
  }
}

function FieldLabel({ children, required = false }) {
  return (
    <span className="text-[13px] font-semibold text-slate-700">
      {children}{required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
    </span>
  )
}

function TextInput({ label, required = false, className = '', ...props }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        {...props}
        className="min-h-12 rounded-lg border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--intake-primary)] focus:ring-4 focus:ring-slate-100"
      />
    </label>
  )
}

function SelectInput({ label, required = false, children, className = '', ...props }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        {...props}
        className="min-h-12 rounded-lg border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-[var(--intake-primary)] focus:ring-4 focus:ring-slate-100"
      >
        {children}
      </select>
    </label>
  )
}

function BrandMark({ agency = {} }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const name = normalizeText(agency.name) || 'Agency'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  if (agency.logoUrl && !logoFailed) {
    return (
      <img
        src={agency.logoUrl}
        alt={`${name} logo`}
        className="block h-14 max-w-[170px] object-contain drop-shadow-[0_10px_26px_rgba(0,0,0,0.3)] sm:h-16 sm:max-w-[220px]"
        onError={() => setLogoFailed(true)}
      />
    )
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/20 bg-white/12 text-xl font-bold text-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] sm:h-20 sm:w-20">
      {initials || <Building2 size={28} aria-hidden="true" />}
    </div>
  )
}

function LoadingState() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#edf2ee] px-5 text-[#173238]">
      <div className="text-center" role="status">
        <LoaderCircle className="mx-auto animate-spin text-[#173f45]" size={30} aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-slate-600">Preparing the agency intake page...</p>
      </div>
    </main>
  )
}

function UnavailableState({ error, onRetry }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#edf2ee] px-5 py-10 text-[#173238]">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.09)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <CircleHelp size={27} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">This intake page is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error || 'The link may be incorrect or temporarily disabled.'}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#173f45] px-5 text-sm font-semibold text-white transition hover:bg-[#102f34] focus:outline-none focus:ring-4 focus:ring-[#173f45]/20"
        >
          <RefreshCw size={17} aria-hidden="true" /> Try again
        </button>
      </section>
    </main>
  )
}

function IntentChoice({ intent, title, copy, icon, image, onClick }) {
  const Icon = icon

  return (
    <button
      type="button"
      onClick={() => onClick(intent)}
      className="group relative min-h-[320px] overflow-hidden rounded-lg border border-white/15 bg-white/10 text-left text-white shadow-[0_30px_90px_rgba(0,0,0,0.22)] transition hover:-translate-y-1 hover:border-white/30 focus:outline-none focus:ring-4 focus:ring-white/30"
    >
      <span className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${image}")` }} />
      <span className="absolute inset-0 bg-black/35" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 to-black/28" />
      <span className="relative flex min-h-[320px] flex-col justify-end p-5 sm:p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/44 text-[var(--intake-accent)] backdrop-blur">
          <Icon size={24} aria-hidden="true" />
        </span>
        <span className="mt-5 block text-3xl font-semibold leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">{title}</span>
        <span className="mt-3 block max-w-[360px] text-sm font-medium leading-6 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.72)]">{copy}</span>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--intake-accent)]">
          Start <ArrowRight size={17} aria-hidden="true" />
        </span>
      </span>
    </button>
  )
}

function SuccessState({ agencyName = '', intent = '', duplicate = false, onReset }) {
  return (
    <section className="mx-auto w-full max-w-[620px] rounded-lg border border-white/80 bg-white p-6 text-center shadow-[0_24px_70px_rgba(30,55,58,0.10)] sm:p-8" aria-live="polite">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <CheckCircle2 size={32} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-[#173238]">Enquiry received</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {duplicate
          ? 'This enquiry was already received, so no duplicate was queued.'
        : `${agencyName || 'The agency'} has received your details and can follow up.`}
      </p>
      <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Type:</span> {intent === 'sell' ? 'Selling' : 'Buying'}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-[#173238] transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
      >
        Start another enquiry <ArrowRight size={17} aria-hidden="true" />
      </button>
    </section>
  )
}

export default function PublicAgencyIntakePage() {
  const { agencySlug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [intake, setIntake] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [intent, setIntent] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedDuplicate, setSubmittedDuplicate] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [queryIntentApplied, setQueryIntentApplied] = useState(false)

  const attribution = useMemo(() => readAgencyIntakeAttribution(searchParams), [searchParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    resolveAgencyPublicIntake(agencySlug)
      .then((resolved) => {
        if (!cancelled) setIntake(resolved)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || 'The link may be incorrect or temporarily disabled.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agencySlug, reloadKey])

  useEffect(() => {
    if (!intake?.agency?.name) return undefined
    const previousTitle = document.title
    document.title = `${intake.agency.name} | Buyer and seller intake`
    return () => {
      document.title = previousTitle
    }
  }, [intake?.agency?.name])

  const enabledIntents = useMemo(() => (
    intake?.intake?.enabledIntents?.length ? intake.intake.enabledIntents : ['buy', 'sell']
  ), [intake?.intake?.enabledIntents])
  const theme = useMemo(() => buildTheme(intake?.agency || {}), [intake?.agency])

  useEffect(() => {
    if (!intake || queryIntentApplied || intent) return
    const requestedIntent = normalizeText(searchParams.get('intent')).toLowerCase()
    if (['buy', 'sell'].includes(requestedIntent) && enabledIntents.includes(requestedIntent)) {
      setIntent(requestedIntent)
    }
    setQueryIntentApplied(true)
  }, [enabledIntents, intake, intent, queryIntentApplied, searchParams])

  function retryLoad() {
    setReloadKey((value) => value + 1)
  }

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (formError) setFormError('')
  }

  function chooseIntent(nextIntent) {
    setIntent(nextIntent)
    setForm(INITIAL_FORM)
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetFlow() {
    if (intent) rotateAgencyIntakeIdempotencyKey(agencySlug, intent)
    setQueryIntentApplied(true)
    setIntent('')
    setForm(INITIAL_FORM)
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validateForm() {
    if (!normalizeText(form.name)) return 'Please enter your name.'
    if (!normalizeText(form.email) && !normalizeText(form.phone)) return 'Please provide an email address or mobile number.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(form.email))) return 'Please enter a valid email address.'
    if (intent === 'buy') {
      const min = normalizeNumber(form.budgetMin)
      const max = normalizeNumber(form.budgetMax)
      if (min !== null && max !== null && min > max) return 'Minimum budget cannot be greater than maximum budget.'
    }
    if (!form.privacyConsent) return 'Please accept the privacy consent to send your enquiry.'
    return ''
  }

  async function submitEnquiry(event) {
    event.preventDefault()
    if (submitting || !intent) return

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      const idempotencyKey = getOrCreateAgencyIntakeIdempotencyKey(agencySlug, intent)
      const payload = {
        slug: agencySlug,
        intent,
        idempotencyKey,
        contact: {
          name: normalizeText(form.name),
          email: normalizeText(form.email) || null,
          phone: normalizeText(form.phone) || null,
        },
        message: normalizeText(form.message) || null,
        privacyConsent: true,
        privacyPolicyVersion: intake?.intake?.privacyPolicyVersion || AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION,
        website: form.website,
        sourceChannel: attribution.sourceChannel,
        campaignCode: attribution.campaignCode,
        utm: attribution.utm,
        selectedListings: attribution.selectedListings,
        context: attribution.context,
      }

      if (intent === 'buy') {
        payload.requirement = {
          budgetMin: normalizeNumber(form.budgetMin),
          budgetMax: normalizeNumber(form.budgetMax),
          areas: normalizeText(form.areas),
          propertyType: normalizeText(form.propertyType),
          bedroomsMin: normalizeText(form.bedrooms),
          bathroomsMin: normalizeText(form.bathrooms),
          financeStatus: normalizeText(form.financeStatus),
          timeline: normalizeText(form.buyerTimeline),
        }
        payload.budgetMin = payload.requirement.budgetMin
        payload.budgetMax = payload.requirement.budgetMax
      } else {
        payload.seller = {
          propertyAddress: normalizeText(form.propertyAddress),
          suburb: normalizeText(form.suburb),
          propertyType: normalizeText(form.sellerPropertyType),
          estimatedValue: normalizeNumber(form.estimatedValue),
          timeline: normalizeText(form.sellerTimeline),
        }
      }

      const result = await submitAgencyPublicIntake({ slug: agencySlug, idempotencyKey, payload })
      if (!result.accepted) throw new Error('We could not confirm your enquiry. Please try again.')
      setSubmittedDuplicate(Boolean(result.duplicate))
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setFormError(error?.message || 'We could not send your enquiry right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState />
  if (!intake || loadError) return <UnavailableState error={loadError} onRetry={retryLoad} />

  const agencyName = intake.agency?.name || 'Your agency'
  const pageStyle = {
    '--intake-primary': theme.primary,
    '--intake-secondary': theme.secondary,
    '--intake-accent': theme.accent,
    '--intake-accent-text': theme.accentText,
    backgroundColor: theme.primary,
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden text-white antialiased" style={pageStyle}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${BACKGROUND_IMAGES[intent || 'buy']}")` }} />
      <div className="absolute inset-0" style={{ background: theme.overlay }} />
      <div className="absolute inset-0" style={{ background: theme.lowerOverlay }} />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1240px] flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <BrandMark agency={intake.agency} />
          <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-white/78 drop-shadow sm:inline">Powered by ARCH9</span>
        </header>

        <section className="grid flex-1 items-center gap-8 py-9 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1fr)] lg:gap-12">
          <div className="max-w-[620px]">
            {intent ? (
              <button
                type="button"
                onClick={resetFlow}
                className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/12 bg-white/10 px-3 text-sm font-semibold text-white/82 backdrop-blur transition hover:bg-white/14 focus:outline-none focus:ring-4 focus:ring-white/20"
              >
                <ArrowLeft size={17} aria-hidden="true" /> Back
              </button>
            ) : null}
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--intake-accent)]">Agency Intake</p>
            <h1 className="mt-4 text-[3rem] font-semibold leading-none text-white sm:text-[4.3rem]">
              {submitted ? 'Thank you.' : intent === 'sell' ? 'Tell us about your property.' : intent === 'buy' ? 'Tell us what you want to buy.' : intake.intake.heading || 'What can we help you with?'}
            </h1>
            <p className={`${submitted || intent ? 'block' : 'hidden'} mt-5 max-w-[560px] text-base font-medium leading-7 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:block sm:text-lg sm:leading-8`}>
              {submitted
                ? `${agencyName} has received your details.`
                : intent
                  ? 'Share the basics and the team will pick it up.'
                  : intake.intake.introduction || 'Choose the path that fits you and share a few details.'}
            </p>
            <div className="mt-7 hidden gap-3 sm:grid sm:grid-cols-3">
              {[
                { icon: BadgeCheck, label: 'Quick details' },
                { icon: Sparkles, label: 'Personal response' },
                { icon: ShieldCheck, label: 'Secure enquiry' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex min-h-[60px] items-center gap-3 rounded-lg border border-white/20 bg-black/20 px-3 backdrop-blur">
                    <Icon className="text-[var(--intake-accent)]" size={18} aria-hidden="true" />
                    <span className="text-sm font-semibold text-white">{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full">
            {submitted ? (
              <SuccessState agencyName={agencyName} intent={intent} duplicate={submittedDuplicate} onReset={resetFlow} />
            ) : intent ? (
              <section className="rounded-lg border border-white/18 bg-white p-5 text-[#173238] shadow-[0_30px_90px_rgba(0,0,0,0.24)] sm:p-6">
                <form className="space-y-5" onSubmit={submitEnquiry} noValidate>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{intent === 'sell' ? 'Seller lead' : 'Buyer lead'}</p>
                    <h2 className="mt-1 text-2xl font-semibold">{intent === 'sell' ? 'Selling details' : 'Buying details'}</h2>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextInput label="Full name" required value={form.name} onChange={(event) => updateForm('name', event.target.value)} autoComplete="name" maxLength={240} placeholder="Your name" />
                    <TextInput label="Mobile number" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} autoComplete="tel" inputMode="tel" maxLength={40} placeholder="082 123 4567" />
                  </div>
                  <TextInput label="Email address" value={form.email} onChange={(event) => updateForm('email', event.target.value)} autoComplete="email" inputMode="email" maxLength={254} placeholder="name@example.com" />
                  <p className="-mt-3 text-xs leading-5 text-slate-500">Please provide at least one contact method.</p>

                  {intent === 'buy' ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextInput label="Minimum budget" value={form.budgetMin} onChange={(event) => updateForm('budgetMin', event.target.value)} type="number" inputMode="decimal" min="0" step="50000" placeholder="1500000" />
                        <TextInput label="Maximum budget" value={form.budgetMax} onChange={(event) => updateForm('budgetMax', event.target.value)} type="number" inputMode="decimal" min="0" step="50000" placeholder="2500000" />
                      </div>
                      <TextInput label="Preferred areas" value={form.areas} onChange={(event) => updateForm('areas', event.target.value)} maxLength={500} placeholder="Suburbs or areas" />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <SelectInput label="Property type" value={form.propertyType} onChange={(event) => updateForm('propertyType', event.target.value)}>
                          {PROPERTY_TYPES.map((type) => <option key={type || 'any'} value={type}>{type || 'Any type'}</option>)}
                        </SelectInput>
                        <SelectInput label="Bedrooms" value={form.bedrooms} onChange={(event) => updateForm('bedrooms', event.target.value)}>
                          <option value="">Any</option>
                          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}+</option>)}
                        </SelectInput>
                        <SelectInput label="Bathrooms" value={form.bathrooms} onChange={(event) => updateForm('bathrooms', event.target.value)}>
                          <option value="">Any</option>
                          {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}+</option>)}
                        </SelectInput>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SelectInput label="Finance" value={form.financeStatus} onChange={(event) => updateForm('financeStatus', event.target.value)}>
                          {FINANCE_STATUSES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                        </SelectInput>
                        <SelectInput label="Timeline" value={form.buyerTimeline} onChange={(event) => updateForm('buyerTimeline', event.target.value)}>
                          {TIMELINES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                        </SelectInput>
                      </div>
                    </>
                  ) : (
                    <>
                      <TextInput label="Property address" value={form.propertyAddress} onChange={(event) => updateForm('propertyAddress', event.target.value)} maxLength={1000} placeholder="Address or complex name" />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextInput label="Suburb" value={form.suburb} onChange={(event) => updateForm('suburb', event.target.value)} maxLength={160} placeholder="Suburb" />
                        <SelectInput label="Property type" value={form.sellerPropertyType} onChange={(event) => updateForm('sellerPropertyType', event.target.value)}>
                          {PROPERTY_TYPES.map((type) => <option key={type || 'any'} value={type}>{type || 'Please select'}</option>)}
                        </SelectInput>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextInput label="Estimated value" value={form.estimatedValue} onChange={(event) => updateForm('estimatedValue', event.target.value)} type="number" inputMode="decimal" min="0" step="50000" placeholder="2500000" />
                        <SelectInput label="Timeline" value={form.sellerTimeline} onChange={(event) => updateForm('sellerTimeline', event.target.value)}>
                          {TIMELINES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                        </SelectInput>
                      </div>
                    </>
                  )}

                  <label className="grid gap-2">
                    <FieldLabel>Notes</FieldLabel>
                    <textarea
                      rows={4}
                      maxLength={5000}
                      value={form.message}
                      onChange={(event) => updateForm('message', event.target.value)}
                      className="resize-y rounded-lg border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--intake-primary)] focus:ring-4 focus:ring-slate-100"
                      placeholder="Anything useful for the agency"
                    />
                  </label>

                  <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                    <label>
                      Website
                      <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateForm('website', event.target.value)} />
                    </label>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                    <input
                      type="checkbox"
                      checked={form.privacyConsent}
                      onChange={(event) => updateForm('privacyConsent', event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[var(--intake-primary)]"
                    />
                    <span className="text-[13px] leading-5 text-slate-600">
                      {intake.intake.consentCopy || `I consent to ${agencyName} collecting and using these details to respond to my enquiry.`}
                    </span>
                  </label>

                  {formError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800" role="alert">
                      {formError}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-[var(--intake-accent)] px-6 text-base font-semibold text-[var(--intake-accent-text)] shadow-[0_14px_30px_rgba(15,23,42,0.16)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-wait disabled:opacity-70"
                  >
                    {submitting ? (
                      <><LoaderCircle className="animate-spin" size={19} aria-hidden="true" /> Sending...</>
                    ) : (
                      <>Send enquiry <ArrowRight size={19} aria-hidden="true" /></>
                    )}
                  </button>
                </form>
              </section>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {enabledIntents.includes('buy') ? (
                  <IntentChoice
                    intent="buy"
                    title={intake.intake.buyerCtaLabel || 'I am looking to buy'}
                    copy="Share your budget, ideal areas and property preferences."
                    icon={Search}
                    image={BACKGROUND_IMAGES.buy}
                    onClick={chooseIntent}
                  />
                ) : null}
                {enabledIntents.includes('sell') ? (
                  <IntentChoice
                    intent="sell"
                    title={intake.intake.sellerCtaLabel || 'I am looking to sell'}
                    copy="Share your property details and selling timeline."
                    icon={Home}
                    image={BACKGROUND_IMAGES.sell}
                    onClick={chooseIntent}
                  />
                ) : null}
              </div>
            )}
          </div>
        </section>

        <footer className="grid gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs font-medium text-white/82 sm:grid-cols-3">
          <span className="inline-flex items-center gap-2"><MapPin size={14} aria-hidden="true" /> {intake.agency?.website || agencyName}</span>
          <span className="inline-flex items-center gap-2"><BedDouble size={14} aria-hidden="true" /> Buyer requirements</span>
          <span className="inline-flex items-center gap-2"><Bath size={14} aria-hidden="true" /> Seller enquiries</span>
        </footer>
      </div>
    </main>
  )
}
