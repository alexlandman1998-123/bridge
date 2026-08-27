import {
  DEFAULT_BUYER_PROCESS_PROFILE,
  KINGSTONS_BUYER_PROCESS_PROFILE,
  resolveBuyerProcessProfile,
  resolveBuyerProcessProfileForOrganisation,
} from './buyerProcessProfileService.js'

export const BUYER_PROCESS_STAGE_KEYS = Object.freeze({
  captured: 'captured',
  contacted: 'contacted',
  qualified: 'qualified',
  qualification: 'qualified',
  viewing: 'viewing',
  transactionSetup: 'transaction_setup',
  // Compatibility-only key. Historical residential offer states now resolve
  // into Transaction Setup; Arch9 does not run an internal offer workflow.
  offer: 'offer',
  buyerOnboardingSent: 'transaction_setup',
  offerReceived: 'transaction_setup',
  legacyBuyerOnboardingSent: 'buyer_onboarding_sent',
  legacyOfferReceived: 'offer_received',
  transaction: 'transaction',
  onHold: 'on_hold',
  lost: 'lost',
  closedWon: 'closed_won',
  closedLost: 'closed_lost',
})

export const BUYER_PROCESS_ACTION_KEYS = Object.freeze({
  logContact: 'log_contact',
  qualify: 'qualify',
  scheduleViewing: 'schedule_viewing',
  recordViewingOutcome: 'record_viewing_outcome',
  sendBuyerOnboardingLink: 'send_buyer_onboarding_link',
  uploadOfferDocument: 'upload_offer_document',
  createTransaction: 'create_transaction',
  followUp: 'follow_up',
  markLost: 'mark_lost',
  placeOnHold: 'place_on_hold',
  closeWon: 'close_won',
  closeLost: 'close_lost',
})

const DEFAULT_ACTIVE_STAGE_KEYS = Object.freeze([
  BUYER_PROCESS_STAGE_KEYS.captured,
  BUYER_PROCESS_STAGE_KEYS.contacted,
  BUYER_PROCESS_STAGE_KEYS.qualified,
  BUYER_PROCESS_STAGE_KEYS.viewing,
  BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  BUYER_PROCESS_STAGE_KEYS.transaction,
])

const KINGSTONS_ACTIVE_STAGE_KEYS = Object.freeze([
  BUYER_PROCESS_STAGE_KEYS.captured,
  BUYER_PROCESS_STAGE_KEYS.contacted,
  BUYER_PROCESS_STAGE_KEYS.qualified,
  BUYER_PROCESS_STAGE_KEYS.viewing,
  BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  BUYER_PROCESS_STAGE_KEYS.transaction,
])

const OUTCOME_STAGE_KEYS = Object.freeze([
  BUYER_PROCESS_STAGE_KEYS.onHold,
  BUYER_PROCESS_STAGE_KEYS.lost,
  BUYER_PROCESS_STAGE_KEYS.closedWon,
  BUYER_PROCESS_STAGE_KEYS.closedLost,
])

const UNIVERSAL_ACTIVE_ACTIONS = Object.freeze([
  BUYER_PROCESS_ACTION_KEYS.followUp,
  BUYER_PROCESS_ACTION_KEYS.markLost,
  BUYER_PROCESS_ACTION_KEYS.placeOnHold,
])

