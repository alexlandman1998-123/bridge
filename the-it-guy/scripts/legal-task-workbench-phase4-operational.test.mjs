import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'

function buildBondWorkflow(dataRequirements) {
  return {
    title: 'Bond Attorney Workflow',
    lane: {
      laneKey: 'bond',
      currentStage: 'bank_reference_captured',
      permissions: {
        canUpdateStage: true,
        canAddNotes: true,
      },
      steps: [{ id: 'bond-bank-reference', stepKey: 'bank_reference_captured', status: 'in_progress' }],
      dataRequirements,
      documentRequirements: [],
    },
  }
}

const missingDataModel = buildTransferWorkspaceViewModel({
  workflowKey: 'bond',
  workflow: buildBondWorkflow([
    { id: 'bond_bank', label: 'Bond Bank', required: true, complete: false, missing: true },
    { id: 'bond_reference', label: 'Bond Reference / Account', required: true, complete: false, missing: true },
  ]),
  selectedTaskKey: 'bank_reference_captured',
})

assert.equal(missingDataModel.selectedTask.completionReadiness.canComplete, false)
assert.deepEqual(
  missingDataModel.selectedTask.completionReadiness.missingRequiredData.map((item) => item.id),
  ['bond_bank', 'bond_reference'],
)
assert.match(missingDataModel.selectedTask.completionReadiness.warnings[0], /Bond Bank has not been captured/)
const captureAction = missingDataModel.selectedTaskContext.workActions.find((action) => action.id === 'capture_data')
assert.ok(captureAction, 'missing transaction facts must expose a capture action')
assert.equal(captureAction.target, 'finance')

const missingWorkbench = buildLegalTaskWorkbenchModel({
  task: missingDataModel.selectedTask,
  taskContext: missingDataModel.selectedTaskContext,
  workActions: missingDataModel.selectedTaskContext.workActions,
  statusActions: missingDataModel.availableActions.primary,
  workflowLabel: missingDataModel.title,
})
assert.equal(missingWorkbench.primaryAction.id, 'capture_data')
assert.ok(missingWorkbench.outstandingRequirements.some((item) => item.id === 'data:bond_bank'))
assert.ok(missingWorkbench.confirmationRequirements.length > 0)
assert.equal(missingWorkbench.canComplete, false)
assert.equal(missingWorkbench.clientUpdate.visible, false)

const capturedDataModel = buildTransferWorkspaceViewModel({
  workflowKey: 'bond',
  workflow: buildBondWorkflow([
    { id: 'bond_bank', label: 'Bond Bank', required: true, complete: true, missing: false, value: 'Example Bank', sourceField: 'bond_bank' },
    { id: 'bond_reference', label: 'Bond Reference / Account', required: true, complete: true, missing: false, value: 'REF-100', sourceField: 'bond_reference' },
  ]),
  selectedTaskKey: 'bank_reference_captured',
})
assert.equal(capturedDataModel.selectedTask.completionReadiness.canComplete, true)
assert.equal(capturedDataModel.selectedTaskContext.workActions.some((action) => action.id === 'capture_data'), false)
assert.ok(capturedDataModel.selectedTaskContext.checklistItems.filter((item) => item.type === 'data').every((item) => item.complete))

const capturedWorkbench = buildLegalTaskWorkbenchModel({
  task: capturedDataModel.selectedTask,
  taskContext: capturedDataModel.selectedTaskContext,
  workActions: capturedDataModel.selectedTaskContext.workActions,
  statusActions: capturedDataModel.availableActions.primary,
  workflowLabel: capturedDataModel.title,
})
assert.equal(capturedWorkbench.primaryAction.id, 'mark_complete')
assert.equal(capturedWorkbench.canComplete, true)

const clientVisibleModel = buildTransferWorkspaceViewModel({
  workflowKey: 'transfer',
  workflow: {
    title: 'Transfer Attorney Workflow',
    lane: {
      laneKey: 'transfer',
      currentStage: 'rates_figures_requested',
      permissions: { canUpdateStage: true, canAddNotes: true },
      steps: [{ id: 'rates-request', stepKey: 'rates_figures_requested', status: 'in_progress' }],
      dataRequirements: [],
      documentRequirements: [],
    },
  },
  selectedTaskKey: 'rates_figures_requested',
})
const clientWorkbench = buildLegalTaskWorkbenchModel({
  task: clientVisibleModel.selectedTask,
  taskContext: clientVisibleModel.selectedTaskContext,
  workActions: clientVisibleModel.selectedTaskContext.workActions,
  statusActions: clientVisibleModel.availableActions.primary,
})
assert.equal(clientWorkbench.clientUpdate.visible, true)
assert.ok(clientWorkbench.clientUpdate.audience.includes('buyer'))
assert.ok(clientWorkbench.clientUpdate.audience.includes('seller'))

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /action\.id === 'capture_data'/)
assert.match(pageSource, /action\.target === 'finance'/)
assert.match(pageSource, /action\.target === 'parties'/)

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /Checks confirmed on completion/)
assert.match(componentSource, /Keep the status note clear and client-safe/)

const laneServiceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
assert.match(laneServiceSource, /buildAttorneyTaskMutationPacket\(operationalContract/)
assert.match(laneServiceSource, /publishAttorneySharedProgress\(client/)

console.log('Legal task workbench Phase 4 operational checks passed.')
