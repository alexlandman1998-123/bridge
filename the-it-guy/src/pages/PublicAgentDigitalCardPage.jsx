import {
  Bath,
  BedDouble,
  Building2,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  Home,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Tag,
  UserPlus,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  recordAgentDigitalCardEventSoon,
  resolveAgencyPublicAgentCard,
  resolveAgencyPublicCardListings,
  AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION,
  getOrCreateAgencyIntakeIdempotencyKey,
  rotateAgencyIntakeIdempotencyKey,
  submitAgencyPublicIntake,
} from '../services/agencyPublicIntakeService'
import {
  buildAgentDigitalCardFileBaseName,
  buildAgentDigitalCardIntakeUrl,
  buildAgentDigitalCardShareText,
  buildAgentDigitalCardVcard,
  downloadAgentDigitalCardTextFile,
  readAgentDigitalCardAttribution,
} from '../services/agentDigitalCardShareService'
import Modal from '../components/ui/Modal'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeTextList(value = [], limit = 8) {
  const values = Array.isArray(value) ? value : []
  return [...new Set(values.map(normalizeText).filter(Boolean))].slice(0, limit)
}

function normalizeThemeColour(value = '', fallback = '') {
  const text = normalizeText(value)
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text.slice(1).split('').map((char) => `${char}${char}`).join('')}`
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  return fallback
}

function hexToRgb(hex = '#102236') {
  const safeHex = normalizeThemeColour(hex, '#102236').slice(1)
  const value = Number.parseInt(safeHex, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function hexToRgba(hex = '#102236', alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getContrastTextColour(hex = '#f5b83c') {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#102236' : '#ffffff'
}

function formatCurrency(value = null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function formatLocation(listing = {}) {
  return [listing.suburb, listing.city || listing.province].map(normalizeText).filter(Boolean).join(', ')
}

function formatDisplayRole(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (text === text.toLowerCase()) {
    return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  }
  return text
}

function buildTheme(agency = {}) {
  const primary = normalizeThemeColour(agency.primaryColour, '#102236')
  const secondary = normalizeThemeColour(agency.secondaryColour, '#21445f')
  const accent = normalizeThemeColour(agency.accentColour, '#f5b83c')
  return {
    primary,
    secondary,
    accent,
    accentText: getContrastTextColour(accent),
    hero: `linear-gradient(135deg, ${hexToRgba(primary, 0.96)} 0%, ${hexToRgba(secondary, 0.88)} 100%)`,
  }
}

function normalizePhoneHref(value = '') {
  const text = normalizeText(value).replace(/[^\d+]/g, '')
  return text ? `tel:${text}` : ''
}

function normalizeWhatsAppHref(value = '', fallbackText = '') {
  const digits = normalizeText(value).replace(/[^\d]/g, '')
  if (digits) return `https://wa.me/${digits}`
  return fallbackText ? `https://wa.me/?text=${encodeURIComponent(fallbackText)}` : ''
}

function normalizeExternalUrl(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function RoundContactLink({ icon: Icon, label, href = '', onClick = null }) {
  const icon = Icon ? createElement(Icon, { size: 25, strokeWidth: 2.1 }) : null
  const disabled = !href && !onClick
  const className = `group flex w-full min-w-0 flex-col items-center gap-2.5 text-center ${disabled ? 'pointer-events-none opacity-45' : ''}`
  const content = (
    <>
      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[var(--card-primary)] text-white shadow-[0_12px_28px_rgba(6,23,53,0.2)] ring-1 ring-white transition group-hover:-translate-y-0.5 group-hover:brightness-110 sm:h-16 sm:w-16">
        {icon}
      </span>
      <span className="text-[0.78rem] font-semibold leading-tight text-[#071633] sm:text-sm">{label}</span>
    </>
  )

  if (!href) {
    return (
      <button type="button" className={className} onClick={disabled ? undefined : onClick || undefined}>
        {content}
      </button>
    )
  }

  return (
    <a className={className} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined} onClick={onClick || undefined}>
      {content}
    </a>
  )
}

