import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE0_BASELINE_METRICS,
  BOND_ATTORNEY_PHASE0_DATA_CONTRACT,
  BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION,
  BOND_ATTORNEY_PHASE0_PILOT_SCOPE,
  BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS,
  BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY,
  buildBondAttorneyPhase0BaselineReport,
  listBondAttorneyPhase0ExitGateFailures,
} from '../bondAttorneyModulePhase0.js'

assert.equal(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.role, 'bond_attorney')
assert.equal(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.appointmentAuthority, 'new_lending_bank')
assert.ok(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.owns.includes('bank_conditions_and_requirements'))
assert.ok(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.owns.includes('guarantees_and_transfer_handoff'))
assert.ok(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.doesNotOwn.includes('transfer_document_preparation'))
assert.ok(BOND_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.doesNotOwn.includes('approved_legal_wording_without_firm_or_bank_governance'))

assert.equal(BOND_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.id, 'standard_individual_freehold_bank_bond')
assert.equal(BOND_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction.finance_type, 'bond')
assert.ok(BOND_ATTORNEY_PHASE0_PILOT_SCOPE.heldForLater.includes('company_or_trust_buyer_authority'))
assert.ok(BOND_ATTORNEY_PHASE0_PILOT_SCOPE.heldForLater.includes('automated_bank_or_deeds_office_integrations'))

const automationStrategies = new Set(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.map((item) => item.strategy))
assert.deepEqual([...automationStrategies].sort(), ['generate_now', 'ingest_only', 'template_controlled'])
assert.ok(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'generate_now').length >= 8)
assert.ok(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'template_controlled').length >= 4)
assert.ok(BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'ingest_only').length >= 4)

for (const item of BOND_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION) {
  assert.ok(item.id)
  assert.ok(item.label)
  assert.ok(item.purpose)
  assert.ok(item.targetPhase >= 3)
  assert.equal(item.generatedStatus, item.strategy === 'ingest_only' ? 'not_generated' : 'draft_until_reviewed')
  if (item.strategy === 'template_controlled') {
    assert.match(item.requiredApproval, /approval/)
    assert.notEqual(item.requiredApproval, 'firm_operational_approval')
  }
  if (item.strategy === 'ingest_only') {
    assert.equal(item.requiredApproval, 'source_evidence_required')
  }
}

assert.ok(BOND_ATTORNEY_PHASE0_DATA_CONTRACT.includes('bank_reference'))
assert.ok(BOND_ATTORNEY_PHASE0_DATA_CONTRACT.includes('property_legal_description'))
assert.ok(BOND_ATTORNEY_PHASE0_DATA_CONTRACT.includes('approval_to_lodge_reference'))
assert.ok(BOND_ATTORNEY_PHASE0_DATA_CONTRACT.length >= 10)

assert.ok(BOND_ATTORNEY_PHASE0_BASELINE_METRICS.includes('open_bank_condition_count'))
assert.ok(BOND_ATTORNEY_PHASE0_BASELINE_METRICS.includes('bank_submission_rejection_count'))
assert.ok(BOND_ATTORNEY_PHASE0_BASELINE_METRICS.length >= 8)

assert.deepEqual(
  BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((item) => item.id),
  [
    'bond_pack_workspace_missing',
    'bond_operational_generator_missing',
    'bank_conditions_not_structured',
    'signing_workspace_missing',
    'legal_instrument_templates_not_approved',
    'lodgement_registration_evidence_not_packet_bound',
    'bank_and_deeds_integrations_absent',
  ],
)
assert.ok(BOND_ATTORNEY_PHASE0_RELEASE_BLOCKERS.every((item) => item.exitEvidence && item.targetPhase > 0))

const report = buildBondAttorneyPhase0BaselineReport()
assert.equal(report.version, 'bond_attorney_module_phase0_v1')
assert.equal(report.readyForPhase1, true, JSON.stringify(report, null, 2))
assert.equal(report.missingStageKeys.length, 0, JSON.stringify(report.missingStageKeys, null, 2))
assert.equal(report.missingRequirementIds.length, 0, JSON.stringify(report.missingRequirementIds, null, 2))
assert.ok(report.stageCount >= 17)
assert.ok(report.bondRequirementIds.includes('bond_instruction'))
assert.ok(report.bondRequirementIds.includes('bond_documents'))
assert.ok(report.signingRequirementIds.includes('buyer_bond_documents_signature'))
assert.ok(['not_started', 'started'].includes(report.generatorCoverageStatus))

const failures = listBondAttorneyPhase0ExitGateFailures()
assert.deepEqual(failures, [], JSON.stringify(failures, null, 2))

console.log(`Bond attorney module Phase 0 baseline passed (${report.stageCount} stages, ${report.bondRequirementIds.length} bond requirements).`)
