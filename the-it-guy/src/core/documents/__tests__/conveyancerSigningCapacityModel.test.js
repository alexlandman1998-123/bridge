import assert from 'node:assert/strict'
import {
  MATTER_PLAN_OWNER_ROLES as R,
} from '../../transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_AUTHORITY_BASES as A,
  CONVEYANCER_SIGNING_CAPACITY_CAPABILITIES as CAP,
  CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
  CONVEYANCER_SIGNING_CAPACITY_STATUSES as S,
  CONVEYANCER_SIGNING_CAPACITY_TYPES as C,
  CONVEYANCER_SIGNING_PARTY_TYPES as P,
  buildConveyancerSigningCapacity,
  canConveyancerSigningCapacityActor,
  evaluateConveyancerSigningCapacityApplicability,
  getConveyancerSigningCapacityDefinition,
  validateConveyancerSigningCapacity,
  validateConveyancerSigningCapacityLineage,
} from '../conveyancerSigningCapacityModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const HASH = 'a'.repeat(64)
const REF_HASH = 'b'.repeat(64)
const capturedBy = { role: R.secretary, userId: 'secretary-d1' }
const verifier = { role: R.transferAttorney, userId: 'attorney-d1' }
const AS_OF = '2026-07-15T10:00:00.000Z'

function evidence(requirementKey, overrides = {}) {
  return {
    requirementKey,
    referenceId: `evidence:${requirementKey}`,
    evidenceHash: HASH,
    status: 'verified',
    issuedAt: '2026-07-01T08:00:00.000Z',
    expiresAt: null,
    verifiedAt: '2026-07-14T08:00:00.000Z',
    verifiedBy: verifier,
    source: 'matter_record',
    ...overrides,
  }
}

function capacity(overrides = {}) {
  const capacityType = overrides.capacityType || C.director
  const definition = getConveyancerSigningCapacityDefinition(capacityType)
  return {
    modelVersion: CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
    capacityId: 'capacity:seller-1:v1',
    recordVersion: 1,
    previousCapacityId: null,
    previousFingerprint: null,
    changeReason: null,
    planId: 'plan-1',
    planVersion: 3,
    transactionId: 'transaction-1',
    organisationId: 'organisation-1',
    lane: 'transfer',
    partyKey: 'seller-1',
    partyRole: 'seller',
    partyType: P.company,
    signatoryKey: 'signatory-1',
    signatoryReferenceHash: REF_HASH,
    capacityType,
    authorityBasis: definition?.authorityBasis,
    scope: {
      documentKinds: ['agreement'],
      documentKeys: ['transfer_power'],
      powers: ['sign_documents'],
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveUntil: '2026-12-31T23:59:59.000Z',
    },
    evidence: (definition?.requiredEvidence || []).map((item) => evidence(item)),
    capturedAt: '2026-07-13T08:00:00.000Z',
    capturedBy,
    ...overrides,
  }
}

function built(overrides = {}) {
  const result = buildConveyancerSigningCapacity(capacity(overrides), { asOf: AS_OF })
  assert.equal(result.ok, true, result.errors?.join(', '))
  return result.capacity
}

function document(overrides = {}) {
  return {
    planId: 'plan-1',
    planVersion: 3,
    transactionId: 'transaction-1',
    organisationId: 'organisation-1',
    lane: 'transfer',
    documentKind: 'agreement',
    documentKey: 'transfer_power',
    ...overrides,
  }
}

