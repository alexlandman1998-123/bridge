import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Download,
  FileCheck2,
  Home,
  Landmark,
  Plus,
  Scale,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AddressAutocomplete from '../components/location/AddressAutocomplete'
import {
  OnboardingSectionHeader,
  OnboardingSummaryCard,
  SellerOnboardingIllustration,
} from '../components/onboarding/OnboardingVisualStep'
import PremiumOnboardingLanding from '../components/onboarding/PremiumOnboardingLanding'
import Button from '../components/ui/Button'
import { MOCK_DATA_ENABLED } from '../lib/mockData'
import {
  getOnboardingBrandInitials,
  hasResolvedOnboardingBrandingValue,
  resolveOnboardingBranding,
} from '../lib/onboardingBranding'
import { getEdgeFunctionInvokeError, invokeEdgeFunction } from '../lib/supabaseClient'
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
  buildCanonicalSellerOnboardingPayload,
  normalizeCanonicalPropertyType,
  validateSellerOnboardingFacts,
} from '../services/documents/sellerOnboardingFactTransformer'
import { getDemoSellerOnboardingListing, isSellerOnboardingDemoToken } from '../lib/onboardingDemoLinks'
import { resolveSellerOnboardingFlow } from '../lib/sellerOnboardingFlow'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES,
  normalizeSellerTransferAttorneyDecision,
  validateSellerTransferAttorneyDecision,
} from '../lib/sellerTransferAttorneyDecision'
import {
  getPropertyCategoryLabel,
  getPropertyTypeLabel,
  getPropertyTypeOptionsByCategory,
  getPropertyStructureTypeLabel,
  normalizePropertyCategory,
  normalizePropertyStructureType,
  PROPERTY_CATEGORIES,
  PROPERTY_STRUCTURE_TYPES,
} from '../lib/propertyTaxonomy'
import {
  createBlankPropertyAddress,
  formatPropertyAddress,
  normalizePropertyAddress,
} from '../lib/sellerPropertyAddress'
import {
  PROPERTY_DISCLOSURE_ANSWER,
  PROPERTY_DISCLOSURE_QUESTIONS,
  buildPropertyDisclosureDocumentMarkup,
  buildPropertyDisclosureDocument,
  getPropertyDisclosureAnswerSummary,
  getPropertyDisclosureStatus,
  getPropertyDisclosureStatusLabel,
  isPropertyDisclosureDigitallyComplete,
  normalizePropertyDisclosure,
} from '../lib/propertyDisclosure'

const STEPS = ['Seller Information', 'Property Details', 'Property Disclosure', 'Review & Submit']

const SELLER_STATUS_LABELS = {
  [SELLER_ONBOARDING_STATUS.NOT_STARTED]: 'Not Started',
  [SELLER_ONBOARDING_STATUS.IN_PROGRESS]: 'In Progress',
  [SELLER_ONBOARDING_STATUS.SUBMITTED]: 'Submitted',
  [SELLER_ONBOARDING_STATUS.UNDER_REVIEW]: 'Under Review',
  [SELLER_ONBOARDING_STATUS.COMPLETED]: 'Completed',
}

const PROPERTY_FEATURES = [
  { key: 'solar', label: 'Solar', formKey: 'solarInstallation' },
  { key: 'inverter_battery', label: 'Inverter / Battery', formKey: 'inverterBattery' },
  { key: 'gas_geyser', label: 'Gas Geyser', formKey: 'gasGeyser' },
  { key: 'borehole', label: 'Borehole', formKey: 'boreholeInstallation' },
  { key: 'water_tank', label: 'Water Tank', formKey: 'waterTank' },
  { key: 'garden', label: 'Garden' },
  { key: 'security', label: 'Security (Estate / Alarm / Electric Fence)' },
  { key: 'fibre', label: 'Fibre' },
  { key: 'aircon', label: 'Aircon' },
  { key: 'fireplace', label: 'Fireplace' },
  { key: 'flatlet', label: 'Flatlet / Second Dwelling' },
  { key: 'staff_quarters', label: 'Staff Quarters' },
]

const WATER_BILLING_OPTIONS = [
  { value: '', label: 'Select water billing type' },
  { value: 'prepaid', label: 'Prepaid water' },
  { value: 'municipal', label: 'Council / municipal water' },
  { value: 'both', label: 'Prepaid and council / municipal' },
  { value: 'unknown', label: 'Unknown' },
]

const OWNERSHIP_TYPES = [
  { value: 'individual', label: 'Natural Person', description: 'I own the property in my own name.' },
  { value: 'married_cop', label: 'Married (COP)', description: 'Married in community of property.' },
  { value: 'company', label: 'Company', description: 'A company owns the property.' },
  { value: 'trust', label: 'Trust', description: 'A trust owns the property.' },
  { value: 'deceased_estate', label: 'Deceased estate', description: 'The property forms part of a deceased estate.' },
  { value: 'power_of_attorney', label: 'Power of attorney', description: 'Someone is acting under authority.' },
  { value: 'multiple_owners', label: 'Multiple owners', description: 'Two or more individuals own the property.' },
]

const LEGACY_OWNERSHIP_TYPE_LABELS = {
  married_anc: 'Married (ANC)',
  other: 'Other structure',
}

const OWNER_ENTITY_TYPES = [
  { value: 'natural_person', label: 'Natural Person', description: 'An individual, spouse, estate, POA, or multiple natural-person owners.' },
  { value: 'company', label: 'Company', description: 'A company owns the property and needs authority details.' },
  { value: 'trust', label: 'Trust', description: 'A trust owns the property and needs trustee authority.' },
  { value: 'foreign', label: 'Foreign', description: 'A foreign person, company, or trust owns the property.' },
]

const OWNER_ENTITY_ICONS = {
  natural_person: UserRound,
  company: Building2,
  trust: Landmark,
  foreign: ShieldCheck,
  other: Circle,
}

const OWNER_STRUCTURE_TYPES_BY_ENTITY = {
  natural_person: [
    { value: 'individual', label: 'Single owner', description: 'One natural person owns the property.' },
    { value: 'married_cop', label: 'Married (COP)', description: 'Married in community of property.' },
    { value: 'multiple_owners', label: 'Multiple owners', description: 'Two or more natural persons own the property.' },
    { value: 'deceased_estate', label: 'Deceased estate', description: 'The property forms part of a deceased estate.' },
    { value: 'power_of_attorney', label: 'Power of attorney', description: 'Someone is acting under authority.' },
  ],
  company: [
    { value: 'company', label: 'Company resolution', description: 'Capture company, director, and signing authority details.' },
  ],
  trust: [
    { value: 'trust', label: 'Trust resolution', description: 'Capture trust, trustee, and authority details.' },
  ],
  foreign: [
    { value: 'foreign_individual', label: 'Foreign natural person', description: 'A non-SA natural person owns the property.' },
    { value: 'foreign_company', label: 'Foreign company', description: 'A foreign company owns the property.' },
    { value: 'foreign_trust', label: 'Foreign trust', description: 'A foreign trust owns the property.' },
  ],
  other: [
    { value: 'other', label: 'Other structure', description: 'Capture a structure note for follow-up.' },
  ],
}

const MULTIPLE_OWNER_CAPTURE_MODES = [
  { value: 'capture_now', label: 'Capture all details now', description: 'Enter every owner, share, ID/passport, and consent in this form.' },
  { value: 'send_onboarding', label: 'Send owner onboarding', description: 'Capture contact details now and let the team send owner follow-up links.' },
]

const OWNERSHIP_OPTION_ICONS = {
  individual: UserRound,
  married_cop: BadgeCheck,
  married_anc: BadgeCheck,
  company: Building2,
  trust: Landmark,
  deceased_estate: FileCheck2,
  power_of_attorney: ClipboardCheck,
  multiple_owners: UserRound,
  foreign_individual: ShieldCheck,
  foreign_company: Building2,
  foreign_trust: Landmark,
  other: Circle,
}

const PROPERTY_CATEGORY_META = {
  residential: { icon: Home, description: 'Homes, apartments, townhouses' },
  commercial: { icon: Building2, description: 'Offices, medical suites, business parks' },
  industrial: { icon: Building2, description: 'Warehouses, factories, logistics' },
  retail: { icon: Building2, description: 'Retail stores, showrooms, shopping centres' },
  agricultural: { icon: Landmark, description: 'Farms, holdings, agricultural land' },
  mixed_use: { icon: Building2, description: 'Residential and non-residential mix' },
  vacant_land: { icon: Landmark, description: 'Vacant stands and land' },
}

const PROPERTY_STRUCTURE_META = {
  full_title: { icon: Home, description: 'Single title deed for the property.' },
  sectional_title: { icon: Building2, description: 'Unit in a sectional scheme.' },
  share_block: { icon: Building2, description: 'Share block ownership structure.' },
  freehold: { icon: Home, description: 'Freehold ownership.' },
  agricultural_holding: { icon: Landmark, description: 'Agricultural holding or farm-style title.' },
  other: { icon: Circle, description: 'Another legal structure.' },
}

const PROPERTY_STRUCTURES_BY_CATEGORY = {
  residential: ['full_title', 'sectional_title', 'share_block', 'freehold', 'other'],
  commercial: ['full_title', 'sectional_title', 'freehold', 'other'],
  industrial: ['full_title', 'freehold', 'sectional_title', 'other'],
  retail: ['full_title', 'sectional_title', 'freehold', 'other'],
  agricultural: ['agricultural_holding', 'freehold', 'full_title', 'other'],
  mixed_use: ['full_title', 'sectional_title', 'freehold', 'other'],
  vacant_land: ['full_title', 'freehold', 'agricultural_holding', 'other'],
}

const SELLER_PROPERTY_STRUCTURE_TYPES = PROPERTY_STRUCTURE_TYPES.filter((value) => value !== 'estate')

const OCCUPANCY_STATUSES = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'vacant', label: 'Vacant' },
  { value: 'owner_occupied', label: 'Owner occupied' },
  { value: 'tenant_occupied', label: 'Tenant occupied' },
  { value: 'partially_occupied', label: 'Partially occupied' },
]

const MARITAL_REGIMES = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'in_community', label: 'In community of property' },
  { value: 'out_of_community', label: 'Out of community of property' },
  { value: 'anc', label: 'ANC' },
  { value: 'foreign_marriage', label: 'Foreign marriage' },
  { value: 'unknown', label: 'Unknown' },
]

const MANDATE_TYPE_OPTIONS = [
  { value: 'sole', label: 'Sole Mandate', description: 'One agency is appointed to sell the property.' },
  { value: 'open', label: 'Open Mandate', description: 'More than one agency may market the property.' },
  { value: 'dual', label: 'Dual Mandate', description: 'Two parties share the selling mandate.' },
  { value: 'tri_mandate', label: 'Tri-Mandate', description: 'Three parties share the selling mandate.' },
]

const SPECIAL_MANDATE_CONDITION_OPTIONS = [
  { key: 'sellerApprovalRequired', label: 'Seller must approve every offer', description: 'No offer is accepted without your final approval.' },
  { key: 'replacementPropertyRequired', label: 'I need to secure another property first', description: 'The sale depends on finding a replacement home.' },
  { key: 'existingLease', label: 'There is a tenant or lease in place', description: 'The agent must consider the lease when marketing.' },
  { key: 'tenantRightsApply', label: 'Tenant rights must be considered', description: 'The agent must follow tenant notice/access rules.' },
  { key: 'occupationBeforeRegistration', label: 'Occupation before registration may be allowed', description: 'Early occupation can be discussed if needed.' },
  { key: 'occupationAfterRegistration', label: 'Occupation only after registration', description: 'The buyer may occupy only after transfer registers.' },
]

const SELLING_REASON_OPTIONS = [
  { value: 'upgrade', label: 'Upgrading' },
  { value: 'downsize', label: 'Downsizing' },
  { value: 'relocation', label: 'Relocation' },
  { value: 'divorce', label: 'Divorce' },
  { value: 'immigrating', label: 'Immigrating' },
  { value: 'deceased_estate', label: 'Deceased Estate' },
  { value: 'investment_exit', label: 'Investment Exit' },
  { value: 'financial_change', label: 'Financial Change' },
  { value: 'other', label: 'Other' },
]

const SELLING_TIMELINE_OPTIONS = [
  { value: 'urgent', label: 'Urgent', description: '0-1 month' },
  { value: '1_3_months', label: '1-3 months', description: 'Ready in the next quarter' },
  { value: '3_6_months', label: '3-6 months', description: 'Planning ahead' },
]

const PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[560px] lg:max-w-[1184px]'
const PAGE_STACK_CLASS = 'space-y-3 sm:space-y-6 lg:space-y-8'
const SECTION_CARD_CLASS =
  'rounded-[28px] border border-[#dfe8f1] bg-white px-4 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:rounded-[28px] sm:bg-white/90 sm:p-5 lg:rounded-[32px] lg:p-6 lg:shadow-[0_26px_60px_rgba(15,23,42,0.08)]'
const INNER_PANEL_CLASS =
  'rounded-none border-0 bg-transparent p-0 shadow-none sm:rounded-[22px] sm:border sm:border-[#dce6ef] sm:bg-white/95 sm:p-5 sm:shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:backdrop-blur-xl lg:rounded-[26px] lg:p-7'
const DETAIL_INPUT_CLASS =
  'w-full min-h-[52px] rounded-[16px] border border-[#d7e2ed] bg-white px-4 py-3 text-base font-medium text-[#142334] shadow-[0_8px_18px_rgba(15,23,42,0.035)] outline-none transition duration-150 ease-out placeholder:text-[#93a4b8] focus:border-[#138a3d]/45 focus:ring-2 focus:ring-[#138a3d]/10 sm:rounded-[18px]'
const SELLER_ONBOARDING_NOTIFICATION_TIMEOUT_MS = 8000
const CANONICAL_SELLER_FACTS_FLAG = 'VITE_CANONICAL_SELLER_FACTS_ENABLED'
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
    label: 'Property Disclosure',
    helper: 'Capture known material facts and seller declaration.',
    icon: ClipboardCheck,
  },
  {
    label: 'Review & Submit',
    helper: 'Check everything before your agent receives it.',
    icon: ClipboardCheck,
  },
]
const FINAL_STEP_INDEX = STEPS.length - 1
const DISCLOSURE_QUESTIONS_PER_MOBILE_PANE = 4
const MobileQuestionFlowContext = createContext(null)

function resolveSellerOnboardingSubmitError(error) {
  const message = String(error?.message || '').trim()
  if (!message) return 'Unable to submit onboarding right now. Please try again.'
  if (message.toLowerCase().includes('fetch failed')) {
    return 'We could not reach the onboarding service. Please check your connection and try again.'
  }
  return message
}

function areCanonicalSellerFactsEnabled() {
  const raw = String(import.meta.env?.[CANONICAL_SELLER_FACTS_FLAG] ?? '').trim().toLowerCase()
  return !['0', 'false', 'no', 'off', 'disabled'].includes(raw)
}

function getRuntimeTimestampMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

function resolveSellerSubmissionEmail(updated = {}, form = {}) {
  return String(
    form?.email ||
      form?.sellerEmail ||
      form?.contactEmail ||
      updated?.seller?.email ||
      updated?.sellerEmail ||
      updated?.seller_email ||
      updated?.sellerOnboarding?.formData?.email ||
      updated?.sellerOnboarding?.formData?.sellerEmail ||
      ''
  ).trim()
}

async function notifySellerOnboardingSubmitted(updated = {}, form = {}) {
  const assignedAgentId = String(
    updated?.assignedAgentId ||
      updated?.assigned_agent_id ||
      updated?.agentId ||
      updated?.agent_id ||
      ''
  ).trim()
  const assignedAgentEmail = String(
    updated?.assignedAgentEmail ||
      updated?.assigned_agent_email ||
      updated?.agentEmail ||
      updated?.agent_email ||
      updated?.assignedAgent?.email ||
      updated?.assigned_agent?.email ||
      ''
  ).trim()
  const hasValidAssignedAgentEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignedAgentEmail)

  const assignedAgentName = String(updated?.assignedAgentName || updated?.assignedAgent || 'Agent').trim()
  const sellerName = [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' ') || 'Seller'
  const propertyTitle = String(updated?.listingTitle || getPropertyDisplayAddress(updated || {}, form || {}) || 'property').trim()
  const leadId = String(updated?.sellerLeadId || updated?.seller_lead_id || updated?.leadId || updated?.lead_id || '').trim()
  const listingId = String(updated?.id || updated?.listingId || updated?.listing_id || '').trim()
  const transactionReference = String(updated?.transactionReference || updated?.transaction_reference || updated?.reference || '').trim()
  const sellerEmail = resolveSellerSubmissionEmail(updated, form)
  const hasValidSellerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sellerEmail)
  if (!hasValidAssignedAgentEmail && !assignedAgentId && !leadId && !listingId && !hasValidSellerEmail) return
  const actionLink = typeof window !== 'undefined' && leadId
    ? `${window.location.origin}/pipeline/leads/${encodeURIComponent(leadId)}/legal/mandate`
    : ''

  let timeoutId = null
  try {
    await Promise.race([
      (async () => {
        const notificationResult = await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_onboarding_submitted',
            to: hasValidAssignedAgentEmail ? assignedAgentEmail : '',
            agentName: assignedAgentName,
            sellerName,
            sellerEmail: hasValidSellerEmail ? sellerEmail : '',
            sellerPortalInvitePolicy: 'after_mandate_signed',
            deferSellerPortalLinkUntilMandateSigned: true,
            propertyTitle,
            transactionReference,
            organisationId: String(updated?.organisationId || updated?.organisation_id || '').trim(),
            organisationName: String(updated?.organisationName || updated?.agencyOrganisation || updated?.agencyName || '').trim(),
            leadId,
            listingId,
            assignedAgentId,
            actionLink,
          },
        })
        const notificationError = getEdgeFunctionInvokeError(notificationResult)
        if (notificationError) throw notificationError
        return notificationResult
      })(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Seller onboarding notification timed out.')), SELLER_ONBOARDING_NOTIFICATION_TIMEOUT_MS)
      }),
    ])
  } catch (notificationError) {
    console.error('[Seller Onboarding] submission notification failed', notificationError)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function choiceCardClass(isActive) {
  return `w-full rounded-[14px] border px-3 py-2.5 text-left transition duration-150 ease-out sm:rounded-[20px] sm:px-5 sm:py-5 ${
    isActive
      ? 'border-[#138a3d]/55 bg-[#f0fbf4] shadow-[0_12px_28px_rgba(19,138,61,0.10)]'
      : 'border-[#d8e2ec] bg-white hover:border-[#bccddd] hover:bg-[#fbfcfe]'
  }`
}

function getPropertyStructureOptionsByCategory(category) {
  const normalizedCategory = normalizePropertyCategory(category, { fallback: 'residential' })
  const values = PROPERTY_STRUCTURES_BY_CATEGORY[normalizedCategory] || SELLER_PROPERTY_STRUCTURE_TYPES
  return values
    .filter((value) => SELLER_PROPERTY_STRUCTURE_TYPES.includes(value))
    .map((value) => ({
      value,
      label: getPropertyStructureTypeLabel(value),
      icon: PROPERTY_STRUCTURE_META[value]?.icon || Circle,
      description: PROPERTY_STRUCTURE_META[value]?.description || 'Property legal structure.',
    }))
}

function chipChoiceClass(isActive) {
  return `inline-flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-xs font-semibold transition ${
    isActive ? 'border-[#138a3d]/55 bg-[#f0fbf4] text-[#126b34]' : 'border-[#d6e1ee] bg-white text-[#35546c]'
  }`
}

function disclosureAnswerClass(isActive) {
  return `inline-flex min-h-[44px] items-center justify-center rounded-[14px] border px-3 text-sm font-semibold transition ${
    isActive
      ? 'border-[#138a3d] bg-[#eaf8ef] text-[#126b34] shadow-[0_10px_22px_rgba(19,138,61,0.12)]'
      : 'border-[#d8e2ec] bg-white text-[#4f6378]'
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

function formatDateValue(value, fallback = 'Not selected') {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const date = new Date(`${text}T00:00:00`)
  if (Number.isNaN(date.getTime())) return text
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getMandateTypeLabel(value, fallback = 'Not selected') {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  return MANDATE_TYPE_OPTIONS.find((item) => item.value === normalized)?.label || formatValue(normalized, fallback)
}

function getSpecialMandateConditionLabels(conditions = {}) {
  const record = conditions && typeof conditions === 'object' && !Array.isArray(conditions) ? conditions : {}
  return SPECIAL_MANDATE_CONDITION_OPTIONS
    .filter((option) => Boolean(record[option.key]))
    .map((option) => option.label)
}

function getTransferAttorneyDecisionLabel(decision = {}) {
  const normalized = normalizeSellerTransferAttorneyDecision(decision)
  if (normalized.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation) {
    return 'Recommended attorney accepted'
  }
  if (normalized.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn) {
    return 'Another attorney nominated'
  }
  if (normalized.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer) {
    return 'Discuss with agent first'
  }
  return 'Not selected'
}

function resolveAgencyBrand(listing = {}) {
  const onboardingBranding = listing?.sellerOnboarding?.formData?.portalBranding || {}
  const listingBranding = {
    agencyOrganisation: listing?.agencyOrganisation,
    organisationName: listing?.organisationName,
    agencyName: listing?.agencyName,
    assignedAgencyName: listing?.assignedAgencyName,
    agencyLogoUrl: listing?.agencyLogoUrl,
    agencyLogoDarkUrl: listing?.agencyLogoDarkUrl,
    agencyLogoLightUrl: listing?.agencyLogoLightUrl,
    organisationLogoUrl: listing?.organisationLogoUrl,
    organisationLogoDarkUrl: listing?.organisationLogoDarkUrl,
    organisationLogoLightUrl: listing?.organisationLogoLightUrl,
  }
  const brandingSources = [
    listing?.branding,
    onboardingBranding,
    listingBranding,
    listing?.agency,
    listing?.organisation,
  ]
  const branding = resolveOnboardingBranding(...brandingSources)
  const hasAgencyName = hasResolvedOnboardingBrandingValue(
    'organisationName',
    ...brandingSources,
  )
  const brandName = branding.organisationName || 'Agency'
  const logoDarkUrl = branding.logoDarkUrl
  const logoLightUrl = branding.logoLightUrl
  const logoUrl = logoDarkUrl || branding.logoIconUrl || logoLightUrl
  return {
    name: brandName,
    logoUrl,
    logoDarkUrl,
    logoLightUrl,
    initials: getOnboardingBrandInitials(brandName),
    isFallback: !hasAgencyName,
    primaryColour: branding.primaryColour,
    secondaryColour: branding.secondaryColour,
    accentColour: branding.accentColour,
  }
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

function resolveSellerWelcomeImageUrl(listing = {}) {
  const directCandidates = [
    listing?.coverImageUrl,
    listing?.cover_image_url,
    listing?.coverImage,
    listing?.cover_image,
    listing?.heroImageUrl,
    listing?.hero_image_url,
    listing?.imageUrl,
    listing?.image_url,
    listing?.mainImageUrl,
    listing?.main_image_url,
    listing?.propertyImageUrl,
    listing?.property_image_url,
    listing?.thumbnailUrl,
    listing?.thumbnail_url,
  ]
  const collectionCandidates = [
    listing?.images,
    listing?.photos,
    listing?.media,
    listing?.listingImages,
    listing?.listing_images,
    listing?.propertyImages,
    listing?.property_images,
  ]

  const direct = directCandidates.find((candidate) => String(candidate || '').trim())
  if (direct) return String(direct).trim()

  for (const collection of collectionCandidates) {
    if (!Array.isArray(collection)) continue
    const item = collection.find(Boolean)
    const url = typeof item === 'string'
      ? item
      : item?.url || item?.src || item?.imageUrl || item?.image_url || item?.publicUrl || item?.public_url
    if (String(url || '').trim()) return String(url).trim()
  }

  return ''
}

function getSellerDisplayName(listing = {}, form = {}) {
  return [form?.sellerFirstName, form?.sellerSurname].filter(Boolean).join(' ').trim() ||
    String(listing?.seller?.name || listing?.sellerName || 'Seller').trim()
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function scrollSellerOnboardingToTop({ focusAlert = false } = {}) {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (focusAlert && typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.querySelector('[data-seller-onboarding-alert]')?.focus({ preventScroll: true })
      })
    }
  })
}

function buildSellerDraftSignature(form = {}, currentStep = 0) {
  try {
    return JSON.stringify({ currentStep, form })
  } catch {
    return ''
  }
}

function resolveDraftSavedAt(listing = {}) {
  return String(
    listing?.sellerOnboarding?.updatedAt ||
      listing?.sellerOnboarding?.updated_at ||
      listing?.updatedAt ||
      listing?.updated_at ||
      '',
  ).trim()
}

function formatDraftSavedAt(value = '') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getDraftSaveStatusMeta(status = 'idle', savedAt = '', fallback = '') {
  if (status === 'saving') {
    return {
      label: 'Saving draft...',
      dotClass: 'bg-[#2f8f86]',
      className: 'border-[#d5eee9] bg-[#f1fbf8] text-[#1d6d66]',
    }
  }
  if (status === 'pending') {
    return {
      label: 'Unsaved changes',
      dotClass: 'bg-[#b45309]',
      className: 'border-[#f2dcc0] bg-[#fff9ef] text-[#8a5a18]',
    }
  }
  if (status === 'error') {
    return {
      label: 'Draft not saved',
      dotClass: 'bg-[#b42318]',
      className: 'border-[#f6d4d4] bg-[#fff5f5] text-[#b42318]',
    }
  }
  if (status === 'offline') {
    return {
      label: 'Offline - draft pending',
      dotClass: 'bg-[#b45309]',
      className: 'border-[#f2dcc0] bg-[#fff9ef] text-[#8a5a18]',
    }
  }
  if (status === 'saved') {
    const timeLabel = formatDraftSavedAt(savedAt)
    return {
      label: timeLabel ? `Saved ${timeLabel}` : 'Draft saved',
      dotClass: 'bg-[#1f7d44]',
      className: 'border-[#d8ecdf] bg-[#eefbf3] text-[#1f7d44]',
    }
  }
  return {
    label: fallback,
    dotClass: 'bg-[#8aa0b5]',
    className: 'border-[#dbe5ef] bg-[#f7fbff] text-[#5f738a]',
  }
}

function DraftSaveStatus({ status = 'idle', savedAt = '', fallback = '' }) {
  const meta = getDraftSaveStatusMeta(status, savedAt, fallback)
  if (!meta.label) return null

  return (
    <span
      aria-live="polite"
      className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta.className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`} />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}

function MobileQuestionFlow({ activeIndex = 0, children }) {
  const value = useMemo(() => ({ activeIndex }), [activeIndex])

  return (
    <MobileQuestionFlowContext.Provider value={value}>
      {children}
    </MobileQuestionFlowContext.Provider>
  )
}

