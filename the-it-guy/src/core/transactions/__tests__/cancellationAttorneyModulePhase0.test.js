import assert from 'node:assert/strict'
import {
  CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS,
  CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT,
  CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION,
  CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE,
  CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS,
  CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY,
  buildCancellationAttorneyPhase0BaselineReport,
  listCancellationAttorneyPhase0ExitGateFailures,
} from '../cancellationAttorneyModulePhase0.js'

assert.equal(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.role, 'cancellation_attorney')
assert.equal(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.laneKey, 'cancellation')
assert.equal(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.appointmentAuthority, 'existing_lending_bank')
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.owns.includes('cancellation_figures_request_and_validity'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.owns.includes('guarantee_requirements_and_acceptance'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.owns.includes('settlement_reconciliation_and_closeout'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.coordinatesWith.includes('transfer_attorney'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.coordinatesWith.includes('bond_attorney'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.doesNotOwn.includes('transfer_document_preparation'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.doesNotOwn.includes('buyer_bond_approval_or_bank_conditions'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RESPONSIBILITY_BOUNDARY.doesNotOwn.includes('approved_legal_wording_without_firm_or_bank_governance'))

assert.equal(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.id, 'standard_individual_freehold_existing_bond_cancellation')
assert.equal(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction.seller_has_existing_bond, true)
assert.equal(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.transaction.cancellation_required, true)
assert.ok(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.firstPilot.included.includes('manual_cancellation_figures_capture'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.heldForLater.includes('multiple_existing_bonds_or_substituted_security'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_PILOT_SCOPE.heldForLater.includes('automated_existing_lender_or_deeds_office_integrations'))

const automationStrategies = new Set(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.map((item) => item.strategy))
assert.deepEqual([...automationStrategies].sort(), ['generate_now', 'ingest_only', 'template_controlled'])
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'generate_now').length >= 9)
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'template_controlled').length >= 4)
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.filter((item) => item.strategy === 'ingest_only').length >= 6)

for (const item of CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION) {
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

assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.some((item) => item.id === 'cancellation_figures_request_cover' && item.strategy === 'generate_now'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.some((item) => item.id === 'bank_cancellation_documents' && item.strategy === 'template_controlled'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.some((item) => item.id === 'cancellation_figures' && item.strategy === 'ingest_only'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DOCUMENT_AUTOMATION.some((item) => item.id === 'cancellation_registration_evidence' && item.strategy === 'ingest_only'))

assert.ok(CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.includes('cancellation_bank'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.includes('cancellation_figures_expiry_date'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.includes('guarantee_acceptance_status'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.includes('settlement_payment_reference'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_DATA_CONTRACT.length >= 20)

assert.ok(CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS.includes('figures_expiry_risk_count'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS.includes('guarantee_variance_count'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS.includes('time_from_settlement_to_closeout'))
assert.ok(CANCELLATION_ATTORNEY_PHASE0_BASELINE_METRICS.length >= 10)

assert.deepEqual(
  CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.map((item) => item.id),
  [
    'cancellation_lane_usability_not_simplified',
    'cancellation_data_contract_missing',
    'cancellation_pack_workspace_missing',
    'cancellation_operational_generator_missing',
    'cancellation_figures_register_missing',
    'guarantee_coordination_workspace_missing',
    'cancellation_document_signing_workspace_missing',
    'cancellation_lodgement_registration_evidence_not_packet_bound',
    'settlement_closeout_packet_missing',
    'cancellation_release_certification_missing',
  ],
)
assert.ok(CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.every((item) => item.exitEvidence && item.targetPhase >= 1))
assert.equal(CANCELLATION_ATTORNEY_PHASE0_RELEASE_BLOCKERS.at(-1).targetPhase, 10)

const report = buildCancellationAttorneyPhase0BaselineReport()
assert.equal(report.version, 'cancellation_attorney_module_phase0_v1')
assert.equal(report.readyForPhase1, true, JSON.stringify(report, null, 2))
assert.equal(report.missingStageKeys.length, 0, JSON.stringify(report.missingStageKeys, null, 2))
assert.equal(report.missingRequirementIds.length, 0, JSON.stringify(report.missingRequirementIds, null, 2))
assert.equal(report.missingStageDocumentKeys.length, 0, JSON.stringify(report.missingStageDocumentKeys, null, 2))
assert.equal(report.stageCount, 19)
assert.ok(report.cancellationRequirementIds.includes('cancellation_instruction'))
assert.ok(report.cancellationRequirementIds.includes('existing_bond_account_details'))
assert.ok(report.cancellationRequirementIds.includes('bank_cancellation_documents'))
assert.ok(report.cancellationRequirementIds.includes('proof_of_settlement'))
assert.ok(report.stageDocumentKeys.includes('seller_bond_cancellation_information'))
assert.ok(report.stageDocumentKeys.includes('seller_signed_cancellation_documents'))
assert.ok(report.richRequirementIdsNotOnStages.includes('bank_cancellation_documents'))
assert.ok(report.richRequirementIdsNotOnStages.includes('proof_of_settlement'))
assert.ok(report.signingRequirementIds.includes('seller_cancellation_documents_signature'))
assert.ok(['not_started', 'started'].includes(report.generatorCoverageStatus))
assert.equal(report.releaseBlockerCount, 10)

const failures = listCancellationAttorneyPhase0ExitGateFailures()
assert.deepEqual(failures, [], JSON.stringify(failures, null, 2))

console.log(`Cancellation attorney module Phase 0 baseline passed (${report.stageCount} stages, ${report.cancellationRequirementIds.length} cancellation requirements).`)
