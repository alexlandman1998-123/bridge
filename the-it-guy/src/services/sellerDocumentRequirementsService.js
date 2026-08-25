import { generateSellerDocumentRequirements } from '../lib/privateListingRequirementEngine.js'
import { buildPropertyDisclosureDocumentMarkup } from '../lib/propertyDisclosure.js'
import { buildSellerComplianceDocumentModel } from '../core/documents/sellerComplianceDocumentModel.js'
import {
  getSellerBasePackAliases,
  isSellerBasePackKey,
  normalizeSellerBasePackKey,
  sellerBasePackKeysOverlap,
  SELLER_BASE_PACK_COMPLETION_ROUTES,
  SELLER_BASE_PACK_KEYS,
  SELLER_BASE_PACK_REQUIRED_KEYS,
} from '../lib/sellerBasePackContract.js'
import { resolveSellerProcessProfileForOrganisation } from './sellerProcessProfileService.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapSellerOnboardingFormCandidate(candidate = null) {
  if (!isPlainObject(candidate)) return null
  if (isPlainObject(candidate?.formData)) return candidate.formData
  if (isPlainObject(candidate?.form_data)) return candidate.form_data
  return candidate
}

function compactTextParts(values = []) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(', ')
}

function resolveSellerDocumentBranding(listing = {}, formData = {}) {
  const listingBranding = isPlainObject(listing?.branding) ? listing.branding : {}
  const portalBranding = isPlainObject(formData?.portalBranding)
    ? formData.portalBranding
    : isPlainObject(formData?.portal_branding)
      ? formData.portal_branding
      : {}
  const organisationName = normalizeText(firstPresent(
    portalBranding.organisationName,
    portalBranding.organisation_name,
    portalBranding.agencyName,
    portalBranding.agency_name,
    listingBranding.organisationName,
    listingBranding.organisation_name,
    listingBranding.agencyName,
    listingBranding.agency_name,
    listing?.organisationName,
    listing?.organisation_name,
    listing?.agencyName,
    listing?.agency_name,
    listing?.agencyOrganisation,
    listing?.agency_organisation,
  ))
  const logoLightUrl = normalizeText(firstPresent(
    portalBranding.logoLightUrl,
    portalBranding.logo_light_url,
    portalBranding.logoLight,
    listingBranding.logoLightUrl,
    listingBranding.logo_light_url,
    listingBranding.logoLight,
    listing?.agencyLogoLightUrl,
    listing?.agency_logo_light_url,
    listing?.organisationLogoLightUrl,
    listing?.organisation_logo_light_url,
  ))
  const logoDarkUrl = normalizeText(firstPresent(
    portalBranding.logoDarkUrl,
    portalBranding.logo_dark_url,
    portalBranding.logoDark,
    listingBranding.logoDarkUrl,
    listingBranding.logo_dark_url,
    listingBranding.logoDark,
    listing?.agencyLogoDarkUrl,
    listing?.agency_logo_dark_url,
    listing?.organisationLogoDarkUrl,
    listing?.organisation_logo_dark_url,
  ))
  const logoUrl = normalizeText(firstPresent(
    logoLightUrl,
    portalBranding.logoUrl,
    portalBranding.logo_url,
    portalBranding.organisationLogoUrl,
    portalBranding.organisation_logo_url,
    listingBranding.logoUrl,
    listingBranding.logo_url,
    listingBranding.organisationLogoUrl,
    listingBranding.organisation_logo_url,
    listing?.agencyLogoUrl,
    listing?.agency_logo_url,
    listing?.organisationLogoUrl,
    listing?.organisation_logo_url,
    logoDarkUrl,
  ))
  const physicalAddress = normalizeText(firstPresent(
    portalBranding.physicalAddress,
    portalBranding.physical_address,
    portalBranding.organisationPhysicalAddress,
    portalBranding.organisation_physical_address,
    listingBranding.physicalAddress,
    listingBranding.physical_address,
    listingBranding.address,
    listing?.organisationPhysicalAddress,
    listing?.organisation_physical_address,
    listing?.agencyAddress,
    listing?.agency_address,
  ))

  return {
    ...listingBranding,
    ...portalBranding,
    organisationName,
    agencyName: organisationName,
    logoUrl,
    logoLightUrl,
    logoDarkUrl,
    website: normalizeText(firstPresent(portalBranding.website, portalBranding.organisationWebsite, listingBranding.website, listing?.organisationWebsite, listing?.website)),
    email: normalizeText(firstPresent(portalBranding.email, portalBranding.organisationEmail, listingBranding.email, listing?.organisationEmail, listing?.agencyEmail)),
    phone: normalizeText(firstPresent(portalBranding.phone, portalBranding.telephone, portalBranding.organisationPhone, listingBranding.phone, listingBranding.telephone, listing?.organisationPhone, listing?.agencyPhone)),
    physicalAddress,
  }
}

function resolveSellerDocumentPropertyAddress(listing = {}, formData = {}) {
  return normalizeText(firstPresent(
    formData?.propertyAddress,
    formData?.property_address,
    formData?.propertyDisplayAddress,
    formData?.property_display_address,
    listing?.propertyAddress,
    listing?.property_address,
    listing?.displayAddress,
    listing?.display_address,
    listing?.address,
    compactTextParts([
      listing?.streetAddress || listing?.street_address,
      listing?.suburb,
      listing?.city || listing?.town,
      listing?.province,
      listing?.postalCode || listing?.postal_code,
    ]),
  ))
}

export function normalizeSellerDocumentRequirementStatus(status = '') {
  const normalized = normalizeKey(status)
  if (['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable', 'cancelled'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted' || normalized === 'verified') return 'approved'
  if (normalized === 'submitted' || normalized === 'received' || normalized === 'pending_review' || normalized === 'pending') return 'uploaded'
  if (normalized === 'missing' || normalized === 'not_uploaded' || normalized === 'outstanding') return 'required'
  return normalized || 'required'
}

export function getSellerDocumentStatusLabel(status = '') {
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  const labels = {
    required: 'Outstanding',
    requested: 'Requested',
    uploaded: 'Uploaded',
    under_review: 'Under Review',
    rejected: 'Rejected',
    approved: 'Approved',
    completed: 'Completed',
    not_applicable: 'Not Applicable',
    cancelled: 'Cancelled',
  }
  return labels[normalized] || normalizeText(status).replace(/_/g, ' ') || 'Outstanding'
}

export function getSellerOnboardingFormData(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  return unwrapSellerOnboardingFormCandidate(onboarding) ||
    unwrapSellerOnboardingFormCandidate(listing?.onboardingDataSnapshot) ||
    unwrapSellerOnboardingFormCandidate(listing?.sellerOnboardingFormData) ||
    unwrapSellerOnboardingFormCandidate(listing?.seller_onboarding_form_data) ||
    {}
}

function requirementIdentity(requirement = {}) {
  const rawKey =
    requirement?.key ||
      requirement?.requirement_key ||
      requirement?.document_key ||
      requirement?.canonicalRequirementInstanceId ||
      requirement?.canonical_requirement_instance_id ||
      requirement?.label ||
      requirement?.requirement_name ||
      requirement?.name
  return normalizeSellerBasePackKey(rawKey) || normalizeKey(rawKey)
}

function requirementIsActive(requirement = {}) {
  const status = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  return requirement?.isRequired !== false &&
    requirement?.is_required !== false &&
    !['not_required', 'waived', 'cancelled', 'archived', 'not_applicable'].includes(status)
}

export function mergeSellerRequiredDocuments(...requirementLists) {
  const merged = []
  const seen = new Set()
  for (const requirement of requirementLists.flat()) {
    if (!requirement || typeof requirement !== 'object') continue
    if (!requirementIsActive(requirement)) continue
    const identity = requirementIdentity(requirement)
    if (identity && seen.has(identity)) continue
    if (identity) seen.add(identity)
    merged.push(requirement)
  }
  return merged
}

const STALE_PRE_ONBOARDING_REQUIREMENT_KEYS = new Set([
  'seller_contact_confirmation',
  'seller_onboarding_submission',
])

const STALE_INTERNAL_SELLER_CAPTURE_REQUIREMENT_PATTERNS = [
  /^owner_\d+_marital_status$/,
  /^owner_\d+_marital_status_declaration$/,
  /^ownership_split_confirmation$/,
]

function isStaleInternalSellerCaptureRequirement(requirement = {}) {
  const identity = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirementKey,
    requirement?.requirement_key,
    requirement?.documentType,
    requirement?.document_type,
    requirement?.name,
    requirement?.requirement_name,
    requirement?.label,
  ].filter(Boolean).join(' '))
  if (!identity) return false
  return STALE_INTERNAL_SELLER_CAPTURE_REQUIREMENT_PATTERNS.some((pattern) => pattern.test(identity)) ||
    (/owner_\d+/.test(identity) && identity.includes('marital_status') && identity.includes('declaration')) ||
    identity.includes('ownership_split_confirmation')
}

const KINGSTONS_BASELINE_SELLER_DOCUMENT_REQUIREMENTS = Object.freeze([
  Object.freeze({
    key: 'valuation_document',
    requirement_key: 'valuation_document',
    name: 'Formal Valuation Document',
    requirement_name: 'Formal Valuation Document',
    description: 'The completed formal valuation document prepared after the valuation appointment.',
    group: 'property',
    category: 'property',
    visibility: 'internal',
    status: 'required',
    is_required: true,
    requirementLane: 'baseline',
    requirement_lane: 'baseline',
    documentRequirementSection: 'property_documents',
    document_requirement_section: 'property_documents',
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
    requirement_key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
    name: 'Signed Mandate',
    requirement_name: 'Signed Mandate',
    description: 'The signed seller mandate.',
    group: 'legal',
    category: 'legal',
    visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    requirementLane: 'baseline',
    requirement_lane: 'baseline',
    documentRequirementSection: 'legal_documents',
    document_requirement_section: 'legal_documents',
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
    requirement_key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
    name: 'Signed Mandatory Disclosure / Defects Form',
    requirement_name: 'Signed Mandatory Disclosure / Defects Form',
    description: 'The completed and signed mandatory property disclosure form.',
    group: 'legal',
    category: 'legal',
    visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    requirementLane: 'baseline',
    requirement_lane: 'baseline',
    documentRequirementSection: 'legal_documents',
    document_requirement_section: 'legal_documents',
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    requirement_key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    name: 'Signed FICA Declaration',
    requirement_name: 'Signed FICA Declaration',
    description: 'The signed FICA declaration pack for the confirmed seller type.',
    group: 'legal',
    category: 'legal',
    visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    requirementLane: 'baseline',
    requirement_lane: 'baseline',
    documentRequirementSection: 'legal_documents',
    document_requirement_section: 'legal_documents',
  }),
])

const KINGSTONS_BASELINE_SELLER_DOCUMENT_KEYS = new Set(
  KINGSTONS_BASELINE_SELLER_DOCUMENT_REQUIREMENTS.flatMap((requirement) => [
    requirementIdentity(requirement),
    normalizeSellerBasePackKey(requirementIdentity(requirement)),
  ]).filter(Boolean),
)

const KINGSTONS_SELLER_OWNERSHIP_CAPTURE_VERSION = 'kingstons_seller_ownership_capture_phase3_v1'
const KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE4_VERSION = 'kingstons_seller_documents_phase4_dynamic_fica_v1'
const KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE6_VERSION = 'kingstons_seller_documents_phase6_authority_documents_v1'

const STALE_GENERATED_SELLER_REQUIREMENT_KEYS = new Set([
  'alteration_approvals',
  'approved_building_plans',
  'beetle_certificate',
  'borehole_certificate',
  'electric_fence_certificate',
  'gas_compliance_certificate',
  'occupation_certificate',
  'plumbing_certificate',
  'property_acquisition_record',
  'capital_improvement_records',
  'solar_compliance_documents',
  'water_installation_certificate',
])

const CONDITIONALLY_TRIGGERED_SELLER_REQUIREMENT_KEYS = new Set([
  'alteration_approvals',
  'approved_building_plans',
  'beetle_certificate',
  'borehole_certificate',
  'electric_fence_certificate',
  'gas_compliance_certificate',
  'occupation_certificate',
  'plumbing_certificate',
  'solar_compliance_documents',
  'water_installation_certificate',
])

