export const SELLER_ONBOARDING_REVIEW_CONTRACT = 'arch9-seller-onboarding-review-v1'

export const SELLER_ONBOARDING_REVIEW_STATUS = Object.freeze({
  awaitingAgentReview: 'awaiting_agent_review',
  approved: 'approved',
  correctionRequested: 'correction_requested',
})

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export function readSellerOnboardingReview(value = {}) {
  const source = record(value)
  const status = Object.values(SELLER_ONBOARDING_REVIEW_STATUS).includes(text(source.status))
    ? text(source.status)
    : SELLER_ONBOARDING_REVIEW_STATUS.awaitingAgentReview
  return {
    contract: SELLER_ONBOARDING_REVIEW_CONTRACT,
    status,
    reason: text(source.reason),
    reviewedAt: text(source.reviewedAt || source.reviewed_at),
    reviewedBy: text(source.reviewedBy || source.reviewed_by),
    history: Array.isArray(source.history) ? source.history : [],
  }
}

export function recordSellerOnboardingReview({ existing = {}, status = '', reason = '', actor = '', at = new Date().toISOString() } = {}) {
  const current = readSellerOnboardingReview(existing)
  if (!Object.values(SELLER_ONBOARDING_REVIEW_STATUS).includes(status)) throw new Error('Unknown seller onboarding review status.')
  const nextReason = text(reason)
  if (status === SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested && !nextReason) {
    throw new Error('A correction reason is required before returning seller onboarding.')
  }
  const entry = { status, reason: nextReason, at: text(at), actor: text(actor) }
  return {
    contract: SELLER_ONBOARDING_REVIEW_CONTRACT,
    status,
    reason: nextReason,
    reviewedAt: entry.at,
    reviewed_at: entry.at,
    reviewedBy: entry.actor,
    reviewed_by: entry.actor,
    history: [...current.history, entry],
  }
}
