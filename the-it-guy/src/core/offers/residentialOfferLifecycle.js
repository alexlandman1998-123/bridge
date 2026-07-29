export const RESIDENTIAL_OFFER_LIFECYCLE_VERSION = 'residential_offer_lifecycle_phase1a_v1'

export const RESIDENTIAL_OFFER_STAGE_KEYS = Object.freeze({
  lead: 'lead',
  contacted: 'contacted',
  qualified: 'qualified',
  viewingScheduled: 'viewing_scheduled',
  viewingCompleted: 'viewing_completed',
  offerOnboardingLinkSent: 'offer_onboarding_link_sent',
  offerSubmitted: 'offer_submitted',
  agentReviewRequired: 'agent_review_required',
  readyToGenerateOtp: 'ready_to_generate_otp',
  otpGenerated: 'otp_generated',
  buyerSigned: 'buyer_signed',
  agentSigned: 'agent_signed',
  sentToSeller: 'sent_to_seller',
  signedByAllParties: 'signed_by_all_parties',
  transactionLive: 'transaction_live',
  lost: 'lost',
})

export const RESIDENTIAL_OFFER_STAGES = Object.freeze([
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.lead,
    label: 'Lead',
    phase: 'lead',
    description: 'Buyer lead exists but no viewing or offer path is active yet.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.contacted,
    label: 'Contacted',
    phase: 'lead',
    description: 'Buyer has been contacted or qualified before viewing.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.qualified,
    label: 'Qualified',
    phase: 'lead',
    description: 'Buyer is qualified enough to book a viewing or receive next steps.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    label: 'Viewing Scheduled',
    phase: 'viewing',
    description: 'A residential viewing has been booked.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
    label: 'Viewing Completed',
    phase: 'viewing',
    description: 'The buyer has completed the viewing and can receive an offer link.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    label: 'Offer + Onboarding Link Sent',
    phase: 'offer_capture',
    description: 'One link has been sent for buyer profile, finance readiness and residential offer terms.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    label: 'Offer Submitted',
    phase: 'offer_capture',
    description: 'Buyer submitted profile, finance and offer terms.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    label: 'Agent Review Required',
    phase: 'agent_review',
    description: 'Agent must review only buyer-supplied special/suspensive condition wording.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    label: 'Ready to Generate OTP',
    phase: 'otp_preparation',
    description: 'Buyer, seller/property, agent/org and approved condition data are ready for OTP generation.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
    label: 'OTP Generated',
    phase: 'otp_signing',
    description: 'The OTP has been generated and can be routed for buyer and agent signature.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned,
    label: 'Buyer Signed',
    phase: 'otp_signing',
    description: 'Buyer has signed the generated OTP, creating a formal offer.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
    label: 'Agent / Principal Signed',
    phase: 'otp_signing',
    description: 'Agent or principal has signed/accepted benefits as required by the agency process.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller,
    label: 'Sent to Seller',
    phase: 'seller_acceptance',
    description: 'Agent has manually sent the signed buyer/agent OTP to the seller.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
    label: 'Signed by All Parties',
    phase: 'seller_acceptance',
    description: 'Seller has accepted and all required parties have signed the OTP.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive,
    label: 'Transaction Live',
    phase: 'transaction',
    description: 'A signed all-party OTP exists and the lead may convert to a transaction.',
  }),
  Object.freeze({
    key: RESIDENTIAL_OFFER_STAGE_KEYS.lost,
    label: 'Lost',
    phase: 'closed',
    description: 'The lead or offer path is closed without a live transaction.',
  }),
])

export const RESIDENTIAL_OFFER_STAGE_TRANSITIONS = Object.freeze({
  [RESIDENTIAL_OFFER_STAGE_KEYS.lead]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.contacted,
    RESIDENTIAL_OFFER_STAGE_KEYS.qualified,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.contacted]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.qualified,
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.qualified]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
    RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
    RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned,
    RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
    RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
    RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties]: Object.freeze([
    RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive,
  ]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive]: Object.freeze([]),
  [RESIDENTIAL_OFFER_STAGE_KEYS.lost]: Object.freeze([]),
})

