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
    ...object(onboarding.form_data),
    ...object(onboarding.formData),
    ...object(listing.seller_onboarding_form_data),
    ...object(listing.sellerOnboardingFormData),
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
  const fullName = text(first(
    nextFormData.fullName,
    nextFormData.sellerName,
    [nextFormData.sellerFirstName || nextFormData.firstName, nextFormData.sellerSurname || nextFormData.lastName].filter(Boolean).join(' '),
    nextFormData.companyName,
    nextFormData.trustName,
    nextFormData.deceasedEstateName,
    nextFormData.otherEntityName,
    listing.sellerName,
    listing.seller?.name,
  ))
  const email = text(first(nextFormData.sellerEmail, nextFormData.email, listing.sellerEmail, listing.seller?.email)).toLowerCase()
  const phone = text(first(nextFormData.sellerPhone, nextFormData.phone, listing.sellerPhone, listing.seller?.phone))
  const generated = buildSellerProfileCanonicalPayload(nextFormData, projectedListing, {
    draft: onboardingStatus !== 'completed',
    source,
  })
  const currentFacts = object(listing.sellerCanonicalFacts || listing.seller_canonical_facts_json)
  const generatedFacts = object(suppliedCanonicalFacts || generated.canonicalSellerFacts)
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
    sellerName: Boolean(fullName),
    sellerEmail: Boolean(email),
    sellerPhone: Boolean(phone),
    idNumber: Boolean(first(nextFormData.idNumber, nextFormData.sellerIdNumber, nextFormData.companyRegistrationNumber, nextFormData.trustRegistrationNumber, nextFormData.estateReferenceNumber)),
    propertyAddress: Boolean(first(nextFormData.propertyAddress, nextFormData.addressLine1, listing.propertyAddress, listing.addressLine1)),
    ownerStructureType: authority.identified,
    authorityProfile: authority.profileType,
    authorityConfirmed: authority.identified && authority.signatoryPolicy.mode !== 'blocked',
  }
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
    contact: Object.freeze({ fullName, email, phone }),
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
      name: update.contact?.fullName || '',
      email: update.contact?.email || '',
      phone: update.contact?.phone || '',
    },
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
