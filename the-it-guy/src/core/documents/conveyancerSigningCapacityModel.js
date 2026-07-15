import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../transactions/conveyancerMatterPlanContract.js'

export const CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION = 'conveyancer_signing_capacity_v1'

export const CONVEYANCER_SIGNING_PARTY_TYPES = Object.freeze({
  individual: 'individual',
  company: 'company',
  closeCorporation: 'close_corporation',
  trust: 'trust',
  deceasedEstate: 'deceased_estate',
  minor: 'minor',
  representedParty: 'represented_party',
  legalPractitioner: 'legal_practitioner',
  bank: 'bank',
  independentWitness: 'independent_witness',
})

export const CONVEYANCER_SIGNING_CAPACITY_TYPES = Object.freeze({
  self: 'self',
  coOwner: 'co_owner',
  spouseConsent: 'spouse_consent',
  director: 'director',
  member: 'member',
  trustee: 'trustee',
  executor: 'executor',
  attorneyUnderPower: 'attorney_under_power',
  guardian: 'guardian',
  curator: 'curator',
  authorisedRepresentative: 'authorised_representative',
  conveyancer: 'conveyancer',
  bankAuthorised: 'bank_authorised',
  commissioner: 'commissioner',
  witness: 'witness',
})

export const CONVEYANCER_SIGNING_AUTHORITY_BASES = Object.freeze({
  selfIdentity: 'self_identity',
  ownershipRecord: 'ownership_record',
  maritalConsent: 'marital_consent',
  boardResolution: 'board_resolution',
  memberResolution: 'member_resolution',
  trustDeedAndResolution: 'trust_deed_and_resolution',
  lettersOfExecutorship: 'letters_of_executorship',
  powerOfAttorney: 'power_of_attorney',
  guardianship: 'guardianship',
  curatorshipOrder: 'curatorship_order',
  delegatedResolution: 'delegated_resolution',
  professionalAppointment: 'professional_appointment',
  bankMandate: 'bank_mandate',
  statutoryOffice: 'statutory_office',
  witnessAttestation: 'witness_attestation',
})

export const CONVEYANCER_SIGNING_CAPACITY_STATUSES = Object.freeze({
  incomplete: 'incomplete',
  ready: 'ready',
  reviewRequired: 'review_required',
  blocked: 'blocked',
})

export const CONVEYANCER_SIGNING_EVIDENCE_STATUSES = Object.freeze({
  pending: 'pending',
  verified: 'verified',
  rejected: 'rejected',
  conflict: 'conflict',
})

export const CONVEYANCER_SIGNING_CAPACITY_CAPABILITIES = Object.freeze({
  view: 'view',
  capture: 'capture',
  verify: 'verify',
  use: 'use',
})

const P = CONVEYANCER_SIGNING_PARTY_TYPES
const C = CONVEYANCER_SIGNING_CAPACITY_TYPES
const A = CONVEYANCER_SIGNING_AUTHORITY_BASES
const S = CONVEYANCER_SIGNING_CAPACITY_STATUSES
const E = CONVEYANCER_SIGNING_EVIDENCE_STATUSES
const CAP = CONVEYANCER_SIGNING_CAPACITY_CAPABILITIES