function hasSubmittedSellerOnboarding(status = '') {
  return ['completed', 'complete', 'submitted', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'].includes(normalizeKey(status))
}

function coerceSellerDocumentLifecycle(listing = {}, formData = {}) {
  const onboardingStatus = firstPresent(
    listing?.sellerOnboardingStatus,
    listing?.seller_onboarding_status,
    listing?.sellerOnboarding?.status,
    listing?.seller_onboarding?.status,
  )
  const lifecycleStatus = normalizeKey(firstPresent(
    listing?.lifecycleStatus,
    listing?.lifecycle_status,
    listing?.listingStatus,
    listing?.listing_status,
    listing?.status,
    listing?.stage,
  ))
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  const shouldPromote = hasOnboardingFacts || hasSubmittedSellerOnboarding(onboardingStatus)

  if (!shouldPromote || !['', 'seller_lead', 'onboarding_sent'].includes(lifecycleStatus)) {
    return listing
  }

  return {
    ...listing,
    lifecycleStatus: 'onboarding_completed',
    lifecycle_status: 'onboarding_completed',
    listingStatus: 'onboarding_completed',
    listing_status: 'onboarding_completed',
    status: 'onboarding_completed',
  }
}

function filterStalePersistedRequirements(requirements = [], listing = {}, formData = {}) {
  const onboardingStatus = firstPresent(
    listing?.sellerOnboardingStatus,
    listing?.seller_onboarding_status,
    listing?.sellerOnboarding?.status,
    listing?.seller_onboarding?.status,
  )
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  if (!hasOnboardingFacts && !hasSubmittedSellerOnboarding(onboardingStatus)) return Array.isArray(requirements) ? requirements : []

  return (Array.isArray(requirements) ? requirements : []).filter((requirement) => {
    const key = requirementIdentity(requirement)
    return !STALE_PRE_ONBOARDING_REQUIREMENT_KEYS.has(key) &&
      !isStaleInternalSellerCaptureRequirement(requirement)
  })
}

function filterStaleGeneratedRequirementsAgainstDerived(persisted = [], derived = []) {
  const activeDerived = mergeSellerRequiredDocuments(derived)
  const derivedKeys = new Set((Array.isArray(derived) ? derived : []).map((requirement) => requirementIdentity(requirement)).filter(Boolean))
  const activeDerivedKeys = new Set(activeDerived.map((requirement) => requirementIdentity(requirement)).filter(Boolean))
  return (Array.isArray(persisted) ? persisted : []).filter((requirement) => {
    const key = requirementIdentity(requirement)
    if (!STALE_GENERATED_SELLER_REQUIREMENT_KEYS.has(key)) return true
    if (CONDITIONALLY_TRIGGERED_SELLER_REQUIREMENT_KEYS.has(key)) return derivedKeys.has(key)
    return activeDerivedKeys.has(key)
  })
}

function isKingstonsSellerDocumentContext(listing = {}) {
  try {
    return resolveSellerProcessProfileForOrganisation(listing).isKingstons === true
  } catch {
    return false
  }
}

function filterKingstonsPersistedBaselineRequirements(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).filter((requirement) => {
    const key = requirementIdentity(requirement)
    return KINGSTONS_BASELINE_SELLER_DOCUMENT_KEYS.has(key) ||
      KINGSTONS_BASELINE_SELLER_DOCUMENT_KEYS.has(normalizeSellerBasePackKey(key))
  })
}

function getKingstonsBaselineSellerDocumentRequirements(persisted = []) {
  return mergeSellerRequiredDocuments(
    filterKingstonsPersistedBaselineRequirements(persisted),
    KINGSTONS_BASELINE_SELLER_DOCUMENT_REQUIREMENTS,
  )
}

