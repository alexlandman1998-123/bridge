import { normalizeSellerProfileType } from '../../lib/sellerPartyAuthorityContract.js'

const CLASSIFICATION_COPY = Object.freeze({
  configured: {
    label: 'Seller structure configured',
    tone: 'ready',
    description: 'The saved seller structure has one consistent, explicit source.',
  },
  unconfigured: {
    label: 'Seller setup required',
    tone: 'attention',
    description: 'No reliable historical seller type was found. Confirm the legal owner before generating requirements.',
  },
  ambiguous: {
    label: 'Seller details need confirmation',
    tone: 'attention',
    description: 'Historical details suggest a seller structure, but the record is not explicit enough to use safely.',
  },
  inconsistent: {
    label: 'Conflicting seller details',
    tone: 'danger',
    description: 'Historical seller sources disagree. Review the legal owner and authority details before continuing.',
  },
})

export function getListingEditorSellerOwnershipFields(listing = {}) {
  const onboarding = listing.sellerOnboarding || listing.seller_onboarding || {}
  const savedForm = onboarding.formData || onboarding.form_data || listing.sellerOnboardingFormData || listing.seller_onboarding_form_data || {}
  const facts = onboarding.storedCanonicalFacts || onboarding.canonicalFacts || listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || {}
  const seller = facts.seller || {}
  const savedModel = seller.owner_structure_type || seller.ownerStructureType || seller.profile_type ||
    savedForm.ownerStructureType || savedForm.owner_structure_type || seller.legal_type ||
    seller.sellerLegalType || seller.legalType || savedForm.sellerLegalType || savedForm.ownershipType || savedForm.sellerType ||
    onboarding.sellerType || onboarding.seller_type || ''
  const raw = savedModel || listing.sellerType || listing.seller_type || ''
  const ownerEntityType = seller.owner_entity_type || seller.ownerEntityType || savedForm.ownerEntityType || savedForm.owner_entity_type || ''
  let profile = normalizeSellerProfileType(raw)
  if (!savedModel && profile === 'individual' && !savedForm.sellerOwnershipConfirmed && !seller.ownership_confirmed) profile = 'unknown'
  if (String(ownerEntityType).trim().toLowerCase() === 'foreign') {
    profile = String(raw).toLowerCase().includes('company') ? 'foreign_company'
      : String(raw).toLowerCase().includes('trust') ? 'foreign_trust' : 'foreign_individual'
  }
  return {
    // The listing selector describes the entity; the Seller profile also carries
    // marriage or delegated signing authority. Keep both when reopening an edit.
    sellerType: ['married', 'power_of_attorney'].includes(profile) ? 'individual' : profile,
    ownerStructureType: profile === 'unknown' ? '' : raw,
    ownerEntityType,
  }
}

export function assertListingEditorSellerOwnership(form = {}, listing = {}) {
  const onboarding = listing.sellerOnboarding || listing.seller_onboarding || {}
  const savedForm = onboarding.formData || onboarding.form_data || {}
  const facts = onboarding.storedCanonicalFacts || onboarding.canonicalFacts || listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || {}
  const seller = facts.seller || {}
  const entity = (value) => {
    const profile = normalizeSellerProfileType(value)
    return ['married', 'power_of_attorney'].includes(profile) ? 'individual' : profile
  }
  const requested = entity(form.sellerType)
  const saved = getListingEditorSellerOwnershipFields(listing).sellerType
  const owners = savedForm.owners || seller.owners || []
  if ((saved !== 'unknown' && String(form.sellerType || '').trim() && saved !== requested) ||
      (requested === 'individual' && Array.isArray(owners) && owners.length > 1)) {
    throw new Error('The seller ownership structure differs from the saved Seller record. Review and confirm the legal owners in the Seller section before saving this listing. No listing changes were saved.')
  }
}

export function buildListingSellerHistoricalNormalization(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const classification = CLASSIFICATION_COPY[raw.classification] ? raw.classification : 'ambiguous'
  const copy = CLASSIFICATION_COPY[classification]
  const pendingConfirmation = raw.normalizationStatus === 'backfilled_pending_confirmation'
  const requiresReview = raw.requiresAgentReview === true || pendingConfirmation || classification !== 'configured'
  return {
    listingId: String(raw.listingId || ''),
    classification,
    inferredProfileType: String(raw.inferredProfileType || ''),
    safeToBackfill: raw.safeToBackfill === true,
    requiresReview,
    requirementsRebuildAllowed: raw.requirementsRebuildAllowed === true,
    sourceFingerprint: String(raw.sourceFingerprint || ''),
    label: pendingConfirmation ? 'Confirm normalized seller details' : copy.label,
    description: pendingConfirmation
      ? 'A single explicit historical seller type was projected, but an agent must confirm it before the document checklist changes.'
      : copy.description,
    tone: pendingConfirmation ? 'attention' : copy.tone,
    actionLabel: classification === 'inconsistent'
      ? 'Review conflicts'
      : classification === 'unconfigured'
        ? 'Set up seller'
        : 'Review seller details',
  }
}
