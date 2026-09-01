import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

function buildLaneWorkflow(laneKey, currentStage) {
  return {
    title: laneKey === 'bond' ? 'Bond Attorney Workflow' : 'Cancellation Attorney Workflow',
    statusLabel: 'In Progress',
    lane: {
      laneKey,
      currentStage,
      permissions: {
        canUpdateStage: true,
        canRequestDocuments: true,
        canUploadDocuments: true,
        canAddNotes: true,
      },
      steps: [{ id: `${laneKey}-current`, stepKey: currentStage, status: 'in_progress', sortOrder: 1 }],
      documentRequirements: [],
    },
  }
}

const laneCases = [
  ['bond', 'bond_instruction_received', 4],
  ['cancellation', 'cancellation_instruction_received', 4],
]

for (const [laneKey, currentStage, expectedPhaseCount] of laneCases) {
  const viewModel = buildTransferWorkspaceViewModel({
    workflowKey: laneKey,
    workflow: buildLaneWorkflow(laneKey, currentStage),
    selectedTaskKey: currentStage,
  })
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)

  assert.equal(viewModel.workflowKey, laneKey)
  assert.equal(viewModel.tasks.length, definitions.length, `${laneKey} must expose every configured legal task`)
  assert.equal(viewModel.phases.length, expectedPhaseCount, `${laneKey} must use a compact four-checkpoint navigator`)
  assert.equal(viewModel.phases.reduce((total, phase) => total + phase.total, 0), definitions.length)
  assert.ok(viewModel.phases.every((phase) => phase.total > 0))
  assert.ok(viewModel.tasks.every((task) => task.operationalContract?.laneKey === laneKey))
  assert.ok(viewModel.tasks.every((task) => task.phaseKey && task.phaseLabel))

  const statusCommand = viewModel.availableActions.primary.find((action) => action.command)?.command
  assert.equal(statusCommand?.laneKey || statusCommand?.workPacket?.laneKey, laneKey, `${laneKey} status commands must not leak into the transfer lane`)

  const workbench = buildLegalTaskWorkbenchModel({
    task: viewModel.selectedTask,
    taskContext: viewModel.selectedTaskContext,
    workActions: viewModel.selectedTaskContext.workActions,
    statusActions: viewModel.availableActions.primary,
    workflowLabel: viewModel.title,
  })
  assert.equal(workbench.workflowLabel, viewModel.title)
  assert.ok(workbench.primaryAction, `${laneKey} current task must expose a next action`)
  assert.ok(workbench.secondaryActions.length <= 3)
}

for (const [laneKey, documentTaskKey] of [
  ['bond', 'bond_approval_letter_received'],
  ['cancellation', 'cancellation_instruction_received'],
]) {
  const viewModel = buildTransferWorkspaceViewModel({
    workflowKey: laneKey,
    workflow: buildLaneWorkflow(laneKey, documentTaskKey),
    selectedTaskKey: documentTaskKey,
  })
  const requestAction = viewModel.selectedTaskContext.workActions.find((action) => action.id === 'request_document')
  assert.ok(requestAction, `${laneKey} document tasks must expose a request action`)
  assert.equal(requestAction.workflowAction?.laneKey, laneKey)
  assert.equal(requestAction.command?.laneKey || requestAction.command?.workPacket?.laneKey, laneKey)
}

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /archlineActiveLegalTaskWorkflowKey === 'bond'/)
assert.match(pageSource, /archlineActiveLegalTaskWorkflowKey === 'cancellation'/)
assert.match(pageSource, /workflowKey=\{archlineActiveLegalTaskWorkflowKey\}/)
assert.match(pageSource, /archlineDocumentsByWorkflow\.finance/)
assert.match(pageSource, /onRequestDocument=\{handleLegalTaskDocumentRequest\}/)
assert.doesNotMatch(pageSource, /activeLegalWorkflowDetailKey !== 'bond-registration'/)
assert.doesNotMatch(pageSource, /<ArchlineWorkflowWorkspace/)

console.log('Legal task workbench Phase 3 multi-lane tests passed.')
