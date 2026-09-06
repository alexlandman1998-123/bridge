import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAttorneyStageKeysForLane } from '../src/constants/attorneyWorkflowStages.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
import { buildBondLanePhase8RolloutReadinessReport, buildBondLanePhase9UatReleaseGateReport } from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'
import { buildCancellationLanePhase9ActionCommandReleaseReport } from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

const fullPermissions = { canUpdateStage: true, canUpdateSteps: true, canUploadDocuments: true, canRequestDocuments: true, canAddNotes: true }
const transferStageKeys = getAttorneyStageKeysForLane('transfer')
const transfer = buildTransferWorkspaceViewModel({
  workflow: {
    title: 'Transfer action audit',
    facts: { financeType: 'bond', buyerEntityType: 'company', sellerEntityType: 'trust', sellerHasExistingBond: true, cancellationRequired: true },
    lane: {
      laneKey: 'transfer', currentStage: transferStageKeys[0], permissions: fullPermissions, documentRequirements: [],
      steps: transferStageKeys.map((stepKey, index) => ({ id: `transfer-${index}`, stepKey, status: index === 0 ? 'in_progress' : 'not_started', sortOrder: index + 1 })),
    },
  },
})

assert.equal(transfer.tasks.length, transferStageKeys.length)
for (const task of transfer.tasks) {
  const actions = transfer.workActionsByTaskKey[task.key] || []
  assert.ok(actions.length > 0, `Transfer stage ${task.key} has no action surface`)
  assert.ok(actions.some((action) => !action.disabled && action.target), `Transfer stage ${task.key} has no enabled destination`)
  for (const action of actions) {
    assert.ok(action.id && action.label && action.target, `Transfer action on ${task.key} is incomplete`)
    if (!action.disabled && !['capture_data', 'upload_document', 'open_documents', 'open_parties', 'open_finance'].includes(action.id)) assert.ok(action.command, `Transfer action ${task.key}/${action.id} has no command or workspace callback`)
  }
}

const readOnlyTransfer = buildTransferWorkspaceViewModel({
  workflow: { facts: { financeType: 'cash', buyerEntityType: 'individual', buyerMaritalStatus: 'single', sellerEntityType: 'individual', sellerMaritalStatus: 'single', sellerHasExistingBond: false }, lane: { laneKey: 'transfer', currentStage: transferStageKeys[0], permissions: { canUpdateStage: false, canUpdateSteps: false, canUploadDocuments: false, canRequestDocuments: false, canAddNotes: false }, steps: [{ stepKey: transferStageKeys[0], status: 'in_progress' }] } },
})
assert.deepEqual(readOnlyTransfer.availableActions.primary, [], 'read-only transfer users must not receive status mutation actions')
for (const actions of Object.values(readOnlyTransfer.workActionsByTaskKey)) {
  for (const action of actions.filter((item) => ['capture_data', 'request_document', 'upload_document', 'add_note', 'schedule_signing'].includes(item.id))) assert.equal(action.disabled, true, `read-only mutation ${action.id} must be disabled`)
}

const bondReadiness = buildBondLanePhase8RolloutReadinessReport()
assert.equal(bondReadiness.rolloutReadiness.actionButtonProof.noDeadEndButtons, true)
assert.equal(bondReadiness.rolloutReadiness.metrics.bondAttorneyStageCount, 17)
assert.equal(bondReadiness.rolloutReadiness.metrics.stageCommandCount, 17)
assert.equal(bondReadiness.rolloutReadiness.workflowProof.concurrentWorkAllowed, true)
const bondActive = buildBondLanePhase9UatReleaseGateReport({ facts: { financeType: 'bond', buyerEntityType: 'individual', buyerMaritalStatus: 'single', sellerEntityType: 'individual', sellerHasExistingBond: false } })
const bondCash = buildBondLanePhase9UatReleaseGateReport({ facts: { financeType: 'cash', buyerEntityType: 'individual', buyerMaritalStatus: 'single', sellerEntityType: 'individual', sellerHasExistingBond: false } })
assert.equal(bondActive.releaseGateStatus, 'go')
assert.equal(bondCash.selectedScenarioGate.profile.lanePolicy.bondAttorneyLaneActive, false)

const cancellationActive = buildCancellationLanePhase9ActionCommandReleaseReport({ facts: { financeType: 'cash', buyerEntityType: 'individual', sellerEntityType: 'individual', sellerHasExistingBond: true } })
const cancellationSuppressed = buildCancellationLanePhase9ActionCommandReleaseReport({ facts: { financeType: 'bond', buyerEntityType: 'individual', sellerEntityType: 'individual', sellerHasExistingBond: false } })
assert.equal(cancellationActive.actionCommandProof.requiredActionCount, 19)
assert.equal(cancellationActive.actionCommandProof.commandBackedActionCount, 19)
assert.equal(cancellationActive.actionCommandProof.allCancellationActionsCommandBacked, true)
assert.equal(cancellationActive.actionCommandProof.nonLinearWorkflowPreserved, true)
assert.equal(cancellationSuppressed.selectedScenarioGate.profile.lanePolicy.cancellationLaneActive, false)

const panel = readFileSync(new URL('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url), 'utf8')
assert.match(panel, /role="status" aria-live="polite"/)
assert.match(panel, /Attorney workflow updated successfully\./)
assert.match(panel, /role="alert"/)
assert.match(panel, /disabled=\{saving/)
assert.match(panel, /Workflow actions are unavailable for this account\./)

console.log(`Attorney release Phase 2 action-surface gate passed: ${transfer.tasks.length} transfer, 17 bond, and 19 cancellation stages.`)
