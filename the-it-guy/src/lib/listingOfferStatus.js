export const OFFER_WORKFLOW_STATUS = {
  DRAFT: 'draft',
  SENT_TO_BUYER: 'sent_to_buyer',
  BUYER_VIEWED: 'buyer_viewed',
  SUBMITTED: 'submitted',
  AGENT_REVIEW: 'agent_review',
  CHANGES_REQUESTED: 'changes_requested',
  SENT_TO_SELLER: 'sent_to_seller',
  SELLER_REVIEW: 'sent_to_seller',
  SELLER_VIEWED: 'seller_viewed',
  COUNTERED: 'countered',
  BUYER_REVIEW_COUNTER: 'countered',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
  CONVERTED_TO_TRANSACTION: 'converted_to_transaction',
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeOfferWorkflowStatus(value) {
  const key = normalize(value)
  if (!key) return OFFER_WORKFLOW_STATUS.DRAFT
  if (key === 'pending') return OFFER_WORKFLOW_STATUS.SUBMITTED
  if (key === 'under_review' || key === 'review') return OFFER_WORKFLOW_STATUS.AGENT_REVIEW
  if (key === 'seller_review' || key === 'awaiting_seller_review') return OFFER_WORKFLOW_STATUS.SENT_TO_SELLER
  if (key === 'buyer_review_counter' || key === 'negotiation') return OFFER_WORKFLOW_STATUS.COUNTERED
  return key
}