const BUYER_PROCESS_STAGES = Object.freeze([
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.captured,
    label: 'Captured',
    phase: 'capture',
    description: 'Buyer lead has been captured and is ready for first contact.',
    requiredEvidenceKeys: Object.freeze(['buyer_lead_captured']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.logContact,
      BUYER_PROCESS_ACTION_KEYS.qualify,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.contacted,
    label: 'Contacted',
    phase: 'contact',
    description: 'Buyer has been contacted and is ready for qualification capture.',
    requiredEvidenceKeys: Object.freeze(['buyer_contact_logged']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.qualify,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.qualified,
    label: 'Qualified',
    phase: 'qualified',
    description: 'Buyer intent, budget, timing, area, and finance readiness have been confirmed.',
    requiredEvidenceKeys: Object.freeze(['buyer_qualified']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.scheduleViewing,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.viewing,
    label: 'Viewing',
    phase: 'viewing',
    description: 'Buyer has a viewing path in progress or a completed viewing awaiting outcome capture.',
    requiredEvidenceKeys: Object.freeze(['viewing_recorded']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.recordViewingOutcome,
      BUYER_PROCESS_ACTION_KEYS.sendBuyerOnboardingLink,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
    label: 'Transaction Setup',
    phase: 'transaction_setup',
    description: 'Buyer profile, finance route, roleplayers, and portal handoff are being captured before formal transaction progression.',
    requiredEvidenceKeys: Object.freeze(['buyer_profile_captured']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.sendBuyerOnboardingLink,
      BUYER_PROCESS_ACTION_KEYS.uploadOfferDocument,
      BUYER_PROCESS_ACTION_KEYS.createTransaction,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.transaction,
    label: 'Transaction',
    phase: 'transaction',
    description: 'The OTP has opened a transaction workflow.',
    requiredEvidenceKeys: Object.freeze(['otp_document_uploaded', 'transaction_created']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.closeWon,
      BUYER_PROCESS_ACTION_KEYS.closeLost,
      ...UNIVERSAL_ACTIVE_ACTIONS,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.onHold,
    label: 'On hold',
    phase: 'paused',
    description: 'Buyer is paused but not lost.',
    requiredEvidenceKeys: Object.freeze(['hold_reason_captured']),
    allowedActionKeys: Object.freeze([
      BUYER_PROCESS_ACTION_KEYS.followUp,
      BUYER_PROCESS_ACTION_KEYS.markLost,
    ]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.lost,
    label: 'Lost',
    phase: 'closed',
    description: 'Buyer is no longer active in the lead funnel.',
    requiredEvidenceKeys: Object.freeze(['lost_reason_captured']),
    allowedActionKeys: Object.freeze([]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.closedWon,
    label: 'Closed won',
    phase: 'closed',
    description: 'Buyer transaction completed successfully.',
    requiredEvidenceKeys: Object.freeze(['transaction_closed_won']),
    allowedActionKeys: Object.freeze([]),
  }),
  Object.freeze({
    key: BUYER_PROCESS_STAGE_KEYS.closedLost,
    label: 'Closed lost',
    phase: 'closed',
    description: 'Buyer transaction failed after the transaction workflow started.',
    requiredEvidenceKeys: Object.freeze(['transaction_closed_lost']),
    allowedActionKeys: Object.freeze([]),
  }),
])

const DEFAULT_BUYER_STAGE_TRANSITIONS = Object.freeze({
  [BUYER_PROCESS_STAGE_KEYS.captured]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.contacted,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.contacted]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.qualified,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.qualified]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.viewing,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.viewing]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.transactionSetup,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.transactionSetup]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.transaction,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.transaction]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.closedWon,
    BUYER_PROCESS_STAGE_KEYS.closedLost,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.onHold]: Object.freeze([
    BUYER_PROCESS_STAGE_KEYS.captured,
    BUYER_PROCESS_STAGE_KEYS.contacted,
    BUYER_PROCESS_STAGE_KEYS.qualified,
    BUYER_PROCESS_STAGE_KEYS.viewing,
    BUYER_PROCESS_STAGE_KEYS.transactionSetup,
    BUYER_PROCESS_STAGE_KEYS.transaction,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ]),
  [BUYER_PROCESS_STAGE_KEYS.lost]: Object.freeze([]),
  [BUYER_PROCESS_STAGE_KEYS.closedWon]: Object.freeze([]),
  [BUYER_PROCESS_STAGE_KEYS.closedLost]: Object.freeze([]),
})

const KINGSTONS_BUYER_STAGE_TRANSITIONS = DEFAULT_BUYER_STAGE_TRANSITIONS

