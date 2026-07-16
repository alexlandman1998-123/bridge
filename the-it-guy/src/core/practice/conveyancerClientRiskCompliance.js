import {
  buildPracticeActor,
  buildPracticeAuditEvent,
  buildPracticeOperationIdentity,
  buildPracticePolicyBinding,
  evaluatePracticeOperationAuthority,
  PRACTICE_OPERATION_CAPABILITIES,
} from './conveyancerPracticeOperationsContract.js'
import { buildInformationResource } from './conveyancerInformationGovernance.js'
import { CANONICAL_EVIDENCE_TYPES, CONVEYANCER_MANUAL_EVIDENCE_VERSION } from './conveyancerManualEvidenceRegister.js'

export const CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION = 'conveyancer_client_risk_compliance_g4_v1'

export const COMPLIANCE_PARTY_TYPES = Object.freeze({
  naturalPerson: 'natural_person',
  company: 'company',
  closeCorporation: 'close_corporation',
  trust: 'trust',
  partnership: 'partnership',
  otherEntity: 'other_entity',
})

export const CLIENT_RISK_RATINGS = Object.freeze({ low: 'low', medium: 'medium', high: 'high' })
export const DUE_DILIGENCE_ROUTES = Object.freeze({ simplified: 'simplified', normal: 'normal', enhanced: 'enhanced' })
export const COMPLIANCE_ASSESSMENT_STATES = Object.freeze({ pendingReview: 'pending_review', approved: 'approved', changesRequested: 'changes_requested', held: 'held', superseded: 'superseded' })

export const DEFAULT_CLIENT_RISK_FACTORS = Object.freeze([
  Object.freeze({ id: 'pep_or_related_person', weight: 35, forcesEnhanced: true }),
  Object.freeze({ id: 'sanctions_potential_match', weight: 100, forcesEnhanced: true, forcesHold: true }),
  Object.freeze({ id: 'high_risk_jurisdiction', weight: 25, forcesEnhanced: true }),
  Object.freeze({ id: 'non_face_to_face', weight: 10 }),
  Object.freeze({ id: 'complex_ownership', weight: 20, forcesEnhanced: true }),
  Object.freeze({ id: 'third_party_funding', weight: 20, forcesEnhanced: true }),
  Object.freeze({ id: 'cash_intensive_activity', weight: 15 }),
  Object.freeze({ id: 'unusual_transaction_pattern', weight: 25, forcesEnhanced: true }),
  Object.freeze({ id: 'adverse_media_indicator', weight: 25, forcesEnhanced: true }),
  Object.freeze({ id: 'high_value_transaction', weight: 15 }),
  Object.freeze({ id: 'foreign_entity_or_structure', weight: 10 }),
])

const C = PRACTICE_OPERATION_CAPABILITIES
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PARTY_TYPES = Object.values(COMPLIANCE_PARTY_TYPES)
const RISK_RATINGS = Object.values(CLIENT_RISK_RATINGS)
const ROUTES = Object.values(DUE_DILIGENCE_ROUTES)

const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.:]+/g, '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const unique = (values = []) => [...new Set(values.map(key).filter(Boolean))].sort()

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, name) => {
    result[name] = stable(value[name])
    return result
  }, {})
}

