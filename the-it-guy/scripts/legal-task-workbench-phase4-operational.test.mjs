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
assert.equal(missingWorkbench.primaryAction.id, 'edit_task_record')
assert.ok(missingWorkbench.outstandingRequirements.some((item) => item.id === 'data:bond_bank'))
assert.ok(missingWorkbench.confirmationRequirements.length > 0)
assert.equal(missingWorkbench.canComplete, true)
assert.equal(missingWorkbench.requirementsSatisfied, false)
assert.equal(missingWorkbench.completeAction.requiresNote, true)
assert.match(missingWorkbench.completionMessage, /guidance/i)
assert.equal(missingWorkbench.requirementActions['data:bond_bank'].recordLabel, 'Bank details')
assert.equal(missingWorkbench.clientUpdate.available, false)

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
assert.equal(capturedWorkbench.requirementsSatisfied, true)
assert.equal(capturedWorkbench.completeAction.requiresNote, false)

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
assert.equal(clientWorkbench.clientUpdate.available, true)
assert.ok(clientWorkbench.clientUpdate.audience.includes('buyer'))
assert.ok(clientWorkbench.clientUpdate.audience.includes('seller'))

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /action\.id === 'capture_data'/)
assert.match(pageSource, /action\.target === 'finance'/)
assert.match(pageSource, /action\.target === 'parties'/)
assert.match(pageSource, /onCaptureDetails/)
assert.match(pageSource, /action\.requirement \|\| null/)

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.doesNotMatch(componentSource, /Required action/)
assert.match(componentSource, /Requires a client-safe note/)
assert.match(componentSource, /Missing evidence remains visible after completion/)

const laneServiceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
assert.match(laneServiceSource, /buildAttorneyTaskMutationPacket\(operationalContract/)
assert.match(laneServiceSource, /commitSharedJourneyTask\(client/)

// All current tasks retain their confirmation identifiers. New records must
// attach to an existing row and must never be selected by another lane or alias.
const { getAttorneyStageDefinitionsForLane } = await import('../src/constants/attorneyWorkflowStages.js')
const { getLegalTaskContent, readLegalTaskInput, legalTaskRecordIssues } = await import('../src/core/transactions/legalTaskContent.js')
let definitions = 0, records = 0
for (const laneKey of ['transfer', 'bond', 'cancellation']) for (const definition of getAttorneyStageDefinitionsForLane(laneKey)) {
  definitions++
  const vm = buildTransferWorkspaceViewModel({ workflowKey: laneKey, selectedTaskKey: definition.key,
    workflow: { lane: { laneKey, permissions: { canUpdateStage: true }, steps: [{ id: 'selected', stepKey: definition.key, status: 'in_progress' }] } } })
  const model = buildLegalTaskWorkbenchModel({ task: vm.selectedTask, taskContext: vm.selectedTaskContext, workActions: vm.selectedTaskContext.workActions, statusActions: vm.availableActions.primary })
  const content = getLegalTaskContent(laneKey, definition.key)
  if (!content) continue
  records++
  assert.equal(model.confirmationRows.find(row => row.id === content.rowId)?.register, content.spec, `${laneKey}:${definition.key} has its editor on the saved confirmation row`)
  assert.ok(content.spec.fields.length && content.spec.fields.length <= 10)
  assert.equal(new Set(content.spec.fields.map(field => field.key)).size, content.spec.fields.length)
  assert.equal(model.confirmationRows.filter(row => row.register === content.spec).length, 1)
  assert.equal(getLegalTaskContent('unknown', definition.key), null)
  for (const [inputId, fieldKey] of Object.entries(content.inputs)) {
    const field = content.spec.fields.find(field => field.key === fieldKey)
    const value = field.type === 'number' ? '2190000' : field.type === 'date' ? '2026-10-06' : field.type === 'select' ? field.options[0] : 'Reviewed reference'
    const saved = { [content.rowId]: { answer: 'yes', items: [{ [fieldKey]: value }] } }
    assert.equal(readLegalTaskInput(laneKey, definition.key, saved, inputId)?.value, value)
    const withRecords = buildTransferWorkspaceViewModel({ workflowKey: laneKey, selectedTaskKey: definition.key,
      workflow: { lane: { laneKey, permissions: { canUpdateStage: true }, steps: [{ id: 'selected', stepKey: definition.key, status: 'in_progress', taskConfirmations: saved }] } } })
    assert.equal(withRecords.selectedTask.dataRequirements.find(row => row.id === inputId)?.value, value, 'a freshly loaded saved record supplies otherwise uncaptured task information')
    assert.equal(readLegalTaskInput(laneKey, definition.key, { [content.rowId]: { ...saved[content.rowId], answer: 'no' } }, inputId), null, 'unconfirmed records cannot supply a captured fact')
    assert.equal(readLegalTaskInput(laneKey, 'another_task', saved, inputId), null)
  }
}
assert.equal(definitions, 89)
assert.equal(records, 45)
const bankContent = getLegalTaskContent('bond', 'bank_reference_captured')
const withAuthoritativeFacts = buildTransferWorkspaceViewModel({ workflowKey: 'bond', selectedTaskKey: 'bank_reference_captured', workflow: {
  facts: { bond_bank: 'Current matter bank' }, lane: { laneKey: 'bond', steps: [{ id: 's', stepKey: 'bank_reference_captured', status: 'in_progress', taskConfirmations: { [bankContent.rowId]: { answer: 'yes', items: [{ bank: 'Older reviewed bank' }] } } }] } } })
assert.equal(withAuthoritativeFacts.selectedTask.dataRequirements.find(row => row.id === 'bond_bank').value, 'Current matter bank', 'a task review never overwrites a shared matter fact')
const authority = getLegalTaskContent('bond', 'bank_approval_to_lodge_received').spec
assert.ok(authority.fields.some(field => field.key === 'packReference'))
assert.ok(authority.fields.some(field => field.key === 'validUntil'))
assert.ok(legalTaskRecordIssues(authority, [{ date: '2026-02-30' }]).length)
assert.deepEqual(legalTaskRecordIssues(authority, [{ date: '2026-10-06' }]), [])
assert.ok(legalTaskRecordIssues(getLegalTaskContent('bond', 'bond_approval_letter_received').spec, [{ amount: '-1' }]).length)
assert.deepEqual(legalTaskRecordIssues(authority, [{}]), [], 'partial records remain saveable without creating new legal gates')
const conditionsSource = getLegalTaskContent('bond', 'bank_conditions_outstanding')
const carried = [{ id: 'condition-1', description: 'Signed annexure', owner: 'Bond secretary', status: 'outstanding' }]
const conditionsVm = buildTransferWorkspaceViewModel({ workflowKey: 'bond', selectedTaskKey: 'bank_conditions_resolved', workflow: { lane: { laneKey: 'bond', permissions: { canUpdateStage: true }, steps: [
  { id: 'source', stepKey: 'bank_conditions_outstanding', status: 'in_progress', taskConfirmations: { [conditionsSource.rowId]: { answer: 'yes', items: carried } } },
  { id: 'target', stepKey: 'bank_conditions_resolved', status: 'in_progress' },
] } } })
const conditionsModel = buildLegalTaskWorkbenchModel({ task: conditionsVm.selectedTask, taskContext: conditionsVm.selectedTaskContext, workflowTasks: conditionsVm.tasks })
const carriedRegister = conditionsModel.confirmationRows.find(row => row.register)?.register
assert.deepEqual(carriedRegister.initialItems, carried)
assert.notStrictEqual(carriedRegister.initialItems[0], carried[0])
assert.match(carriedRegister.help, /Starting from the saved/)
assert.equal(conditionsVm.selectedTask.taskConfirmations[getLegalTaskContent('bond', 'bank_conditions_resolved').rowId], undefined, 'carrying a record does not create a saved answer')
assert.equal(getLegalTaskContent('bond', 'documents_sent_to_bank'), null, 'historical aliases do not silently inherit newer editors')
console.log('Legal task content: all 89 tasks, 45 specific records, captured values, date/amount validation and scope checks passed.')
