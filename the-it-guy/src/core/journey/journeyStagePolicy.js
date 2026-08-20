export const JOURNEY_ENTITY_TYPES = Object.freeze({
  buyerLead: 'buyer_lead',
  sellerLead: 'seller_lead',
  developerLead: 'developer_lead',
  transaction: 'transaction',
})

export const JOURNEY_STAGE_POLICY_TYPES = Object.freeze({
  catchUp: 'catch_up',
  evidenceRequired: 'evidence_required',
  recordRequired: 'record_required',
  paymentReview: 'payment_review',
  system: 'system',
})

export const JOURNEY_STAGE_ACTIONS = Object.freeze({
  markComplete: 'mark_complete',
  jumpToStage: 'jump_to_stage',
  clearOverride: 'clear_override',
  markPaid: 'mark_paid',
  uploadEvidence: 'upload_evidence',
  createRecord: 'create_record',
  reviewPayment: 'review_payment',
  openStage: 'open_stage',
})

export const JOURNEY_NOTIFICATION_MODES = Object.freeze({
  internalOnly: 'internal_only',
  normal: 'normal',
})

const POLICY = JOURNEY_STAGE_POLICY_TYPES
const ACTION = JOURNEY_STAGE_ACTIONS

function policy({
  type,
  label,
  allowCatchUp = false,
  allowJumpTarget = false,
  requiresReason = false,
  notificationMode = JOURNEY_NOTIFICATION_MODES.normal,
  actions = [],
  hardGate = false,
  evidence = [],
  notes = '',
} = {}) {
  return Object.freeze({
    type,
    label,
    allowCatchUp,
    allowJumpTarget,
    requiresReason,
    notificationMode,
    actions: Object.freeze(actions),
    hardGate,
    evidence: Object.freeze(evidence),
    notes,
  })
}

const catchUpPolicy = (label, options = {}) => policy({
  type: POLICY.catchUp,
  label,
  allowCatchUp: true,
  allowJumpTarget: true,
  requiresReason: true,
  notificationMode: JOURNEY_NOTIFICATION_MODES.internalOnly,
  actions: [ACTION.markComplete, ACTION.jumpToStage, ACTION.clearOverride],
  ...options,
})

const evidencePolicy = (label, evidence = [], options = {}) => policy({
  type: POLICY.evidenceRequired,
  label,
  allowCatchUp: false,
  allowJumpTarget: true,
  hardGate: true,
  actions: [ACTION.uploadEvidence, ACTION.openStage],
  evidence,
  ...options,
})

const recordPolicy = (label, evidence = [], options = {}) => policy({
  type: POLICY.recordRequired,
  label,
  allowCatchUp: false,
  allowJumpTarget: true,
  hardGate: true,
  actions: [ACTION.createRecord, ACTION.openStage],
  evidence,
  ...options,
})

const paymentReviewPolicy = (label, options = {}) => policy({
  type: POLICY.paymentReview,
  label,
  allowCatchUp: false,
  allowJumpTarget: true,
  hardGate: true,
  actions: [ACTION.markPaid, ACTION.uploadEvidence, ACTION.reviewPayment, ACTION.openStage],
  evidence: ['payment_status', 'proof_of_payment', 'review_decision'],
  notes: 'Payment can be marked paid/uploaded, but verification must remain a review action.',
  ...options,
})

const systemPolicy = (label, options = {}) => policy({
  type: POLICY.system,
  label,
  allowCatchUp: false,
  allowJumpTarget: false,
  hardGate: false,
  actions: [ACTION.openStage],
  ...options,
})