function coercePlainObject(value = null) {
  if (isPlainObject(value)) return value
  if (typeof value !== 'string') return {}
  const trimmed = value.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getKingstonsSellerPackRecord(listing = {}) {
  const rawPayload = {
    ...coercePlainObject(listing?.rawPayload),
    ...coercePlainObject(listing?.raw_payload),
    ...coercePlainObject(listing?.rawEnquiryPayload),
    ...coercePlainObject(listing?.raw_enquiry_payload),
  }
  return [
    listing?.kingstonsSellerPack,
    listing?.kingstons_seller_pack,
    listing?.sellerPack,
    listing?.seller_pack,
    listing?.sellerPackHandoff,
    listing?.seller_pack_handoff,
    listing?.sellerPackProfile,
    listing?.seller_pack_profile,
    listing?.legalPath,
    listing?.legal_path,
    rawPayload.kingstonsSellerPack,
    rawPayload.kingstons_seller_pack,
    rawPayload.sellerPack,
    rawPayload.seller_pack,
  ].find((candidate) => isPlainObject(candidate)) || {}
}

function buildKingstonsSellerPackUploadedDocuments(pack = {}) {
  const documents = coercePlainObject(pack?.documents || pack?.sellerPackDocuments || pack?.seller_pack_documents)
  return Object.entries(documents)
    .map(([documentKey, documentRecord]) => {
      if (!isPlainObject(documentRecord)) return null
      const key = normalizeKey(documentRecord.key || documentRecord.requirementKey || documentRecord.requirement_key || documentKey)
      if (!key) return null
      return {
        ...documentRecord,
        key,
        requirementKey: key,
        requirement_key: key,
        document_type: key,
        documentType: key,
        document_name: firstPresent(documentRecord.document_name, documentRecord.name, documentRecord.label, key),
        category: firstPresent(documentRecord.category, documentRecord.document_category, documentRecord.documentCategory, 'seller'),
        document_category: firstPresent(documentRecord.document_category, documentRecord.documentCategory, documentRecord.category, 'seller'),
        requirementLane: documentRecord.requirementLane || documentRecord.requirement_lane,
        requirement_lane: documentRecord.requirement_lane || documentRecord.requirementLane,
        documentRequirementSection: documentRecord.documentRequirementSection || documentRecord.document_requirement_section,
        document_requirement_section: documentRecord.document_requirement_section || documentRecord.documentRequirementSection,
      }
    })
    .filter(Boolean)
}

function filterKingstonsSellerPackUploadedDocumentsForStage(pack = {}, documents = []) {
  if (hasKingstonsSellerPackDetailsCompletionSignal(pack)) return documents
  return (Array.isArray(documents) ? documents : []).filter((document) =>
    KINGSTONS_BASELINE_SELLER_DOCUMENT_KEYS.has(requirementIdentity(document)),
  )
}

function getKingstonsSellerPackLegalPath(pack = {}) {
  return [
    pack?.legalPath,
    pack?.legal_path,
    pack?.sellerPackProfile,
    pack?.seller_pack_profile,
    pack?.sellerProfile,
    pack?.seller_profile,
    pack,
  ].find((candidate) => isPlainObject(candidate)) || {}
}

function hasKingstonsSellerPackDetailsCompletionSignal(pack = {}) {
  const legalPath = getKingstonsSellerPackLegalPath(pack)
  const status = normalizeKey(firstPresent(
    pack?.sellerPackStatus,
    pack?.seller_pack_status,
    pack?.status,
    legalPath?.status,
  ))
  return Boolean(
    firstPresent(
      pack?.sellerPackDetailsCapturedAt,
      pack?.seller_pack_details_captured_at,
      pack?.detailsCapturedAt,
      pack?.details_captured_at,
      pack?.sellerPackReadinessCompletedAt,
      pack?.seller_pack_readiness_completed_at,
      pack?.readinessCompletedAt,
      pack?.readiness_completed_at,
      legalPath?.capturedAt,
      legalPath?.captured_at,
    ) ||
      pack?.sellerPackDetailsComplete === true ||
      pack?.seller_pack_details_complete === true ||
      pack?.sellerPackReadinessComplete === true ||
      pack?.seller_pack_readiness_complete === true ||
      pack?.readinessComplete === true ||
      pack?.readiness_complete === true ||
      ['details_captured', 'ready_for_generation', 'readiness_complete', 'complete', 'completed'].includes(status)
  )
}

function splitKingstonsPersonText(value = '') {
  return normalizeText(value)
    .split(/\r?\n|,/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function normalizeKingstonsSellerEntityType(value = '') {
  const normalized = normalizeKey(value)
  if (['cc', 'close_corporation', 'close_corporation_member', 'close_corporation_members'].includes(normalized)) return 'close_corporation'
  if (['pty', 'pty_ltd', 'private_company'].includes(normalized)) return 'company'
  return normalized
}

function normalizeKingstonsPersonRecord(value = {}, index = 0, role = 'person') {
  if (typeof value === 'string') {
    const name = normalizeText(value)
    return name
      ? {
          id: `${normalizeKey(role) || 'person'}-${index + 1}`,
          role,
          name,
          idNumber: '',
          id_number: '',
          email: '',
          phone: '',
        }
      : null
  }
  if (!isPlainObject(value)) return null
  const name = normalizeText(firstPresent(
    value.name,
    value.fullName,
    value.full_name,
    value.displayName,
    value.display_name,
    value.label,
  ))
  const idNumber = normalizeText(firstPresent(
    value.idNumber,
    value.id_number,
    value.identityNumber,
    value.identity_number,
    value.nationalId,
    value.national_id,
  ))
  const email = normalizeText(value.email).toLowerCase()
  const phone = normalizeText(firstPresent(value.phone, value.mobile, value.mobileNumber, value.mobile_number))
  if (!name && !idNumber && !email && !phone) return null
  return {
    id: normalizeText(firstPresent(value.id, value.personId, value.person_id, `${normalizeKey(role) || 'person'}-${index + 1}`)),
    role,
    name,
    idNumber,
    id_number: idNumber,
    email,
    phone,
  }
}

function normalizeKingstonsPersonRecords(value = [], role = 'person') {
  const sources = []
  const collect = (candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(collect)
      return
    }
    if (typeof candidate === 'string') {
      splitKingstonsPersonText(candidate).forEach((name) => sources.push(name))
      return
    }
    if (isPlainObject(candidate)) sources.push(candidate)
  }
  collect(value)
  return sources
    .map((candidate, index) => normalizeKingstonsPersonRecord(candidate, index, role))
    .filter(Boolean)
}

function mergeKingstonsPersonRecords(...recordSets) {
  const merged = []
  const seen = new Set()
  recordSets.flat().forEach((record) => {
    const normalized = normalizeKingstonsPersonRecord(record, merged.length, record?.role || 'person')
    if (!normalized) return
    const identity = normalizeKey(normalized.idNumber || normalized.email || normalized.name || normalized.id)
    if (identity && seen.has(identity)) return
    if (identity) seen.add(identity)
    merged.push({
      ...normalized,
      id: normalized.id || `${normalizeKey(normalized.role) || 'person'}-${merged.length + 1}`,
    })
  })
  return merged
}

function buildKingstonsRequirementKey(prefix = 'seller_fica', person = {}, index = 0) {
  const identity = normalizeKey(firstPresent(person.idNumber, person.email, person.name, person.id))
  return `${normalizeKey(prefix) || 'seller_fica'}_${identity || index + 1}`
}

function buildKingstonsPersonFicaRequirement({
  keyPrefix,
  titlePrefix,
  description,
  person = {},
  index = 0,
  section = 'seller_identity_fica',
}) {
  const key = buildKingstonsRequirementKey(keyPrefix, person, index)
  const partyName = normalizeText(person.name) || `${titlePrefix} ${index + 1}`
  const name = `${titlePrefix}: ${partyName}`
  return {
    key,
    requirement_key: key,
    name,
    requirement_name: name,
    description,
    group: 'seller_identity_fica',
    category: 'seller',
    visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    requirementLane: 'ownership_driven',
    requirement_lane: 'ownership_driven',
    documentRequirementSection: section,
    document_requirement_section: section,
    generatedBy: KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE4_VERSION,
    generated_by: KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE4_VERSION,
    partyRole: normalizeKey(person.role),
    party_role: normalizeKey(person.role),
    partyName,
    party_name: partyName,
    partyIdNumber: normalizeText(person.idNumber || person.id_number),
    party_id_number: normalizeText(person.idNumber || person.id_number),
    partyEmail: normalizeText(person.email).toLowerCase(),
    party_email: normalizeText(person.email).toLowerCase(),
  }
}

function buildKingstonsAuthorityDocumentRequirement({
  key,
  name,
  description,
  partyRole = '',
  partyName = '',
  entityType = '',
} = {}) {
  const normalizedKey = normalizeKey(key)
  const normalizedEntityType = normalizeKingstonsSellerEntityType(entityType)
  return {
    key: normalizedKey,
    requirement_key: normalizedKey,
    name,
    requirement_name: name,
    description,
    group: 'authority_documents',
    category: 'legal',
    visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    requirementLane: 'ownership_driven',
    requirement_lane: 'ownership_driven',
    documentRequirementSection: 'authority_documents',
    document_requirement_section: 'authority_documents',
    generatedBy: KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE6_VERSION,
    generated_by: KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE6_VERSION,
    partyRole: normalizeKey(partyRole),
    party_role: normalizeKey(partyRole),
    partyName: normalizeText(partyName),
    party_name: normalizeText(partyName),
    entityType: normalizedEntityType,
    entity_type: normalizedEntityType,
  }
}

export function buildKingstonsAuthorityDocumentRequirements(ownershipProfile = {}) {
  if (ownershipProfile?.captured !== true) return []
  const requirements = []
  const sellerType = normalizeKey(ownershipProfile.sellerType)
  const naturalSetup = normalizeKey(ownershipProfile.natural?.maritalSetup || ownershipProfile.naturalSetup)
  const juristicEntityType = normalizeKingstonsSellerEntityType(ownershipProfile.juristicEntityType || ownershipProfile.juristic?.entityType)

  if (sellerType === 'natural') {
    const owners = Array.isArray(ownershipProfile.natural?.owners) && ownershipProfile.natural.owners.length
      ? ownershipProfile.natural.owners
      : ownershipProfile.owners || []
    if (owners.length > 1) {
      requirements.push(buildKingstonsAuthorityDocumentRequirement({
        key: 'all_owner_authority_consent',
        name: 'All Owner Authority Consent',
        description: 'Written authority confirming every registered natural-person owner consents to the mandate and sale process.',
        partyRole: 'owner',
        partyName: `${owners.length} owners`,
        entityType: 'natural',
      }))
    }
    if (naturalSetup === 'in_community') {
      requirements.push(buildKingstonsAuthorityDocumentRequirement({
        key: 'spouse_consent',
        name: 'Spouse Consent',
        description: 'Spouse consent required where the seller is married in community of property.',
        partyRole: 'spouse',
        partyName: ownershipProfile.natural?.spouse?.name,
        entityType: 'natural',
      }))
    }
  }

  if (sellerType === 'juristic' && juristicEntityType === 'company') {
    requirements.push(buildKingstonsAuthorityDocumentRequirement({
      key: 'company_resolution_to_sell',
      name: 'Company Resolution To Sell',
      description: 'Directors resolution authorising the sale/listing and confirming the authorised signatory.',
      partyRole: 'director',
      partyName: ownershipProfile.juristic?.company?.name,
      entityType: 'company',
    }))
  }

  if (sellerType === 'juristic' && juristicEntityType === 'trust') {
    requirements.push(buildKingstonsAuthorityDocumentRequirement({
      key: 'seller_trust_deed',
      name: 'Trust Deed',
      description: 'Trust deed confirming the trust structure and trustee powers.',
      partyRole: 'trustee',
      partyName: ownershipProfile.juristic?.trust?.name,
      entityType: 'trust',
    }))
    requirements.push(buildKingstonsAuthorityDocumentRequirement({
      key: 'seller_letters_of_authority',
      name: 'Letters Of Authority',
      description: 'Letters of authority issued by the Master confirming the current trustees.',
      partyRole: 'trustee',
      partyName: ownershipProfile.juristic?.trust?.name,
      entityType: 'trust',
    }))
    requirements.push(buildKingstonsAuthorityDocumentRequirement({
      key: 'trust_resolution_to_sell',
      name: 'Trust Resolution To Sell',
      description: 'Trustee resolution authorising the sale/listing and confirming the authorised signatory.',
      partyRole: 'trustee',
      partyName: ownershipProfile.juristic?.trust?.name,
      entityType: 'trust',
    }))
  }

  if (sellerType === 'juristic' && juristicEntityType === 'close_corporation') {
    requirements.push(buildKingstonsAuthorityDocumentRequirement({
      key: 'close_corporation_resolution_to_sell',
      name: 'Close Corporation Resolution To Sell',
      description: 'Members resolution authorising the sale/listing and confirming the authorised signatory.',
      partyRole: 'member',
      partyName: ownershipProfile.juristic?.closeCorporation?.name,
      entityType: 'close_corporation',
    }))
  }

  return mergeSellerRequiredDocuments(requirements)
}

export function buildKingstonsOwnershipDrivenDocumentRequirements(ownershipProfile = {}) {
  if (ownershipProfile?.captured !== true) return []
  const requirements = buildKingstonsAuthorityDocumentRequirements(ownershipProfile)
  const sellerType = normalizeKey(ownershipProfile.sellerType)
  const juristicEntityType = normalizeKingstonsSellerEntityType(ownershipProfile.juristicEntityType || ownershipProfile.juristic?.entityType)

  if (sellerType === 'natural') {
    const owners = Array.isArray(ownershipProfile.natural?.owners) && ownershipProfile.natural.owners.length
      ? ownershipProfile.natural.owners
      : ownershipProfile.owners || []
    owners.forEach((owner, index) => {
      requirements.push(buildKingstonsPersonFicaRequirement({
        keyPrefix: 'owner_fica',
        titlePrefix: 'Owner FICA',
        description: 'FICA supporting documents for this registered natural-person owner.',
        person: { ...owner, role: 'owner' },
        index,
      }))
    })
    if (ownershipProfile.natural?.requiresSpouseDetails && normalizeText(ownershipProfile.natural?.spouse?.name)) {
      requirements.push(buildKingstonsPersonFicaRequirement({
        keyPrefix: 'spouse_fica',
        titlePrefix: 'Spouse FICA',
        description: 'FICA supporting documents for the spouse required on this signing path.',
        person: { ...ownershipProfile.natural.spouse, role: 'spouse' },
        index: 0,
      }))
    }
  }

  if (sellerType === 'juristic' && juristicEntityType === 'company') {
    const directors = Array.isArray(ownershipProfile.juristic?.company?.directors)
      ? ownershipProfile.juristic.company.directors
      : []
    directors.forEach((director, index) => {
      requirements.push(buildKingstonsPersonFicaRequirement({
        keyPrefix: 'director_fica',
        titlePrefix: 'Director FICA',
        description: 'FICA supporting documents for this company director.',
        person: { ...director, role: 'director' },
        index,
      }))
    })
  }

  if (sellerType === 'juristic' && juristicEntityType === 'trust') {
    const trustees = Array.isArray(ownershipProfile.juristic?.trust?.trustees)
      ? ownershipProfile.juristic.trust.trustees
      : []
    trustees.forEach((trustee, index) => {
      requirements.push(buildKingstonsPersonFicaRequirement({
        keyPrefix: 'trustee_fica',
        titlePrefix: 'Trustee FICA',
        description: 'FICA supporting documents for this trust trustee.',
        person: { ...trustee, role: 'trustee' },
        index,
      }))
    })
  }

  if (sellerType === 'juristic' && juristicEntityType === 'close_corporation') {
    const members = Array.isArray(ownershipProfile.juristic?.closeCorporation?.members)
      ? ownershipProfile.juristic.closeCorporation.members
      : []
    members.forEach((member, index) => {
      requirements.push(buildKingstonsPersonFicaRequirement({
        keyPrefix: 'member_fica',
        titlePrefix: 'Member FICA',
        description: 'FICA supporting documents for this close corporation member.',
        person: { ...member, role: 'member' },
        index,
      }))
    })
  }

  return mergeSellerRequiredDocuments(requirements)
}

export function resolveKingstonsSellerOwnershipProfile(listing = {}) {
  const pack = getKingstonsSellerPackRecord(listing)
  const legalPath = getKingstonsSellerPackLegalPath(pack)
  const natural = isPlainObject(legalPath?.natural) ? legalPath.natural : {}
  const juristic = isPlainObject(legalPath?.juristic) ? legalPath.juristic : {}
  const company = isPlainObject(juristic?.company) ? juristic.company : {}
  const trust = isPlainObject(juristic?.trust) ? juristic.trust : {}
  const closeCorporation = isPlainObject(juristic?.closeCorporation)
    ? juristic.closeCorporation
    : isPlainObject(juristic?.close_corporation)
      ? juristic.close_corporation
      : {}
  const sellerType = normalizeKey(firstPresent(
    pack?.sellerType,
    pack?.seller_type,
    legalPath?.sellerType,
    legalPath?.seller_type,
    legalPath?.legalPathType,
    legalPath?.legal_path_type,
  ))
  const naturalSetup = normalizeKey(firstPresent(
    pack?.naturalSetup,
    pack?.natural_setup,
    pack?.maritalSetup,
    pack?.marital_setup,
    pack?.maritalRegime,
    pack?.marital_regime,
    legalPath?.naturalSetup,
    legalPath?.natural_setup,
    natural?.maritalSetup,
    natural?.marital_setup,
    natural?.maritalRegime,
    natural?.marital_regime,
  ))
  const juristicEntityType = normalizeKingstonsSellerEntityType(firstPresent(
    pack?.juristicEntityType,
    pack?.juristic_entity_type,
    pack?.entityType,
    pack?.entity_type,
    legalPath?.juristicEntityType,
    legalPath?.juristic_entity_type,
    juristic?.entityType,
    juristic?.entity_type,
  ))
  const spouse = [
    legalPath?.spouse,
    pack?.spouse,
    natural?.spouse,
    {
      name: firstPresent(pack?.spouseName, pack?.spouse_name),
      idNumber: firstPresent(pack?.spouseIdNumber, pack?.spouse_id_number),
      email: firstPresent(pack?.spouseEmail, pack?.spouse_email),
      phone: firstPresent(pack?.spousePhone, pack?.spouse_phone),
    },
  ].map((candidate, index) => normalizeKingstonsPersonRecord(candidate, index, 'spouse')).find(Boolean) || null
  const owners = mergeKingstonsPersonRecords(
    normalizeKingstonsPersonRecords(legalPath?.owners, 'owner'),
    normalizeKingstonsPersonRecords(natural?.owners, 'owner'),
    normalizeKingstonsPersonRecords(pack?.owners, 'owner'),
  )
  const directors = mergeKingstonsPersonRecords(
    normalizeKingstonsPersonRecords(company?.directors, 'director'),
    normalizeKingstonsPersonRecords(pack?.companyDirectors, 'director'),
    normalizeKingstonsPersonRecords(pack?.company_directors, 'director'),
  )
  const trustees = mergeKingstonsPersonRecords(
    normalizeKingstonsPersonRecords(trust?.trustees, 'trustee'),
    normalizeKingstonsPersonRecords(pack?.trustees, 'trustee'),
    normalizeKingstonsPersonRecords(pack?.trustees_list, 'trustee'),
  )
  const members = mergeKingstonsPersonRecords(
    normalizeKingstonsPersonRecords(closeCorporation?.members, 'member'),
    normalizeKingstonsPersonRecords(pack?.closeCorporationMembers, 'member'),
    normalizeKingstonsPersonRecords(pack?.close_corporation_members, 'member'),
  )
  const capturedAt = normalizeText(firstPresent(
    pack?.sellerPackDetailsCapturedAt,
    pack?.seller_pack_details_captured_at,
    pack?.detailsCapturedAt,
    pack?.details_captured_at,
    legalPath?.capturedAt,
    legalPath?.captured_at,
  ))
  const captured = Boolean(
    capturedAt ||
      sellerType ||
      naturalSetup ||
      juristicEntityType ||
      owners.length ||
      directors.length ||
      trustees.length ||
      members.length ||
      spouse,
  )

  return {
    version: KINGSTONS_SELLER_OWNERSHIP_CAPTURE_VERSION,
    captured,
    capturedAt,
    sellerType,
    legalPathType: sellerType,
    naturalSetup,
    juristicEntityType,
    pathKey: sellerType === 'juristic' && juristicEntityType ? `juristic_${juristicEntityType}` : sellerType,
    owners,
    natural: {
      maritalSetup: naturalSetup,
      maritalRegime: naturalSetup,
      owners,
      spouse: spouse || {
        id: 'spouse-1',
        role: 'spouse',
        name: '',
        idNumber: '',
        id_number: '',
        email: '',
        phone: '',
      },
      requiresSpouseDetails: naturalSetup === 'in_community',
    },
    juristic: {
      entityType: juristicEntityType,
      company: {
        name: normalizeText(firstPresent(company?.name, pack?.companyName, pack?.company_name)),
        registrationNumber: normalizeText(firstPresent(
          company?.registrationNumber,
          company?.registration_number,
          pack?.companyRegistrationNumber,
          pack?.company_registration_number,
        )),
        directors,
      },
      trust: {
        name: normalizeText(firstPresent(trust?.name, pack?.trustName, pack?.trust_name)),
        registrationNumber: normalizeText(firstPresent(
          trust?.registrationNumber,
          trust?.registration_number,
          pack?.trustRegistrationNumber,
          pack?.trust_registration_number,
        )),
        trustees,
      },
      closeCorporation: {
        name: normalizeText(firstPresent(
          closeCorporation?.name,
          pack?.closeCorporationName,
          pack?.close_corporation_name,
          juristicEntityType === 'close_corporation' ? company?.name : '',
          juristicEntityType === 'close_corporation' ? pack?.companyName : '',
        )),
        registrationNumber: normalizeText(firstPresent(
          closeCorporation?.registrationNumber,
          closeCorporation?.registration_number,
          pack?.closeCorporationRegistrationNumber,
          pack?.close_corporation_registration_number,
          juristicEntityType === 'close_corporation' ? company?.registrationNumber : '',
          juristicEntityType === 'close_corporation' ? pack?.companyRegistrationNumber : '',
        )),
        members,
      },
    },
    counts: {
      owners: owners.length,
      directors: directors.length,
      trustees: trustees.length,
      members: members.length,
    },
    ownerCount: owners.length,
    directorCount: directors.length,
    trusteeCount: trustees.length,
    memberCount: members.length,
  }
}

function resolveKingstonsOwnershipCapture(listing = {}) {
  const profile = resolveKingstonsSellerOwnershipProfile(listing)
  const pack = getKingstonsSellerPackRecord(listing)
  const documentsUnlocked = profile.captured === true && hasKingstonsSellerPackDetailsCompletionSignal(pack)
  return {
    captured: profile.captured,
    documentsUnlocked,
    capturedAt: profile.capturedAt,
    sellerType: profile.sellerType,
    naturalSetup: profile.naturalSetup,
    juristicEntityType: profile.juristicEntityType,
    ownerCount: profile.ownerCount,
    directorCount: profile.directorCount,
    trusteeCount: profile.trusteeCount,
    memberCount: profile.memberCount,
    pathKey: profile.pathKey,
  }
}

function isKingstonsOwnershipDrivenRequirement(requirement = {}) {
  const key = requirementIdentity(requirement)
  if (!key || KINGSTONS_BASELINE_SELLER_DOCUMENT_KEYS.has(key) || STALE_PRE_ONBOARDING_REQUIREMENT_KEYS.has(key)) return false
  const lane = normalizeKey(firstPresent(
    requirement?.requirementLane,
    requirement?.requirement_lane,
    requirement?.documentRequirementLane,
    requirement?.document_requirement_lane,
    requirement?.lane,
  ))
  const section = normalizeKey(firstPresent(
    requirement?.documentRequirementSection,
    requirement?.document_requirement_section,
    requirement?.section,
  ))
  return lane === 'ownership_driven' ||
    section === 'seller_identity_fica' ||
    section === 'authority_documents'
}

function filterKingstonsPersistedOwnershipDrivenRequirements(requirements = [], ownershipCapture = {}) {
  if (ownershipCapture?.documentsUnlocked !== true) return []
  return (Array.isArray(requirements) ? requirements : []).filter(isKingstonsOwnershipDrivenRequirement)
}

export function buildKingstonsSellerDocumentRequirementPack(listing = {}, formData = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const persisted = filterStalePersistedRequirements(listing?.documentRequirements, listing, resolvedFormData)
  const ownershipProfile = resolveKingstonsSellerOwnershipProfile(listing)
  const ownershipCapture = resolveKingstonsOwnershipCapture(listing)
  const baselineDocuments = getKingstonsBaselineSellerDocumentRequirements(persisted)
  const generatedOwnershipDrivenDocuments = ownershipCapture.documentsUnlocked
    ? buildKingstonsOwnershipDrivenDocumentRequirements(ownershipProfile)
    : []
  const ownershipDrivenDocuments = mergeSellerRequiredDocuments(
    filterKingstonsPersistedOwnershipDrivenRequirements(persisted, ownershipCapture),
    generatedOwnershipDrivenDocuments,
  )

  return {
    version: KINGSTONS_SELLER_DOCUMENT_REQUIREMENTS_PHASE6_VERSION,
    baselineDocuments,
    generatedOwnershipDrivenDocuments,
    ownershipDrivenDocuments,
    requiredDocuments: mergeSellerRequiredDocuments(baselineDocuments, ownershipDrivenDocuments),
    ownershipCapture,
    ownershipProfile,
    ownershipDrivenState: ownershipCapture.documentsUnlocked
      ? 'ready_for_generation'
      : ownershipCapture.captured
        ? 'pending_details_completion'
        : 'pending_capture',
  }
}

export function getSellerRequiredDocuments(listing = {}, formData = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const persisted = filterStalePersistedRequirements(listing?.documentRequirements, listing, resolvedFormData)
  if (isKingstonsSellerDocumentContext(listing)) {
    return buildKingstonsSellerDocumentRequirementPack(listing, resolvedFormData).requiredDocuments
  }
  const hasOnboardingFacts = resolvedFormData && typeof resolvedFormData === 'object' && Object.keys(resolvedFormData).length > 0
  try {
    const requirementListing = coerceSellerDocumentLifecycle(listing, resolvedFormData)
    const derived = (!persisted.length || hasOnboardingFacts)
      ? generateSellerDocumentRequirements({
          ...requirementListing,
          sellerOnboarding: {
            ...(requirementListing?.sellerOnboarding && typeof requirementListing.sellerOnboarding === 'object' ? requirementListing.sellerOnboarding : {}),
            status: firstPresent(
              requirementListing?.sellerOnboardingStatus,
              requirementListing?.seller_onboarding_status,
              requirementListing?.sellerOnboarding?.status,
              requirementListing?.seller_onboarding?.status,
              'completed',
            ),
            formData: resolvedFormData,
          },
        })
      : []
    return mergeSellerRequiredDocuments(filterStaleGeneratedRequirementsAgainstDerived(persisted, derived), derived)
  } catch (error) {
    console.warn('[seller-document-requirements] Failed to derive seller document requirements', {
      listingId: listing?.id || null,
      error,
    })
    return mergeSellerRequiredDocuments(persisted)
  }
}

export function getExpectedSellerDocumentRequirements(listing = {}, formData = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  if (isKingstonsSellerDocumentContext(listing)) {
    return buildKingstonsSellerDocumentRequirementPack(listing, resolvedFormData).requiredDocuments
  }
  const requirementListing = coerceSellerDocumentLifecycle(listing, resolvedFormData)
  try {
    return mergeSellerRequiredDocuments(generateSellerDocumentRequirements({
      ...requirementListing,
      sellerOnboarding: {
        ...(requirementListing?.sellerOnboarding && typeof requirementListing.sellerOnboarding === 'object' ? requirementListing.sellerOnboarding : {}),
        status: firstPresent(
          requirementListing?.sellerOnboardingStatus,
          requirementListing?.seller_onboarding_status,
          requirementListing?.sellerOnboarding?.status,
          requirementListing?.seller_onboarding?.status,
          'completed',
        ),
        formData: resolvedFormData,
      },
    }))
  } catch (error) {
    console.warn('[seller-document-requirements] Failed to derive expected seller document requirements', {
      listingId: listing?.id || null,
      error,
    })
    return []
  }
}

function getRequirementKey(requirement = {}) {
  return normalizeKey(
    requirement?.key ||
      requirement?.requirementKey ||
      requirement?.requirement_key ||
      requirement?.document_key ||
      requirement?.label ||
      requirement?.requirement_name ||
      requirement?.name,
  )
}

function getUniqueRequirementKeys(requirements = []) {
  return [...new Set((Array.isArray(requirements) ? requirements : [])
    .map((requirement) => getRequirementKey(requirement))
    .filter(Boolean))]
}

function getPersistedActiveRequirementKeys(requirements = []) {
  return getUniqueRequirementKeys((Array.isArray(requirements) ? requirements : []).filter(requirementIsActive))
}

export function buildSellerDocumentRequirementReconciliationRecord(listing = {}, options = {}) {
  const formData = isPlainObject(options.formData) && Object.keys(options.formData).length
    ? options.formData
    : getSellerOnboardingFormData(listing)
  const expectedRequirements = getExpectedSellerDocumentRequirements(listing, formData)
  const expectedKeys = getUniqueRequirementKeys(expectedRequirements)
  const persistedRequirements = Array.isArray(listing?.documentRequirements)
    ? listing.documentRequirements
    : Array.isArray(listing?.document_requirements)
      ? listing.document_requirements
      : []
  const persistedActiveKeys = getPersistedActiveRequirementKeys(persistedRequirements)
  const persistedAllKeys = getUniqueRequirementKeys(persistedRequirements)
  const missingRequirementKeys = expectedKeys.filter((key) => !persistedActiveKeys.includes(key))
  const staleRequirementKeys = persistedActiveKeys.filter((key) => !expectedKeys.includes(key))
  const hasOnboardingFacts = isPlainObject(formData) && Object.keys(formData).length > 0
  const hasPersistedRequirements = persistedAllKeys.length > 0
  const needsSync = Boolean(missingRequirementKeys.length || staleRequirementKeys.length || !hasPersistedRequirements)
  const listingId = normalizeText(listing?.id || listing?.private_listing_id)

  return {
    listingId,
    sellerLeadId: normalizeText(listing?.sellerLeadId || listing?.seller_lead_id || listing?.originatingCrmLeadId || listing?.originating_crm_lead_id),
    organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
    title: normalizeText(listing?.title || listing?.listingTitle || listing?.listing_reference || listing?.listingReference || listingId),
    listingStatus: normalizeText(listing?.listingStatus || listing?.listing_status || listing?.status),
    sellerOnboardingStatus: normalizeText(listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || listing?.sellerOnboarding?.status || listing?.seller_onboarding?.status),
    expectedRequirementKeys: expectedKeys,
    persistedRequirementKeys: persistedActiveKeys,
    persistedAllRequirementKeys: persistedAllKeys,
    missingRequirementKeys,
    staleRequirementKeys,
    hasOnboardingFacts,
    hasPersistedRequirements,
    canSync: Boolean(listingId && needsSync),
    status: needsSync ? 'needs_sync' : 'ready',
    recommendedAction: needsSync
      ? 'sync_private_listing_document_requirements'
      : 'none',
  }
}

export function buildSellerDocumentRequirementReconciliationReport(listings = [], options = {}) {
  const rows = (Array.isArray(listings) ? listings : [])
    .map((listing) => buildSellerDocumentRequirementReconciliationRecord(listing))
  const summary = rows.reduce((accumulator, row) => {
    accumulator.total += 1
    accumulator.ready += row.status === 'ready' ? 1 : 0
    accumulator.needsSync += row.status === 'needs_sync' ? 1 : 0
    accumulator.syncable += row.canSync ? 1 : 0
    accumulator.missingRequirementRows += row.missingRequirementKeys.length
    accumulator.staleRequirementRows += row.staleRequirementKeys.length
    accumulator.withoutPersistedRequirements += row.hasPersistedRequirements ? 0 : 1
    return accumulator
  }, {
    total: 0,
    ready: 0,
    needsSync: 0,
    syncable: 0,
    missingRequirementRows: 0,
    staleRequirementRows: 0,
    withoutPersistedRequirements: 0,
  })

  return {
    contractVersion: 'seller_document_reconciliation_v1',
    dryRun: options.dryRun !== false,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceOfTruth: SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: SELLER_DOCUMENT_TOUCHPOINTS,
    summary,
    rows,
    actionQueues: {
      syncable: rows.filter((row) => row.canSync),
      ready: rows.filter((row) => row.status === 'ready'),
      manualReview: rows.filter((row) => row.status !== 'ready' && !row.canSync),
    },
  }
}

export function summarizeSellerDocumentRequirementReconciliationReport(report = {}) {
  const summary = report.summary || {}
  return [
    `${summary.total || 0} listings checked`,
    `${summary.ready || 0} ready`,
    `${summary.needsSync || 0} need requirement sync`,
    `${summary.syncable || 0} syncable`,
    `${summary.missingRequirementRows || 0} missing requirement rows`,
    `${summary.staleRequirementRows || 0} stale active requirement rows`,
  ].join(' • ')
}

export function buildSellerDocumentRequirementReconciliationGate(report = {}, options = {}) {
  const summary = report.summary || {}
  const actionQueues = report.actionQueues || {}
  const manualReviewCount = Array.isArray(actionQueues.manualReview) ? actionQueues.manualReview.length : Number(summary.manualReview || 0)
  const syncableCount = Number(summary.syncable || 0)
  const loadFailedCount = Number(summary.loadFailed || 0)
  const totalChecked = Number(summary.total || 0)
  const failOnSyncNeeded = options.failOnSyncNeeded !== false
  const failOnManualReview = options.failOnManualReview !== false
  const failOnLoadFailed = options.failOnLoadFailed !== false
  const blockers = []
  const warnings = []

  if (loadFailedCount > 0) {
    const message = `${loadFailedCount} listing${loadFailedCount === 1 ? '' : 's'} could not be loaded for seller document reconciliation.`
    if (failOnLoadFailed) blockers.push(message)
    else warnings.push(message)
  }
  if (manualReviewCount > 0) {
    const message = `${manualReviewCount} listing${manualReviewCount === 1 ? '' : 's'} need manual review before seller document requirement sync.`
    if (failOnManualReview) blockers.push(message)
    else warnings.push(message)
  }
  if (syncableCount > 0) {
    const message = `${syncableCount} listing${syncableCount === 1 ? '' : 's'} have missing or stale seller document requirement rows.`
    if (failOnSyncNeeded) blockers.push(message)
    else warnings.push(message)
  }
  if (!totalChecked) {
    warnings.push('No listings were checked by seller document reconciliation.')
  }

  const status = blockers.length ? 'fail' : warnings.length ? 'warning' : 'pass'
  return {
    contractVersion: 'seller_document_reconciliation_gate_v1',
    phase: '6',
    status,
    exitCode: status === 'fail' ? 1 : 0,
    releaseReady: status !== 'fail',
    generatedAt: report.generatedAt || new Date().toISOString(),
    dryRun: report.dryRun !== false,
    summary: {
      total: totalChecked,
      ready: Number(summary.ready || 0),
      needsSync: Number(summary.needsSync || 0),
      syncable: syncableCount,
      manualReview: manualReviewCount,
      loadFailed: loadFailedCount,
      missingRequirementRows: Number(summary.missingRequirementRows || 0),
      staleRequirementRows: Number(summary.staleRequirementRows || 0),
    },
    blockers,
    warnings,
    reason: blockers[0] || warnings[0] || 'Seller document requirement reconciliation is clean.',
  }
}

export const SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION = 'seller_document_reconciliation_review_packet_v1'

function getReviewPacketStatus(gate = {}) {
  if (gate.status === 'fail') return 'blocked'
  if (gate.status === 'warning') return 'needs_review'
  return 'ready'
}

function buildSellerDocumentReconciliationChecklist(report = {}, gate = {}) {
  const summary = report.summary || {}
  const manualReviewCount = Number(gate.summary?.manualReview || 0)
  const syncableCount = Number(gate.summary?.syncable || summary.syncable || 0)
  return [
    {
      key: 'review_gate_result',
      done: gate.status === 'pass',
      label: 'Review the seller document reconciliation gate result.',
      detail: gate.reason || 'No gate reason recorded.',
    },
    {
      key: 'resolve_manual_review',
      done: manualReviewCount === 0,
      label: 'Resolve manual-review rows before applying requirement sync.',
      detail: `${manualReviewCount} manual-review row${manualReviewCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'apply_reviewed_requirement_sync',
      done: syncableCount === 0,
      label: 'Apply requirement sync only for reviewed syncable listings.',
      detail: `${syncableCount} syncable listing${syncableCount === 1 ? '' : 's'}.`,
    },
    {
      key: 'rerun_release_gate',
      done: gate.status === 'pass',
      label: 'Rerun the seller document release gate after repair.',
      detail: `Current gate status: ${gate.status || 'unknown'}.`,
    },
  ]
}

function buildSellerDocumentReconciliationOperatorCommands(options = {}, syncableListingIds = []) {
  const organisationId = normalizeText(options.organisationId)
  const listingIds = Array.isArray(options.listingIds) ? options.listingIds.map(normalizeText).filter(Boolean) : []
  const scopeArgs = organisationId
    ? `--organisation-id=${organisationId}`
    : listingIds.length
      ? `--listing-ids=${listingIds.join(',')}`
      : '--organisation-id=<uuid>'
  const outputDir = normalizeText(options.outputDir) || '<output-dir>'
  const reviewedSyncArgs = syncableListingIds.length
    ? `--listing-ids=${syncableListingIds.slice(0, 50).join(',')}`
    : '--listing-ids=<reviewed-syncable-listing-ids>'

  return [
    `npm run verify:seller-documents -- ${scopeArgs}`,
    `npm run reconcile:seller-documents -- ${scopeArgs} --markdown`,
    `npm run prepare:seller-documents -- ${scopeArgs} --output-dir=${outputDir}`,
    `npm run reconcile:seller-documents -- ${reviewedSyncArgs} --markdown`,
  ]
}

export function buildSellerDocumentRequirementReconciliationReviewPacket(report = {}, options = {}) {
  const generatedAt = options.generatedAt || report.generatedAt || new Date().toISOString()
  const gate = options.gate || report.gate || buildSellerDocumentRequirementReconciliationGate(report, options)
  const syncable = Array.isArray(report.actionQueues?.syncable) ? report.actionQueues.syncable : []
  const manualReview = Array.isArray(report.actionQueues?.manualReview) ? report.actionQueues.manualReview : []
  const syncableListingIds = syncable.map((row) => normalizeText(row?.listingId)).filter(Boolean)
  const checklist = buildSellerDocumentReconciliationChecklist(report, gate)

  return {
    version: SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION,
    phase: '7',
    generatedAt,
    source: normalizeText(options.source || report.source) || 'seller_document_reconciliation_report',
    status: getReviewPacketStatus(gate),
    dryRun: true,
    mutatedData: false,
    gate,
    sourceOfTruth: report.sourceOfTruth || SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: report.touchpoints || SELLER_DOCUMENT_TOUCHPOINTS,
    summary: {
      ...(report.summary || {}),
      manualReview: Number(gate.summary?.manualReview || manualReview.length || 0),
      loadFailed: Number(gate.summary?.loadFailed || report.summary?.loadFailed || 0),
    },
    repairPlan: {
      syncableCount: syncable.length,
      syncableListingIds,
      rows: syncable.map((row) => ({
        listingId: normalizeText(row?.listingId),
        title: normalizeText(row?.title),
        listingStatus: normalizeText(row?.listingStatus),
        sellerOnboardingStatus: normalizeText(row?.sellerOnboardingStatus),
        missingRequirementKeys: Array.isArray(row?.missingRequirementKeys) ? row.missingRequirementKeys : [],
        staleRequirementKeys: Array.isArray(row?.staleRequirementKeys) ? row.staleRequirementKeys : [],
        recommendedAction: row?.recommendedAction || 'sync_private_listing_document_requirements',
      })),
    },
    manualReview: {
      count: manualReview.length,
      rows: manualReview,
    },
    checklist,
    operatorCommands: buildSellerDocumentReconciliationOperatorCommands(options, syncableListingIds),
    artifacts: [
      'seller-document-reconciliation-packet.json',
      'seller-document-reconciliation-report.json',
      'seller-document-reconciliation-syncable.json',
      'seller-document-reconciliation-manual-review.json',
      'seller-document-reconciliation-runbook.md',
    ],
    reconciliationReport: report,
  }
}

export function renderSellerDocumentRequirementReconciliationRunbook(packet = {}) {
  const summary = packet.summary || {}
  const gate = packet.gate || {}
  const checklist = Array.isArray(packet.checklist) ? packet.checklist : []
  const commands = Array.isArray(packet.operatorCommands) ? packet.operatorCommands : []
  const syncableRows = Array.isArray(packet.repairPlan?.rows) ? packet.repairPlan.rows : []
  const manualReviewRows = Array.isArray(packet.manualReview?.rows) ? packet.manualReview.rows : []
  const lines = [
    '# Seller Document Reconciliation Review Packet',
    '',
    `Generated: ${packet.generatedAt || ''}`,
    `Status: ${packet.status || 'unknown'}`,
    `Gate: ${gate.status || 'unknown'} - ${gate.reason || ''}`,
    `Mutated data: ${packet.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Listings checked: ${Number(summary.total || 0)}`,
    `- Ready: ${Number(summary.ready || 0)}`,
    `- Need sync: ${Number(summary.needsSync || 0)}`,
    `- Syncable: ${Number(summary.syncable || 0)}`,
    `- Manual review: ${Number(summary.manualReview || 0)}`,
    `- Load failed: ${Number(summary.loadFailed || 0)}`,
    `- Missing requirement rows: ${Number(summary.missingRequirementRows || 0)}`,
    `- Stale active requirement rows: ${Number(summary.staleRequirementRows || 0)}`,
    '',
    '## Checklist',
    '',
    ...checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${item.label} ${item.detail || ''}`),
    '',
    '## Operator Commands',
    '',
    ...commands.map((command) => `- \`${command}\``),
    '',
    '## Syncable Queue',
    '',
  ]

  if (!syncableRows.length) {
    lines.push('No syncable listings in this packet.', '')
  } else {
    lines.push('| Listing | Status | Missing | Stale |')
    lines.push('| --- | --- | --- | --- |')
    for (const row of syncableRows.slice(0, 50)) {
      lines.push(`| ${row.title || row.listingId || '-'} | ${row.listingStatus || '-'} | ${(row.missingRequirementKeys || []).join(', ') || '-'} | ${(row.staleRequirementKeys || []).join(', ') || '-'} |`)
    }
    lines.push('')
  }

  lines.push('## Manual Review', '')
  if (!manualReviewRows.length) {
    lines.push('No manual-review listings in this packet.', '')
  } else {
    for (const row of manualReviewRows.slice(0, 50)) {
      lines.push(`- ${row.title || row.listingId || 'Unknown listing'}: ${row.status || row.errorMessage || 'review required'}`)
    }
    lines.push('')
  }

  lines.push(
    '## Guardrails',
    '',
    '- This packet is dry-run evidence only and does not mutate listing, lead, seller portal, or document rows.',
    '- Do not use the packet generator to apply repairs.',
    '- Apply requirement sync only from a reviewed syncable listing-id list.',
    '- Rerun `npm run verify:seller-documents` after every repair batch.',
    '',
    '## Versions',
    '',
    `- Packet: ${packet.version || SELLER_DOCUMENT_RECONCILIATION_REVIEW_PACKET_VERSION}`,
    `- Reconciliation: ${packet.reconciliationReport?.contractVersion || 'seller_document_reconciliation_v1'}`,
    `- Gate: ${gate.contractVersion || 'seller_document_reconciliation_gate_v1'}`,
    '',
  )

  return lines.join('\n')
}

function normalizeDocumentMatchKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const SELLER_DOCUMENT_MATCH_ALIASES = {
  signed_mandate: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_MANDATE),
  signed_disclosure_form: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM),
  signed_fica_declaration: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION),
  id_document: ['id_document', 'identity', 'identity_document', 'identity_documents', 'passport', 'seller_id'],
  proof_of_address: ['proof_of_address', 'residential_address', 'residence', 'address'],
  title_deed_reference: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  title_deed_copy: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  rates_account: ['rates_account', 'rates'],
  valuation_document: ['valuation_document', 'formal_valuation', 'formal_valuation_document', 'valuation'],
  signed_defect_form: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM),
  signed_fica_form: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION),
  property_condition_disclosure: getSellerBasePackAliases(SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM),
  gas_compliance_certificate: ['gas_compliance_certificate', 'gas_compliance', 'gas_certificate', 'gas_coc', 'gas'],
  solar_compliance_documents: ['solar_compliance_documents', 'solar_compliance', 'solar'],
}

