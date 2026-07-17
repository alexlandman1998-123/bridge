export const SELLER_TRANSFER_ATTORNEY_DECISION_VERSION = 1

export const SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES = Object.freeze({
  pending: 'pending',
  recommended: 'recommended',
  none: 'none',
})

export const SELLER_TRANSFER_ATTORNEY_DECISIONS = Object.freeze({
  pending: 'pending',
  acceptRecommendation: 'accept_recommendation',
  nominateOwn: 'nominate_own',
  defer: 'defer',
})

export const SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES = Object.freeze({
  agencyRecommendation: 'agency_recommended',
  sellerAcceptedRecommendation: 'seller_accepted_recommendation',
  sellerNominated: 'seller_nominated',
  sellerDeferred: 'seller_deferred',
  agentAssistedSellerSelection: 'agent_assisted_seller_selection',
})

export const SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS = Object.freeze({
  readyForMandate: 'ready_for_mandate',
  verifyNomination: 'verify_nomination',
  contactSeller: 'contact_seller',
  resolveSelection: 'resolve_selection',
})

export const SELLER_TRANSFER_ATTORNEY_DECISION_OPTIONS = Object.freeze([
  Object.freeze({
    value: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    label: 'Use the recommended attorney',
    selectionSource: SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerAcceptedRecommendation,
  }),
  Object.freeze({
    value: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
    label: 'Nominate another attorney',
    selectionSource: SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerNominated,
  }),
  Object.freeze({
    value: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
    label: 'Decide later',
    selectionSource: SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerDeferred,
  }),
])

const VALID_DECISIONS = new Set(Object.values(SELLER_TRANSFER_ATTORNEY_DECISIONS))
const VALID_SELECTION_SOURCES = new Set(Object.values(SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES))
const VALID_RECOMMENDATION_STATUSES = new Set(Object.values(SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES))

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeNullableText(value) {
  return normalizeText(value) || null
}