export const JOURNEY_STAGE_POLICY_REGISTRY = Object.freeze({
  [JOURNEY_ENTITY_TYPES.buyerLead]: Object.freeze({
    captured: systemPolicy('Captured'),
    contacted: catchUpPolicy('Contacted'),
    qualification: catchUpPolicy('Qualification'),
    qualified: catchUpPolicy('Qualified'),
    viewing: catchUpPolicy('Viewing'),
    offer: evidencePolicy('Offer', ['signed_otp']),
    otp: evidencePolicy('OTP', ['signed_otp']),
    transactionSetup: evidencePolicy('Transaction Setup', ['buyer_profile', 'transaction_terms']),
    transaction_setup: evidencePolicy('Transaction Setup', ['buyer_profile', 'transaction_terms']),
    transaction: recordPolicy('Transaction', ['transaction_id']),
  }),
  [JOURNEY_ENTITY_TYPES.sellerLead]: Object.freeze({
    seller_lead: systemPolicy('Seller Lead'),
    captured: systemPolicy('Captured'),
    contacted: catchUpPolicy('Contacted'),
    first_contact: catchUpPolicy('First Contact'),
    valuation: catchUpPolicy('Valuation'),
    valuation_appointment_scheduled: catchUpPolicy('Schedule Valuation Appointment'),
    formal_valuation_completed: catchUpPolicy('Formal Valuation'),
    valuation_presentation_scheduled: catchUpPolicy('Valuation Presentation Scheduled'),
    valuation_presented: catchUpPolicy('Valuation Presented'),
    presentation: catchUpPolicy('Presentation'),
    mandate: evidencePolicy('Mandate', ['signed_mandate']),
    mandate_signed: evidencePolicy('Mandate Signed', ['signed_mandate']),
    seller_pack: evidencePolicy('Seller Pack', ['signed_seller_pack']),
    seller_pack_signed: evidencePolicy('Seller Pack', ['signed_seller_pack']),
    seller_documents: evidencePolicy('Seller Documents', ['seller_fica_documents']),
    documents: evidencePolicy('Documents', ['seller_fica_documents']),
    property_details: evidencePolicy('Property Details', ['property_record']),
    marketing_assets: evidencePolicy('Marketing Assets', ['listing_media']),
    attorney_selected: recordPolicy('Attorney Selected', ['attorney_assignment']),
    listing_ready: recordPolicy('Listing Ready', ['listing_id']),
    listing: recordPolicy('Listing', ['listing_id']),
  }),
  [JOURNEY_ENTITY_TYPES.developerLead]: Object.freeze({
    captured: systemPolicy('Captured'),
    contacted: catchUpPolicy('Contacted'),
    qualified: catchUpPolicy('Qualified'),
    qualification: catchUpPolicy('Qualification'),
    viewing: catchUpPolicy('Viewing'),
    onboarding_sent: evidencePolicy('Onboarding Sent', ['buyer_onboarding_link']),
    onboarding_submitted: evidencePolicy('Onboarding Submitted', ['buyer_onboarding_submission']),
    reservation: paymentReviewPolicy('Reservation Deposit'),
    reservation_deposit: paymentReviewPolicy('Reservation Deposit'),
    otp: evidencePolicy('OTP', ['signed_otp']),
    converted: recordPolicy('Converted', ['transaction_id']),
    transaction: recordPolicy('Transaction', ['transaction_id']),
  }),
  [JOURNEY_ENTITY_TYPES.transaction]: Object.freeze({
    confirmed: systemPolicy('Confirmed'),
    reservation_deposit_paid: paymentReviewPolicy('Reservation Deposit Paid'),
    otp: evidencePolicy('OTP', ['signed_otp']),
    finance: evidencePolicy('Finance', ['proof_of_funds_or_bond_grant']),
    transfer: recordPolicy('Transfer', ['attorney_instruction', 'transfer_lane_state']),
    registration: recordPolicy('Registration', ['registration_confirmation']),
  }),
})

export const JOURNEY_STAGE_ORDER = Object.freeze({
  [JOURNEY_ENTITY_TYPES.buyerLead]: Object.freeze([
    'captured',
    'contacted',
    'qualification',
    'viewing',
    'offer',
    'transactionSetup',
    'transaction',
  ]),
  [JOURNEY_ENTITY_TYPES.sellerLead]: Object.freeze([
    'captured',
    'first_contact',
    'valuation_appointment_scheduled',
    'formal_valuation_completed',
    'valuation_presentation_scheduled',
    'valuation_presented',
    'seller_pack_signed',
    'listing_ready',
  ]),
  [JOURNEY_ENTITY_TYPES.developerLead]: Object.freeze([
    'captured',
    'contacted',
    'qualified',
    'viewing',
    'onboarding_sent',
    'onboarding_submitted',
    'reservation',
    'otp',
    'converted',
  ]),
  [JOURNEY_ENTITY_TYPES.transaction]: Object.freeze([
    'confirmed',
    'reservation_deposit_paid',
    'otp',
    'finance',
    'transfer',
    'registration',
  ]),
})