const BUYER_PROCESS_EVIDENCE_GATES = Object.freeze([
  Object.freeze({
    key: 'buyer_lead_captured',
    source: 'lead',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.captured,
  }),
  Object.freeze({
    key: 'buyer_contact_logged',
    source: 'activity',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.contacted,
  }),
  Object.freeze({
    key: 'buyer_qualified',
    source: 'qualification',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.qualified,
  }),
  Object.freeze({
    key: 'viewing_recorded',
    source: 'appointment',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.viewing,
    appointmentType: 'viewing',
    acceptedStatuses: Object.freeze(['scheduled', 'confirmed', 'awaiting_confirmation', 'completed']),
  }),
  Object.freeze({
    key: 'buyer_onboarding_link_sent',
    source: 'notification',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
    communicationType: 'client_onboarding',
    recipientRole: 'buyer',
    acceptedStatuses: Object.freeze(['prepared', 'queued', 'sent', 'delivered', 'handoff_required']),
  }),
  Object.freeze({
    key: 'buyer_profile_captured',
    source: 'buyer_profile',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  }),
  Object.freeze({
    key: 'otp_document_uploaded',
    source: 'document',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.transaction,
    documentTypes: Object.freeze(['uploaded_otp', 'buyer_otp', 'signed_otp', 'otp', 'buyer_offer', 'offer_document', 'offer_to_purchase', 'uploaded_offer', 'signed_offer']),
    acceptedStatuses: Object.freeze(['uploaded', 'under_review', 'approved', 'accepted', 'completed']),
  }),
  Object.freeze({
    key: 'transaction_created',
    source: 'transaction',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.transaction,
  }),
  Object.freeze({
    key: 'hold_reason_captured',
    source: 'activity',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.onHold,
  }),
  Object.freeze({
    key: 'lost_reason_captured',
    source: 'activity',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.lost,
  }),
  Object.freeze({
    key: 'transaction_closed_won',
    source: 'transaction',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.closedWon,
    acceptedStatuses: Object.freeze(['registered', 'closed_won', 'completed']),
  }),
  Object.freeze({
    key: 'transaction_closed_lost',
    source: 'transaction',
    requiredForStage: BUYER_PROCESS_STAGE_KEYS.closedLost,
    acceptedStatuses: Object.freeze(['cancelled', 'fallen_through', 'closed_lost']),
  }),
])

const BUYER_PROCESS_ACTIONS = Object.freeze([
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.logContact,
    label: 'Log contact',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.contacted,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.qualify,
    label: 'Qualify buyer',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.qualified,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.scheduleViewing,
    label: 'Schedule viewing',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.viewing,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.recordViewingOutcome,
    label: 'Record viewing outcome',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.viewing,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.sendBuyerOnboardingLink,
    label: 'Send buyer onboarding link',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.buyerOnboardingSent,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.uploadOfferDocument,
    label: 'Upload signed OTP',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.createTransaction,
    label: 'Create transaction',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.transaction,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.followUp,
    label: 'Follow up',
    outcomeStageKey: '',
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.markLost,
    label: 'Mark as lost',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.lost,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.placeOnHold,
    label: 'Place on hold',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.onHold,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.closeWon,
    label: 'Close won',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.closedWon,
  }),
  Object.freeze({
    key: BUYER_PROCESS_ACTION_KEYS.closeLost,
    label: 'Close lost',
    outcomeStageKey: BUYER_PROCESS_STAGE_KEYS.closedLost,
  }),
])

const DEFAULT_BUYER_PROCESS_DEFINITION = Object.freeze({
  profile: DEFAULT_BUYER_PROCESS_PROFILE,
  label: 'Default Residential Buyer Process',
  runtimeEnabled: false,
  phase: 'phase1_definition_only',
  stages: [
    ...DEFAULT_ACTIVE_STAGE_KEYS,
    ...OUTCOME_STAGE_KEYS,
  ].map((stageKey) => BUYER_PROCESS_STAGES.find((stage) => stage.key === stageKey)).filter(Boolean),
  activeStageKeys: DEFAULT_ACTIVE_STAGE_KEYS,
  outcomeStageKeys: OUTCOME_STAGE_KEYS,
  transitions: DEFAULT_BUYER_STAGE_TRANSITIONS,
  evidenceGates: BUYER_PROCESS_EVIDENCE_GATES,
  actions: BUYER_PROCESS_ACTIONS,
})

