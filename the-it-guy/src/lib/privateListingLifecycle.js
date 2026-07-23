const CANONICAL_PRIVATE_LISTING_STATUSES = [
  'seller_lead',
  'onboarding_sent',
  'onboarding_completed',
  'listing_review',
  'mandate_ready',
  'mandate_sent',
  'mandate_signed',
  'active',
  'under_offer',
  'transaction_created',
  'sold',
  'withdrawn',
]

const LEGACY_STATUS_MAP = {
  draft: 'seller_lead',
  seller_onboarding_pending: 'seller_lead',
  seller_onboarding_sent: 'onboarding_sent',
  seller_onboarding_completed: 'onboarding_completed',
  listing_active: 'active',
  in_progress: 'active',
}

const PRIVATE_LISTING_STATUS_LABELS = {
  seller_lead: 'Seller Lead',
  onboarding_sent: 'Onboarding Sent',
  onboarding_completed: 'Onboarding Completed',
  listing_review: 'Listing Review',
  mandate_ready: 'Mandate Ready',
  mandate_sent: 'Mandate Sent',
  mandate_signed: 'Mandate Signed',
  active: 'Active',
  under_offer: 'Under Offer',
  transaction_created: 'Transaction Created',
  sold: 'Sold',
  withdrawn: 'Withdrawn',
}

const PRIVATE_LISTING_STATUS_DESCRIPTIONS = {
  seller_lead: 'Seller lead captured. Send seller onboarding to progress the listing.',
  onboarding_sent: 'Seller onboarding link has been sent. Waiting for seller submission.',
  onboarding_completed: 'Seller completed onboarding. Review details and prepare the mandate step.',
  listing_review: 'Listing details are under internal review before mandate readiness.',
  mandate_ready: 'Listing has enough detail for mandate preparation.',
  mandate_sent: 'Mandate has been sent to seller and is awaiting signature.',
  mandate_signed: 'Mandate is signed. Listing is live with any remaining requirements tracked as warnings.',
  active: 'Listing is active and market-ready.',
  under_offer: 'Listing currently has an accepted/pending offer flow.',
  transaction_created: 'A transaction has been created from this listing.',
  sold: 'Listing lifecycle is complete and marked sold.',
  withdrawn: 'Listing has been withdrawn and archived from active operations.',
}

const PRIVATE_LISTING_STATUS_GROUPS = {
  seller_lead: 'draft_intake',
  onboarding_sent: 'draft_intake',
  onboarding_completed: 'draft_intake',
  listing_review: 'draft_intake',
  mandate_ready: 'mandate',
  mandate_sent: 'mandate',
  mandate_signed: 'mandate',
  active: 'active',
  under_offer: 'under_offer',
  transaction_created: 'under_offer',
  sold: 'sold_archived',
  withdrawn: 'withdrawn',
}

const PRIVATE_LISTING_TRANSITIONS = {
  seller_lead: ['onboarding_sent', 'active', 'withdrawn'],
  onboarding_sent: ['onboarding_completed', 'active', 'withdrawn'],
  onboarding_completed: ['listing_review', 'mandate_ready', 'active', 'withdrawn'],
  listing_review: ['mandate_ready', 'active', 'withdrawn'],
  mandate_ready: ['mandate_sent', 'active', 'withdrawn'],
  mandate_sent: ['mandate_signed', 'active', 'withdrawn'],
  mandate_signed: ['active', 'withdrawn'],
  active: ['under_offer', 'withdrawn'],
  under_offer: ['transaction_created', 'active', 'withdrawn'],
  transaction_created: ['sold', 'active', 'withdrawn'],
  sold: [],
  withdrawn: [],
}

const CANONICAL_MANDATE_COMPLETION_TARGETS = new Set(['mandate_signed', 'active'])
const CANONICAL_MANDATE_COMPLETION_BLOCKER = 'A completed canonical mandate packet with a final signed artifact is required before this listing can move to a signed or active stage.'