const PROPERTY_COMPLIANCE_DOCUMENT_KEYS = new Set([
  'alteration_approvals',
  'approved_building_plans',
  'beetle_certificate',
  'borehole_certificate',
  'electric_fence_certificate',
  'gas_compliance_certificate',
  'occupation_certificate',
  'plumbing_certificate',
  'solar_compliance_documents',
  'water_installation_certificate',
])

const SALES_DOCUMENT_KEYS = new Set([
  ...SELLER_BASE_PACK_REQUIRED_KEYS,
  'property_condition_disclosure',
  'signed_defect_form',
  'signed_fica_form',
  'signed_mandate',
])

function getSellerDocumentMatchAliases(key = '') {
  const normalized = normalizeDocumentMatchKey(key)
  if (!normalized) return []
  const basePackCanonicalKey = normalizeSellerBasePackKey(normalized)
  if (basePackCanonicalKey) return getSellerBasePackAliases(basePackCanonicalKey)
  return SELLER_DOCUMENT_MATCH_ALIASES[normalized] || [normalized]
}

function normalizedDocumentKeyContainsAlias(value = '', alias = '') {
  const normalizedValue = normalizeDocumentMatchKey(value)
  const normalizedAlias = normalizeDocumentMatchKey(alias)
  if (!normalizedValue || !normalizedAlias) return false
  if (normalizedValue === normalizedAlias) return true
  return normalizedValue.startsWith(`${normalizedAlias}_`) ||
    normalizedValue.endsWith(`_${normalizedAlias}`) ||
    normalizedValue.includes(`_${normalizedAlias}_`)
}