export const CONVEYANCER_SIGNING_CAPACITY_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.view, CAP.capture]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([CAP.view, CAP.use]),
  [R.accounts]: Object.freeze([]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

const definition = (partyTypes, authorityBasis, requiredEvidence, options = {}) => Object.freeze({
  partyTypes: Object.freeze(partyTypes),
  partyRoles: Object.freeze(options.partyRoles || ['seller', 'buyer', 'consenting_spouse', 'legal_practitioner', 'bank', 'witness', 'commissioner']),
  authorityBasis,
  requiredEvidence: Object.freeze(requiredEvidence),
  independentLegalVerification: options.independentLegalVerification ?? true,
})

export const CONVEYANCER_SIGNING_CAPACITY_LIBRARY = Object.freeze({
  [C.self]: definition([P.individual], A.selfIdentity, ['identity_verified', 'party_identity_match'], { independentLegalVerification: false }),
  [C.coOwner]: definition([P.individual], A.ownershipRecord, ['identity_verified', 'ownership_evidence']),
  [C.spouseConsent]: definition([P.individual], A.maritalConsent, ['identity_verified', 'marriage_evidence', 'consent_scope'], { partyRoles: ['consenting_spouse'] }),
  [C.director]: definition([P.company], A.boardResolution, ['identity_verified', 'company_registration', 'board_resolution']),
  [C.member]: definition([P.closeCorporation], A.memberResolution, ['identity_verified', 'entity_registration', 'member_resolution']),
  [C.trustee]: definition([P.trust], A.trustDeedAndResolution, ['identity_verified', 'trust_deed', 'letters_of_authority', 'trustee_resolution']),
  [C.executor]: definition([P.deceasedEstate], A.lettersOfExecutorship, ['identity_verified', 'letters_of_executorship', 'estate_reference']),
  [C.attorneyUnderPower]: definition([P.individual, P.representedParty], A.powerOfAttorney, ['identity_verified', 'power_of_attorney', 'principal_identity', 'authority_scope']),
  [C.guardian]: definition([P.minor], A.guardianship, ['identity_verified', 'minor_identity', 'guardianship_evidence']),
  [C.curator]: definition([P.representedParty], A.curatorshipOrder, ['identity_verified', 'curatorship_order', 'authority_scope']),
  [C.authorisedRepresentative]: definition([P.company, P.closeCorporation, P.trust, P.bank], A.delegatedResolution, ['identity_verified', 'entity_registration', 'delegated_resolution', 'authority_scope']),
  [C.conveyancer]: definition([P.legalPractitioner], A.professionalAppointment, ['professional_registration', 'matter_appointment'], { partyRoles: ['legal_practitioner'] }),
  [C.bankAuthorised]: definition([P.bank], A.bankMandate, ['identity_verified', 'bank_mandate', 'attorney_appointment'], { partyRoles: ['bank'] }),
  [C.commissioner]: definition([P.legalPractitioner], A.statutoryOffice, ['professional_registration', 'commissioner_authority'], { partyRoles: ['commissioner'] }),
  [C.witness]: definition([P.independentWitness, P.individual], A.witnessAttestation, ['identity_verified', 'presence_attestation'], { partyRoles: ['witness'], independentLegalVerification: false }),
})

const PARTY_TYPES = new Set(Object.values(P))
const CAPACITY_TYPES = new Set(Object.values(C))
const AUTHORITY_BASES = new Set(Object.values(A))
const STATUSES = new Set(Object.values(S))
const EVIDENCE_STATUSES = new Set(Object.values(E))
const LANES = new Set(['transfer', 'bond', 'cancellation'])

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null } }
function normalizeList(values = []) { return unique((Array.isArray(values) ? values : []).map(key)) }

export function getConveyancerSigningCapacityCapabilities(role) {
  return CONVEYANCER_SIGNING_CAPACITY_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerSigningCapacityActor(role, capability) {
  return getConveyancerSigningCapacityCapabilities(role).includes(key(capability))
}

export function isConveyancerSigningCapacityLaneAuthorised(role, lane, { includeSecretary = true } = {}) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  if ([R.firmManager, R.system].includes(normalized)) return true
  if (includeSecretary && normalized === R.secretary) return LANES.has(key(lane))
  if (key(lane) === 'transfer') return [R.conveyancer, R.transferAttorney].includes(normalized)
  if (key(lane) === 'bond') return normalized === R.bondAttorney
  if (key(lane) === 'cancellation') return normalized === R.cancellationAttorney
  return false
}

export function getConveyancerSigningCapacityDefinition(capacityType) {
  return CONVEYANCER_SIGNING_CAPACITY_LIBRARY[key(capacityType)] || null
}

function normalizeEvidence(input = {}) {
  return {
    requirementKey: key(input.requirementKey || input.requirement_key),
    referenceId: text(input.referenceId || input.reference_id) || null,
    evidenceHash: text(input.evidenceHash || input.evidence_hash).toLowerCase() || null,
    status: key(input.status) || E.pending,
    issuedAt: iso(input.issuedAt || input.issued_at),
    expiresAt: iso(input.expiresAt || input.expires_at),
    verifiedAt: iso(input.verifiedAt || input.verified_at),
    verifiedBy: actor(input.verifiedBy || input.verified_by),
    source: key(input.source) || 'matter_record',
  }
}