function IntentCta({ icon: Icon, title, subtitle, onClick = null, tone = 'primary' }) {
  const icon = Icon ? createElement(Icon, { size: 27, strokeWidth: 1.9 }) : null
  const toneClass = tone === 'accent'
    ? 'bg-[linear-gradient(115deg,#c91643_0%,#d84547_48%,#d69b22_100%)] text-white shadow-[0_16px_34px_rgba(184,47,47,0.2)]'
    : 'bg-[linear-gradient(135deg,var(--card-primary)_0%,var(--card-secondary)_100%)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.22)]'
  const secondaryTextClass = 'text-white/78'
  const iconBorderClass = 'border-white/80 text-white'

  return (
    <button
      type="button"
      onClick={onClick || undefined}
      className={`group flex min-h-[88px] w-full min-w-0 items-center gap-4 rounded-[10px] px-5 py-4 text-left transition hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[var(--card-primary)]/20 ${toneClass}`}
    >
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${iconBorderClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.08rem] font-semibold leading-6 sm:text-xl">{title}</span>
        <span className={`mt-0.5 block text-[0.82rem] leading-5 sm:text-sm ${secondaryTextClass}`}>{subtitle}</span>
      </span>
      <ChevronRight className="shrink-0 transition group-hover:translate-x-1" size={28} strokeWidth={2.2} />
    </button>
  )
}

function ListingCard({ listing, intakeSlug = '', attributionSearch = '', onTrack = () => {} }) {
  const price = formatCurrency(listing.askingPrice)
  const location = formatLocation(listing)
  const enquiryUrl = buildAgentDigitalCardIntakeUrl({
    cardSlug: intakeSlug,
    intent: 'buy',
    listing,
    search: attributionSearch,
  })

  return (
    <article className="w-[76vw] min-w-[250px] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-[10px] border border-[#e4e7ec] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.09)]">
      <div className="relative aspect-[1.52/1] bg-slate-100">
        <span className="absolute left-3 top-3 z-10 rounded-md bg-[#102236]/90 px-2.5 py-1 text-[0.67rem] font-bold uppercase tracking-wide text-white">For sale</span>
        {listing.coverImageUrl ? (
          <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Home size={30} />
          </div>
        )}
      </div>
      <div className="p-3.5">
        {price ? <p className="text-[1.02rem] font-bold leading-5 text-[#071633]">{price}</p> : null}
        {location ? <p className="mt-1 truncate text-[0.78rem] text-slate-500">{location}</p> : <h3 className="mt-1 truncate text-sm font-semibold text-slate-800">{listing.title || 'Property listing'}</h3>}
        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-[0.75rem] font-semibold text-[#26364f]">
          {listing.bedrooms ? <span className="inline-flex items-center gap-1.5"><BedDouble size={15} /> {listing.bedrooms}</span> : null}
          {listing.bathrooms ? <span className="inline-flex items-center gap-1.5"><Bath size={15} /> {listing.bathrooms}</span> : null}
          {listing.propertyType ? <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 truncate"><Building2 size={15} className="shrink-0" /> <span className="truncate">{listing.propertyType}</span></span> : null}
        </div>
        <a
          href={enquiryUrl}
          onClick={() => onTrack('listing_click', {
            listingId: listing.id || '',
            listingSlug: listing.slug || '',
            listingTitle: listing.title || '',
          })}
          className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--card-primary)] px-4 text-xs font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[var(--card-primary)]/20"
        >
          Enquire <ExternalLink size={15} />
        </a>
      </div>
    </article>
  )
}

const INTAKE_STEPS = {
  buy: [
    { id: 'details', label: 'Your details', description: 'So your agent can get in touch.' },
    { id: 'preferences', label: 'Preferences', description: 'Tell us what home you are looking for.' },
    { id: 'readiness', label: 'Readiness', description: 'A few details help us tailor the right options.' },
    { id: 'notes', label: 'Send enquiry', description: 'Add anything else that would be helpful.' },
  ],
  sell: [
    { id: 'details', label: 'Your details', description: 'So your agent can get in touch.' },
    { id: 'address', label: 'Property address', description: 'Where is the property you would like to sell?' },
    { id: 'property', label: 'Property details', description: 'A quick picture of the property helps.' },
    { id: 'notes', label: 'Send enquiry', description: 'Add your preferred selling timeline and notes.' },
  ],
}