const PRIVATE_LISTING_STATUS_SIDE_EFFECTS = {
  onboarding_sent: {
    sellerOnboardingStatus: 'sent',
    listingVisibility: 'internal',
    isActive: false,
    activityType: 'onboarding_sent',
    activityTitle: 'Onboarding sent',
    activityDescription: 'Seller onboarding has been sent.',
  },
  onboarding_completed: {
    sellerOnboardingStatus: 'completed',
    listingVisibility: 'internal',
    isActive: false,
    activityType: 'onboarding_completed',
    activityTitle: 'Onboarding completed',
    activityDescription: 'Seller onboarding has been completed.',
  },
  mandate_ready: {
    mandateStatus: 'ready',
    listingVisibility: 'internal',
    isActive: false,
    activityType: 'mandate_ready',
    activityTitle: 'Mandate ready',
    activityDescription: 'Listing is ready for mandate generation/sending.',
  },
  mandate_sent: {
    mandateStatus: 'sent',
    listingVisibility: 'internal',
    isActive: false,
    activityType: 'mandate_sent',
    activityTitle: 'Mandate sent',
    activityDescription: 'Mandate has been sent to seller.',
  },
  mandate_signed: {
    mandateStatus: 'signed',
    listingVisibility: 'active_market',
    isActive: true,
    activityType: 'mandate_signed',
    activityTitle: 'Mandate signed',
    activityDescription: 'Mandate has been signed and the listing is live.',
  },
  active: {
    listingVisibility: 'active_market',
    isActive: true,
    activityType: 'listing_activated',
    activityTitle: 'Listing activated',
    activityDescription: 'Listing moved to active market.',
  },
  withdrawn: {
    listingVisibility: 'archived',
    isActive: false,
    activityType: 'listing_withdrawn',
    activityTitle: 'Listing withdrawn',
    activityDescription: 'Listing withdrawn from market workflow.',
  },
  sold: {
    listingVisibility: 'archived',
    isActive: false,
    activityType: 'listing_sold',
    activityTitle: 'Listing sold',
    activityDescription: 'Listing marked as sold/closed.',
  },
}

export const PRIVATE_LISTING_PERMISSION_KEYS = {
  TRANSITION: 'can_transition_private_listing',
  OVERRIDE: 'can_override_private_listing_lifecycle',
  ACTIVATE: 'can_activate_private_listing',
  WITHDRAW: 'can_withdraw_private_listing',
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  return normalizeText(value).length > 0
}

function hasCanonicalFinalMandatePacket(listing = {}) {
  const packet = listing?.mandatePacket && typeof listing.mandatePacket === 'object'
    ? listing.mandatePacket
    : listing?.mandate_packet && typeof listing.mandate_packet === 'object'
      ? listing.mandate_packet
      : {}
  const packetRecord = packet?.packet && typeof packet.packet === 'object' ? packet.packet : packet
  const version = packet?.version && typeof packet.version === 'object' ? packet.version : {}
  const packetId = normalizeText(packet?.id || packet?.packetId || packet?.packet_id || packetRecord?.id)
  const packetStatus = normalizeKey(packet?.state || packet?.status || packetRecord?.status || packetRecord?.lifecycle_state)
  const finalArtifactPath = normalizeText(
    packet?.finalSignedFilePath ||
      packet?.final_signed_file_path ||
      version?.finalSignedFilePath ||
      version?.final_signed_file_path,
  )
  const completed = ['completed', 'fully_signed', 'finalised', 'finalized'].includes(packetStatus)
  return Boolean(packetId && completed && finalArtifactPath)
}

function getCanonicalMandateCompletionBlocker(listing = {}, targetStatus = '') {
  const normalizedTarget = mapLegacyListingStatusToCanonicalStatus(targetStatus)
  if (!CANONICAL_MANDATE_COMPLETION_TARGETS.has(normalizedTarget)) return ''
  return hasCanonicalFinalMandatePacket(listing) ? '' : CANONICAL_MANDATE_COMPLETION_BLOCKER
}

function isOnboardingCompleted(listing = {}, metadata = {}) {
  const onboardingStatus = normalizeKey(
    metadata?.onboardingStatus ||
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status,
  )
  return onboardingStatus === 'completed'
}

function hasOnboardingFormData(listing = {}, metadata = {}) {
  const formData =
    metadata?.onboardingFormData ||
    listing?.sellerOnboarding?.formData ||
    listing?.sellerOnboarding?.form_data ||
    null
  return Boolean(formData && typeof formData === 'object' && Object.keys(formData).length > 0)
}

export function mapLegacyListingStatusToCanonicalStatus(status) {
  const normalized = normalizeKey(status)
  if (!normalized) return 'seller_lead'
  if (CANONICAL_PRIVATE_LISTING_STATUSES.includes(normalized)) return normalized
  if (LEGACY_STATUS_MAP[normalized]) return LEGACY_STATUS_MAP[normalized]
  if (normalized.includes('onboarding') && normalized.includes('sent')) return 'onboarding_sent'
  if (normalized.includes('onboarding') && normalized.includes('complete')) return 'onboarding_completed'
  if (normalized.includes('mandate') && normalized.includes('ready')) return 'mandate_ready'
  if (normalized.includes('mandate') && normalized.includes('sent')) return 'mandate_sent'
  if (normalized.includes('mandate') && normalized.includes('signed')) return 'mandate_signed'
  if (normalized.includes('listing') && normalized.includes('review')) return 'listing_review'
  if (normalized.includes('offer')) return 'under_offer'
  if (normalized.includes('transaction')) return 'transaction_created'
  if (normalized.includes('sold') || normalized.includes('registered')) return 'sold'
  if (normalized.includes('withdraw')) return 'withdrawn'
  if (normalized.includes('active')) return 'active'
  if (normalized.includes('lead') || normalized.includes('draft')) return 'seller_lead'
  return 'seller_lead'
}

