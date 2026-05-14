import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileCheck2,
  Home,
  Landmark,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { MOCK_DATA_ENABLED } from '../lib/mockData'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  createListingDraftFromSellerLead,
  findSellerWorkflowRecordByToken,
  LISTING_STATUS,
  SELLER_ONBOARDING_STATUS,
  SELLER_LEAD_STAGE,
  updateSellerWorkflowRecordByToken,
} from '../lib/agentListingStorage'
import {
  getSellerOnboardingByToken,
  submitSellerOnboarding,
  updateSellerOnboardingProgress,
} from '../services/privateListingService'
import {
  getPropertyCategoryLabel,
  getPropertyStructureTypeLabel,
  normalizePropertyCategory,
  normalizePropertyStructureType,
  PROPERTY_CATEGORIES,
  PROPERTY_STRUCTURE_TYPES,
} from '../lib/propertyTaxonomy'

const STEPS = ['Seller Information', 'Property Details', 'FICA & Compliance', 'Review & Submit']

const SELLER_STATUS_LABELS = {
  [SELLER_ONBOARDING_STATUS.NOT_STARTED]: 'Not Started',
  [SELLER_ONBOARDING_STATUS.IN_PROGRESS]: 'In Progress',
  [SELLER_ONBOARDING_STATUS.SUBMITTED]: 'Submitted',
  [SELLER_ONBOARDING_STATUS.UNDER_REVIEW]: 'Under Review',
  [SELLER_ONBOARDING_STATUS.COMPLETED]: 'Completed',
}

const PROPERTY_FEATURES = [
  { key: 'garden', label: 'Garden' },
  { key: 'security', label: 'Security (Estate / Alarm / Electric Fence)' },
  { key: 'solar', label: 'Solar / Inverter' },
  { key: 'water', label: 'Borehole / Water Tank' },
  { key: 'fibre', label: 'Fibre' },
  { key: 'aircon', label: 'Aircon' },
  { key: 'fireplace', label: 'Fireplace' },
  { key: 'flatlet', label: 'Flatlet / Second Dwelling' },
  { key: 'staff_quarters', label: 'Staff Quarters' },
]

const OWNERSHIP_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'married_cop', label: 'Married (COP)' },
  { value: 'married_anc', label: 'Married (ANC)' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'multiple_owners', label: 'Multiple owners' },
]

const PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1120px]'
const SECTION_CARD_CLASS =
  'rounded-[20px] border border-[#dbe5ef] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-4 lg:rounded-[28px] lg:p-6 lg:shadow-[0_24px_54px_rgba(15,23,42,0.09)]'
const INNER_PANEL_CLASS =
  'rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-4 lg:rounded-[20px] lg:p-5'
const DETAIL_INPUT_CLASS =
  'w-full min-h-[48px] sm:min-h-[52px] rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 sm:px-4 sm:py-3 text-base text-[#162334] outline-none transition duration-150 ease-out placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'
const SELLER_ONBOARDING_NOTIFICATION_TIMEOUT_MS = 8000
const STEP_META = [
  {
    label: 'Seller Information',
    helper: 'Confirm seller identity and ownership structure.',
    icon: UserRound,
  },
  {
    label: 'Property Details',
    helper: 'Capture the property identity and sale context.',
    icon: Home,
  },
  {
    label: 'FICA & Compliance',
    helper: 'Review document requirements for your seller profile.',
    icon: ShieldCheck,
  },
  {
    label: 'Review & Submit',
    helper: 'Check everything before your agent receives it.',
    icon: ClipboardCheck,
  },
]

function resolveSellerOnboardingSubmitError(error) {
  const message = String(error?.message || '').trim()
  if (!message) return 'Unable to submit onboarding right now. Please try again.'
  if (message.toLowerCase().includes('fetch failed')) {
    return 'We could not reach the onboarding service. Please check your connection and try again.'
  }
  return message
}