const EMPTY_INTAKE_FORM = Object.freeze({
  firstName: '', lastName: '', email: '', phone: '',
  areas: '', propertyType: '', bedrooms: '', bathrooms: '', budgetMin: '', budgetMax: '', financeStatus: '', buyerTimeline: '',
  propertyAddress: '', suburb: '', sellerPropertyType: '', estimatedValue: '', sellerTimeline: '',
  message: '', privacyConsent: false, website: '',
})

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function toNumberOrNull(value = '') {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function Field({ label, children, hint = '' }) {
  return <label className="block text-[0.95rem] font-semibold text-[#172033]">
    <span>{label}</span>
    <span className="mt-1.5 block">{children}</span>
    {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
  </label>
}

function inputClassName() {
  return 'min-h-14 w-full rounded-xl border border-[#dfe4eb] bg-white px-4 text-base text-[#071633] outline-none transition placeholder:text-slate-400 focus:border-[var(--card-primary)] focus:ring-4 focus:ring-[var(--card-primary)]/10'
}

function AgentProfileIntakeModal({ open, intent, intake, cardSlug, attribution, onClose, onTrack }) {
  const [form, setForm] = useState(EMPTY_INTAKE_FORM)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const steps = INTAKE_STEPS[intent] || INTAKE_STEPS.buy
  const step = steps[stepIndex] || steps[0]
  const modalTheme = buildTheme(intake?.agency || {})
  const dirty = Object.entries(form).some(([key, value]) => key !== 'website' && value !== EMPTY_INTAKE_FORM[key])

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_INTAKE_FORM)
    setStepIndex(0)
    setError('')
    setSubmitting(false)
    setSubmitted(false)
  }, [intent, open])

  function update(name, value) {
    setForm((previous) => ({ ...previous, [name]: value }))
    if (error) setError('')
  }

  function validateCurrentStep() {
    if (step.id === 'details') {
      if (!normalizeText(form.firstName) || !normalizeText(form.lastName)) return 'Please enter your first name and surname.'
      if (!isValidEmail(form.email)) return 'Please enter a valid email address.'
      if (normalizeText(form.phone).replace(/[^0-9]/g, '').length < 7) return 'Please enter a valid mobile number.'
    }
    if (step.id === 'readiness') {
      const minimum = toNumberOrNull(form.budgetMin)
      const maximum = toNumberOrNull(form.budgetMax)
      if (minimum !== null && maximum !== null && minimum > maximum) return 'Minimum budget cannot be greater than maximum budget.'
    }
    if (step.id === 'address' && !normalizeText(form.propertyAddress)) return 'Please enter the property address.'
    if (step.id === 'notes' && !form.privacyConsent) return 'Please accept the privacy consent to send your enquiry.'
    return ''
  }

  function closeWithConfirm() {
    if (!submitting && dirty && !submitted && typeof window !== 'undefined' && !window.confirm('Discard your enquiry? Your progress will not be saved.')) return
    onClose()
  }

  function continueStep() {
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  async function submit(event) {
    event.preventDefault()
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const idempotencyKey = getOrCreateAgencyIntakeIdempotencyKey(cardSlug, `agent-profile-${intent}`)
      const payload = {
        intent,
        contact: {
          firstName: normalizeText(form.firstName), lastName: normalizeText(form.lastName),
          name: `${normalizeText(form.firstName)} ${normalizeText(form.lastName)}`.trim(),
          email: normalizeText(form.email), phone: normalizeText(form.phone),
        },
        message: normalizeText(form.message) || null,
        privacyConsent: true,
        privacyPolicyVersion: intake?.intake?.privacyPolicyVersion || AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION,
        website: form.website,
        sourceChannel: 'agent_profile',
        campaignCode: attribution?.campaignCode || '',
        utm: attribution?.utm || {},
        context: {
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          referrer: typeof document !== 'undefined' ? document.referrer : '',
          originalSourceChannel: attribution?.sourceChannel || 'card',
          agentUserId: intake?.card?.agent?.userId || '',
          surface: 'agent_profile',
        },
      }
      if (intent === 'buy') {
        payload.requirement = {
          areas: normalizeText(form.areas), propertyType: normalizeText(form.propertyType), bedroomsMin: toNumberOrNull(form.bedrooms),
          bathroomsMin: toNumberOrNull(form.bathrooms), budgetMin: toNumberOrNull(form.budgetMin), budgetMax: toNumberOrNull(form.budgetMax),
          financeStatus: normalizeText(form.financeStatus), timeline: normalizeText(form.buyerTimeline),
        }
      } else {
        payload.seller = {
          propertyAddress: normalizeText(form.propertyAddress), suburb: normalizeText(form.suburb), propertyType: normalizeText(form.sellerPropertyType),
          estimatedValue: toNumberOrNull(form.estimatedValue), timeline: normalizeText(form.sellerTimeline),
        }
      }
      const result = await submitAgencyPublicIntake({ slug: cardSlug, idempotencyKey, payload })
      if (!result?.accepted) throw new Error('We could not confirm your enquiry. Please try again.')
      onTrack(`${intent}_lead_submitted`, { duplicate: Boolean(result.duplicate), surface: 'agent_profile' })
      rotateAgencyIntakeIdempotencyKey(cardSlug, `agent-profile-${intent}`)
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError?.message || 'We could not send your enquiry right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const select = (name, options, placeholder = 'Select an option') => <select value={form[name]} onChange={(event) => update(name, event.target.value)} className={inputClassName()}>
    <option value="">{placeholder}</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </select>

  const modalStyle = {
    '--card-primary': modalTheme.primary,
    '--card-secondary': modalTheme.secondary,
    '--card-accent': modalTheme.accent,
  }

  return <Modal open={open} onClose={closeWithConfirm} title={submitted ? 'Enquiry received' : intent === 'sell' ? 'Request a market assessment' : 'Find your next home'} subtitle={submitted ? '' : `${stepIndex + 1} of ${steps.length} · ${step.label}`} className="h-[calc(100dvh-24px)] max-h-[calc(100dvh-24px)] max-w-xl rounded-[22px] border-0 [&_.ui-icon-button]:h-12 [&_.ui-icon-button]:w-12 [&_.ui-icon-button]:rounded-xl [&_.ui-icon-button]:border-2 [&_.ui-modal-body]:px-5 [&_.ui-modal-body]:py-6 [&_.ui-modal-head]:px-5 [&_.ui-modal-head]:py-5 sm:h-auto sm:max-h-[min(820px,calc(100dvh-32px))] sm:[&_.ui-modal-body]:px-7 sm:[&_.ui-modal-head]:px-7">
    {submitted ? <div className="py-10 text-center" style={modalStyle}>
      <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
      <h4 className="mt-4 text-xl font-semibold text-slate-950">Thank you — {normalizeText(intake?.card?.agent?.name) || 'your agent'} has your enquiry.</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">We’ll be in touch shortly with the right next steps.</p>
      <button type="button" onClick={onClose} className="mt-7 min-h-12 rounded-xl bg-[var(--card-primary)] px-7 text-sm font-semibold text-white shadow-lg">Done</button>
    </div> : <form onSubmit={submit} className="flex min-h-full flex-col" style={modalStyle}>
      <div className="mb-8 flex gap-2" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>{steps.map((item, index) => <span key={item.id} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-[var(--card-primary)]' : 'bg-[#e4e8ee]'}`} />)}</div>
      <p className="mb-7 text-[0.95rem] leading-6 text-slate-600">{step.description}</p>
      <input tabIndex={-1} aria-hidden="true" className="hidden" name="website" value={form.website} onChange={(event) => update('website', event.target.value)} autoComplete="off" />
      {step.id === 'details' ? <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name"><input autoFocus required value={form.firstName} onChange={(event) => update('firstName', event.target.value)} className={inputClassName()} autoComplete="given-name" /></Field>
        <Field label="Surname"><input required value={form.lastName} onChange={(event) => update('lastName', event.target.value)} className={inputClassName()} autoComplete="family-name" /></Field>
        <Field label="Email address"><input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className={inputClassName()} autoComplete="email" /></Field>
        <Field label="Mobile number"><input required type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} className={inputClassName()} autoComplete="tel" /></Field>
      </div> : null}
      {step.id === 'preferences' ? <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred areas"><input autoFocus value={form.areas} onChange={(event) => update('areas', event.target.value)} placeholder="e.g. Sandton, Rosebank" className={inputClassName()} /></Field>
        <Field label="Property type">{select('propertyType', [['House', 'House'], ['Apartment', 'Apartment'], ['Townhouse', 'Townhouse'], ['Vacant Land', 'Vacant land']])}</Field>
        <Field label="Bedrooms">{select('bedrooms', [['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5+']])}</Field>
        <Field label="Bathrooms">{select('bathrooms', [['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+']])}</Field>
      </div> : null}
      {step.id === 'readiness' ? <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum budget" hint="Optional"><input autoFocus inputMode="numeric" value={form.budgetMin} onChange={(event) => update('budgetMin', event.target.value)} placeholder="R" className={inputClassName()} /></Field>
        <Field label="Maximum budget" hint="Optional"><input inputMode="numeric" value={form.budgetMax} onChange={(event) => update('budgetMax', event.target.value)} placeholder="R" className={inputClassName()} /></Field>
        <Field label="Finance readiness">{select('financeStatus', [['cash', 'Cash buyer'], ['pre_approved', 'Pre-approved'], ['bond_needed', 'Bond needed'], ['not_ready', 'Still exploring']])}</Field>
        <Field label="When would you like to move?">{select('buyerTimeline', [['now', 'Immediately'], ['1_3_months', '1–3 months'], ['3_6_months', '3–6 months'], ['6_plus_months', '6+ months']])}</Field>
      </div> : null}
      {step.id === 'address' ? <div className="grid gap-4"><Field label="Property address"><input autoFocus required value={form.propertyAddress} onChange={(event) => update('propertyAddress', event.target.value)} className={inputClassName()} autoComplete="street-address" /></Field><Field label="Suburb or area"><input value={form.suburb} onChange={(event) => update('suburb', event.target.value)} className={inputClassName()} autoComplete="address-level2" /></Field></div> : null}
      {step.id === 'property' ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Property type">{select('sellerPropertyType', [['House', 'House'], ['Apartment', 'Apartment'], ['Townhouse', 'Townhouse'], ['Vacant Land', 'Vacant land']])}</Field><Field label="Estimated value" hint="Optional"><input autoFocus inputMode="numeric" value={form.estimatedValue} onChange={(event) => update('estimatedValue', event.target.value)} placeholder="R" className={inputClassName()} /></Field></div> : null}
      {step.id === 'notes' ? <div className="grid gap-4"><Field label="Preferred timeline">{select(intent === 'buy' ? 'buyerTimeline' : 'sellerTimeline', [['now', 'Immediately'], ['1_3_months', '1–3 months'], ['3_6_months', '3–6 months'], ['6_plus_months', '6+ months']])}</Field><Field label="Anything else we should know?" hint="Optional"><textarea autoFocus value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} className={`${inputClassName()} py-3`} /></Field><label className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-600"><input required type="checkbox" checked={form.privacyConsent} onChange={(event) => update('privacyConsent', event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--card-primary)]" /><span>I agree that {normalizeText(intake?.agency?.name) || 'this agency'} may contact me about this enquiry and handle my details according to its privacy policy.</span></label></div> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-slate-100 bg-white pb-1 pt-5"><button type="button" onClick={() => { setError(''); setStepIndex((current) => Math.max(0, current - 1)) }} disabled={!stepIndex || submitting} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-35">Back</button>{stepIndex === steps.length - 1 ? <button type="submit" disabled={submitting} className="min-h-12 min-w-[148px] rounded-xl bg-[var(--card-primary)] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(6,23,53,0.2)] disabled:opacity-60">{submitting ? 'Sending…' : 'Send enquiry'}</button> : <button type="button" onClick={continueStep} className="min-h-12 min-w-[132px] rounded-xl bg-[var(--card-primary)] px-6 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(6,23,53,0.2)]">Continue</button>}</div>
    </form>}
  </Modal>
}

export default function PublicAgentDigitalCardPage() {
  const { cardSlug = '' } = useParams()
  const [intake, setIntake] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [listingLoading, setListingLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIntent, setActiveIntent] = useState('')
  const trackedViewRef = useRef('')
  const attributionSearch = typeof window !== 'undefined' ? window.location.search : ''
  const attribution = readAgentDigitalCardAttribution(attributionSearch)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        setError('')
        return resolveAgencyPublicAgentCard(cardSlug)
      })
      .then((resolved) => {
        if (!cancelled && resolved) setIntake(resolved)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || 'This digital card is not available.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardSlug])

  useEffect(() => {
    if (!intake?.card?.enabled || intake?.card?.features?.listings === false) return undefined
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (cancelled) return []
        setListingLoading(true)
        return resolveAgencyPublicCardListings(cardSlug, { limit: intake?.card?.profile?.featuredListingIds?.length ? 24 : 6 })
      })
      .then((items) => {
        if (!cancelled) setListings(items)
      })
      .catch(() => {
        if (!cancelled) setListings([])
      })
      .finally(() => {
        if (!cancelled) setListingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardSlug, intake?.card?.enabled, intake?.card?.features?.listings, intake?.card?.profile?.featuredListingIds?.length])

  useEffect(() => {
    if (!intake?.card?.agent?.name && !intake?.agency?.name) return undefined
    const previousTitle = document.title
    document.title = `${intake.card.agent.name || 'Agent'} | ${intake.agency.name || 'Digital card'}`
    return () => {
      document.title = previousTitle
    }
  }, [intake?.agency?.name, intake?.card?.agent?.name])

  useEffect(() => {
    if (!intake?.card?.enabled || !cardSlug) return
    const viewKey = `${cardSlug}:${intake.updatedAt || ''}`
    if (trackedViewRef.current === viewKey) return
    trackedViewRef.current = viewKey
    recordAgentDigitalCardEventSoon({
      slug: cardSlug,
      eventType: 'card_view',
      sourceChannel: attribution.sourceChannel,
      metadata: {
        campaignCode: attribution.campaignCode,
        utm: attribution.utm,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    })
  }, [attribution.campaignCode, attribution.sourceChannel, attributionSearch, cardSlug, intake?.card?.enabled, intake?.updatedAt])

  const theme = useMemo(() => buildTheme(intake?.agency || {}), [intake?.agency])
  const agent = intake?.card?.agent || {}
  const agency = intake?.agency || {}
  const agencyName = normalizeText(agency.name) || 'Agency'
  const agentName = normalizeText(agent.name) || agencyName
  const jobTitle = formatDisplayRole(agent.jobTitle) || 'Property Practitioner'
  const phone = normalizeText(agent.phone)
  const whatsapp = normalizeText(agent.whatsapp || agent.phone)
  const email = normalizeText(agent.email)
  const cardUrl = typeof window !== 'undefined' ? window.location.href : intake?.cardUrl || ''
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/share/card/${encodeURIComponent(cardSlug)}`
    : `${String(intake?.cardUrl || '').replace(/\/card\/[^/]+$/, '')}/share/card/${encodeURIComponent(cardSlug)}`
  const features = intake?.card?.features || {}
  const profile = intake?.card?.profile || {}
  const serviceAreas = normalizeTextList(profile.serviceAreas)
  const agentLocation = normalizeText(profile.location || profile.branchLocation || serviceAreas[0])
  const featuredListingIds = normalizeTextList(profile.featuredListingIds, 3)
  const isFeatureEnabled = (name) => features[name] !== false
  const enabledIntents = intake?.intake?.enabledIntents || ['buy', 'sell']
  const showLeadCapture = isFeatureEnabled('leadCapture')
  const showBuyerCta = showLeadCapture && enabledIntents.includes('buy')
  const showSellerCta = showLeadCapture && enabledIntents.includes('sell')
  const showListings = isFeatureEnabled('listings')
  const shareText = buildAgentDigitalCardShareText({
    agentName,
    organisationName: agencyName,
    shareUrl,
  })
  const heroLogoUrl = normalizeText(agency.logoDarkUrl || agency.logoLightUrl || agency.logoUrl || agency.logoIconUrl)
  const websiteUrl = normalizeExternalUrl(agency.website)
  const socialLinks = [
    { label: 'Facebook', href: normalizeExternalUrl(agency.social?.facebook) },
    { label: 'Instagram', href: normalizeExternalUrl(agency.social?.instagram) },
    { label: 'LinkedIn', href: normalizeExternalUrl(agency.social?.linkedIn) },
  ].filter((link) => link.href)
  const cardIntroduction = normalizeText(intake?.intake?.introduction)
  const displayListings = [...listings]
    .sort((left, right) => {
      const leftRank = featuredListingIds.indexOf(normalizeText(left.id))
      const rightRank = featuredListingIds.indexOf(normalizeText(right.id))
      const leftPinned = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank
      const rightPinned = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank
      return leftPinned - rightPinned
    })
    .slice(0, 3)
  const experienceYears = Number(profile.yearsExperience || profile.experienceYears || 0)
  const profileStats = [
    !listingLoading && listings.length ? { value: listings.length, label: 'Active Listings' } : null,
    experienceYears > 0 ? { value: experienceYears, label: 'Years Experience' } : null,
    agentLocation ? { value: <MapPin size={19} />, label: agentLocation } : null,
  ].filter(Boolean)

  function trackCardEvent(eventType, metadata = {}) {
    recordAgentDigitalCardEventSoon({
      slug: cardSlug,
      eventType,
      sourceChannel: attribution.sourceChannel,
      metadata: {
        ...metadata,
        campaignCode: attribution.campaignCode,
        utm: attribution.utm,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    })
  }

  function downloadVcard() {
    trackCardEvent('vcf_download')
    const fileBaseName = buildAgentDigitalCardFileBaseName({ agentName, organisationName: agencyName })
    const vcard = buildAgentDigitalCardVcard({
      agentName,
      agentEmail: email,
      agentPhone: phone || whatsapp,
      agentJobTitle: jobTitle,
      organisationName: agencyName,
      shareUrl: cardUrl,
    })
    downloadAgentDigitalCardTextFile({
      fileName: `${fileBaseName}.vcf`,
      text: vcard,
      mimeType: 'text/vcard;charset=utf-8',
    })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <LoaderCircle className="mr-2 animate-spin" size={20} /> Loading digital card...
      </main>
    )
  }

  if (error || !intake?.card?.enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-xl font-semibold text-slate-950">Digital card unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error || 'This link is not an active agent digital card.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-[#f7f5f0] pb-12 text-[#071633]"
      style={{
        '--card-primary': theme.primary,
        '--card-secondary': theme.secondary,
        '--card-accent': theme.accent,
        '--card-accent-text': theme.accentText,
      }}
    >
      <header className="h-[245px] text-white sm:h-[270px]" style={{ background: theme.hero }}>
        <div className="mx-auto flex h-full max-w-[920px] items-start px-6 pt-10 sm:px-10 sm:pt-12">
          {heroLogoUrl ? (
            <img src={heroLogoUrl} alt={agencyName} className="max-h-[76px] w-auto max-w-[270px] object-contain object-left sm:max-h-[88px] sm:max-w-[330px]" />
          ) : (
            <div className="flex items-center gap-3 text-xl font-bold tracking-wide"><span className="grid h-14 w-14 place-items-center rounded-full border-2 border-white">{agencyName.slice(0, 1).toUpperCase()}</span>{agencyName}</div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[54px] w-full max-w-[920px] px-3 sm:-mt-[72px] sm:px-6">
        <article className="relative mx-auto max-w-[760px] rounded-[12px] border border-[#dfe3e8] bg-white px-5 pb-6 pt-[94px] shadow-[0_26px_70px_rgba(7,22,51,0.18)] sm:px-8 sm:pb-8 sm:pt-[112px]">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agentName} className="h-36 w-36 rounded-full border-[6px] border-white object-cover shadow-[0_18px_42px_rgba(7,22,51,0.25)] sm:h-44 sm:w-44" />
            ) : (
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-[6px] border-white bg-slate-100 text-5xl font-bold text-[var(--card-primary)] shadow-[0_18px_42px_rgba(7,22,51,0.25)] sm:h-44 sm:w-44">{agentName.slice(0, 1).toUpperCase()}</div>
            )}
          </div>

          <section className="text-center">
            <h1 className="text-[clamp(1.9rem,8vw,3rem)] font-bold leading-[1.05] tracking-[-0.045em] text-[#071633]">{agentName}</h1>
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.92rem] sm:text-lg">
              <span className="font-bold text-[#cc1746]">{jobTitle}</span>
              <span className="h-5 w-px bg-slate-300" aria-hidden="true" />
              <span className="font-medium text-[#071633]">{agencyName}</span>
            </p>
            {agentLocation ? <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={16} /> {agentLocation}</p> : null}
            {cardIntroduction ? <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">{cardIntroduction}</p> : null}
          </section>

          <section className="mt-6 border-t border-[#dfe3e8] pt-5 sm:mt-8 sm:pt-6">
            <h2 className="text-lg font-bold tracking-[-0.025em] text-[#071633]">Contact {agentName.split(' ')[0]}</h2>
            <div className="mt-5 grid grid-cols-4 gap-x-1.5 sm:gap-x-5">
              <RoundContactLink icon={Phone} label="Call" href={normalizePhoneHref(phone)} onClick={() => trackCardEvent('call_click')} />
              <RoundContactLink icon={MessageCircle} label="WhatsApp" href={normalizeWhatsAppHref(whatsapp, shareText)} onClick={() => trackCardEvent('whatsapp_click')} />
              <RoundContactLink icon={Mail} label="Email" href={email ? `mailto:${email}` : ''} onClick={() => trackCardEvent('email_click')} />
              {isFeatureEnabled('vcf') ? <RoundContactLink icon={UserPlus} label="Save Contact" onClick={downloadVcard} /> : null}
            </div>
          </section>

          {profileStats.length ? <section className="mt-6 grid divide-x divide-[#dfe3e8] border-y border-[#dfe3e8] py-5 text-center" style={{ gridTemplateColumns: `repeat(${profileStats.length}, minmax(0, 1fr))` }}>
            {profileStats.map((stat) => <div key={stat.label} className="min-w-0 px-2">
              <strong className="flex min-h-6 items-center justify-center text-xl font-bold text-[#071633]">{stat.value}</strong>
              <span className="mt-1 block break-words text-[0.72rem] leading-4 text-slate-500 sm:text-sm">{stat.label}</span>
            </div>)}
          </section> : null}

          {showBuyerCta || showSellerCta ? <section className="mt-5">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#071633]">How can I help you?</h2>
            <div className="mt-3 grid gap-3">
              {showBuyerCta ? <IntentCta icon={Home} title="I want to buy" subtitle="Find the right home faster" onClick={() => { trackCardEvent('buyer_cta_click'); setActiveIntent('buy') }} /> : null}
              {showSellerCta ? <IntentCta icon={Tag} title="I want to sell" subtitle="Get a free market assessment" onClick={() => { trackCardEvent('seller_cta_click'); setActiveIntent('sell') }} tone="accent" /> : null}
            </div>
          </section> : null}
        </article>

        {showListings ? <section className="mt-8 sm:mt-10">
          <div className="flex items-end justify-between gap-4 px-2 sm:px-0">
            <h2 className="text-[1.7rem] font-bold tracking-[-0.045em] text-[#071633] sm:text-3xl">Featured Properties</h2>
            {listings.length > 1 ? <span className="shrink-0 pb-1 text-xs font-semibold text-[#cc1746] sm:text-sm">Swipe to view</span> : null}
          </div>
          {listingLoading ? (
            <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm font-semibold text-slate-500"><LoaderCircle className="mr-2 animate-spin" size={18} /> Loading listings...</div>
          ) : listings.length ? (
            <div className="-mx-3 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:gap-4 sm:px-6">
              {displayListings.map((listing) => <ListingCard key={listing.id || listing.slug} listing={listing} intakeSlug={cardSlug} attributionSearch={attributionSearch} onTrack={trackCardEvent} />)}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white px-5 py-9 text-center"><Home className="mx-auto text-slate-400" size={28} /><h3 className="mt-3 text-base font-semibold text-[#071633]">No featured properties yet</h3><p className="mt-1 text-sm text-slate-500">You can still contact {agentName} about your property search.</p></div>
          )}
        </section> : null}

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
          {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer" className="font-semibold hover:text-[#071633]">Website</a> : null}
          {socialLinks.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noreferrer" className="font-semibold hover:text-[#071633]">{label}</a>)}
          <span>Powered by ARCH9</span>
        </footer>
      </div>
      <AgentProfileIntakeModal
        open={Boolean(activeIntent)}
        intent={activeIntent || 'buy'}
        intake={intake}
        cardSlug={cardSlug}
        attribution={attribution}
        onClose={() => setActiveIntent('')}
        onTrack={trackCardEvent}
      />
    </main>
  )
}