function sellerDocumentKeysOverlap(left = '', right = '') {
  if (sellerBasePackKeysOverlap(left, right)) return true
  const leftAliases = getSellerDocumentMatchAliases(left)
  const rightAliases = getSellerDocumentMatchAliases(right)
  if (!leftAliases.length || !rightAliases.length) return false
  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) =>
      normalizedDocumentKeyContainsAlias(leftAlias, rightAlias) ||
      normalizedDocumentKeyContainsAlias(rightAlias, leftAlias),
    ),
  )
}

function isSignedMandateRequirement(requirement = {}) {
  const source = normalizeDocumentMatchKey([
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    requirement?.name,
  ].filter(Boolean).join(' '))
  return source.includes('signed_mandate') || source.includes('mandate_signature') || (source.includes('mandate') && source.includes('signed'))
}

function isSignedMandateDocument(document = {}) {
  const source = normalizeDocumentMatchKey([
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
    document?.name,
    document?.document_name,
  ].filter(Boolean).join(' '))
  return source.includes('mandate_signature') || source.includes('signed_mandate') || (source.includes('mandate') && source.includes('signed'))
}

export function documentMatchesSellerRequirement(document = {}, requirement = {}) {
  const requirementId = normalizeText(requirement?.id || requirement?.requirement_id)
  const documentRequirementId = normalizeText(document?.requirementId || document?.requirement_id)
  if (requirementId && documentRequirementId && requirementId === documentRequirementId) return true

  if (isSignedMandateRequirement(requirement) && isSignedMandateDocument(document)) return true

  const requirementKeyRaw = requirement?.key || requirement?.requirement_key
  const requirementKey = normalizeSellerBasePackKey(requirementKeyRaw) || normalizeDocumentMatchKey(requirementKeyRaw)
  const basePackRequirementKey = normalizeSellerBasePackKey(requirementKey)
  const documentRequirementKey = normalizeDocumentMatchKey(document?.requirementKey || document?.requirement_key)
  const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
  const documentCategory = normalizeDocumentMatchKey(document?.category || document?.document_category)
  const documentName = normalizeDocumentMatchKey(document?.document_name || document?.name || document?.file_name)
  return Boolean(
    requirementKey &&
      [documentRequirementKey, documentType, documentCategory, documentName].some((candidate) => {
        if (!candidate) return false
        if (basePackRequirementKey) {
          if (normalizeSellerBasePackKey(candidate) === basePackRequirementKey || candidate === basePackRequirementKey) return true
          return getSellerBasePackAliases(basePackRequirementKey).some((alias) =>
            normalizedDocumentKeyContainsAlias(candidate, alias)
          )
        }
        return candidate === requirementKey || sellerDocumentKeysOverlap(candidate, requirementKey)
      }),
  )
}

