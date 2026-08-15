import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANCELLATION_LANE_PHASE2_ACTION_AUDIT_VERSION,
  buildCancellationLanePhase2ActionAudit,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

const EXPECTED_HANDOFF_KEYS = [
  'transfer_to_cancellation_attorney',
  'cancellation_to_transfer_guarantee_alignment',
  'cancellation_to_lodgement_coordination',
  'cancellation_registration_close_out',
]

const audit = buildCancellationLanePhase2ActionAudit()

assert.equal(audit.version, CANCELLATION_LANE_PHASE2_ACTION_AUDIT_VERSION)
assert.equal(audit.status, 'ready_for_phase3')
assert.deepEqual(audit.structuralBlockers, [])
assert.equal(audit.transferTrigger.ownerRole, 'transfer_attorney')
assert.equal(audit.transferTrigger.requiredActions.length, 1)
assert.equal(audit.transferTrigger.activationPolicy, 'seller_existing_bond_or_explicit_cancellation_required')
assert.equal(audit.transferTrigger.requiredActions[0].stageKey, 'existing_bond_confirmed')
assert.equal(audit.transferTrigger.requiredActions[0].covered, true)
assert.equal(audit.attorney.ownerRole, 'cancellation_attorney')
assert.equal(audit.attorney.requiredActions.length, 19)
assert.equal(audit.attorney.requiredActions.every((action) => action.covered), true)
assert.equal(audit.attorney.nonLinearWorkflowPolicy, 'any_stage_can_be_updated_without_forcing_previous_stage_completion')
assert.equal(audit.actionSurfaces.length, 4)
assert.deepEqual(audit.handoffActionCoverage.map((handoff) => handoff.handoffKey), EXPECTED_HANDOFF_KEYS)
assert.equal(audit.handoffActionCoverage.every((handoff) => handoff.covered && handoff.actionIds.length), true)

const actionByStage = new Map(audit.attorney.requiredActions.map((action) => [action.stageKey, action]))
assert.equal(actionByStage.get('cancellation_existing_bond_confirmed')?.handoffKey, 'transfer_to_cancellation_attorney')
assert.equal(actionByStage.get('cancellation_figures_received')?.commandType, 'request_document')
assert.equal(actionByStage.get('figures_expiry_captured')?.handoffKey, 'cancellation_to_transfer_guarantee_alignment')
assert.equal(actionByStage.get('notice_penalty_risk_captured')?.commandType, 'add_note')
assert.equal(actionByStage.get('cancellation_guarantees_accepted')?.handoffKey, 'cancellation_to_transfer_guarantee_alignment')
assert.equal(actionByStage.get('seller_cancellation_documents_signed')?.commandType, 'request_document')
assert.equal(actionByStage.get('cancellation_lodgement_ready')?.handoffKey, 'cancellation_to_lodgement_coordination')
assert.equal(actionByStage.get('cancellation_registered')?.handoffKey, 'cancellation_registration_close_out')
assert.equal(actionByStage.get('settlement_proof_captured')?.commandType, 'add_note')
assert.equal(actionByStage.get('cancellation_close_out_complete')?.handoffKey, 'cancellation_registration_close_out')

const surfaceByKey = new Map(audit.actionSurfaces.map((surface) => [surface.key, surface]))
assert.equal(surfaceByKey.get('transfer_workflow_action_panel')?.supportsMutation, true)
assert.equal(surfaceByKey.get('cancellation_workflow_action_panel')?.executionMode, 'workflow_command')
assert.equal(surfaceByKey.get('cancellation_workflow_progress')?.executionMode, 'quick_stage_update')
assert.equal(surfaceByKey.get('cancellation_coordination_panel')?.executionMode, 'coordination_command')

const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase2-action-audit.md', import.meta.url), 'utf8')
assert.match(docSource, /Cancellation Lane Phase 2 Action Audit/)
assert.match(docSource, /1 transfer trigger action/)
assert.match(docSource, /19 cancellation attorney actions/)
assert.match(docSource, /ready_for_phase3/)
assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase2\.mjs/)

console.log('Attorney cancellation lane Phase 2 action audit verification passed.')