const STAGE_BY_KEY = new Map(RESIDENTIAL_OFFER_STAGES.map((stage) => [stage.key, stage]))

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value)
    .toLowerCase()
    .replace(/\+/g, ' and ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const STAGE_ALIASES = Object.freeze({
  '': RESIDENTIAL_OFFER_STAGE_KEYS.lead,
  lead: RESIDENTIAL_OFFER_STAGE_KEYS.lead,
  new_lead: RESIDENTIAL_OFFER_STAGE_KEYS.lead,
  contacted: RESIDENTIAL_OFFER_STAGE_KEYS.contacted,
  follow_up: RESIDENTIAL_OFFER_STAGE_KEYS.contacted,
  qualified: RESIDENTIAL_OFFER_STAGE_KEYS.qualified,
  appointment_scheduled: RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
  viewing_scheduled: RESIDENTIAL_OFFER_STAGE_KEYS.viewingScheduled,
  appointment_completed: RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
  viewing_completed: RESIDENTIAL_OFFER_STAGE_KEYS.viewingCompleted,
  offer_link_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  onboarding_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  buyer_onboarding_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  offer_onboarding_link_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  offer_and_onboarding_link_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  make_an_offer_link_sent: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  offer_draft: RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent,
  offer_submitted: RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
  buyer_offer_submitted: RESIDENTIAL_OFFER_STAGE_KEYS.offerSubmitted,
  agent_review: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
  agent_review_required: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
  agent_condition_review: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
  agent_conditions_review: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
  conditions_review_required: RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired,
  ready_to_generate_otp: RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
  otp_ready: RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
  ready_for_otp_generation: RESIDENTIAL_OFFER_STAGE_KEYS.readyToGenerateOtp,
  otp_generated: RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
  generated_otp: RESIDENTIAL_OFFER_STAGE_KEYS.otpGenerated,
  buyer_signed: RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned,
  purchaser_signed: RESIDENTIAL_OFFER_STAGE_KEYS.buyerSigned,
  agent_signed: RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
  principal_signed: RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
  agent_principal_signed: RESIDENTIAL_OFFER_STAGE_KEYS.agentSigned,
  sent_to_seller: RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller,
  seller_sent: RESIDENTIAL_OFFER_STAGE_KEYS.sentToSeller,
  seller_signed: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
  signed_by_all_parties: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
  all_parties_signed: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
  offer_accepted: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
  accepted: RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties,
  transaction_live: RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive,
  converted_to_transaction: RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive,
  deal_created: RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive,
  lost: RESIDENTIAL_OFFER_STAGE_KEYS.lost,
  archived: RESIDENTIAL_OFFER_STAGE_KEYS.lost,
})

export function normalizeResidentialOfferStageKey(value = '', fallback = RESIDENTIAL_OFFER_STAGE_KEYS.lead) {
  const normalized = key(value)
  if (STAGE_ALIASES[normalized]) return STAGE_ALIASES[normalized]
  if (STAGE_BY_KEY.has(normalized)) return normalized
  return fallback
}

export function getResidentialOfferStage(value = '', fallback = RESIDENTIAL_OFFER_STAGE_KEYS.lead) {
  const stageKey = normalizeResidentialOfferStageKey(value, fallback)
  return STAGE_BY_KEY.get(stageKey) || STAGE_BY_KEY.get(fallback) || STAGE_BY_KEY.get(RESIDENTIAL_OFFER_STAGE_KEYS.lead)
}

export function getResidentialOfferStageLabel(value = '') {
  return getResidentialOfferStage(value).label
}

export function getResidentialOfferAllowedNextStages(value = '') {
  const stageKey = normalizeResidentialOfferStageKey(value)
  return [...(RESIDENTIAL_OFFER_STAGE_TRANSITIONS[stageKey] || [])]
}

export function canTransitionResidentialOfferStage(fromStage = '', toStage = '') {
  const fromKey = normalizeResidentialOfferStageKey(fromStage)
  const toKey = normalizeResidentialOfferStageKey(toStage)
  return fromKey !== toKey && getResidentialOfferAllowedNextStages(fromKey).includes(toKey)
}

export function resolveOfferOnboardingLinkExperience() {
  return {
    label: 'Offer + Onboarding Link',
    buyerFacingTitle: 'Make an Offer',
    buyerFacingSubtitle: 'Complete your buyer profile, finance readiness and residential offer terms in one secure flow.',
    dataBuckets: ['buyer_onboarding', 'residential_offer_terms', 'condition_requests'],
  }
}
