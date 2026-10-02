import { buildSellerProfileCanonicalPayload } from '../../lib/sellerProfileCaptureModel.js'
import { resolveListingSellerAuthorityContract } from '../../lib/sellerPartyAuthorityContract.js'

export const LISTING_SELLER_CANONICAL_UPDATE_VERSION = 'listing_seller_canonical_update_v1'

const REQUIREMENT_AFFECTING_FIELD = /(?:sellerType|sellerLegalType|ownerEntityType|ownerStructureType|ownershipType|marital|spouse|multipleOwners|owners|company|director|member|signator|trust|trustee|beneficiar|deceased|executor|powerOfAttorney|foreign|propertyStructureType|propertyCategory|titleDeed|bondStatus)/i

function text(value) {
  return String(value ?? '').trim()
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && text(value) !== '')
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getExistingFormData(listing = {}) {
  const onboarding = object(listing.sellerOnboarding || listing.seller_onboarding)
  return {
    ...object(listing.seller_onboarding_form_data),
    ...object(listing.sellerOnboardingFormData),
    ...object(onboarding.form_data),
    ...object(onboarding.formData),
  }
}

function createMutationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `seller-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function valuesDiffer(before, after) {
  if ((before && typeof before === 'object') || (after && typeof after === 'object')) {
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)
  }
  return before !== after
}

function sellerTypeForAuthority(authority = {}, form = {}) {
  const explicit = text(first(form.sellerLegalType, form.seller_legal_type, form.sellerType))
  if (authority.profileType === 'married' || authority.profileType === 'power_of_attorney') return 'individual'
  if (authority.profileType && authority.profileType !== 'unknown') return authority.profileType
  return explicit
}

export function buildListingSellerCanonicalUpdate({
  listing = {},
  formPatch = {},
  mutationType = 'seller_edit',
  source = 'agent_listing_workspace',
  mutationId = createMutationId(),
  now = new Date().toISOString(),
  onboardingStatus = '',
  suppliedCanonicalFacts = null,
} = {}) {
  if (!text(listing.id)) throw new Error('Listing id is required for a canonical seller update.')
  const existingFormData = getExistingFormData(listing)
  const normalizedPatch = object(formPatch)
  const nextFormData = { ...existingFormData, ...normalizedPatch }
  // An explicit empty value is an edit, not a request to restore a legacy alias.
  for (const aliases of [
    ['email', 'sellerEmail'], ['phone', 'sellerPhone', 'mobile'],
    ['sellerFirstName', 'firstName'], ['sellerSurname', 'lastName'],
    ['primaryContactName', 'contactName'],
  ]) {
    const edited = aliases.find((field) => Object.hasOwn(normalizedPatch, field))
    if (edited) for (const field of aliases) nextFormData[field] = normalizedPatch[edited]
  }
  const projectedListing = {
    ...listing,
    sellerOnboarding: {
      ...object(listing.sellerOnboarding),
      formData: nextFormData,
    },
  }
  const authority = resolveListingSellerAuthorityContract(projectedListing, nextFormData)
  const changedFields = Object.keys(normalizedPatch).filter((key) => valuesDiffer(existingFormData[key], normalizedPatch[key])).sort()
  const requirementsAffected = changedFields.some((key) => REQUIREMENT_AFFECTING_FIELD.test(key))
  if (['individual', 'married', 'foreign_individual'].includes(authority.profileType) &&
      (Object.hasOwn(normalizedPatch, 'fullName') || Object.hasOwn(normalizedPatch, 'sellerName')) &&
      !['sellerFirstName', 'firstName', 'sellerSurname', 'lastName'].some((field) => Object.hasOwn(normalizedPatch, field))) {
    const parts = text(normalizedPatch.fullName ?? normalizedPatch.sellerName).split(/\s+/).filter(Boolean)
    nextFormData.sellerFirstName = nextFormData.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || ''
    nextFormData.sellerSurname = nextFormData.lastName = parts.length > 1 ? parts.at(-1) : ''
  }
  if (!['individual', 'married', 'foreign_individual'].includes(authority.profileType) &&
      ['primaryContactName', 'contactName'].some((field) => Object.hasOwn(normalizedPatch, field))) {
    const parts = text(nextFormData.primaryContactName).split(/\s+/).filter(Boolean)
    nextFormData.sellerFirstName = nextFormData.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || ''
    nextFormData.sellerSurname = nextFormData.lastName = parts.length > 1 ? parts.at(-1) : ''
  }
  const generated = buildSellerProfileCanonicalPayload(nextFormData, projectedListing, {
    draft: onboardingStatus !== 'completed',
    source,
  })
  const fullName = authority.identified
    ? text(generated.canonicalSellerFacts?.seller?.name)
    : text(first(nextFormData.fullName, nextFormData.sellerName,
      [nextFormData.sellerFirstName, nextFormData.sellerSurname].filter(Boolean).join(' '), listing.sellerName, listing.seller?.name))
  const presentValue = (keys, fallback) => {
    const field = keys.find((key) => Object.hasOwn(nextFormData, key))
    return field ? nextFormData[field] : fallback
  }
  const email = text(presentValue(['email', 'sellerEmail'], listing.sellerEmail || listing.seller?.email)).toLowerCase()
  const phone = text(presentValue(['phone', 'sellerPhone', 'mobile'], listing.sellerPhone || listing.seller?.phone))
  const contactName = ['individual', 'married', 'foreign_individual'].includes(authority.profileType)
    ? fullName
    : text(first(nextFormData.primaryContactName, nextFormData.contactName,
      [nextFormData.sellerFirstName, nextFormData.sellerSurname].filter(Boolean).join(' ')))
  Object.assign(nextFormData, { fullName, sellerName: fullName, email, sellerEmail: email, phone, sellerPhone: phone,
    primaryContactName: contactName, contactName })
  const currentFacts = object(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json)
  const generatedFacts = object(generated.canonicalSellerFacts || suppliedCanonicalFacts)
  const authoritativeFacts = authority.identified && Object.keys(generatedFacts).length ? generatedFacts : currentFacts
  const canonicalFacts = {
    ...authoritativeFacts,
    fullName,
    sellerName: fullName,
    email,
    sellerEmail: email,
    phone,
    sellerPhone: phone,
    mobile: phone,
    seller: {
      ...object(authoritativeFacts.seller),
      full_name: fullName,
      name: fullName,
      contact: { name: contactName, email, phone },
      email,
      phone,
    },
    context: {
      ...object(authoritativeFacts.context),
      canonical_update: {
        version: LISTING_SELLER_CANONICAL_UPDATE_VERSION,
        mutation_id: mutationId,
        mutation_type: mutationType,
        source,
        changed_fields: changedFields,
        updated_at: now,
      },
    },
  }
  const readiness = {
    ...object(listing.sellerCanonicalFactReadiness || listing.seller_canonical_fact_readiness_json),
    ...object(generated.canonicalSellerFactReadiness),
    sellerName: Boolean(fullName),
    sellerEmail: Boolean(email),
    sellerPhone: Boolean(phone),
    idNumber: Boolean(first(nextFormData.idNumber, nextFormData.sellerIdNumber, nextFormData.companyRegistrationNumber, nextFormData.trustRegistrationNumber, nextFormData.estateReferenceNumber)),
    propertyAddress: Boolean(first(nextFormData.propertyAddress, nextFormData.addressLine1, listing.propertyAddress, listing.addressLine1)),
    ownerStructureType: authority.identified,
    authorityProfile: authority.profileType,
    authorityConfirmed: authority.identified && authority.signatoryPolicy.mode !== 'blocked',
  }
  nextFormData.canonicalSellerFacts = canonicalFacts
  nextFormData.canonical_seller_facts = canonicalFacts
  nextFormData.canonicalSellerFactReadiness = readiness
  const currentStatus = text(first(listing.sellerOnboardingStatus, listing.seller_onboarding_status, listing.sellerOnboarding?.status, 'not_started'))
  const status = text(onboardingStatus) || (currentStatus === 'not_started' && authority.identified ? 'in_progress' : currentStatus)
  const sellerType = sellerTypeForAuthority(authority, nextFormData)
  const listingPatch = {
    sellerName: fullName,
    sellerEmail: email,
    sellerPhone: phone,
    sellerType,
    sellerCanonicalFacts: canonicalFacts,
    sellerCanonicalFactReadiness: readiness,
    sellerCanonicalFactsUpdatedAt: now,
    propertyAddress: text(first(nextFormData.propertyAddress, listing.propertyAddress)),
    addressLine1: text(first(nextFormData.addressLine1, nextFormData.propertyAddress, listing.addressLine1)),
    askingPrice: first(nextFormData.askingPrice, nextFormData.price, listing.askingPrice),
    mandateType: text(first(nextFormData.mandateType, listing.mandateType)),
    mandateStartDate: text(first(nextFormData.mandateStartDate, listing.mandateStartDate)),
    expiryDate: text(first(nextFormData.expiryDate, nextFormData.mandateEndDate, listing.expiryDate, listing.mandateEndDate)),
    authorityProfile: authority.profileType,
    requirementsAffected,
  }

  return Object.freeze({
    version: LISTING_SELLER_CANONICAL_UPDATE_VERSION,
    listingId: text(listing.id),
    mutationId,
    mutationType,
    source,
    now,
    expectedUpdatedAt: text(listing.updatedAt || listing.updated_at),
    formPatch: normalizedPatch,
    nextFormData,
    listingPatch,
    canonicalFacts,
    readiness,
    authority,
    sellerType,
    ownershipStructure: text(first(nextFormData.ownerStructureType, nextFormData.owner_structure_type, nextFormData.ownershipType, authority.ownershipStructure)),
    maritalRegime: text(first(nextFormData.maritalRegime, nextFormData.marital_status, nextFormData.maritalStatus)),
    onboardingStatus: status,
    changedFields,
    requirementsAffected,
    contact: Object.freeze({ fullName: contactName, email, phone }),
  })
}

export function applyListingSellerCanonicalUpdateSnapshot(listing = {}, update = {}, remoteListing = null) {
  const committed = remoteListing && typeof remoteListing === 'object' ? remoteListing : {}
  return {
    ...listing,
    ...committed,
    ...update.listingPatch,
    seller: {
      ...object(listing.seller),
      ...object(update.formPatch),
      name: update.listingPatch?.sellerName || '',
      email: update.contact?.email || '',
      phone: update.contact?.phone || '',
    },
    sellerOnboardingFormData: update.nextFormData,
    seller_onboarding_form_data: update.nextFormData,
    seller_onboarding: { ...object(listing.seller_onboarding), ...object(committed.seller_onboarding), formData: update.nextFormData, form_data: update.nextFormData, status: update.onboardingStatus },
    sellerOnboardingStatus: update.onboardingStatus,
    sellerOnboarding: {
      ...object(listing.sellerOnboarding),
      ...object(committed.sellerOnboarding),
      status: update.onboardingStatus,
      formData: update.nextFormData,
      form_data: update.nextFormData,
      updatedAt: update.now,
    },
    sellerCanonicalFacts: update.canonicalFacts,
    sellerCanonicalFactReadiness: update.readiness,
    updatedAt: committed.updatedAt || update.now,
  }
}

export default {
  LISTING_SELLER_CANONICAL_UPDATE_VERSION,
  applyListingSellerCanonicalUpdateSnapshot,
  buildListingSellerCanonicalUpdate,
}