function resolveDocumentUrl(document = {}) {
  return normalizeText(
    document?.url ||
      document?.fileUrl ||
      document?.file_url ||
      document?.publicUrl ||
      document?.public_url ||
      document?.signedUrl ||
      document?.signed_url,
  )
}

function documentHasFile(document = {}) {
  return Boolean(
    resolveDocumentUrl(document) ||
      normalizeText(document?.storagePath || document?.storage_path || document?.filePath || document?.file_path),
  )
}

function normalizeRequirementTitle(requirement = {}, document = {}) {
  const raw = firstPresent(
    requirement?.label,
    requirement?.requirement_name,
    requirement?.requirementName,
    requirement?.name,
    requirement?.key,
    requirement?.requirement_key,
    document?.document_name,
    document?.name,
    document?.title,
    document?.document_type,
    document?.documentType,
  )
  return normalizeText(raw).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Seller document'
}

function normalizeRequirementDescription(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.description ||
      requirement?.requirement_description ||
      requirement?.notes ||
      document?.description ||
      document?.notes,
  )
}

function normalizeRequirementWhyNeeded(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.whyNeeded ||
      requirement?.why_needed ||
      requirement?.reason ||
      document?.whyNeeded ||
      document?.why_needed,
  )
}

function getSellerDocumentCategoryKey({ requirement = {}, document = {} } = {}) {
  const group = normalizeKey(requirement?.requirement_group || requirement?.group)
  const lane = normalizeKey(requirement?.requirementLane || requirement?.requirement_lane || document?.requirementLane || document?.requirement_lane)
  const section = normalizeKey(requirement?.documentRequirementSection || requirement?.document_requirement_section || document?.documentRequirementSection || document?.document_requirement_section)
  const category = normalizeKey(document?.category || document?.document_category || requirement?.category)
  const requirementKey = requirementIdentity(requirement)
  const documentKeys = [
    requirementKey,
    document?.requirementKey,
    document?.requirement_key,
    document?.document_type,
    document?.documentType,
    document?.category,
    document?.document_category,
  ].map(normalizeDocumentMatchKey).filter(Boolean)
  const signal = normalizeKey([
    group,
    lane,
    section,
    category,
    requirement?.key,
    requirement?.requirement_key,
    requirement?.label,
    requirement?.requirement_name,
    document?.document_type,
    document?.document_name,
  ].filter(Boolean).join(' '))

  if (group === 'additional' || category === 'additional_requests' || signal.includes('additional_request')) return 'additional'
  if (
    requirementKey === 'rates_account' ||
    documentKeys.includes('rates_account') ||
    signal.includes('rates_account') ||
    signal.includes('municipal_rates_account')
  ) {
    return 'property'
  }
  if (
    requirementKey === 'proof_of_address' ||
    requirementKey === 'proof_of_residential_address' ||
    documentKeys.includes('proof_of_address') ||
    documentKeys.includes('proof_of_residential_address') ||
    signal.includes('proof_of_address') ||
    signal.includes('proof_of_residential_address') ||
    signal.includes('proof_of_residence')
  ) {
    return 'fica'
  }
  if (
    PROPERTY_COMPLIANCE_DOCUMENT_KEYS.has(requirementKey) ||
    documentKeys.some((key) => PROPERTY_COMPLIANCE_DOCUMENT_KEYS.has(key))
  ) {
    return 'property'
  }
  if (
    group === 'legal' ||
    category === 'legal' ||
    group === 'authority_documents' ||
    section === 'authority_documents' ||
    group === 'mandate' ||
    category === 'mandate' ||
    category === 'mandate_signature' ||
    documentKeys.some((documentKey) =>
      [...SALES_DOCUMENT_KEYS].some((salesKey) => documentKey === salesKey || sellerDocumentKeysOverlap(documentKey, salesKey)),
    ) ||
    signal.includes('offer_to_purchase') ||
    signal.includes('sale_agreement') ||
    signal.includes('seller_instruction')
  ) {
    return 'sales'
  }
  if (
    lane === 'ownership_driven' ||
    section === 'seller_identity_fica' ||
    ['seller_identity', 'seller_identity_fica', 'marital', 'company', 'trust', 'deceased_estate', 'power_of_attorney', 'fica'].includes(group) ||
    category === 'seller' ||
    signal.includes('owner_fica') ||
    signal.includes('director_fica') ||
    signal.includes('trustee_fica') ||
    signal.includes('member_fica') ||
    signal.includes('spouse_fica')
  ) {
    return 'fica'
  }
  return 'property'
}

function resolveRequirementStatus(requirement = {}, document = null) {
  const requirementStatus = normalizeSellerDocumentRequirementStatus(
    requirement?.status || requirement?.requiredDocumentStatus || requirement?.required_document_status,
  )
  const documentStatus = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status,
  )

  if (document && documentStatus && !['required', 'requested'].includes(documentStatus)) return documentStatus

  if (document && documentHasFile(document)) {
    if (documentStatus && !['required', 'requested'].includes(documentStatus)) return documentStatus
    if (requirementStatus && !['required', 'requested'].includes(requirementStatus)) return requirementStatus
    return documentStatus || 'uploaded'
  }

  return requirementStatus || documentStatus || 'required'
}

function normalizeUploadedBy(document = {}) {
  return normalizeText(document?.uploadedBy || document?.uploaded_by || document?.createdBy || document?.created_by)
}

function normalizeRequestedBy(requirement = {}, document = {}) {
  return normalizeText(
    requirement?.requestedBy ||
      requirement?.requested_by ||
      requirement?.requestedByName ||
      requirement?.requested_by_name ||
      document?.requestedBy ||
      document?.requested_by,
  )
}

function normalizeFileName(document = {}, title = '') {
  return normalizeText(
    document?.fileName ||
      document?.file_name ||
      document?.document_name ||
      document?.name ||
      title,
  )
}

function normalizeDateValue(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function buildRequirementRow(requirement = {}, document = null, index = 0) {
  const title = normalizeRequirementTitle(requirement, document || {})
  const status = resolveRequirementStatus(requirement, document)
  const url = resolveDocumentUrl(document || {})
  const requirementLane = normalizeKey(firstPresent(
    requirement?.requirementLane,
    requirement?.requirement_lane,
    requirement?.documentRequirementLane,
    requirement?.document_requirement_lane,
    requirement?.lane,
  ))
  const documentRequirementSection = normalizeKey(firstPresent(
    requirement?.documentRequirementSection,
    requirement?.document_requirement_section,
    requirement?.section,
  ))
  return {
    id: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, document?.id)) || `seller-requirement-${index}`,
    requirementId: normalizeText(firstPresent(requirement?.id, requirement?.requirementId, requirement?.requirement_id, '')),
    key: normalizeText(firstPresent(requirement?.key, requirement?.requirementKey, requirement?.requirement_key, title)) || `seller-requirement-${index}`,
    category: getSellerDocumentCategoryKey({ requirement, document: document || {} }),
    title,
    label: title,
    description: normalizeRequirementDescription(requirement, document || {}),
    whyNeeded: normalizeRequirementWhyNeeded(requirement, document || {}),
    required: requirement?.is_required !== false && requirement?.required !== false,
    applicable: status !== 'not_applicable' && requirement?.applicable !== false,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: document ? normalizeFileName(document, title) : '',
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy(requirement, document || {}),
    uploadedBy: normalizeUploadedBy(document || {}),
    requirementLane,
    requirement_lane: requirementLane,
    documentRequirementSection,
    document_requirement_section: documentRequirementSection,
    original: {
      requirement,
      document: document || null,
    },
  }
}