function useMobileQuestionPane(enabled = true, paneIndex = null) {
  const flowContext = useContext(MobileQuestionFlowContext)
  if (!enabled || !flowContext || paneIndex === null || paneIndex === undefined) {
    return { paneIndex: -1, mobilePaneClassName: '' }
  }
  return {
    paneIndex,
    mobilePaneClassName: paneIndex === flowContext.activeIndex ? '' : 'hidden sm:block',
  }
}

function MobileQuestionPane({ children, className = '', paneIndex = null }) {
  const { mobilePaneClassName } = useMobileQuestionPane(true, paneIndex)
  return (
    <div data-mobile-question-pane={paneIndex} className={`${mobilePaneClassName} ${className}`.trim()}>
      {children}
    </div>
  )
}

function getDisclosureQuestionPaneCount() {
  return Math.ceil(PROPERTY_DISCLOSURE_QUESTIONS.length / DISCLOSURE_QUESTIONS_PER_MOBILE_PANE)
}

function getDisclosureQuestionGroups() {
  const groups = []
  for (let index = 0; index < PROPERTY_DISCLOSURE_QUESTIONS.length; index += DISCLOSURE_QUESTIONS_PER_MOBILE_PANE) {
    groups.push(PROPERTY_DISCLOSURE_QUESTIONS.slice(index, index + DISCLOSURE_QUESTIONS_PER_MOBILE_PANE))
  }
  return groups
}

function getPropertyDisclosureMissingItems(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  const missing = []
  const unanswered = PROPERTY_DISCLOSURE_QUESTIONS.filter((question) => !normalized.responses?.[question.key]?.answer)
  if (unanswered.length) missing.push(`answer all Annexure A questions (${unanswered.length} remaining)`)
  if (!normalized.declarationAccepted) missing.push('accept the seller declaration')
  if (!normalized.signature) missing.push('draw a signature')
  if (!normalized.signedAt) missing.push('select a signature date')
  return missing
}

function getPropertyAddressDetails(listing = {}, form = {}) {
  return normalizePropertyAddress(
    {
      propertyAddressDetails: form?.propertyAddressDetails || {},
      propertyAddress: form?.propertyAddress || '',
      propertyAddressSearch: form?.propertyAddressSearch || '',
      propertyAddressLine1: form?.propertyAddressLine1 || '',
      propertyAddressLine2: form?.propertyAddressLine2 || '',
      addressQuery: form?.addressQuery || '',
      suburb: form?.suburb || '',
      city: form?.city || '',
      province: form?.province || '',
      postalCode: form?.postalCode || '',
      municipality: form?.municipality || '',
      country: form?.country || '',
    },
    listing,
    {
      line1: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress || '',
      line2: listing?.addressLine2 || listing?.address_line_2 || '',
      suburb: listing?.suburb || '',
      city: listing?.city || '',
      province: listing?.province || '',
      postalCode: listing?.postalCode || listing?.postal_code || '',
      municipality: listing?.municipality || listing?.city || '',
      country: listing?.country || 'South Africa',
      source: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress ? 'listing' : 'manual',
    },
  )
}

function getPropertyDisplayAddress(listing = {}, form = {}) {
  const address = getPropertyAddressDetails(listing, form)
  const formatted = formatPropertyAddress(address)
  return formatted || String(
    listing?.listingTitle ||
    listing?.title ||
    'Property details pending',
  ).trim()
}

function parsePropertyAddressQuery(query = '', fallback = {}) {
  const text = String(query || '').trim()
  if (!text) return null

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
  const postalCode = parts.find((part) => /^\d{4}$/.test(part)) || String(fallback.postalCode || '').trim()
  const line1 = parts[0] || String(fallback.line1 || '').trim()
  const line2 = parts[1] && parts[1] !== postalCode ? parts[1] : String(fallback.line2 || '').trim()
  const suburb = parts[2] || String(fallback.suburb || '').trim()
  const city = parts[3] || String(fallback.city || '').trim()
  const province = parts[4] || String(fallback.province || '').trim()
  const municipality = parts[5] || city || suburb || String(fallback.municipality || '').trim()

  return {
    query: text,
    line1,
    line2,
    suburb,
    city,
    province,
    postalCode,
    municipality,
    country: String(fallback.country || 'South Africa').trim() || 'South Africa',
    placeId: String(fallback.placeId || '').trim(),
    source: 'manual',
    formatted: formatPropertyAddress({ line1, line2, suburb, city, province, postalCode }),
  }
}

function buildPropertyAddressAutocompleteValue(address = {}) {
  const formattedAddress = formatPropertyAddress(address)
  if (!formattedAddress) return null
  return {
    formattedAddress,
    streetAddress: String(address.line1 || '').trim(),
    suburb: String(address.suburb || '').trim(),
    city: String(address.city || '').trim(),
    province: String(address.province || '').trim(),
    country: String(address.country || 'South Africa').trim() || 'South Africa',
    postalCode: String(address.postalCode || '').trim(),
    placeId: String(address.placeId || '').trim(),
    googlePlaceId: String(address.placeId || '').trim(),
  }
}

function mapGoogleAddressToPropertyAddress(value = null, fallback = {}) {
  if (!value) return createBlankPropertyAddress()
  const line1 = String(value.streetAddress || value.formattedAddress || '').trim()
  const nextAddress = {
    ...createBlankPropertyAddress(),
    ...fallback,
    query: String(value.formattedAddress || line1 || '').trim(),
    line1,
    line2: String(value.line2 || value.addressLine2 || value.subpremise || fallback.line2 || '').trim(),
    suburb: String(value.suburb || '').trim(),
    city: String(value.city || '').trim(),
    province: String(value.province || '').trim(),
    postalCode: String(value.postalCode || '').trim(),
    municipality: String(value.city || fallback.municipality || '').trim(),
    country: String(value.country || 'South Africa').trim() || 'South Africa',
    placeId: String(value.placeId || value.googlePlaceId || '').trim(),
    source: 'google_places',
  }
  nextAddress.formatted = formatPropertyAddress(nextAddress) || String(value.formattedAddress || '').trim()
  return nextAddress
}

function buildBondComplianceSummary(form = {}) {
  if (!form.existingBond) return null

  const items = [
    { label: 'Bond bank', value: form.bondBank || 'Not provided' },
    { label: 'Bond account number', value: form.bondAccountReference || 'Not provided' },
    { label: 'Estimated settlement', value: form.estimatedSettlementAmount ? formatCurrency(form.estimatedSettlementAmount) : 'Not provided' },
  ]
  const missing = []
  if (!form.bondBank) missing.push('Bond bank')
  if (!form.bondAccountReference) missing.push('Bond account number')
  if (!form.estimatedSettlementAmount) missing.push('Settlement estimate')

  return { items, missing }
}

function buildTenantComplianceSummary(form = {}) {
  if (String(form.occupancyStatus) !== 'tenant_occupied' && !form.leaseExists) return null

  const items = [
    { label: 'Lease expiry', value: form.leaseExpiryDate || 'Not provided' },
    { label: 'Tenant name', value: form.tenantName || 'Not provided' },
    { label: 'Tenant contact', value: form.tenantContactDetails || 'Not provided' },
  ]
  const missing = []
  if (!form.leaseExpiryDate) missing.push('Lease expiry')
  if (!form.tenantName) missing.push('Tenant name')
  if (!form.tenantContactDetails) missing.push('Tenant contact details')

  return { items, missing }
}

function splitName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: '' }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.slice(-1).join(' ') }
}

function getCanonicalSellerFacts(listing = {}) {
  return listing?.sellerOnboarding?.canonicalFacts && typeof listing.sellerOnboarding.canonicalFacts === 'object'
    ? listing.sellerOnboarding.canonicalFacts
    : listing?.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object'
      ? listing.sellerCanonicalFacts
      : listing?.sellerOnboarding?.formData?.canonicalSellerFacts && typeof listing.sellerOnboarding.formData.canonicalSellerFacts === 'object'
        ? listing.sellerOnboarding.formData.canonicalSellerFacts
        : {}
}

function normalizeOwnershipType(existing = {}, canonicalFacts = {}, flow = null) {
  const explicit = String(existing.ownershipType || existing.sellerLegalType || existing.legalType || existing.sellerType || '').toLowerCase()
  const explicitOwnerEntityType = String(existing.ownerEntityType || existing.owner_entity_type || canonicalFacts?.seller?.owner_entity_type || '').toLowerCase()
  const explicitOwnerStructureType = String(existing.ownerStructureType || existing.owner_structure_type || canonicalFacts?.seller?.owner_structure_type || '').toLowerCase()
  if (explicitOwnerEntityType || explicitOwnerStructureType) {
    const ownerEntityType = OWNER_ENTITY_TYPES.some((item) => item.value === explicitOwnerEntityType) ? explicitOwnerEntityType : deriveOwnerEntityType(explicit, existing, canonicalFacts)
    const ownerStructureType = normalizeOwnerStructureType(explicitOwnerStructureType, ownerEntityType)
    return deriveOwnershipTypeFromOwnerModel(ownerEntityType, ownerStructureType)
  }
  const flowBranch = String(flow?.seller_branch || canonicalFacts?.flow?.seller_branch || '').toLowerCase()

  if (explicit === 'individual' || explicit === 'other') {
    return explicit
  }

  if (explicit && explicit !== 'legal_entity') {
    if (explicit === 'married') {
      return String(existing.marriageRegime || existing.maritalRegime || canonicalFacts?.seller?.marital_regime || '').toLowerCase().includes('cop') ? 'married_cop' : 'married_anc'
    }
    return explicit
  }

  if (flowBranch === 'married') {
    const regime = String(existing.maritalRegime || existing.marriageRegime || canonicalFacts?.seller?.marital_regime || '').toLowerCase()
    return regime.includes('in_community') || regime.includes('cop') || regime === 'community_of_property' ? 'married_cop' : 'married_anc'
  }
  if (flowBranch === 'company') return 'company'
  if (flowBranch === 'trust') return 'trust'
  if (flowBranch === 'deceased_estate') return 'deceased_estate'
  if (flowBranch === 'power_of_attorney') return 'power_of_attorney'
  if (flowBranch === 'multiple_owners') return 'multiple_owners'

  if (String(existing.maritalStatus || '').toLowerCase() === 'married') {
    const regime = String(existing.marriageRegime || existing.maritalRegime || canonicalFacts?.seller?.marital_regime || '').toLowerCase()
    return regime.includes('in_community') || regime.includes('cop') || regime === 'community_of_property' ? 'married_cop' : 'married_anc'
  }

  return explicit || 'individual'
}

function deriveOwnerEntityType(ownershipType = '', existing = {}, canonicalFacts = {}) {
  const explicit = String(existing.ownerEntityType || existing.owner_entity_type || canonicalFacts?.seller?.owner_entity_type || '').trim().toLowerCase()
  if (OWNER_ENTITY_TYPES.some((item) => item.value === explicit)) return explicit

  const structure = String(existing.ownerStructureType || existing.owner_structure_type || canonicalFacts?.seller?.owner_structure_type || '').trim().toLowerCase()
  if (structure.startsWith('foreign_') || existing.foreignOwner || canonicalFacts?.seller?.foreign_owner) return 'foreign'

  const normalized = String(ownershipType || '').trim().toLowerCase()
  if (normalized === 'company') return 'company'
  if (normalized === 'trust') return 'trust'
  if (normalized === 'other') return 'other'
  return 'natural_person'
}

function normalizeOwnerStructureType(value = '', ownerEntityType = 'natural_person') {
  const normalized = String(value || '').trim().toLowerCase()
  const options = OWNER_STRUCTURE_TYPES_BY_ENTITY[ownerEntityType] || OWNER_STRUCTURE_TYPES_BY_ENTITY.natural_person
  if (options.some((item) => item.value === normalized)) return normalized
  if (['married_anc', 'other'].includes(normalized)) return normalized
  if (ownerEntityType === 'company') return 'company'
  if (ownerEntityType === 'trust') return 'trust'
  if (ownerEntityType === 'foreign') return 'foreign_individual'
  if (ownerEntityType === 'other') return 'other'
  return 'individual'
}

function deriveOwnerStructureType(ownershipType = '', ownerEntityType = 'natural_person', existing = {}, canonicalFacts = {}) {
  const explicit = String(existing.ownerStructureType || existing.owner_structure_type || canonicalFacts?.seller?.owner_structure_type || '').trim().toLowerCase()
  if (explicit) return normalizeOwnerStructureType(explicit, ownerEntityType)

  const normalized = String(ownershipType || '').trim().toLowerCase()
  if (ownerEntityType === 'company') return 'company'
  if (ownerEntityType === 'trust') return 'trust'
  if (ownerEntityType === 'foreign') {
    if (normalized === 'company') return 'foreign_company'
    if (normalized === 'trust') return 'foreign_trust'
    return 'foreign_individual'
  }
  if (ownerEntityType === 'other') return 'other'
  return normalizeOwnerStructureType(normalized, ownerEntityType)
}

function deriveOwnershipTypeFromOwnerModel(ownerEntityType = 'natural_person', ownerStructureType = 'individual') {
  const normalizedEntity = String(ownerEntityType || '').trim().toLowerCase()
  const normalizedStructure = String(ownerStructureType || '').trim().toLowerCase()
  if (normalizedEntity === 'company' || normalizedStructure === 'company' || normalizedStructure === 'foreign_company') return 'company'
  if (normalizedEntity === 'trust' || normalizedStructure === 'trust' || normalizedStructure === 'foreign_trust') return 'trust'
  if (normalizedStructure === 'foreign_individual') return 'individual'
  if (normalizedEntity === 'other' || normalizedStructure === 'other') return 'other'
  return normalizeOwnerStructureType(normalizedStructure, 'natural_person')
}

function isForeignOwnerModel(ownerEntityType = '', ownerStructureType = '') {
  return String(ownerEntityType || '').trim().toLowerCase() === 'foreign' || String(ownerStructureType || '').trim().toLowerCase().startsWith('foreign_')
}

function getOwnerEntityLabel(value = '') {
  return OWNER_ENTITY_TYPES.find((item) => item.value === value)?.label || 'Natural Person'
}

function getOwnerStructureLabel(value = '', ownerEntityType = 'natural_person') {
  const options = OWNER_STRUCTURE_TYPES_BY_ENTITY[ownerEntityType] || []
  return options.find((item) => item.value === value)?.label || OWNERSHIP_TYPES.find((item) => item.value === value)?.label || LEGACY_OWNERSHIP_TYPE_LABELS[value] || 'Single owner'
}

function getOwnershipSummaryLabel(form = {}) {
  const entityLabel = getOwnerEntityLabel(form.ownerEntityType)
  const structureLabel = getOwnerStructureLabel(form.ownerStructureType || form.ownershipType, form.ownerEntityType)
  return entityLabel === structureLabel ? entityLabel : `${entityLabel} - ${structureLabel}`
}

function getOwnershipBranch(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (['married_cop', 'married_anc', 'married'].includes(normalized)) return 'married'
  return normalized || 'individual'
}

function resolveSellerResidentialAddress(form = {}) {
  return String(
    form.residentialAddress ||
      form.sellerResidentialAddress ||
      form.physicalAddress ||
      form.domiciliumAddress ||
      form.domicilium_address ||
      form.address ||
      '',
  ).trim()
}

function normalizePersonRecordForForm(entry = {}, index = 0, roleTitle = 'Person') {
  const fullName = String(entry.fullName || entry.full_name || entry.name || entry.contact_name || '').trim()
  const split = splitName(fullName)
  const normalizedRole = String(roleTitle || 'Person').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id: String(entry.id || `${normalizedRole || 'person'}-${index + 1}`),
    name: String(entry.name || entry.first_name || split.firstName || '').trim(),
    surname: String(entry.surname || entry.last_name || split.surname || '').trim(),
    email: String(entry.email || '').trim(),
    phone: String(entry.phone || '').trim(),
    residentialAddress: String(entry.residentialAddress || entry.residential_address || entry.address || '').trim(),
    idNumber: String(entry.idNumber || entry.id_number || entry.identityNumber || entry.identity_number || '').trim(),
    ownershipShare: String(entry.ownershipShare || entry.ownership_share || '').trim(),
    consentToSell: Boolean(entry.consentToSell ?? entry.consent_to_sell),
    signingAuthority: Boolean(entry.signingAuthority ?? entry.signing_authority),
    roleTitle: String(entry.roleTitle || entry.role_title || roleTitle || '').trim(),
  }
}

function normalizePersonCollectionForForm(entries = [], fallback = null, roleTitle = 'Person') {
  const source = Array.isArray(entries) ? entries : []
  const mapped = source
    .map((entry, index) => normalizePersonRecordForForm(entry, index, roleTitle))
    .filter((entry) => Boolean(entry.name || entry.surname || entry.email || entry.phone || entry.idNumber))

  if (mapped.length) return mapped

  if (fallback && typeof fallback === 'object') {
    const record = normalizePersonRecordForForm(fallback, 0, roleTitle)
    if (record.name || record.surname || record.email || record.phone || record.idNumber) {
      return [record]
    }
  }

  return []
}

function createBlankPersonRecord(roleTitle = 'Person', index = 0) {
  const normalizedRole = String(roleTitle || 'person').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id: `${normalizedRole || 'person'}-${Date.now()}-${index + 1}`,
    name: '',
    surname: '',
    email: '',
    phone: '',
    residentialAddress: '',
    idNumber: '',
    ownershipShare: '',
    consentToSell: false,
    signingAuthority: false,
    roleTitle,
  }
}

function getOwnershipFieldLabels(value = '') {
  const branch = getOwnershipBranch(value)
  const isEntityBranch = ['company', 'trust', 'deceased_estate', 'power_of_attorney', 'multiple_owners'].includes(branch)
  return {
    firstName: isEntityBranch ? 'Primary contact first name' : 'First name',
    surname: isEntityBranch ? 'Primary contact surname' : 'Surname',
    idNumber:
      branch === 'company'
        ? 'Company registration number'
        : branch === 'trust'
          ? 'Trust registration number'
          : branch === 'deceased_estate'
            ? 'Estate reference'
            : branch === 'power_of_attorney'
              ? 'Authority reference'
              : branch === 'multiple_owners'
                ? 'Primary owner ID number'
                : 'ID number',
    address:
      branch === 'company'
        ? 'Registered address'
        : branch === 'trust'
          ? 'Trust address'
          : branch === 'deceased_estate'
            ? 'Estate contact address'
            : branch === 'power_of_attorney'
              ? 'Representative address'
              : branch === 'multiple_owners'
                ? 'Primary owner address'
                : 'Residential address',
  }
}

function getFlowContract(existing = {}, listing = {}, canonicalFacts = {}) {
  return resolveSellerOnboardingFlow(existing, listing, canonicalFacts)
}

