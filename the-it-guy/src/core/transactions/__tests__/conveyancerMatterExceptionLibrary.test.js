import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES, MATTER_PLAN_STATUSES } from '../conveyancerMatterPlanContract.js'
import { MATTER_EXCEPTION_CATEGORIES, MATTER_EXCEPTION_SEVERITIES, MATTER_EXCEPTION_SOURCE_TYPES } from '../conveyancerMatterExceptionContract.js'
import {
  CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS,
  CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION,
  MATTER_EXCEPTION_TRIGGER_TYPES,
  buildConveyancerMatterExceptionFromLibrary,
  getConveyancerMatterExceptionDefinition,
  listConveyancerMatterExceptionDefinitions,
  validateConveyancerMatterExceptionLibrary,
} from '../conveyancerMatterExceptionLibrary.js'
import { generateConveyancerMatterPlan } from '../../../services/attorneyWorkflow/conveyancerMatterPlanGenerator.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const detectedAt = '2026-07-15T08:00:00.000Z'

function transaction(overrides = {}) {
  return {
    id: 'tx-b2-1',
    organisation_id: 'org-b2-1',
    finance_type: 'cash',
    transaction_type: 'private_sale',
    buyer_entity_type: 'individual',
    seller_entity_type: 'individual',
    seller_has_existing_bond: false,
    property_tenure: 'freehold',
    ...overrides,
  }
}

function activePlan(source = transaction()) {
  const generated = generateConveyancerMatterPlan({ transaction: source, generatedAt: detectedAt })
  assert.equal(generated.valid, true)
  return {
    ...structuredClone(generated.plan),
    status: MATTER_PLAN_STATUSES.active,
    activatedAt: detectedAt,
  }
}

function build(definitionKey, plan = activePlan(), overrides = {}) {
  return buildConveyancerMatterExceptionFromLibrary({ definitionKey, plan, detectedAt, ...overrides })
}

test('ships a valid, immutable and uniquely keyed initial library', () => {
  const validation = validateConveyancerMatterExceptionLibrary()
  assert.equal(validation.valid, true)
  assert.ok(validation.definitionCount >= 20)
  assert.equal(Object.isFrozen(CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS), true)
  assert.equal(new Set(CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS.map((item) => item.key)).size, validation.definitionCount)
  assert.ok(CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS.every((item) => item.libraryVersion === CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION))
})

test('covers the core transfer lifecycle and legal-lane exceptions', () => {
  const keys = new Set(CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS.map((item) => item.key))
  ;[
    'signed_transfer_instruction_missing',
    'party_fica_incomplete',
    'entity_authority_document_missing',
    'bond_attorney_appointment_outstanding',
    'cancellation_attorney_appointment_outstanding',
    'municipal_clearance_outstanding',
    'tax_or_vat_position_unconfirmed',
    'signature_pack_incomplete_or_defective',
    'deeds_office_rejection',
    'post_registration_reconciliation_outstanding',
  ].forEach((item) => assert.ok(keys.has(item), item))
})

test('finds definitions by key and operational filters', () => {
  const definition = getConveyancerMatterExceptionDefinition(' Bond Attorney Appointment Outstanding ')
  assert.equal(definition.key, 'bond_attorney_appointment_outstanding')

  const critical = listConveyancerMatterExceptionDefinitions({ severity: MATTER_EXCEPTION_SEVERITIES.critical })
  assert.ok(critical.length >= 4)
  assert.ok(critical.every((item) => item.impact.blocksMatter || item.impact.blocksAction))

  const accounts = listConveyancerMatterExceptionDefinitions({ ownerRole: MATTER_PLAN_OWNER_ROLES.accounts })
  assert.ok(accounts.some((item) => item.key === 'transfer_cost_payment_outstanding'))
  assert.ok(accounts.every((item) => item.category === MATTER_EXCEPTION_CATEGORIES.financial))

  const deadlines = listConveyancerMatterExceptionDefinitions({ triggerType: MATTER_EXCEPTION_TRIGGER_TYPES.deadline })
  assert.ok(deadlines.some((item) => item.key === 'registration_external_delay'))
})

test('builds a valid B1 exception with deterministic SLA and provenance', () => {
  const result = build('party_fica_incomplete')
  assert.equal(result.valid, true)
  assert.equal(result.exception.code, 'party_fica_incomplete')
  assert.equal(result.exception.actionKey, 'verify_parties')
  assert.equal(result.exception.sla.respondBy, '2026-07-15T16:00:00.000Z')
  assert.equal(result.exception.sla.resolveBy, '2026-07-17T08:00:00.000Z')
  assert.equal(result.exception.provenance.libraryVersion, CONVEYANCER_MATTER_EXCEPTION_LIBRARY_VERSION)
  assert.match(result.exception.deduplicationKey, /party_fica_incomplete/)
})

test('uses scope keys to separate repeatable instances without duplicating the same issue', () => {
  const first = build('party_fica_incomplete', activePlan(), { scopeKey: 'buyer-1:id-document' })
  const replay = build('party_fica_incomplete', activePlan(), { scopeKey: 'buyer-1:id-document' })
  const second = build('party_fica_incomplete', activePlan(), { scopeKey: 'seller-1:id-document' })
  assert.equal(first.exception.deduplicationKey, replay.exception.deduplicationKey)
  assert.equal(first.exception.exceptionId, replay.exception.exceptionId)
  assert.notEqual(first.exception.deduplicationKey, second.exception.deduplicationKey)
})

