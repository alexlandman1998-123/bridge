import { resolveListingSellerAuthorityContract } from '../../lib/sellerPartyAuthorityContract.js'

export const LISTING_SELLER_SETUP_STATE_VERSION = 'listing_seller_setup_state_phase3_v1'

export const LISTING_SELLER_SETUP_STATUS = Object.freeze({
  configured: 'configured',
  setupRequired: 'setup_required',
  reviewRequired: 'review_required',
})

function clean(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function first(...values) {
  return values.find((value) => clean(value))
}

function getListingSellerForm(listing = {}) {
  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  return onboarding?.formData || onboarding?.form_data || listing?.sellerOnboardingFormData || listing?.seller_onboarding_form_data || {}
}

function getFacts(listing = {}) {
  return listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {}
}

export function resolveListingSellerSource(listing = {}) {
  const facts = getFacts(listing)
  const metadata = facts?.metadata && typeof facts.metadata === 'object' ? facts.metadata : {}
  const source = key(first(
    facts?.source,
    metadata?.source,
    listing?.importSource,
    listing?.import_source,
    listing?.recordSource,
    listing?.record_source,
    listing?.source,
  ))

  if (source === 'direct_listing_intake' || source.includes('quick_add') || source === 'direct_listing' || source === 'manual') {
    return Object.freeze({ key: 'direct', label: 'Direct listing', imported: false })
  }
  if (source.includes('property24') || source === 'p24' || facts?.property24Import === true || facts?.property24_import === true) {
    return Object.freeze({ key: 'property24_import', label: 'Property24 import', imported: true })
  }
  if (source.includes('private_property') || source === 'privateproperty' || source === 'pp' || facts?.privatePropertyImport === true || facts?.private_property_import === true) {
    return Object.freeze({ key: 'private_property_import', label: 'Private Property import', imported: true })
  }
  if (source.includes('legacy') || source.includes('migration') || source.includes('historical') || source.includes('import')) {
    return Object.freeze({ key: 'historical_import', label: 'Historical / imported listing', imported: true })
  }
  return Object.freeze({ key: 'unknown', label: 'Existing listing', imported: false })
}

function resolveContact(listing = {}) {
  const form = getListingSellerForm(listing)
  const facts = getFacts(listing)
  const sellerFacts = facts?.seller && typeof facts.seller === 'object' ? facts.seller : {}
  const primaryContact = sellerFacts?.primary_contact && typeof sellerFacts.primary_contact === 'object' ? sellerFacts.primary_contact : {}
  const firstName = first(form?.sellerFirstName, form?.firstName, facts?.firstName, sellerFacts?.first_name, listing?.sellerFirstName)
  const lastName = first(form?.sellerSurname, form?.lastName, facts?.lastName, sellerFacts?.surname, listing?.sellerLastName)
  return Object.freeze({
    name: clean(first(form?.sellerName, form?.fullName, facts?.fullName, facts?.sellerName, sellerFacts?.full_name, primaryContact?.name, [firstName, lastName].filter(Boolean).join(' '), listing?.sellerName)),
    email: clean(first(form?.sellerEmail, form?.email, facts?.email, sellerFacts?.email, primaryContact?.email, listing?.sellerEmail)).toLowerCase(),
    phone: clean(first(form?.sellerPhone, form?.phone, facts?.phone, sellerFacts?.phone, primaryContact?.phone, listing?.sellerPhone)),
  })
}

export function buildListingSellerSetupState(listing = {}) {
  const authority = resolveListingSellerAuthorityContract(listing)
  const source = resolveListingSellerSource(listing)
  const contact = resolveContact(listing)
  const configured = authority.identified
  const status = configured
    ? LISTING_SELLER_SETUP_STATUS.configured
    : source.imported
      ? LISTING_SELLER_SETUP_STATUS.reviewRequired
      : LISTING_SELLER_SETUP_STATUS.setupRequired

  return Object.freeze({
    version: LISTING_SELLER_SETUP_STATE_VERSION,
    status,
    configured,
    requiresSetup: !configured,
    requiresReview: status === LISTING_SELLER_SETUP_STATUS.reviewRequired,
    title: configured
      ? `${authority.profileType.replaceAll('_', ' ')} seller configured`
      : status === LISTING_SELLER_SETUP_STATUS.reviewRequired
        ? 'Confirm the imported seller'
        : 'Set up the seller',
    explanation: configured
      ? 'The ownership model is confirmed and drives seller fields, signing authority and document requirements.'
      : status === LISTING_SELLER_SETUP_STATUS.reviewRequired
        ? 'This listing was imported without a trustworthy ownership model. Confirm the legal owner before Arch9 creates a mandate or compliance checklist.'
        : 'This listing can remain live while seller setup is completed. Choose the legal owner type yourself or send onboarding so the seller can provide it.',
    source,
    contact,
    authority,
    actions: Object.freeze({
      canCaptureOwner: !configured,
      canSendOnboarding: !configured,
      canPrepareMandate: configured,
      canGenerateComplianceRequirements: configured,
    }),
    blockers: Object.freeze({
      mandate: configured ? '' : 'Confirm the legal owner and signing authority before preparing a mandate.',
      documents: configured ? '' : 'The compliance checklist will be generated only after the legal owner type is confirmed.',
    }),
  })
}

export default buildListingSellerSetupState