function buildExtraDocumentRow(document = {}, index = 0) {
  const title = normalizeRequirementTitle({}, document)
  const status = normalizeSellerDocumentRequirementStatus(
    document?.status || document?.documentStatus || document?.document_status || (documentHasFile(document) ? 'uploaded' : 'required'),
  )
  const url = resolveDocumentUrl(document)
  return {
    id: normalizeText(document?.id || document?.documentId || document?.document_id) || `seller-upload-${index}`,
    requirementId: '',
    key: normalizeText(document?.requirementKey || document?.requirement_key || document?.document_type || title) || `seller-upload-${index}`,
    category: getSellerDocumentCategoryKey({ document }),
    title,
    label: title,
    description: normalizeRequirementDescription({}, document),
    whyNeeded: normalizeRequirementWhyNeeded({}, document),
    required: false,
    applicable: true,
    status,
    statusLabel: getSellerDocumentStatusLabel(status),
    url,
    documentUrl: url,
    uploadedFileName: normalizeFileName(document, title),
    uploadedAt: normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    requestedBy: normalizeRequestedBy({}, document),
    uploadedBy: normalizeUploadedBy(document),
    original: {
      requirement: null,
      document,
    },
  }
}

export function buildSellerDocumentRequirementRows({ listing = {}, documents = [], formData = {} } = {}) {
  const uploadedDocuments = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const requiredDocuments = getSellerRequiredDocuments(listing, resolvedFormData)
  if (!requiredDocuments.length) {
    return uploadedDocuments.map((document, index) => buildExtraDocumentRow(document, index))
  }

  const matchedIndexes = new Set()
  const rows = requiredDocuments.map((requirement, index) => {
    const matchIndex = uploadedDocuments.findIndex((document, documentIndex) =>
      !matchedIndexes.has(documentIndex) && documentMatchesSellerRequirement(document, requirement)
    )
    const document = matchIndex >= 0 ? uploadedDocuments[matchIndex] : null
    if (matchIndex >= 0) matchedIndexes.add(matchIndex)
    return buildRequirementRow(requirement, document, index)
  })

  const extraRows = uploadedDocuments
    .filter((_, index) => !matchedIndexes.has(index))
    .map((document, index) => buildExtraDocumentRow(document, index + rows.length))

  return [...rows, ...extraRows]
}

export const SELLER_DOCUMENT_SOURCE_OF_TRUTH = Object.freeze({
  contextType: 'private_listing',
  requirementsTable: 'private_listing_document_requirements',
  documentsTable: 'private_listing_documents',
  signedMandateSource: 'document_packets.final_signed_artifact',
  sellerOnboardingFicaDeclarationSource: 'seller_onboarding.fica_declaration',
  owner: 'listing',
})

export const SELLER_DOCUMENT_TOUCHPOINTS = Object.freeze([
  'listing_documents',
  'seller_lead_documents',
  'seller_portal_documents',
])

export const SELLER_DOCUMENT_STATUS_BUCKETS = Object.freeze({
  required: 'outstanding',
  requested: 'outstanding',
  rejected: 'rejected',
  uploaded: 'uploaded',
  under_review: 'under_review',
  approved: 'approved',
  completed: 'approved',
  not_applicable: 'not_applicable',
  cancelled: 'cancelled',
})

function getMandatePacketFinalSignedFilePath(mandatePacket = null) {
  return normalizeText(
    mandatePacket?.finalSignedFilePath ||
      mandatePacket?.final_signed_file_path ||
      mandatePacket?.version?.final_signed_file_path ||
      mandatePacket?.version?.finalSignedFilePath,
  )
}

function getMandatePacketFinalSignedUrl(mandatePacket = null) {
  return normalizeText(
    mandatePacket?.finalSignedDownloadUrl ||
      mandatePacket?.finalSignedFileAccessUrl ||
      mandatePacket?.final_signed_file_url ||
      mandatePacket?.version?.final_signed_file_access_url ||
      mandatePacket?.version?.final_signed_file_url ||
      mandatePacket?.version?.url,
  )
}

function getMandatePacketVersionId(mandatePacket = null) {
  return normalizeText(
    mandatePacket?.packetVersionId ||
      mandatePacket?.packet_version_id ||
      mandatePacket?.version?.id ||
      mandatePacket?.versionId ||
      mandatePacket?.version_id,
  )
}

function isMandatePacketFinalSigned(mandatePacket = null) {
  if (!mandatePacket || typeof mandatePacket !== 'object') return false
  const state = normalizeKey(mandatePacket?.state || mandatePacket?.status || mandatePacket?.packet?.status)
  const hasFinalArtifact = Boolean(
    getMandatePacketFinalSignedFilePath(mandatePacket) ||
      getMandatePacketFinalSignedUrl(mandatePacket) ||
      (mandatePacket?.finalSignedRecorded === true && getMandatePacketVersionId(mandatePacket)),
  )
  return hasFinalArtifact && [
    'fully_signed',
    'signed',
    'completed',
    'complete',
    'finalised',
    'finalized',
    'archived',
  ].includes(state)
}

export function buildSellerSignedMandateDocumentFromPacket(mandatePacket = null) {
  if (!isMandatePacketFinalSigned(mandatePacket)) return null
  const packetId = normalizeText(mandatePacket?.packet?.id || mandatePacket?.id)
  const versionId = getMandatePacketVersionId(mandatePacket)
  const filePath = getMandatePacketFinalSignedFilePath(mandatePacket)
  const fileUrl = getMandatePacketFinalSignedUrl(mandatePacket)
  const fileName = normalizeText(
    mandatePacket?.finalSignedFileName ||
      mandatePacket?.final_signed_file_name ||
      mandatePacket?.version?.final_signed_file_name ||
      mandatePacket?.version?.finalSignedFileName,
  ) || 'Signed Mandate'

  return {
    id: `mandate-final-signed-${versionId || packetId || filePath || fileUrl}`,
    requirementKey: 'signed_mandate',
    requirement_key: 'signed_mandate',
    document_type: 'mandate_signature',
    documentType: 'mandate_signature',
    category: 'mandate_signature',
    document_category: 'mandate_signature',
    document_name: fileName,
    name: fileName,
    file_path: filePath,
    storage_path: filePath,
    file_bucket: normalizeText(mandatePacket?.finalSignedFileBucket || mandatePacket?.version?.final_signed_file_bucket),
    url: fileUrl,
    status: 'completed',
    visibility: 'seller_visible',
    source: SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource,
    packetId,
    packetVersionId: versionId,
    created_at:
      mandatePacket?.version?.finalised_at ||
      mandatePacket?.version?.finalized_at ||
      mandatePacket?.version?.generated_at ||
      mandatePacket?.packet?.updated_at ||
      null,
  }
}

function buildSellerPropertyDisclosureDocumentFromFormData(formData = {}, listing = {}) {
  const disclosure = isPlainObject(formData?.propertyDisclosure)
    ? formData.propertyDisclosure
    : isPlainObject(formData?.property_disclosure)
      ? formData.property_disclosure
      : null
  if (!disclosure) return null

  const generatedDocument = isPlainObject(disclosure.generatedDocument)
    ? disclosure.generatedDocument
    : isPlainObject(disclosure.generated_document)
      ? disclosure.generated_document
      : {}
  const context = {
    sellerName: normalizeText(formData.sellerName || [formData.sellerFirstName, formData.sellerSurname].filter(Boolean).join(' ')),
    sellerIdNumber: normalizeText(formData.sellerIdNumber || formData.idNumber || formData.id_number),
    sellerId: normalizeText(generatedDocument.sellerId || listing?.sellerProfileId || listing?.seller_profile_id),
    propertyId: normalizeText(generatedDocument.propertyId || listing?.propertyProfileId || listing?.property_profile_id),
    listingId: normalizeText(generatedDocument.listingId || listing?.id || listing?.private_listing_id),
    transactionId: normalizeText(generatedDocument.transactionId || listing?.transactionId || listing?.transaction_id),
    propertyAddress: resolveSellerDocumentPropertyAddress(listing, formData),
    documentReference: normalizeText(firstPresent(
      listing?.listingReference,
      listing?.listing_reference,
      listing?.reference,
      listing?.privateListingReference,
      listing?.private_listing_reference,
      generatedDocument.listingId,
      listing?.id,
    )),
    branding: resolveSellerDocumentBranding(listing, formData),
  }
  const fileName = normalizeText(generatedDocument.fileName || generatedDocument.file_name) || 'seller-disclosure-annexure-a.pdf'

  return {
    id: generatedDocument.id || `property-disclosure-${context.listingId || context.propertyId || 'document'}`,
    requirementKey: 'property_condition_disclosure',
    requirement_key: 'property_condition_disclosure',
    document_type: 'property_condition_disclosure',
    documentType: 'property_condition_disclosure',
    category: 'property_condition_disclosure',
    document_category: 'property_condition_disclosure',
    document_name: generatedDocument.title || 'Property Condition Disclosure',
    name: generatedDocument.title || 'Property Condition Disclosure',
    generatedHtml: buildPropertyDisclosureDocumentMarkup(disclosure, context),
    generatedFileName: fileName.replace(/\.(html?|pdf)$/i, '.pdf'),
    status: 'completed',
    visibility: 'seller_visible',
    source: 'seller_onboarding.property_disclosure.generated_document',
    created_at: generatedDocument.generatedAt || generatedDocument.generated_at || disclosure.signedAt || disclosure.signed_at || null,
  }
}

function isSellerOnboardingCompleted(listing = {}, formData = {}) {
  const onboarding = isPlainObject(listing?.sellerOnboarding)
    ? listing.sellerOnboarding
    : isPlainObject(listing?.seller_onboarding)
      ? listing.seller_onboarding
      : {}
  const status = normalizeKey(
    onboarding?.status ||
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status ||
      formData?.sellerOnboardingStatus ||
      formData?.seller_onboarding_status,
  )
  return ['completed', 'complete', 'submitted', 'seller_onboarding_completed', 'onboarding_completed'].includes(status) ||
    Boolean(
      firstPresent(
        onboarding?.submittedAt,
        onboarding?.submitted_at,
        onboarding?.completedAt,
        onboarding?.completed_at,
        formData?.submittedAt,
        formData?.submitted_at,
        formData?.completedAt,
        formData?.completed_at,
      ),
    )
}

function buildSellerFicaDeclarationDocumentFromOnboarding(formData = {}, listing = {}) {
  if (!isSellerOnboardingCompleted(listing, formData)) return null

  const onboarding = isPlainObject(listing?.sellerOnboarding)
    ? listing.sellerOnboarding
    : isPlainObject(listing?.seller_onboarding)
      ? listing.seller_onboarding
      : {}
  const completedAt = normalizeText(firstPresent(
    onboarding?.completedAt,
    onboarding?.completed_at,
    onboarding?.submittedAt,
    onboarding?.submitted_at,
    formData?.completedAt,
    formData?.completed_at,
    formData?.submittedAt,
    formData?.submitted_at,
  ))
  const sellerType = normalizeKey(
    formData?.sellerType ||
      formData?.seller_type ||
      formData?.ownerEntityType ||
      formData?.owner_entity_type ||
      formData?.ownershipType ||
      formData?.ownership_type ||
      listing?.sellerType ||
      listing?.seller_type,
  )
  const propertyDisclosure = isPlainObject(formData?.propertyDisclosure)
    ? formData.propertyDisclosure
    : isPlainObject(formData?.property_disclosure)
      ? formData.property_disclosure
      : {}
  const complianceSigning = isPlainObject(formData?.sellerComplianceSigning)
    ? formData.sellerComplianceSigning
    : isPlainObject(formData?.seller_compliance_signing)
      ? formData.seller_compliance_signing
      : isPlainObject(listing?.sellerComplianceSigning)
        ? listing.sellerComplianceSigning
        : isPlainObject(listing?.seller_compliance_signing)
          ? listing.seller_compliance_signing
          : {}
  const sellerCompliancePack = buildSellerComplianceDocumentModel({
    formData,
    listing,
    signing: complianceSigning,
    generatedAt: completedAt || new Date().toISOString(),
  })
  const generatedHtml = buildPropertyDisclosureDocumentMarkup(propertyDisclosure, {
    sellerName: normalizeText(formData.sellerName || [formData.sellerFirstName, formData.sellerSurname].filter(Boolean).join(' ')),
    sellerIdNumber: normalizeText(formData.sellerIdNumber || formData.idNumber || formData.id_number),
    sellerId: normalizeText(listing?.sellerProfileId || listing?.seller_profile_id),
    propertyId: normalizeText(listing?.propertyProfileId || listing?.property_profile_id),
    listingId: normalizeText(listing?.id || listing?.private_listing_id),
    transactionId: normalizeText(listing?.transactionId || listing?.transaction_id),
    propertyAddress: resolveSellerDocumentPropertyAddress(listing, formData),
    documentReference: normalizeText(firstPresent(
      listing?.listingReference,
      listing?.listing_reference,
      listing?.reference,
      listing?.privateListingReference,
      listing?.private_listing_reference,
      listing?.id,
    )),
    branding: resolveSellerDocumentBranding(listing, formData),
    sellerCompliancePack,
  })

  return {
    id: `seller-fica-declaration-${normalizeText(listing?.id || listing?.private_listing_id || onboarding?.token || 'onboarding')}`,
    requirementKey: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    requirement_key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    document_type: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    documentType: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    category: 'fica_declaration',
    document_category: 'fica_declaration',
    document_name: 'Signed FICA Declaration',
    name: 'Signed FICA Declaration',
    generatedHtml,
    generated_html: generatedHtml,
    generatedFileName: 'signed-fica-declaration.pdf',
    generated_file_name: 'signed-fica-declaration.pdf',
    status: 'completed',
    visibility: 'seller_visible',
    source: 'seller_onboarding.fica_declaration',
    completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
    completion_route: SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
    supportingFicaDocumentsDynamic: true,
    supporting_fica_documents_dynamic: true,
    sellerType,
    seller_type: sellerType,
    created_at: completedAt || null,
    uploadedAt: completedAt || null,
    uploaded_at: completedAt || null,
    metadata: {
      source: 'seller_onboarding',
      completionRoute: SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
      supportingFicaDocumentsDynamic: true,
      sellerType,
    },
  }
}

