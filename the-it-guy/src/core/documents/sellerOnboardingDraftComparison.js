const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

// This snapshot is captured by the submission transaction, before the seller's
// answers replace the publication draft. Never infer it from today's listing.
export function readSellerOnboardingDraftComparison(listing = {}) {
  const source = record(listing?.sourceListing || listing)
  const onboarding = record(source.sellerOnboarding || source.seller_onboarding)
  const comparison = record(onboarding.draftComparison || onboarding.draft_comparison_json || source.seller_onboarding?.draft_comparison_json)
  const differences = Array.isArray(comparison.differences) ? comparison.differences : []
  const awaitingResubmission = differences.length > 0 && onboarding.status !== 'completed'
  return {
    ...comparison,
    differences,
    pending: differences.filter(item => item.status !== 'accepted' || awaitingResubmission),
    awaitingResubmission,
    onboardingId: onboarding.id,
    updatedAt: onboarding.saveRevision?.updatedAt || onboarding.updated_at || onboarding.updatedAt,
  }
}

export function sellerOnboardingDraftPublicationBlocker(listing = {}) {
  const comparison = readSellerOnboardingDraftComparison(listing)
  return comparison.pending.length
    ? `Review ${comparison.pending.length} difference${comparison.pending.length === 1 ? '' : 's'} between the listing draft and seller onboarding before publishing.`
    : ''
}
