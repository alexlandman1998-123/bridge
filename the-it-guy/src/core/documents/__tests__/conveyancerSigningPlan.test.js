import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_SIGNING_AUTHORITY_BASES as A,
  CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
  CONVEYANCER_SIGNING_CAPACITY_TYPES as C,
  CONVEYANCER_SIGNING_PARTY_TYPES as P,
  buildConveyancerSigningCapacity,
  getConveyancerSigningCapacityDefinition,
} from '../conveyancerSigningCapacityModel.js'
import {
  CONVEYANCER_SIGNING_PLAN_METHODS as METHOD,
  CONVEYANCER_SIGNING_PLAN_QUORUM_MODES as QUORUM,
  CONVEYANCER_SIGNING_PLAN_ROUTING_MODES as ROUTING,
  CONVEYANCER_SIGNING_PLAN_STATUSES as STATUS,
  CONVEYANCER_SIGNING_PLAN_VERSION,
  buildConveyancerSigningPlan,
  buildConveyancerSigningPlanC7SignerContract,
  validateConveyancerSigningPlan,
  validateConveyancerSigningPlanLineage,
} from '../conveyancerSigningPlan.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const AS_OF = '2026-07-15T12:00:00.000Z'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)
const preparer = { role: R.secretary, userId: 'secretary-d2' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d2' }

function document(overrides = {}) {
  return {
    documentId: 'document-d2-1',
    planId: 'matter-plan-d2',
    planVersion: 2,
    transactionId: 'transaction-d2',
    organisationId: 'organisation-d2',
    actionKey: 'prepare_transfer_documents',
    documentKey: 'transfer_power',
    documentKind: 'declaration',
    lane: 'transfer',
    contentFingerprint: HASH_A,
    provenanceFingerprint: HASH_B,
    renderModel: {
      signingFields: [{ fieldKey: 'seller_signature', fieldType: 'signature', signerRole: 'seller', required: true, order: 1 }],
    },
    ...overrides,
  }
}

function authorityEvidence(requirementKey, signatoryKey) {
  return {
    requirementKey,
    referenceId: `evidence:${signatoryKey}:${requirementKey}`,
    evidenceHash: HASH_C,
    status: 'verified',
    issuedAt: '2026-06-01T08:00:00.000Z',
    expiresAt: null,
    verifiedAt: '2026-07-14T09:00:00.000Z',
    verifiedBy: { role: R.transferAttorney, userId: 'capacity-verifier-d2' },
    source: 'matter_record',
  }
}

function capacityRecord({
  signatoryKey = 'seller-signatory-1',
  partyKey = 'seller-party',
  partyRole = 'seller',
  partyType = P.company,
  capacityType = C.director,
  authorityBasis = A.boardResolution,
  referenceHash = HASH_C,
  expiresAt = '2026-12-31T23:59:59.000Z',
  documentKey = 'transfer_power',
} = {}) {
  const definition = getConveyancerSigningCapacityDefinition(capacityType)
  const result = buildConveyancerSigningCapacity({
    modelVersion: CONVEYANCER_SIGNING_CAPACITY_MODEL_VERSION,
    capacityId: `capacity:${signatoryKey}:v1`,
    recordVersion: 1,
    planId: 'matter-plan-d2',
    planVersion: 2,
    transactionId: 'transaction-d2',
    organisationId: 'organisation-d2',
    lane: 'transfer',
    partyKey,
    partyRole,
    partyType,
    signatoryKey,
    signatoryReferenceHash: referenceHash,
    capacityType,
    authorityBasis,
    scope: {
      documentKinds: ['declaration'],
      documentKeys: [documentKey],
      powers: ['sign_documents'],
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveUntil: expiresAt,
    },
    evidence: definition.requiredEvidence.map((item) => authorityEvidence(item, signatoryKey)),
    capturedAt: '2026-07-14T08:00:00.000Z',
    capturedBy: { role: R.secretary, userId: 'capacity-capturer-d2' },
  }, { asOf: AS_OF })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.capacity
}

function participant(capacity, overrides = {}) {
  return {
    participantKey: `participant:${capacity.signatoryKey}`,
    signerKey: capacity.signatoryKey,
    documentSignerRole: 'seller',
    partyKey: capacity.partyKey,
    partyRole: capacity.partyRole,
    signerReferenceHash: capacity.signatoryReferenceHash,
    capacityId: capacity.capacityId,
    signingOrder: 1,
    required: true,
    allowedMethods: [METHOD.electronic, METHOD.wetInk],
    ...overrides,
  }
}

function planInput(capacities, overrides = {}) {
  return {
    version: CONVEYANCER_SIGNING_PLAN_VERSION,
    signingPlanId: 'signing-plan-d2-v1',
    revision: 1,
    document: document(),
    routingMode: ROUTING.parallel,
    participants: capacities.map((item) => participant(item)),
    preparedAt: '2026-07-15T10:00:00.000Z',
    preparedBy: preparer,
    approval: {
      approvedAt: '2026-07-15T11:00:00.000Z',
      approvedBy: attorney,
      decisionReferenceId: 'decision:d2:1',
    },
    ...overrides,
  }
}

function built(capacities = [capacityRecord()], overrides = {}) {
  const result = buildConveyancerSigningPlan(planInput(capacities, overrides), { capacityRecords: capacities, asOf: AS_OF })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.plan
}

test('builds an approved ready plan with an exact D1 capacity binding', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity]), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.code, STATUS.ready)
  assert.equal(result.plan.participants[0].capacityBinding.capacityFingerprint, capacity.fingerprint)
  assert.match(result.plan.fingerprint, /^fnv1a_[a-f0-9]{8}$/)
  assert.equal(Object.isFrozen(result.plan), true)
})