test('builds a ready company director capacity with exact authority evidence', () => {
  const result = buildConveyancerSigningCapacity(capacity(), { asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.code, S.ready)
  assert.equal(result.capacity.assessment.status, S.ready)
  assert.match(result.capacity.fingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.equal(Object.isFrozen(result.capacity), true)
})

test('supports natural-person self-signing without independent legal verification', () => {
  const input = capacity({
    partyType: P.individual,
    capacityType: C.self,
    authorityBasis: A.selfIdentity,
    evidence: [
      evidence('identity_verified', { verifiedBy: capturedBy }),
      evidence('party_identity_match', { verifiedBy: capturedBy }),
    ],
  })
  const result = buildConveyancerSigningCapacity(input, { asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.capacity.assessment.status, S.ready)
})

test('requires the full trust authority bundle', () => {
  const definition = getConveyancerSigningCapacityDefinition(C.trustee)
  assert.deepEqual(definition.requiredEvidence, ['identity_verified', 'trust_deed', 'letters_of_authority', 'trustee_resolution'])
  const result = buildConveyancerSigningCapacity(capacity({
    partyType: P.trust,
    capacityType: C.trustee,
    authorityBasis: A.trustDeedAndResolution,
    evidence: definition.requiredEvidence.slice(0, -1).map((item) => evidence(item)),
  }), { asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.capacity.assessment.status, S.incomplete)
  assert.deepEqual(result.capacity.assessment.missing, ['trustee_resolution'])
})

test('models executor, power-of-attorney, guardian and curator authority explicitly', () => {
  const cases = [
    [C.executor, P.deceasedEstate, A.lettersOfExecutorship],
    [C.attorneyUnderPower, P.representedParty, A.powerOfAttorney],
    [C.guardian, P.minor, A.guardianship],
    [C.curator, P.representedParty, A.curatorshipOrder],
  ]
  for (const [capacityType, partyType, authorityBasis] of cases) {
    const definition = getConveyancerSigningCapacityDefinition(capacityType)
    const result = buildConveyancerSigningCapacity(capacity({
      capacityType,
      partyType,
      authorityBasis,
      evidence: definition.requiredEvidence.map((item) => evidence(item)),
    }), { asOf: AS_OF })
    assert.equal(result.ok, true, capacityType)
    assert.equal(result.capacity.assessment.status, S.ready, capacityType)
  }
})

test('fails closed for an impossible party and capacity combination', () => {
  const result = buildConveyancerSigningCapacity(capacity({ partyType: P.trust }), { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('capacity_not_permitted_for_party_type'))
})

test('rejects an authority basis that does not match the capacity definition', () => {
  const result = buildConveyancerSigningCapacity(capacity({ authorityBasis: A.powerOfAttorney }), { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('authority_basis_does_not_match_capacity'))
})

test('distinguishes missing and pending evidence from legal blockers', () => {
  const input = capacity()
  input.evidence[1].status = 'pending'
  const result = buildConveyancerSigningCapacity(input, { asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.capacity.assessment.status, S.incomplete)
  assert.ok(result.capacity.assessment.pending.includes('company_registration'))
})

test('blocks rejected, conflicting and expired authority evidence', () => {
  for (const mutation of [
    (item) => { item.status = 'rejected' },
    (item) => { item.status = 'conflict' },
    (item) => { item.expiresAt = '2026-07-10T00:00:00.000Z' },
  ]) {
    const input = capacity()
    mutation(input.evidence[1])
    const result = buildConveyancerSigningCapacity(input, { asOf: AS_OF })
    assert.equal(result.ok, true)
    assert.equal(result.capacity.assessment.status, S.blocked)
  }
})

test('requires independent verification by the correct legal lane for high-risk authority', () => {
  const samePerson = capacity()
  samePerson.capturedBy = verifier
  let result = buildConveyancerSigningCapacity(samePerson, { asOf: AS_OF })
  assert.equal(result.capacity.assessment.status, S.blocked)
  assert.ok(result.capacity.assessment.conflicts.some((item) => item.endsWith('_independent_verifier')))

  const wrongLane = capacity()
  wrongLane.evidence = wrongLane.evidence.map((item) => ({ ...item, verifiedBy: { role: R.bondAttorney, userId: 'bond-d1' } }))
  result = buildConveyancerSigningCapacity(wrongLane, { asOf: AS_OF })
  assert.equal(result.capacity.assessment.status, S.blocked)
  assert.ok(result.capacity.assessment.conflicts.some((item) => item.endsWith('_legal_verifier')))
})

test('enforces capture capabilities and lane ownership', () => {
  const denied = buildConveyancerSigningCapacity(capacity({ capturedBy: { role: R.client, userId: 'client-1' } }), { asOf: AS_OF })
  assert.equal(denied.ok, false)
  assert.ok(denied.errors.includes('capacity_capture_not_authorised'))
  assert.equal(canConveyancerSigningCapacityActor(R.secretary, CAP.capture), true)
  assert.equal(canConveyancerSigningCapacityActor(R.secretary, CAP.verify), false)
  assert.equal(canConveyancerSigningCapacityActor(R.client, CAP.view), false)
})

test('allows use only for the exact matter, lane, role and document scope', () => {
  const record = built()
  const ready = evaluateConveyancerSigningCapacityApplicability({ capacity: record, document: document(), asOf: AS_OF, expectedPartyRole: 'seller' })
  assert.equal(ready.usable, true)
  assert.equal(ready.decision, 'ready')

  const blocked = evaluateConveyancerSigningCapacityApplicability({ capacity: record, document: document({ transactionId: 'other', lane: 'bond', documentKind: 'notice', documentKey: 'other' }), asOf: AS_OF, expectedPartyRole: 'buyer' })
  assert.equal(blocked.usable, false)
  assert.ok(blocked.reasons.includes('document_transaction_mismatch'))
  assert.ok(blocked.reasons.includes('document_lane_mismatch'))
  assert.ok(blocked.reasons.includes('party_role_mismatch'))
  assert.ok(blocked.reasons.includes('document_outside_authority_scope'))
})

test('blocks authority outside its effective period', () => {
  const record = built()
  const result = evaluateConveyancerSigningCapacityApplicability({ capacity: record, document: document(), asOf: '2027-01-02T00:00:00.000Z' })
  assert.equal(result.usable, false)
  assert.ok(result.reasons.includes('capacity_blocked'))
  assert.ok(result.reasons.includes('authority_expired'))
})

test('detects fingerprint and assessment tampering', () => {
  const record = built()
  const forged = structuredClone(record)
  forged.scope.documentKeys.push('fraudulent_document')
  const result = validateConveyancerSigningCapacity(forged, { asOf: AS_OF })
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('signing_capacity_fingerprint_invalid'))

  const stale = structuredClone(record)
  stale.assessment.status = S.incomplete
  assert.ok(validateConveyancerSigningCapacity(stale, { asOf: AS_OF }).errors.includes('signing_capacity_assessment_stale'))
})

test('accepts append-only correction lineage with an exact previous binding', () => {
  const previous = built()
  const currentInput = capacity({
    capacityId: 'capacity:seller-1:v2',
    recordVersion: 2,
    previousCapacityId: previous.capacityId,
    previousFingerprint: previous.fingerprint,
    changeReason: 'Board resolution replaced with corrected resolution.',
  })
  const current = built(currentInput)
  assert.equal(validateConveyancerSigningCapacityLineage({ previous, current, asOf: AS_OF }).valid, true)

  const forged = structuredClone(current)
  forged.signatoryKey = 'different-signatory'
  delete forged.fingerprint
  const invalid = validateConveyancerSigningCapacityLineage({ previous, current: forged, asOf: AS_OF })
  assert.ok(invalid.errors.includes('capacity_lineage_identity_changed:signatoryKey'))
})

test('rejects version gaps and broken previous-record bindings', () => {
  const previous = built()
  const next = capacity({
    capacityId: 'capacity:seller-1:v3',
    recordVersion: 3,
    previousCapacityId: 'wrong',
    previousFingerprint: HASH,
    changeReason: 'Changed.',
  })
  const result = validateConveyancerSigningCapacityLineage({ previous, current: next, asOf: AS_OF })
  assert.ok(result.errors.includes('capacity_version_must_be_sequential'))
  assert.ok(result.errors.includes('previous_capacity_binding_invalid'))
})

test('normalises without mutating input or retaining party PII', () => {
  const input = capacity()
  const original = structuredClone(input)
  const result = buildConveyancerSigningCapacity(input, { asOf: AS_OF })
  assert.deepEqual(input, original)
  assert.equal(JSON.stringify(result.capacity).includes('fullName'), false)
  assert.equal(Object.hasOwn(result.capacity, 'email'), false)
  assert.equal(Object.hasOwn(result.capacity, 'identityNumber'), false)
})

console.log('D1 signing-capacity model tests passed.')