function fingerprint(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function normalizeRiskFactors(factors = DEFAULT_CLIENT_RISK_FACTORS) {
  return factors.map((factor) => ({
    id: key(factor.id),
    weight: Math.max(0, Math.min(100, Number(factor.weight) || 0)),
    forcesEnhanced: factor.forcesEnhanced === true,
    forcesHold: factor.forcesHold === true,
  })).sort((left, right) => left.id.localeCompare(right.id))
}

export function buildFirmCompliancePolicy(input = {}) {
  const thresholds = {
    lowMaximum: Math.max(0, Number(input.thresholds?.lowMaximum ?? 19)),
    mediumMaximum: Math.max(0, Number(input.thresholds?.mediumMaximum ?? 49)),
  }
  const policy = {
    version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION,
    policyId: text(input.policyId),
    policyVersion: text(input.policyVersion),
    organisationId: text(input.organisationId),
    attorneyFirmId: text(input.attorneyFirmId),
    rmcpReference: text(input.rmcpReference),
    effectiveAt: iso(input.effectiveAt),
    reviewIntervalDays: Math.max(1, Math.min(3650, Number(input.reviewIntervalDays) || 365)),
    allowSimplifiedDueDiligence: input.allowSimplifiedDueDiligence === true,
    thresholds,
    riskFactors: normalizeRiskFactors(input.riskFactors),
    routesByRating: {
      low: key(input.routesByRating?.low) || (input.allowSimplifiedDueDiligence === true ? 'simplified' : 'normal'),
      medium: key(input.routesByRating?.medium) || 'normal',
      high: key(input.routesByRating?.high) || 'enhanced',
    },
    reason: text(input.reason),
  }
  policy.fingerprint = fingerprint(policy)
  const binding = buildPracticePolicyBinding({ policyId: policy.policyId, policyVersion: policy.policyVersion, policyFingerprint: policy.fingerprint, effectiveAt: policy.effectiveAt })
  const errors = [...binding.errors]
  if (!UUID.test(policy.organisationId) || !UUID.test(policy.attorneyFirmId) || !policy.rmcpReference || !policy.reason) errors.push('compliance_policy_identity_invalid')
  if (thresholds.lowMaximum >= thresholds.mediumMaximum) errors.push('compliance_policy_thresholds_invalid')
  if (!policy.riskFactors.length || new Set(policy.riskFactors.map((factor) => factor.id)).size !== policy.riskFactors.length) errors.push('compliance_policy_risk_factors_invalid')
  if (Object.entries(policy.routesByRating).some(([rating, route]) => !RISK_RATINGS.includes(rating) || !ROUTES.includes(route))) errors.push('compliance_policy_routes_invalid')
  if (!policy.allowSimplifiedDueDiligence && policy.routesByRating.low === 'simplified') errors.push('compliance_policy_simplified_route_disabled')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], policy, binding: binding.binding })
}

function normalizeRelatedParty(item = {}) {
  return {
    partyId: text(item.partyId),
    capacity: key(item.capacity),
    ownershipPercent: item.ownershipPercent === null || item.ownershipPercent === undefined ? null : Number(item.ownershipPercent),
    controlBasis: key(item.controlBasis),
    evidenceReference: text(item.evidenceReference),
    evidenceHash: text(item.evidenceHash),
  }
}

export function buildCompliancePartyProfile(input = {}) {
  const identityResult = buildPracticeOperationIdentity(input.identity || input)
  const partyType = key(input.partyType)
  const beneficialOwners = (input.beneficialOwners || []).map(normalizeRelatedParty)
  const authorisedRepresentatives = (input.authorisedRepresentatives || []).map(normalizeRelatedParty)
  const profile = {
    version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION,
    profileId: text(input.profileId),
    identity: identityResult.identity,
    partyId: text(input.partyId),
    partyType,
    roleInMatter: key(input.roleInMatter),
    identityReference: text(input.identityReference),
    identityHash: text(input.identityHash),
    residenceOrIncorporationCountry: key(input.residenceOrIncorporationCountry),
    beneficialOwners,
    authorisedRepresentatives,
    capturedAt: iso(input.capturedAt),
    capturedBy: text(input.capturedBy),
  }
  profile.fingerprint = fingerprint(profile)
  const errors = [...identityResult.errors]
  if (!profile.profileId || !profile.partyId || !PARTY_TYPES.includes(partyType) || !profile.roleInMatter || !profile.identityReference || !HASH.test(profile.identityHash) || !profile.residenceOrIncorporationCountry || !profile.capturedAt || !UUID.test(profile.capturedBy)) errors.push('compliance_party_profile_invalid')
  for (const owner of beneficialOwners) {
    if (!owner.partyId || (owner.ownershipPercent !== null && (owner.ownershipPercent < 0 || owner.ownershipPercent > 100)) || !owner.controlBasis || !owner.evidenceReference || !HASH.test(owner.evidenceHash)) errors.push('compliance_beneficial_owner_invalid')
  }
  for (const representative of authorisedRepresentatives) {
    if (!representative.partyId || !representative.capacity || !representative.evidenceReference || !HASH.test(representative.evidenceHash)) errors.push('compliance_authorised_representative_invalid')
  }
  const informationResource = buildInformationResource({
    resourceId: profile.profileId,
    resourceType: 'client_risk_profile',
    organisationId: profile.identity.organisationId,
    attorneyFirmId: profile.identity.attorneyFirmId,
    transactionId: profile.identity.transactionId,
    branchId: profile.identity.branchId,
    teamId: profile.identity.teamId,
    classifications: ['special_personal', 'financial', 'restricted'],
    retentionClass: 'client_due_diligence',
    retainUntil: input.retainUntil,
    legalHold: input.legalHold === true,
    exportPolicy: 'prohibited',
  })
  if (!informationResource.ok) errors.push(...informationResource.errors)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], profile, informationResource: informationResource.resource })
}