function capacitySnapshot(capacity = {}) {
  const { fingerprint: _fingerprint, assessment: _assessment, ...snapshot } = capacity
  return stable(snapshot)
}

export function buildConveyancerSigningCapacityFingerprint(capacity = {}) {
  return fnv(capacitySnapshot(capacity))
}

function assessCapacity(capacity, definitionValue, asOf) {
  const missing = []
  const pending = []
  const rejected = []
  const conflicts = []
  const expired = []
  const now = new Date(asOf)
  const evidenceByRequirement = new Map(capacity.evidence.map((item) => [item.requirementKey, item]))

  if (!capacity.scope.documentKinds.length && !capacity.scope.documentKeys.length) missing.push('signing_scope')
  if (!capacity.scope.powers.includes('sign_documents')) missing.push('sign_documents_power')
  if (!capacity.scope.effectiveFrom) missing.push('authority_effective_from')
  if (capacity.scope.effectiveFrom && new Date(capacity.scope.effectiveFrom) > now) pending.push('authority_not_yet_effective')
  if (capacity.scope.effectiveUntil && new Date(capacity.scope.effectiveUntil) < now) expired.push('authority_period')

  for (const requirementKey of definitionValue?.requiredEvidence || []) {
    const item = evidenceByRequirement.get(requirementKey)
    if (!item) { missing.push(requirementKey); continue }
    if (item.status === E.pending) pending.push(requirementKey)
    if (item.status === E.rejected) rejected.push(requirementKey)
    if (item.status === E.conflict) conflicts.push(requirementKey)
    if (item.expiresAt && new Date(item.expiresAt) < now) expired.push(requirementKey)
    if (item.status === E.verified && (!item.referenceId || !sha(item.evidenceHash) || !item.verifiedAt || !item.verifiedBy.userId)) missing.push(`${requirementKey}_verification_record`)
    if (item.status === E.verified && definitionValue?.independentLegalVerification) {
      if (!canConveyancerSigningCapacityActor(item.verifiedBy.role, CAP.verify) || !isConveyancerSigningCapacityLaneAuthorised(item.verifiedBy.role, capacity.lane, { includeSecretary: false })) conflicts.push(`${requirementKey}_legal_verifier`)
      if (item.verifiedBy.userId === capacity.capturedBy.userId) conflicts.push(`${requirementKey}_independent_verifier`)
    }
  }

  let status = S.ready
  if (rejected.length || conflicts.length || expired.length) status = S.blocked
  else if (missing.length || pending.length) status = S.incomplete
  return { status, missing: unique(missing), pending: unique(pending), rejected: unique(rejected), conflicts: unique(conflicts), expired: unique(expired), assessedAt: new Date(asOf).toISOString() }
}

function normalizedCapacity(input = {}, asOf = new Date().toISOString()) {
  const capacityType = key(input.capacityType || input.capacity_type)
  const definitionValue = getConveyancerSigningCapacityDefinition(capacityType)
  const recordVersion = Number(input.recordVersion || input.record_version || 1)
  const capturedBy = actor(input.capturedBy || input.captured_by)
  const capacity = {
    modelVersion: text(input.modelVersion || input.model_version) || CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
    capacityId: text(input.capacityId || input.capacity_id),
    recordVersion,
    previousCapacityId: text(input.previousCapacityId || input.previous_capacity_id) || null,
    previousFingerprint: text(input.previousFingerprint || input.previous_fingerprint) || null,
    changeReason: text(input.changeReason || input.change_reason) || null,
    planId: text(input.planId || input.plan_id),
    planVersion: Number(input.planVersion || input.plan_version || 1),
    transactionId: text(input.transactionId || input.transaction_id),
    organisationId: text(input.organisationId || input.organisation_id),
    lane: key(input.lane),
    partyKey: key(input.partyKey || input.party_key),
    partyRole: key(input.partyRole || input.party_role),
    partyType: key(input.partyType || input.party_type),
    signatoryKey: key(input.signatoryKey || input.signatory_key),
    signatoryReferenceHash: text(input.signatoryReferenceHash || input.signatory_reference_hash).toLowerCase(),
    capacityType,
    authorityBasis: key(input.authorityBasis || input.authority_basis),
    scope: {
      documentKinds: normalizeList(input.scope?.documentKinds || input.scope?.document_kinds),
      documentKeys: normalizeList(input.scope?.documentKeys || input.scope?.document_keys),
      powers: normalizeList(input.scope?.powers),
      effectiveFrom: iso(input.scope?.effectiveFrom || input.scope?.effective_from),
      effectiveUntil: iso(input.scope?.effectiveUntil || input.scope?.effective_until),
    },
    evidence: (Array.isArray(input.evidence) ? input.evidence : []).map(normalizeEvidence),
    capturedAt: iso(input.capturedAt || input.captured_at),
    capturedBy,
  }
  capacity.assessment = assessCapacity(capacity, definitionValue, asOf)
  capacity.fingerprint = buildConveyancerSigningCapacityFingerprint(capacity)
  return capacity
}