const KINGSTONS_BUYER_PROCESS_DEFINITION = Object.freeze({
  ...DEFAULT_BUYER_PROCESS_DEFINITION,
  profile: KINGSTONS_BUYER_PROCESS_PROFILE,
  label: 'Kingstons Residential Buyer Process',
  stages: [
    ...KINGSTONS_ACTIVE_STAGE_KEYS,
    ...OUTCOME_STAGE_KEYS,
  ].map((stageKey) => BUYER_PROCESS_STAGES.find((stage) => stage.key === stageKey)).filter(Boolean),
  activeStageKeys: KINGSTONS_ACTIVE_STAGE_KEYS,
  transitions: KINGSTONS_BUYER_STAGE_TRANSITIONS,
})

const BUYER_PROCESS_DEFINITIONS = Object.freeze({
  [DEFAULT_BUYER_PROCESS_PROFILE]: DEFAULT_BUYER_PROCESS_DEFINITION,
  [KINGSTONS_BUYER_PROCESS_PROFILE]: KINGSTONS_BUYER_PROCESS_DEFINITION,
})

const STAGE_BY_KEY = new Map(BUYER_PROCESS_STAGES.map((stage) => [stage.key, stage]))

function cloneDefinition(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\+/g, ' and ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const BUYER_STAGE_ALIASES = Object.freeze({
  '': BUYER_PROCESS_STAGE_KEYS.captured,
  lead: BUYER_PROCESS_STAGE_KEYS.captured,
  new_lead: BUYER_PROCESS_STAGE_KEYS.captured,
  captured: BUYER_PROCESS_STAGE_KEYS.captured,
  contact: BUYER_PROCESS_STAGE_KEYS.contacted,
  contacted: BUYER_PROCESS_STAGE_KEYS.contacted,
  first_contact: BUYER_PROCESS_STAGE_KEYS.contacted,
  first_contacted: BUYER_PROCESS_STAGE_KEYS.contacted,
  buyer_contacted: BUYER_PROCESS_STAGE_KEYS.contacted,
  follow_up: BUYER_PROCESS_STAGE_KEYS.contacted,
  qualified: BUYER_PROCESS_STAGE_KEYS.qualified,
  qualification: BUYER_PROCESS_STAGE_KEYS.qualified,
  qualifying: BUYER_PROCESS_STAGE_KEYS.qualified,
  viewing: BUYER_PROCESS_STAGE_KEYS.viewing,
  viewing_scheduled: BUYER_PROCESS_STAGE_KEYS.viewing,
  appointment_scheduled: BUYER_PROCESS_STAGE_KEYS.viewing,
  viewing_completed: BUYER_PROCESS_STAGE_KEYS.viewing,
  appointment_completed: BUYER_PROCESS_STAGE_KEYS.viewing,
  buyer_onboarding_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  onboarding_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_link_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_onboarding_link_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_and_onboarding_link_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  make_an_offer_link_sent: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  onboarding: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  buyer_onboarding: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  transaction_setup: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  setup: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  buyer_profile: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  buyer_profile_captured: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_received: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  otp_transaction: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  uploaded_otp: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  otp_uploaded: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  signed_otp_uploaded: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  signed_otp_received: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_submitted: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  buyer_offer_submitted: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_draft: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  negotiating: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  agent_review: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  agent_review_required: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  agent_condition_review: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  ready_to_generate_otp: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  otp_ready: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  ready_for_otp_generation: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  otp_generated: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  generated_otp: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  buyer_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  purchaser_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  agent_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  principal_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  sent_to_seller: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  seller_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  signed_by_all_parties: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  all_parties_signed: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  offer_accepted: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  accepted: BUYER_PROCESS_STAGE_KEYS.transactionSetup,
  transaction: BUYER_PROCESS_STAGE_KEYS.transaction,
  transaction_live: BUYER_PROCESS_STAGE_KEYS.transaction,
  converted_to_transaction: BUYER_PROCESS_STAGE_KEYS.transaction,
  deal_created: BUYER_PROCESS_STAGE_KEYS.transaction,
  finance: BUYER_PROCESS_STAGE_KEYS.transaction,
  transfer: BUYER_PROCESS_STAGE_KEYS.transaction,
  registered: BUYER_PROCESS_STAGE_KEYS.transaction,
  on_hold: BUYER_PROCESS_STAGE_KEYS.onHold,
  paused: BUYER_PROCESS_STAGE_KEYS.onHold,
  lost: BUYER_PROCESS_STAGE_KEYS.lost,
  archived: BUYER_PROCESS_STAGE_KEYS.lost,
  closed_won: BUYER_PROCESS_STAGE_KEYS.closedWon,
  won: BUYER_PROCESS_STAGE_KEYS.closedWon,
  closed_lost: BUYER_PROCESS_STAGE_KEYS.closedLost,
  fallen_through: BUYER_PROCESS_STAGE_KEYS.closedLost,
})