test('marks a complete unapproved plan for legal review', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity], { approval: {} }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.reviewRequired)
})

test('marks a required signing field without a matching signer incomplete', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity], {
    participants: [participant(capacity, { documentSignerRole: 'buyer' })],
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.incomplete)
  assert.ok(result.plan.assessment.missing.includes('required_signing_field_unassigned:seller_signature'))
})

test('marks a participant whose capacity record is unavailable incomplete', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity]), { capacityRecords: [], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.incomplete)
  assert.ok(result.plan.assessment.missing.includes('capacity_record_missing:seller_signatory_1'))
})

test('blocks an expired or otherwise unusable capacity', () => {
  const expired = capacityRecord({ expiresAt: '2026-07-14T00:00:00.000Z' })
  const result = buildConveyancerSigningPlan(planInput([expired]), { capacityRecords: [expired], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.blocked)
  assert.ok(result.plan.assessment.blockers.includes('capacity_not_usable:seller_signatory_1'))
})

test('blocks signer, party and reference mismatches against D1', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity], {
    participants: [participant(capacity, { signerReferenceHash: HASH_A })],
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.plan.assessment.status, STATUS.blocked)
  assert.ok(result.plan.assessment.blockers.includes('capacity_signer_binding_mismatch:seller_signatory_1'))
})

test('supports multiple signers sharing a required role with all-sign quorum', () => {
  const first = capacityRecord()
  const second = capacityRecord({ signatoryKey: 'seller-signatory-2', referenceHash: HASH_B })
  const plan = built([first, second])
  const assignment = plan.fieldAssignments[0]
  assert.deepEqual(assignment.signerKeys, ['seller_signatory_1', 'seller_signatory_2'])
  assert.equal(assignment.quorum.mode, QUORUM.all)
  assert.equal(assignment.quorum.minimumRequired, 2)
})

test('supports explicit at-least quorum for trustees or joint representatives', () => {
  const first = capacityRecord()
  const second = capacityRecord({ signatoryKey: 'seller-signatory-2', referenceHash: HASH_B })
  const result = buildConveyancerSigningPlan(planInput([first, second], {
    fieldAssignments: [{ fieldKey: 'seller_signature', signerKeys: [first.signatoryKey, second.signatoryKey], quorum: { mode: QUORUM.atLeast, minimumRequired: 1 } }],
  }), { capacityRecords: [first, second], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.ready)
})

test('blocks a field assignment whose signer role cannot cover the field', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity], {
    participants: [participant(capacity, { documentSignerRole: 'buyer' })],
    fieldAssignments: [{ fieldKey: 'seller_signature', signerKeys: [capacity.signatoryKey], quorum: { mode: QUORUM.any } }],
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.plan.assessment.status, STATUS.blocked)
  assert.ok(result.plan.assessment.blockers.includes('field_quorum_not_covered:seller_signature'))
})