export function validateConveyancerSigningCapacity(input = {}, { asOf } = {}) {
  const assessedAt = iso(asOf || input.assessment?.assessedAt || input.assessment?.assessed_at || input.capturedAt || input.captured_at) || new Date().toISOString()
  const capacity = normalizedCapacity(input, assessedAt)
  const errors = []
  const definitionValue = getConveyancerSigningCapacityDefinition(capacity.capacityType)
  if (capacity.modelVersion !== CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION) errors.push('signing_capacity_model_version_invalid')
  if (!capacity.capacityId) errors.push('capacity_id_required')
  if (!Number.isInteger(capacity.recordVersion) || capacity.recordVersion < 1) errors.push('record_version_invalid')
  if (!capacity.planId || !Number.isInteger(capacity.planVersion) || capacity.planVersion < 1) errors.push('matter_plan_reference_invalid')
  if (!capacity.transactionId) errors.push('transaction_id_required')
  if (!capacity.organisationId) errors.push('organisation_id_required')
  if (!LANES.has(capacity.lane)) errors.push('lane_invalid')
  if (!capacity.partyKey || !capacity.partyRole) errors.push('party_reference_invalid')
  if (!PARTY_TYPES.has(capacity.partyType)) errors.push('party_type_invalid')
  if (!capacity.signatoryKey || !sha(capacity.signatoryReferenceHash)) errors.push('signatory_reference_invalid')
  if (!CAPACITY_TYPES.has(capacity.capacityType) || !definitionValue) errors.push('capacity_type_invalid')
  if (!AUTHORITY_BASES.has(capacity.authorityBasis)) errors.push('authority_basis_invalid')
  if (definitionValue && !definitionValue.partyTypes.includes(capacity.partyType)) errors.push('capacity_not_permitted_for_party_type')
  if (definitionValue && !definitionValue.partyRoles.includes(capacity.partyRole)) errors.push('capacity_not_permitted_for_party_role')
  if (definitionValue && definitionValue.authorityBasis !== capacity.authorityBasis) errors.push('authority_basis_does_not_match_capacity')
  if (!capacity.capturedAt || !capacity.capturedBy.userId || !canConveyancerSigningCapacityActor(capacity.capturedBy.role, CAP.capture) || !isConveyancerSigningCapacityLaneAuthorised(capacity.capturedBy.role, capacity.lane)) errors.push('capacity_capture_not_authorised')
  if (capacity.scope.effectiveFrom && capacity.scope.effectiveUntil && new Date(capacity.scope.effectiveUntil) < new Date(capacity.scope.effectiveFrom)) errors.push('authority_period_invalid')
  const requirementKeys = capacity.evidence.map((item) => item.requirementKey)
  if (requirementKeys.some((item, index) => !item || requirementKeys.indexOf(item) !== index)) errors.push('evidence_requirement_keys_invalid')
  for (const item of capacity.evidence) {
    if (!EVIDENCE_STATUSES.has(item.status)) errors.push(`evidence_status_invalid:${item.requirementKey || 'unknown'}`)
    if (item.issuedAt && item.expiresAt && new Date(item.expiresAt) < new Date(item.issuedAt)) errors.push(`evidence_period_invalid:${item.requirementKey}`)
    if (item.verifiedAt && new Date(item.verifiedAt) > new Date(assessedAt)) errors.push(`evidence_verified_in_future:${item.requirementKey}`)
  }
  if (input.fingerprint && input.fingerprint !== capacity.fingerprint) errors.push('signing_capacity_fingerprint_invalid')
  if (input.assessment && JSON.stringify(stable(input.assessment)) !== JSON.stringify(stable(capacity.assessment))) errors.push('signing_capacity_assessment_stale')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), capacity })
}