export function normalizeBuyerProcessStageKey(value = '', fallback = BUYER_PROCESS_STAGE_KEYS.captured) {
  const normalized = normalizeKey(value)
  if (BUYER_STAGE_ALIASES[normalized]) return BUYER_STAGE_ALIASES[normalized]
  if (STAGE_BY_KEY.has(normalized)) return normalized
  return fallback
}

export function getBuyerProcessStage(value = '', fallback = BUYER_PROCESS_STAGE_KEYS.captured) {
  const stageKey = normalizeBuyerProcessStageKey(value, fallback)
  return STAGE_BY_KEY.get(stageKey) || STAGE_BY_KEY.get(fallback) || STAGE_BY_KEY.get(BUYER_PROCESS_STAGE_KEYS.captured)
}

export function getBuyerProcessStageLabel(value = '') {
  return getBuyerProcessStage(value).label
}

export function getBuyerProcessDefinitionByProfile(profile = DEFAULT_BUYER_PROCESS_PROFILE) {
  const resolution = resolveBuyerProcessProfile({ buyerProcessProfile: profile })
  const definition = BUYER_PROCESS_DEFINITIONS[resolution.profile] || DEFAULT_BUYER_PROCESS_DEFINITION
  return Object.freeze({
    ...cloneDefinition(definition),
    resolution,
  })
}

export function getBuyerProcessDefinition(source = {}) {
  const resolution = resolveBuyerProcessProfileForOrganisation(source)
  const definition = BUYER_PROCESS_DEFINITIONS[resolution.profile] || DEFAULT_BUYER_PROCESS_DEFINITION
  return Object.freeze({
    ...cloneDefinition(definition),
    resolution,
  })
}

export function listBuyerProcessDefinitions() {
  return Object.freeze(Object.values(BUYER_PROCESS_DEFINITIONS).map(cloneDefinition))
}

export function getBuyerProcessStageKeys(source = {}) {
  return getBuyerProcessDefinition(source).stages.map((stage) => stage.key)
}

export function getBuyerProcessActiveStageKeys(source = {}) {
  return [...(getBuyerProcessDefinition(source).activeStageKeys || [])]
}

export function getBuyerProcessOutcomeStageKeys(source = {}) {
  return [...(getBuyerProcessDefinition(source).outcomeStageKeys || [])]
}

export function getBuyerProcessEvidenceKeys(source = {}) {
  return getBuyerProcessDefinition(source).evidenceGates.map((gate) => gate.key)
}

export function getBuyerProcessAllowedNextStageKeys(value = '', source = {}) {
  const definition = getBuyerProcessDefinition(source)
  const stageKey = normalizeBuyerProcessStageKey(value)
  return [...(definition.transitions?.[stageKey] || [])]
}

export function canTransitionBuyerProcessStage(fromStage = '', toStage = '', source = {}) {
  const fromKey = normalizeBuyerProcessStageKey(fromStage)
  const toKey = normalizeBuyerProcessStageKey(toStage)
  return fromKey !== toKey && getBuyerProcessAllowedNextStageKeys(fromKey, source).includes(toKey)
}