export function getPrivateListingLifecycleState(listing = {}) {
  return mapLegacyListingStatusToCanonicalStatus(
    listing?.listingStatus || listing?.listing_status || listing?.status || listing?.stage,
  )
}

export function getAllowedPrivateListingTransitions(currentStatus) {
  const normalized = mapLegacyListingStatusToCanonicalStatus(currentStatus)
  return [...(PRIVATE_LISTING_TRANSITIONS[normalized] || [])]
}

export function getPrivateListingStatusLabel(status) {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  return PRIVATE_LISTING_STATUS_LABELS[normalized] || 'Seller Lead'
}

export function getPrivateListingStatusDescription(status) {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  return PRIVATE_LISTING_STATUS_DESCRIPTIONS[normalized] || 'Listing lifecycle state.'
}

export function getPrivateListingStatusGroup(status) {
  const normalized = mapLegacyListingStatusToCanonicalStatus(status)
  return PRIVATE_LISTING_STATUS_GROUPS[normalized] || 'draft_intake'
}

export function getPrivateListingTransitionSideEffects(targetStatus) {
  const normalizedTarget = mapLegacyListingStatusToCanonicalStatus(targetStatus)
  const patch = PRIVATE_LISTING_STATUS_SIDE_EFFECTS[normalizedTarget] || {}
  return {
    listingStatus: normalizedTarget,
    ...patch,
  }
}

export function evaluatePrivateListingTransitionGuards(listing = {}, targetStatus, metadata = {}) {
  const normalizedTarget = mapLegacyListingStatusToCanonicalStatus(targetStatus)
  const blockers = []

  if (normalizedTarget === 'onboarding_sent') {
    const hasOnboardingToken = hasValue(metadata?.onboardingToken || listing?.sellerOnboarding?.token)
    const hasSellerContact =
      hasValue(metadata?.sellerContactEmail) ||
      hasValue(metadata?.sellerContactPhone) ||
      hasValue(metadata?.sellerEmail) ||
      hasValue(metadata?.sellerPhone)
    if (!hasOnboardingToken) {
      blockers.push('Seller onboarding token/record is missing.')
    }
    if (!hasSellerContact) {
      blockers.push('Seller contact email or phone is required before sending onboarding.')
    }
  }

  if (normalizedTarget === 'onboarding_completed') {
    if (!isOnboardingCompleted(listing, metadata)) {
      blockers.push('Seller onboarding must be completed first.')
    }
    if (!hasOnboardingFormData(listing, metadata)) {
      blockers.push('Onboarding form data is required before completion transition.')
    }
  }

  if (normalizedTarget === 'mandate_ready') {
    if (!isOnboardingCompleted(listing, metadata)) {
      blockers.push('Seller onboarding must be completed before mandate readiness.')
    }
    if (!hasValue(metadata?.sellerType || listing?.sellerType || listing?.seller_type)) {
      blockers.push('Seller type is required before mandate readiness.')
    }
    if (!hasValue(metadata?.addressLine1 || listing?.addressLine1 || listing?.address_line_1)) {
      blockers.push('Property address is required before mandate readiness.')
    }
    const hasPrice = hasValue(metadata?.askingPrice || listing?.askingPrice || listing?.asking_price)
    if (!hasPrice) {
      blockers.push('Asking price or value expectation is required before mandate readiness.')
    }
  }

  if (normalizedTarget === 'mandate_sent') {
    const mandateStatus = normalizeKey(metadata?.mandateStatus || listing?.mandateStatus || listing?.mandate_status)
    const hasMandatePrepared = ['ready', 'generated', 'sent', 'viewed', 'signed', 'signed_uploaded', 'signed_external_pending_upload'].includes(mandateStatus)
    if (!hasMandatePrepared) {
      blockers.push('Mandate must be ready/generated before it can be sent.')
    }
    if (!hasValue(metadata?.sellerContactEmail) && !hasValue(metadata?.sellerContactPhone)) {
      blockers.push('Seller contact details are required to send mandate.')
    }
  }

  const canonicalMandateCompletionBlocker = getCanonicalMandateCompletionBlocker(listing, normalizedTarget)
  if (canonicalMandateCompletionBlocker) blockers.push(canonicalMandateCompletionBlocker)

  if (normalizedTarget === 'under_offer') {
    const currentStatus = getPrivateListingLifecycleState(listing)
    if (currentStatus !== 'active') {
      blockers.push('Listing must be active before moving under offer.')
    }
  }

  if (normalizedTarget === 'transaction_created') {
    const hasTransactionLinkage = hasValue(
      metadata?.transactionId || listing?.transactionId || listing?.transaction_id || listing?.linkedTransactionId,
    )
    if (!hasTransactionLinkage) {
      blockers.push('Buyer/deal/transaction linkage is required before transaction created status.')
    }
  }

  if (normalizedTarget === 'sold') {
    const hasSoldSignal = Boolean(
      metadata?.transactionRegistered ||
        metadata?.isSold ||
        ['registered', 'completed', 'sold'].includes(
          normalizeKey(metadata?.transactionStatus || listing?.transactionStatus || listing?.transaction_status),
        ),
    )
    if (!hasSoldSignal) {
      blockers.push('Transaction must be registered/completed before marking listing as sold.')
    }
  }

  return blockers
}