function cddRequirements(profile, route) {
  const E = CANONICAL_EVIDENCE_TYPES
  const requirements = [E.identityDocument, E.addressVerification, E.pepScreening, E.sanctionsScreening]
  if (profile.partyType !== COMPLIANCE_PARTY_TYPES.naturalPerson) requirements.push(E.entityRegistration, E.constitutionalDocument, E.beneficialOwnershipEvidence, E.authorisedRepresentativeEvidence)
  if (route === DUE_DILIGENCE_ROUTES.normal) requirements.push(E.sourceOfFunds)
  if (route === DUE_DILIGENCE_ROUTES.enhanced) requirements.push(E.sourceOfFunds, E.sourceOfWealth, E.adverseMediaScreening)
  return unique(requirements)
}

function acceptedEvidenceForParty(item, profile) {
  const approvedEntry = item?.version === CONVEYANCER_MANUAL_EVIDENCE_VERSION && item?.state === 'accepted' && item?.quality?.complete === true
  const approvedProjection = item?.version === CONVEYANCER_MANUAL_EVIDENCE_VERSION && !item?.state && Boolean(item?.acceptedBy) && Boolean(item?.acceptedAt)
  const partyId = text(item?.confirmedFields?.party_id || item?.confirmedFields?.partyId)
  return (approvedEntry || approvedProjection) && partyId === profile.partyId && item?.identity?.transactionId !== undefined
    ? text(item.identity.transactionId) === profile.identity.transactionId
    : (approvedEntry || approvedProjection) && partyId === profile.partyId && text(item?.transactionId) === profile.identity.transactionId
}

function assessmentAuthority(actor, identity, asOf) {
  return evaluatePracticeOperationAuthority({ actor, identity, capability: C.reviewCompliance, asOf }).allowed || evaluatePracticeOperationAuthority({ actor, identity, capability: C.reviewEvidence, asOf }).allowed
}