test('does not mutate the active matter plan while building an exception', () => {
  const plan = activePlan()
  const before = structuredClone(plan)
  const result = build('signed_transfer_instruction_missing', plan)
  assert.equal(result.valid, true)
  assert.deepEqual(plan, before)
})

test('enforces conditional bank-appointed bond and cancellation lanes', () => {
  const cash = activePlan()
  const unavailable = build('bond_attorney_appointment_outstanding', cash)
  assert.equal(unavailable.valid, false)
  assert.deepEqual(unavailable.errors, ['exception_definition_not_applicable'])

  const bond = activePlan(transaction({ finance_type: 'bond', seller_has_existing_bond: true }))
  const bondResult = build('bond_attorney_appointment_outstanding', bond)
  const cancellationResult = build('cancellation_attorney_appointment_outstanding', bond)
  assert.equal(bondResult.valid, true)
  assert.equal(cancellationResult.valid, true)
  assert.deepEqual(bondResult.exception.impact.affectedRoles, [MATTER_PLAN_OWNER_ROLES.transferAttorney, MATTER_PLAN_OWNER_ROLES.bondAttorney])
})

test('enforces sectional-title applicability without inventing a clearance', () => {
  const freehold = build('sectional_title_levy_clearance_outstanding', activePlan())
  assert.equal(freehold.valid, false)

  const sectionalPlan = activePlan(transaction({ property_tenure: 'sectional_title' }))
  const sectional = build('sectional_title_levy_clearance_outstanding', sectionalPlan)
  assert.equal(sectional.valid, true)
  assert.equal(sectional.exception.actionKey, 'obtain_clearances')
})

test('opens critical system detections with immediate auditable escalation', () => {
  const result = build('deeds_office_rejection')
  assert.equal(result.valid, true)
  assert.equal(result.exception.severity, MATTER_EXCEPTION_SEVERITIES.critical)
  assert.equal(result.exception.impact.blocksMatter, true)
  assert.equal(result.exception.escalation.level, 1)
  assert.equal(result.exception.escalation.escalatedBy.role, MATTER_PLAN_OWNER_ROLES.system)
  assert.equal(result.exception.sla.respondBy, '2026-07-15T10:00:00.000Z')
})

test('requires an authorised escalation actor for a client-reported critical issue', () => {
  const withoutEscalation = build('conflicting_signing_authority', activePlan(transaction({ buyer_entity_type: 'company' })), {
    detectedBy: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
    sourceType: MATTER_EXCEPTION_SOURCE_TYPES.userReport,
  })
  assert.equal(withoutEscalation.valid, false)
  assert.ok(withoutEscalation.errors.includes('critical_exception_escalation_required'))

  const escalated = build('conflicting_signing_authority', activePlan(transaction({ buyer_entity_type: 'company' })), {
    detectedBy: { role: MATTER_PLAN_OWNER_ROLES.client, userId: 'buyer-1' },
    escalationActor: { role: MATTER_PLAN_OWNER_ROLES.firmManager, userId: 'manager-1' },
    sourceType: MATTER_EXCEPTION_SOURCE_TYPES.userReport,
  })
  assert.equal(escalated.valid, true)
  assert.equal(escalated.exception.escalation.escalatedBy.role, MATTER_PLAN_OWNER_ROLES.firmManager)
})

test('rejects unknown definitions, inactive plans and invalid detection times', () => {
  assert.deepEqual(buildConveyancerMatterExceptionFromLibrary({ definitionKey: 'not_real' }).errors, ['unknown_exception_definition'])

  const draft = activePlan()
  draft.status = MATTER_PLAN_STATUSES.draft
  draft.activatedAt = null
  assert.deepEqual(build('party_fica_incomplete', draft).errors, ['active_plan_required'])
  assert.deepEqual(buildConveyancerMatterExceptionFromLibrary({
    definitionKey: 'party_fica_incomplete',
    plan: activePlan(),
    detectedAt: 'not-a-date',
  }).errors, ['valid_detected_at_required'])
})

test('library validation rejects duplicate and structurally unsafe definitions', () => {
  const source = CONVEYANCER_MATTER_EXCEPTION_DEFINITIONS[0]
  const invalid = validateConveyancerMatterExceptionLibrary([
    source,
    {
      ...source,
      title: '',
      actionKey: 'invented_action',
      appliesWhen: { inventedFact: true },
      affectedRoles: ['invented_role'],
    },
  ])
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes('duplicate_definition_key'))
  assert.ok(invalid.errors.includes('duplicate_trigger_signature'))
  assert.ok(invalid.errors.some((item) => item.endsWith(':title_required')))
  assert.ok(invalid.errors.some((item) => item.endsWith(':unknown_action_key')))
  assert.ok(invalid.errors.some((item) => item.endsWith(':invalid_affected_role')))
  assert.ok(invalid.errors.some((item) => item.endsWith(':unknown_applicability_fact')))
})

console.log('conveyancer matter exception B2 initial library tests passed')