export function canTransitionPrivateListing(listing = {}, targetStatus, { allowOverride = false, metadata = {} } = {}) {
  const currentStatus = getPrivateListingLifecycleState(listing)
  const normalizedTarget = mapLegacyListingStatusToCanonicalStatus(targetStatus)
  const allowedTargets = getAllowedPrivateListingTransitions(currentStatus)
  const transitionAllowed = allowedTargets.includes(normalizedTarget)
  const blockers = evaluatePrivateListingTransitionGuards(listing, normalizedTarget, metadata)
  const canonicalMandateCompletionBlocker = getCanonicalMandateCompletionBlocker(listing, normalizedTarget)
  const nonOverridableBlockers = canonicalMandateCompletionBlocker ? [canonicalMandateCompletionBlocker] : []
  const allowed = transitionAllowed && nonOverridableBlockers.length === 0 && (allowOverride || blockers.length === 0)

  return {
    allowed,
    transitionAllowed,
    currentStatus,
    targetStatus: normalizedTarget,
    allowedTargets,
    blockers,
    nonOverridableBlockers,
    overrideRequired: transitionAllowed && blockers.length > 0 && nonOverridableBlockers.length === 0 && !allowOverride,
  }
}

export function transitionPrivateListingStatus(listingId, targetStatus, metadata = {}) {
  const normalizedId = normalizeText(listingId)
  if (!normalizedId) {
    throw new Error('Listing id is required.')
  }
  const normalizedTarget = mapLegacyListingStatusToCanonicalStatus(targetStatus)
  const sideEffects = getPrivateListingTransitionSideEffects(normalizedTarget)
  return {
    listingId: normalizedId,
    targetStatus: normalizedTarget,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    sideEffects,
  }
}

export function getPrivateListingLifecycleNextAction(listing = {}) {
  const status = getPrivateListingLifecycleState(listing)
  if (status === 'seller_lead') return 'Send seller onboarding'
  if (status === 'onboarding_sent') return 'Await seller onboarding completion'
  if (status === 'onboarding_completed') return 'Review listing and prepare mandate'
  if (status === 'listing_review') return 'Finalize review and move to mandate ready'
  if (status === 'mandate_ready') return 'Generate and send mandate'
  if (status === 'mandate_sent') return 'Await mandate signature'
  if (status === 'mandate_signed') return 'Resolve listing warnings'
  if (status === 'active') return 'Manage viewings and offers'
  if (status === 'under_offer') return 'Progress offer and transaction setup'
  if (status === 'transaction_created') return 'Track transaction to completion'
  if (status === 'sold') return 'No further action is available for this listing.'
  if (status === 'withdrawn') return 'No further action is available for this listing.'
  return 'Review listing workflow status'
}

export const PRIVATE_LISTING_LIFECYCLE = {
  STATUSES: CANONICAL_PRIVATE_LISTING_STATUSES,
  TRANSITIONS: PRIVATE_LISTING_TRANSITIONS,
  STATUS_LABELS: PRIVATE_LISTING_STATUS_LABELS,
  STATUS_DESCRIPTIONS: PRIVATE_LISTING_STATUS_DESCRIPTIONS,
  STATUS_GROUPS: PRIVATE_LISTING_STATUS_GROUPS,
  SIDE_EFFECTS: PRIVATE_LISTING_STATUS_SIDE_EFFECTS,
}