export function buildClientRiskAssessment(input = {}) {
  const policyResult = buildFirmCompliancePolicy(input.policy || {})
  const profileResult = buildCompliancePartyProfile(input.profile || {})
  const actorResult = buildPracticeActor(input.assessedBy || {})
  const assessedAt = iso(input.assessedAt)
  const factorDefinitions = new Map(policyResult.policy.riskFactors.map((factor) => [factor.id, factor]))
  const indicators = (input.indicators || []).map((indicator) => {
    const id = key(indicator.id)
    const definition = factorDefinitions.get(id)
    return {
      id,
      present: indicator.present === true,
      weight: definition?.weight ?? 0,
      forcesEnhanced: definition?.forcesEnhanced === true,
      forcesHold: definition?.forcesHold === true,
      evidenceReference: text(indicator.evidenceReference),
      evidenceHash: text(indicator.evidenceHash),
      rationale: text(indicator.rationale),
      source: key(indicator.source) || 'manual_review',
    }
  }).sort((left, right) => left.id.localeCompare(right.id))
  const errors = [...policyResult.errors, ...profileResult.errors, ...actorResult.errors]
  if (!text(input.assessmentId) || !assessedAt || !assessmentAuthority(actorResult.actor, profileResult.profile.identity, assessedAt)) errors.push('compliance_assessment_not_authorised')
  if (policyResult.policy.organisationId !== profileResult.profile.identity.organisationId || policyResult.policy.attorneyFirmId !== profileResult.profile.identity.attorneyFirmId) errors.push('compliance_policy_profile_binding_mismatch')
  for (const indicator of indicators) {
    if (!factorDefinitions.has(indicator.id)) errors.push(`compliance_indicator_unknown:${indicator.id}`)
    if (indicator.present && (!indicator.evidenceReference || !HASH.test(indicator.evidenceHash) || !indicator.rationale)) errors.push(`compliance_indicator_evidence_required:${indicator.id}`)
  }
  if (new Set(indicators.map((indicator) => indicator.id)).size !== indicators.length) errors.push('compliance_duplicate_indicator')
  const presentIndicators = indicators.filter((indicator) => indicator.present)
  const score = Math.min(100, presentIndicators.reduce((sum, indicator) => sum + indicator.weight, 0))
  const rating = score <= policyResult.policy.thresholds.lowMaximum ? CLIENT_RISK_RATINGS.low : score <= policyResult.policy.thresholds.mediumMaximum ? CLIENT_RISK_RATINGS.medium : CLIENT_RISK_RATINGS.high
  let route = policyResult.policy.routesByRating[rating]
  if (presentIndicators.some((indicator) => indicator.forcesEnhanced)) route = DUE_DILIGENCE_ROUTES.enhanced
  const requirements = cddRequirements(profileResult.profile, route)
  const evidence = input.evidence || []
  const satisfiedRequirements = requirements.filter((type) => evidence.some((item) => key(item.canonicalEvidenceType) === type && acceptedEvidenceForParty(item, profileResult.profile)))
  const outstandingRequirements = requirements.filter((type) => !satisfiedRequirements.includes(type))
  const entityOwnershipMissing = profileResult.profile.partyType !== COMPLIANCE_PARTY_TYPES.naturalPerson && profileResult.profile.beneficialOwners.length === 0
  const representativeMissing = profileResult.profile.partyType !== COMPLIANCE_PARTY_TYPES.naturalPerson && profileResult.profile.authorisedRepresentatives.length === 0
  const holdReasons = []
  if (presentIndicators.some((indicator) => indicator.forcesHold)) holdReasons.push('restricted_risk_indicator_requires_resolution')
  if (outstandingRequirements.length) holdReasons.push('client_due_diligence_outstanding')
  if (entityOwnershipMissing) holdReasons.push('beneficial_ownership_outstanding')
  if (representativeMissing) holdReasons.push('authorised_representative_outstanding')
  const assessment = {
    version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION,
    assessmentId: text(input.assessmentId),
    identity: profileResult.profile.identity,
    policy: policyResult.binding,
    profileId: profileResult.profile.profileId,
    partyId: profileResult.profile.partyId,
    assessedBy: actorResult.actor,
    assessedAt,
    indicators,
    score,
    rating,
    route,
    requirements,
    satisfiedRequirements,
    outstandingRequirements,
    holdReasons,
    state: holdReasons.length ? COMPLIANCE_ASSESSMENT_STATES.held : COMPLIANCE_ASSESSMENT_STATES.pendingReview,
    mayProceed: false,
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: '',
    nextReviewAt: assessedAt ? new Date(new Date(assessedAt).getTime() + policyResult.policy.reviewIntervalDays * 86400000).toISOString() : null,
    supersedesAssessmentId: text(input.supersedesAssessmentId) || null,
  }
  assessment.fingerprint = fingerprint(assessment)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], assessment, profile: profileResult.profile, informationResource: profileResult.informationResource })
}