test('enforces parallel and sequential order semantics', () => {
  const first = capacityRecord()
  const second = capacityRecord({ signatoryKey: 'seller-signatory-2', referenceHash: HASH_B })
  let result = buildConveyancerSigningPlan(planInput([first, second], {
    participants: [participant(first), participant(second, { signingOrder: 2 })],
  }), { capacityRecords: [first, second], asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('parallel_plan_requires_single_order_group'))

  result = buildConveyancerSigningPlan(planInput([first, second], {
    routingMode: ROUTING.sequential,
    participants: [participant(first), participant(second)],
  }), { capacityRecords: [first, second], asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('sequential_plan_requires_unique_signing_orders'))
})

test('supports mixed contiguous signing groups', () => {
  const first = capacityRecord()
  const second = capacityRecord({ signatoryKey: 'seller-signatory-2', referenceHash: HASH_B })
  const result = buildConveyancerSigningPlan(planInput([first, second], {
    routingMode: ROUTING.mixed,
    participants: [participant(first), participant(second, { signingOrder: 2 })],
  }), { capacityRecords: [first, second], asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.plan.assessment.status, STATUS.ready)
})

test('rejects unsupported signing methods and invalid quorums', () => {
  const capacity = capacityRecord()
  let result = buildConveyancerSigningPlan(planInput([capacity], {
    participants: [participant(capacity, { allowedMethods: ['voice_signature'] })],
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.ok(result.errors.includes('participant_signing_methods_invalid:seller_signatory_1'))

  result = buildConveyancerSigningPlan(planInput([capacity], {
    fieldAssignments: [{ fieldKey: 'seller_signature', signerKeys: [capacity.signatoryKey], quorum: { mode: QUORUM.atLeast, minimumRequired: 2 } }],
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.ok(result.errors.includes('field_quorum_invalid:seller_signature'))
})

test('requires approval from the correct legal lane', () => {
  const capacity = capacityRecord()
  const result = buildConveyancerSigningPlan(planInput([capacity], {
    approval: { approvedAt: '2026-07-15T11:00:00.000Z', approvedBy: { role: R.bondAttorney, userId: 'bond-d2' }, decisionReferenceId: 'wrong-lane' },
  }), { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('signing_plan_approval_invalid'))
})

test('projects an exact C7 signer contract only from a ready plan', () => {
  const capacity = capacityRecord()
  const plan = built([capacity])
  const projection = buildConveyancerSigningPlanC7SignerContract(plan, { capacityRecords: [capacity], asOf: AS_OF })
  assert.equal(projection.ok, true)
  assert.deepEqual(projection.signers, [{
    signerKey: 'seller_signatory_1',
    signerRole: 'seller',
    signerReferenceHash: HASH_C,
    signingOrder: 1,
    required: true,
    allowedMethods: ['electronic', 'wet_ink'],
  }])

  const reviewPlan = buildConveyancerSigningPlan(planInput([capacity], { approval: {} }), { capacityRecords: [capacity], asOf: AS_OF }).plan
  assert.equal(buildConveyancerSigningPlanC7SignerContract(reviewPlan, { capacityRecords: [capacity], asOf: AS_OF }).code, 'signing_plan_review_required')
})

test('detects document, participant, assessment and fingerprint tampering', () => {
  const capacity = capacityRecord()
  const plan = built([capacity])
  const forged = structuredClone(plan)
  forged.participants[0].signingOrder = 2
  const result = validateConveyancerSigningPlan(forged, { capacityRecords: [capacity], asOf: AS_OF })
  assert.ok(result.errors.includes('signing_plan_fingerprint_invalid'))

  const stale = structuredClone(plan)
  stale.assessment.status = STATUS.incomplete
  assert.ok(validateConveyancerSigningPlan(stale, { capacityRecords: [capacity], asOf: AS_OF }).errors.includes('signing_plan_assessment_stale'))
})

test('supports append-only signing-plan corrections bound to the previous plan', () => {
  const capacity = capacityRecord()
  const previous = built([capacity])
  const current = built([capacity], {
    signingPlanId: 'signing-plan-d2-v2',
    revision: 2,
    previousSigningPlanId: previous.signingPlanId,
    previousFingerprint: previous.fingerprint,
    changeReason: 'Changed signer method after legal review.',
    participants: [participant(capacity, { allowedMethods: [METHOD.wetInk] })],
  })
  assert.equal(validateConveyancerSigningPlanLineage({ previous, current, capacityRecords: [capacity], asOf: AS_OF }).valid, true)

  const broken = structuredClone(current)
  broken.document.documentId = 'other-document'
  delete broken.fingerprint
  const invalid = validateConveyancerSigningPlanLineage({ previous, current: broken, capacityRecords: [capacity], asOf: AS_OF })
  assert.ok(invalid.errors.includes('signing_plan_document_identity_changed:documentId'))
})

test('does not mutate inputs or retain signer PII', () => {
  const capacity = capacityRecord()
  const input = planInput([capacity])
  input.participants[0].fullName = 'Private Person'
  input.participants[0].email = 'private@example.com'
  const before = structuredClone(input)
  const result = buildConveyancerSigningPlan(input, { capacityRecords: [capacity], asOf: AS_OF })
  assert.deepEqual(input, before)
  const serialized = JSON.stringify(result.plan)
  assert.equal(serialized.includes('Private Person'), false)
  assert.equal(serialized.includes('private@example.com'), false)
})

console.log('D2 signing-plan tests passed.')