function normalizeKey(value) {
  return String(value || '').trim()
}

export function normalizeJourneyEntityType(value) {
  const normalized = normalizeKey(value).toLowerCase()
  return Object.values(JOURNEY_ENTITY_TYPES).includes(normalized) ? normalized : ''
}

export function normalizeJourneyStageKey(value) {
  return normalizeKey(value)
}

export function getJourneyStagePolicy(entityType, stageKey) {
  const normalizedEntityType = normalizeJourneyEntityType(entityType)
  const normalizedStageKey = normalizeJourneyStageKey(stageKey)
  return JOURNEY_STAGE_POLICY_REGISTRY[normalizedEntityType]?.[normalizedStageKey] || null
}

export function isJourneyStageCatchUpAllowed(entityType, stageKey) {
  return getJourneyStagePolicy(entityType, stageKey)?.allowCatchUp === true
}

export function isJourneyStageHardGate(entityType, stageKey) {
  return getJourneyStagePolicy(entityType, stageKey)?.hardGate === true
}

export function getJourneyStageActions(entityType, stageKey) {
  return [...(getJourneyStagePolicy(entityType, stageKey)?.actions || [])]
}

export function getJourneyStageOrder(entityType, overrideOrder = null) {
  if (Array.isArray(overrideOrder) && overrideOrder.length) return overrideOrder.map(normalizeJourneyStageKey).filter(Boolean)
  return [...(JOURNEY_STAGE_ORDER[normalizeJourneyEntityType(entityType)] || [])]
}

export function resolveJourneyCatchUpPlan({
  entityType,
  targetStageKey,
  stageOrder = null,
} = {}) {
  const order = getJourneyStageOrder(entityType, stageOrder)
  const targetKey = normalizeJourneyStageKey(targetStageKey)
  const targetIndex = order.indexOf(targetKey)
  if (targetIndex < 0) {
    return {
      targetStageKey: targetKey,
      catchUpStageKeys: [],
      blockedStageKey: null,
      blockedPolicy: null,
      canJump: false,
    }
  }

  const catchUpStageKeys = []
  for (const stageKey of order.slice(0, targetIndex)) {
    const stagePolicy = getJourneyStagePolicy(entityType, stageKey)
    if (stagePolicy?.type === POLICY.system) {
      continue
    }
    if (!stagePolicy?.allowCatchUp) {
      return {
        targetStageKey: targetKey,
        catchUpStageKeys,
        blockedStageKey: stageKey,
        blockedPolicy: stagePolicy,
        canJump: false,
      }
    }
    catchUpStageKeys.push(stageKey)
  }

  const targetPolicy = getJourneyStagePolicy(entityType, targetKey)
  return {
    targetStageKey: targetKey,
    catchUpStageKeys,
    blockedStageKey: null,
    blockedPolicy: null,
    canJump: Boolean(targetPolicy?.allowJumpTarget),
    targetPolicy,
  }
}

export function validateJourneyCatchUpAction({
  entityType,
  stageKey,
  actionType = JOURNEY_STAGE_ACTIONS.markComplete,
  reason = '',
} = {}) {
  const stagePolicy = getJourneyStagePolicy(entityType, stageKey)
  if (!stagePolicy) {
    return { valid: false, code: 'unknown_stage', message: 'Journey stage policy was not found.' }
  }
  if (!stagePolicy.actions.includes(actionType)) {
    return { valid: false, code: 'action_not_allowed', message: 'This action is not allowed for the selected journey stage.' }
  }
  if (actionType === JOURNEY_STAGE_ACTIONS.markComplete && !stagePolicy.allowCatchUp) {
    return { valid: false, code: 'catch_up_not_allowed', message: 'This stage requires real evidence or a real record before it can be completed.' }
  }
  if (stagePolicy.requiresReason && !normalizeKey(reason)) {
    return { valid: false, code: 'reason_required', message: 'A reason is required for catch-up completion.' }
  }
  return { valid: true, code: 'ok', message: 'Action is allowed.' }
}
