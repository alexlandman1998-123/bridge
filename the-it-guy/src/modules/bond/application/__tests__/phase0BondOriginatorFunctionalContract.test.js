import assert from 'node:assert/strict'

import {
  BOND_ORIGINATOR_APPLICANT_STRUCTURES,
  BOND_ORIGINATOR_BUYER_ENTITY_TYPES,
  BOND_ORIGINATOR_EMPLOYMENT_TYPES,
  BOND_ORIGINATOR_FUNCTIONAL_CONTRACT,
  BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION,
  BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES,
  BOND_ORIGINATOR_PHASE0_BLOCKERS,
  buildBondOriginatorAcceptanceScenarioMatrix,
  buildBondOriginatorFunctionalContractAudit,
} from '../assurance/bondOriginatorFunctionalContract.js'
import {
  BUYER_ENTITY_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_VALUES,
} from '../flow/bondApplicationFlowContract.js'

assert.equal(BOND_ORIGINATOR_FUNCTIONAL_CONTRACT_VERSION, 'phase-0-v1')
assert.equal(BOND_ORIGINATOR_FUNCTIONAL_CONTRACT.jurisdiction, 'ZA')
assert.equal(BOND_ORIGINATOR_FUNCTIONAL_CONTRACT.scopeClaim, 'versioned_sa_baseline_with_originator_overlays')
assert.equal(BOND_ORIGINATOR_FUNCTIONAL_CONTRACT.productionCertification, 'blocked_until_acceptance_audit_passes')

assert.deepEqual(BOND_ORIGINATOR_APPLICANT_STRUCTURES, ['sole', 'joint', 'surety'])
assert.deepEqual(
  BOND_ORIGINATOR_BUYER_ENTITY_TYPES,
  BUYER_ENTITY_TYPE_OPTIONS.map((option) => option.value),
)
assert.deepEqual(BOND_ORIGINATOR_EMPLOYMENT_TYPES, Object.keys(EMPLOYMENT_TYPE_VALUES))

const guaranteeKeys = BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES.map((guarantee) => guarantee.key)
assert.equal(new Set(guaranteeKeys).size, guaranteeKeys.length)
assert.deepEqual(guaranteeKeys, [
  'canonical_application_interpretation',
  'originator_requirement_profiles',
  'idempotent_document_reconciliation',
  'participant_and_entity_completeness',
  'canonical_document_workspace',
  'submission_readiness_gate',
  'originator_branded_download',
  'sa_originator_acceptance_matrix',
  'live_flow_smoke_and_promotion',
])

const scenarios = buildBondOriginatorAcceptanceScenarioMatrix()
assert.equal(scenarios.length, 54)
assert.equal(new Set(scenarios.map((scenario) => scenario.key)).size, scenarios.length)
assert.ok(scenarios.some((scenario) => scenario.key === 'sole:individual:permanent'))
assert.ok(scenarios.some((scenario) => scenario.key === 'joint:company:selfEmployed'))
assert.ok(scenarios.some((scenario) => scenario.key === 'surety:trust:commission'))
scenarios.forEach((scenario) => assert.deepEqual(scenario.requiredGuarantees, guaranteeKeys))

assert.deepEqual(BOND_ORIGINATOR_PHASE0_BLOCKERS.map((blocker) => blocker.key), [
  'joint_applicant_financial_capture',
  'company_participant_capture',
  'trust_participant_capture',
  'guided_surety_completion',
])
BOND_ORIGINATOR_PHASE0_BLOCKERS.forEach((blocker) => {
  assert.equal(blocker.blocksProduction, true)
  assert.ok(blocker.sourcePaths.length > 0)
  assert.ok(Number.isInteger(blocker.implementationPhase))
})

const audit = buildBondOriginatorFunctionalContractAudit()
assert.equal(audit.status, 'contract_locked')
assert.deepEqual(audit.issues, [])
assert.deepEqual(audit.metrics, {
  guaranteeCount: 9,
  knownBlockerCount: 4,
  scenarioCount: 54,
  issueCount: 0,
})

const invalidAudit = buildBondOriginatorFunctionalContractAudit({
  contract: {
    ...BOND_ORIGINATOR_FUNCTIONAL_CONTRACT,
    guarantees: [
      BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES[0],
      BOND_ORIGINATOR_FUNCTIONAL_GUARANTEES[0],
    ],
    scopeClaim: 'works_for_every_originator_without_profile_validation',
  },
})
assert.equal(invalidAudit.status, 'contract_invalid')
assert.ok(invalidAudit.issues.some((issue) => issue.code === 'duplicate_guarantee_key'))
assert.ok(invalidAudit.issues.some((issue) => issue.code === 'unsafe_scope_claim'))

console.log('Phase 0 bond originator functional contract passed')
