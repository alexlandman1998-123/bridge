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

export function assertListingEditorSellerOwnership(form = {}, listing = {}) {
  const onboarding = listing.sellerOnboarding || {}
  const savedForm = onboarding.formData || onboarding.form_data || {}
  const facts = onboarding.storedCanonicalFacts || onboarding.canonicalFacts || {}
  const seller = facts.seller || {}
  const normalize = (value) => {
    const key = String(value || '').trim().toLowerCase()
    if (['individual', 'natural_person', 'person'].includes(key)) return 'individual'
    if (['multiple_owners', 'multiple_individuals', 'joint'].includes(key)) return 'multiple_owners'
    return key
  }
  const requested = normalize(form.sellerType)
  const saved = normalize(seller.owner_structure_type || seller.profile_type || seller.legal_type || savedForm.ownerStructureType || onboarding.sellerType)
  const owners = savedForm.owners || seller.owners || []
  if ((saved && requested && saved !== requested) ||
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
