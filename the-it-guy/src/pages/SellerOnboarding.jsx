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
  buildCanonicalSellerOnboardingPayload,
  validateSellerOnboardingFacts,
} from '../services/documents/sellerOnboardingFactTransformer'
import { resolveSellerOnboardingFlow } from '../lib/sellerOnboardingFlow'
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
  { value: 'individual', label: 'Individual', description: 'I own the property in my own name.' },
  { value: 'married_cop', label: 'Married (COP)', description: 'Married in community of property.' },
  { value: 'married_anc', label: 'Married (ANC)', description: 'Married out of community of property.' },
  { value: 'company', label: 'Company', description: 'A company owns the property.' },
  { value: 'trust', label: 'Trust', description: 'A trust owns the property.' },
  { value: 'deceased_estate', label: 'Deceased estate', description: 'The property forms part of a deceased estate.' },
  { value: 'power_of_attorney', label: 'Power of attorney', description: 'Someone is acting under authority.' },
  { value: 'multiple_owners', label: 'Multiple owners', description: 'Two or more individuals own the property.' },
  { value: 'other', label: 'Other', description: 'Another ownership structure applies.' },
]

const CANONICAL_PROPERTY_TYPES = [
  { value: 'freehold', label: 'Freehold' },
  { value: 'sectional_title', label: 'Sectional Title' },
  { value: 'share_block', label: 'Share Block' },
  { value: 'estate', label: 'Estate / HOA' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'farm', label: 'Farm' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'vacant_land', label: 'Vacant Land' },
  { value: 'other', label: 'Other' },
]

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

const PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1120px]'
const SECTION_CARD_CLASS =
  'rounded-[20px] border border-[#dbe5ef] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-4 lg:rounded-[28px] lg:p-6 lg:shadow-[0_24px_54px_rgba(15,23,42,0.09)]'
const INNER_PANEL_CLASS =
  'rounded-[18px] border border-[#dfe8f2] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-4 lg:rounded-[20px] lg:p-5'
const DETAIL_INPUT_CLASS =
  'w-full min-h-[48px] sm:min-h-[52px] rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2.5 sm:px-4 sm:py-3 text-base text-[#162334] outline-none transition duration-150 ease-out placeholder:text-[#8aa0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12'
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