export function reviewClientRiskAssessment({ assessment = {}, reviewer = {}, decision = '', reason = '', reviewedAt = '' } = {}) {
  const actorResult = buildPracticeActor(reviewer)
  const at = iso(reviewedAt)
  const authority = evaluatePracticeOperationAuthority({ actor: actorResult.actor, identity: assessment.identity || {}, capability: C.reviewCompliance, asOf: at })
  const normalizedDecision = key(decision)
  const errors = []
  if (assessment.version !== CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION || !text(assessment.assessmentId)) errors.push('compliance_assessment_invalid')
  if (![COMPLIANCE_ASSESSMENT_STATES.pendingReview, COMPLIANCE_ASSESSMENT_STATES.held].includes(assessment.state) || assessment.reviewedBy) errors.push('compliance_assessment_not_reviewable')
  if (!['approved', 'changes_requested', 'held'].includes(normalizedDecision)) errors.push('compliance_review_decision_invalid')
  if (!actorResult.ok || !authority.allowed) errors.push('compliance_review_not_authorised')
  if (actorResult.actor.userId === assessment.assessedBy?.userId) errors.push('compliance_independent_review_required')
  if (!at || !text(reason)) errors.push('compliance_review_reason_and_date_required')
  if (normalizedDecision === 'approved' && (assessment.outstandingRequirements?.length || assessment.holdReasons?.length)) errors.push('compliance_approval_blocked')
  const next = {
    ...assessment,
    state: normalizedDecision,
    mayProceed: normalizedDecision === 'approved' && errors.length === 0,
    reviewedBy: actorResult.actor,
    reviewedAt: at,
    reviewReason: text(reason),
  }
  delete next.fingerprint
  next.fingerprint = fingerprint(next)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], assessment: next })
}

export function evaluateComplianceReassessment({ assessment = {}, asOf = '', events = [] } = {}) {
  const at = iso(asOf) || new Date().toISOString()
  const triggerTypes = new Set(['party_details_changed', 'beneficial_ownership_changed', 'authorised_representative_changed', 'source_of_funds_changed', 'source_of_wealth_changed', 'transaction_value_changed', 'pep_screening_changed', 'sanctions_screening_changed', 'adverse_media_changed', 'bank_details_changed'])
  const triggers = events.filter((event) => triggerTypes.has(key(event.type))).map((event) => ({ type: key(event.type), occurredAt: iso(event.occurredAt), reference: text(event.reference) }))
  if (assessment.nextReviewAt && new Date(assessment.nextReviewAt) <= new Date(at)) triggers.push({ type: 'periodic_review_due', occurredAt: at, reference: assessment.assessmentId })
  return freeze({ required: triggers.length > 0, assessmentId: assessment.assessmentId, evaluatedAt: at, triggers, action: triggers.length ? 'create_superseding_assessment' : 'retain_current_assessment' })
}