async function notifyAssignedAgentOfSellerOnboarding(updated = {}, form = {}) {
  const assignedAgentEmail = String(updated?.assignedAgentEmail || updated?.agentEmail || updated?.agentId || '').trim()
  if (!assignedAgentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignedAgentEmail)) return

  const assignedAgentName = String(updated?.assignedAgentName || updated?.assignedAgent || 'Agent').trim()
  const sellerName = [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' ') || 'Seller'
  const propertyTitle = String(updated?.listingTitle || form.propertyAddress || 'property').trim()

  let timeoutId = null
  try {
    await Promise.race([
      invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_onboarding_submitted',
          to: assignedAgentEmail,
          agentName: assignedAgentName,
          sellerName,
          propertyTitle,
        },
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Seller onboarding notification timed out.')), SELLER_ONBOARDING_NOTIFICATION_TIMEOUT_MS)
      }),
    ])
  } catch (notificationError) {
    console.error('[Seller Onboarding] assigned agent notification failed', notificationError)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function choiceCardClass(isActive) {
  return `w-full rounded-[16px] border px-4 py-4 text-left transition duration-150 ease-out ${
    isActive
      ? 'border-[#35546c] bg-[#f3f8ff] shadow-[0_10px_24px_rgba(53,84,108,0.14)]'
      : 'border-[#dbe5ef] bg-white hover:border-[#b6c9de] hover:bg-[#fafcff]'
  }`
}

function chipChoiceClass(isActive) {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
    isActive ? 'border-[#35546c] bg-[#f3f8ff] text-[#1f3a56]' : 'border-[#d6e1ee] bg-white text-[#35546c]'
  }`
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatValue(value, fallback = 'Not provided') {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  return text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getInitials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'B9'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function resolveAgencyBrand(listing = {}) {
  const agencyName =
    String(
      listing?.agencyOrganisation ||
      listing?.organisationName ||
      listing?.agencyName ||
      listing?.agency?.name ||
      listing?.organisation?.name ||
      listing?.assignedAgencyName ||
      '',
    ).trim() || 'Your Agency'
  const logoUrl =
    String(
      listing?.agencyLogoUrl ||
      listing?.organisationLogoUrl ||
      listing?.agency?.logoUrl ||
      listing?.organisation?.logoUrl ||
      listing?.branding?.logoUrl ||
      '',
    ).trim()
  return { name: agencyName, logoUrl, initials: getInitials(agencyName) }
}

function resolveAgentName(listing = {}) {
  return String(
    listing?.assignedAgentName ||
    listing?.assignedAgent ||
    listing?.agentName ||
    listing?.sellerOnboarding?.agentName ||
    'Your agent',
  ).trim()
}

function getSellerDisplayName(listing = {}, form = {}) {
  return [form?.sellerFirstName, form?.sellerSurname].filter(Boolean).join(' ').trim() ||
    String(listing?.seller?.name || listing?.sellerName || 'Seller').trim()
}

function getPropertyDisplayAddress(listing = {}, form = {}) {
  return String(
    form?.propertyAddress ||
    listing?.propertyAddress ||
    listing?.listingTitle ||
    listing?.title ||
    'Property details pending',
  ).trim()
}

function isCompactPropertyType(form = {}) {
  const type = String(form?.propertyType || '').toLowerCase()
  const structure = String(form?.propertyStructureType || '').toLowerCase()
  return ['apartment', 'townhouse', 'cluster', 'duplex'].includes(type) || structure.includes('sectional')
}

function isLandOrAgricultural(form = {}) {
  const type = String(form?.propertyType || '').toLowerCase()
  const category = String(form?.propertyCategory || '').toLowerCase()
  return ['farm', 'vacant_land'].includes(type) || category === 'agricultural'
}

function isCommercialProperty(form = {}) {
  const type = String(form?.propertyType || '').toLowerCase()
  const category = String(form?.propertyCategory || '').toLowerCase()
  return category === 'commercial' || ['office_building', 'warehouse', 'retail_store'].includes(type)
}

function getRequirementStatus(requirement = {}) {
  const status = String(requirement?.status || requirement?.documentStatus || 'required').trim().toLowerCase()
  if (['approved', 'accepted', 'completed'].includes(status)) return { label: 'Accepted', tone: 'success' }
  if (['uploaded', 'under_review', 'pending_review'].includes(status)) return { label: 'Pending Review', tone: 'info' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'danger' }
  return { label: 'Required', tone: 'muted' }
}

function buildComplianceDocuments(listing = {}, fallbackRequirements = []) {
  const rows = [
    ...(Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []),
    ...(Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []),
  ].filter(Boolean)

  if (rows.length) {
    return rows.map((row, index) => ({
      key: row?.key || row?.requirement_key || row?.id || `document-${index}`,
      label: row?.label || row?.requirement_name || formatValue(row?.key || row?.requirement_key, 'Document'),
      description: row?.requirement_description || row?.description || 'Your agent may request this before mandate completion.',
      status: row?.status || 'required',
      fileName: row?.fileName || row?.document_name || '',
    }))
  }

  return fallbackRequirements.map((label) => ({
    key: label,
    label,
    description: 'Required for this seller profile.',
    status: 'required',
    fileName: '',
  }))
}

function splitName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: '' }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.slice(-1).join(' ') }
}

function normalizeOwnershipType(existing = {}) {
  if (existing.ownershipType) {
    const explicit = String(existing.ownershipType).toLowerCase()
    if (explicit === 'married') {
      return String(existing.marriageRegime || '').toLowerCase().includes('cop') ? 'married_cop' : 'married_anc'
    }
    return explicit
  }
  if (String(existing.maritalStatus || '').toLowerCase() === 'married') {
    return String(existing.marriageRegime || '').toLowerCase().includes('cop') ? 'married_cop' : 'married_anc'
  }
  return 'individual'
}

function normalizeFormData(listing) {
  const seller = listing?.seller || {}
  const existing = listing?.sellerOnboarding?.formData || {}
  const split = splitName(existing.fullName || seller.name || '')

  return {
    sellerFirstName: existing.sellerFirstName || split.firstName,
    sellerSurname: existing.sellerSurname || split.surname,
    idNumber: existing.idNumber || '',
    email: existing.email || seller.email || '',
    phone: existing.phone || seller.phone || '',
    residentialAddress: existing.residentialAddress || '',

    ownershipType: normalizeOwnershipType(existing),
    spouseName: existing.spouseName || '',
    spouseIdNumber: existing.spouseIdNumber || '',
    spouseEmail: existing.spouseEmail || '',
    spousePhone: existing.spousePhone || '',

    companyName: existing.companyName || existing.entityName || '',
    companyRegistrationNumber: existing.companyRegistrationNumber || existing.entityRegistrationNumber || '',
    companyDirectorName: existing.companyDirectorName || existing.entityRepresentative || '',
    companyDirectorEmail: existing.companyDirectorEmail || '',
    companyDirectorPhone: existing.companyDirectorPhone || '',

    trustName: existing.trustName || existing.entityName || '',
    trustRegistrationNumber: existing.trustRegistrationNumber || existing.entityRegistrationNumber || '',
    trusteeName: existing.trusteeName || existing.entityRepresentative || '',
    trusteeEmail: existing.trusteeEmail || '',
    trusteePhone: existing.trusteePhone || '',

    multipleOwners: Array.isArray(existing.multipleOwners) && existing.multipleOwners.length
      ? existing.multipleOwners
      : [
          {
            id: 'owner-1',
            name: '',
            surname: '',
            idNumber: '',
            email: '',
            phone: '',
            ownershipShare: '',
          },
        ],

    askingPrice: existing.askingPrice || String(listing?.askingPrice || ''),
    sellingTimeline: existing.sellingTimeline || '1_3_months',
    sellingReason: existing.sellingReason || '',

    propertyCategory: normalizePropertyCategory(existing.propertyCategory || listing?.propertyCategory || listing?.property_category, { fallback: 'residential' }),
    propertyStructureType: normalizePropertyStructureType(existing.propertyStructureType || listing?.propertyStructureType || listing?.property_structure_type || existing.propertyType, { fallback: 'other' }),
    propertyType: existing.propertyType || listing?.propertyType || 'house',
    propertyAddress: existing.propertyAddress || [listing?.listingTitle, listing?.suburb, listing?.city].filter(Boolean).join(', '),
    suburb: existing.suburb || listing?.suburb || '',
    city: existing.city || listing?.city || '',
    province: existing.province || '',
    estateComplexName: existing.estateComplexName || '',
    unitNumber: existing.unitNumber || '',

    erfSize: existing.erfSize || '',
    floorSize: existing.floorSize || '',
    bedrooms: existing.bedrooms || '',
    bathrooms: existing.bathrooms || '',
    livingArea: existing.livingArea || '',
    kitchens: existing.kitchens || '',
    garages: existing.garages || '',
    parkingCovered: existing.parkingCovered || '',
    parkingOpen: existing.parkingOpen || '',
    pool: Boolean(existing.pool),
    levies: existing.levies || '',
    ratesTaxes: existing.ratesTaxes || '',

    features: Array.isArray(existing.features) ? existing.features : [],
    propertyCondition: existing.propertyCondition || 'good',
    kitchenCondition: existing.kitchenCondition || 'good',
    bathroomCondition: existing.bathroomCondition || 'good',
    views: existing.views || '',
    recentRenovations: existing.recentRenovations || '',
    propertyNotes: existing.propertyNotes || '',
  }
}

function AgencyMark({ brand, tone = 'dark' }) {
  if (brand?.logoUrl) {
    return (
      <img
        src={brand.logoUrl}
        alt={`${brand.name} logo`}
        className={`h-10 w-10 rounded-[14px] object-contain p-1 shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:h-12 sm:w-12 sm:rounded-[16px] ${tone === 'light' ? 'border border-[#dbe5ef] bg-white' : 'border border-white/15 bg-white'}`}
      />
    )
  }

  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-xs font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:h-12 sm:w-12 sm:rounded-[16px] sm:text-sm ${tone === 'light' ? 'border border-[#dbe5ef] bg-[#172334] text-white' : 'border border-white/15 bg-white/10 text-white'}`}>
      {brand?.initials || 'AG'}
    </span>
  )
}

