import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Home,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  AGENCY_PUBLIC_INTAKE_PRIVACY_VERSION,
  getOrCreateAgencyIntakeIdempotencyKey,
  readAgencyIntakeAttribution,
  resolveAgencyPublicIntake,
  resolveAgencyPublicListings,
  rotateAgencyIntakeIdempotencyKey,
  submitAgencyPublicIntake,
} from '../services/agencyPublicIntakeService'

const BACKGROUND_IMAGES = {
  buy: '/brand/agency-intake-buy.webp',
  sell: '/brand/agency-intake-sell.webp',
  contact: '/brand/agency-intake-contact.webp',
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
  selectedListings: [],
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
const BUYER_BUDGET_RANGES = [
  { label: 'Below R1m', min: '', max: '1000000' },
  { label: 'R1m - R1.5m', min: '1000000', max: '1500000' },
  { label: 'R1.5m - R2m', min: '1500000', max: '2000000' },
  { label: 'R2m - R2.5m', min: '2000000', max: '2500000' },
  { label: 'R2.5m - R3m', min: '2500000', max: '3000000' },
  { label: 'R3m - R3.5m', min: '3000000', max: '3500000' },
  { label: 'R3.5m - R4m', min: '3500000', max: '4000000' },
  { label: 'R4m - R4.5m', min: '4000000', max: '4500000' },
  { label: 'R4.5m - R5m', min: '4500000', max: '5000000' },
  { label: 'R5m+', min: '5000000', max: '' },
]
const BEDROOM_OPTIONS = ['1', '2', '3', '4']
const BUYER_STEPS = [
  { id: 'budget', label: 'Search', title: 'Buying budget', summary: 'Share the range and requirements you have in mind.' },
  { id: 'listings', label: 'Listings', title: 'Listings you like', summary: 'Choose any properties that catch your eye. This step is optional.' },
  { id: 'contact', label: 'Contact', title: 'Contact details', summary: 'Tell us how the agency should reach you.' },
  { id: 'final', label: 'Submit', title: 'Final details', summary: 'Add anything useful before sending your enquiry.' },
]
const MAX_SELECTED_LISTINGS = 24

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = '') {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
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

function hasDisplayPrice(listing = {}) {
  const value = listing.askingPrice ?? listing.asking_price
  if (value === null || value === undefined || value === '') return false
  return normalizeNumber(value) !== null
}

function listingKey(listing = {}) {
  return normalizeText(listing.id || listing.slug)
}

function normalizeSelectedListing(listing = {}) {
  const askingPrice = listing.askingPrice ?? listing.asking_price
  return {
    id: normalizeText(listing.id),
    slug: normalizeText(listing.slug),
    title: normalizeText(listing.title),
    askingPrice: askingPrice === null || askingPrice === undefined || askingPrice === '' ? null : normalizeNumber(askingPrice),
  }
}

function mergeSelectedListings(...groups) {
  const seen = new Set()
  return groups
    .flat()
    .map((listing) => (listing && typeof listing === 'object' ? normalizeSelectedListing(listing) : null))
    .filter((listing) => {
      const key = listingKey(listing)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_SELECTED_LISTINGS)
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

function mixWithWhite(hex = '#102f34', weight = 0.92) {
  const { r, g, b } = hexToRgb(hex)
  const mix = (channel) => Math.round(channel + (255 - channel) * weight)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
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
    soft: mixWithWhite(primary, 0.94),
    heroDark: hexToRgba(primary, 0.96),
    overlay: `linear-gradient(115deg, ${hexToRgba(primary, 0.91)} 0%, ${hexToRgba(secondary, 0.79)} 48%, ${hexToRgba(primary, 0.58)} 100%)`,
    lowerOverlay: `linear-gradient(180deg, ${hexToRgba(primary, 0.08)} 0%, ${hexToRgba(primary, 0.74)} 100%)`,
  }
}

function getAgencyShortName(name = '') {
  const text = normalizeText(name) || 'the agency'
  return text
    .replace(/\b(realty|real estate|properties|property group|estate agents|agency)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || text
}

function normalizeExternalUrl(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  return `https://${text}`
}

function buildAgencyContactHref(agency = {}) {
  const email = normalizeText(agency.contactEmail)
  if (email) return `mailto:${email}`
  const phone = normalizeText(agency.contactPhone).replace(/\s+/g, '')
  if (phone) return `tel:${phone}`
  return normalizeExternalUrl(agency.website)
}

function FieldLabel({ children, required = false }) {
  return (
    <span className="text-[13px] font-semibold text-slate-700">
      {children}{required ? <span className="ml-1 text-rose-600" aria-hidden="true">*</span> : null}
    </span>
  )
}

function FieldIcon({ icon: Icon }) {
  if (!Icon) return null
  return (
    <span className="flex h-full items-center pl-4 pr-3 text-slate-400 transition group-focus-within:text-[var(--intake-primary)]" aria-hidden="true">
      <Icon size={18} strokeWidth={1.9} />
    </span>
  )
}

function TextInput({ label, required = false, icon, prefix = '', compact = false, className = '', ...props }) {
  const hasAdornment = Boolean(icon || prefix)
  return (
    <label className={`grid ${compact ? 'gap-1.5' : 'gap-2'} ${className}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <span className={`group flex ${compact ? 'min-h-12' : 'min-h-14'} items-center overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_rgba(15,23,42,0.04)] transition focus-within:border-[var(--intake-primary)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--intake-primary)]/10`}>
        <FieldIcon icon={icon} />
        {prefix ? <span className={`${icon ? '' : 'pl-4'} pr-2 text-sm font-semibold text-slate-500`}>{prefix}</span> : null}
        <input
          {...props}
          className={`${compact ? 'min-h-12 py-2 text-[15px]' : 'min-h-14 py-3 text-base'} min-w-0 flex-1 bg-transparent pr-4 text-slate-900 outline-none placeholder:text-slate-400 ${hasAdornment ? '' : 'pl-4'}`}
        />
      </span>
    </label>
  )
}

function SelectInput({ label, required = false, icon, children, compact = false, className = '', ...props }) {
  return (
    <label className={`grid ${compact ? 'gap-1.5' : 'gap-2'} ${className}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <span className={`group flex ${compact ? 'min-h-12' : 'min-h-14'} items-center overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_rgba(15,23,42,0.04)] transition focus-within:border-[var(--intake-primary)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--intake-primary)]/10`}>
        <FieldIcon icon={icon} />
        <select
          {...props}
          className={`${compact ? 'min-h-12 py-2 text-[15px]' : 'min-h-14 py-3 text-base'} min-w-0 flex-1 bg-transparent pr-4 text-slate-900 outline-none ${icon ? '' : 'pl-4'}`}
        >
          {children}
        </select>
      </span>
    </label>
  )
}

function OptionButtonGroup({ label, icon, options = [], value = '', onChange, columns = 'grid-cols-2 sm:grid-cols-4' }) {
  const Icon = icon
  return (
    <fieldset className="grid gap-2">
      <legend className="flex items-center gap-2">
        {Icon ? <Icon className="text-slate-400" size={18} strokeWidth={1.9} aria-hidden="true" /> : null}
        <FieldLabel>{label}</FieldLabel>
      </legend>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value
          const optionLabel = typeof option === 'string' ? (option ? `${option}+` : 'Any') : option.label
          const active = String(value || '') === String(optionValue || '')
          return (
            <button
              key={optionValue || 'any'}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : optionValue)}
              className={`min-h-11 rounded-lg border px-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-[var(--intake-primary)]/10 ${
                active
                  ? 'border-[var(--intake-primary)] bg-[var(--intake-primary)] text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {optionLabel}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function BudgetRangeSelector({ valueMin = '', valueMax = '', onSelect }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="flex items-center gap-2">
        <Banknote className="text-slate-400" size={18} strokeWidth={1.9} aria-hidden="true" />
        <FieldLabel>Price range</FieldLabel>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUYER_BUDGET_RANGES.map((range) => {
          const active = String(valueMin || '') === range.min && String(valueMax || '') === range.max
          return (
            <button
              key={`${range.min}-${range.max || 'plus'}`}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(range)}
              className={`min-h-11 rounded-lg border px-2.5 text-[13px] font-semibold sm:text-sm transition focus:outline-none focus:ring-4 focus:ring-[var(--intake-primary)]/10 ${
                active
                  ? 'border-[var(--intake-primary)] bg-[var(--intake-primary)] text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {range.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function IntakeTextarea({ label, required = false, icon, className = '', ...props }) {
  const Icon = icon
  return (
    <label className={`grid gap-2 ${className}`}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <span className="group flex items-start overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_rgba(15,23,42,0.04)] transition focus-within:border-[var(--intake-primary)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--intake-primary)]/10">
        {Icon ? (
          <span className="pl-4 pr-3 pt-4 text-slate-400 transition group-focus-within:text-[var(--intake-primary)]" aria-hidden="true">
            <Icon size={18} strokeWidth={1.9} />
          </span>
        ) : null}
        <textarea
          {...props}
          className={`min-h-[132px] min-w-0 flex-1 resize-y bg-transparent py-3 pr-4 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 ${icon ? '' : 'pl-4'}`}
        />
      </span>
    </label>
  )
}

function IntakeSection({ title, children }) {
  return (
    <section className="grid gap-4 border-l-2 border-slate-200/80 pl-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  )
}

function ContactHelper() {
  return (
    <p className="rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-500">
      Please provide at least one contact method.
    </p>
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
        className="block h-28 w-[68vw] max-w-[300px] object-contain object-left drop-shadow-[0_10px_26px_rgba(0,0,0,0.3)] sm:h-32 sm:w-[340px] sm:max-w-[340px]"
        onError={() => setLogoFailed(true)}
      />
    )
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/20 bg-white/12 text-2xl font-bold text-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] sm:h-24 sm:w-24">
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

function IntakeTrustRow({ agency = {}, agent = null }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const agencyName = normalizeText(agency.name) || 'the agency'
  const agentName = normalizeText(agent?.firstName || agent?.name)
  const agentPhoto = normalizeText(agent?.profilePhotoUrl || agent?.avatarUrl || agent?.photoUrl)
  const initials = (agentName || agencyName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const canShowAgentPhoto = Boolean(agentName && agentPhoto)
  const canShowLogo = Boolean(agency.logoUrl && !logoFailed)
  const message = agentName
    ? `Your enquiry will go directly to ${agentName.split(/\s+/)[0]}.`
    : 'Real people. Local advice. No pressure.'

  return (
    <div className="mt-7 flex items-center gap-4 text-white">
      <div className="flex shrink-0 items-center">
        {canShowAgentPhoto ? (
          <img
            src={agentPhoto}
            alt={`${agentName} profile`}
            className="h-12 w-12 rounded-full border-2 border-white/90 object-cover shadow-lg"
          />
        ) : canShowLogo ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/90 bg-white/12 shadow-lg backdrop-blur">
            <img
              src={agency.logoUrl}
              alt=""
              className="h-8 w-8 object-contain"
              onError={() => setLogoFailed(true)}
            />
          </span>
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/90 bg-white/14 text-sm font-bold shadow-lg backdrop-blur">
            {initials || <Building2 size={20} aria-hidden="true" />}
          </span>
        )}
      </div>
      <p className="min-w-0 text-[15px] font-medium leading-6 text-white/90 sm:text-base">{message}</p>
    </div>
  )
}

function IntakeOptionCard({ title, description, cta, icon, image, imagePosition = 'center', onClick, href, disabled = false }) {
  const Icon = icon
  const className = `group relative block min-h-[214px] w-full overflow-hidden rounded-[24px] border border-white/35 bg-slate-900 text-left text-white shadow-[0_20px_48px_rgba(15,23,42,0.22)] transition duration-200 focus:outline-none focus:ring-4 focus:ring-[var(--agency-accent)]/35 ${
    disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 active:scale-[0.99]'
  }`
  const content = (
    <>
      <span className="absolute inset-0 z-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.03]" style={{ backgroundImage: `url("${image}")`, backgroundPosition: imagePosition }} />
      <span className="absolute inset-0 z-10 bg-black/35" />
      <span className="absolute inset-0 z-10 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
      <span className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <span className="relative z-20 flex min-h-[214px] flex-col justify-end p-6">
        <span className="mb-6 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--agency-primary)]/74 text-[var(--agency-accent)] shadow-[0_14px_34px_rgba(0,0,0,0.22)] backdrop-blur">
          <Icon size={28} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <span className="block text-[2rem] font-semibold leading-none tracking-normal text-white drop-shadow">{title}</span>
        <span className="mt-3 block max-w-[330px] text-base font-medium leading-5 text-white/90 drop-shadow">{description}</span>
        <span className="mt-5 inline-flex items-center gap-3 text-base font-semibold text-[var(--agency-accent)]">
          {cta}
          <ArrowRight className="transition group-hover:translate-x-1" size={21} aria-hidden="true" />
        </span>
      </span>
    </>
  )

  if (href && !disabled) {
    return (
      <a href={href} className={className} aria-label={`${title}. ${description}`}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} aria-label={`${title}. ${description}`}>
      {content}
    </button>
  )
}

function ListingSelectionCard({ listing = {}, selected = false, onToggle }) {
  const price = formatCurrency(listing.askingPrice)
  const details = [
    listing.propertyType,
    listing.bedrooms ? `${listing.bedrooms} bed` : '',
    listing.bathrooms ? `${listing.bathrooms} bath` : '',
  ].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`group min-h-[196px] overflow-hidden rounded-lg border text-left transition focus:outline-none focus:ring-4 focus:ring-slate-200 sm:min-h-[220px] ${
        selected
          ? 'border-[var(--intake-primary)] bg-slate-50 shadow-[0_18px_40px_rgba(15,23,42,0.12)]'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className="relative block h-[196px] overflow-hidden bg-slate-800 sm:h-[220px]">
        {listing.coverImageUrl ? (
          <img
            src={listing.coverImageUrl}
            alt=""
            className="h-full w-full object-cover opacity-[0.65] transition duration-500 group-hover:scale-105 group-hover:opacity-75"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-white/60">
            <Home size={28} aria-hidden="true" />
          </span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/48 to-black/18" />
        <span className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border text-white shadow-lg ${selected ? 'border-[var(--intake-accent)] bg-[var(--intake-primary)]' : 'border-white/50 bg-black/35 backdrop-blur'}`}>
          <CheckCircle2 size={18} aria-hidden="true" />
        </span>
        <span className="absolute inset-x-0 bottom-0 block p-4 text-white">
          {price ? <span className="mb-2 inline-flex rounded bg-black/75 px-2.5 py-1 text-xs font-semibold backdrop-blur">{price}</span> : null}
          <span className="line-clamp-2 block text-base font-semibold leading-5 drop-shadow">{listing.title || 'Published listing'}</span>
          <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/80">
            <MapPin size={13} aria-hidden="true" /> {[listing.suburb, listing.city].filter(Boolean).join(', ') || 'Area available on request'}
          </span>
          {details.length ? <span className="mt-2 block text-xs font-semibold text-white/90">{details.join(' · ')}</span> : null}
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

function PublicIntakeLanding({ intake = {}, theme = {}, enabledIntents = [], onChooseIntent }) {
  const agency = intake.agency || {}
  const agencyName = normalizeText(agency.name) || 'Your agency'
  const agencyShortName = getAgencyShortName(agencyName)
  const contactHref = buildAgencyContactHref(agency)
  const options = [
    enabledIntents.includes('buy')
      ? {
          key: 'buy',
          title: 'Find a home',
          description: 'Tell us your preferred areas, budget and must-haves.',
          cta: 'Start my search',
          icon: Search,
          image: BACKGROUND_IMAGES.buy,
          imagePosition: 'center',
          onClick: () => onChooseIntent('buy'),
        }
      : null,
    enabledIntents.includes('sell')
      ? {
          key: 'sell',
          title: 'Sell my property',
          description: "Share a few details and let us help you understand your property's value.",
          cta: 'Get started',
          icon: Home,
          image: BACKGROUND_IMAGES.sell,
          imagePosition: 'center',
          onClick: () => onChooseIntent('sell'),
        }
      : null,
    contactHref
      ? {
          key: 'contact',
          title: 'Speak to the team',
          description: "Not sure where to begin? Tell us what you need and we'll point you in the right direction.",
          cta: 'Contact us',
          icon: MessageCircle,
          image: BACKGROUND_IMAGES.contact,
          imagePosition: 'center',
          href: contactHref,
        }
      : null,
  ].filter(Boolean)

  const landingStyle = {
    '--agency-primary': theme.primary,
    '--agency-primary-dark': theme.heroDark,
    '--agency-soft': theme.soft,
    '--agency-accent': theme.accent,
    '--agency-accent-text': theme.accentText,
    backgroundColor: theme.soft,
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden antialiased" style={landingStyle}>
      <div className="mx-auto min-h-[100dvh] w-full max-w-[680px] bg-[var(--agency-soft)] shadow-[0_30px_90px_rgba(15,23,42,0.08)] sm:my-6 sm:overflow-hidden sm:rounded-[36px]">
        <section className="relative overflow-hidden rounded-b-[38px] bg-[var(--agency-primary)] px-6 pb-20 pt-[calc(2rem+env(safe-area-inset-top))] text-white">
          <div className="absolute inset-0 bg-cover bg-center opacity-70" style={{ backgroundImage: `url("${BACKGROUND_IMAGES.buy}")` }} />
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--agency-primary)] via-[var(--agency-primary)]/88 to-[var(--agency-primary)]/62" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--agency-primary)] via-transparent to-black/20" />
          <div className="relative z-10">
            <BrandMark agency={agency} />
            <p className="mt-7 text-[13px] font-semibold uppercase tracking-[0.32em] text-[var(--agency-accent)]">Welcome to {agencyShortName}</p>
            <h1 className="mt-4 max-w-[560px] text-[clamp(2.85rem,13vw,4.85rem)] font-semibold leading-[0.96] text-white">
              What's your next move?
            </h1>
            <p className="mt-5 max-w-[455px] text-[17px] font-medium leading-7 text-white/90">
              Buying, selling or simply exploring your options? Choose an option below and our team will guide you from here.
            </p>
            <IntakeTrustRow agency={agency} agent={intake.agent || intake.advisor || null} />
          </div>
        </section>

        <section className="relative z-20 -mt-10 grid gap-4 px-5 pb-7 sm:px-7">
          {options.map((option) => (
            <IntakeOptionCard
              key={option.key}
              title={option.title}
              description={option.description}
              cta={option.cta}
              icon={option.icon}
              image={option.image}
              imagePosition={option.imagePosition}
              href={option.href}
              onClick={option.onClick}
            />
          ))}
        </section>

        <footer className="grid gap-2 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs font-medium text-slate-500">
          <p>{agency.website || agencyName}</p>
          <p>Powered securely by ARCH9</p>
        </footer>
      </div>
    </main>
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
  const [buyerStep, setBuyerStep] = useState(BUYER_STEPS[0].id)
  const [listingOptions, setListingOptions] = useState([])
  const [listingLoading, setListingLoading] = useState(false)
  const [listingError, setListingError] = useState('')
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
  const buyerStepIndex = Math.max(0, BUYER_STEPS.findIndex((step) => step.id === buyerStep))
  const currentBuyerStep = BUYER_STEPS[buyerStepIndex] || BUYER_STEPS[0]

  useEffect(() => {
    if (!intake || queryIntentApplied || intent) return
    const requestedIntent = normalizeText(searchParams.get('intent')).toLowerCase()
    if (['buy', 'sell'].includes(requestedIntent) && enabledIntents.includes(requestedIntent)) {
      setIntent(requestedIntent)
    }
    setQueryIntentApplied(true)
  }, [enabledIntents, intake, intent, queryIntentApplied, searchParams])

  useEffect(() => {
    if (intent !== 'buy' || !attribution.selectedListings.length) return
    setForm((previous) => ({
      ...previous,
      selectedListings: mergeSelectedListings(previous.selectedListings, attribution.selectedListings),
    }))
  }, [attribution.selectedListings, intent])

  useEffect(() => {
    if (intent !== 'buy' || buyerStep !== 'listings') return undefined
    let cancelled = false
    const filters = {
      limit: 12,
      minPrice: form.budgetMin,
      maxPrice: form.budgetMax,
    }
    setListingLoading(true)
    setListingError('')
    resolveAgencyPublicListings(agencySlug, filters)
      .then((items) => {
        if (!cancelled) setListingOptions(items.filter(hasDisplayPrice))
      })
      .catch((error) => {
        if (!cancelled) {
          setListingOptions([])
          setListingError(error?.message || 'Published listings could not be loaded.')
        }
      })
      .finally(() => {
        if (!cancelled) setListingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agencySlug, buyerStep, form.budgetMax, form.budgetMin, intent])

  function retryLoad() {
    setReloadKey((value) => value + 1)
  }

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (formError) setFormError('')
  }

  function updateBudgetRange(range) {
    setForm((previous) => ({
      ...previous,
      budgetMin: range?.min || '',
      budgetMax: range?.max || '',
    }))
    if (formError) setFormError('')
  }

  function chooseIntent(nextIntent) {
    setIntent(nextIntent)
    setBuyerStep(BUYER_STEPS[0].id)
    setForm({
      ...INITIAL_FORM,
      selectedListings: nextIntent === 'buy' ? attribution.selectedListings : [],
    })
    setFormError('')
    setSubmitted(false)
    setSubmittedDuplicate(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetFlow() {
    if (intent) rotateAgencyIntakeIdempotencyKey(agencySlug, intent)
    setQueryIntentApplied(true)
    setIntent('')
    setBuyerStep(BUYER_STEPS[0].id)
    setForm(INITIAL_FORM)
    setListingOptions([])
    setListingError('')
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

  function validateBuyerStep(step = buyerStep) {
    if (step === 'contact') {
      if (!normalizeText(form.name)) return 'Please enter your name.'
      if (!normalizeText(form.email) && !normalizeText(form.phone)) return 'Please provide an email address or mobile number.'
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(form.email))) return 'Please enter a valid email address.'
      return ''
    }
    if (step === 'budget') {
      const min = normalizeNumber(form.budgetMin)
      const max = normalizeNumber(form.budgetMax)
      if (min !== null && max !== null && min > max) return 'Minimum budget cannot be greater than maximum budget.'
      return ''
    }
    if (step === 'listings') return ''
    return validateForm()
  }

  function toggleSelectedListing(listing = {}) {
    const selected = normalizeSelectedListing(listing)
    const selectedKey = listingKey(selected)
    if (!selectedKey) return
    setForm((previous) => {
      const current = Array.isArray(previous.selectedListings) ? previous.selectedListings : []
      const exists = current.some((item) => listingKey(item) === selectedKey)
      return {
        ...previous,
        selectedListings: exists
          ? current.filter((item) => listingKey(item) !== selectedKey)
          : mergeSelectedListings(current, [selected]),
      }
    })
  }

  function moveBuyerStep(direction) {
    const nextIndex = buyerStepIndex + direction
    if (direction > 0) {
      const validationError = validateBuyerStep()
      if (validationError) {
        setFormError(validationError)
        return
      }
    }
    if (nextIndex < 0 || nextIndex >= BUYER_STEPS.length) return
    setBuyerStep(BUYER_STEPS[nextIndex].id)
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleFormSubmit(event) {
    if (intent === 'buy' && buyerStep !== 'final') {
      event.preventDefault()
      moveBuyerStep(1)
      return
    }
    submitEnquiry(event)
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
        selectedListings: mergeSelectedListings(attribution.selectedListings, form.selectedListings),
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
  const isBuyerFlow = intent === 'buy' && !submitted
  const pageStyle = {
    '--intake-primary': theme.primary,
    '--intake-secondary': theme.secondary,
    '--intake-accent': theme.accent,
    '--intake-accent-text': theme.accentText,
    '--agency-primary': theme.primary,
    '--agency-primary-dark': theme.heroDark,
    '--agency-soft': theme.soft,
    '--agency-accent': theme.accent,
    backgroundColor: theme.primary,
  }

  if (!intent && !submitted) {
    return (
      <PublicIntakeLanding
        intake={intake}
        theme={theme}
        enabledIntents={enabledIntents}
        onChooseIntent={chooseIntent}
      />
    )
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

        <section className={`grid flex-1 gap-8 ${isBuyerFlow ? 'items-start py-5 sm:py-9 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1fr)] lg:items-center lg:gap-12' : 'items-center py-9 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1fr)] lg:gap-12'}`}>
          <div className={`${isBuyerFlow ? 'hidden lg:block' : ''} max-w-[620px]`}>
            {intent ? (
              <button
                type="button"
                onClick={resetFlow}
                className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/12 bg-white/10 px-3 text-sm font-semibold text-white/82 backdrop-blur transition hover:bg-white/14 focus:outline-none focus:ring-4 focus:ring-white/20"
              >
                <ArrowLeft size={17} aria-hidden="true" /> Back
              </button>
            ) : null}
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--intake-accent)]">Welcome to {getAgencyShortName(agencyName)}</p>
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

          <div className={`${isBuyerFlow ? 'flex min-h-[calc(100dvh-6.5rem)] w-full flex-col lg:min-h-0' : 'w-full'}`}>
            {submitted ? (
              <SuccessState agencyName={agencyName} intent={intent} duplicate={submittedDuplicate} onReset={resetFlow} />
            ) : intent ? (
              <section className={`${isBuyerFlow ? 'flex min-h-[calc(100dvh-6.5rem)] flex-col rounded-lg border border-white/18 bg-white text-[#173238] shadow-[0_30px_90px_rgba(0,0,0,0.24)] sm:min-h-0 sm:p-6' : 'rounded-lg border border-white/18 bg-white p-5 text-[#173238] shadow-[0_30px_90px_rgba(0,0,0,0.24)] sm:p-6'}`}>
                <form className={`${isBuyerFlow ? 'flex min-h-0 flex-1 flex-col gap-4 p-4 sm:gap-5 sm:p-0' : 'space-y-5'}`} onSubmit={handleFormSubmit} noValidate>
                  <div>
                    <h2 className="text-2xl font-semibold">{intent === 'sell' ? 'Selling details' : currentBuyerStep.title}</h2>
                    {intent === 'buy' ? (
                      <>
                        <p className="mt-1.5 text-sm leading-6 text-slate-500">{currentBuyerStep.summary}</p>
                        <p className="mt-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Step {buyerStepIndex + 1} of {BUYER_STEPS.length}</p>
                      </>
                    ) : null}
                  </div>

                  {intent === 'buy' ? (
                    <>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${BUYER_STEPS.length}, minmax(0, 1fr))` }} aria-label="Buyer intake progress">
                        {BUYER_STEPS.map((step, index) => {
                          const active = index <= buyerStepIndex
                          return (
                            <div key={step.id} className="grid gap-2">
                              <span className={`h-1.5 rounded-full ${active ? 'bg-[var(--intake-accent)]' : 'bg-slate-200'}`} />
                              <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${active ? 'text-slate-700' : 'text-slate-400'}`}>{step.label}</span>
                            </div>
                          )
                        })}
                      </div>

                      {buyerStep === 'contact' ? (
                        <IntakeSection title="Your details">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <TextInput icon={User} label="Full name" required value={form.name} onChange={(event) => updateForm('name', event.target.value)} autoComplete="name" maxLength={240} placeholder="Your name" />
                            <TextInput icon={Phone} label="Mobile number" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} autoComplete="tel" inputMode="tel" maxLength={40} placeholder="082 123 4567" />
                          </div>
                          <TextInput icon={Mail} label="Email address" value={form.email} onChange={(event) => updateForm('email', event.target.value)} autoComplete="email" inputMode="email" maxLength={254} placeholder="name@example.com" />
                          <ContactHelper />
                        </IntakeSection>
                      ) : null}

                      {buyerStep === 'budget' ? (
                        <>
                          <BudgetRangeSelector valueMin={form.budgetMin} valueMax={form.budgetMax} onSelect={updateBudgetRange} />
                          <TextInput compact icon={MapPin} label="Preferred areas" value={form.areas} onChange={(event) => updateForm('areas', event.target.value)} maxLength={500} placeholder="Suburbs or areas" />
                          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                            <SelectInput compact icon={Home} label="Property type" value={form.propertyType} onChange={(event) => updateForm('propertyType', event.target.value)}>
                              {PROPERTY_TYPES.map((type) => <option key={type || 'any'} value={type}>{type || 'Any type'}</option>)}
                            </SelectInput>
                            <SelectInput compact icon={Bath} label="Bathrooms" value={form.bathrooms} onChange={(event) => updateForm('bathrooms', event.target.value)}>
                              <option value="">Any</option>
                              {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}+</option>)}
                            </SelectInput>
                          </div>
                          <OptionButtonGroup
                            icon={BedDouble}
                            label="Bedrooms"
                            options={BEDROOM_OPTIONS}
                            value={form.bedrooms}
                            onChange={(value) => updateForm('bedrooms', value)}
                            columns="grid-cols-4"
                          />
                          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                            <SelectInput compact icon={ShieldCheck} label="Finance" value={form.financeStatus} onChange={(event) => updateForm('financeStatus', event.target.value)}>
                              {FINANCE_STATUSES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                            </SelectInput>
                            <SelectInput compact icon={CalendarDays} label="Timeline" value={form.buyerTimeline} onChange={(event) => updateForm('buyerTimeline', event.target.value)}>
                              {TIMELINES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                            </SelectInput>
                          </div>
                        </>
                      ) : null}

                      {buyerStep === 'listings' ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-4">
                          {form.selectedListings.length ? (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-sm font-semibold text-slate-900">{form.selectedListings.length} selected</p>
                              <button
                                type="button"
                                onClick={() => updateForm('selectedListings', [])}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
                              >
                                Clear
                              </button>
                            </div>
                          ) : null}

                          {listingLoading ? (
                            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500" role="status">
                              <LoaderCircle className="mr-2 animate-spin" size={18} aria-hidden="true" /> Loading published listings...
                            </div>
                          ) : listingError ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900" role="status">
                              {listingError} You can still continue without selecting a listing.
                            </div>
                          ) : listingOptions.length ? (
                            <div className="grid min-h-[260px] max-h-[52dvh] flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[min(58dvh,620px)] sm:grid-cols-2 sm:pr-2">
                              {listingOptions.map((listing) => {
                                const key = listingKey(listing)
                                const selected = form.selectedListings.some((item) => listingKey(item) === key)
                                return (
                                  <ListingSelectionCard
                                    key={key}
                                    listing={listing}
                                    selected={selected}
                                    onToggle={() => toggleSelectedListing(listing)}
                                  />
                                )
                              })}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                              <Home className="mx-auto text-slate-400" size={26} aria-hidden="true" />
                              <p className="mt-3 text-sm font-semibold text-slate-800">No matching listings available</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">The agency can still match you manually from your budget and area details.</p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {buyerStep === 'final' ? (
                        <>
                          {form.selectedListings.length ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-sm font-semibold text-slate-900">{form.selectedListings.length} listing{form.selectedListings.length === 1 ? '' : 's'} selected</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {form.selectedListings.map((listing) => listing.title || listing.slug || listing.id).filter(Boolean).slice(0, 3).join(', ')}
                                {form.selectedListings.length > 3 ? ` and ${form.selectedListings.length - 3} more` : ''}
                              </p>
                            </div>
                          ) : null}

                          <IntakeTextarea
                            icon={MessageCircle}
                            label="Notes"
                            rows={4}
                            maxLength={5000}
                            value={form.message}
                            onChange={(event) => updateForm('message', event.target.value)}
                            placeholder="Anything useful for the agency"
                          />

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
                        </>
                      ) : null}

                      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                        <label>
                          Website
                          <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => updateForm('website', event.target.value)} />
                        </label>
                      </div>

                      {formError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800" role="alert">
                          {formError}
                        </div>
                      ) : null}

                      <div className="sticky bottom-0 z-20 -mx-5 mt-auto grid grid-cols-2 gap-3 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-18px_34px_rgba(15,23,42,0.12)] backdrop-blur sm:static sm:mx-0 sm:mt-0 sm:grid-cols-[auto_1fr] sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
                        <button
                          type="button"
                          onClick={() => (buyerStepIndex === 0 ? resetFlow() : moveBuyerStep(-1))}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
                        >
                          <ArrowLeft size={17} aria-hidden="true" /> Back
                        </button>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--intake-accent)] px-5 text-sm font-semibold text-[var(--intake-accent-text)] shadow-[0_14px_30px_rgba(15,23,42,0.16)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-wait disabled:opacity-70"
                        >
                          {buyerStep === 'final'
                            ? submitting
                              ? <><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> Sending...</>
                              : <>Send enquiry <ArrowRight size={18} aria-hidden="true" /></>
                            : <>Next <ArrowRight size={18} aria-hidden="true" /></>}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <IntakeSection title="Your details">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextInput icon={User} label="Full name" required value={form.name} onChange={(event) => updateForm('name', event.target.value)} autoComplete="name" maxLength={240} placeholder="Your name" />
                          <TextInput icon={Phone} label="Mobile number" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} autoComplete="tel" inputMode="tel" maxLength={40} placeholder="082 123 4567" />
                        </div>
                        <TextInput icon={Mail} label="Email address" value={form.email} onChange={(event) => updateForm('email', event.target.value)} autoComplete="email" inputMode="email" maxLength={254} placeholder="name@example.com" />
                        <ContactHelper />
                      </IntakeSection>

                      <IntakeSection title="Property details">
                        <TextInput icon={MapPin} label="Property address" value={form.propertyAddress} onChange={(event) => updateForm('propertyAddress', event.target.value)} maxLength={1000} placeholder="Address or complex name" />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextInput icon={MapPin} label="Suburb" value={form.suburb} onChange={(event) => updateForm('suburb', event.target.value)} maxLength={160} placeholder="Suburb" />
                          <SelectInput icon={Home} label="Property type" value={form.sellerPropertyType} onChange={(event) => updateForm('sellerPropertyType', event.target.value)}>
                            {PROPERTY_TYPES.map((type) => <option key={type || 'any'} value={type}>{type || 'Please select'}</option>)}
                          </SelectInput>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextInput icon={Banknote} prefix="R" label="Estimated value" value={form.estimatedValue} onChange={(event) => updateForm('estimatedValue', event.target.value)} type="number" inputMode="decimal" min="0" step="50000" placeholder="2500000" />
                          <SelectInput icon={CalendarDays} label="Timeline" value={form.sellerTimeline} onChange={(event) => updateForm('sellerTimeline', event.target.value)}>
                            {TIMELINES.map(([value, label]) => <option key={value || 'unknown'} value={value}>{label}</option>)}
                          </SelectInput>
                        </div>
                      </IntakeSection>

                      <IntakeTextarea
                        icon={MessageCircle}
                        label="Notes"
                        rows={4}
                        maxLength={5000}
                        value={form.message}
                        onChange={(event) => updateForm('message', event.target.value)}
                        placeholder="Anything useful for the agency"
                      />

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
                    </>
                  )}
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

        <footer className={`${isBuyerFlow ? 'hidden sm:grid' : 'grid'} gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs font-medium text-white/82 sm:grid-cols-3`}>
          <span className="inline-flex items-center gap-2"><MapPin size={14} aria-hidden="true" /> {intake.agency?.website || agencyName}</span>
          <span className="inline-flex items-center gap-2"><BedDouble size={14} aria-hidden="true" /> Buyer requirements</span>
          <span className="inline-flex items-center gap-2"><Bath size={14} aria-hidden="true" /> Seller enquiries</span>
        </footer>
      </div>
    </main>
  )
}