function getDocumentIdentity(document = {}, fallback = '') {
  return normalizeText(
    document?.id ||
      document?.documentId ||
      document?.document_id ||
      document?.storage_path ||
      document?.file_path ||
      document?.url ||
      document?.file_url ||
      document?.generatedFileName ||
      document?.generated_file_name ||
      document?.document_name ||
      fallback,
  )
}

function dedupeSellerDocuments(documents = []) {
  const seen = new Set()
  const rows = []
  for (const document of Array.isArray(documents) ? documents : []) {
    if (!document || typeof document !== 'object') continue
    const identity = getDocumentIdentity(document, `${rows.length}`)
    const key = normalizeKey(identity)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    rows.push(document)
  }
  return rows
}

function getSellerDocumentSourceType(row = {}) {
  const requirement = row?.original?.requirement || null
  const document = row?.original?.document || null
  const hasPersistedRequirement = Boolean(
    requirement?.private_listing_id ||
      requirement?.requirement_id ||
      requirement?.id,
  )
  const hasDocument = Boolean(document)
  const documentSource = normalizeText(document?.source)

  if (documentSource === SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource || document?.packetId || document?.packetVersionId) {
    return {
      requirement: hasPersistedRequirement ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.requirementsTable : 'generated_seller_requirement',
      document: SELLER_DOCUMENT_SOURCE_OF_TRUTH.signedMandateSource,
    }
  }

  if (documentSource === SELLER_DOCUMENT_SOURCE_OF_TRUTH.sellerOnboardingFicaDeclarationSource) {
    return {
      requirement: hasPersistedRequirement ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.requirementsTable : 'generated_seller_requirement',
      document: SELLER_DOCUMENT_SOURCE_OF_TRUTH.sellerOnboardingFicaDeclarationSource,
    }
  }

  return {
    requirement: requirement
      ? hasPersistedRequirement
        ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.requirementsTable
        : 'generated_seller_requirement'
      : 'standalone_upload',
    document: hasDocument ? SELLER_DOCUMENT_SOURCE_OF_TRUTH.documentsTable : 'none',
  }
}

function getStatusBucket(status = '') {
  const normalized = normalizeSellerDocumentRequirementStatus(status)
  return SELLER_DOCUMENT_STATUS_BUCKETS[normalized] || 'outstanding'
}

function buildSellerDocumentContractRow(row = {}, index = 0, listing = {}) {
  const requirement = row?.original?.requirement || null
  const document = row?.original?.document || null
  const status = normalizeSellerDocumentRequirementStatus(row?.status)
  const statusBucket = getStatusBucket(status)
  const required = row?.required !== false
  const applicable = row?.applicable !== false && !['not_applicable', 'cancelled'].includes(status)
  const complete = applicable && ['uploaded', 'under_review', 'approved', 'completed'].includes(status)
  const contextId = normalizeText(listing?.id || listing?.private_listing_id || requirement?.private_listing_id || document?.private_listing_id)
  const key = normalizeText(row?.key || row?.requirementKey || row?.requirement_key || row?.id || row?.title || row?.label) || `seller-document-${index}`
  const uploadUrl = row?.documentUrl || row?.url || resolveDocumentUrl(document || {})
  const uploadPath = normalizeText(document?.storagePath || document?.storage_path || document?.filePath || document?.file_path || row?.filePath)
  const source = getSellerDocumentSourceType(row)
  const generatedHtml = normalizeText(document?.generatedHtml || document?.generated_html)
  const generatedFileName = normalizeText(document?.generatedFileName || document?.generated_file_name)

  return {
    id: normalizeText(row?.id) || `${contextId || 'seller'}:${key}`,
    contextType: SELLER_DOCUMENT_SOURCE_OF_TRUTH.contextType,
    contextId,
    requirementId: normalizeText(row?.requirementId || requirement?.id || requirement?.requirement_id),
    key,
    title: row?.title || row?.label || 'Seller document',
    label: row?.label || row?.title || 'Seller document',
    description: row?.description || '',
    whyNeeded: row?.whyNeeded || '',
    category: row?.category || 'property',
    group: normalizeText(requirement?.requirement_group || requirement?.group || document?.category || document?.document_category || row?.category),
    status,
    statusLabel: row?.statusLabel || getSellerDocumentStatusLabel(status),
    statusBucket,
    required,
    applicable,
    complete,
    blocking: required && applicable && ['outstanding', 'rejected'].includes(statusBucket),
    hasUpload: Boolean(document && (uploadUrl || uploadPath || generatedHtml || documentHasFile(document) || complete)),
    packetId: normalizeText(document?.packetId || document?.packet_id),
    packetVersionId: normalizeText(document?.packetVersionId || document?.packet_version_id || document?.versionId || document?.version_id),
    requestedBy: row?.requestedBy || normalizeRequestedBy(requirement || {}, document || {}),
    uploadedBy: row?.uploadedBy || normalizeUploadedBy(document || {}),
    requirementLane: row?.requirementLane || row?.requirement_lane || '',
    requirement_lane: row?.requirement_lane || row?.requirementLane || '',
    documentRequirementSection: row?.documentRequirementSection || row?.document_requirement_section || '',
    document_requirement_section: row?.document_requirement_section || row?.documentRequirementSection || '',
    uploadedAt: row?.uploadedAt || normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
    reviewedAt: row?.reviewedAt || normalizeDateValue(document?.reviewedAt, document?.reviewed_at, document?.updatedAt, document?.updated_at),
    rejectionReason: row?.rejectionReason || normalizeText(document?.rejectionReason || document?.rejected_reason || document?.reason),
    visibility: normalizeText(requirement?.visibility || requirement?.document_visibility || document?.visibility || document?.visibility_scope || 'seller_visible'),
    source,
    upload: document
      ? {
          id: getDocumentIdentity(document),
          fileName: row?.uploadedFileName || normalizeFileName(document, row?.title || row?.label),
          filePath: uploadPath,
          url: uploadUrl,
          generatedHtml,
          generatedFileName,
          bucket: normalizeText(document?.file_bucket || document?.bucket || document?.storage_bucket),
          uploadedAt: row?.uploadedAt || normalizeDateValue(document?.uploadedAt, document?.uploaded_at, document?.createdAt, document?.created_at),
          uploadedBy: row?.uploadedBy || normalizeUploadedBy(document),
          source: source.document,
          completionRoute: normalizeText(document?.completionRoute || document?.completion_route),
          completion_route: normalizeText(document?.completion_route || document?.completionRoute),
          supportingFicaDocumentsDynamic: document?.supportingFicaDocumentsDynamic === true || document?.supporting_fica_documents_dynamic === true,
          supporting_fica_documents_dynamic: document?.supporting_fica_documents_dynamic === true || document?.supportingFicaDocumentsDynamic === true,
        }
      : null,
    original: row?.original || { requirement: null, document: null },
  }
}

export function buildSellerDocumentSourceSummary(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    if (!row?.applicable) return summary
    summary.total += 1
    if (row.required) summary.totalRequired += 1
    if (row.complete) summary.complete += 1
    if (row.required && row.complete) summary.completeRequired += 1
    if (row.blocking) summary.blocking += 1
    if (row.hasUpload) summary.uploaded += 1
    if (row.statusBucket === 'outstanding') summary.outstanding += 1
    else if (row.statusBucket === 'under_review') summary.underReview += 1
    else if (row.statusBucket === 'approved') summary.approved += 1
    else if (row.statusBucket === 'rejected') summary.rejected += 1
    summary.byCategory[row.category] = (summary.byCategory[row.category] || 0) + 1
    return summary
  }, {
    total: 0,
    totalRequired: 0,
    complete: 0,
    completeRequired: 0,
    blocking: 0,
    uploaded: 0,
    outstanding: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    byCategory: {},
  })
}

export function buildSellerDocumentSourceOfTruth({
  listing = {},
  documents = null,
  formData = {},
  mandatePacket = null,
} = {}) {
  const resolvedFormData = isPlainObject(formData) && Object.keys(formData).length
    ? formData
    : getSellerOnboardingFormData(listing)
  const baseDocuments = Array.isArray(documents)
    ? documents
    : Array.isArray(listing?.documents)
      ? listing.documents
      : []
  const kingstonsSellerPack = isKingstonsSellerDocumentContext(listing)
    ? getKingstonsSellerPackRecord(listing)
    : {}
  const kingstonsSellerPackDocuments = isKingstonsSellerDocumentContext(listing)
    ? filterKingstonsSellerPackUploadedDocumentsForStage(
        kingstonsSellerPack,
        buildKingstonsSellerPackUploadedDocuments(kingstonsSellerPack),
      )
    : []
  const signedMandateDocument = buildSellerSignedMandateDocumentFromPacket(
    mandatePacket || listing?.mandatePacket || listing?.mandate_packet || null,
  )
  const propertyDisclosureDocument = buildSellerPropertyDisclosureDocumentFromFormData(resolvedFormData, listing)
  const sellerFicaDeclarationDocument = buildSellerFicaDeclarationDocumentFromOnboarding(resolvedFormData, listing)
  const mergedDocuments = dedupeSellerDocuments([
    ...baseDocuments,
    ...kingstonsSellerPackDocuments,
    ...(signedMandateDocument ? [signedMandateDocument] : []),
    ...(propertyDisclosureDocument ? [propertyDisclosureDocument] : []),
    ...(sellerFicaDeclarationDocument ? [sellerFicaDeclarationDocument] : []),
  ])
  const sourceListing = {
    ...listing,
    documents: mergedDocuments,
  }
  const kingstonsRequirementPack = isKingstonsSellerDocumentContext(sourceListing)
    ? buildKingstonsSellerDocumentRequirementPack(sourceListing, resolvedFormData)
    : null
  const rows = buildSellerDocumentRequirementRows({
    listing: sourceListing,
    documents: [],
    formData: resolvedFormData,
  }).map((row, index) => buildSellerDocumentContractRow(row, index, sourceListing))

  return {
    contractVersion: 'seller_document_source_v1',
    sourceOfTruth: SELLER_DOCUMENT_SOURCE_OF_TRUTH,
    touchpoints: SELLER_DOCUMENT_TOUCHPOINTS,
    context: {
      type: SELLER_DOCUMENT_SOURCE_OF_TRUTH.contextType,
      id: normalizeText(sourceListing?.id || sourceListing?.private_listing_id),
      sellerLeadId: normalizeText(sourceListing?.sellerLeadId || sourceListing?.seller_lead_id || sourceListing?.originatingCrmLeadId || sourceListing?.originating_crm_lead_id),
    },
    rows,
    summary: buildSellerDocumentSourceSummary(rows),
    requirementPack: kingstonsRequirementPack,
  }
}