export function buildRestrictedComplianceEscalation(input = {}) {
  const actorResult = buildPracticeActor(input.actor || {})
  const identityResult = buildPracticeOperationIdentity(input.identity || {})
  const authority = evaluatePracticeOperationAuthority({ actor: actorResult.actor, identity: identityResult.identity, capability: C.setComplianceHold, asOf: input.createdAt })
  const escalation = {
    version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION,
    escalationId: text(input.escalationId),
    identity: identityResult.identity,
    assessmentId: text(input.assessmentId),
    partyId: text(input.partyId),
    reasonCode: key(input.reasonCode),
    intelligenceReference: text(input.intelligenceReference),
    intelligenceHash: text(input.intelligenceHash),
    createdBy: actorResult.actor,
    createdAt: iso(input.createdAt),
    status: 'restricted_review',
    controls: {
      visibleToMatterTeam: false,
      clientNotificationAllowed: false,
      ordinaryReminderAllowed: false,
      automaticRegulatoryReportAllowed: false,
      complianceHoldRequired: true,
    },
  }
  escalation.fingerprint = fingerprint(escalation)
  const errors = [...actorResult.errors, ...identityResult.errors]
  if (!authority.allowed || !escalation.escalationId || !escalation.assessmentId || !escalation.partyId || !escalation.reasonCode || !escalation.intelligenceReference || !HASH.test(escalation.intelligenceHash) || !escalation.createdAt) errors.push('restricted_compliance_escalation_invalid')
  const informationResource = buildInformationResource({
    resourceId: escalation.escalationId,
    resourceType: 'restricted_compliance_escalation',
    organisationId: escalation.identity.organisationId,
    attorneyFirmId: escalation.identity.attorneyFirmId,
    transactionId: escalation.identity.transactionId,
    branchId: escalation.identity.branchId,
    teamId: escalation.identity.teamId,
    classifications: ['restricted', 'privileged', 'special_personal'],
    retentionClass: 'restricted_compliance_record',
    retainUntil: input.retainUntil,
    legalHold: true,
    exportPolicy: 'prohibited',
  })
  if (!informationResource.ok) errors.push(...informationResource.errors)
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], escalation, informationResource: informationResource.resource })
}

export function buildComplianceAuditExport({ assessment = {}, exportId = '', generatedAt = '', generatedBy = '' } = {}) {
  const value = {
    version: CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION,
    exportId: text(exportId),
    assessmentId: text(assessment.assessmentId),
    organisationId: text(assessment.identity?.organisationId),
    attorneyFirmId: text(assessment.identity?.attorneyFirmId),
    transactionId: text(assessment.identity?.transactionId),
    policy: assessment.policy,
    profileId: text(assessment.profileId),
    partyId: text(assessment.partyId),
    score: Number(assessment.score),
    rating: key(assessment.rating),
    route: key(assessment.route),
    state: key(assessment.state),
    mayProceed: assessment.mayProceed === true,
    indicatorSummary: (assessment.indicators || []).map((indicator) => ({ id: indicator.id, present: indicator.present, weight: indicator.weight })),
    requirements: assessment.requirements || [],
    outstandingRequirements: assessment.outstandingRequirements || [],
    holdReasons: assessment.holdReasons || [],
    assessedAt: iso(assessment.assessedAt),
    assessedBy: assessment.assessedBy?.userId || null,
    reviewedAt: iso(assessment.reviewedAt),
    reviewedBy: assessment.reviewedBy?.userId || null,
    generatedAt: iso(generatedAt),
    generatedBy: text(generatedBy),
    redacted: true,
  }
  value.fingerprint = fingerprint(value)
  const errors = []
  if (!value.exportId || assessment.version !== CONVEYANCER_CLIENT_RISK_COMPLIANCE_VERSION || !value.generatedAt || !UUID.test(value.generatedBy)) errors.push('compliance_audit_export_invalid')
  return freeze({ ok: errors.length === 0, errors, export: value })
}

export function buildComplianceAuditEvent({ assessment = {}, eventId = '', eventType = '', actorUserId = '', reason = '', occurredAt = '', detailReference = '', detailHash = '' } = {}) {
  return buildPracticeAuditEvent({
    eventId,
    eventType: eventType || `compliance_assessment_${assessment.state}`,
    operationId: assessment.assessmentId,
    organisationId: assessment.identity?.organisationId,
    attorneyFirmId: assessment.identity?.attorneyFirmId,
    transactionId: assessment.identity?.transactionId,
    actorUserId,
    capability: C.reviewCompliance,
    reason,
    occurredAt,
    correlationId: assessment.assessmentId,
    causationId: assessment.supersedesAssessmentId || '',
    detailReference,
    detailHash,
  })
}