function SellerBrandBar({ brand }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <AgencyMark brand={brand} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white sm:text-base">{brand.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 sm:text-xs sm:tracking-[0.16em]">Seller Onboarding</p>
        </div>
      </div>
      <div className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/75 sm:gap-3 sm:py-2 sm:text-xs">
        <span>Powered by</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[#101827]">Bridge9</span>
      </div>
    </div>
  )
}

function SellerOnboardingHero({ brand, listing, form, statusLabel }) {
  const sellerName = getSellerDisplayName(listing, form)
  const propertyAddress = getPropertyDisplayAddress(listing, form)
  const agentName = resolveAgentName(listing)

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#18263a] bg-[#101827] p-4 text-white shadow-[0_18px_44px_rgba(15,23,42,0.2)] sm:rounded-[26px] sm:p-5 lg:rounded-[30px] lg:p-7 lg:shadow-[0_28px_70px_rgba(15,23,42,0.24)]">
      <SellerBrandBar brand={brand} />
      <div className="mt-4 grid gap-4 sm:mt-5 lg:mt-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-white/72 sm:text-xs">
            <ShieldCheck size={14} />
            Secure seller portal
          </p>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:mt-4 sm:text-3xl lg:text-5xl lg:tracking-[-0.03em]">
            Complete your seller onboarding
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c8d4e3] sm:mt-4 lg:text-base">
            A guided intake for your seller, property, FICA, and mandate preparation details.
          </p>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-white/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:rounded-[20px] sm:p-4 lg:rounded-[22px]">
          <div className="grid gap-3">
            <article>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Seller</p>
              <p className="mt-1 break-words text-sm font-semibold text-white">{sellerName}</p>
            </article>
            <article>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Property</p>
              <p className="mt-1 break-words text-sm font-semibold leading-5 text-white">{propertyAddress}</p>
            </article>
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <span className="rounded-[14px] border border-white/10 bg-white/8 px-3 py-2 text-xs text-white/70">
                Agent<br /><strong className="text-white">{agentName}</strong>
              </span>
              <span className="rounded-[14px] border border-white/10 bg-white/8 px-3 py-2 text-xs text-white/70">
                Status<br /><strong className="text-white">{statusLabel}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:mt-5 lg:mt-6">
        {['Guided onboarding', 'Takes 3-5 minutes', 'Bank-grade care'].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/8 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 sm:gap-2 sm:px-3 sm:text-xs">
            <BadgeCheck size={13} />
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

function SellerStepProgress({ currentStep, progress }) {
  return (
    <section className="rounded-[18px] border border-[#dbe5ef] bg-white p-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:rounded-[22px] sm:p-4 lg:rounded-[24px] lg:p-5 lg:shadow-[0_18px_42px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-3 sm:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f8298]">Step {currentStep + 1} of {STEPS.length}</p>
          <h2 className="mt-1 break-words text-lg font-semibold tracking-[-0.02em] text-[#142132]">{STEP_META[currentStep]?.label}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-[#f2f6fb] px-2.5 py-1 text-xs font-semibold text-[#35546c]">{progress}%</span>
      </div>
      <p className="mt-2 text-sm leading-5 text-[#6b7d93] sm:hidden">{STEP_META[currentStep]?.helper}</p>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#eef3f8] sm:hidden">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-[#172334] via-[#35546c] to-[#2f8f86] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 sm:hidden">
        {STEP_META.map((step, index) => (
          <span
            key={step.label}
            className={`h-2 rounded-full transition-all ${index <= currentStep ? 'w-6 bg-[#35546c]' : 'w-2 bg-[#d8e2ee]'}`}
          />
        ))}
      </div>

      <div className="hidden items-start justify-between gap-3 sm:flex">
        <div>
          <p className="text-sm font-semibold text-[#142132]">Step {currentStep + 1} of {STEPS.length}</p>
          <p className="mt-1 text-sm text-[#6b7d93]">{STEP_META[currentStep]?.helper}</p>
        </div>
        <span className="rounded-full bg-[#f2f6fb] px-3 py-1 text-xs font-semibold text-[#35546c]">{progress}% complete</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#eef3f8]">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-[#172334] via-[#35546c] to-[#2f8f86] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-4">
        {STEP_META.map((step, index) => {
          const Icon = step.icon
          const isActive = index === currentStep
          const isComplete = index < currentStep
          return (
            <button
              key={step.label}
              type="button"
              className={`flex items-center gap-3 rounded-[16px] border px-3 py-3 text-left transition ${
                isActive
                  ? 'border-[#35546c] bg-[#f3f8ff] shadow-[0_10px_24px_rgba(53,84,108,0.12)]'
                  : isComplete
                    ? 'border-[#d8ecdf] bg-[#f4fbf6]'
                    : 'border-[#e1e9f3] bg-[#fbfdff]'
              }`}
              disabled
            >
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isComplete ? 'bg-[#1f7d44] text-white' : isActive ? 'bg-[#172334] text-white' : 'bg-white text-[#7890a8]'
              }`}>
                {isComplete ? <CheckCircle2 size={17} /> : <Icon size={17} />}
              </span>
              <span className="min-w-0">
                <strong className="block text-xs leading-4 text-[#172334] md:text-sm">{step.label}</strong>
                <span className="mt-0.5 hidden text-xs leading-4 text-[#7a8da3] lg:block">{step.helper}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function StepShell({ eyebrow, title, description, children }) {
  return (
    <section className={INNER_PANEL_CLASS}>
      <header className="mb-4 sm:mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f8298]">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#162435] sm:text-2xl sm:tracking-[-0.025em]">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60748b]">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

function FormSection({ icon, title, description, children }) {
  const SectionIcon = icon || Circle
  return (
    <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-3 sm:p-4 lg:rounded-[20px] lg:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-white text-[#35546c] shadow-[0_10px_22px_rgba(15,23,42,0.06)] sm:h-10 sm:w-10 sm:rounded-[14px]">
          <SectionIcon size={18} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-[#162435]">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-5 text-[#6b7d93]">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ChoiceCard({ active, title, description, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`${choiceCardClass(active)} min-h-[58px]`}>
      <span className={`block text-sm font-semibold ${active ? 'text-[#142132]' : 'text-[#35546c]'}`}>{title}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{description}</span> : null}
    </button>
  )
}

function DocumentCard({ document }) {
  const status = getRequirementStatus(document)
  const toneClass = {
    success: 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]',
    info: 'border-[#dbe6f2] bg-[#f7fbff] text-[#35546c]',
    danger: 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]',
    muted: 'border-[#dbe6f2] bg-white text-[#35546c]',
  }[status.tone] || 'border-[#dbe6f2] bg-white text-[#35546c]'

  return (
    <article className="flex flex-col gap-3 rounded-[16px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:flex-row sm:items-start sm:justify-between sm:rounded-[18px] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f2f6fb] text-[#35546c]">
          <FileCheck2 size={18} />
        </span>
        <div>
          <p className="font-semibold text-[#172334]">{document.label}</p>
          <p className="mt-1 text-sm leading-5 text-[#6b7d93]">{document.fileName || document.description}</p>
        </div>
      </div>
      <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>{status.label}</span>
    </article>
  )
}

function ReviewCard({ title, items, onEdit, missing = [] }) {
  return (
    <article className="rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:rounded-[20px] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7890a8]">{title}</p>
          {missing.length ? (
            <p className="mt-1 text-xs font-semibold text-[#b45309]">{missing.length} item{missing.length === 1 ? '' : 's'} need attention</p>
          ) : null}
        </div>
        {typeof onEdit === 'function' ? (
          <button type="button" onClick={onEdit} className="min-h-[34px] shrink-0 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">
            Edit
          </button>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item.label} className="grid gap-1 border-t border-[#eef3f8] pt-3 first:border-t-0 first:pt-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a9ab0]">{item.label}</dt>
            <dd className="text-sm font-semibold text-[#172334]">{item.value || 'Not provided'}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function SellerCompletedState({ token, listing, form, brand }) {
  return (
    <section className="rounded-[22px] border border-[#d8ecdf] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:rounded-[26px] sm:p-5 lg:rounded-[28px] lg:p-7 lg:shadow-[0_24px_54px_rgba(15,23,42,0.09)]">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-6">
        <div className="rounded-[20px] border border-[#d8ecdf] bg-[#eefbf3] p-4 sm:rounded-[24px] sm:p-5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1f7d44] text-white shadow-[0_16px_32px_rgba(31,125,68,0.24)] sm:h-14 sm:w-14">
            <CheckCircle2 size={26} />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-[#14532d] sm:mt-5 sm:text-2xl sm:tracking-[-0.025em]">Your seller information has been submitted</h2>
          <p className="mt-3 text-sm leading-6 text-[#25603d]">
            Your agent will review the information and prepare the next step in your selling journey.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link to={`/seller/${token}`} className="inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] bg-[#172334] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] sm:w-auto">
              Open Seller Workspace
            </Link>
            <Link to="/" className="inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] border border-[#b7dfc3] bg-white px-4 py-3 text-sm font-semibold text-[#14532d] sm:w-auto">
              Return to Bridge
            </Link>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-[18px] border border-[#dfe8f2] bg-[#fbfdff] p-3 sm:rounded-[20px] sm:p-4">
            <AgencyMark brand={brand} tone="light" />
            <div>
              <p className="text-sm font-semibold text-[#172334]">{brand.name}</p>
              <p className="text-sm text-[#6b7d93]">Need help? Contact your agent for the next step.</p>
            </div>
          </div>
          <ReviewCard
            title="Submitted Summary"
            items={[
              { label: 'Seller', value: getSellerDisplayName(listing, form) },
              { label: 'Property', value: getPropertyDisplayAddress(listing, form) },
              { label: 'Ownership', value: OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual' },
              { label: 'Asking Price', value: form.askingPrice ? formatCurrency(form.askingPrice) : 'Not provided' },
            ]}
          />
        </div>
      </div>
    </section>
  )
}

export function SellerOnboarding({ tokenOverride = '', embedded = false, onSubmitted = null }) {
  const params = useParams()
  const token = String(tokenOverride || params?.token || '').trim()
  const useDbFirstSellerOnboarding = Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED)
  const [listing, setListing] = useState(null)
  const [form, setForm] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showFicaInfo, setShowFicaInfo] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function load() {
      if (!token) {
        setError('Invalid seller onboarding link.')
        setLoading(false)
        return
      }

      if (useDbFirstSellerOnboarding) {
        try {
          const context = await getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: false })
          const found = context?.listing || null
          if (!found) {
            setError('Seller onboarding link is invalid or inactive.')
            setLoading(false)
            return
          }

          const onboardingStatus = String(found?.sellerOnboarding?.status || context?.onboarding?.status || '')
            .trim()
            .toLowerCase()
          const persistedStep = Number(found?.sellerOnboarding?.currentStep || context?.onboarding?.form_data?.currentStep || 0)
          const nextStep =
            onboardingStatus === SELLER_ONBOARDING_STATUS.SUBMITTED ||
            onboardingStatus === SELLER_ONBOARDING_STATUS.UNDER_REVIEW ||
            onboardingStatus === SELLER_ONBOARDING_STATUS.COMPLETED
              ? 3
              : Math.min(Math.max(persistedStep, 0), 3)

          let nextListing = found
          if (onboardingStatus === SELLER_ONBOARDING_STATUS.NOT_STARTED) {
            const progressUpdate = await updateSellerOnboardingProgress(token, {
              status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
              currentStep: nextStep,
            })
            nextListing = progressUpdate?.listing || found
          }

          if (!isMounted) return
          setListing(nextListing)
          setForm(normalizeFormData(nextListing))
          setCurrentStep(nextStep)
          setLoading(false)
          return
        } catch {
          // Fall through to runtime workflow for backwards compatibility.
        }
      }

      const found = findSellerWorkflowRecordByToken(token)
      if (!found) {
        setError('Seller onboarding link is invalid or inactive.')
        setLoading(false)
        return
      }

      const onboardingStatus = String(found?.sellerOnboarding?.status || '').trim().toLowerCase()
      const persistedStep = Number(found?.sellerOnboarding?.currentStep || 0)
      const nextStep =
        onboardingStatus === SELLER_ONBOARDING_STATUS.SUBMITTED ||
        onboardingStatus === SELLER_ONBOARDING_STATUS.UNDER_REVIEW ||
        onboardingStatus === SELLER_ONBOARDING_STATUS.COMPLETED
          ? 3
          : Math.min(Math.max(persistedStep, 0), 3)

      const nextListing =
        onboardingStatus === SELLER_ONBOARDING_STATUS.NOT_STARTED
          ? updateSellerWorkflowRecordByToken(token, (row) => ({
              ...row,
              sellerOnboarding: {
                ...(row?.sellerOnboarding || {}),
                status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
                startedAt: row?.sellerOnboarding?.startedAt || new Date().toISOString(),
                currentStep: nextStep,
              },
            })) || found
          : found

      if (!isMounted) return
      setListing(nextListing)
      setForm(normalizeFormData(nextListing))
      setCurrentStep(nextStep)
      setLoading(false)
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [token, useDbFirstSellerOnboarding])

  const progress = useMemo(() => Math.round(((currentStep + 1) / STEPS.length) * 100), [currentStep])

  const statusLabel = useMemo(() => {
    const key = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase()
    return SELLER_STATUS_LABELS[key] || 'In Progress'
  }, [listing?.sellerOnboarding?.status])

  const isCompleted = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase() === SELLER_ONBOARDING_STATUS.COMPLETED

  const ficaRequirements = useMemo(() => {
    const type = String(form?.ownershipType || '').toLowerCase()
    if (type === 'company') {
      return [
        'Company registration documents',
        'Director ID document(s)',
        'Director proof of address',
        'Proof of registered address',
      ]
    }
    if (type === 'trust') {
      return [
        'Trust deed',
        'Trustee ID document(s)',
        'Trustee proof of address',
        'Trust address confirmation',
      ]
    }
    if (type === 'multiple_owners') {
      return [
        'ID documents for all owners',
        'Proof of address for each owner',
        'Ownership share confirmation',
      ]
    }
    if (type === 'married_cop' || type === 'married_anc') {
      return [
        'Seller ID document',
        'Spouse ID document',
        'Seller proof of address',
        'Spouse proof of address',
      ]
    }
    return ['Seller ID document', 'Proof of address']
  }, [form?.ownershipType])

  const agencyBrand = useMemo(() => resolveAgencyBrand(listing || {}), [listing])
  const complianceDocuments = useMemo(
    () => buildComplianceDocuments(listing || {}, ficaRequirements),
    [ficaRequirements, listing],
  )

  async function persistListingUpdate(updater, options = {}) {
    if (useDbFirstSellerOnboarding) {
      const current = listing || {}
      const candidate = updater({ ...current })
      const nextStatus = String(candidate?.sellerOnboarding?.status || '').trim().toLowerCase() || SELLER_ONBOARDING_STATUS.IN_PROGRESS
      const nextStep = Number(candidate?.sellerOnboarding?.currentStep || currentStep || 0)
      const progressUpdate = await updateSellerOnboardingProgress(token, {
        status: nextStatus,
        currentStep: nextStep,
        formData: (candidate?.sellerOnboarding?.formData && typeof candidate.sellerOnboarding.formData === 'object')
          ? candidate.sellerOnboarding.formData
          : (form || {}),
      })
      const updated = progressUpdate?.listing || null
      if (updated) {
        setListing(updated)
        if (options.refreshForm) setForm(normalizeFormData(updated))
      }
      return updated
    }

    const updated = updateSellerWorkflowRecordByToken(token, updater)
    if (updated) {
      setListing(updated)
      if (options.refreshForm) {
        setForm(normalizeFormData(updated))
      }
      return updated
    }
    return null
  }

  function handleFormUpdate(key, value) {
    setForm((previous) => ({ ...(previous || {}), [key]: value }))
  }

  function handleFeatureToggle(featureKey) {
    setForm((previous) => {
      const prev = previous || {}
      const current = Array.isArray(prev.features) ? prev.features : []
      const nextFeatures = current.includes(featureKey) ? current.filter((item) => item !== featureKey) : [...current, featureKey]
      return { ...prev, features: nextFeatures }
    })
  }

  function updateMultipleOwner(ownerId, key, value) {
    setForm((previous) => ({
      ...(previous || {}),
      multipleOwners: (previous?.multipleOwners || []).map((owner) =>
        owner.id === ownerId ? { ...owner, [key]: value } : owner,
      ),
    }))
  }

  function addMultipleOwner() {
    setForm((previous) => ({
      ...(previous || {}),
      multipleOwners: [
        ...(previous?.multipleOwners || []),
        {
          id: `owner-${Date.now()}`,
          name: '',
          surname: '',
          idNumber: '',
          email: '',
          phone: '',
          ownershipShare: '',
        },
      ],
    }))
  }

  function removeMultipleOwner(ownerId) {
    setForm((previous) => {
      const current = previous?.multipleOwners || []
      if (current.length <= 1) return previous
      return {
        ...(previous || {}),
        multipleOwners: current.filter((owner) => owner.id !== ownerId),
      }
    })
  }

  async function saveDraft(nextStep = currentStep) {
    if (!form) return
    setSaving(true)
    setError('')
    await persistListingUpdate((row) => ({
      ...row,
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
        currentStep: nextStep,
        formData: { ...(form || {}) },
        updatedAt: new Date().toISOString(),
      },
    }))
    setSaving(false)
    setSuccess('Draft saved.')
    setTimeout(() => setSuccess(''), 1200)
  }

  function validateCurrentStep() {
    if (!form) return 'Form state unavailable.'

    if (currentStep === 0) {
      if (!form.sellerFirstName || !form.sellerSurname || !form.email || !form.phone) {
        return 'Please complete name, surname, email, and phone.'
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email))) {
        return 'Please provide a valid email address.'
      }

      const ownershipType = String(form.ownershipType || '')
      if (!ownershipType) return 'Please select ownership structure.'

      if (['individual', 'married_cop', 'married_anc'].includes(ownershipType) && !form.idNumber) {
        return 'Please provide ID number / passport details.'
      }

      if ((ownershipType === 'married_cop' || ownershipType === 'married_anc') && (!form.spouseName || !form.spouseIdNumber)) {
        return 'Spouse name and spouse ID number are required for married ownership.'
      }

      if (ownershipType === 'company' && (!form.companyName || !form.companyRegistrationNumber || !form.companyDirectorName)) {
        return 'Company name, registration number, and director details are required.'
      }

      if (ownershipType === 'trust' && (!form.trustName || !form.trustRegistrationNumber || !form.trusteeName)) {
        return 'Trust name, registration number, and trustee details are required.'
      }

      if (ownershipType === 'multiple_owners') {
        const owners = form.multipleOwners || []
        const hasInvalid = owners.some((owner) => !owner.name || !owner.surname || !owner.idNumber)
        if (!owners.length || hasInvalid) {
          return 'Each owner must include name, surname, and ID number.'
        }
      }
    }

    if (currentStep === 1) {
      if (!form.propertyCategory || !form.propertyType || !form.propertyAddress || !form.suburb || !form.province) {
        return 'Property category, property type, address, suburb, and province are required.'
      }
    }

    if (currentStep === 2) {
      if (!form.ownershipType) {
        return 'Please confirm ownership structure before submitting compliance requirements.'
      }
    }

    return ''
  }

  async function handleNext() {
    setError('')
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      return
    }
    const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
    await saveDraft(nextStep)
    setCurrentStep(nextStep)
  }

  async function handleBack() {
    setError('')
    const nextStep = Math.max(currentStep - 1, 0)
    await saveDraft(nextStep)
    setCurrentStep(nextStep)
  }

  async function handleSubmit() {
    if (!form || submitting) return
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      let updated = null
      if (useDbFirstSellerOnboarding) {
        const submitted = await submitSellerOnboarding(token, {
          status: 'completed',
          formData: { ...(form || {}), currentStep: 3 },
          sellerType: String(form?.ownershipType || '').trim().toLowerCase() || null,
          ownershipStructure: String(form?.ownershipType || '').trim().toLowerCase() || null,
          maritalRegime: String(form?.ownershipType || '').trim().toLowerCase().includes('married')
            ? String(form?.ownershipType || '').trim().toLowerCase()
            : null,
        })
        updated = submitted?.listing || null
      } else {
        updated = await persistListingUpdate((row) => ({
          ...row,
          stage: SELLER_LEAD_STAGE.ONBOARDING_COMPLETED,
          onboardingStatus: SELLER_ONBOARDING_STATUS.COMPLETED,
          listingStatus: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED,
          sellerOnboarding: {
            ...(row?.sellerOnboarding || {}),
            status: SELLER_ONBOARDING_STATUS.COMPLETED,
            submittedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            currentStep: 3,
            formData: { ...(form || {}) },
          },
        }))
      }

      if (!updated) {
        throw new Error('Unable to submit onboarding right now.')
      }

      if (!useDbFirstSellerOnboarding) {
        createListingDraftFromSellerLead(updated, { stage: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED })
      }

      setListing(updated)
      setCurrentStep(3)
      setSuccess('Your property details have been submitted.\nYour agent will review the information and prepare the next step.')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('itg:seller-onboarding-submitted', {
            detail: {
              token: String(updated?.sellerOnboarding?.token || updated?.sellerOnboardingToken || '').trim(),
              sellerLeadId: String(updated?.sellerLeadId || '').trim(),
              leadId: String(updated?.sellerLeadId || updated?.id || '').trim(),
              listingId: String(updated?.id || '').trim(),
              privateListingId: String(updated?.id || '').trim(),
              organisationId: String(updated?.organisationId || '').trim(),
              sellerOnboardingStatus: String(updated?.sellerOnboarding?.status || 'completed').trim(),
              submittedAt: new Date().toISOString(),
            },
          }),
        )
      }
      if (typeof onSubmitted === 'function') {
        try {
          onSubmitted(updated)
        } catch (callbackError) {
          console.error('[Seller Onboarding] submitted callback failed', callbackError)
        }
      }
      void notifyAssignedAgentOfSellerOnboarding(updated, form)
      console.debug('[Seller Onboarding] submit completed', {
        durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt),
        mode: useDbFirstSellerOnboarding ? 'supabase' : 'local',
      })
    } catch (submitError) {
      console.error('[Seller Onboarding] submit failed', submitError)
      setError(resolveSellerOnboardingSubmitError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return embedded
      ? <div className="px-1 py-2 text-sm text-[#5f738a]">Loading seller onboarding...</div>
      : (
        <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-5">
          <div className={PAGE_CONTAINER_CLASS}>
            <p className="rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4 text-sm text-[#516277] shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              Loading seller onboarding...
            </p>
          </div>
        </main>
      )
  }

  if (!listing || !form) {
    const invalidState = (
      <div className="rounded-[20px] border border-[#f6d4d4] bg-[#fff5f5] p-5 text-sm text-[#b42318]">
        {error || 'Seller onboarding link is invalid or inactive.'}
      </div>
    )
    return embedded ? invalidState : (
      <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-5">
        <div className={PAGE_CONTAINER_CLASS}>
          {invalidState}
        </div>
      </main>
    )
  }

  const showUnitDetails = isCompactPropertyType(form)
  const showLandDetails = isLandOrAgricultural(form)
  const showCommercialDetails = isCommercialProperty(form)
  const sellerMissing = [
    !form.sellerFirstName && 'Seller name',
    !form.sellerSurname && 'Seller surname',
    !form.email && 'Email',
    !form.phone && 'Phone',
  ].filter(Boolean)
  const propertyMissing = [
    !form.propertyAddress && 'Property address',
    !form.suburb && 'Suburb',
    !form.province && 'Province',
  ].filter(Boolean)

  const content = (
    <div className="space-y-4 sm:space-y-5">
      <SellerOnboardingHero brand={agencyBrand} listing={listing} form={form} statusLabel={statusLabel} />

      {isCompleted ? (
        <SellerCompletedState token={token} listing={listing} form={form} brand={agencyBrand} />
      ) : (
        <section className={SECTION_CARD_CLASS}>
        <SellerStepProgress currentStep={currentStep} progress={progress} />

        {error ? <p className="mt-4 rounded-[14px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
        {success ? <p className="mt-4 whitespace-pre-line rounded-[14px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-3 text-sm text-[#1f7d44]">{success}</p> : null}

        <div className="mt-4 space-y-4 sm:mt-5">
          {currentStep === 0 ? (
            <>
              <FormSection icon={UserRound} title="Personal & Contact Details" description="Confirm the seller details your agency will use for mandate and transaction communication.">
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Name
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerFirstName} onChange={(event) => handleFormUpdate('sellerFirstName', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Surname
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerSurname} onChange={(event) => handleFormUpdate('sellerSurname', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Email
                    <input className={DETAIL_INPUT_CLASS} type="email" value={form.email} onChange={(event) => handleFormUpdate('email', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Phone
                    <input className={DETAIL_INPUT_CLASS} value={form.phone} onChange={(event) => handleFormUpdate('phone', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    ID Number / Registration Number (where applicable)
                    <input className={DETAIL_INPUT_CLASS} value={form.idNumber} onChange={(event) => handleFormUpdate('idNumber', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                    Residential Address
                    <input className={DETAIL_INPUT_CLASS} value={form.residentialAddress} onChange={(event) => handleFormUpdate('residentialAddress', event.target.value)} />
                  </label>
                </div>
              </FormSection>

              <FormSection icon={Landmark} title="Ownership Structure" description="Tell us who owns the property so the correct legal and FICA sections can appear.">
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {OWNERSHIP_TYPES.map((item) => {
                    const active = form.ownershipType === item.value
                    return (
                      <ChoiceCard
                        key={item.value}
                        onClick={() => handleFormUpdate('ownershipType', item.value)}
                        active={active}
                        title={item.label}
                        description={active ? 'Selected for this seller profile.' : ''}
                      />
                    )
                  })}
                </div>

                {(form.ownershipType === 'married_cop' || form.ownershipType === 'married_anc') ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Name
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseName} onChange={(event) => handleFormUpdate('spouseName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse ID Number
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseIdNumber} onChange={(event) => handleFormUpdate('spouseIdNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Email (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.spouseEmail} onChange={(event) => handleFormUpdate('spouseEmail', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Spouse Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.spousePhone} onChange={(event) => handleFormUpdate('spousePhone', event.target.value)} />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'company' ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Company Name
                      <input className={DETAIL_INPUT_CLASS} value={form.companyName} onChange={(event) => handleFormUpdate('companyName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Registration Number
                      <input className={DETAIL_INPUT_CLASS} value={form.companyRegistrationNumber} onChange={(event) => handleFormUpdate('companyRegistrationNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Director Name
                      <input className={DETAIL_INPUT_CLASS} value={form.companyDirectorName} onChange={(event) => handleFormUpdate('companyDirectorName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Director Email / Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.companyDirectorEmail} onChange={(event) => handleFormUpdate('companyDirectorEmail', event.target.value)} placeholder="Email" />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'trust' ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trust Name
                      <input className={DETAIL_INPUT_CLASS} value={form.trustName} onChange={(event) => handleFormUpdate('trustName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Registration Number
                      <input className={DETAIL_INPUT_CLASS} value={form.trustRegistrationNumber} onChange={(event) => handleFormUpdate('trustRegistrationNumber', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trustee Name
                      <input className={DETAIL_INPUT_CLASS} value={form.trusteeName} onChange={(event) => handleFormUpdate('trusteeName', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Trustee Email / Phone (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.trusteeEmail} onChange={(event) => handleFormUpdate('trusteeEmail', event.target.value)} placeholder="Email" />
                    </label>
                  </div>
                ) : null}

                {form.ownershipType === 'multiple_owners' ? (
                  <div className="mt-4 space-y-3">
                    {(form.multipleOwners || []).map((owner, index) => (
                      <article key={owner.id} className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#22364a]">Owner {index + 1}</p>
                          {(form.multipleOwners || []).length > 1 ? (
                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#ffd2d2] bg-white text-[#9f1239]" onClick={() => removeMultipleOwner(owner.id)}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Name
                            <input className={DETAIL_INPUT_CLASS} value={owner.name} onChange={(event) => updateMultipleOwner(owner.id, 'name', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Surname
                            <input className={DETAIL_INPUT_CLASS} value={owner.surname} onChange={(event) => updateMultipleOwner(owner.id, 'surname', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            ID Number
                            <input className={DETAIL_INPUT_CLASS} value={owner.idNumber} onChange={(event) => updateMultipleOwner(owner.id, 'idNumber', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Ownership Share % (optional)
                            <input className={DETAIL_INPUT_CLASS} value={owner.ownershipShare} onChange={(event) => updateMultipleOwner(owner.id, 'ownershipShare', event.target.value)} />
                          </label>
                        </div>
                      </article>
                    ))}
                    <Button type="button" variant="secondary" size="sm" onClick={addMultipleOwner}>
                      <Plus size={14} />
                      Add Owner
                    </Button>
                  </div>
                ) : null}
              </FormSection>

              <FormSection icon={Building2} title="Selling Context" description="Light qualification details help your agent prepare the next step.">
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Asking Price (optional)
                    <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.askingPrice} onChange={(event) => handleFormUpdate('askingPrice', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Selling Timeline
                    <select className={DETAIL_INPUT_CLASS} value={form.sellingTimeline} onChange={(event) => handleFormUpdate('sellingTimeline', event.target.value)}>
                      <option value="urgent">Urgent (0-1 month)</option>
                      <option value="1_3_months">1-3 months</option>
                      <option value="3_6_months">3-6 months</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                    Reason for Selling (optional)
                    <select className={DETAIL_INPUT_CLASS} value={form.sellingReason} onChange={(event) => handleFormUpdate('sellingReason', event.target.value)}>
                      <option value="">Select reason</option>
                      <option value="upgrade">Upgrading</option>
                      <option value="downsize">Downsizing</option>
                      <option value="relocation">Relocation</option>
                      <option value="investment_exit">Investment Exit</option>
                      <option value="financial_change">Financial Change</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
              </FormSection>
            </>
          ) : null}

          {currentStep === 1 ? (
            <>
              <section className="rounded-[18px] border border-[#e0e9f3] bg-[#fbfdff] p-3 sm:p-4 lg:p-5">
                <h2 className="text-lg font-semibold text-[#162435]">Property Details</h2>

                <div className="mt-4 grid gap-4">
                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Basics</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Property Category
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyCategory} onChange={(event) => handleFormUpdate('propertyCategory', event.target.value)}>
                          {PROPERTY_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {getPropertyCategoryLabel(category)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Ownership / Structure Type
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyStructureType} onChange={(event) => handleFormUpdate('propertyStructureType', event.target.value)}>
                          {PROPERTY_STRUCTURE_TYPES.map((structureType) => (
                            <option key={structureType} value={structureType}>
                              {getPropertyStructureTypeLabel(structureType)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Property Type
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyType} onChange={(event) => handleFormUpdate('propertyType', event.target.value)}>
                          <option value="house">House</option>
                          <option value="apartment">Apartment</option>
                          <option value="townhouse">Townhouse</option>
                          <option value="cluster">Cluster</option>
                          <option value="duplex">Duplex</option>
                          <option value="office_building">Office Building</option>
                          <option value="warehouse">Warehouse</option>
                          <option value="retail_store">Retail Store</option>
                          <option value="farm">Farm</option>
                          <option value="vacant_land">Vacant Land</option>
                        </select>
                      </label>
                      {(showUnitDetails || showLandDetails || showCommercialDetails) ? (
                        <div className="rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3 text-sm leading-6 text-[#60748b] md:col-span-2">
                          {showUnitDetails ? 'Because this appears to be a sectional title or complex property, unit and complex details are shown.' : null}
                          {showLandDetails ? 'Because this appears to be land or agricultural property, land size and notes matter more than room counts.' : null}
                          {showCommercialDetails ? 'Because this appears to be a commercial property, valuation and condition notes should reflect the operating context.' : null}
                        </div>
                      ) : null}
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Address (start typing)
                        <input className={DETAIL_INPUT_CLASS} value={form.propertyAddress} onChange={(event) => handleFormUpdate('propertyAddress', event.target.value)} placeholder="Street address" />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Suburb
                        <input className={DETAIL_INPUT_CLASS} value={form.suburb} onChange={(event) => handleFormUpdate('suburb', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        City
                        <input className={DETAIL_INPUT_CLASS} value={form.city} onChange={(event) => handleFormUpdate('city', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Province
                        <input className={DETAIL_INPUT_CLASS} value={form.province} onChange={(event) => handleFormUpdate('province', event.target.value)} />
                      </label>
                      {showUnitDetails ? (
                        <>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Estate / Complex Name (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.estateComplexName} onChange={(event) => handleFormUpdate('estateComplexName', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Unit Number (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.unitNumber} onChange={(event) => handleFormUpdate('unitNumber', event.target.value)} />
                          </label>
                        </>
                      ) : null}
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Size</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Erf Size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.erfSize} onChange={(event) => handleFormUpdate('erfSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Floor Size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.floorSize} onChange={(event) => handleFormUpdate('floorSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bedrooms
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.bedrooms} onChange={(event) => handleFormUpdate('bedrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bathrooms
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.bathrooms} onChange={(event) => handleFormUpdate('bathrooms', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Living Areas
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.livingArea} onChange={(event) => handleFormUpdate('livingArea', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Kitchens
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.kitchens} onChange={(event) => handleFormUpdate('kitchens', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Garages
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.garages} onChange={(event) => handleFormUpdate('garages', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Covered Parking
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.parkingCovered} onChange={(event) => handleFormUpdate('parkingCovered', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Open Parking
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.parkingOpen} onChange={(event) => handleFormUpdate('parkingOpen', event.target.value)} />
                      </label>
                      <label className="flex items-center gap-2 rounded-[10px] border border-[#d6e1ee] px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={form.pool} onChange={(event) => handleFormUpdate('pool', event.target.checked)} />
                        Pool
                      </label>
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Features</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {PROPERTY_FEATURES.map((feature) => {
                        const active = (form.features || []).includes(feature.key)
                        return (
                          <button
                            key={feature.key}
                            type="button"
                            onClick={() => handleFeatureToggle(feature.key)}
                            className={chipChoiceClass(active)}
                          >
                            {feature.label}
                          </button>
                        )
                      })}
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Condition</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Property Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.propertyCondition} onChange={(event) => handleFormUpdate('propertyCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Notes (optional)
                        <textarea className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`} value={form.propertyNotes} onChange={(event) => handleFormUpdate('propertyNotes', event.target.value)} placeholder="Anything your agent should know about condition or upgrades" />
                      </label>
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Value / Valuation Factors</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Kitchen Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.kitchenCondition} onChange={(event) => handleFormUpdate('kitchenCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Bathroom Condition
                        <select className={DETAIL_INPUT_CLASS} value={form.bathroomCondition} onChange={(event) => handleFormUpdate('bathroomCondition', event.target.value)}>
                          <option value="needs_renovation">Needs renovation</option>
                          <option value="average">Average</option>
                          <option value="good">Good</option>
                          <option value="recently_renovated">Recently renovated</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Levies (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.levies} onChange={(event) => handleFormUpdate('levies', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Rates & Taxes (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.ratesTaxes} onChange={(event) => handleFormUpdate('ratesTaxes', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Views (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.views} onChange={(event) => handleFormUpdate('views', event.target.value)} placeholder="Mountain, sea, park, city..." />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Recent Renovations (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.recentRenovations} onChange={(event) => handleFormUpdate('recentRenovations', event.target.value)} placeholder="Kitchen updated in 2024, repaint, etc." />
                      </label>
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : null}

          {currentStep === 2 ? (
            <StepShell
              eyebrow="FICA & Compliance"
              title="Your document requirements"
              description="These requirements are based on the seller and ownership information you provided. Your agent may request additional documents after review."
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                <article className="rounded-[22px] border border-[#dbe6f2] bg-[#f7fbff] p-5">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[15px] bg-white text-[#35546c] shadow-[0_10px_22px_rgba(15,23,42,0.06)]">
                    <ShieldCheck size={20} />
                  </span>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#7890a8]">Compliance profile</p>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#172334]">
                    {OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual seller'}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#60748b]">
                    Bridge9 uses this information to help your agency prepare a compliant seller file before mandate and conveyancing steps.
                  </p>
                  <button
                    type="button"
                    className="mt-4 rounded-full border border-[#dce6f2] bg-white px-3 py-2 text-xs font-semibold text-[#35546c]"
                    onClick={() => setShowFicaInfo((current) => !current)}
                  >
                    {showFicaInfo ? 'Hide explanation' : 'Why these documents?'}
                  </button>
                  {showFicaInfo ? (
                    <p className="mt-3 text-sm leading-6 text-[#60748b]">
                      FICA and authority documents help confirm identity, ownership, signing authority, and the right legal party for the sale.
                    </p>
                  ) : null}
                </article>

                <div className="grid gap-3">
                  {complianceDocuments.map((document) => (
                    <DocumentCard key={document.key} document={document} />
                  ))}
                </div>
              </div>
            </StepShell>
          ) : null}

          {currentStep === 3 ? (
            <StepShell
              eyebrow="Review & Submit"
              title="Check your seller file"
              description="Once submitted, your agent will review the information and prepare the next step in your selling journey."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ReviewCard
                  title="Seller Summary"
                  missing={sellerMissing}
                  onEdit={() => setCurrentStep(0)}
                  items={[
                    { label: 'Seller', value: `${form.sellerFirstName} ${form.sellerSurname}`.trim() },
                    { label: 'Email', value: form.email },
                    { label: 'Phone', value: form.phone },
                    { label: 'Ownership', value: OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual' },
                  ]}
                />
                <ReviewCard
                  title="Property Summary"
                  missing={propertyMissing}
                  onEdit={() => setCurrentStep(1)}
                  items={[
                    { label: 'Property Type', value: `${getPropertyCategoryLabel(form.propertyCategory)} / ${formatValue(form.propertyType)}` },
                    { label: 'Title / Structure', value: getPropertyStructureTypeLabel(form.propertyStructureType) },
                    { label: 'Address', value: [form.propertyAddress, form.suburb, form.city, form.province].filter(Boolean).join(', ') },
                    { label: showUnitDetails ? 'Unit / Complex' : 'Erf / Size', value: showUnitDetails ? [form.unitNumber, form.estateComplexName].filter(Boolean).join(' / ') : `${form.erfSize || 'Not provided'} m2` },
                  ]}
                />
                <ReviewCard
                  title="Selling Context"
                  onEdit={() => setCurrentStep(0)}
                  items={[
                    { label: 'Asking Price', value: form.askingPrice ? formatCurrency(form.askingPrice) : 'Not provided' },
                    { label: 'Timeline', value: formatValue(form.sellingTimeline) },
                    { label: 'Reason', value: formatValue(form.sellingReason) },
                  ]}
                />
                <ReviewCard
                  title="Compliance Summary"
                  onEdit={() => setCurrentStep(2)}
                  items={[
                    { label: 'Seller Profile', value: OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType)?.label || 'Individual' },
                    { label: 'Required Documents', value: `${complianceDocuments.length} document${complianceDocuments.length === 1 ? '' : 's'} identified` },
                    { label: 'Next Step', value: 'Agent review and mandate preparation' },
                  ]}
                />
              </div>
              <div className="mt-5 rounded-[20px] border border-[#dbe6f2] bg-[#f7fbff] p-4">
                <div className="flex items-start gap-3">
                  <Sparkles size={18} className="mt-0.5 text-[#35546c]" />
                  <p className="text-sm leading-6 text-[#35546c]">
                    Submit when everything looks correct. Your agent will review this seller file and prepare the next step.
                  </p>
                </div>
              </div>
            </StepShell>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[#e4ebf5] pt-4 sm:mt-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-center text-sm text-[#6b7d93] lg:text-left">{saving ? 'Saving your progress...' : success ? 'Saved just now' : 'Secure seller onboarding powered by Bridge9'}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {currentStep > 0 ? (
              <Button type="button" variant="secondary" onClick={handleBack} disabled={saving || submitting} className="min-h-[46px] w-full sm:w-auto">
                <ChevronLeft size={14} />
                Back
              </Button>
            ) : null}
            {currentStep < 3 ? (
              <Button type="button" variant="ghost" onClick={() => saveDraft(currentStep)} disabled={saving || submitting} className="min-h-[46px] w-full sm:w-auto">
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
            ) : null}
            {currentStep < 3 ? (
              <Button type="button" onClick={handleNext} disabled={saving || submitting} className="min-h-[46px] w-full sm:w-auto">
                Save & Continue
                <ChevronRight size={14} />
              </Button>
            ) : null}
            {currentStep === 3 && !isCompleted ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="min-h-[46px] w-full sm:w-auto">
                {submitting ? 'Submitting...' : 'Submit Seller Information'}
                <CheckCircle2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </section>
      )}

      <footer className="flex flex-col gap-2 px-1 pb-2 text-center text-sm text-[#6b7d93] sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <span>Secure seller onboarding powered by Bridge9</span>
        <span>Need help? Contact {resolveAgentName(listing)}.</span>
      </footer>
    </div>
  )

  if (embedded) {
    return <div className="w-full">{content}</div>
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4fb_0%,#e8eef7_45%,#e1e8f2_100%)] px-4 py-4 pb-8 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-8 lg:pb-10">
      <div className={PAGE_CONTAINER_CLASS}>
        {content}
      </div>
    </main>
  )
}

export default SellerOnboarding