function normalizeFormData(listing) {
  const seller = listing?.seller || {}
  const existing = listing?.sellerOnboarding?.formData || {}
  const canonicalFacts = getCanonicalSellerFacts(listing)
  const flow = getFlowContract(existing, listing, canonicalFacts)
  const split = splitName(existing.fullName || seller.name || '')
  const sellerBranch = String(flow?.seller_branch || '').toLowerCase()
  const companyDirectors = normalizePersonCollectionForForm(
    existing.companyDirectors || canonicalFacts?.seller?.company?.directors || existing.directors || [],
    {
      id: 'director-1',
      name: existing.companyDirectorName || canonicalFacts?.seller?.company?.director_name || canonicalFacts?.seller?.company?.authorised_signatory?.name || '',
      email: existing.companyDirectorEmail || canonicalFacts?.seller?.company?.director_email || canonicalFacts?.seller?.company?.authorised_signatory?.email || '',
      phone: existing.companyDirectorPhone || canonicalFacts?.seller?.company?.director_phone || canonicalFacts?.seller?.company?.authorised_signatory?.phone || '',
      residentialAddress: existing.companyDirectorAddress || canonicalFacts?.seller?.company?.authorised_signatory?.residential_address || existing.companyRegisteredAddress || existing.residentialAddress || '',
      signingAuthority: Boolean(canonicalFacts?.seller?.company?.authorised_signatory?.name),
      roleTitle: 'Director',
    },
    'Director',
  )
  const trustTrustees = normalizePersonCollectionForForm(
    existing.trustees || canonicalFacts?.seller?.trust?.trustees || [],
    {
      id: 'trustee-1',
      name: existing.trusteeName || canonicalFacts?.seller?.trust?.trustee_name || canonicalFacts?.seller?.trust?.authorised_trustee?.name || '',
      email: existing.trusteeEmail || canonicalFacts?.seller?.trust?.trustee_email || canonicalFacts?.seller?.trust?.authorised_trustee?.email || '',
      phone: existing.trusteePhone || canonicalFacts?.seller?.trust?.trustee_phone || canonicalFacts?.seller?.trust?.authorised_trustee?.phone || '',
      residentialAddress: existing.trusteeAddress || canonicalFacts?.seller?.trust?.authorised_trustee?.residential_address || existing.trustRegisteredAddress || existing.residentialAddress || '',
      signingAuthority: Boolean(canonicalFacts?.seller?.trust?.authorised_trustee?.name),
      roleTitle: 'Trustee',
    },
    'Trustee',
  )
  const estateExecutors = normalizePersonCollectionForForm(
    existing.executors || canonicalFacts?.seller?.deceased_estate?.executors || [],
    {
      id: 'executor-1',
      name: existing.executorName || canonicalFacts?.seller?.deceased_estate?.executor_name || '',
      email: existing.executorEmail || canonicalFacts?.seller?.deceased_estate?.executor_email || '',
      phone: existing.executorPhone || canonicalFacts?.seller?.deceased_estate?.executor_phone || '',
      residentialAddress: existing.executorAddress || existing.residentialAddress || '',
      signingAuthority: true,
      roleTitle: 'Executor',
    },
    'Executor',
  )
  const poaRepresentatives = normalizePersonCollectionForForm(
    existing.powerOfAttorneyRepresentatives || canonicalFacts?.seller?.power_of_attorney?.representatives || [],
    {
      id: 'poa-1',
      name: existing.powerOfAttorneyName || canonicalFacts?.seller?.power_of_attorney?.representative_name || '',
      email: existing.powerOfAttorneyEmail || canonicalFacts?.seller?.power_of_attorney?.representative_email || '',
      phone: existing.powerOfAttorneyPhone || canonicalFacts?.seller?.power_of_attorney?.representative_phone || '',
      residentialAddress: existing.powerOfAttorneyAddress || existing.residentialAddress || '',
      signingAuthority: true,
      roleTitle: 'Representative',
    },
    'Representative',
  )
  const ownerRecords = normalizePersonCollectionForForm(
    existing.multipleOwners || canonicalFacts?.seller?.owners || [],
    {
      id: 'owner-1',
      name: '',
      surname: '',
      idNumber: '',
      email: '',
      phone: '',
      ownershipShare: '',
      consentToSell: false,
      roleTitle: 'Owner',
    },
    'Owner',
  )
  const multipleOwnerRecords =
    sellerBranch === 'multiple_owners' && ownerRecords.length < 2
      ? [...ownerRecords, createBlankPersonRecord('Owner', ownerRecords.length)]
      : ownerRecords
  const resolveIdNumber = () => {
    if (sellerBranch === 'company') return canonicalFacts?.seller?.company?.registration_number || existing.idNumber || ''
    if (sellerBranch === 'trust') return canonicalFacts?.seller?.trust?.registration_number || existing.idNumber || ''
    if (sellerBranch === 'deceased_estate') return canonicalFacts?.seller?.deceased_estate?.estate_reference || existing.idNumber || ''
    if (sellerBranch === 'power_of_attorney') return canonicalFacts?.seller?.power_of_attorney?.reference || existing.idNumber || ''
    if (sellerBranch === 'multiple_owners') return existing.idNumber || ''
    return existing.idNumber || existing.foreignPassportNumber || existing.passportNumber || canonicalFacts?.seller?.id_number || canonicalFacts?.seller?.foreign?.passport_number || ''
  }
  const resolveAddress = () => {
    if (sellerBranch === 'company') return canonicalFacts?.seller?.company?.registered_address || canonicalFacts?.seller?.residential_address || existing.residentialAddress || ''
    if (sellerBranch === 'trust') return canonicalFacts?.seller?.trust?.registered_address || canonicalFacts?.seller?.residential_address || existing.residentialAddress || ''
    return canonicalFacts?.seller?.residential_address || resolveSellerResidentialAddress(existing)
  }
  const ownershipFieldLabels = getOwnershipFieldLabels(flow?.seller_branch || existing.ownershipType || '')
  const resolvedPropertyCategory = normalizePropertyCategory(
    existing.propertyCategory || canonicalFacts?.property?.property_category || listing?.propertyCategory || listing?.property_category,
    { fallback: 'residential' },
  )
  const propertyTypeOptions = getPropertyTypeOptionsByCategory(resolvedPropertyCategory)
  const candidatePropertyType = existing.propertyType || listing?.propertyType || canonicalFacts?.property?.property_type || ''
  const resolvedPropertyType = propertyTypeOptions.some((item) => item.value === candidatePropertyType)
    ? candidatePropertyType
    : propertyTypeOptions[0]?.value || candidatePropertyType || 'house'
  const propertyStructureOptions = getPropertyStructureOptionsByCategory(resolvedPropertyCategory)
  const rawPropertyStructureType = normalizePropertyStructureType(
    existing.propertyStructureType ||
      canonicalFacts?.property?.property_structure_type ||
      listing?.propertyStructureType ||
      listing?.property_structure_type ||
      existing.propertyType ||
      '',
    { fallback: '' },
  )
  const hadLegacyEstateStructure = rawPropertyStructureType === 'estate'
  const candidatePropertyStructureType = hadLegacyEstateStructure ? 'full_title' : rawPropertyStructureType
  const resolvedPropertyStructureType = propertyStructureOptions.some((item) => item.value === candidatePropertyStructureType)
    ? candidatePropertyStructureType
    : propertyStructureOptions[0]?.value || 'other'
  const isSectionalStructure = ['sectional_title', 'share_block'].includes(resolvedPropertyStructureType)
  const isShareBlockStructure = resolvedPropertyStructureType === 'share_block'
  const legacyFeatureKeys = Array.isArray(existing.features)
    ? existing.features.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const featureKeys = new Set(legacyFeatureKeys.filter((item) => item !== 'water'))
  if (legacyFeatureKeys.includes('water')) {
    featureKeys.add('borehole')
    featureKeys.add('water_tank')
  }
  if (existing.solarInstallation || canonicalFacts?.compliance?.solar_installation) featureKeys.add('solar')
  if (existing.gasGeyser || existing.gas_geyser || existing.gasInstallation || canonicalFacts?.compliance?.gas_geyser || canonicalFacts?.compliance?.gas_installation) featureKeys.add('gas_geyser')
  if (existing.inverterBattery || existing.inverter_battery || canonicalFacts?.compliance?.inverter_battery) featureKeys.add('inverter_battery')
  if (existing.boreholeInstallation || existing.borehole || canonicalFacts?.compliance?.borehole_installation || canonicalFacts?.compliance?.borehole) featureKeys.add('borehole')
  if (existing.waterTank || existing.water_tank || canonicalFacts?.compliance?.water_tank) featureKeys.add('water_tank')
  const normalizedFeatures = Array.from(featureKeys)
  const propertyAddressDetails = normalizePropertyAddress(
    {
      propertyAddressDetails: existing.propertyAddressDetails || canonicalFacts?.property?.address_details || {},
      propertyAddress: existing.propertyAddress || canonicalFacts?.property?.address || '',
      propertyAddressSearch: existing.propertyAddressSearch || canonicalFacts?.property?.address_details?.query || '',
      propertyAddressLine1: existing.propertyAddressLine1 || canonicalFacts?.property?.address_line_1 || '',
      propertyAddressLine2: existing.propertyAddressLine2 || canonicalFacts?.property?.address_line_2 || '',
      suburb: existing.suburb || canonicalFacts?.property?.suburb || '',
      city: existing.city || canonicalFacts?.property?.city || '',
      province: existing.province || canonicalFacts?.property?.province || '',
      postalCode: existing.postalCode || canonicalFacts?.property?.postal_code || '',
      municipality: existing.municipality || canonicalFacts?.property?.municipality || '',
      country: existing.country || canonicalFacts?.property?.country || '',
    },
    listing,
    {
      line1: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress || '',
      line2: listing?.addressLine2 || listing?.address_line_2 || '',
      suburb: listing?.suburb || '',
      city: listing?.city || '',
      province: listing?.province || '',
      postalCode: listing?.postalCode || listing?.postal_code || '',
      municipality: listing?.municipality || listing?.city || '',
      country: listing?.country || 'South Africa',
      source: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress ? 'listing' : 'manual',
    },
  )
  const propertyBranch = String(flow?.property_branch || '').trim()
  const disclosureKind = propertyBranch === 'commercial' || propertyBranch === 'mixed_use' ? 'commercial' : 'residential'
  const propertyDisclosure = normalizePropertyDisclosure(
    existing.propertyDisclosure ||
      existing.property_disclosure ||
      canonicalFacts?.property_disclosure ||
      canonicalFacts?.propertyDisclosure ||
      {},
    { kind: disclosureKind },
  )
  const canonicalPropertyType = normalizeCanonicalPropertyType({
    propertyCategory: resolvedPropertyCategory,
    propertyStructureType: resolvedPropertyStructureType,
    propertyType: resolvedPropertyType,
    estateName: existing.estateName || canonicalFacts?.property?.estate_name || existing.estateComplexName,
    estateComplexName: existing.estateComplexName || canonicalFacts?.property?.estate_name,
  })
  const ownershipType = normalizeOwnershipType(existing, canonicalFacts, flow)
  const ownerEntityType = deriveOwnerEntityType(ownershipType, existing, canonicalFacts)
  const ownerStructureType = deriveOwnerStructureType(ownershipType, ownerEntityType, existing, canonicalFacts)
  const foreignOwner = isForeignOwnerModel(ownerEntityType, ownerStructureType)
  const multipleOwnerCaptureMode =
    existing.multipleOwnerCaptureMode ||
    existing.multiple_owner_capture_mode ||
    canonicalFacts?.seller?.multiple_owner_capture_mode ||
    'capture_now'
  const ownershipBranch = getOwnershipBranch(ownershipType)
  const isVatEligibleOwnership = ['company', 'trust'].includes(ownershipBranch)
  const resolvedSectionNumber =
    existing.sectionNumber ||
    canonicalFacts?.property?.section_number ||
    canonicalFacts?.property?.scheme?.section_number ||
    existing.unitNumber ||
    canonicalFacts?.property?.unit_number ||
    canonicalFacts?.property?.scheme?.unit_number ||
    ''
  const resolvedUnitNumber =
    existing.unitNumber ||
    canonicalFacts?.property?.unit_number ||
    canonicalFacts?.property?.scheme?.unit_number ||
    resolvedSectionNumber

  return {
    sellerFirstName: existing.sellerFirstName || canonicalFacts?.seller?.first_name || split.firstName,
    sellerSurname: existing.sellerSurname || canonicalFacts?.seller?.surname || split.surname,
    idNumber: resolveIdNumber(),
    email: existing.email || canonicalFacts?.seller?.email || seller.email || '',
    phone: existing.phone || canonicalFacts?.seller?.phone || seller.phone || '',
    residentialAddress: resolveAddress(),
    residentialAddressDetails: existing.residentialAddressDetails || existing.sellerResidentialAddressDetails || {},

    ownershipType,
    sellerLegalType: ownershipType,
    ownerEntityType,
    ownerStructureType,
    foreignOwner,
    foreignOwnerCountry: existing.foreignOwnerCountry || existing.foreign_owner_country || canonicalFacts?.seller?.foreign_owner_country || canonicalFacts?.seller?.foreign?.country || '',
    foreignPassportNumber: existing.foreignPassportNumber || existing.passportNumber || canonicalFacts?.seller?.foreign?.passport_number || '',
    foreignRegistrationNumber: existing.foreignRegistrationNumber || canonicalFacts?.seller?.foreign?.registration_number || '',
    foreignResidencyStatus: existing.foreignResidencyStatus || existing.residencyStatus || canonicalFacts?.seller?.foreign?.residency_status || '',
    multipleOwnerCaptureMode,
    sellerTaxNumber: existing.sellerTaxNumber || canonicalFacts?.seller?.tax_number || existing.taxNumber || '',
    vatRegistered: isVatEligibleOwnership ? Boolean(existing.vatRegistered) : false,
    vatNumber: isVatEligibleOwnership ? (existing.vatNumber || '') : '',
    maritalStatus: ownershipBranch === 'married' ? (existing.maritalStatus || canonicalFacts?.seller?.marital_status || 'married') : 'not_married',
    maritalRegime: ownershipBranch === 'married' ? (existing.maritalRegime || canonicalFacts?.seller?.marital_regime || (ownershipType === 'married_cop' ? 'in_community' : ownershipType === 'married_anc' ? 'anc' : 'unknown')) : 'not_applicable',
    authorisedRepresentative: existing.authorisedRepresentative || canonicalFacts?.seller?.authorised_representative || '',
    spouseName: ownershipBranch === 'married' ? (existing.spouseName || canonicalFacts?.seller?.spouse?.name || '') : '',
    spouseIdNumber: ownershipBranch === 'married' ? (existing.spouseIdNumber || canonicalFacts?.seller?.spouse?.id_number || '') : '',
    spouseEmail: ownershipBranch === 'married' ? (existing.spouseEmail || canonicalFacts?.seller?.spouse?.email || '') : '',
    spousePhone: ownershipBranch === 'married' ? (existing.spousePhone || canonicalFacts?.seller?.spouse?.phone || '') : '',

    companyName: existing.companyName || canonicalFacts?.seller?.company?.name || existing.entityName || '',
    companyRegistrationNumber: existing.companyRegistrationNumber || canonicalFacts?.seller?.company?.registration_number || existing.entityRegistrationNumber || '',
    companyDirectors,
    companyDirectorName: existing.companyDirectorName || companyDirectors[0]?.name || canonicalFacts?.seller?.company?.director_name || canonicalFacts?.seller?.company?.authorised_signatory?.name || existing.entityRepresentative || '',
    companyDirectorEmail: existing.companyDirectorEmail || companyDirectors[0]?.email || canonicalFacts?.seller?.company?.director_email || canonicalFacts?.seller?.company?.authorised_signatory?.email || '',
    companyDirectorPhone: existing.companyDirectorPhone || companyDirectors[0]?.phone || canonicalFacts?.seller?.company?.director_phone || canonicalFacts?.seller?.company?.authorised_signatory?.phone || '',
    companyRegisteredAddress: existing.companyRegisteredAddress || canonicalFacts?.seller?.company?.registered_address || existing.residentialAddress || '',
    authorisedSignatoryName: existing.authorisedSignatoryName || canonicalFacts?.seller?.company?.authorised_signatory?.name || '',
    authorisedSignatoryEmail: existing.authorisedSignatoryEmail || canonicalFacts?.seller?.company?.authorised_signatory?.email || '',
    authorisedSignatoryPhone: existing.authorisedSignatoryPhone || canonicalFacts?.seller?.company?.authorised_signatory?.phone || '',
    authorisedSignatoryAddress: existing.authorisedSignatoryAddress || canonicalFacts?.seller?.company?.authorised_signatory?.residential_address || '',

    trustName: existing.trustName || canonicalFacts?.seller?.trust?.name || existing.entityName || '',
    trustRegistrationNumber: existing.trustRegistrationNumber || canonicalFacts?.seller?.trust?.registration_number || existing.entityRegistrationNumber || '',
    trustees: trustTrustees,
    trusteeName: existing.trusteeName || trustTrustees[0]?.name || canonicalFacts?.seller?.trust?.trustee_name || canonicalFacts?.seller?.trust?.authorised_trustee?.name || existing.entityRepresentative || '',
    trusteeEmail: existing.trusteeEmail || trustTrustees[0]?.email || canonicalFacts?.seller?.trust?.trustee_email || canonicalFacts?.seller?.trust?.authorised_trustee?.email || '',
    trusteePhone: existing.trusteePhone || trustTrustees[0]?.phone || canonicalFacts?.seller?.trust?.trustee_phone || canonicalFacts?.seller?.trust?.authorised_trustee?.phone || '',
    trustRegisteredAddress: existing.trustRegisteredAddress || canonicalFacts?.seller?.trust?.registered_address || existing.residentialAddress || '',
    authorisedTrusteeName: existing.authorisedTrusteeName || canonicalFacts?.seller?.trust?.authorised_trustee?.name || '',
    authorisedTrusteeEmail: existing.authorisedTrusteeEmail || canonicalFacts?.seller?.trust?.authorised_trustee?.email || '',
    authorisedTrusteePhone: existing.authorisedTrusteePhone || canonicalFacts?.seller?.trust?.authorised_trustee?.phone || '',
    authorisedTrusteeAddress: existing.authorisedTrusteeAddress || canonicalFacts?.seller?.trust?.authorised_trustee?.residential_address || '',

    executors: estateExecutors,
    executorName: existing.executorName || estateExecutors[0]?.name || canonicalFacts?.seller?.deceased_estate?.executor_name || '',
    executorEmail: existing.executorEmail || estateExecutors[0]?.email || canonicalFacts?.seller?.deceased_estate?.executor_email || '',
    executorPhone: existing.executorPhone || estateExecutors[0]?.phone || canonicalFacts?.seller?.deceased_estate?.executor_phone || '',
    estateReference: existing.estateReference || canonicalFacts?.seller?.deceased_estate?.estate_reference || '',
    executorAuthorityDetails: existing.executorAuthorityDetails || canonicalFacts?.seller?.deceased_estate?.authority_details || '',

    powerOfAttorneyRepresentatives: poaRepresentatives,
    powerOfAttorneyName: existing.powerOfAttorneyName || poaRepresentatives[0]?.name || canonicalFacts?.seller?.power_of_attorney?.representative_name || existing.authorisedRepresentative || '',
    powerOfAttorneyEmail: existing.powerOfAttorneyEmail || poaRepresentatives[0]?.email || canonicalFacts?.seller?.power_of_attorney?.representative_email || '',
    powerOfAttorneyPhone: existing.powerOfAttorneyPhone || poaRepresentatives[0]?.phone || canonicalFacts?.seller?.power_of_attorney?.representative_phone || '',
    powerOfAttorneyPrincipalName: existing.powerOfAttorneyPrincipalName || canonicalFacts?.seller?.power_of_attorney?.principal?.name || '',
    powerOfAttorneyPrincipalIdNumber: existing.powerOfAttorneyPrincipalIdNumber || canonicalFacts?.seller?.power_of_attorney?.principal?.id_number || '',
    powerOfAttorneyReference: existing.powerOfAttorneyReference || canonicalFacts?.seller?.power_of_attorney?.reference || '',
    powerOfAttorneyAuthorityDetails: existing.powerOfAttorneyAuthorityDetails || canonicalFacts?.seller?.power_of_attorney?.authority_details || '',

    multipleOwners: multipleOwnerRecords.map((owner, index) => ({
      id: owner.id || `owner-${index + 1}`,
      name: owner.name || owner.first_name || '',
      surname: owner.surname || '',
      idNumber: owner.idNumber || owner.id_number || '',
      email: owner.email || '',
      phone: owner.phone || '',
      ownershipShare: owner.ownershipShare || owner.ownership_share || '',
      consentToSell: Boolean(owner.consentToSell ?? owner.consent_to_sell),
    })),
    ownershipFieldLabels,

    askingPrice: existing.askingPrice || String(listing?.askingPrice || ''),
    mandateType: existing.mandateType || canonicalFacts?.transaction?.mandate_type || listing?.mandateType || '',
    mandateStartDate: existing.mandateStartDate || existing.mandate_start_date || canonicalFacts?.transaction?.mandate_start_date || listing?.mandateStartDate || listing?.mandate_start_date || '',
    mandateEndDate: existing.mandateEndDate || existing.mandate_end_date || existing.mandateExpiryDate || existing.mandate_expiry_date || canonicalFacts?.transaction?.mandate_end_date || canonicalFacts?.transaction?.mandate_expiry_date || listing?.mandateEndDate || listing?.mandate_end_date || listing?.mandateExpiryDate || listing?.mandate_expiry_date || '',
    specialMandateConditions: existing.specialMandateConditions || existing.special_mandate_conditions || canonicalFacts?.transaction?.special_mandate_conditions || {},
    additionalConditions: existing.additionalConditions || existing.additional_conditions || existing.additionalMandateConditions || existing.additional_mandate_conditions || canonicalFacts?.transaction?.additional_conditions || '',
    transferAttorneyDecision: normalizeSellerTransferAttorneyDecision(
      existing.transferAttorneyDecision || existing.transfer_attorney_decision || {},
    ),
    sellingTimeline: existing.sellingTimeline || '1_3_months',
    sellingReason: existing.sellingReason || '',

    propertyCategory: resolvedPropertyCategory,
    propertyStructureType: resolvedPropertyStructureType,
    canonicalPropertyType: existing.canonicalPropertyType || canonicalPropertyType || canonicalFacts?.property?.property_type || existing.propertyClassification || '',
    sectionalTitle: isSectionalStructure,
    shareBlock: isShareBlockStructure,
    estateOrHoa: Boolean(existing.estateOrHoa || canonicalFacts?.property?.estate_or_hoa || propertyBranch === 'estate_hoa' || hadLegacyEstateStructure),
    bodyCorporate: Boolean(existing.bodyCorporate || canonicalFacts?.property?.body_corporate || isSectionalStructure),
    commercialProperty: Boolean(existing.commercialProperty || canonicalFacts?.property?.commercial_property || ['commercial', 'mixed_use'].includes(propertyBranch)),
    propertyType: resolvedPropertyType,
    propertyAddressDetails,
    propertyAddressSearch: propertyAddressDetails.query || existing.propertyAddressSearch || '',
    propertyAddress: propertyAddressDetails.formatted || existing.propertyAddress || canonicalFacts?.property?.address || [listing?.listingTitle, listing?.suburb, listing?.city].filter(Boolean).join(', '),
    propertyAddressLine1: propertyAddressDetails.line1,
    propertyAddressLine2: propertyAddressDetails.line2,
    suburb: propertyAddressDetails.suburb || existing.suburb || canonicalFacts?.property?.suburb || listing?.suburb || '',
    city: propertyAddressDetails.city || existing.city || canonicalFacts?.property?.city || listing?.city || '',
    province: propertyAddressDetails.province || existing.province || canonicalFacts?.property?.province || '',
    postalCode: propertyAddressDetails.postalCode || existing.postalCode || canonicalFacts?.property?.postal_code || '',
    municipality: propertyAddressDetails.municipality || existing.municipality || canonicalFacts?.property?.municipality || existing.city || listing?.city || '',
    country: propertyAddressDetails.country || existing.country || canonicalFacts?.property?.country || 'South Africa',
    estateComplexName: existing.estateComplexName || canonicalFacts?.property?.estate_name || '',
    estateName: existing.estateName || canonicalFacts?.property?.estate_name || existing.estateComplexName || '',
    schemeBodyCorporateName: existing.schemeBodyCorporateName || canonicalFacts?.property?.scheme?.body_corporate_name || '',
    schemeManagingAgentName: existing.schemeManagingAgentName || canonicalFacts?.property?.scheme?.managing_agent?.name || '',
    schemeManagingAgentEmail: existing.schemeManagingAgentEmail || canonicalFacts?.property?.scheme?.managing_agent?.email || '',
    schemeManagingAgentPhone: existing.schemeManagingAgentPhone || canonicalFacts?.property?.scheme?.managing_agent?.phone || '',
    schemeLevies: existing.schemeLevies || canonicalFacts?.property?.scheme?.levies || '',
    schemeRulesAvailable: Boolean(existing.schemeRulesAvailable || canonicalFacts?.property?.scheme?.rules),
    unitNumber: resolvedUnitNumber,
    sectionNumber: resolvedSectionNumber,
    schemeName: existing.schemeName || canonicalFacts?.property?.scheme_name || canonicalFacts?.property?.scheme?.name || '',
    hoaContactName: existing.hoaContactName || canonicalFacts?.property?.estate?.hoa_contact?.name || '',
    hoaContactEmail: existing.hoaContactEmail || canonicalFacts?.property?.estate?.hoa_contact?.email || '',
    hoaContactPhone: existing.hoaContactPhone || canonicalFacts?.property?.estate?.hoa_contact?.phone || '',
    hoaManagementCompany: existing.hoaManagementCompany || canonicalFacts?.property?.estate?.management_company || '',
    hoaRulesAvailable: Boolean(existing.hoaRulesAvailable || canonicalFacts?.property?.estate?.rules),
    commercialUseDescription: existing.commercialUseDescription || canonicalFacts?.property?.use?.description || '',
    mixedUseSplit: existing.mixedUseSplit || canonicalFacts?.property?.use?.mixed_use_split || '',
    tenantScheduleAvailable: Boolean(existing.tenantScheduleAvailable || canonicalFacts?.property?.tenant_schedule),
    landZoning: existing.landZoning || canonicalFacts?.property?.land?.zoning || canonicalFacts?.property?.land_zoning || '',
    landServicesAvailable: existing.landServicesAvailable || canonicalFacts?.property?.land?.services_available || canonicalFacts?.property?.land_services_available || '',
    landWaterSource: existing.landWaterSource || canonicalFacts?.property?.land?.water_source || canonicalFacts?.property?.land_water_source || '',
    erfNumber: existing.erfNumber || canonicalFacts?.property?.erf_number || '',
    titleDeedAvailable: Boolean(existing.titleDeedAvailable || canonicalFacts?.property?.title_deed_available),
    sgDiagramAvailable: Boolean(existing.sgDiagramAvailable || canonicalFacts?.property?.sg_diagram_available),
    erfDiagramAvailable: Boolean(existing.erfDiagramAvailable || canonicalFacts?.property?.erf_diagram_available),
    approvedBuildingPlansAvailable: Boolean(existing.approvedBuildingPlansAvailable || canonicalFacts?.property?.approved_building_plans_available),
    floorPlanAvailable: Boolean(existing.floorPlanAvailable || canonicalFacts?.property?.floor_plan_available),

    erfSize: existing.erfSize || canonicalFacts?.property?.erf_size || '',
    floorSize: existing.floorSize || canonicalFacts?.property?.floor_size || '',
    bedrooms: existing.bedrooms || canonicalFacts?.property?.bedrooms || '',
    bathrooms: existing.bathrooms || canonicalFacts?.property?.bathrooms || '',
    livingArea: existing.livingArea || canonicalFacts?.property?.living_area || '',
    kitchens: existing.kitchens || canonicalFacts?.property?.kitchens || '',
    garages: existing.garages || canonicalFacts?.property?.garages || '',
    parkingCovered: existing.parkingCovered || canonicalFacts?.property?.parking_covered || '',
    parkingOpen: existing.parkingOpen || canonicalFacts?.property?.parking_open || '',
    pool: Boolean(existing.pool || canonicalFacts?.property?.pool),
    levies: existing.levies || canonicalFacts?.property?.levies || '',
    leviesNotApplicable: Boolean(existing.leviesNotApplicable || existing.levies_not_applicable || canonicalFacts?.property?.levies_not_applicable),
    ratesTaxes: existing.ratesTaxes || canonicalFacts?.property?.rates_taxes || '',
    waterBillingType: existing.waterBillingType || existing.water_billing_type || canonicalFacts?.property?.utilities?.water_billing_type || canonicalFacts?.property?.water_billing_type || '',
    monthlyWaterSpend: existing.monthlyWaterSpend || canonicalFacts?.property?.utilities?.monthly_water_spend || '',
    monthlyElectricitySpend: existing.monthlyElectricitySpend || canonicalFacts?.property?.utilities?.monthly_electricity_spend || '',
    recentAlterations: Boolean(existing.recentAlterations || canonicalFacts?.property?.alterations?.recent),
    alterationDetails: existing.alterationDetails || canonicalFacts?.property?.alterations?.details || '',

    flowVersion: flow.version || canonicalFacts?.flow?.version || '',
    sellerBranch: flow.seller_branch || '',
    propertyBranch: flow.property_branch || '',
    flowVisibleFields: Array.isArray(flow.visible_fields) ? flow.visible_fields : [],
    flowRequiredFields: Array.isArray(flow.required_fields) ? flow.required_fields : [],
    flowDocumentTriggers: Array.isArray(flow.document_triggers) ? flow.document_triggers : [],
    propertyDisclosure,
    propertyDisclosureStatus: getPropertyDisclosureStatus(propertyDisclosure),

    features: normalizedFeatures,
    propertyCondition: existing.propertyCondition || 'good',
    kitchenCondition: existing.kitchenCondition || 'good',
    bathroomCondition: existing.bathroomCondition || 'good',
    views: existing.views || '',
    recentRenovations: existing.recentRenovations || '',
    propertyNotes: existing.propertyNotes || '',

    occupancyStatus: existing.occupancyStatus || 'unknown',
    leaseExists: Boolean(existing.leaseExists),
    leaseExpiryDate: existing.leaseExpiryDate || '',
    monthlyRental: existing.monthlyRental || '',
    rentalDeposit: existing.rentalDeposit || '',
    tenantName: existing.tenantName || '',
    tenantContactDetails: existing.tenantContactDetails || '',
    noticePeriodDetails: existing.noticePeriodDetails || '',
    rentalScheduleAvailable: Boolean(existing.rentalScheduleAvailable),

    existingBond: Boolean(existing.existingBond || existing.sellerHasExistingBond || existing.bondedProperty),
    bondBank: existing.bondBank || existing.currentBondBank || '',
    bondAccountReference: existing.bondAccountReference || existing.currentBondAccountNumber || '',
    multipleBonds: Boolean(existing.multipleBonds),
    accessBond: Boolean(existing.accessBond),
    estimatedSettlementAmount: existing.estimatedSettlementAmount || '',
    cancellationRequired: existing.cancellationRequired !== undefined ? Boolean(existing.cancellationRequired) : Boolean(existing.existingBond),
    cancellationAttorneyKnown: Boolean(existing.cancellationAttorneyKnown),
    cancellationAttorneyDetails: existing.cancellationAttorneyDetails || '',

    gasInstallation: Boolean(existing.gasInstallation || existing.gasGeyser || existing.gas_geyser || canonicalFacts?.compliance?.gas_installation || canonicalFacts?.compliance?.gas_geyser),
    gasGeyser: normalizedFeatures.includes('gas_geyser'),
    electricFence: Boolean(existing.electricFence || canonicalFacts?.compliance?.electric_fence),
    solarInstallation: normalizedFeatures.includes('solar'),
    inverterBattery: normalizedFeatures.includes('inverter_battery'),
    swimmingPool: Boolean(existing.swimmingPool || existing.pool || canonicalFacts?.compliance?.swimming_pool),
    boreholeInstallation: normalizedFeatures.includes('borehole'),
    borehole: normalizedFeatures.includes('borehole'),
    waterTank: normalizedFeatures.includes('water_tank'),
    generatorInstallation: Boolean(existing.generatorInstallation || canonicalFacts?.compliance?.generator_installation),
    beetleCertificateRegion: Boolean(existing.beetleCertificateRegion || canonicalFacts?.compliance?.beetle_certificate_region),
    plumbingCertificateRequired: Boolean(existing.plumbingCertificateRequired || canonicalFacts?.compliance?.plumbing_certificate_required),
    occupationCertificateAvailable: Boolean(existing.occupationCertificateAvailable || canonicalFacts?.compliance?.occupation_certificate_available),
    electricalCocAvailable: Boolean(existing.electricalCocAvailable || canonicalFacts?.compliance?.electrical_coc_available),
    gasCocAvailable: Boolean(existing.gasCocAvailable || canonicalFacts?.compliance?.gas_coc_available),
    electricFenceCertificateAvailable: Boolean(existing.electricFenceCertificateAvailable || canonicalFacts?.compliance?.electric_fence_certificate_available),
    plumbingCertificateAvailable: Boolean(existing.plumbingCertificateAvailable || canonicalFacts?.compliance?.plumbing_certificate_available),
    solarComplianceAvailable: Boolean(existing.solarComplianceAvailable || canonicalFacts?.compliance?.solar_compliance_available),
  }
}

function AgencyMark({ brand, tone = 'dark' }) {
  const logoUrl = tone === 'light'
    ? brand?.logoLightUrl || brand?.logoUrl || brand?.logoDarkUrl
    : brand?.logoDarkUrl || brand?.logoUrl || brand?.logoLightUrl

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${brand?.name || 'Agency'} logo`}
        className={`h-11 w-auto max-w-[190px] object-contain sm:h-16 sm:max-w-[260px] ${tone === 'dark' ? 'drop-shadow-[0_14px_28px_rgba(0,0,0,0.24)]' : ''}`}
      />
    )
  }

  if (brand?.isFallback) {
    return (
      <span className={`inline-flex h-10 items-center justify-center rounded-[14px] px-3 text-sm font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.12)] sm:h-14 sm:px-4 sm:text-base ${tone === 'light' ? 'border border-[#dbe5ef] bg-white text-[#172334]' : 'border border-white/15 bg-white/10 text-white'}`}>
        {brand?.name || 'Agency'}
      </span>
    )
  }

  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-xs font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:h-16 sm:w-16 sm:rounded-[18px] sm:text-base ${tone === 'light' ? 'border border-[#dbe5ef] bg-[#172334] text-white' : 'border border-white/15 bg-white/10 text-white'}`}>
      {brand?.initials || 'AG'}
    </span>
  )
}