function areCanonicalSellerFactsEnabled() {
  const raw = String(import.meta.env?.[CANONICAL_SELLER_FACTS_FLAG] ?? '').trim().toLowerCase()
  return !['0', 'false', 'no', 'off', 'disabled'].includes(raw)
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
      listing?.branding?.organisationName ||
      listing?.branding?.agencyName ||
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
      listing?.agencyLogoDarkUrl ||
      listing?.organisationLogoDarkUrl ||
      listing?.branding?.logoDarkUrl ||
      listing?.branding?.logoDark ||
      listing?.agencyLogoUrl ||
      listing?.organisationLogoUrl ||
      listing?.agency?.logoUrl ||
      listing?.organisation?.logoUrl ||
      listing?.branding?.logoUrl ||
      listing?.branding?.logoLightUrl ||
      listing?.branding?.logoLight ||
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
  const flowBranch = String(flow?.seller_branch || canonicalFacts?.flow?.seller_branch || '').toLowerCase()

  if (explicit && !['individual', 'other', 'legal_entity'].includes(explicit)) {
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

function getOwnershipBranch(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (['married_cop', 'married_anc', 'married'].includes(normalized)) return 'married'
  return normalized || 'individual'
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

function getOwnershipBranchLabel(value = '') {
  const normalized = getOwnershipBranch(value)
  if (normalized === 'married') return 'Married'
  return OWNERSHIP_TYPES.find((item) => item.value === value)?.label || formatValue(normalized || 'individual')
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
    return existing.idNumber || canonicalFacts?.seller?.id_number || ''
  }
  const resolveAddress = () => {
    if (sellerBranch === 'company') return canonicalFacts?.seller?.company?.registered_address || canonicalFacts?.seller?.residential_address || existing.residentialAddress || ''
    if (sellerBranch === 'trust') return canonicalFacts?.seller?.trust?.registered_address || canonicalFacts?.seller?.residential_address || existing.residentialAddress || ''
    return canonicalFacts?.seller?.residential_address || existing.residentialAddress || ''
  }
  const ownershipFieldLabels = getOwnershipFieldLabels(flow?.seller_branch || existing.ownershipType || '')

  return {
    sellerFirstName: existing.sellerFirstName || canonicalFacts?.seller?.first_name || split.firstName,
    sellerSurname: existing.sellerSurname || canonicalFacts?.seller?.surname || split.surname,
    idNumber: resolveIdNumber(),
    email: existing.email || canonicalFacts?.seller?.email || seller.email || '',
    phone: existing.phone || canonicalFacts?.seller?.phone || seller.phone || '',
    residentialAddress: resolveAddress(),

    ownershipType: normalizeOwnershipType(existing, canonicalFacts, flow),
    sellerLegalType: existing.sellerLegalType || existing.legalType || canonicalFacts?.seller?.legal_type || normalizeOwnershipType(existing, canonicalFacts, flow),
    sellerTaxNumber: existing.sellerTaxNumber || canonicalFacts?.seller?.tax_number || existing.taxNumber || '',
    vatRegistered: Boolean(existing.vatRegistered),
    vatNumber: existing.vatNumber || '',
    maritalStatus: existing.maritalStatus || canonicalFacts?.seller?.marital_status || (String(normalizeOwnershipType(existing, canonicalFacts, flow)).includes('married') ? 'married' : 'not_married'),
    maritalRegime: existing.maritalRegime || canonicalFacts?.seller?.marital_regime || (normalizeOwnershipType(existing, canonicalFacts, flow) === 'married_cop' ? 'in_community' : normalizeOwnershipType(existing, canonicalFacts, flow) === 'married_anc' ? 'anc' : 'not_applicable'),
    authorisedRepresentative: existing.authorisedRepresentative || canonicalFacts?.seller?.authorised_representative || '',
    spouseName: existing.spouseName || canonicalFacts?.seller?.spouse?.name || '',
    spouseIdNumber: existing.spouseIdNumber || canonicalFacts?.seller?.spouse?.id_number || '',
    spouseEmail: existing.spouseEmail || canonicalFacts?.seller?.spouse?.email || '',
    spousePhone: existing.spousePhone || canonicalFacts?.seller?.spouse?.phone || '',

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
    sellingTimeline: existing.sellingTimeline || '1_3_months',
    sellingReason: existing.sellingReason || '',

    propertyCategory: normalizePropertyCategory(existing.propertyCategory || canonicalFacts?.property?.property_category || listing?.propertyCategory || listing?.property_category, { fallback: 'residential' }),
    propertyStructureType: normalizePropertyStructureType(existing.propertyStructureType || canonicalFacts?.property?.property_structure_type || listing?.propertyStructureType || listing?.property_structure_type || existing.propertyType, { fallback: 'other' }),
    canonicalPropertyType: existing.canonicalPropertyType || canonicalFacts?.property?.property_type || existing.propertyClassification || '',
    sectionalTitle: Boolean(existing.sectionalTitle || canonicalFacts?.property?.sectional_title || flow.property_branch === 'sectional_title'),
    shareBlock: Boolean(existing.shareBlock || canonicalFacts?.property?.share_block),
    estateOrHoa: Boolean(existing.estateOrHoa || canonicalFacts?.property?.estate_or_hoa || flow.property_branch === 'estate_hoa'),
    bodyCorporate: Boolean(existing.bodyCorporate || canonicalFacts?.property?.body_corporate),
    commercialProperty: Boolean(existing.commercialProperty || canonicalFacts?.property?.commercial_property || ['commercial', 'mixed_use'].includes(flow.property_branch)),
    propertyType: existing.propertyType || canonicalFacts?.property?.property_type || listing?.propertyType || 'house',
    propertyAddress: existing.propertyAddress || canonicalFacts?.property?.address || [listing?.listingTitle, listing?.suburb, listing?.city].filter(Boolean).join(', '),
    suburb: existing.suburb || canonicalFacts?.property?.suburb || listing?.suburb || '',
    city: existing.city || canonicalFacts?.property?.city || listing?.city || '',
    province: existing.province || canonicalFacts?.property?.province || '',
    municipality: existing.municipality || canonicalFacts?.property?.municipality || existing.city || listing?.city || '',
    estateComplexName: existing.estateComplexName || canonicalFacts?.property?.estate_name || '',
    estateName: existing.estateName || canonicalFacts?.property?.estate_name || existing.estateComplexName || '',
    unitNumber: existing.unitNumber || canonicalFacts?.property?.unit_number || '',
    sectionNumber: existing.sectionNumber || canonicalFacts?.property?.section_number || '',
    schemeName: existing.schemeName || canonicalFacts?.property?.scheme_name || '',
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
    ratesTaxes: existing.ratesTaxes || canonicalFacts?.property?.rates_taxes || '',
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

    features: Array.isArray(existing.features) ? existing.features : [],
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

    gasInstallation: Boolean(existing.gasInstallation || canonicalFacts?.compliance?.gas_installation),
    electricFence: Boolean(existing.electricFence || canonicalFacts?.compliance?.electric_fence),
    solarInstallation: Boolean(existing.solarInstallation || canonicalFacts?.compliance?.solar_installation),
    swimmingPool: Boolean(existing.swimmingPool || existing.pool || canonicalFacts?.compliance?.swimming_pool),
    boreholeInstallation: Boolean(existing.boreholeInstallation || existing.borehole || canonicalFacts?.compliance?.borehole_installation || canonicalFacts?.compliance?.borehole),
    borehole: Boolean(existing.borehole || existing.boreholeInstallation || canonicalFacts?.compliance?.borehole_installation || canonicalFacts?.compliance?.borehole),
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
  if (brand?.logoUrl) {
    return (
      <span className={`inline-flex h-12 min-w-12 max-w-[220px] items-center justify-center rounded-[16px] px-2 py-1 shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${tone === 'light' ? 'border border-[#dbe5ef] bg-white' : 'border border-white/15 bg-white/5'}`}>
        <img
          src={brand.logoUrl}
          alt={`${brand.name} logo`}
          className="max-h-10 w-auto max-w-[200px] object-contain"
        />
      </span>
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
            Secure client portal
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
  const clientSellingPath = `/client/${token}/selling/documents`

  return (
    <section className="rounded-[22px] border border-[#d8ecdf] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:rounded-[26px] sm:p-5 lg:rounded-[28px] lg:p-7 lg:shadow-[0_24px_54px_rgba(15,23,42,0.09)]">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-6">
        <div className="rounded-[20px] border border-[#d8ecdf] bg-[#eefbf3] p-4 sm:rounded-[24px] sm:p-5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1f7d44] text-white shadow-[0_16px_32px_rgba(31,125,68,0.24)] sm:h-14 sm:w-14">
            <CheckCircle2 size={26} />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-[#14532d] sm:mt-5 sm:text-2xl sm:tracking-[-0.025em]">Your seller information has been submitted</h2>
          <p className="mt-3 text-sm leading-6 text-[#25603d]">
            Your agent will review your information. Your next step is to open the client portal selling module and upload the documents needed for FICA, mandate preparation, and listing readiness.
          </p>
          <div className="mt-4 rounded-[16px] border border-[#cfe8da] bg-white/70 p-3 text-left text-sm leading-6 text-[#25603d]">
            <p className="font-semibold text-[#14532d]">What happens next</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Upload the requested seller documents in the client portal.</li>
              <li>Your agent checks the documents and prepares the mandate.</li>
              <li>You will receive a secure signing link when the mandate is ready.</li>
            </ul>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link to={clientSellingPath} className="inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] bg-[#172334] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] sm:w-auto">
              Open Client Portal
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
    const type = getOwnershipBranch(form?.ownershipType)
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
    if (type === 'married') {
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

  function handleOwnershipTypeChange(value) {
    setForm((previous) => {
      const next = { ...(previous || {}), ownershipType: value, sellerLegalType: value }
      const branch = getOwnershipBranch(value)
      next.maritalStatus = branch === 'married' ? 'married' : 'not_married'
      next.maritalRegime = value === 'married_cop' ? 'in_community' : value === 'married_anc' ? 'anc' : branch === 'married' ? (next.maritalRegime || 'unknown') : 'not_applicable'
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
    })
  }

  function handleFeatureToggle(featureKey) {
    setForm((previous) => {
      const prev = previous || {}
      const current = Array.isArray(prev.features) ? prev.features : []
      const nextFeatures = current.includes(featureKey) ? current.filter((item) => item !== featureKey) : [...current, featureKey]
      return { ...prev, features: nextFeatures }
    })
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

  async function saveDraft(nextStep = currentStep) {
    if (!form) return
    setSaving(true)
    setError('')
    const canonicalPayload = buildCanonicalPayload({ ...(form || {}), currentStep: nextStep }, {
      draft: true,
      source: 'seller_onboarding_draft',
    })
    const draftFormData = { ...(form || {}), currentStep: nextStep, ...canonicalPayload }
    await persistListingUpdate((row) => ({
      ...row,
      sellerOnboarding: {
        ...(row?.sellerOnboarding || {}),
        status: SELLER_ONBOARDING_STATUS.IN_PROGRESS,
        currentStep: nextStep,
        formData: draftFormData,
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
      const ownershipBranch = getOwnershipBranch(ownershipType)
      const companyDirectors = Array.isArray(form.companyDirectors) ? form.companyDirectors : []
      const trustTrustees = Array.isArray(form.trustees) ? form.trustees : []
      const multipleOwners = Array.isArray(form.multipleOwners) ? form.multipleOwners : []

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
        const incompleteOwner = multipleOwners.find((owner) => !owner.name || !owner.surname || !owner.idNumber || !owner.consentToSell)
        if (incompleteOwner) {
          return 'Each owner needs a name, surname, ID number, and consent to sell.'
        }
      }
    }

    if (currentStep === 1) {
      if (!form.propertyCategory || !form.propertyType || !form.propertyAddress || !form.suburb || !form.province) {
        return 'Property category, property type, address, suburb, and province are required.'
      }
      if (form.existingBond && !form.bondBank) {
        return 'Bond bank is required when there is an existing bond.'
      }
      if (form.occupancyStatus === 'tenant_occupied' && form.leaseExists && !form.leaseExpiryDate) {
        return 'Lease expiry date is required when a lease exists.'
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
      const canonicalPayload = buildCanonicalPayload({ ...(form || {}), currentStep: 3 }, {
        draft: false,
        source: 'seller_onboarding_submit',
      })
      if (canonicalPayload.canonicalSellerFacts) {
        const factValidation = validateSellerOnboardingFacts(canonicalPayload.canonicalSellerFacts, { draft: false })
        if (!factValidation.ok) {
          throw new Error(factValidation.required[0]?.message || 'Please complete the required seller onboarding facts before submitting.')
        }
      }
      const submitFormData = { ...(form || {}), currentStep: 3, ...canonicalPayload }
      let updated = null
      if (useDbFirstSellerOnboarding) {
        const submitted = await submitSellerOnboarding(token, {
          status: 'completed',
          formData: submitFormData,
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
            formData: submitFormData,
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
      setSuccess('Your property details have been submitted.\nNext, open your client portal selling module to upload the required seller documents.')
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

  const showUnitDetails = isCompactPropertyType(form) || Boolean(form.sectionalTitle || form.shareBlock || form.bodyCorporate)
  const showLandDetails = isLandOrAgricultural(form)
  const showCommercialDetails = isCommercialProperty(form) || Boolean(form.commercialProperty)
  const ownershipBranch = getOwnershipBranch(form.ownershipType)
  const ownershipFieldLabels = getOwnershipFieldLabels(form.ownershipType)
  const selectedOwnership = OWNERSHIP_TYPES.find((item) => item.value === form.ownershipType) || OWNERSHIP_TYPES[0]
  const isMarriedOwnership = ownershipBranch === 'married'
  const isCompanyOwnership = ownershipBranch === 'company'
  const isTrustOwnership = ownershipBranch === 'trust'
  const isDeceasedEstateOwnership = ownershipBranch === 'deceased_estate'
  const isPowerOfAttorneyOwnership = ownershipBranch === 'power_of_attorney'
  const isMultipleOwners = ownershipBranch === 'multiple_owners'
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
              <FormSection icon={Landmark} title="Who owns this property?" description="Choose the ownership structure first. We’ll show the right follow-up fields from here.">
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {OWNERSHIP_TYPES.map((item) => {
                    const active = form.ownershipType === item.value
                    return (
                      <ChoiceCard
                        key={item.value}
                        onClick={() => handleOwnershipTypeChange(item.value)}
                        active={active}
                        title={item.label}
                        description={item.description}
                      />
                    )
                  })}
                </div>

                <div className="mt-4 rounded-[14px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm leading-6 text-[#4f6378]">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#d6e1ee] bg-white px-3 py-1 text-xs font-semibold text-[#35546c]">
                      {getOwnershipBranchLabel(form.ownershipType)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#22364a]">{selectedOwnership.label}</p>
                      <p className="mt-1 text-sm leading-5 text-[#60748b]">{selectedOwnership.description}</p>
                      <p className="mt-2 text-xs font-medium text-[#35546c]">
                        {isMarriedOwnership
                          ? 'Marital regime is derived from your ownership choice and kept internal. We’ll only ask for the spouse details that are actually needed.'
                          : 'We’ll only show the next questions that fit this ownership structure.'}
                      </p>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection icon={UserRound} title={sellerIdentityCopy.title} description={sellerIdentityCopy.description}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    {ownershipFieldLabels.firstName}
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerFirstName} onChange={(event) => handleFormUpdate('sellerFirstName', event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    {ownershipFieldLabels.surname}
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

                  {!['company', 'trust', 'deceased_estate', 'power_of_attorney', 'multiple_owners'].includes(ownershipBranch) ? (
                    <>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        {ownershipFieldLabels.idNumber}
                        <input className={DETAIL_INPUT_CLASS} value={form.idNumber} onChange={(event) => handleFormUpdate('idNumber', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                        {ownershipFieldLabels.address}
                        <input className={DETAIL_INPUT_CLASS} value={form.residentialAddress} onChange={(event) => handleFormUpdate('residentialAddress', event.target.value)} />
                      </label>
                    </>
                  ) : null}

                  <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                    Tax Number (optional)
                    <input className={DETAIL_INPUT_CLASS} value={form.sellerTaxNumber} onChange={(event) => handleFormUpdate('sellerTaxNumber', event.target.value)} />
                  </label>
                  <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                    <input type="checkbox" checked={form.vatRegistered} onChange={(event) => handleFormUpdate('vatRegistered', event.target.checked)} />
                    VAT registered
                  </label>
                  {form.vatRegistered ? (
                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                      VAT Number
                      <input className={DETAIL_INPUT_CLASS} value={form.vatNumber} onChange={(event) => handleFormUpdate('vatNumber', event.target.value)} />
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
                        <input className={DETAIL_INPUT_CLASS} value={form.spouseEmail} onChange={(event) => handleFormUpdate('spouseEmail', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Spouse Phone (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.spousePhone} onChange={(event) => handleFormUpdate('spousePhone', event.target.value)} />
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#22364a]">Owner cards</h3>
                          <p className="mt-1 text-sm leading-5 text-[#60748b]">Capture each owner, their share, and their consent to sell. At least two owners are required.</p>
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
                                ID Number
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
                              <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                <input type="checkbox" checked={Boolean(owner.consentToSell)} onChange={(event) => updateMultipleOwner(owner.id, 'consentToSell', event.target.checked)} />
                                Consent to sell
                              </label>
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
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Legal Property Classification
                        <select className={DETAIL_INPUT_CLASS} value={form.canonicalPropertyType} onChange={(event) => handleFormUpdate('canonicalPropertyType', event.target.value)}>
                          <option value="">Infer from property type</option>
                          {CANONICAL_PROPERTY_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-1 gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                          ['sectionalTitle', 'Sectional title'],
                          ['shareBlock', 'Share block'],
                          ['estateOrHoa', 'Estate / HOA'],
                          ['bodyCorporate', 'Body corporate'],
                          ['commercialProperty', 'Commercial'],
                        ].map(([key, label]) => (
                          <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#d6e1ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => handleFormUpdate(key, event.target.checked)} />
                            {label}
                          </label>
                        ))}
                      </div>
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
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Municipality
                        <input className={DETAIL_INPUT_CLASS} value={form.municipality} onChange={(event) => handleFormUpdate('municipality', event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                        Erf Number (optional)
                        <input className={DETAIL_INPUT_CLASS} value={form.erfNumber} onChange={(event) => handleFormUpdate('erfNumber', event.target.value)} />
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
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Section Number (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.sectionNumber} onChange={(event) => handleFormUpdate('sectionNumber', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Scheme Name (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.schemeName} onChange={(event) => handleFormUpdate('schemeName', event.target.value)} />
                          </label>
                        </>
                      ) : null}
                      {form.estateOrHoa ? (
                        <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                          Estate / HOA Name
                          <input className={DETAIL_INPUT_CLASS} value={form.estateName} onChange={(event) => handleFormUpdate('estateName', event.target.value)} />
                        </label>
                      ) : null}
                      <div className="grid grid-cols-1 gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                          ['titleDeedAvailable', 'Title deed copy'],
                          ['sgDiagramAvailable', 'SG diagram'],
                          ['erfDiagramAvailable', 'Erf diagram'],
                          ['approvedBuildingPlansAvailable', 'Building plans'],
                          ['floorPlanAvailable', 'Floor plan'],
                        ].map(([key, label]) => (
                          <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#d6e1ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => handleFormUpdate(key, event.target.checked)} />
                            {label}
                          </label>
                        ))}
                      </div>
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
                    <h3 className="text-sm font-semibold text-[#22364a]">Occupancy</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
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
                            <input type="checkbox" checked={form.leaseExists} onChange={(event) => handleFormUpdate('leaseExists', event.target.checked)} />
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
                            <input type="checkbox" checked={form.rentalScheduleAvailable} onChange={(event) => handleFormUpdate('rentalScheduleAvailable', event.target.checked)} />
                            Rental schedule available
                          </label>
                        </>
                      ) : null}
                    </div>
                  </article>

                  <article className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                    <h3 className="text-sm font-semibold text-[#22364a]">Existing Bond</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                        <input type="checkbox" checked={form.existingBond} onChange={(event) => handleFormUpdate('existingBond', event.target.checked)} />
                        Existing bond on the property
                      </label>
                      {form.existingBond ? (
                        <>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Bond Bank
                            <input className={DETAIL_INPUT_CLASS} value={form.bondBank} onChange={(event) => handleFormUpdate('bondBank', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Bond Account / Reference (optional)
                            <input className={DETAIL_INPUT_CLASS} value={form.bondAccountReference} onChange={(event) => handleFormUpdate('bondAccountReference', event.target.value)} />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                            Estimated Settlement Amount (optional)
                            <input className={DETAIL_INPUT_CLASS} type="number" min="0" value={form.estimatedSettlementAmount} onChange={(event) => handleFormUpdate('estimatedSettlementAmount', event.target.value)} />
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={form.multipleBonds} onChange={(event) => handleFormUpdate('multipleBonds', event.target.checked)} />
                            Multiple bonds
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={form.accessBond} onChange={(event) => handleFormUpdate('accessBond', event.target.checked)} />
                            Access bond
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={form.cancellationRequired} onChange={(event) => handleFormUpdate('cancellationRequired', event.target.checked)} />
                            Bond cancellation required
                          </label>
                          <label className="flex min-h-[52px] items-center gap-2 rounded-[12px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                            <input type="checkbox" checked={form.cancellationAttorneyKnown} onChange={(event) => handleFormUpdate('cancellationAttorneyKnown', event.target.checked)} />
                            Cancellation attorney known
                          </label>
                          {form.cancellationAttorneyKnown ? (
                            <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                              Cancellation Attorney Details
                              <input className={DETAIL_INPUT_CLASS} value={form.cancellationAttorneyDetails} onChange={(event) => handleFormUpdate('cancellationAttorneyDetails', event.target.value)} />
                            </label>
                          ) : null}
                        </>
                      ) : null}
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
              <article className="mb-4 rounded-[18px] border border-[#dce6f2] bg-[#f8fbff] p-4">
                <h3 className="text-sm font-semibold text-[#22364a]">Installations & Compliance Signals</h3>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['gasInstallation', 'Gas installation'],
                    ['electricFence', 'Electric fence'],
                    ['solarInstallation', 'Solar installation'],
                    ['swimmingPool', 'Swimming pool'],
                    ['borehole', 'Borehole'],
                    ['generatorInstallation', 'Generator'],
                    ['beetleCertificateRegion', 'Beetle certificate region'],
                    ['plumbingCertificateRequired', 'Plumbing certificate required'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#d6e1ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                      <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => handleFormUpdate(key, event.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['occupationCertificateAvailable', 'Occupation certificate available'],
                    ['electricalCocAvailable', 'Electrical COC available'],
                    ['gasCocAvailable', 'Gas COC available'],
                    ['electricFenceCertificateAvailable', 'Electric fence certificate available'],
                    ['plumbingCertificateAvailable', 'Plumbing certificate available'],
                    ['solarComplianceAvailable', 'Solar compliance available'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[#d6e1ee] bg-white px-3 py-2 text-sm font-medium text-[#2a4057]">
                      <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => handleFormUpdate(key, event.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
              </article>
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
                    { label: 'Legal Classification', value: formatValue(form.canonicalPropertyType || 'inferred') },
                    { label: 'Address', value: [form.propertyAddress, form.suburb, form.city, form.province].filter(Boolean).join(', ') },
                    { label: showUnitDetails ? 'Unit / Complex' : 'Erf / Size', value: showUnitDetails ? [form.unitNumber, form.estateComplexName].filter(Boolean).join(' / ') : `${form.erfSize || 'Not provided'} m2` },
                  ]}
                />
                <ReviewCard
                  title="Occupancy & Finance"
                  onEdit={() => setCurrentStep(1)}
                  items={[
                    { label: 'Occupancy', value: formatValue(form.occupancyStatus) },
                    { label: 'Lease', value: form.leaseExists ? `Exists${form.leaseExpiryDate ? ` until ${form.leaseExpiryDate}` : ''}` : 'Not indicated' },
                    { label: 'Existing Bond', value: form.existingBond ? `Yes${form.bondBank ? ` - ${form.bondBank}` : ''}` : 'No' },
                    { label: 'Cancellation', value: form.existingBond ? (form.cancellationRequired ? 'Required' : 'Not indicated') : 'Not applicable' },
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
