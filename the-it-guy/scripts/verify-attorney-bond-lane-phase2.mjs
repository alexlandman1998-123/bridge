import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  BOND_LANE_PHASE2_ACTION_AUDIT_VERSION,
  buildBondLanePhase2ActionAudit,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

const audit = buildBondLanePhase2ActionAudit()

assert.equal(audit.version, BOND_LANE_PHASE2_ACTION_AUDIT_VERSION)
assert.equal(audit.status, 'ready_for_phase3')
assert.deepEqual(audit.structuralBlockers, [])

assert.equal(audit.originator.ownerRole, 'bond_originator')
assert.equal(audit.originator.mutationSurface, 'bond_file')
assert.equal(audit.originator.attorneyWorkspacePolicy, 'read_only_observable')
assert.ok(audit.originator.requiredActions.length >= 12)
assert.ok(audit.originator.requiredActions.every((action) => action.covered && action.surface && action.sourceAction))
assert.ok(audit.originator.requiredActions.every((action) => action.surface.supportsMutation || action.id === 'originator_monitor_registration'))
assert.ok(audit.originator.requiredActions.some((action) => action.id === 'originator_send_attorney_instruction' && action.handoffKey === 'originator_to_bond_attorney' && action.surfaceKey === 'bond_file_workflow'))

assert.equal(audit.attorney.ownerRole, 'bond_attorney')
assert.equal(audit.attorney.mutationSurface, 'attorney_workflow')
assert.equal(audit.attorney.nonLinearWorkflowPolicy, 'any_stage_can_be_updated_without_forcing_previous_stage_completion')
assert.ok(audit.attorney.requiredActions.length >= 17)
assert.ok(audit.attorney.requiredActions.every((action) => action.covered && action.surface && action.laneKey === 'bond'))
assert.ok(audit.attorney.requiredActions.some((action) => action.id === 'attorney_schedule_bond_signing' && action.commandType === 'schedule_signing'))
assert.ok(audit.attorney.requiredActions.some((action) => action.id === 'attorney_issue_guarantees' && action.handoffKey === 'bond_attorney_to_transfer_attorney'))
assert.ok(audit.attorney.requiredActions.some((action) => action.id === 'attorney_mark_bond_lodged' && action.handoffKey === 'bond_attorney_to_lodgement_coordination'))

assert.ok(audit.actionSurfaces.some((surface) => surface.key === 'originator_progress_panel' && surface.supportsMutation === false))
assert.ok(audit.actionSurfaces.some((surface) => surface.key === 'originator_attorney_handoff' && surface.supportsMutation === false))
assert.ok(audit.actionSurfaces.some((surface) => surface.key === 'attorney_workflow_action_panel' && surface.supportsMutation === true))

assert.ok(audit.handoffActionCoverage.every((handoff) => handoff.covered && handoff.actionIds.length > 0))
assert.ok(audit.implementationGaps.length >= 3)

const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase2-action-audit.md', import.meta.url), 'utf8')
assert.match(docSource, /Bond Lane Phase 2 Action Audit/)
assert.match(docSource, /bond_file_workflow/)
assert.match(docSource, /originator_attorney_handoff/)
assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase2\.mjs/)

console.log('Attorney bond lane Phase 2 action audit verification passed.')