export function buildConveyancerSigningCapacity(input = {}, options = {}) {
  const validation = validateConveyancerSigningCapacity(input, options)
  if (!validation.valid) return deepFreeze({ ok: false, code: 'signing_capacity_contract_invalid', errors: validation.errors, capacity: validation.capacity })
  return deepFreeze({ ok: true, code: validation.capacity.assessment.status, errors: [], capacity: validation.capacity })
}

export function evaluateConveyancerSigningCapacityApplicability({ capacity: input = {}, document = {}, asOf, expectedPartyRole } = {}) {
  const validation = validateConveyancerSigningCapacity(input, { asOf })
  const capacity = validation.capacity
  const reasons = [...validation.errors]
  const documentKind = key(document.documentKind || document.document_kind)
  const documentKey = key(document.documentKey || document.document_key)
  const at = iso(asOf) || new Date().toISOString()
  if (capacity.assessment.status !== S.ready) reasons.push(`capacity_${capacity.assessment.status}`)
  if (text(document.planId || document.plan_id) !== capacity.planId || Number(document.planVersion || document.plan_version) !== capacity.planVersion) reasons.push('document_plan_mismatch')
  if (text(document.transactionId || document.transaction_id) !== capacity.transactionId) reasons.push('document_transaction_mismatch')
  if (text(document.organisationId || document.organisation_id) !== capacity.organisationId) reasons.push('document_organisation_mismatch')
  if (key(document.lane) !== capacity.lane) reasons.push('document_lane_mismatch')
  if (expectedPartyRole && key(expectedPartyRole) !== capacity.partyRole) reasons.push('party_role_mismatch')
  if (!capacity.scope.documentKeys.includes(documentKey) && !capacity.scope.documentKinds.includes(documentKind)) reasons.push('document_outside_authority_scope')
  if (capacity.scope.effectiveFrom && new Date(capacity.scope.effectiveFrom) > new Date(at)) reasons.push('authority_not_yet_effective')
  if (capacity.scope.effectiveUntil && new Date(capacity.scope.effectiveUntil) < new Date(at)) reasons.push('authority_expired')
  return deepFreeze({ usable: reasons.length === 0, decision: reasons.length ? 'blocked' : 'ready', reasons: unique(reasons), capacityId: capacity.capacityId, fingerprint: capacity.fingerprint })
}

export function validateConveyancerSigningCapacityLineage({ previous = null, current = {}, asOf } = {}) {
  const currentValidation = validateConveyancerSigningCapacity(current, { asOf })
  const errors = [...currentValidation.errors]
  if (!previous) {
    if (currentValidation.capacity.recordVersion !== 1 || currentValidation.capacity.previousCapacityId || currentValidation.capacity.previousFingerprint) errors.push('initial_capacity_lineage_invalid')
    return deepFreeze({ valid: errors.length === 0, errors: unique(errors), previous: null, current: currentValidation.capacity })
  }
  const previousValidation = validateConveyancerSigningCapacity(previous, { asOf: previous.assessment?.assessedAt || previous.capturedAt })
  errors.push(...previousValidation.errors.map((item) => `previous:${item}`))
  const prior = previousValidation.capacity
  const next = currentValidation.capacity
  if (next.recordVersion !== prior.recordVersion + 1) errors.push('capacity_version_must_be_sequential')
  if (next.previousCapacityId !== prior.capacityId || next.previousFingerprint !== prior.fingerprint) errors.push('previous_capacity_binding_invalid')
  if (!next.changeReason) errors.push('capacity_change_reason_required')
  for (const field of ['planId', 'planVersion', 'transactionId', 'organisationId', 'lane', 'partyKey', 'partyRole', 'signatoryKey', 'signatoryReferenceHash']) {
    if (next[field] !== prior[field]) errors.push(`capacity_lineage_identity_changed:${field}`)
  }
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), previous: prior, current: next })
}