function SellerBrandBar({ brand }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3 sm:pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <AgencyMark brand={brand} tone="light" />
      </div>
      <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5 text-[10px] font-semibold text-white/75 sm:gap-3 sm:px-3 sm:py-2 sm:text-xs">
        <span>Powered by</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[#101827] sm:px-2.5 sm:py-1">arch9</span>
      </div>
    </div>
  )
}

function SellerOnboardingHero({ brand, listing, form, statusLabel }) {
  const sellerName = getSellerDisplayName(listing, form)
  const propertyAddress = getPropertyDisplayAddress(listing, form)
  const agentName = resolveAgentName(listing)

  return (
    <section className="hidden overflow-hidden rounded-[22px] border border-[#18263a]/90 bg-[linear-gradient(135deg,#0b1626_0%,#12253b_54%,#18354d_100%)] p-4 text-white shadow-[0_18px_44px_rgba(15,23,42,0.16)] sm:block sm:rounded-[32px] sm:p-6 lg:rounded-[36px] lg:p-8 lg:shadow-[0_32px_80px_rgba(15,23,42,0.22)]">
      <SellerBrandBar brand={brand} />
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-5 lg:mt-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <h1 className="max-w-3xl text-[1.75rem] font-semibold leading-[1.08] tracking-normal text-white sm:text-4xl lg:text-5xl">
            Complete your seller onboarding
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c8d4e3] sm:mt-4 sm:text-base lg:text-[1.05rem]">
            A guided intake for your seller, property, compliance, and mandate details. We’ll only ask what matters next.
          </p>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-white/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:rounded-[24px] sm:p-5 lg:rounded-[26px]">
          <div className="grid gap-2.5 sm:gap-3">
            <article>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/45 sm:text-xs">Seller</p>
              <p className="mt-1 break-words text-sm font-semibold text-white">{sellerName}</p>
            </article>
            <article>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/45 sm:text-xs">Property</p>
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
      <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 lg:mt-7">
        {['Guided onboarding', 'Takes 3-5 minutes', 'Bank-grade care'].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/8 px-2.5 py-1.5 text-[10px] font-semibold text-white/70 sm:gap-2 sm:px-3 sm:text-xs">
            <BadgeCheck size={13} />
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}

function SellerWelcomeScreen({ brand, listing, form, onContinue }) {
  const sellerName = getSellerDisplayName(listing, form)
  const propertyAddress = getPropertyDisplayAddress(listing, form)
  const welcomeName = sellerName && sellerName !== 'Seller'
    ? sellerName.split(/\s+/).filter(Boolean)[0]
    : ''

  return (
    <PremiumOnboardingLanding
      portalType="seller"
      agencyLogo={brand?.logoLightUrl || brand?.logoUrl || brand?.logoDarkUrl || ''}
      agencyName={brand?.name || ''}
      personName={welcomeName}
      propertyAddress={propertyAddress}
      backgroundImage={resolveSellerWelcomeImageUrl(listing)}
      primaryColour={brand?.primaryColour}
      secondaryColour={brand?.secondaryColour}
      accentColour={brand?.accentColour}
      onStart={onContinue}
    />
  )
}

function SellerStepProgress({ currentStep, progress }) {
  return (
    <section className="rounded-[24px] border border-[#dce6ef] bg-white/95 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:rounded-[28px] sm:bg-white/90 sm:p-5 sm:shadow-[0_12px_30px_rgba(15,23,42,0.04)] lg:rounded-[30px] lg:p-6 lg:shadow-[0_22px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3 sm:hidden">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#137a4a]">Step {currentStep + 1} of {STEPS.length}</p>
          <h2 className="mt-1 break-words text-[1.45rem] font-semibold leading-tight tracking-normal text-[#142132]">{STEP_META[currentStep]?.label}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-[#eaf8ef] px-3 py-1.5 text-xs font-semibold text-[#126b34]">{progress}%</span>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-[#516981] sm:hidden">{STEP_META[currentStep]?.helper}</p>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef3f8] sm:hidden">
        <span
          className="block h-full rounded-full bg-[#138a3d] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 sm:hidden">
        {STEP_META.map((step, index) => (
          <span
            key={step.label}
            className={`h-1.5 rounded-full transition-all ${index <= currentStep ? 'w-5 bg-[#138a3d]' : 'w-1.5 bg-[#d8e2ee]'}`}
          />
        ))}
      </div>

      <div className="hidden items-start justify-between gap-3 sm:flex">
        <div>
          <p className="text-sm font-semibold text-[#142132]">Step {currentStep + 1} of {STEPS.length}</p>
          <p className="mt-1 text-sm text-[#6b7d93]">{STEP_META[currentStep]?.helper}</p>
        </div>
        <span className="rounded-full bg-[#f0fbf4] px-3 py-1 text-xs font-semibold text-[#126b34]">{progress}% complete</span>
      </div>
      <div className="mt-4 hidden h-2 overflow-hidden rounded-full bg-[#eef3f8] sm:block">
        <span
          className="block h-full rounded-full bg-[#138a3d] transition-[width] duration-300"
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
              className={`flex items-center gap-3 rounded-[18px] border px-3 py-3.5 text-left transition ${
                isActive
                  ? 'border-[#138a3d]/65 bg-[#f0fbf4] shadow-[0_12px_26px_rgba(19,138,61,0.10)]'
                  : isComplete
                    ? 'border-[#d8ecdf] bg-[#f5fbf7]'
                    : 'border-[#e1e9f3] bg-white/90'
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
      <header className="mb-5 hidden sm:mb-6 sm:block">
        <p className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f3f7fb] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#637589] sm:px-3 sm:text-[11px]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-normal text-[#162435] sm:mt-3 sm:text-3xl">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60748b] sm:mt-3 sm:text-[15px]">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

function FormSection({ icon, title, description, illustration = '', children, mobilePane = true, mobilePaneIndex = null }) {
  const { paneIndex, mobilePaneClassName } = useMobileQuestionPane(mobilePane, mobilePaneIndex)
  return (
    <section data-mobile-question-pane={mobilePane ? paneIndex : undefined} className={`rounded-none border-0 bg-transparent p-0 sm:rounded-[22px] sm:border sm:border-[#dfe7f1] sm:bg-[#fbfcfe] sm:p-5 lg:rounded-[24px] lg:p-6 ${mobilePaneClassName}`}>
      {illustration ? (
        <div className="mb-5 sm:hidden">
          <SellerOnboardingIllustration variant={illustration} />
        </div>
      ) : null}
      <OnboardingSectionHeader icon={icon || Circle} title={title} description={description} accent="green" />
      <div className="mt-4 sm:mt-5">{children}</div>
    </section>
  )
}

function ChoiceCard({ active, title, description, icon = Circle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${choiceCardClass(active)} flex min-h-[62px] items-start gap-3 sm:min-h-[92px]`}
    >
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border ${
        active ? 'border-[#138a3d]/30 bg-white text-[#138a3d]' : 'border-[#dbe6f2] bg-[#f8fbff] text-[#60748b]'
      }`}>
        {createElement(icon, { size: 18, strokeWidth: 2.2 })}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold sm:text-[15px] ${active ? 'text-[#132033]' : 'text-[#35546c]'}`}>{title}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[#6b7d93] sm:mt-1.5">{description}</span> : null}
      </span>
    </button>
  )
}

function isSignatureImage(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

function DrawnSignaturePad({ value = '', onChange, signerName = '' }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const hasImageSignature = isSignatureImage(value)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let cancelled = false
    const renderCanvas = () => {
      if (cancelled) return
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width || 640))
      const height = Math.max(150, Math.round(rect.height || 190))
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = 2.6
      context.strokeStyle = '#142334'

      if (hasImageSignature) {
        const image = new Image()
        image.onload = () => {
          if (!cancelled) context.drawImage(image, 0, 0, width, height)
        }
        image.src = value
      }
    }

    renderCanvas()
    window.addEventListener('resize', renderCanvas)
    return () => {
      cancelled = true
      window.removeEventListener('resize', renderCanvas)
    }
  }, [hasImageSignature, value])

  function pointFromEvent(event) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function handlePointerDown(event) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    const point = pointFromEvent(event)
    lastPointRef.current = point
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function handlePointerMove(event) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const lastPoint = lastPointRef.current
    if (!canvas || !context || !lastPoint) return
    const point = pointFromEvent(event)
    context.quadraticCurveTo(lastPoint.x, lastPoint.y, (lastPoint.x + point.x) / 2, (lastPoint.y + point.y) / 2)
    context.stroke()
    lastPointRef.current = point
  }

  function handlePointerUp(event) {
    const canvas = canvasRef.current
    if (!canvas || !drawingRef.current) return
    canvas.releasePointerCapture?.(event.pointerId)
    drawingRef.current = false
    lastPointRef.current = null
    onChange?.(canvas.toDataURL('image/png'))
  }

  function handleClear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) {
      const rect = canvas.getBoundingClientRect()
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, rect.width || 640, rect.height || 190)
    }
    onChange?.('')
  }

  return (
    <div className="md:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2a4057]">Draw seller signature</p>
          <p className="mt-1 text-xs leading-5 text-[#60748b]">Use a mouse, trackpad, or finger on a phone.</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-3 text-xs font-semibold text-[#35546c]"
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>
      <div className="mt-3 overflow-hidden rounded-[18px] border border-[#cfdceb] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <canvas
          ref={canvasRef}
          aria-label={`Signature pad${signerName ? ` for ${signerName}` : ''}`}
          className="block h-[190px] w-full touch-none cursor-crosshair bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      {value && !hasImageSignature ? (
        <p className="mt-2 rounded-[12px] border border-[#f2dcc0] bg-[#fff9ef] px-3 py-2 text-xs leading-5 text-[#8a5a18]">
          A typed signature is saved for this disclosure. Clear the box and draw a signature to replace it.
        </p>
      ) : null}
    </div>
  )
}

function ReviewCard({ title, items, onEdit, missing = [], collapsible = false, defaultOpen = false }) {
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7890a8]">{title}</p>
        {missing.length ? (
          <p className="mt-1 text-xs font-semibold text-[#b45309]">{missing.length} item{missing.length === 1 ? '' : 's'} need attention</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {typeof onEdit === 'function' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
            className="min-h-[38px] rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1.5 text-xs font-semibold text-[#35546c]"
          >
            Edit
          </button>
        ) : null}
        {collapsible ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] text-[#35546c] transition-transform duration-200 group-open:rotate-90">
            <ChevronRight size={15} />
          </span>
        ) : null}
      </div>
    </div>
  )

  const body = (
    <dl className="mt-4 grid gap-3">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1.5 border-t border-[#eef3f8] pt-3.5 first:border-t-0 first:pt-0">
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a9ab0]">{item.label}</dt>
          <dd className="text-sm font-semibold text-[#172334]">{item.value || 'Not provided'}</dd>
        </div>
      ))}
    </dl>
  )

  if (collapsible) {
    return (
      <details className="group rounded-[20px] border border-[#dfe8f2] bg-white/95 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:p-5" {...(defaultOpen ? { open: true } : {})}>
        <summary className="cursor-pointer list-none">
          {header}
        </summary>
        {body}
      </details>
    )
  }

  return (
    <article className="rounded-[20px] border border-[#dfe8f2] bg-white/95 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:p-5">
      {header}
      {body}
    </article>
  )
}

function ReviewReadinessPanel({ issueGroups = [], sellerName = '', propertyAddress = '' }) {
  const issueCount = issueGroups.reduce((total, group) => total + (group.missing?.length || 0), 0)
  const ready = issueCount === 0

  return (
    <section className={`rounded-[22px] border p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)] sm:p-5 ${
      ready
        ? 'border-[#cfe8da] bg-[#f2fbf5]'
        : 'border-[#f2dcc0] bg-[#fff9ef]'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          ready ? 'bg-[#1f7d44] text-white' : 'bg-[#fff2d8] text-[#b45309]'
        }`}>
          {ready ? <CheckCircle2 size={22} /> : <ClipboardCheck size={21} />}
        </span>
        <div className="min-w-0">
          <p className={`text-lg font-semibold tracking-normal ${ready ? 'text-[#14532d]' : 'text-[#7a4b10]'}`}>
            {ready ? 'Ready to submit' : `${issueCount} item${issueCount === 1 ? '' : 's'} need attention`}
          </p>
          <p className={`mt-1 text-sm leading-6 ${ready ? 'text-[#25603d]' : 'text-[#8a5a18]'}`}>
            {ready
              ? 'Everything required for this onboarding has been captured. Submit when the summary looks correct.'
              : 'Open the highlighted sections below and finish the missing details before submitting.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-[18px] border border-white/70 bg-white/75 p-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8da3]">Seller</p>
          <p className="mt-1 break-words font-semibold text-[#172334]">{sellerName || 'Not provided'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8da3]">Property</p>
          <p className="mt-1 break-words font-semibold text-[#172334]">{propertyAddress || 'Not provided'}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {issueGroups.map((group) => {
          const hasMissing = Boolean(group.missing?.length)
          const content = (
            <>
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                hasMissing ? 'bg-[#fff2d8] text-[#b45309]' : 'bg-[#e7f6ed] text-[#1f7d44]'
              }`}>
                {hasMissing ? <Circle size={13} /> : <CheckCircle2 size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#172334]">{group.label}</span>
                <span className="mt-0.5 block text-xs leading-4 text-[#6b7d93]">
                  {hasMissing ? group.missing.join(', ') : 'Complete'}
                </span>
              </span>
            </>
          )

          if (typeof group.onEdit === 'function') {
            return (
              <button
                key={group.label}
                type="button"
                onClick={group.onEdit}
                className="flex min-h-[58px] items-start gap-2 rounded-[16px] border border-[#dfe8f2] bg-white p-3 text-left transition hover:border-[#bccddd]"
              >
                {content}
              </button>
            )
          }

          return (
            <div key={group.label} className="flex min-h-[58px] items-start gap-2 rounded-[16px] border border-[#dfe8f2] bg-white p-3">
              {content}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PropertyDisclosureSection({
  disclosure,
  disclosureKind = 'residential',
  sellerName = '',
  sellerIdNumber = '',
  onAnswerChange,
  onDownload,
  onDisclosureChange,
}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosureKind })
  const statusLabel = getPropertyDisclosureStatusLabel(getPropertyDisclosureStatus(normalized))
  const answerSummary = getPropertyDisclosureAnswerSummary(normalized)
  const answerOptions = [
    { key: PROPERTY_DISCLOSURE_ANSWER.yes, label: 'Yes' },
    { key: PROPERTY_DISCLOSURE_ANSWER.no, label: 'No' },
    { key: PROPERTY_DISCLOSURE_ANSWER.unsure, label: 'Unsure' },
  ]
  const disclosureQuestionGroups = getDisclosureQuestionGroups()
  const commentsPaneIndex = disclosureQuestionGroups.length + 1
  const declarationPaneIndex = commentsPaneIndex + 1

  return (
    <StepShell
      eyebrow="Property Disclosure"
      title="Declaration by Seller - Annexure A"
      description="Complete the disclosure in the same structure as the mandate annexure. It can be downloaded as its own PDF afterwards."
    >
      <div className="space-y-5">
        <FormSection
          icon={ShieldCheck}
          title="Annexure A questions"
          description="Answer each item Yes, No, or Unsure. Use the comments section for explanations where needed."
          mobilePane={false}
        >
          <MobileQuestionPane paneIndex={0}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3 text-sm leading-6 text-[#4f6378]">
            <span>Status: <strong className="text-[#22364a]">{statusLabel}</strong></span>
            <span>{answerSummary.answered} / {answerSummary.total} answered</span>
          </div>
          </MobileQuestionPane>
          <div className="space-y-3 sm:hidden">
            {disclosureQuestionGroups.map((questions, groupIndex) => {
              const firstQuestion = questions[0]
              const lastQuestion = questions[questions.length - 1]
              const answeredInGroup = questions.filter((question) => normalized.responses?.[question.key]?.answer).length
              return (
                <MobileQuestionPane key={`${firstQuestion?.key || groupIndex}-group`} paneIndex={groupIndex + 1} className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dbe6f2] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#4f6378]">
                    <span>Questions {firstQuestion?.number}-{lastQuestion?.number}</span>
                    <span>{answeredInGroup} / {questions.length} answered</span>
                  </div>
                  {questions.map((question) => {
                    const response = normalized.responses?.[question.key] || {}
                    return (
                      <article key={question.key} className="rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef6f2] text-sm font-semibold text-[#138a3d]">
                            {question.number}
                          </span>
                          <p className="min-w-0 text-sm font-semibold leading-6 text-[#172334]">{question.text}</p>
                        </div>
                        {question.extraLabel ? (
                          <label className="mt-3 grid gap-1.5 text-xs font-semibold text-[#4f6378]">
                            {question.extraLabel}
                            <input
                              className="min-h-11 rounded-[12px] border border-[#d7e2ed] bg-white px-3 text-sm text-[#142334] outline-none focus:border-[#35546c]/40 focus:ring-2 focus:ring-[#35546c]/10"
                              value={normalized.remoteControlsQuantity}
                              onChange={(event) => onDisclosureChange('remoteControlsQuantity', event.target.value)}
                              placeholder="e.g. 2 gate remotes, 1 garage remote"
                            />
                          </label>
                        ) : null}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {answerOptions.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              aria-pressed={response.answer === option.key}
                              onClick={() => onAnswerChange(question.key, option.key)}
                              className={disclosureAnswerClass(response.answer === option.key)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </MobileQuestionPane>
              )
            })}
          </div>
          <div className="hidden overflow-hidden rounded-[18px] border border-[#1f2937] bg-white sm:block">
            <table className="w-full border-collapse text-left text-sm text-[#172334]">
              <thead>
                <tr className="bg-[#d9dde2]">
                  <th className="border-b border-r border-[#1f2937] px-3 py-2 font-semibold">Question</th>
                  {answerOptions.map((option) => (
                    <th key={option.key} className="w-[78px] border-b border-r border-[#1f2937] px-2 py-2 text-center font-semibold last:border-r-0">{option.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROPERTY_DISCLOSURE_QUESTIONS.map((question) => {
                  const response = normalized.responses?.[question.key] || {}
                  return (
                    <tr key={question.key}>
                      <td className="border-r border-t border-[#1f2937] px-3 py-2 align-top leading-6">
                        <span className="font-semibold">{question.number}.</span> {question.text}
                        {question.extraLabel ? (
                          <label className="mt-2 grid max-w-[320px] gap-1 text-xs font-semibold text-[#4f6378]">
                            {question.extraLabel}
                            <input
                              className="min-h-10 rounded-[10px] border border-[#d7e2ed] bg-white px-3 text-sm text-[#142334] outline-none focus:border-[#35546c]/40 focus:ring-2 focus:ring-[#35546c]/10"
                              value={normalized.remoteControlsQuantity}
                              onChange={(event) => onDisclosureChange('remoteControlsQuantity', event.target.value)}
                              placeholder="e.g. 2 gate remotes, 1 garage remote"
                            />
                          </label>
                        ) : null}
                      </td>
                      {answerOptions.map((option) => (
                        <td key={option.key} className="border-r border-t border-[#1f2937] px-2 py-2 text-center align-middle last:border-r-0">
                          <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#cbd7e4] bg-white">
                            <input
                              type="radio"
                              className="h-4 w-4 accent-[#172334]"
                              name={`disclosure-${question.key}`}
                              checked={response.answer === option.key}
                              onChange={() => onAnswerChange(question.key, option.key)}
                            />
                            <span className="sr-only">{option.label}</span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <MobileQuestionPane paneIndex={commentsPaneIndex}>
            <label className="mt-4 grid gap-2 text-sm font-medium text-[#2a4057]">
              21. Comments or explanation for any of the above
              <textarea
                className={`${DETAIL_INPUT_CLASS} min-h-[150px] resize-y`}
                value={normalized.comments}
                onChange={(event) => onDisclosureChange({ comments: event.target.value, otherDisclosure: event.target.value })}
                placeholder="Explain any yes or unsure answers, or add any other relevant disclosure."
              />
            </label>
          </MobileQuestionPane>
        </FormSection>

        {answerSummary.answered ? (
          <FormSection
            icon={FileCheck2}
            title="Seller Declaration"
            description="Sign only when the disclosure information is true and complete to the best of your knowledge."
            mobilePaneIndex={declarationPaneIndex}
          >
            <div className="rounded-[18px] border border-[#d8ecdf] bg-[#f5fbf7] p-4 text-sm leading-6 text-[#25603d]">
              I declare that the information provided above is true and complete to the best of my knowledge and that I have disclosed all known material facts relating to the property.
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                <input type="checkbox" checked={Boolean(normalized.declarationAccepted)} onChange={(event) => onDisclosureChange('declarationAccepted', event.target.checked)} />
                I accept the seller declaration
              </label>
              <div className="rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7890a8]">Seller name</p>
                <p className="mt-1 text-sm font-semibold text-[#172334]">{sellerName || 'Not provided'}</p>
              </div>
              <div className="rounded-[14px] border border-[#dbe6f2] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7890a8]">ID / passport</p>
                <p className="mt-1 text-sm font-semibold text-[#172334]">{sellerIdNumber || 'Not provided'}</p>
              </div>
              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                Date
                <input className={DETAIL_INPUT_CLASS} type="date" value={normalized.signedAt} onChange={(event) => onDisclosureChange('signedAt', event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                Signed at
                <input className={DETAIL_INPUT_CLASS} value={normalized.signedPlace} onChange={(event) => onDisclosureChange('signedPlace', event.target.value)} placeholder="Place of signature" />
              </label>
              <DrawnSignaturePad
                value={normalized.signature}
                signerName={sellerName}
                onChange={(nextSignature) => onDisclosureChange('signature', nextSignature)}
              />
            </div>
            <button
              type="button"
              onClick={onDownload}
              disabled={!isPropertyDisclosureDigitallyComplete(normalized)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#35546c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={15} />
              Download Disclosure PDF
            </button>
          </FormSection>
        ) : null}
      </div>
    </StepShell>
  )
}

function SellerCompletedState({ listing, form, brand, onDownloadDisclosure }) {
  const mandateTypeLabel = getMandateTypeLabel(form.mandateType)
  const mandatePeriodLabel = form.mandateStartDate || form.mandateEndDate
    ? `${formatDateValue(form.mandateStartDate)} to ${formatDateValue(form.mandateEndDate)}`
    : 'Not selected'
  const mandateConditionLabels = getSpecialMandateConditionLabels(form.specialMandateConditions)
  const sellerName = getSellerDisplayName(listing, form)
  const propertyAddress = getPropertyDisplayAddress(listing, form)
  const agentName = resolveAgentName(listing)
  const disclosureComplete = isPropertyDisclosureDigitallyComplete(form?.propertyDisclosure || {})
  const submittedAt = String(
    listing?.sellerOnboarding?.submittedAt ||
      listing?.sellerOnboarding?.submitted_at ||
      listing?.sellerOnboarding?.completedAt ||
      listing?.sellerOnboarding?.completed_at ||
      '',
  ).trim()
  const submittedDate = submittedAt ? new Date(submittedAt) : null
  const submittedLabel = submittedDate && !Number.isNaN(submittedDate.getTime())
    ? new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(submittedDate)
    : 'Just now'
  const journeyItems = [
    {
      label: 'Onboarding submitted',
      status: 'Complete',
      detail: submittedLabel,
      complete: true,
    },
    {
      label: 'Information under review',
      status: 'Next',
      detail: `${agentName} will review the seller and property details.`,
      complete: false,
    },
    {
      label: 'Mandate preparation',
      status: 'Upcoming',
      detail: 'Your agent prepares the mandate and sends the secure signing link.',
      complete: false,
    },
    {
      label: 'Agent follow-up',
      status: 'If needed',
      detail: `${agentName} will contact you if anything needs to be corrected or added.`,
      complete: false,
    },
  ]

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#d8e2ec] bg-white/95 shadow-[0_20px_44px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:rounded-[32px] lg:rounded-[36px] lg:shadow-[0_28px_60px_rgba(15,23,42,0.09)]">
      <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="bg-[#eefbf3] p-5 text-center sm:p-7 lg:p-8 lg:text-left">
          <div className="flex justify-center lg:justify-start">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1f7d44] text-white shadow-[0_18px_36px_rgba(31,125,68,0.24)]">
              <CheckCircle2 size={32} />
            </span>
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#1f7d44]">Seller onboarding</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[#14532d] sm:text-3xl">You're all set</h2>
          <p className="mt-2 text-sm font-semibold text-[#25603d]">Thank you, {sellerName}.</p>
          <p className="mx-auto mt-3 max-w-[420px] text-sm leading-6 text-[#25603d] lg:mx-0">
            Your seller information has been submitted. {agentName} will review the details and prepare the next mandate step.
          </p>

          <div className="mt-5 rounded-[20px] border border-[#cfe8da] bg-white/80 p-4 text-left">
            <div className="flex items-start gap-3">
              <AgencyMark brand={brand} tone="light" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#172334]">{brand?.name || 'Arch9'}</p>
                <p className="mt-1 text-sm leading-5 text-[#60748b]">{propertyAddress}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            {disclosureComplete ? (
              <button
                type="button"
                onClick={onDownloadDisclosure}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-[#b7dfc3] bg-white px-4 py-3 text-sm font-semibold text-[#14532d] shadow-[0_12px_24px_rgba(31,125,68,0.08)]"
              >
                <Download size={15} />
                Download Disclosure
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-7 lg:p-8">
          <div className="rounded-[22px] border border-[#dfe8f2] bg-[#fbfdff] p-4 sm:p-5">
            <p className="text-sm font-semibold text-[#172334]">What happens next</p>
            <div className="mt-4 space-y-3">
              {journeyItems.map((item) => (
                <div key={item.label} className="flex gap-3 rounded-[16px] border border-[#dfe8f2] bg-white p-3">
                  <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    item.complete ? 'bg-[#1f7d44] text-white' : 'bg-[#eef3f8] text-[#35546c]'
                  }`}>
                    {item.complete ? <CheckCircle2 size={17} /> : <Circle size={13} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#172334]">{item.label}</p>
                      <span className="rounded-full bg-[#f2f6fb] px-2 py-0.5 text-[11px] font-semibold text-[#35546c]">{item.status}</span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[#60748b]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dfe8f2] bg-white p-4 sm:p-5">
            <p className="text-sm font-semibold text-[#172334]">Submitted summary</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Seller', value: sellerName },
                { label: 'Property', value: propertyAddress },
                { label: 'Ownership', value: getOwnershipSummaryLabel(form) },
                { label: 'Mandate Type', value: mandateTypeLabel },
                { label: 'Mandate Period', value: mandatePeriodLabel },
                { label: 'Special Conditions', value: mandateConditionLabels.length ? mandateConditionLabels.join(', ') : 'None selected' },
                { label: 'Additional Conditions', value: form.additionalConditions || 'Not provided' },
                { label: 'Asking Price', value: form.askingPrice ? formatCurrency(form.askingPrice) : 'Not provided' },
                { label: 'Disclosure', value: disclosureComplete ? 'Signed' : 'Not signed' },
              ].map((item) => (
                <div key={item.label} className="rounded-[15px] border border-[#eef3f8] bg-[#fbfdff] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8a9ab0]">{item.label}</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#172334]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-[20px] border border-[#dfe8f2] bg-[#fbfdff] p-4 sm:rounded-[22px] sm:p-5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef3f8] text-[#35546c]">
              <ShieldCheck size={19} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#172334]">Need help?</p>
              <p className="mt-1 text-sm leading-5 text-[#6b7d93]">Contact {agentName} if anything looks incorrect or if you need help with the next step.</p>
            </div>
          </div>

          <Link to="/" className="inline-flex min-h-[50px] w-full items-center justify-center rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm font-semibold text-[#35546c] sm:w-auto">
            Return to Arch9
          </Link>
        </div>
      </div>
    </section>
  )
}

export function SellerOnboarding({ tokenOverride = '', embedded = false, onSubmitted = null }) {
  const params = useParams()
  const token = String(tokenOverride || params?.token || '').trim()
  const isDemoOnboarding = isSellerOnboardingDemoToken(token)
  const useDbFirstSellerOnboarding = Boolean(isSupabaseConfigured && !MOCK_DATA_ENABLED && !isDemoOnboarding)
  const [listing, setListing] = useState(null)
  const [form, setForm] = useState(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [mobilePaneIndex, setMobilePaneIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showWelcome, setShowWelcome] = useState(true)
  const [draftSyncStatus, setDraftSyncStatus] = useState('idle')
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState('')
  const [isOffline, setIsOffline] = useState(() => (
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  ))
  const draftAutosaveTimerRef = useRef(null)
  const lastDraftSignatureRef = useRef('')
  const saveDraftRef = useRef(null)

  useEffect(() => {
    let isMounted = true
    async function load() {
      if (!token) {
        setError('Invalid seller onboarding link.')
        setLoading(false)
        return
      }

      if (isDemoOnboarding) {
        const found = getDemoSellerOnboardingListing(token)
        const nextForm = normalizeFormData(found)
        lastDraftSignatureRef.current = buildSellerDraftSignature(nextForm, 0)
        setListing(found)
        setForm(nextForm)
        setCurrentStep(0)
        setLastDraftSavedAt(resolveDraftSavedAt(found))
        setDraftSyncStatus('saved')
        setShowWelcome(!embedded)
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
              ? FINAL_STEP_INDEX
              : Math.min(Math.max(persistedStep, 0), FINAL_STEP_INDEX)

          let nextListing = found
          if (onboardingStatus === SELLER_ONBOARDING_STATUS.NOT_STARTED) {
            const progressUpdate = await updateSellerOnboardingProgress(token, {
              status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
              currentStep: nextStep,
            })
            nextListing = progressUpdate?.listing || found
          }

          if (!isMounted) return
          const nextForm = normalizeFormData(nextListing)
          lastDraftSignatureRef.current = buildSellerDraftSignature(nextForm, nextStep)
          setListing(nextListing)
          setForm(nextForm)
          setCurrentStep(nextStep)
          setLastDraftSavedAt(resolveDraftSavedAt(nextListing))
          setDraftSyncStatus(resolveDraftSavedAt(nextListing) ? 'saved' : 'idle')
          setShowWelcome(!embedded && ![
            SELLER_ONBOARDING_STATUS.SUBMITTED,
            SELLER_ONBOARDING_STATUS.UNDER_REVIEW,
            SELLER_ONBOARDING_STATUS.COMPLETED,
          ].includes(onboardingStatus))
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
          ? FINAL_STEP_INDEX
          : Math.min(Math.max(persistedStep, 0), FINAL_STEP_INDEX)

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
      const nextForm = normalizeFormData(nextListing)
      lastDraftSignatureRef.current = buildSellerDraftSignature(nextForm, nextStep)
      setListing(nextListing)
      setForm(nextForm)
      setCurrentStep(nextStep)
      setLastDraftSavedAt(resolveDraftSavedAt(nextListing))
      setDraftSyncStatus(resolveDraftSavedAt(nextListing) ? 'saved' : 'idle')
      setShowWelcome(!embedded && ![
        SELLER_ONBOARDING_STATUS.SUBMITTED,
        SELLER_ONBOARDING_STATUS.UNDER_REVIEW,
        SELLER_ONBOARDING_STATUS.COMPLETED,
      ].includes(onboardingStatus))
      setLoading(false)
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [embedded, isDemoOnboarding, token, useDbFirstSellerOnboarding])

  useEffect(() => {
    return () => {
      if (draftAutosaveTimerRef.current) {
        window.clearTimeout(draftAutosaveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleOnlineStateChange = () => {
      const offline = typeof navigator !== 'undefined' ? navigator.onLine === false : false
      setIsOffline(offline)
      if (offline) {
        setDraftSyncStatus((previous) => (
          previous === 'pending' || previous === 'saving' || previous === 'error'
            ? 'offline'
            : previous
        ))
      }
    }

    handleOnlineStateChange()
    window.addEventListener('online', handleOnlineStateChange)
    window.addEventListener('offline', handleOnlineStateChange)
    return () => {
      window.removeEventListener('online', handleOnlineStateChange)
      window.removeEventListener('offline', handleOnlineStateChange)
    }
  }, [])

  const progress = useMemo(() => Math.round(((currentStep + 1) / STEPS.length) * 100), [currentStep])

  const statusLabel = useMemo(() => {
    const key = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase()
    return SELLER_STATUS_LABELS[key] || 'In Progress'
  }, [listing?.sellerOnboarding?.status])

  const isCompleted = String(listing?.sellerOnboarding?.status || '').trim().toLowerCase() === SELLER_ONBOARDING_STATUS.COMPLETED
  const flow = useMemo(() => getFlowContract(form || {}, listing || {}, getCanonicalSellerFacts(listing || {})), [form, listing])
  const propertyBranch = String(flow?.property_branch || form?.propertyBranch || '').trim() || 'residential'
  const propertyAddressDetails = useMemo(() => getPropertyAddressDetails(listing || {}, form || {}), [listing, form])
  const propertyTypeOptions = useMemo(
    () => getPropertyTypeOptionsByCategory(form?.propertyCategory || 'residential'),
    [form?.propertyCategory],
  )
  const propertyStructureOptions = useMemo(
    () => getPropertyStructureOptionsByCategory(form?.propertyCategory || 'residential'),
    [form?.propertyCategory],
  )
  const propertyTypeLabel = useMemo(() => getPropertyTypeLabel(form?.propertyType || propertyTypeOptions[0]?.value || ''), [form?.propertyType, propertyTypeOptions])
  const addressSuggestions = useMemo(() => {
    const suggestions = []
    const current = propertyAddressDetails
    const listingAddress = getPropertyAddressDetails(listing || {}, {})

    if (listingAddress.formatted && listingAddress.formatted !== current.formatted) {
      suggestions.push({
        key: 'listing',
        label: 'Use listing address',
        description: listingAddress.formatted,
        value: listingAddress,
      })
    }

    if (current.query) {
      const parsed = parsePropertyAddressQuery(current.query, current)
      if (parsed?.formatted && parsed.formatted !== current.formatted) {
        suggestions.push({
          key: 'parsed',
          label: 'Use typed address',
          description: parsed.formatted,
          value: parsed,
        })
      }
      if (current.query !== current.line1) {
        suggestions.push({
          key: 'query',
          label: 'Use search as line 1',
          description: current.query,
          value: {
            ...current,
            line1: current.query,
            formatted: formatPropertyAddress({ ...current, line1: current.query }),
          },
        })
      }
    }

    if (current.formatted) {
      suggestions.push({
        key: 'current',
        label: 'Current structured address',
        description: current.formatted,
        value: current,
      })
    }

    return suggestions.slice(0, 3)
  }, [listing, propertyAddressDetails])

  const agencyBrand = useMemo(() => resolveAgencyBrand(listing || {}), [listing])
  const bondComplianceSummary = useMemo(() => buildBondComplianceSummary(form || {}), [form])
  const tenantComplianceSummary = useMemo(() => buildTenantComplianceSummary(form || {}), [form])

  function buildCanonicalPayload(nextForm = form, options = {}) {
    if (!areCanonicalSellerFactsEnabled()) return {}
    return buildCanonicalSellerOnboardingPayload(nextForm || {}, listing || {}, {
      contextType: 'private_listing',
      contextId: listing?.id || '',
      listingId: listing?.id || '',
      source: options.source || 'seller_onboarding',
      draft: Boolean(options.draft),
    })
  }

  async function persistListingUpdate(updater, options = {}) {
    if (isDemoOnboarding) {
      const current = listing || getDemoSellerOnboardingListing(token)
      const candidate = updater({ ...current })
      setListing(candidate)
      if (options.refreshForm) {
        setForm(normalizeFormData(candidate))
      }
      return candidate
    }

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
    setForm((previous) => {
      const next = { ...(previous || {}), [key]: value }
      if (key === 'propertyCategory') {
        const propertyOptions = getPropertyTypeOptionsByCategory(value)
        if (!propertyOptions.some((option) => option.value === next.propertyType)) {
          next.propertyType = propertyOptions[0]?.value || next.propertyType || ''
        }
        const structureOptions = getPropertyStructureOptionsByCategory(value)
        if (!structureOptions.some((option) => option.value === next.propertyStructureType)) {
          next.propertyStructureType = structureOptions[0]?.value || next.propertyStructureType || ''
        }
        const nextStructureType = normalizePropertyStructureType(next.propertyStructureType, { fallback: '' })
        next.sectionalTitle = ['sectional_title', 'share_block'].includes(nextStructureType)
        next.shareBlock = nextStructureType === 'share_block'
        next.bodyCorporate = next.sectionalTitle
      }
      if (key === 'propertyStructureType') {
        const nextStructureType = normalizePropertyStructureType(value, { fallback: '' })
        next.sectionalTitle = ['sectional_title', 'share_block'].includes(nextStructureType)
        next.shareBlock = nextStructureType === 'share_block'
        next.bodyCorporate = next.sectionalTitle
      }
      if (key === 'estateOrHoa' && !value) {
        next.estateName = ''
        next.estateComplexName = ''
        next.hoaManagementCompany = ''
        next.hoaContactName = ''
        next.hoaContactEmail = ''
        next.hoaContactPhone = ''
        next.hoaRulesAvailable = false
      }
      if (key === 'leviesNotApplicable' && value) {
        next.levies = ''
      }
      if (
        key === 'propertyCategory' ||
        key === 'propertyType' ||
        key === 'propertyStructureType' ||
        key === 'estateName' ||
        key === 'estateComplexName' ||
        key === 'sectionalTitle' ||
        key === 'shareBlock' ||
        key === 'estateOrHoa' ||
        key === 'commercialProperty'
      ) {
        next.canonicalPropertyType = normalizeCanonicalPropertyType(next)
      }
      return next
    })
  }

  function handleTransferAttorneyDecision(decision) {
    setForm((previous) => {
      const current = normalizeSellerTransferAttorneyDecision(previous?.transferAttorneyDecision || {})
      return {
        ...(previous || {}),
        transferAttorneyDecision: normalizeSellerTransferAttorneyDecision({
          ...current,
          decision,
          selectionSource: null,
          selectedAttorney: decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn
            ? current.selectedAttorney
            : null,
          decidedBy: {
            name: [previous?.sellerFirstName, previous?.sellerSurname].filter(Boolean).join(' '),
            email: previous?.email || '',
          },
          decidedAt: new Date().toISOString(),
          consentCaptured: decision !== SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
          agentAssisted: false,
        }),
      }
    })
  }

  function handleNominatedTransferAttorneyUpdate(key, value) {
    setForm((previous) => {
      const current = normalizeSellerTransferAttorneyDecision(previous?.transferAttorneyDecision || {})
      return {
        ...(previous || {}),
        transferAttorneyDecision: normalizeSellerTransferAttorneyDecision({
          ...current,
          decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
          selectionSource: null,
          selectedAttorney: {
            ...(current.selectedAttorney || {}),
            [key]: value,
          },
          decidedBy: {
            name: [previous?.sellerFirstName, previous?.sellerSurname].filter(Boolean).join(' '),
            email: previous?.email || '',
          },
          decidedAt: current.decidedAt || new Date().toISOString(),
          consentCaptured: true,
          agentAssisted: false,
        }),
      }
    })
  }

  function handlePropertyAddressUpdate(partial = {}) {
    setForm((previous) => {
      const current = getPropertyAddressDetails(listing || {}, previous || {})
      const nextAddress = {
        ...createBlankPropertyAddress(),
        ...current,
        ...partial,
      }
      nextAddress.formatted = formatPropertyAddress(nextAddress)
      return {
        ...(previous || {}),
        propertyAddressDetails: nextAddress,
        propertyAddressSearch: nextAddress.query || '',
        propertyAddress: nextAddress.formatted || nextAddress.line1 || '',
        propertyAddressLine1: nextAddress.line1 || '',
        propertyAddressLine2: nextAddress.line2 || '',
        suburb: nextAddress.suburb || '',
        city: nextAddress.city || '',
        province: nextAddress.province || '',
        postalCode: nextAddress.postalCode || '',
        municipality: nextAddress.municipality || '',
        country: nextAddress.country || 'South Africa',
      }
    })
  }

  function handlePropertyAddressQueryChange(value) {
    handlePropertyAddressUpdate({ query: value })
  }

  function handlePropertyAddressSuggestionSelect(suggestion = {}) {
    handlePropertyAddressUpdate({
      ...suggestion,
      query: suggestion.query || suggestion.formatted || suggestion.line1 || '',
    })
  }

  function handlePropertyGoogleAddressChange(value = null) {
    handlePropertyAddressUpdate(mapGoogleAddressToPropertyAddress(value, propertyAddressDetails))
  }

  function handleSectionalIdentifierChange(value = '') {
    setForm((previous) => ({
      ...(previous || {}),
      sectionNumber: value,
      unitNumber: value,
    }))
  }

  function handlePropertyCategoryChange(value) {
    setForm((previous) => {
      const next = { ...(previous || {}), propertyCategory: value }
      const propertyOptions = getPropertyTypeOptionsByCategory(value)
      if (!propertyOptions.some((option) => option.value === next.propertyType)) {
        next.propertyType = propertyOptions[0]?.value || next.propertyType || ''
      }
      const structureOptions = getPropertyStructureOptionsByCategory(value)
      if (!structureOptions.some((option) => option.value === next.propertyStructureType)) {
        next.propertyStructureType = structureOptions[0]?.value || next.propertyStructureType || ''
      }
      const nextStructureType = normalizePropertyStructureType(next.propertyStructureType, { fallback: '' })
      next.sectionalTitle = ['sectional_title', 'share_block'].includes(nextStructureType)
      next.shareBlock = nextStructureType === 'share_block'
      next.bodyCorporate = next.sectionalTitle
      next.canonicalPropertyType = normalizeCanonicalPropertyType(next)
      return next
    })
  }

  function applyOwnershipSelection(next, value, metadata = {}) {
    const ownerEntityType = metadata.ownerEntityType || next.ownerEntityType || deriveOwnerEntityType(value, next)
    const ownerStructureType = metadata.ownerStructureType || next.ownerStructureType || deriveOwnerStructureType(value, ownerEntityType, next)
    const branch = getOwnershipBranch(value)
    next.ownershipType = value
    next.sellerLegalType = value
    next.ownerEntityType = ownerEntityType
    next.ownerStructureType = ownerStructureType
    next.foreignOwner = isForeignOwnerModel(ownerEntityType, ownerStructureType)
    next.maritalStatus = branch === 'married' ? 'married' : 'not_married'
    next.maritalRegime = value === 'married_cop' ? 'in_community' : value === 'married_anc' ? 'anc' : branch === 'married' ? (next.maritalRegime || 'unknown') : 'not_applicable'
    if (branch !== 'married') {
      next.spouseName = ''
      next.spouseIdNumber = ''
      next.spouseEmail = ''
      next.spousePhone = ''
      next.spouseInvolved = false
    }
    if (!['company', 'trust'].includes(branch)) {
      next.vatRegistered = false
      next.vatNumber = ''
    }
    if (branch === 'company' && !(next.companyDirectors || []).length) {
      next.companyDirectors = [createBlankPersonRecord('Director')]
    }
    if (branch === 'trust' && !(next.trustees || []).length) {
      next.trustees = [createBlankPersonRecord('Trustee')]
    }
    if (branch === 'deceased_estate' && !(next.executors || []).length) {
      next.executors = [createBlankPersonRecord('Executor')]
    }
    if (branch === 'power_of_attorney' && !(next.powerOfAttorneyRepresentatives || []).length) {
      next.powerOfAttorneyRepresentatives = [createBlankPersonRecord('Representative')]
    }
    if (branch === 'multiple_owners' && (next.multipleOwners || []).length < 2) {
      const currentOwners = Array.isArray(next.multipleOwners) ? next.multipleOwners : []
      next.multipleOwners = currentOwners.length
        ? [...currentOwners, createBlankPersonRecord('Owner', currentOwners.length)]
        : [createBlankPersonRecord('Owner'), createBlankPersonRecord('Owner', 1)]
    }
    return next
  }

  function handleOwnerEntityTypeChange(value) {
    setForm((previous) => {
      const next = { ...(previous || {}) }
      const ownerStructureType = normalizeOwnerStructureType('', value)
      const ownershipType = deriveOwnershipTypeFromOwnerModel(value, ownerStructureType)
      return applyOwnershipSelection(next, ownershipType, { ownerEntityType: value, ownerStructureType })
    })
  }

  function handleOwnerStructureTypeChange(value) {
    setForm((previous) => {
      const next = { ...(previous || {}) }
      const ownerEntityType = next.ownerEntityType || deriveOwnerEntityType(next.ownershipType, next)
      const ownerStructureType = normalizeOwnerStructureType(value, ownerEntityType)
      const ownershipType = deriveOwnershipTypeFromOwnerModel(ownerEntityType, ownerStructureType)
      return applyOwnershipSelection(next, ownershipType, { ownerEntityType, ownerStructureType })
    })
  }

  function handleMultipleOwnerCaptureModeChange(value) {
    setForm((previous) => ({
      ...(previous || {}),
      multipleOwnerCaptureMode: value,
    }))
  }

  function handleFeatureToggle(featureKey) {
    setForm((previous) => {
      const prev = previous || {}
      const current = Array.isArray(prev.features) ? prev.features : []
      const feature = PROPERTY_FEATURES.find((item) => item.key === featureKey)
      const active = current.includes(featureKey) || Boolean(feature?.formKey && prev[feature.formKey])
      const nextFeatures = active ? current.filter((item) => item !== featureKey) : [...current, featureKey]
      const next = { ...prev, features: nextFeatures }
      if (feature?.formKey) {
        next[feature.formKey] = !active
      }
      if (featureKey === 'gas_geyser') {
        next.gasInstallation = !active
      }
      if (featureKey === 'borehole') {
        next.borehole = !active
      }
      if (featureKey === 'solar') {
        next.solarInstallation = !active
      }
      return next
    })
  }

  function patchPropertyDisclosure(patchOrKey = {}, value = undefined) {
    setForm((previous) => {
      const current = normalizePropertyDisclosure(previous?.propertyDisclosure || {}, {
        kind: propertyBranch === 'commercial' || propertyBranch === 'mixed_use' ? 'commercial' : 'residential',
      })
      const patch = typeof patchOrKey === 'string' ? { [patchOrKey]: value } : patchOrKey
      if (patch.declarationAccepted === true) {
        if (!patch.signedAt && !current.signedAt) patch.signedAt = todayInputValue()
      }
      const next = normalizePropertyDisclosure({ ...current, ...patch }, { kind: current.kind })
      return {
        ...(previous || {}),
        propertyDisclosure: next,
        propertyDisclosureStatus: getPropertyDisclosureStatus(next),
      }
    })
  }

  function handleDisclosureAnswerChange(questionKey, answer) {
    setForm((previous) => {
      const current = normalizePropertyDisclosure(previous?.propertyDisclosure || {}, {
        kind: propertyBranch === 'commercial' || propertyBranch === 'mixed_use' ? 'commercial' : 'residential',
      })
      const next = normalizePropertyDisclosure({
        ...current,
        responses: {
          ...(current.responses || {}),
          [questionKey]: {
            ...(current.responses?.[questionKey] || {}),
            answer,
          },
        },
      }, { kind: current.kind })
      return {
        ...(previous || {}),
        propertyDisclosure: next,
        propertyDisclosureStatus: getPropertyDisclosureStatus(next),
      }
    })
  }

  async function handleDownloadDisclosurePdf() {
    if (!form?.propertyDisclosure) return
    let pdfStage = null
    let styleElement = null
    try {
      setError('')
      const normalizedDisclosure = normalizePropertyDisclosure(form.propertyDisclosure || {}, {
        kind: propertyBranch === 'commercial' || propertyBranch === 'mixed_use' ? 'commercial' : 'residential',
      })
      if (!isPropertyDisclosureDigitallyComplete(normalizedDisclosure)) {
        setError('Complete and sign the disclosure before downloading it.')
        return
      }
      const { default: html2pdf } = await import('html2pdf.js/src/index.js')
      const agencyBrand = resolveAgencyBrand(listing)
      const propertyAddress = getPropertyDisplayAddress(listing, form)
      const markup = buildPropertyDisclosureDocumentMarkup(normalizedDisclosure, {
        sellerName: getSellerDisplayName(listing, form),
        sellerIdNumber: form.idNumber || form.foreignPassportNumber || form.passportNumber || '',
        propertyAddress,
        listingId: String(listing?.id || '').trim(),
        documentReference: String(
          listing?.listingReference ||
            listing?.listing_reference ||
            listing?.reference ||
            listing?.privateListingReference ||
            listing?.private_listing_reference ||
            listing?.id ||
            propertyAddress ||
            '',
        ).trim(),
        assetBaseUrl: window.location.origin,
        branding: {
          ...(listing?.branding || {}),
          organisationName: agencyBrand.name,
          agencyName: agencyBrand.name,
          logoUrl: agencyBrand.logoUrl,
          logoDarkUrl: agencyBrand.logoDarkUrl,
          logoLightUrl: agencyBrand.logoLightUrl,
        },
      })
      const pdfDocument = new window.DOMParser().parseFromString(markup, 'text/html')
      const documentBody = pdfDocument.body
      const style = pdfDocument.head.querySelector('style')
      styleElement = document.createElement('style')
      styleElement.setAttribute('data-seller-disclosure-pdf-style', 'true')
      styleElement.textContent = style?.textContent || ''
      pdfStage = document.createElement('div')
      pdfStage.setAttribute('data-seller-disclosure-pdf-stage', 'true')
      pdfStage.style.position = 'fixed'
      pdfStage.style.left = '-10000px'
      pdfStage.style.top = '0'
      pdfStage.style.width = '210mm'
      pdfStage.style.background = '#ffffff'
      pdfStage.style.pointerEvents = 'none'
      pdfStage.innerHTML = documentBody.innerHTML
      document.head.appendChild(styleElement)
      document.body.appendChild(pdfStage)
      const imageLoads = Array.from(pdfStage.querySelectorAll('img')).map((image) => {
        if (image.complete) return Promise.resolve()
        return new Promise((resolve) => {
          image.onload = resolve
          image.onerror = resolve
        })
      })
      await Promise.all(imageLoads)
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      const exportTarget = pdfStage.querySelector('.property-disclosure-document') || pdfStage
      await html2pdf()
        .set({
          margin: 0,
          filename: 'seller-disclosure-annexure-a.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: 794,
            windowHeight: 1123,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(exportTarget)
        .save()
    } catch (downloadError) {
      setError(downloadError?.message || 'Unable to download the disclosure PDF right now.')
    } finally {
      pdfStage?.remove()
      styleElement?.remove()
    }
  }

  function updateCollectionItem(collectionKey, itemId, key, value) {
    setForm((previous) => ({
      ...(previous || {}),
      [collectionKey]: (previous?.[collectionKey] || []).map((item) =>
        item.id === itemId ? { ...item, [key]: value } : item,
      ),
    }))
  }

  function addCollectionItem(collectionKey, roleTitle) {
    setForm((previous) => {
      const current = previous?.[collectionKey] || []
      return {
        ...(previous || {}),
        [collectionKey]: [...current, createBlankPersonRecord(roleTitle, current.length)],
      }
    })
  }

  function removeCollectionItem(collectionKey, itemId, minCount = 1) {
    setForm((previous) => {
      const current = previous?.[collectionKey] || []
      if (current.length <= minCount) return previous
      return {
        ...(previous || {}),
        [collectionKey]: current.filter((item) => item.id !== itemId),
      }
    })
  }

  function updateMultipleOwner(ownerId, key, value) {
    updateCollectionItem('multipleOwners', ownerId, key, value)
  }

  function addMultipleOwner() {
    addCollectionItem('multipleOwners', 'Owner')
  }

  function removeMultipleOwner(ownerId) {
    removeCollectionItem('multipleOwners', ownerId, 2)
  }

  function updateCompanyDirector(directorId, key, value) {
    updateCollectionItem('companyDirectors', directorId, key, value)
  }

  function addCompanyDirector() {
    addCollectionItem('companyDirectors', 'Director')
  }

  function removeCompanyDirector(directorId) {
    removeCollectionItem('companyDirectors', directorId)
  }

  function updateTrustee(trusteeId, key, value) {
    updateCollectionItem('trustees', trusteeId, key, value)
  }

  function addTrustee() {
    addCollectionItem('trustees', 'Trustee')
  }

  function removeTrustee(trusteeId) {
    removeCollectionItem('trustees', trusteeId)
  }

  async function saveDraft(nextStep = currentStep, options = {}) {
    if (!form) return false
    const silent = Boolean(options.silent)
    const signature = options.signature || buildSellerDraftSignature(form, nextStep)
    const savedAt = new Date().toISOString()
    const offlineBlocksRemoteSave = useDbFirstSellerOnboarding && (
      isOffline ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)
    )

    if (offlineBlocksRemoteSave) {
      setDraftSyncStatus('offline')
      if (!silent) {
        setError('You appear to be offline. Keep this page open; we will save your draft when the connection returns.')
        scrollSellerOnboardingToTop({ focusAlert: true })
      }
      return false
    }

    if (!silent) {
      setSaving(true)
      setError('')
    }
    setDraftSyncStatus('saving')

    try {
      const canonicalPayload = buildCanonicalPayload({ ...(form || {}), currentStep: nextStep }, {
        draft: true,
        source: 'seller_onboarding_draft',
      })
      const draftFormData = { ...(form || {}), currentStep: nextStep, ...canonicalPayload }
      const updated = await persistListingUpdate((row) => ({
        ...row,
        sellerOnboarding: {
          ...(row?.sellerOnboarding || {}),
          status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
          currentStep: nextStep,
          formData: draftFormData,
          updatedAt: savedAt,
        },
      }))

      if (!updated) {
        throw new Error('Unable to save draft right now.')
      }

      lastDraftSignatureRef.current = signature
      setLastDraftSavedAt(savedAt)
      setDraftSyncStatus('saved')

      if (!silent) {
        setSuccess('Draft saved.')
        setTimeout(() => setSuccess(''), 1200)
      }
      return true
    } catch (draftError) {
      console.error('[Seller Onboarding] draft save failed', draftError)
      setDraftSyncStatus('error')
      if (!silent) {
        setError(draftError?.message || 'Unable to save draft right now. Please try again.')
        scrollSellerOnboardingToTop({ focusAlert: true })
      }
      return false
    } finally {
      if (!silent) setSaving(false)
    }
  }

  useEffect(() => {
    saveDraftRef.current = saveDraft
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (
      loading ||
      !form ||
      !listing ||
      isCompleted ||
      submitting ||
      saving ||
      (!embedded && showWelcome)
    ) {
      return undefined
    }

    const signature = buildSellerDraftSignature(form, currentStep)
    if (!signature || signature === lastDraftSignatureRef.current) {
      return undefined
    }

    if (useDbFirstSellerOnboarding && isOffline) {
      const offlineStatusTimer = window.setTimeout(() => {
        setDraftSyncStatus('offline')
      }, 0)
      return () => window.clearTimeout(offlineStatusTimer)
    }

    const pendingStatusTimer = window.setTimeout(() => {
      setDraftSyncStatus((previous) => (previous === 'saving' ? previous : 'pending'))
    }, 0)
    draftAutosaveTimerRef.current = window.setTimeout(() => {
      void saveDraftRef.current?.(currentStep, { silent: true, signature })
    }, 1600)

    return () => {
      window.clearTimeout(pendingStatusTimer)
      if (draftAutosaveTimerRef.current) {
        window.clearTimeout(draftAutosaveTimerRef.current)
        draftAutosaveTimerRef.current = null
      }
    }
  }, [currentStep, embedded, form, isCompleted, isOffline, listing, loading, saving, showWelcome, submitting, useDbFirstSellerOnboarding])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!form || !listing || isCompleted || submitting) return undefined

    const currentSignature = buildSellerDraftSignature(form, currentStep)
    const hasUnsavedDraft =
      Boolean(currentSignature && currentSignature !== lastDraftSignatureRef.current) ||
      ['pending', 'saving', 'error', 'offline'].includes(draftSyncStatus)

    if (!hasUnsavedDraft) return undefined

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [currentStep, draftSyncStatus, form, isCompleted, listing, submitting])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
    if (!form || !listing || isCompleted || submitting || saving) return undefined

    const flushPendingDraft = () => {
      if (document.visibilityState && document.visibilityState !== 'hidden') return
      const signature = buildSellerDraftSignature(form, currentStep)
      if (!signature || signature === lastDraftSignatureRef.current) return

      if (draftAutosaveTimerRef.current) {
        window.clearTimeout(draftAutosaveTimerRef.current)
        draftAutosaveTimerRef.current = null
      }

      if (useDbFirstSellerOnboarding && (isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false))) {
        setDraftSyncStatus('offline')
        return
      }

      void saveDraftRef.current?.(currentStep, { silent: true, signature })
    }

    document.addEventListener('visibilitychange', flushPendingDraft)
    window.addEventListener('pagehide', flushPendingDraft)
    return () => {
      document.removeEventListener('visibilitychange', flushPendingDraft)
      window.removeEventListener('pagehide', flushPendingDraft)
    }
  }, [currentStep, form, isCompleted, isOffline, listing, saving, submitting, useDbFirstSellerOnboarding])

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
      if (!form.ownerEntityType) return 'Please select the owner type.'
      if (!form.ownerStructureType) return 'Please define the owner structure.'
      const ownershipBranch = getOwnershipBranch(ownershipType)
      const isForeignOwner = isForeignOwnerModel(form.ownerEntityType, form.ownerStructureType)
      const multipleOwnerCaptureMode = form.multipleOwnerCaptureMode || 'capture_now'
      const companyDirectors = Array.isArray(form.companyDirectors) ? form.companyDirectors : []
      const trustTrustees = Array.isArray(form.trustees) ? form.trustees : []
      const multipleOwners = Array.isArray(form.multipleOwners) ? form.multipleOwners : []

      if (isForeignOwner && !form.foreignOwnerCountry) {
        return 'Please provide the foreign country or jurisdiction.'
      }

      if (ownershipBranch === 'individual' || ownershipBranch === 'married') {
        if (!form.idNumber) {
          return 'Please provide ID number / passport details.'
        }
      }

      if (ownershipBranch === 'married' && (!form.spouseName || !form.spouseIdNumber)) {
        return 'Spouse name and spouse ID number are required for married ownership.'
      }

      if (ownershipBranch === 'company') {
        if (!form.companyName || !form.companyRegistrationNumber || !form.companyRegisteredAddress) {
          return 'Company name, registration number, and registered address are required.'
        }
        if (!companyDirectors.length || companyDirectors.some((director) => !director.name || !director.surname)) {
          return 'Please add at least one company director with a name and surname.'
        }
        if (!form.authorisedSignatoryName) {
          return 'Primary authorised signatory details are required for a company seller.'
        }
      }

      if (ownershipBranch === 'trust') {
        if (!form.trustName || !form.trustRegistrationNumber || !form.trustRegisteredAddress) {
          return 'Trust name, registration number, and registered address are required.'
        }
        if (!trustTrustees.length || trustTrustees.some((trustee) => !trustee.name || !trustee.surname)) {
          return 'Please add at least one trustee with a name and surname.'
        }
        if (!form.authorisedTrusteeName) {
          return 'Primary trustee details are required for a trust seller.'
        }
      }

      if (ownershipBranch === 'deceased_estate') {
        if (!form.executorName) {
          return 'Executor details are required for a deceased estate seller.'
        }
        if (!form.estateReference) {
          return 'Estate reference is required for a deceased estate seller.'
        }
        if (!form.executorAuthorityDetails) {
          return 'Authority details are required for a deceased estate seller.'
        }
      }

      if (ownershipBranch === 'power_of_attorney') {
        if (!form.powerOfAttorneyName) {
          return 'Representative details are required for a power of attorney seller.'
        }
        if (!form.powerOfAttorneyPrincipalName || !form.powerOfAttorneyPrincipalIdNumber) {
          return 'Principal name and ID number are required for a power of attorney seller.'
        }
        if (!form.powerOfAttorneyAuthorityDetails) {
          return 'Authority details are required for a power of attorney seller.'
        }
      }

      if (ownershipBranch === 'multiple_owners') {
        if (multipleOwners.length < 2) {
          return 'Please add at least two owners.'
        }
        if (multipleOwnerCaptureMode === 'send_onboarding') {
          const incompleteOwner = multipleOwners.find((owner) => !owner.name || !owner.surname || !owner.email)
          if (incompleteOwner) {
            return 'Each owner needs a name, surname, and email address before onboarding links can be sent.'
          }
        } else {
          const incompleteOwner = multipleOwners.find((owner) => !owner.name || !owner.surname || !owner.idNumber || !owner.consentToSell)
          if (incompleteOwner) {
            return 'Each owner needs a name, surname, ID/passport number, and consent to sell.'
          }
        }
      }

      if (!form.mandateType) {
        return 'Please select the mandate type for this sale.'
      }
      if (!form.mandateStartDate) {
        return 'Please select the mandate start date.'
      }
      if (!form.mandateEndDate) {
        return 'Please select the mandate end date.'
      }
      const mandateStart = new Date(`${form.mandateStartDate}T00:00:00`)
      const mandateEnd = new Date(`${form.mandateEndDate}T00:00:00`)
      if (Number.isNaN(mandateStart.getTime()) || Number.isNaN(mandateEnd.getTime()) || mandateEnd <= mandateStart) {
        return 'Mandate end date must be after the start date.'
      }
      const transferAttorneyValidation = validateSellerTransferAttorneyDecision(form.transferAttorneyDecision, {
        requireDecision: true,
      })
      if (!transferAttorneyValidation.valid) {
        return transferAttorneyValidation.errors[0]
      }
      if (
        transferAttorneyValidation.value.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn &&
        !transferAttorneyValidation.value.selectedAttorney.companyName
      ) {
        return 'Please provide the name of your nominated transferring attorney firm.'
      }
      if (
        transferAttorneyValidation.value.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn &&
        !transferAttorneyValidation.value.selectedAttorney.email &&
        !transferAttorneyValidation.value.selectedAttorney.phone
      ) {
        return 'Please provide an email address or phone number for your nominated transferring attorney.'
      }
    }

    if (currentStep === 1) {
      const address = getPropertyAddressDetails(listing || {}, form || {})

      if (!form.propertyCategory || !form.propertyType || !form.propertyStructureType) {
        return 'Property category, property type, and structure type are required.'
      }
      if (!address.line1 || !address.suburb || !address.city || !address.province) {
        return 'Please complete the property address, suburb, city, and province.'
      }
      const sectionalIdentifier = form.sectionNumber || form.unitNumber
      if ((propertyBranch === 'sectional_title') && (!form.schemeName || !sectionalIdentifier || !form.schemeManagingAgentName)) {
        return 'Scheme name, unit / section number, and managing agent details are required for sectional title properties.'
      }
      if (showEstateDetails && (!form.estateName || (!form.hoaManagementCompany && !form.hoaContactName))) {
        return 'Estate / HOA name and managing agent details are required for estate properties.'
      }
      if ((propertyBranch === 'commercial' || propertyBranch === 'mixed_use') && !form.commercialUseDescription) {
        return 'Please describe the commercial or mixed-use operating context.'
      }
      if ((propertyBranch === 'commercial' || propertyBranch === 'mixed_use') && !form.floorSize) {
        return 'Floor size is required for commercial and mixed-use properties.'
      }
      if ((propertyBranch === 'agricultural' || propertyBranch === 'vacant_land') && !form.erfSize) {
        return 'Land size is required for vacant land and agricultural properties.'
      }
      if (!form.ratesTaxes) {
        return 'Rates and taxes are required for the property.'
      }
      if (!form.leviesNotApplicable && !form.levies) {
        return 'Please enter the levy amount, or tick that levies are not applicable.'
      }
      if (!form.waterBillingType) {
        return 'Please select the water billing type.'
      }
      if (form.existingBond && !form.bondBank) {
        return 'Bond bank is required when there is an existing bond.'
      }
      if (form.occupancyStatus === 'tenant_occupied' && form.leaseExists && !form.leaseExpiryDate) {
        return 'Lease expiry date is required when a lease exists.'
      }
    }

    if (currentStep === 2) {
      const missingDisclosureItems = getPropertyDisclosureMissingItems(form.propertyDisclosure || {})
      if (missingDisclosureItems.length) {
        return `Please complete the Property Disclosure declaration before continuing: ${missingDisclosureItems.join(', ')}.`
      }
    }

    return ''
  }

  async function handleNext() {
    setError('')
    const validationError = validateCurrentStep()
    if (validationError) {
      setError(validationError)
      scrollSellerOnboardingToTop({ focusAlert: true })
      return
    }
    const nextStep = Math.min(currentStep + 1, STEPS.length - 1)
    const saved = await saveDraft(nextStep)
    if (!saved) return
    setMobilePaneIndex(0)
    setCurrentStep(nextStep)
    scrollSellerOnboardingToTop()
  }

  async function handleBack() {
    setError('')
    const nextStep = Math.max(currentStep - 1, 0)
    const saved = await saveDraft(nextStep)
    if (!saved) return
    setMobilePaneIndex(0)
    setCurrentStep(nextStep)
    scrollSellerOnboardingToTop()
  }

  function handleMobilePaneBack() {
    setError('')
    if (activeMobilePaneIndex > 0) {
      setMobilePaneIndex(activeMobilePaneIndex - 1)
      scrollSellerOnboardingToTop()
      return
    }
    void handleBack()
  }

  function handleMobilePaneNext() {
    setError('')
    if (hasNextMobilePane) {
      setMobilePaneIndex(activeMobilePaneIndex + 1)
      scrollSellerOnboardingToTop()
      return
    }
    void handleNext()
  }

  async function handleSubmit() {
    if (!form || submitting) return
    setError('')
    setSuccess('')
    const finalRequiredMissing = [
      ...sellerMissing.map((item) => `Seller: ${item}`),
      ...propertyMissing.map((item) => `Property: ${item}`),
      ...transferAttorneyMissing.map((item) => `Transferring attorney: ${item}`),
      ...getPropertyDisclosureMissingItems(form.propertyDisclosure || {}).map((item) => `Disclosure: ${item}`),
    ]
    if (finalRequiredMissing.length) {
      setError(`Please finish the required items before submitting: ${finalRequiredMissing.join(', ')}.`)
      scrollSellerOnboardingToTop({ focusAlert: true })
      return
    }

    const startedAt = getRuntimeTimestampMs()
    setSubmitting(true)

    try {
      const disclosureDocument = buildPropertyDisclosureDocument(form.propertyDisclosure || {}, {
        sellerId: String(listing?.seller?.id || listing?.sellerId || '').trim(),
        propertyId: String(listing?.propertyId || listing?.property_id || '').trim(),
        listingId: String(listing?.id || '').trim(),
        transactionId: String(listing?.transactionId || listing?.transaction_id || '').trim(),
      })
      const finalForm = {
        ...(form || {}),
        transferAttorneyDecision: normalizeSellerTransferAttorneyDecision(form.transferAttorneyDecision || {}),
        propertyDisclosure: {
          ...(form.propertyDisclosure || {}),
          generatedDocument: disclosureDocument,
        },
        propertyDisclosureStatus: getPropertyDisclosureStatus(form.propertyDisclosure || {}),
        currentStep: FINAL_STEP_INDEX,
      }
      const canonicalPayload = buildCanonicalPayload(finalForm, {
        draft: false,
        source: 'seller_onboarding_submit',
      })
      if (canonicalPayload.canonicalSellerFacts) {
        const factValidation = validateSellerOnboardingFacts(canonicalPayload.canonicalSellerFacts, { draft: false })
        if (!factValidation.ok) {
          throw new Error(factValidation.required[0]?.message || 'Please complete the required seller onboarding facts before submitting.')
        }
      }
      const submitFormData = { ...finalForm, ...canonicalPayload }
      let updated = null
      if (useDbFirstSellerOnboarding) {
        const submitted = await submitSellerOnboarding(token, {
          status: 'completed',
          formData: submitFormData,
          sellerType: String(form?.ownerEntityType || form?.ownershipType || '').trim().toLowerCase() || null,
          ownershipStructure: String(form?.ownerStructureType || form?.ownershipType || '').trim().toLowerCase() || null,
          maritalRegime: String(form?.ownershipType || '').trim().toLowerCase().includes('married')
            ? String(form?.ownershipType || '').trim().toLowerCase()
            : null,
          skipPortalNotification: true,
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
            currentStep: FINAL_STEP_INDEX,
            formData: submitFormData,
          },
        }))
      }

      if (!updated) {
        throw new Error('Unable to submit onboarding right now.')
      }

      if (!useDbFirstSellerOnboarding && !isDemoOnboarding) {
        createListingDraftFromSellerLead(updated, { stage: LISTING_STATUS.SELLER_ONBOARDING_COMPLETED })
      }

      setListing(updated)
      setCurrentStep(FINAL_STEP_INDEX)
      setSuccess('Your property details have been submitted.\nYour agent will review the details and prepare the next mandate step.')
      scrollSellerOnboardingToTop()
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
        window.dispatchEvent(new Event('itg:listings-updated'))
        window.dispatchEvent(new Event('itg:pipeline-updated'))
      }
      if (typeof onSubmitted === 'function') {
        try {
          onSubmitted(updated)
        } catch (callbackError) {
          console.error('[Seller Onboarding] submitted callback failed', callbackError)
        }
      }
      void notifySellerOnboardingSubmitted(updated, form)
      console.debug('[Seller Onboarding] submit completed', {
        durationMs: Math.round(getRuntimeTimestampMs() - startedAt),
        mode: useDbFirstSellerOnboarding ? 'supabase' : 'local',
      })
    } catch (submitError) {
      console.error('[Seller Onboarding] submit failed', submitError)
      setError(resolveSellerOnboardingSubmitError(submitError))
      scrollSellerOnboardingToTop({ focusAlert: true })
    } finally {
      setSubmitting(false)
    }
  }

  function handleWelcomeContinue() {
    setShowWelcome(false)
    setMobilePaneIndex(0)
    scrollSellerOnboardingToTop()
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

  const ownershipBranch = getOwnershipBranch(form.ownershipType)
  const ownerEntityType = form.ownerEntityType || deriveOwnerEntityType(form.ownershipType, form)
  const ownerStructureType = form.ownerStructureType || deriveOwnerStructureType(form.ownershipType, ownerEntityType, form)
  const ownerStructureOptions = OWNER_STRUCTURE_TYPES_BY_ENTITY[ownerEntityType] || OWNER_STRUCTURE_TYPES_BY_ENTITY.natural_person
  const isForeignOwner = isForeignOwnerModel(ownerEntityType, ownerStructureType)
  const ownershipFieldLabels = getOwnershipFieldLabels(form.ownershipType)
  const isMarriedOwnership = ownershipBranch === 'married'
  const isCompanyOwnership = ownershipBranch === 'company'
  const isTrustOwnership = ownershipBranch === 'trust'
  const isDeceasedEstateOwnership = ownershipBranch === 'deceased_estate'
  const isPowerOfAttorneyOwnership = ownershipBranch === 'power_of_attorney'
  const isMultipleOwners = ownershipBranch === 'multiple_owners'
  const multipleOwnerCaptureMode = form.multipleOwnerCaptureMode || 'capture_now'
  const isMultipleOwnerInviteMode = isMultipleOwners && multipleOwnerCaptureMode === 'send_onboarding'
  const showVatFields = ['company', 'trust'].includes(ownershipBranch)
  const showSectionalTitleDetails = propertyBranch === 'sectional_title'
  const hasEstateSignals = Boolean(form.estateOrHoa || form.estateName || form.estateComplexName)
  const showEstateDetails = propertyBranch === 'estate_hoa' || hasEstateSignals
  const showCommercialDetails = propertyBranch === 'commercial' || propertyBranch === 'mixed_use'
  const showLandDetails = propertyBranch === 'vacant_land' || propertyBranch === 'agricultural'
  const showResidentialDetails = !showCommercialDetails && !showLandDetails
  const sellerPaneIndexes = {
    ownership: 0,
    identity: 1,
    mandatePreferences: 2,
    transferringAttorney: 3,
    sellingContext: 4,
  }
  const propertyPaneIndexes = (() => {
    let paneIndex = 0
    const indexes = {
      category: paneIndex++,
      type: paneIndex++,
      address: paneIndex++,
      features: paneIndex++,
      sectional: -1,
      estate: -1,
      commercial: -1,
      residential: -1,
      land: -1,
      valuation: -1,
      documents: -1,
      occupancy: -1,
    }
    if (showSectionalTitleDetails) indexes.sectional = paneIndex++
    if (showEstateDetails) indexes.estate = paneIndex++
    if (showCommercialDetails) indexes.commercial = paneIndex++
    if (showResidentialDetails) indexes.residential = paneIndex++
    if (showLandDetails) indexes.land = paneIndex++
    indexes.valuation = paneIndex++
    indexes.documents = paneIndex++
    indexes.occupancy = paneIndex++
    indexes.count = paneIndex
    return indexes
  })()
  const mobilePaneCount = (() => {
    if (currentStep === 0) return sellerPaneIndexes.sellingContext + 1
    if (currentStep === 1) return propertyPaneIndexes.count
    if (currentStep === 2) {
      const disclosureAnswered = getPropertyDisclosureAnswerSummary(form.propertyDisclosure || {}).answered
      return 1 + getDisclosureQuestionPaneCount() + 1 + (disclosureAnswered ? 1 : 0)
    }
    return 1
  })()
  const activeMobilePaneIndex = Math.min(Math.max(mobilePaneIndex, 0), Math.max(mobilePaneCount - 1, 0))
  const hasNextMobilePane = activeMobilePaneIndex < mobilePaneCount - 1
  const companyDirectors = Array.isArray(form.companyDirectors) ? form.companyDirectors : []
  const trustTrustees = Array.isArray(form.trustees) ? form.trustees : []
  const multipleOwners = Array.isArray(form.multipleOwners) ? form.multipleOwners : []
  const sellerIdentityCopy = {
    individual: {
      title: 'Personal details',
      description: 'Capture the seller details that will be used for the mandate and sale file.',
    },
    married: {
      title: 'Personal details',
      description: 'Capture the seller details and spouse information needed for a married seller.',
    },
    company: {
      title: 'Contact and company authority',
      description: 'Capture the primary contact, the company, and the people who can sign.',
    },
    trust: {
      title: 'Contact and trust authority',
      description: 'Capture the primary contact, the trust, and the trustees who can act.',
    },
    deceased_estate: {
      title: 'Estate authority',
      description: 'Capture the executor and the estate authority details.',
    },
    power_of_attorney: {
      title: 'Authority details',
      description: 'Capture the acting representative, principal, and authority reference.',
    },
    multiple_owners: {
      title: 'Owner details',
      description: 'Capture every owner, their share, and their consent to sell.',
    },
    other: {
      title: 'Seller details',
      description: 'Capture the details needed for this ownership structure.',
    },
  }[ownershipBranch] || {
    title: 'Seller details',
    description: 'Capture the details needed for this ownership structure.',
  }
  const selectedSpecialMandateConditionLabels = getSpecialMandateConditionLabels(form.specialMandateConditions)
  const mandateStartDateValue = form.mandateStartDate ? new Date(`${form.mandateStartDate}T00:00:00`) : null
  const mandateEndDateValue = form.mandateEndDate ? new Date(`${form.mandateEndDate}T00:00:00`) : null
  const mandateDatesInvalid = Boolean(
    mandateStartDateValue &&
      mandateEndDateValue &&
      (!Number.isFinite(mandateStartDateValue.getTime()) || !Number.isFinite(mandateEndDateValue.getTime()) || mandateEndDateValue <= mandateStartDateValue),
  )
  const transferAttorneyDecision = normalizeSellerTransferAttorneyDecision(form.transferAttorneyDecision || {})
  const hasRecommendedTransferAttorney =
    transferAttorneyDecision.recommendationStatus === SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended
  const transferAttorneyValidation = validateSellerTransferAttorneyDecision(transferAttorneyDecision, {
    requireDecision: true,
  })
  const transferAttorneyMissing = [
    ...transferAttorneyValidation.errors,
    transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn &&
      !transferAttorneyDecision.selectedAttorney.companyName &&
      'Nominated attorney firm name',
    transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn &&
      !transferAttorneyDecision.selectedAttorney.email &&
      !transferAttorneyDecision.selectedAttorney.phone &&
      'Nominated attorney contact details',
  ].filter(Boolean)
  const transferAttorneyDisplay = transferAttorneyDecision.selectedAttorney.companyName ||
    transferAttorneyDecision.recommendedAttorney.companyName ||
    'Not selected'
  const sellerMissing = [
    !form.sellerFirstName && 'Seller name',
    !form.sellerSurname && 'Seller surname',
    !form.email && 'Email',
    !form.phone && 'Phone',
  ].filter(Boolean)
  const mandateMissing = [
    !form.mandateType && 'Mandate type',
    !form.mandateStartDate && 'Start date',
    !form.mandateEndDate && 'End date',
    mandateDatesInvalid && 'End date must be after start date',
  ].filter(Boolean)
  const propertyMissing = [
    !propertyAddressDetails.line1 && 'Property address',
    !propertyAddressDetails.suburb && 'Suburb',
    !propertyAddressDetails.city && 'City',
    !propertyAddressDetails.province && 'Province',
  ].filter(Boolean)
  const sectionSummaryValue = [form.schemeName, form.sectionNumber || form.unitNumber].filter(Boolean).join(' / ')
  const estateSummaryValue = [form.estateName || form.estateComplexName, form.hoaContactName].filter(Boolean).join(' / ')
  const propertySummaryLabel = showSectionalTitleDetails && showEstateDetails
    ? 'Scheme / estate'
    : showSectionalTitleDetails
      ? 'Scheme / Section'
      : showEstateDetails
        ? 'Estate / HOA'
        : showCommercialDetails
          ? 'Use / Floor Size'
          : 'Erf / Size'
  const propertySummaryValue = showSectionalTitleDetails && showEstateDetails
    ? [sectionSummaryValue, estateSummaryValue].filter(Boolean).join(' | ')
    : showSectionalTitleDetails
      ? sectionSummaryValue
      : showEstateDetails
        ? estateSummaryValue
        : showCommercialDetails
          ? [form.commercialUseDescription, form.floorSize ? `${form.floorSize} m2` : ''].filter(Boolean).join(' / ')
          : `${form.erfSize || 'Not provided'} m2`
  const disclosureMissing = getPropertyDisclosureMissingItems(form.propertyDisclosure || {})
  const reviewIssueGroups = [
    { label: 'Seller details', missing: sellerMissing, onEdit: () => setCurrentStep(0) },
    { label: 'Mandate preferences', missing: mandateMissing, onEdit: () => setCurrentStep(0) },
    { label: 'Transferring attorney', missing: transferAttorneyMissing, onEdit: () => setCurrentStep(0) },
    { label: 'Property details', missing: propertyMissing, onEdit: () => setCurrentStep(1) },
    { label: 'Property disclosure', missing: disclosureMissing, onEdit: () => setCurrentStep(2) },
    ...(bondComplianceSummary ? [{ label: 'Bond follow-up', missing: bondComplianceSummary.missing, onEdit: () => setCurrentStep(1) }] : []),
    ...(tenantComplianceSummary ? [{ label: 'Tenant follow-up', missing: tenantComplianceSummary.missing, onEdit: () => setCurrentStep(1) }] : []),
  ]

  const shouldShowWelcome = !embedded && !isCompleted && showWelcome

  const formContent = (
    <div className={PAGE_STACK_CLASS}>
      {!isCompleted ? (
        <>
          <SellerOnboardingHero brand={agencyBrand} listing={listing} form={form} statusLabel={statusLabel} />
        </>
      ) : null}

      {isCompleted ? (
        <SellerCompletedState listing={listing} form={form} brand={agencyBrand} onDownloadDisclosure={handleDownloadDisclosurePdf} />
      ) : (
        <section className={SECTION_CARD_CLASS}>
        <SellerStepProgress currentStep={currentStep} progress={progress} />

        {error ? (
          <p
            data-seller-onboarding-alert
            role="alert"
            tabIndex={-1}
            className="mt-4 rounded-[14px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318] outline-none focus:ring-2 focus:ring-[#b42318]/20"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            aria-live="polite"
            className="mt-4 whitespace-pre-line rounded-[14px] border border-[#d8ecdf] bg-[#eefbf3] px-4 py-3 text-sm text-[#1f7d44]"
          >
            {success}
          </p>
        ) : null}

        <MobileQuestionFlow activeIndex={activeMobilePaneIndex}>
        <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
          {currentStep === 0 ? (
            <StepShell
              eyebrow="About you"
              title="Tell us about yourself"
              description="Confirm the seller identity, ownership structure, and sale context."
            >
              <div className="space-y-6 sm:space-y-4">
              <FormSection
                icon={Landmark}
                title="Who owns this property?"
                description="Choose the owner type first, then define the legal structure."
                illustration="ownership"
                mobilePaneIndex={sellerPaneIndexes.ownership}
              >
                <div className="grid grid-cols-1 gap-2 sm:mt-4 sm:grid-cols-2 lg:grid-cols-4">
                  {OWNER_ENTITY_TYPES.map((item) => {
                    const active = ownerEntityType === item.value
                    return (
                      <ChoiceCard
                        key={item.value}
                        onClick={() => handleOwnerEntityTypeChange(item.value)}
                        active={active}
                        icon={OWNER_ENTITY_ICONS[item.value] || UserRound}
                        title={item.label}
                        description={item.description}
                      />
                    )
                  })}
                </div>

                <div className="mt-4 border-t border-[#e4ecf5] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60748b]">Define the structure</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ownerStructureOptions.map((item) => {
                      const active = ownerStructureType === item.value
                      return (
                        <ChoiceCard
                          key={item.value}
                          onClick={() => handleOwnerStructureTypeChange(item.value)}
                          active={active}
                          icon={OWNERSHIP_OPTION_ICONS[item.value] || OWNER_ENTITY_ICONS[ownerEntityType] || UserRound}
                          title={item.label}
                          description={item.description}
                        />
                      )
                    })}
                  </div>
                </div>

                {isForeignOwner ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-[14px] border border-[#dbe6f2] bg-[#f8fbff] p-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Foreign country / jurisdiction
                      <input className={DETAIL_INPUT_CLASS} value={form.foreignOwnerCountry} onChange={(event) => handleFormUpdate('foreignOwnerCountry', event.target.value)} />
                    </label>
                    {ownerStructureType === 'foreign_individual' ? (
                      <>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Passport / foreign ID number
                          <input className={DETAIL_INPUT_CLASS} value={form.idNumber || form.foreignPassportNumber} onChange={(event) => {
                            handleFormUpdate('idNumber', event.target.value)
                            handleFormUpdate('foreignPassportNumber', event.target.value)
                          }} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                          Residency / signing status (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.foreignResidencyStatus} onChange={(event) => handleFormUpdate('foreignResidencyStatus', event.target.value)} placeholder="Non-resident, SA resident, signing abroad, etc." />
                        </label>
                      </>
                    ) : (
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Foreign registration / authority number
                        <input className={DETAIL_INPUT_CLASS} value={form.foreignRegistrationNumber} onChange={(event) => handleFormUpdate('foreignRegistrationNumber', event.target.value)} />
                      </label>
                    )}
                  </div>
                ) : null}

                <p className="mt-3 text-xs font-medium leading-5 text-[#35546c]">
                  {isMarriedOwnership
                    ? 'Marital regime is derived from the structure choice. We only ask for the spouse details that are actually needed.'
                    : 'The next questions follow the owner type and structure you selected.'}
                </p>
              </FormSection>

              <FormSection icon={UserRound} title={sellerIdentityCopy.title} description={sellerIdentityCopy.description} mobilePaneIndex={sellerPaneIndexes.identity}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    {ownershipFieldLabels.firstName}
                    <input className={DETAIL_INPUT_CLASS} autoComplete="given-name" value={form.sellerFirstName} onChange={(event) => handleFormUpdate('sellerFirstName', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    {ownershipFieldLabels.surname}
                    <input className={DETAIL_INPUT_CLASS} autoComplete="family-name" value={form.sellerSurname} onChange={(event) => handleFormUpdate('sellerSurname', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Email
                    <input className={DETAIL_INPUT_CLASS} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => handleFormUpdate('email', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Phone
                    <input className={DETAIL_INPUT_CLASS} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => handleFormUpdate('phone', event.target.value)} />
                  </label>

                  {!['company', 'trust', 'deceased_estate', 'power_of_attorney', 'multiple_owners'].includes(ownershipBranch) ? (
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      {ownershipFieldLabels.idNumber}
                      <input className={DETAIL_INPUT_CLASS} value={form.idNumber} onChange={(event) => handleFormUpdate('idNumber', event.target.value)} />
                    </label>
                  ) : null}

                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Tax Number (optional)
                    <input className={DETAIL_INPUT_CLASS} inputMode="numeric" value={form.sellerTaxNumber} onChange={(event) => handleFormUpdate('sellerTaxNumber', event.target.value)} />
                  </label>
                  {showVatFields ? (
                    <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                      <input type="checkbox" checked={Boolean(form.vatRegistered)} onChange={(event) => handleFormUpdate('vatRegistered', event.target.checked)} />
                      VAT registered
                    </label>
                  ) : null}
                  {showVatFields && form.vatRegistered ? (
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      VAT Number
                      <input className={DETAIL_INPUT_CLASS} inputMode="numeric" value={form.vatNumber} onChange={(event) => handleFormUpdate('vatNumber', event.target.value)} />
                    </label>
                  ) : null}
                </div>

                {isMarriedOwnership ? (
                  <div className="mt-4 rounded-[18px] border border-[#dbe6f2] bg-[#f8fbff] p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck size={18} className="mt-0.5 text-[#35546c]" />
                      <div>
                        <h3 className="text-sm font-semibold text-[#22364a]">Spouse details</h3>
                        <p className="mt-1 text-sm leading-5 text-[#60748b]">
                          We’ll use this to confirm the correct legal signatures for a married seller.
                        </p>
                      </div>
                    </div>
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
                        <input className={DETAIL_INPUT_CLASS} type="email" inputMode="email" autoComplete="email" value={form.spouseEmail} onChange={(event) => handleFormUpdate('spouseEmail', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Spouse Phone (optional)
                        <input className={DETAIL_INPUT_CLASS} type="tel" inputMode="tel" autoComplete="tel" value={form.spousePhone} onChange={(event) => handleFormUpdate('spousePhone', event.target.value)} />
                      </label>
                    </div>
                  </div>
                ) : null}

                {isCompanyOwnership ? (
                  <div className="mt-4 space-y-4">
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Company details</h3>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Company Name
                          <input className={DETAIL_INPUT_CLASS} value={form.companyName} onChange={(event) => handleFormUpdate('companyName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Registration Number
                          <input className={DETAIL_INPUT_CLASS} value={form.companyRegistrationNumber} onChange={(event) => handleFormUpdate('companyRegistrationNumber', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                          Registered Address
                          <input className={DETAIL_INPUT_CLASS} value={form.companyRegisteredAddress} onChange={(event) => handleFormUpdate('companyRegisteredAddress', event.target.value)} />
                        </label>
                      </div>
                    </article>

                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#22364a]">Directors</h3>
                          <p className="mt-1 text-sm leading-5 text-[#60748b]">Add every director who should appear on the file.</p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={addCompanyDirector}>
                          <Plus size={14} />
                          Add Director
                        </Button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {companyDirectors.map((director, index) => (
                          <article key={director.id} className="rounded-[14px] border border-[#dbe6f2] bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#22364a]">Director {index + 1}</p>
                                <p className="text-xs text-[#6b7d93]">Repeatable director record</p>
                              </div>
                              {companyDirectors.length > 1 ? (
                                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd2d2] bg-white text-[#9f1239]" onClick={() => removeCompanyDirector(director.id)}>
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                First name
                                <input className={DETAIL_INPUT_CLASS} value={director.name} onChange={(event) => updateCompanyDirector(director.id, 'name', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Surname
                                <input className={DETAIL_INPUT_CLASS} value={director.surname} onChange={(event) => updateCompanyDirector(director.id, 'surname', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Email (optional)
                                <input className={DETAIL_INPUT_CLASS} value={director.email} onChange={(event) => updateCompanyDirector(director.id, 'email', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Phone (optional)
                                <input className={DETAIL_INPUT_CLASS} value={director.phone} onChange={(event) => updateCompanyDirector(director.id, 'phone', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                Address (optional)
                                <input className={DETAIL_INPUT_CLASS} value={director.residentialAddress} onChange={(event) => updateCompanyDirector(director.id, 'residentialAddress', event.target.value)} />
                              </label>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Primary authorised signatory</h3>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">This is the person who can sign the mandate on behalf of the company.</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Full name
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedSignatoryName} onChange={(event) => handleFormUpdate('authorisedSignatoryName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Email
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedSignatoryEmail} onChange={(event) => handleFormUpdate('authorisedSignatoryEmail', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Phone
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedSignatoryPhone} onChange={(event) => handleFormUpdate('authorisedSignatoryPhone', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Address (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedSignatoryAddress} onChange={(event) => handleFormUpdate('authorisedSignatoryAddress', event.target.value)} />
                        </label>
                      </div>
                    </article>
                  </div>
                ) : null}

                {isTrustOwnership ? (
                  <div className="mt-4 space-y-4">
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Trust details</h3>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Trust Name
                          <input className={DETAIL_INPUT_CLASS} value={form.trustName} onChange={(event) => handleFormUpdate('trustName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Registration Number
                          <input className={DETAIL_INPUT_CLASS} value={form.trustRegistrationNumber} onChange={(event) => handleFormUpdate('trustRegistrationNumber', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                          Registered Address
                          <input className={DETAIL_INPUT_CLASS} value={form.trustRegisteredAddress} onChange={(event) => handleFormUpdate('trustRegisteredAddress', event.target.value)} />
                        </label>
                      </div>
                    </article>

                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#22364a]">Trustees</h3>
                          <p className="mt-1 text-sm leading-5 text-[#60748b]">Add every trustee who should appear on the file.</p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={addTrustee}>
                          <Plus size={14} />
                          Add Trustee
                        </Button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {trustTrustees.map((trustee, index) => (
                          <article key={trustee.id} className="rounded-[14px] border border-[#dbe6f2] bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#22364a]">Trustee {index + 1}</p>
                                <p className="text-xs text-[#6b7d93]">Repeatable trustee record</p>
                              </div>
                              {trustTrustees.length > 1 ? (
                                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd2d2] bg-white text-[#9f1239]" onClick={() => removeTrustee(trustee.id)}>
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                First name
                                <input className={DETAIL_INPUT_CLASS} value={trustee.name} onChange={(event) => updateTrustee(trustee.id, 'name', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Surname
                                <input className={DETAIL_INPUT_CLASS} value={trustee.surname} onChange={(event) => updateTrustee(trustee.id, 'surname', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Email (optional)
                                <input className={DETAIL_INPUT_CLASS} value={trustee.email} onChange={(event) => updateTrustee(trustee.id, 'email', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Phone (optional)
                                <input className={DETAIL_INPUT_CLASS} value={trustee.phone} onChange={(event) => updateTrustee(trustee.id, 'phone', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                Address (optional)
                                <input className={DETAIL_INPUT_CLASS} value={trustee.residentialAddress} onChange={(event) => updateTrustee(trustee.id, 'residentialAddress', event.target.value)} />
                              </label>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Primary trustee</h3>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">This trustee will act as the main signatory for the trust file.</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Full name
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedTrusteeName} onChange={(event) => handleFormUpdate('authorisedTrusteeName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Email
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedTrusteeEmail} onChange={(event) => handleFormUpdate('authorisedTrusteeEmail', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Phone
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedTrusteePhone} onChange={(event) => handleFormUpdate('authorisedTrusteePhone', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Address (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.authorisedTrusteeAddress} onChange={(event) => handleFormUpdate('authorisedTrusteeAddress', event.target.value)} />
                        </label>
                      </div>
                    </article>
                  </div>
                ) : null}

                {isDeceasedEstateOwnership ? (
                  <div className="mt-4 space-y-4">
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Executor details</h3>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Full name
                          <input className={DETAIL_INPUT_CLASS} value={form.executorName} onChange={(event) => handleFormUpdate('executorName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Estate Reference
                          <input className={DETAIL_INPUT_CLASS} value={form.estateReference} onChange={(event) => handleFormUpdate('estateReference', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Executor Email (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.executorEmail} onChange={(event) => handleFormUpdate('executorEmail', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Executor Phone (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.executorPhone} onChange={(event) => handleFormUpdate('executorPhone', event.target.value)} />
                        </label>
                      </div>
                    </article>
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Authority details</h3>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">Add the letters of executorship or the master’s office reference for this estate file.</p>
                      <div className="mt-3 grid grid-cols-1 gap-3">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Authority Details
                          <textarea className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`} value={form.executorAuthorityDetails} onChange={(event) => handleFormUpdate('executorAuthorityDetails', event.target.value)} placeholder="Letters of executorship, master's office reference, or other authority detail" />
                        </label>
                      </div>
                    </article>
                  </div>
                ) : null}

                {isPowerOfAttorneyOwnership ? (
                  <div className="mt-4 space-y-4">
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Acting representative</h3>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Full name
                          <input className={DETAIL_INPUT_CLASS} value={form.powerOfAttorneyName} onChange={(event) => handleFormUpdate('powerOfAttorneyName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Representative Email (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.powerOfAttorneyEmail} onChange={(event) => handleFormUpdate('powerOfAttorneyEmail', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Representative Phone (optional)
                          <input className={DETAIL_INPUT_CLASS} value={form.powerOfAttorneyPhone} onChange={(event) => handleFormUpdate('powerOfAttorneyPhone', event.target.value)} />
                        </label>
                      </div>
                    </article>
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Principal details</h3>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">Tell us who the representative is acting for.</p>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Principal full name
                          <input className={DETAIL_INPUT_CLASS} value={form.powerOfAttorneyPrincipalName} onChange={(event) => handleFormUpdate('powerOfAttorneyPrincipalName', event.target.value)} />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Principal ID Number
                          <input className={DETAIL_INPUT_CLASS} value={form.powerOfAttorneyPrincipalIdNumber} onChange={(event) => handleFormUpdate('powerOfAttorneyPrincipalIdNumber', event.target.value)} />
                        </label>
                      </div>
                    </article>
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <h3 className="text-sm font-semibold text-[#22364a]">Authority details</h3>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">Add the power of attorney reference or authority note for the file.</p>
                      <div className="mt-3 grid grid-cols-1 gap-3">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Authority Details
                          <textarea className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`} value={form.powerOfAttorneyAuthorityDetails} onChange={(event) => handleFormUpdate('powerOfAttorneyAuthorityDetails', event.target.value)} placeholder="Reference number, scope of authority, or signing instruction" />
                        </label>
                      </div>
                    </article>
                  </div>
                ) : null}

                {isMultipleOwners ? (
                  <div className="mt-4 space-y-4">
                    <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                      <div className="mb-4 rounded-[12px] border border-[#dbe6f2] bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60748b]">Owner capture mode</p>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {MULTIPLE_OWNER_CAPTURE_MODES.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => handleMultipleOwnerCaptureModeChange(item.value)}
                              className={choiceCardClass(multipleOwnerCaptureMode === item.value)}
                            >
                              <span className="block text-sm font-semibold">{item.label}</span>
                              <span className="mt-1 block text-xs leading-5 text-[#60748b]">{item.description}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#22364a]">Owner cards</h3>
                          <p className="mt-1 text-sm leading-5 text-[#60748b]">
                            {isMultipleOwnerInviteMode
                              ? 'Capture each owner name and email so follow-up onboarding links can be sent.'
                              : 'Capture each owner, their share, and their consent to sell. At least two owners are required.'}
                          </p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={addMultipleOwner}>
                          <Plus size={14} />
                          Add Owner
                        </Button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {multipleOwners.map((owner, index) => (
                          <article key={owner.id} className="rounded-[14px] border border-[#dbe6f2] bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[#22364a]">Owner {index + 1}</p>
                                <p className="text-xs text-[#6b7d93]">Repeatable owner record</p>
                              </div>
                              {multipleOwners.length > 2 ? (
                                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd2d2] bg-white text-[#9f1239]" onClick={() => removeMultipleOwner(owner.id)}>
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                First name
                                <input className={DETAIL_INPUT_CLASS} value={owner.name} onChange={(event) => updateMultipleOwner(owner.id, 'name', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Surname
                                <input className={DETAIL_INPUT_CLASS} value={owner.surname} onChange={(event) => updateMultipleOwner(owner.id, 'surname', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                {isMultipleOwnerInviteMode ? 'ID / Passport Number (optional)' : 'ID / Passport Number'}
                                <input className={DETAIL_INPUT_CLASS} value={owner.idNumber} onChange={(event) => updateMultipleOwner(owner.id, 'idNumber', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Ownership Share % (optional)
                                <input className={DETAIL_INPUT_CLASS} value={owner.ownershipShare} onChange={(event) => updateMultipleOwner(owner.id, 'ownershipShare', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Email (optional)
                                <input className={DETAIL_INPUT_CLASS} value={owner.email} onChange={(event) => updateMultipleOwner(owner.id, 'email', event.target.value)} />
                              </label>
                              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                Phone (optional)
                                <input className={DETAIL_INPUT_CLASS} value={owner.phone} onChange={(event) => updateMultipleOwner(owner.id, 'phone', event.target.value)} />
                              </label>
                              {isMultipleOwnerInviteMode ? null : (
                                <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                  <input type="checkbox" checked={Boolean(owner.consentToSell)} onChange={(event) => updateMultipleOwner(owner.id, 'consentToSell', event.target.checked)} />
                                  Consent to sell
                                </label>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  </div>
                ) : null}

                {isCompanyOwnership || isTrustOwnership ? (
                  <div className="mt-4 rounded-[14px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm leading-6 text-[#4f6378]">
                    {isCompanyOwnership ? 'Add every director now. The primary authorised signatory stays separate so the signing authority stays clear.' : 'Add every trustee now. The primary trustee stays separate so the signing authority stays clear.'}
                  </div>
                ) : null}
              </FormSection>

              <FormSection
                icon={FileCheck2}
                title="Mandate preferences"
                description="Confirm the mandate choices your agent will use to prepare the mandate."
                illustration="selling_context"
                mobilePaneIndex={sellerPaneIndexes.mandatePreferences}
              >
                <div className="grid gap-5">
                  <div>
                    <p className="text-sm font-medium text-[#2a4057]">Choose the mandate type</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {MANDATE_TYPE_OPTIONS.map((option) => (
                        <ChoiceCard
                          key={option.value}
                          active={form.mandateType === option.value}
                          icon={FileCheck2}
                          title={option.label}
                          description={option.description}
                          onClick={() => handleFormUpdate('mandateType', option.value)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Mandate start date
                      <input className={DETAIL_INPUT_CLASS} type="date" value={form.mandateStartDate || ''} onChange={(event) => handleFormUpdate('mandateStartDate', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Mandate end date
                      <input className={DETAIL_INPUT_CLASS} type="date" value={form.mandateEndDate || ''} onChange={(event) => handleFormUpdate('mandateEndDate', event.target.value)} />
                    </label>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#2a4057]">Special conditions</p>
                    <p className="mt-1 text-sm leading-5 text-[#60748b]">Select anything that must be included or considered.</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {SPECIAL_MANDATE_CONDITION_OPTIONS.map((option) => (
                        <label key={option.key} className="flex min-h-[74px] items-start gap-3 rounded-[14px] border border-[#d8e2ec] bg-white px-3 py-3 text-sm font-medium text-[#2a4057]">
                          <input
                            type="checkbox"
                            checked={Boolean(form.specialMandateConditions?.[option.key])}
                            onChange={(event) => handleFormUpdate('specialMandateConditions', {
                              ...(form.specialMandateConditions || {}),
                              [option.key]: event.target.checked,
                            })}
                            className="mt-1 h-4 w-4 rounded border-[#b8c7d8] accent-[#138a3d]"
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[#172334]">{option.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-[#60748b]">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Anything else to include? (optional)
                    <textarea
                      className={`${DETAIL_INPUT_CLASS} min-h-[120px] resize-y`}
                      value={form.additionalConditions || ''}
                      onChange={(event) => handleFormUpdate('additionalConditions', event.target.value)}
                      placeholder="Access rules, timing, exclusions, or anything your agent should include in the mandate."
                    />
                  </label>
                </div>
              </FormSection>

              <FormSection
                icon={Scale}
                title="Transferring attorney"
                description="Choose the attorney who should handle the property transfer."
                mobilePaneIndex={sellerPaneIndexes.transferringAttorney}
              >
                <div className="grid gap-5">
                  <div className="rounded-[16px] border border-[#cfe3d7] bg-[#f2fbf5] px-4 py-3.5 text-sm leading-6 text-[#35546c]">
                    <p className="font-semibold text-[#172334]">The choice belongs to you</p>
                    <p className="mt-1">
                      As the seller, you appoint the transferring attorney. Your agency may recommend a trusted firm, but you may nominate another attorney or ask your agent to discuss the options with you first.
                    </p>
                  </div>

                  {hasRecommendedTransferAttorney ? (
                    <article className="rounded-[18px] border border-[#d5e2ef] bg-white p-4 shadow-[0_10px_28px_rgba(38,62,87,0.06)]">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf8ef] text-[#138a3d]">
                          <Scale size={21} strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#138a3d]">Your agency recommends</p>
                          <h3 className="mt-1 text-base font-semibold text-[#172334]">
                            {transferAttorneyDecision.recommendedAttorney.companyName}
                          </h3>
                          {transferAttorneyDecision.recommendedAttorney.contactPerson ? (
                            <p className="mt-1 text-sm text-[#60748b]">{transferAttorneyDecision.recommendedAttorney.contactPerson}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#4f6378]">
                            {transferAttorneyDecision.recommendedAttorney.email ? <span>{transferAttorneyDecision.recommendedAttorney.email}</span> : null}
                            {transferAttorneyDecision.recommendedAttorney.phone ? <span>{transferAttorneyDecision.recommendedAttorney.phone}</span> : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <div className="rounded-[16px] border border-[#e0e7f0] bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#60748b]">
                      Your agency has not recommended a firm for this sale. You can nominate an attorney now or ask your agent to contact you.
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-[#2a4057]">What would you like to do?</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
                      {hasRecommendedTransferAttorney ? (
                        <ChoiceCard
                          active={transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation}
                          icon={BadgeCheck}
                          title="Use the recommended attorney"
                          description="I am happy to appoint the firm shown above."
                          onClick={() => handleTransferAttorneyDecision(SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation)}
                        />
                      ) : null}
                      <ChoiceCard
                        active={transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn}
                        icon={Building2}
                        title="Nominate another attorney"
                        description="I already have a firm I would prefer to use."
                        onClick={() => handleTransferAttorneyDecision(SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn)}
                      />
                      <ChoiceCard
                        active={transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer}
                        icon={ClipboardCheck}
                        title="Discuss this first"
                        description="Please ask my agent to contact me before an attorney is appointed."
                        onClick={() => handleTransferAttorneyDecision(SELLER_TRANSFER_ATTORNEY_DECISIONS.defer)}
                      />
                    </div>
                  </div>

                  {transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn ? (
                    <div className="rounded-[18px] border border-[#dbe6f2] bg-[#f8fbff] p-4">
                      <p className="font-semibold text-[#172334]">Your nominated attorney</p>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">Provide enough detail for your agent to contact the firm and confirm the appointment.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Firm name
                          <input
                            className={DETAIL_INPUT_CLASS}
                            value={transferAttorneyDecision.selectedAttorney.companyName || ''}
                            onChange={(event) => handleNominatedTransferAttorneyUpdate('companyName', event.target.value)}
                            placeholder="Attorney firm name"
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Contact person (optional)
                          <input
                            className={DETAIL_INPUT_CLASS}
                            value={transferAttorneyDecision.selectedAttorney.contactPerson || ''}
                            onChange={(event) => handleNominatedTransferAttorneyUpdate('contactPerson', event.target.value)}
                            placeholder="Name and surname"
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Email address
                          <input
                            className={DETAIL_INPUT_CLASS}
                            type="email"
                            value={transferAttorneyDecision.selectedAttorney.email || ''}
                            onChange={(event) => handleNominatedTransferAttorneyUpdate('email', event.target.value)}
                            placeholder="attorney@example.co.za"
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Phone number
                          <input
                            className={DETAIL_INPUT_CLASS}
                            type="tel"
                            value={transferAttorneyDecision.selectedAttorney.phone || ''}
                            onChange={(event) => handleNominatedTransferAttorneyUpdate('phone', event.target.value)}
                            placeholder="Contact number"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {transferAttorneyDecision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer ? (
                    <OnboardingSummaryCard title="Your agent will follow up" icon="calendar" tone="neutral">
                      No attorney will be treated as selected from this onboarding. Your agent will contact you to discuss the appointment.
                    </OnboardingSummaryCard>
                  ) : null}
                </div>
              </FormSection>

              <FormSection
                icon={ClipboardCheck}
                title="Selling context"
                description="Help us understand your plans so we can guide you better."
                mobilePaneIndex={sellerPaneIndexes.sellingContext}
              >
                <div className="grid gap-5">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Asking Price (optional)
                    <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.askingPrice} onChange={(event) => handleFormUpdate('askingPrice', event.target.value)} />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-[#2a4057]">Selling timeline</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {SELLING_TIMELINE_OPTIONS.map((option) => (
                        <ChoiceCard
                          key={option.value}
                          active={form.sellingTimeline === option.value}
                          icon={ClipboardCheck}
                          title={option.label}
                          description={option.description}
                          onClick={() => handleFormUpdate('sellingTimeline', option.value)}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#2a4057]">Reason for selling (optional)</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SELLING_REASON_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleFormUpdate('sellingReason', option.value)}
                          className={chipChoiceClass(form.sellingReason === option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <OnboardingSummaryCard title="What happens next" icon="calendar" tone="neutral">
                    Your agent will use this to prepare the correct next step and supporting documents.
                  </OnboardingSummaryCard>
                </div>
              </FormSection>
              </div>
            </StepShell>
          ) : null}

          {currentStep === 1 ? (
            <StepShell
              eyebrow="Property details"
              title="Tell us about the property"
              description="We start with category, then branch into the right property, address, and document questions."
            >
              <div className="space-y-4">
                <FormSection
                  icon={Building2}
                  title="Property category"
                  description="Choose the broad category first. It controls the type options and the rest of the flow."
                  illustration="property_details"
                  mobilePaneIndex={propertyPaneIndexes.category}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {PROPERTY_CATEGORIES.map((category) => {
                      const meta = PROPERTY_CATEGORY_META[category] || PROPERTY_CATEGORY_META.residential
                      return (
                        <ChoiceCard
                          key={category}
                          active={form.propertyCategory === category}
                          icon={meta.icon}
                          title={getPropertyCategoryLabel(category)}
                          description={meta.description}
                          onClick={() => handlePropertyCategoryChange(category)}
                        />
                      )
                    })}
                  </div>
                </FormSection>

                <FormSection
                  icon={Home}
                  title="Property type & structure"
                  description="Choose the specific property type and the legal structure."
                  illustration="property_details"
                  mobilePaneIndex={propertyPaneIndexes.type}
                >
                  <div className="grid grid-cols-1 gap-3">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Property Type
                      <select
                        className={DETAIL_INPUT_CLASS}
                        value={form.propertyType}
                        onChange={(event) => handleFormUpdate('propertyType', event.target.value)}
                      >
                        {propertyTypeOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-2">
                      <p className="text-sm font-medium text-[#2a4057]">Legal structure</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {propertyStructureOptions.map((structureType) => (
                          <ChoiceCard
                            key={structureType.value}
                            active={form.propertyStructureType === structureType.value}
                            icon={structureType.icon}
                            title={structureType.label}
                            description={structureType.description}
                            onClick={() => handleFormUpdate('propertyStructureType', structureType.value)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <p className="text-sm font-medium text-[#2a4057]">Is this property in an estate or HOA?</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ChoiceCard
                          active={Boolean(form.estateOrHoa)}
                          icon={ShieldCheck}
                          title="Yes"
                          description="Ask for estate, levy, and managing agent details."
                          onClick={() => handleFormUpdate('estateOrHoa', true)}
                        />
                        <ChoiceCard
                          active={!form.estateOrHoa}
                          icon={Home}
                          title="No"
                          description="Treat this as a freestanding property for estate/HOA details."
                          onClick={() => handleFormUpdate('estateOrHoa', false)}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium leading-5 text-[#35546c]">
                    {getPropertyCategoryLabel(form.propertyCategory)} controls the type list. The legal structure controls scheme, land, or commercial follow-up fields; estate / HOA details are captured separately.
                  </p>
                </FormSection>

                <FormSection
                  icon={Landmark}
                  title="Property address"
                  description="This address is used for the listing, mandate, and documents."
                  mobilePaneIndex={propertyPaneIndexes.address}
                >
                  <div className="grid gap-3">
                    <AddressAutocomplete
                      label="Search address"
                      value={buildPropertyAddressAutocompleteValue(propertyAddressDetails)}
                      onChange={handlePropertyGoogleAddressChange}
                      onInputValueChange={handlePropertyAddressQueryChange}
                      placeholder="Start with the street, complex, suburb, or estate name"
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      {addressSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.key}
                          type="button"
                          onClick={() => handlePropertyAddressSuggestionSelect(suggestion.value)}
                          className="rounded-[14px] border border-[#dbe6f2] bg-white p-3 text-left transition hover:border-[#b6c9de] hover:bg-[#fafcff]"
                        >
                          <span className="block text-sm font-semibold text-[#22364a]">{suggestion.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{suggestion.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Address line 1
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.line1} onChange={(event) => handlePropertyAddressUpdate({ line1: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Address line 2 (optional)
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.line2} onChange={(event) => handlePropertyAddressUpdate({ line2: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Suburb
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.suburb} onChange={(event) => handlePropertyAddressUpdate({ suburb: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        City
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.city} onChange={(event) => handlePropertyAddressUpdate({ city: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Province
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.province} onChange={(event) => handlePropertyAddressUpdate({ province: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Postal Code
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.postalCode} onChange={(event) => handlePropertyAddressUpdate({ postalCode: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Municipality
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.municipality} onChange={(event) => handlePropertyAddressUpdate({ municipality: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Country
                        <input className={DETAIL_INPUT_CLASS} value={propertyAddressDetails.country} onChange={(event) => handlePropertyAddressUpdate({ country: event.target.value })} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Erf Number (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.erfNumber} onChange={(event) => handleFormUpdate('erfNumber', event.target.value)} />
                      </label>
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  icon={Sparkles}
                  title="Property features"
                  description="Capture the practical features and installations for publication and compliance."
                  mobilePaneIndex={propertyPaneIndexes.features}
                >
                  <div className="flex flex-wrap gap-2">
                    {PROPERTY_FEATURES.map((feature) => {
                      const active = (form.features || []).includes(feature.key) || Boolean(feature.formKey && form[feature.formKey])
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
                </FormSection>

                {showSectionalTitleDetails ? (
                  <FormSection
                    icon={ClipboardCheck}
                    title="Sectional title / scheme details"
                    description="Sectional title properties need scheme and body corporate details."
                    mobilePaneIndex={propertyPaneIndexes.sectional}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Scheme name
                        <input className={DETAIL_INPUT_CLASS} value={form.schemeName} onChange={(event) => handleFormUpdate('schemeName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Unit / section number
                        <input
                          className={DETAIL_INPUT_CLASS}
                          value={form.sectionNumber || form.unitNumber}
                          onChange={(event) => handleSectionalIdentifierChange(event.target.value)}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Body corporate name
                        <input className={DETAIL_INPUT_CLASS} value={form.schemeBodyCorporateName} onChange={(event) => handleFormUpdate('schemeBodyCorporateName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent name
                        <input className={DETAIL_INPUT_CLASS} value={form.schemeManagingAgentName} onChange={(event) => handleFormUpdate('schemeManagingAgentName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent email (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.schemeManagingAgentEmail} onChange={(event) => handleFormUpdate('schemeManagingAgentEmail', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent phone (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.schemeManagingAgentPhone} onChange={(event) => handleFormUpdate('schemeManagingAgentPhone', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Levies (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.schemeLevies} onChange={(event) => handleFormUpdate('schemeLevies', event.target.value)} />
                      </label>
                      <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={Boolean(form.schemeRulesAvailable)} onChange={(event) => handleFormUpdate('schemeRulesAvailable', event.target.checked)} />
                        Scheme rules available
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                {showEstateDetails ? (
                  <FormSection
                    icon={ShieldCheck}
                    title="Estate / HOA details"
                    description="Estate and HOA properties need levies and managing agent details."
                    mobilePaneIndex={propertyPaneIndexes.estate}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Estate / HOA name
                        <input className={DETAIL_INPUT_CLASS} value={form.estateName} onChange={(event) => handleFormUpdate('estateName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent / management company
                        <input className={DETAIL_INPUT_CLASS} value={form.hoaManagementCompany} onChange={(event) => handleFormUpdate('hoaManagementCompany', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Levies (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.levies} onChange={(event) => handleFormUpdate('levies', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent contact name (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.hoaContactName} onChange={(event) => handleFormUpdate('hoaContactName', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent email (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.hoaContactEmail} onChange={(event) => handleFormUpdate('hoaContactEmail', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Managing agent phone (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.hoaContactPhone} onChange={(event) => handleFormUpdate('hoaContactPhone', event.target.value)} />
                      </label>
                      <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={Boolean(form.hoaRulesAvailable)} onChange={(event) => handleFormUpdate('hoaRulesAvailable', event.target.checked)} />
                        HOA rules available
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                {showCommercialDetails ? (
                  <FormSection
                    icon={Building2}
                    title="Commercial / mixed-use details"
                    description="Commercial and mixed-use listings should reflect how the property is actually used."
                    mobilePaneIndex={propertyPaneIndexes.commercial}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Operating context
                        <textarea
                          className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`}
                          value={form.commercialUseDescription}
                          onChange={(event) => handleFormUpdate('commercialUseDescription', event.target.value)}
                          placeholder="Offices, retail, tenant mix, storage, services, trading, etc."
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        Mixed-use split (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.mixedUseSplit} onChange={(event) => handleFormUpdate('mixedUseSplit', event.target.value)} placeholder="Residential 60% / retail 40%" />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Floor Size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.floorSize} onChange={(event) => handleFormUpdate('floorSize', event.target.value)} />
                      </label>
                      <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={Boolean(form.tenantScheduleAvailable)} onChange={(event) => handleFormUpdate('tenantScheduleAvailable', event.target.checked)} />
                        Tenant schedule available
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Monthly water spend (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.monthlyWaterSpend} onChange={(event) => handleFormUpdate('monthlyWaterSpend', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Monthly electricity spend (optional)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.monthlyElectricitySpend} onChange={(event) => handleFormUpdate('monthlyElectricitySpend', event.target.value)} />
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                {showResidentialDetails ? (
                  <FormSection
                    icon={Home}
                    title="Residential details"
                    description="These questions help with pricing and publication for residential property."
                    mobilePaneIndex={propertyPaneIndexes.residential}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                        <input type="checkbox" checked={Boolean(form.pool)} onChange={(event) => handleFormUpdate('pool', event.target.checked)} />
                        Pool
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                {showLandDetails ? (
                  <FormSection
                    icon={Landmark}
                    title="Land / agricultural details"
                    description="Land-only properties need size and a few practical notes."
                    mobilePaneIndex={propertyPaneIndexes.land}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Erf size (m2)
                        <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.erfSize} onChange={(event) => handleFormUpdate('erfSize', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Zoning / usage (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.landZoning} onChange={(event) => handleFormUpdate('landZoning', event.target.value)} placeholder="Residential, agricultural, mixed, etc." />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Services available (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.landServicesAvailable} onChange={(event) => handleFormUpdate('landServicesAvailable', event.target.value)} placeholder="Water, electricity, sewer, access road..." />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Water source (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.landWaterSource} onChange={(event) => handleFormUpdate('landWaterSource', event.target.value)} placeholder="Borehole, municipal, rainwater..." />
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                <FormSection
                  icon={ClipboardCheck}
                  title="Costs & utilities"
                  description="Rates, levies, and water billing help the transaction team prepare the file."
                  mobilePaneIndex={propertyPaneIndexes.valuation}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Rates & Taxes
                      <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.ratesTaxes} onChange={(event) => handleFormUpdate('ratesTaxes', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Levies
                      <input
                        className={DETAIL_INPUT_CLASS}
                        type="number"
                        min="0"
                        value={form.leviesNotApplicable ? '' : form.levies}
                        disabled={Boolean(form.leviesNotApplicable)}
                        onChange={(event) => handleFormUpdate('levies', event.target.value)}
                      />
                    </label>
                    <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                      <input type="checkbox" checked={Boolean(form.leviesNotApplicable)} onChange={(event) => handleFormUpdate('leviesNotApplicable', event.target.checked)} />
                      No levies / not applicable
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Water billing type
                      <select className={DETAIL_INPUT_CLASS} value={form.waterBillingType} onChange={(event) => handleFormUpdate('waterBillingType', event.target.value)}>
                        {WATER_BILLING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Monthly water spend (optional)
                      <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.monthlyWaterSpend} onChange={(event) => handleFormUpdate('monthlyWaterSpend', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Monthly electricity spend (optional)
                      <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.monthlyElectricitySpend} onChange={(event) => handleFormUpdate('monthlyElectricitySpend', event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      Views (optional)
                      <input className={DETAIL_INPUT_CLASS} value={form.views} onChange={(event) => handleFormUpdate('views', event.target.value)} placeholder="Mountain, sea, park, city..." />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                      Notes (optional)
                      <textarea className={`${DETAIL_INPUT_CLASS} min-h-[110px] resize-y`} value={form.propertyNotes} onChange={(event) => handleFormUpdate('propertyNotes', event.target.value)} placeholder="Anything your agent should know about utility accounts, costs, or pricing" />
                    </label>
                  </div>
                </FormSection>

                <FormSection
                  icon={FileCheck2}
                  title="Documents already available"
                  description="Let us know what documents you already have on hand."
                  mobilePaneIndex={propertyPaneIndexes.documents}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['titleDeedAvailable', 'Title deed copy'],
                      ['sgDiagramAvailable', 'SG diagram'],
                      ['erfDiagramAvailable', 'Erf diagram'],
                      ['floorPlanAvailable', 'Floor plan'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#d6e1ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => handleFormUpdate(key, event.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </FormSection>

                <FormSection
                  icon={Building2}
                  title="Occupancy & finance"
                  description="A few practical questions help prepare the next step."
                  mobilePaneIndex={propertyPaneIndexes.occupancy}
                >
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Occupancy Status
                        <select className={DETAIL_INPUT_CLASS} value={form.occupancyStatus} onChange={(event) => handleFormUpdate('occupancyStatus', event.target.value)}>
                          {OCCUPANCY_STATUSES.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      {form.occupancyStatus === 'tenant_occupied' || form.occupancyStatus === 'partially_occupied' ? (
                        <>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form.leaseExists)} onChange={(event) => handleFormUpdate('leaseExists', event.target.checked)} />
                            Lease exists
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Tenant Name (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.tenantName} onChange={(event) => handleFormUpdate('tenantName', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Tenant Contact Details (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.tenantContactDetails} onChange={(event) => handleFormUpdate('tenantContactDetails', event.target.value)} />
                          </label>
                          {form.leaseExists ? (
                            <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                              Lease Expiry Date
                              <input className={DETAIL_INPUT_CLASS} type="date" value={form.leaseExpiryDate} onChange={(event) => handleFormUpdate('leaseExpiryDate', event.target.value)} />
                            </label>
                          ) : null}
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Monthly Rental (optional)
                            <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.monthlyRental} onChange={(event) => handleFormUpdate('monthlyRental', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Rental Deposit (optional)
                            <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.rentalDeposit} onChange={(event) => handleFormUpdate('rentalDeposit', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                            Notice Period Details (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.noticePeriodDetails} onChange={(event) => handleFormUpdate('noticePeriodDetails', event.target.value)} />
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form.rentalScheduleAvailable)} onChange={(event) => handleFormUpdate('rentalScheduleAvailable', event.target.checked)} />
                            Rental schedule available
                          </label>
                        </>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={Boolean(form.existingBond)} onChange={(event) => handleFormUpdate('existingBond', event.target.checked)} />
                        Existing bond on the property
                      </label>
                      {form.existingBond ? (
                        <>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Bond Bank
                            <input className={DETAIL_INPUT_CLASS} value={form.bondBank} onChange={(event) => handleFormUpdate('bondBank', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Bond account number
                            <input className={DETAIL_INPUT_CLASS} value={form.bondAccountReference} onChange={(event) => handleFormUpdate('bondAccountReference', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Estimated Settlement Amount (optional)
                            <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.estimatedSettlementAmount} onChange={(event) => handleFormUpdate('estimatedSettlementAmount', event.target.value)} />
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form.multipleBonds)} onChange={(event) => handleFormUpdate('multipleBonds', event.target.checked)} />
                            Multiple bonds
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form.accessBond)} onChange={(event) => handleFormUpdate('accessBond', event.target.checked)} />
                            Access bond
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form.cancellationRequired)} onChange={(event) => handleFormUpdate('cancellationRequired', event.target.checked)} />
                            Bond cancellation required
                          </label>
                        </>
                      ) : null}
                    </div>
                  </div>
                </FormSection>

              </div>
            </StepShell>
          ) : null}

          {currentStep === 2 ? (
            <PropertyDisclosureSection
              disclosure={form.propertyDisclosure}
              disclosureKind={propertyBranch === 'commercial' || propertyBranch === 'mixed_use' ? 'commercial' : 'residential'}
              sellerName={getSellerDisplayName(listing, form)}
              sellerIdNumber={form.idNumber || form.foreignPassportNumber || form.passportNumber || ''}
              onAnswerChange={handleDisclosureAnswerChange}
              onDownload={handleDownloadDisclosurePdf}
              onDisclosureChange={patchPropertyDisclosure}
            />
          ) : null}

          {currentStep === 3 ? (
            <StepShell
              eyebrow="Review & Submit"
              title="Check your seller file"
              description="Once submitted, your agent will review the information and prepare the next step in your selling journey."
            >
              <div className="grid grid-cols-1 gap-4">
                <ReviewReadinessPanel
                  issueGroups={reviewIssueGroups}
                  sellerName={getSellerDisplayName(listing, form)}
                  propertyAddress={getPropertyDisplayAddress(listing, form)}
                />
                <ReviewCard
                  title="Seller Summary"
                  missing={sellerMissing}
                  onEdit={() => setCurrentStep(0)}
                  collapsible
                  defaultOpen
                  items={[
                    { label: 'Seller', value: `${form.sellerFirstName} ${form.sellerSurname}`.trim() },
                    { label: 'Email', value: form.email },
                    { label: 'Phone', value: form.phone },
                    { label: 'Ownership', value: getOwnershipSummaryLabel(form) },
                  ]}
                />
                <ReviewCard
                  title="Property Summary"
                  missing={propertyMissing}
                  onEdit={() => setCurrentStep(1)}
                  collapsible
                  items={[
                    { label: 'Category', value: getPropertyCategoryLabel(form.propertyCategory) },
                    { label: 'Property Type', value: propertyTypeLabel },
                    { label: 'Structure', value: getPropertyStructureTypeLabel(form.propertyStructureType) },
                    { label: 'Branch', value: flow.property_branch_label || formatValue(propertyBranch) },
                    { label: 'Address', value: propertyAddressDetails.formatted || [form.propertyAddress, form.suburb, form.city, form.province].filter(Boolean).join(', ') },
                    { label: propertySummaryLabel, value: propertySummaryValue },
                  ]}
                />
                <ReviewCard
                  title="Occupancy & Finance"
                  onEdit={() => setCurrentStep(1)}
                  collapsible
                  items={[
                    { label: 'Occupancy', value: formatValue(form.occupancyStatus) },
                    { label: 'Lease', value: form.leaseExists ? `Exists${form.leaseExpiryDate ? ` until ${form.leaseExpiryDate}` : ''}` : 'Not indicated' },
                    { label: 'Existing Bond', value: form.existingBond ? `Yes${form.bondBank ? ` - ${form.bondBank}` : ''}` : 'No' },
                    { label: 'Cancellation', value: form.existingBond ? (form.cancellationRequired ? 'Required' : 'Not indicated') : 'Not applicable' },
                  ]}
                />
                <ReviewCard
                  title="Mandate Preferences"
                  missing={mandateMissing}
                  onEdit={() => setCurrentStep(0)}
                  collapsible
                  defaultOpen
                  items={[
                    { label: 'Mandate Type', value: getMandateTypeLabel(form.mandateType) },
                    { label: 'Start Date', value: formatDateValue(form.mandateStartDate) },
                    { label: 'End Date', value: formatDateValue(form.mandateEndDate) },
                    { label: 'Special Conditions', value: selectedSpecialMandateConditionLabels.length ? selectedSpecialMandateConditionLabels.join(', ') : 'None selected' },
                    { label: 'Additional Conditions', value: form.additionalConditions || 'Not provided' },
                  ]}
                />
                <ReviewCard
                  title="Transferring Attorney"
                  missing={transferAttorneyMissing}
                  onEdit={() => setCurrentStep(0)}
                  collapsible
                  defaultOpen
                  items={[
                    { label: 'Decision', value: getTransferAttorneyDecisionLabel(transferAttorneyDecision) },
                    { label: 'Attorney', value: transferAttorneyDisplay },
                    { label: 'Contact', value: transferAttorneyDecision.selectedAttorney.contactPerson || transferAttorneyDecision.recommendedAttorney.contactPerson || 'Not provided' },
                    { label: 'Email', value: transferAttorneyDecision.selectedAttorney.email || transferAttorneyDecision.recommendedAttorney.email || 'Not provided' },
                  ]}
                />
                <ReviewCard
                  title="Selling Context"
                  onEdit={() => setCurrentStep(0)}
                  collapsible
                  items={[
                    { label: 'Asking Price', value: form.askingPrice ? formatCurrency(form.askingPrice) : 'Not provided' },
                    { label: 'Timeline', value: formatValue(form.sellingTimeline) },
                    { label: 'Reason', value: formatValue(form.sellingReason) },
                  ]}
                />
                <ReviewCard
                  title="Property Disclosure"
                  missing={disclosureMissing}
                  onEdit={() => setCurrentStep(2)}
                  collapsible
                  items={[
                    { label: 'Disclosure Status', value: getPropertyDisclosureStatusLabel(getPropertyDisclosureStatus(form.propertyDisclosure || {})) },
                    { label: 'Annexure A Answers', value: `${getPropertyDisclosureAnswerSummary(form.propertyDisclosure || {}).answered} / ${getPropertyDisclosureAnswerSummary(form.propertyDisclosure || {}).total} answered` },
                    { label: 'Declaration', value: form.propertyDisclosure?.declarationAccepted ? 'Signed' : 'Not signed' },
                  ]}
                />
              </div>
              <div className="mt-5 rounded-[20px] border border-[#dbe6f2] bg-[#f7fbff] p-4">
                <div className="flex items-start gap-3">
                  <Sparkles size={18} className="mt-0.5 text-[#35546c]" />
                  <p className="text-sm leading-6 text-[#35546c]">
                    Submit when everything looks correct. Your agent will review the details and prepare the next mandate step.
                  </p>
                </div>
              </div>
            </StepShell>
          ) : null}
        </div>
        </MobileQuestionFlow>

        <div className="mt-6 hidden flex-col gap-3 border-t border-[#e4ebf5] pt-4 sm:mt-7 lg:flex lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 justify-center lg:justify-start">
            <DraftSaveStatus
              status={saving ? 'saving' : draftSyncStatus}
              savedAt={lastDraftSavedAt}
              fallback="Secure seller onboarding powered by arch9"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {currentStep > 0 ? (
              <Button type="button" variant="secondary" onClick={handleBack} disabled={saving || submitting} className="min-h-[46px] w-full sm:w-auto">
                <ChevronLeft size={14} />
                Back
              </Button>
            ) : null}
            {currentStep < FINAL_STEP_INDEX ? (
              <Button type="button" variant="ghost" onClick={() => saveDraft(currentStep)} disabled={saving || submitting} className="min-h-[46px] w-full sm:w-auto">
                {saving ? 'Saving...' : 'Save Draft'}
              </Button>
            ) : null}
            {currentStep < FINAL_STEP_INDEX ? (
              <Button type="button" onClick={handleNext} disabled={saving || submitting} className="min-h-[46px] w-full bg-[#138a3d] text-white hover:bg-[#0f7533] sm:w-auto">
                Save & Continue
                <ChevronRight size={14} />
              </Button>
            ) : null}
            {currentStep === FINAL_STEP_INDEX && !isCompleted ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="min-h-[46px] w-full bg-[#138a3d] text-white hover:bg-[#0f7533] sm:w-auto">
                {submitting ? 'Submitting...' : 'Submit Seller Information'}
                <CheckCircle2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </section>
      )}

      <footer className="flex flex-col gap-2 px-1 pb-2 text-center text-sm text-[#6b7d93] sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <span>Secure seller onboarding powered by arch9</span>
        <span>Need help? Contact {resolveAgentName(listing)}.</span>
      </footer>
    </div>
  )

  const content = shouldShowWelcome ? (
    <SellerWelcomeScreen
      brand={agencyBrand}
      listing={listing}
      form={form}
      currentStep={currentStep}
      onContinue={handleWelcomeContinue}
    />
  ) : formContent

  if (embedded) {
    return <div className="w-full">{content}</div>
  }

  const sellerMainClass = shouldShowWelcome
    ? 'relative min-h-screen overflow-x-hidden bg-[#02070b] font-sans antialiased text-white'
    : 'relative min-h-screen overflow-x-hidden bg-[#e4ebf3] px-3 py-3 pb-40 font-sans antialiased text-[#132033] sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-8 lg:pb-10'

  return (
    <main className={sellerMainClass}>
      {!shouldShowWelcome ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-white/40 blur-3xl" />
          <div className="absolute right-[-7rem] top-28 h-96 w-96 rounded-full bg-[#d7e2ee]/60 blur-3xl" />
          <div className="absolute bottom-[-9rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-white/30 blur-3xl" />
        </div>
      ) : null}
      <div className={shouldShowWelcome ? 'relative z-10 w-full' : PAGE_CONTAINER_CLASS}>
        {content}
      </div>
      {!shouldShowWelcome && !isCompleted ? (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/95 px-3 py-2 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden">
        <div className={PAGE_CONTAINER_CLASS}>
          <div className="grid gap-2 pb-[max(4px,env(safe-area-inset-bottom))]">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <DraftSaveStatus
                status={saving ? 'saving' : draftSyncStatus}
                savedAt={lastDraftSavedAt}
                fallback="Secure seller onboarding"
              />
              <div className="flex shrink-0 items-center gap-1.5">
                {currentStep > 0 || activeMobilePaneIndex > 0 ? (
                  <Button type="button" variant="secondary" onClick={handleMobilePaneBack} disabled={saving || submitting} className="min-h-[34px] rounded-full px-2.5">
                    <ChevronLeft size={14} />
                    Back
                  </Button>
                ) : null}
                {currentStep < FINAL_STEP_INDEX ? (
                  <Button type="button" variant="ghost" onClick={() => saveDraft(currentStep)} disabled={saving || submitting} className="min-h-[34px] rounded-full px-2.5 text-xs">
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                ) : null}
                <span className="rounded-full bg-[#f2f6fb] px-2.5 py-1 text-[11px] font-semibold text-[#5f738a]">
                  {mobilePaneCount > 1 ? `${activeMobilePaneIndex + 1}/${mobilePaneCount}` : `${currentStep + 1}/${STEPS.length}`}
                </span>
              </div>
            </div>
            {currentStep < FINAL_STEP_INDEX ? (
              <Button type="button" onClick={handleMobilePaneNext} disabled={saving || submitting} className="min-h-[52px] w-full rounded-[18px] bg-[#138a3d] text-white shadow-[0_14px_28px_rgba(19,138,61,0.22)] hover:bg-[#0f7533]">
                {saving ? 'Saving...' : hasNextMobilePane ? 'Continue' : 'Save & Continue'}
                <ChevronRight size={14} />
              </Button>
            ) : null}
            {currentStep === FINAL_STEP_INDEX && !isCompleted ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="min-h-[52px] w-full rounded-[18px] bg-[#138a3d] text-white shadow-[0_14px_28px_rgba(19,138,61,0.22)] hover:bg-[#0f7533]">
                {submitting ? 'Submitting...' : 'Submit Seller Information'}
                <CheckCircle2 size={14} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}
    </main>
  )
}

export default SellerOnboarding
