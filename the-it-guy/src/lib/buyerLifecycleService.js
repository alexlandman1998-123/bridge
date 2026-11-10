// Keep the public API stable while loading network workflows on demand.
export {
  BUYER_LEAD_STAGES,
  CLIENT_INTAKE_PREFERENCE,
  SELLER_REVIEW_DELIVERY_MODE,
  OFFER_STATUS,
  OFFER_STATUSES,
  BUYER_LIFECYCLE_EVENTS,
  isOfferPastExpiry,
  getOfferLifecycleSummary,
  buildAcceptedOfferOnboardingPrefill,
  normalizeBuyerStage,
  normalizeOfferStatus,
  normalizeClientIntakePreference,
  getClientIntakePreferenceLabel,
  buildClientIntakePreferenceFacts,
  normalizeSellerReviewDeliveryMode,
  getSellerOfferReviewDeliveryModeLabel,
  buildSellerOfferReviewPreparation,
  isBuyerLifecycleAppointment,
  isBuyerLeadCategory,
  buildAcceptedOfferConversionCandidate,
} from './buyerLifecycleModel.js'

export async function recordBuyerLeadActivity({
  organisationId = '',
  leadId = '',
  activityType = 'Note',
  activityNote = '',
  outcome = '',
  activityDate = '',
  actor = null,
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.recordBuyerLeadActivity({ organisationId: organisationId, leadId: leadId, activityType: activityType, activityNote: activityNote, outcome: outcome, activityDate: activityDate, actor: actor })
}

export async function updateBuyerLeadStage({
  organisationId = '',
  leadId = '',
  stage = '',
  actor = null,
  activityType = 'Stage Change',
  activityNote = '',
  outcome = '',
  extra = {},
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.updateBuyerLeadStage({ organisationId: organisationId, leadId: leadId, stage: stage, actor: actor, activityType: activityType, activityNote: activityNote, outcome: outcome, extra: extra })
}

export async function applyBuyerLifecycleEvent({
  organisationId = '',
  leadId = '',
  event = '',
  actor = null,
  activityNote = '',
  offerId = '',
  transactionId = '',
  extra = {},
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.applyBuyerLifecycleEvent({ organisationId: organisationId, leadId: leadId, event: event, actor: actor, activityNote: activityNote, offerId: offerId, transactionId: transactionId, extra: extra })
}

export async function getCanonicalOfferInviteContext(token = '') {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.getCanonicalOfferInviteContext(token)
}

export async function submitCanonicalBuyerOnboarding({ token = '', submission = {} } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.submitCanonicalBuyerOnboarding({ token: token, submission: submission })
}

export async function submitCanonicalBuyerOffer({ token = '', submission = {} } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.submitCanonicalBuyerOffer({ token: token, submission: submission })
}

export async function createCanonicalOffer(payload = {}, { actor = null, waitForLifecycle = true } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.createCanonicalOffer(payload, { actor: actor, waitForLifecycle: waitForLifecycle })
}

export async function ensureAcceptedOfferConversionCandidate({ organisationId = '', offerId = '', offer = null } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.ensureAcceptedOfferConversionCandidate({ organisationId: organisationId, offerId: offerId, offer: offer })
}

export async function updateCanonicalOfferStatus(offerId, status, { organisationId = '', actor = null, patch = {} } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.updateCanonicalOfferStatus(offerId, status, { organisationId: organisationId, actor: actor, patch: patch })
}

export async function reviewCanonicalOfferConditions({
  offerId = '',
  organisationId = '',
  decision = 'approve',
  revisedConditions = {},
  note = '',
  actor = null,
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.reviewCanonicalOfferConditions({ offerId: offerId, organisationId: organisationId, decision: decision, revisedConditions: revisedConditions, note: note, actor: actor })
}

export async function createOfferSellerReviewSession(payload = {}, { actor = null } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.createOfferSellerReviewSession(payload, { actor: actor })
}

export async function getSellerOfferReviewContext(token = '') {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.getSellerOfferReviewContext(token)
}

export async function submitSellerOfferDecision({ token = '', decision = '', notes = '', counterTerms = null } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.submitSellerOfferDecision({ token: token, decision: decision, notes: notes, counterTerms: counterTerms })
}

export async function listCanonicalOffersForLead({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
  listingIds = [],
  buyerEmail = '',
  buyerPhone = '',
  buyerName = '',
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.listCanonicalOffersForLead({ organisationId: organisationId, leadId: leadId, contactId: contactId, appointmentIds: appointmentIds, listingIds: listingIds, buyerEmail: buyerEmail, buyerPhone: buyerPhone, buyerName: buyerName })
}

export async function getBuyerLeadLifecycleDiagnostic({
  organisationId = '',
  leadId = '',
  offerId = '',
  transactionId = '',
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.getBuyerLeadLifecycleDiagnostic({ organisationId: organisationId, leadId: leadId, offerId: offerId, transactionId: transactionId })
}

export async function listCanonicalOffersForListing({ organisationId = '', listingId = '' } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.listCanonicalOffersForListing({ organisationId: organisationId, listingId: listingId })
}

export async function listAppointmentViewedListings({
  organisationId = '',
  appointmentId = '',
  leadId = '',
  listingId = '',
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.listAppointmentViewedListings({ organisationId: organisationId, appointmentId: appointmentId, leadId: leadId, listingId: listingId })
}

export async function upsertAppointmentViewedListings({
  organisationId = '',
  appointmentId = '',
  leadId = '',
  agentId = '',
  viewedListings = [],
  replaceExisting = false,
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.upsertAppointmentViewedListings({ organisationId: organisationId, appointmentId: appointmentId, leadId: leadId, agentId: agentId, viewedListings: viewedListings, replaceExisting: replaceExisting })
}

export async function createOfferPortalSession(payload = {}, { actor = null } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.createOfferPortalSession(payload, { actor: actor })
}

export async function listOfferPortalSessions({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.listOfferPortalSessions({ organisationId: organisationId, leadId: leadId, contactId: contactId, appointmentIds: appointmentIds })
}

export async function getOfferPortalSessionContext(token = '') {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.getOfferPortalSessionContext(token)
}

export async function submitOfferPortalOffer({ token = '', listingId = '', submission = {} } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.submitOfferPortalOffer({ token: token, listingId: listingId, submission: submission })
}

export async function createTransactionFromAcceptedCanonicalOffer({
  organisationId = '',
  offerId = '',
  offer = null,
  lead = null,
  listing = null,
  actor = null,
  payload = {},
} = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.createTransactionFromAcceptedCanonicalOffer({ organisationId: organisationId, offerId: offerId, offer: offer, lead: lead, listing: listing, actor: actor, payload: payload })
}

export async function upsertAcceptedOfferOnboardingPrefill({ transactionId = '', offer = null, payload = {} } = {}) {
  const workflow = await import('./buyerLifecycleWorkflow.js')
  return workflow.upsertAcceptedOfferOnboardingPrefill({ transactionId: transactionId, offer: offer, payload: payload })
}
