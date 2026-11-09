// Shared saved-onboarding evidence for the seller workspace and lean lead list.
// Keep this module free of document/PDF and API dependencies.
function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

export const SELLER_ONBOARDING_SUBMITTED_STATUSES = new Set(['submitted', 'completed', 'complete', 'under_review', 'onboarding_completed', 'seller_onboarding_completed'])
const SELLER_ONBOARDING_SENT_STATUSES = new Set(['sent', 'in_progress', ...SELLER_ONBOARDING_SUBMITTED_STATUSES])
const SELLER_ONBOARDING_SENT_STAGE_SIGNALS = new Set([
  'seller_onboarding_sent',
  'onboarding_sent',
])
const SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS = new Set([
  'seller_onboarding_submitted',
  'seller_onboarding_completed',
  'onboarding_submitted',
  'onboarding_completed',
  'listing_review',
  'mandate_ready',
  'mandate_sent',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'all_documents_submitted',
  'documents_submitted',
  'under_offer',
  'transaction_created',
  'sold',
])
function hasSellerOnboardingDurableSubmissionEvidence({ lead = {}, listing = {}, canonicalListing = false } = {}) {
  const onboarding = listing?.sellerOnboarding && typeof listing.sellerOnboarding === 'object'
    ? listing.sellerOnboarding
    : listing?.seller_onboarding && typeof listing.seller_onboarding === 'object'
      ? listing.seller_onboarding
      : !canonicalListing && lead?.sellerOnboarding && typeof lead.sellerOnboarding === 'object'
        ? lead.sellerOnboarding
        : {}
  const leadStatus = canonicalListing ? '' : normalizeKey(lead?.sellerOnboardingStatus || lead?.seller_onboarding_status)
  const onboardingStatus = normalizeKey(onboarding?.status || onboarding?.onboardingStatus || onboarding?.onboarding_status)
  const listingStatus = normalizeKey(listing?.seller_onboarding_status || listing?.sellerOnboardingStatus)
  const submittedAt = firstPresent(
    canonicalListing ? '' : lead?.sellerOnboardingSubmittedAt,
    canonicalListing ? '' : lead?.seller_onboarding_submitted_at,
    canonicalListing ? '' : lead?.sellerOnboardingCompletedAt,
    canonicalListing ? '' : lead?.seller_onboarding_completed_at,
    onboarding?.submittedAt,
    onboarding?.submitted_at,
    onboarding?.completedAt,
    onboarding?.completed_at,
    listing?.seller_onboarding_submitted_at,
    listing?.sellerOnboardingSubmittedAt,
  )
  if (submittedAt) return true
  if (onboardingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus)) return false
  if (listingStatus && !SELLER_ONBOARDING_SUBMITTED_STATUSES.has(listingStatus)) return false
  return Boolean(
    SELLER_ONBOARDING_SUBMITTED_STATUSES.has(onboardingStatus) ||
      SELLER_ONBOARDING_SUBMITTED_STATUSES.has(listingStatus) ||
      SELLER_ONBOARDING_SUBMITTED_STATUSES.has(leadStatus),
  )
}


export function readSellerOnboardingSignals({ lead = {}, listing = {}, canonicalListing = false } = {}) {
  const listingScopedStatus = normalizeKey(
    listing?.sellerOnboarding?.status ||
      listing?.seller_onboarding?.status ||
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status,
  )
  const leadScopedStatus = normalizeKey(
    lead?.sellerOnboardingStatus ||
      lead?.seller_onboarding_status ||
      lead?.sellerOnboarding?.status ||
      lead?.seller_onboarding?.status,
  )
  const status = canonicalListing ? listingScopedStatus : listingScopedStatus || leadScopedStatus
  const leadJourneySignals = canonicalListing ? [] : [
    lead?.stage,
    lead?.status,
    lead?.currentStage,
    lead?.current_stage,
  ].map(normalizeKey).filter(Boolean)
  const token = firstPresent(
    listing?.sellerOnboarding?.token,
    listing?.seller_onboarding_token,
    canonicalListing ? '' : lead?.sellerOnboardingToken,
    canonicalListing ? '' : lead?.seller_onboarding_token,
  )
  const listingLifecycle = normalizeKey(
    listing?.listingStatus ||
      listing?.listing_status ||
      listing?.status ||
      listing?.lifecycleStatus ||
      listing?.lifecycle_status,
  )
  const durableSubmitted = hasSellerOnboardingDurableSubmissionEvidence({ lead, listing, canonicalListing })
  const listingLifecycleImpliesSubmitted = durableSubmitted && ['onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle)
  const sent = Boolean(
    token ||
      SELLER_ONBOARDING_SENT_STATUSES.has(status) ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SENT_STAGE_SIGNALS.has(signal) || signal === 'sent' || signal === 'in_progress') ||
      leadJourneySignals.some((signal) => SELLER_ONBOARDING_SUBMITTED_STAGE_SIGNALS.has(signal)) ||
      ['onboarding_sent', 'onboarding_completed', 'listing_review', 'mandate_ready', 'mandate_sent', 'mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold'].includes(listingLifecycle),
  )
  const submitted = Boolean(
    durableSubmitted ||
      listingLifecycleImpliesSubmitted,
  )
  return {
    sent,
    submitted,
    status,
    token,
    pending: sent && !submitted && Boolean(status || token),
  }
}