function normalizeIsoTimestamp(value) {
  const text = normalizeText(value)
  if (!text) return null
  const timestamp = new Date(text)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export function normalizeSellerTransferAttorneyIdentity(attorney = null) {
  const source = attorney && typeof attorney === 'object' && !Array.isArray(attorney) ? attorney : {}
  return {
    preferredPartnerId: normalizeNullableText(source.preferredPartnerId || source.preferred_partner_id || source.id),
    partnerOrganisationId: normalizeNullableText(source.partnerOrganisationId || source.partner_organisation_id || source.organisationId),
    companyName: normalizeText(source.companyName || source.company_name || source.partnerName || source.name),
    contactPerson: normalizeText(source.contactPerson || source.contact_person),
    email: normalizeEmail(source.email || source.emailAddress || source.email_address),
    phone: normalizeText(source.phone || source.phoneNumber || source.phone_number),
  }
}

export function hasSellerTransferAttorneyIdentity(attorney = null) {
  const normalized = normalizeSellerTransferAttorneyIdentity(attorney)
  return Boolean(normalized.companyName || normalized.email)
}

function normalizeActor(actor = null) {
  const source = actor && typeof actor === 'object' && !Array.isArray(actor) ? actor : {}
  return {
    userId: normalizeNullableText(source.userId || source.user_id || source.id),
    name: normalizeText(source.name || source.fullName || source.full_name),
    email: normalizeEmail(source.email),
  }
}

export function getSellerTransferAttorneySelectionSource(decision, { agentAssisted = false } = {}) {
  const normalizedDecision = normalizeText(decision).toLowerCase()
  if (agentAssisted && [
    SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  ].includes(normalizedDecision)) {
    return SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.agentAssistedSellerSelection
  }
  if (normalizedDecision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation) {
    return SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerAcceptedRecommendation
  }
  if (normalizedDecision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn) {
    return SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerNominated
  }
  if (normalizedDecision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer) {
    return SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerDeferred
  }
  return SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.agencyRecommendation
}

export function normalizeSellerTransferAttorneyDecision(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const requestedDecision = normalizeText(source.decision || source.sellerDecision || source.seller_decision).toLowerCase()
  const decision = VALID_DECISIONS.has(requestedDecision)
    ? requestedDecision
    : SELLER_TRANSFER_ATTORNEY_DECISIONS.pending
  const recommendedAttorney = normalizeSellerTransferAttorneyIdentity(
    source.recommendedAttorney || source.recommended_attorney,
  )
  const nominatedAttorney = normalizeSellerTransferAttorneyIdentity(
    source.selectedAttorney || source.selected_attorney || source.nominatedAttorney || source.nominated_attorney,
  )
  const selectedAttorney = decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation
    ? { ...recommendedAttorney }
    : decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn
      ? nominatedAttorney
      : normalizeSellerTransferAttorneyIdentity()
  const agentAssisted = Boolean(source.agentAssisted || source.agent_assisted)
  const derivedSelectionSource = getSellerTransferAttorneySelectionSource(decision, { agentAssisted })
  const requestedSelectionSource = normalizeText(source.selectionSource || source.selection_source)
  const selectionSource = VALID_SELECTION_SOURCES.has(requestedSelectionSource)
    ? requestedSelectionSource
    : derivedSelectionSource
  const decidedAt = normalizeIsoTimestamp(source.decidedAt || source.decided_at || source.consentTimestamp || source.consent_timestamp)
  const requestedRecommendationStatus = normalizeText(source.recommendationStatus || source.recommendation_status).toLowerCase()
  const recommendationStatus = VALID_RECOMMENDATION_STATUSES.has(requestedRecommendationStatus)
    ? requestedRecommendationStatus
    : hasSellerTransferAttorneyIdentity(recommendedAttorney)
      ? SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended
      : SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.pending

  return {
    version: SELLER_TRANSFER_ATTORNEY_DECISION_VERSION,
    decision,
    selectionSource,
    recommendationStatus,
    recommendedAttorney,
    selectedAttorney,
    recommendedBy: normalizeActor(source.recommendedBy || source.recommended_by),
    recommendedAt: normalizeIsoTimestamp(source.recommendedAt || source.recommended_at),
    decidedBy: normalizeActor(source.decidedBy || source.decided_by),
    decidedAt,
    consentCaptured: Boolean(source.consentCaptured ?? source.consent_captured),
    agentAssisted,
    notes: normalizeText(source.notes),
  }
}

export function validateSellerTransferAttorneyDecision(input = {}, { requireDecision = false } = {}) {
  const decision = normalizeSellerTransferAttorneyDecision(input)
  const errors = []
  const expectedSelectionSource = getSellerTransferAttorneySelectionSource(decision.decision, {
    agentAssisted: decision.agentAssisted,
  })

  if (requireDecision && decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.pending) {
    errors.push('The seller must accept the recommendation, nominate another attorney, or defer the decision.')
  }
  if (
    decision.recommendationStatus === SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended &&
    !hasSellerTransferAttorneyIdentity(decision.recommendedAttorney)
  ) {
    errors.push('A transfer attorney is required when an agency recommendation is recorded.')
  }
  if (
    decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation &&
    !hasSellerTransferAttorneyIdentity(decision.recommendedAttorney)
  ) {
    errors.push('A recommended transfer attorney is required before the seller can accept it.')
  }
  if (
    decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn &&
    !hasSellerTransferAttorneyIdentity(decision.selectedAttorney)
  ) {
    errors.push('The seller\'s nominated transfer attorney is required.')
  }
  if (
    decision.decision !== SELLER_TRANSFER_ATTORNEY_DECISIONS.pending &&
    !decision.decidedAt
  ) {
    errors.push('The seller decision timestamp is required.')
  }
  if (
    [SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation, SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn].includes(decision.decision) &&
    !decision.consentCaptured
  ) {
    errors.push('Seller consent must be recorded for the selected transfer attorney.')
  }
  if (decision.selectionSource !== expectedSelectionSource) {
    errors.push('The attorney selection source does not match the seller decision.')
  }

  return {
    valid: errors.length === 0,
    errors,
    value: decision,
  }
}

export function isSellerTransferAttorneyDecisionResolved(input = {}) {
  const { valid, value } = validateSellerTransferAttorneyDecision(input)
  return valid && [
    SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  ].includes(value.decision)
}

export function hasSellerTransferAttorneyDecisionRecord(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  return Boolean(
    input.version ||
    input.decision ||
    input.sellerDecision ||
    input.seller_decision ||
    input.recommendationStatus ||
    input.recommendation_status ||
    input.recommendedAttorney ||
    input.recommended_attorney,
  )
}

export function buildSellerTransferAttorneyMandatePatch(input = {}) {
  const present = hasSellerTransferAttorneyDecisionRecord(input)
  const validation = validateSellerTransferAttorneyDecision(input, { requireDecision: present })
  const decision = validation.value
  const resolved = validation.valid && [
    SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  ].includes(decision.decision)
  const attorney = resolved ? decision.selectedAttorney : normalizeSellerTransferAttorneyIdentity()

  return {
    sellerTransferAttorneyDecisionPresent: present,
    sellerTransferAttorneyDecisionResolved: resolved,
    sellerTransferAttorneyDecisionErrors: validation.errors,
    sellerTransferAttorneyDecision: decision,
    transferAttorneyPreferredPartnerId: attorney.preferredPartnerId || '',
    transferAttorneyPartnerOrganisationId: attorney.partnerOrganisationId || '',
    transferAttorneyCompanyName: attorney.companyName || '',
    transferAttorneyContactPerson: attorney.contactPerson || '',
    transferAttorneyEmail: attorney.email || '',
    transferAttorneyPhone: attorney.phone || '',
    transferAttorneySelectionSource: resolved ? decision.selectionSource : '',
    transferAttorneySelectionDeferred: decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
  }
}

export function buildSellerTransferAttorneyOnboardingPatch(input = {}) {
  return {
    transferAttorneyDecision: normalizeSellerTransferAttorneyDecision(input),
  }
}

function sellerTransferAttorneyDecisionFingerprint(input = {}) {
  const decision = normalizeSellerTransferAttorneyDecision(input)
  const attorney = decision.selectedAttorney
  return [
    decision.decision,
    decision.selectionSource,
    attorney.preferredPartnerId,
    attorney.partnerOrganisationId,
    attorney.companyName.toLowerCase(),
    attorney.email,
  ].join('|')
}

export function buildSellerTransferAttorneyOperationalOutcome(
  input = {},
  { previousDecision = null } = {},
) {
  const validation = validateSellerTransferAttorneyDecision(input)
  const decision = validation.value
  const previous = previousDecision
    ? normalizeSellerTransferAttorneyDecision(previousDecision)
    : null
  const decisionChanged = Boolean(
    previous &&
    sellerTransferAttorneyDecisionFingerprint(previous) !== sellerTransferAttorneyDecisionFingerprint(decision),
  )
  const attorneyName = decision.selectedAttorney.companyName || 'the nominated firm'
  const baseMetadata = {
    workflow: 'seller_transfer_attorney',
    decision: decision.decision,
    selectionSource: decision.selectionSource,
    decidedAt: decision.decidedAt,
    attorney: decision.selectedAttorney,
    decisionChanged,
  }

  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation) {
    return {
      decision,
      validation,
      decisionChanged,
      action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.readyForMandate,
      task: null,
      activity: {
        type: 'transfer_attorney_recommendation_accepted',
        title: 'Seller accepted the recommended transferring attorney',
        description: `${attorneyName} can be carried into the mandate workflow.`,
        metadata: baseMetadata,
      },
    }
  }

  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn) {
    return {
      decision,
      validation,
      decisionChanged,
      action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.verifyNomination,
      task: {
        title: 'Verify seller-nominated transferring attorney',
        description: `Confirm the contact details and instruction readiness for ${attorneyName} before preparing the mandate.`,
        priority: 'High',
        dueInDays: 1,
        metadata: { ...baseMetadata, action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.verifyNomination },
      },
      activity: {
        type: 'transfer_attorney_nomination_submitted',
        title: 'Seller nominated a transferring attorney',
        description: `${attorneyName} must be verified before mandate preparation.`,
        metadata: baseMetadata,
      },
    }
  }

  if (decision.decision === SELLER_TRANSFER_ATTORNEY_DECISIONS.defer) {
    return {
      decision,
      validation,
      decisionChanged,
      action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.contactSeller,
      task: {
        title: 'Contact seller about transferring attorney',
        description: 'The seller asked to discuss the transferring attorney before mandate preparation.',
        priority: 'High',
        dueInDays: 1,
        metadata: { ...baseMetadata, action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.contactSeller },
      },
      activity: {
        type: 'transfer_attorney_decision_deferred',
        title: 'Seller deferred the transferring attorney decision',
        description: 'The assigned agent must contact the seller before mandate preparation.',
        metadata: baseMetadata,
      },
    }
  }

  return {
    decision,
    validation,
    decisionChanged,
    action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.resolveSelection,
    task: {
      title: 'Resolve seller transferring attorney selection',
      description: 'Seller onboarding completed without a valid transferring attorney decision.',
      priority: 'High',
      dueInDays: 1,
      metadata: { ...baseMetadata, action: SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.resolveSelection },
    },
    activity: {
      type: 'transfer_attorney_decision_missing',
      title: 'Transferring attorney decision requires attention',
      description: 'Resolve the seller decision before mandate preparation.',
      metadata: baseMetadata,
    },
  }
}
