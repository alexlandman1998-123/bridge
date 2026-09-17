import { inferLeadCategoryFromRecord } from '../../lib/leadCategory'

export const BUYER_LEAD_LIST_STAGES = Object.freeze([
  ['captured', 'Captured', 'Buyer lead has been captured and is ready for first contact.'],
  ['contacted', 'Contacted', 'Buyer has been contacted and is ready for qualification capture.'],
  ['qualified', 'Qualified', 'Buyer intent, budget, timing, area, and finance readiness have been confirmed.'],
  ['viewing', 'Viewing', 'Viewings are planned or completed.'],
  ['transaction_setup', 'Transaction Setup', 'Buyer profile, finance route, roleplayers, and portal handoff are being captured.'],
  ['offer', 'Offer', 'The signed offer to purchase is being captured and reviewed.'],
  ['transaction', 'Transaction', 'The accepted offer has opened a transaction workflow.'],
  ['on_hold', 'On hold', 'Buyer is paused but not lost.'],
  ['lost', 'Lost', 'Buyer is no longer active in the lead funnel.'],
  ['closed_won', 'Closed won', 'Buyer transaction completed successfully.'],
  ['closed_lost', 'Closed lost', 'Buyer transaction ended after opening.'],
])

const BUYER_STAGE_BY_KEY = new Map(BUYER_LEAD_LIST_STAGES.map(([key, label, description]) => [key, { key, label, description }]))
const BUYER_ALIASES = Object.freeze({
  lead: 'captured', new_lead: 'captured', captured: 'captured',
  contact: 'contacted', contacted: 'contacted', first_contact: 'contacted', first_contacted: 'contacted', buyer_contacted: 'contacted', follow_up: 'contacted',
  qualified: 'qualified', qualification: 'qualified', qualifying: 'qualified',
  viewing: 'viewing', viewing_scheduled: 'viewing', appointment_scheduled: 'viewing', viewing_completed: 'viewing', appointment_completed: 'viewing',
  buyer_onboarding_sent: 'transaction_setup', onboarding_sent: 'transaction_setup', offer_link_sent: 'transaction_setup', offer_onboarding_link_sent: 'transaction_setup', offer_and_onboarding_link_sent: 'transaction_setup', make_an_offer_link_sent: 'transaction_setup', onboarding: 'transaction_setup', buyer_onboarding: 'transaction_setup', transaction_setup: 'transaction_setup', setup: 'transaction_setup', buyer_profile: 'transaction_setup', buyer_profile_captured: 'transaction_setup',
  offer_received: 'offer', offer: 'offer', otp_transaction: 'offer', uploaded_otp: 'offer', otp_uploaded: 'offer', signed_otp_uploaded: 'offer', signed_otp_received: 'offer', offer_submitted: 'offer', buyer_offer_submitted: 'offer', offer_draft: 'offer', negotiating: 'offer', agent_review: 'offer', agent_review_required: 'offer', agent_condition_review: 'offer', ready_to_generate_otp: 'offer', otp_ready: 'offer', ready_for_otp_generation: 'offer', otp_generated: 'offer', generated_otp: 'offer', buyer_signed: 'offer', purchaser_signed: 'offer', agent_signed: 'offer', principal_signed: 'offer', sent_to_seller: 'offer', seller_signed: 'offer', signed_by_all_parties: 'offer', all_parties_signed: 'offer', offer_accepted: 'offer', accepted: 'offer',
  transaction: 'transaction', transaction_live: 'transaction', converted_to_transaction: 'transaction', deal_created: 'transaction', finance: 'transaction', transfer: 'transaction', registered: 'transaction',
  on_hold: 'on_hold', paused: 'on_hold', lost: 'lost', archived: 'lost', closed_won: 'closed_won', won: 'closed_won', closed_lost: 'closed_lost', fallen_through: 'closed_lost',
})

const SELLER_LABELS = Object.freeze({
  new_lead: 'New Lead',
  contacted: 'Contacted',
  seller_onboarding_sent: 'Onboarding Sent',
  seller_onboarding_submitted: 'Onboarding Submitted',
  mandate_signed: 'Mandate Signed',
  listing_created: 'Listing Created',
  listing_live: 'Listing Live',
  documents_submitted: 'All Documents Submitted',
})
const SELLER_ALIASES = Object.freeze({
  lead: 'new_lead', new: 'new_lead', new_lead: 'new_lead', seller_lead: 'new_lead', lead_created: 'new_lead',
  contacted: 'contacted', active: 'contacted', valuation: 'contacted', appointment_scheduled: 'contacted', viewing_scheduled: 'contacted',
  onboarding_sent: 'seller_onboarding_sent', seller_onboarding_sent: 'seller_onboarding_sent',
  onboarding_submitted: 'seller_onboarding_submitted', onboarding_completed: 'seller_onboarding_submitted', seller_onboarding_submitted: 'seller_onboarding_submitted', seller_onboarding_completed: 'seller_onboarding_submitted', mandate_generated: 'seller_onboarding_submitted', mandate_ready: 'seller_onboarding_submitted', mandate_sent: 'seller_onboarding_submitted',
  mandate_signed: 'mandate_signed', listing_created: 'listing_created', converted_to_listing: 'listing_created', listing_live: 'listing_live', listing_active: 'listing_live',
  all_documents_submitted: 'documents_submitted', documents_submitted: 'documents_submitted',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/\+/g, ' and ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function getBuyerLeadListStage(value = '') {
  const key = BUYER_ALIASES[normalizeToken(value)] || 'captured'
  return BUYER_STAGE_BY_KEY.get(key) || BUYER_STAGE_BY_KEY.get('captured')
}

function resolveSellerColumn(rawToken, sellerKey) {
  const combined = `${rawToken} ${sellerKey}`
  if (sellerKey && SELLER_LABELS[sellerKey]) return sellerKey
  // Offers and transactions belong to the downstream transaction workflow.
  // Keep legacy seller-lead records visible in their last seller-facing state
  // instead of recreating transaction columns in the seller journey board.
  if (combined.includes('offer') || combined.includes('deal') || combined.includes('transaction') || combined.includes('otp') || combined.includes('transfer') || combined.includes('registered') || combined.includes('closed')) return 'listing_live'
  return 'new_lead'
}

function sellerFallbackLabel(token, rawStage) {
  if (token.includes('valuation') || token.includes('appointment') || token.includes('viewing')) return 'Contacted'
  if (token.includes('offer') || token.includes('deal') || token.includes('transaction') || token.includes('otp') || token.includes('transfer') || token.includes('registered') || token.includes('closed')) return 'Listing Live'
  return normalizeText(rawStage) || 'New Lead'
}

export function resolveAgencyLeadListLifecycle(lead = {}) {
  const rawStage = normalizeText(lead.stage || lead.status)
  const token = normalizeToken(rawStage)
  const category = inferLeadCategoryFromRecord(lead, 'buyer')
  if (category !== 'seller') {
    const stage = getBuyerLeadListStage(rawStage)
    return { key: stage.key, label: stage.label, columnId: stage.key, category }
  }

  const sellerKey = SELLER_ALIASES[token] || ''
  return {
    key: sellerKey || token || 'new_lead',
    label: SELLER_LABELS[sellerKey] || sellerFallbackLabel(token, rawStage),
    columnId: resolveSellerColumn(token, sellerKey),
    category,
  }
}
