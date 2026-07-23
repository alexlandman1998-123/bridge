import assert from 'node:assert/strict'

import {
  buildTransferWorkspaceViewModel,
  TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES,
} from '../attorneyWorkflow/transferWorkspaceViewModel.js'

const workflow = {
  title: 'Transfer Progress',
  statusLabel: 'In Progress',
  facts: { isCashDeal: false },
  lane: {
    laneKey: 'transfer',
    currentStage: 'entity_authority_checked',
    permissions: {
      canUpdateStage: true,
      canUploadDocuments: true,
      readOnlyReason: '',
    },
    steps: [
      { id: 'step-1', stepKey: 'instruction_received', status: 'completed', sortOrder: 1 },
      { id: 'step-2', stepKey: 'matter_opened', status: 'completed', sortOrder: 2 },
      { id: 'step-3', stepKey: 'buyer_fica_requested', status: 'completed', sortOrder: 3 },
      { id: 'step-4', stepKey: 'buyer_fica_received', status: 'completed', sortOrder: 4 },
      { id: 'step-5', stepKey: 'buyer_fica_approved', status: 'completed', sortOrder: 5 },
      { id: 'step-6', stepKey: 'entity_authority_checked', status: 'in_progress', comment: 'Checking directors', sortOrder: 6 },
      { id: 'step-7', stepKey: 'transfer_documents_prepared', status: 'not_started', sortOrder: 7 },
    ],
    documentRequirements: [
      {
        id: 'buyer_company_resolution',
        label: 'Buyer Company Resolution',
        status: 'approved',
        complete: true,
      },
      {
        id: 'seller_company_resolution',
        label: 'Seller Company Resolution',
        status: 'missing',
        missing: true,
      },
      {
        id: 'buyer_trustee_resolution',
        label: 'Buyer Trustee Resolution',
        status: 'requested',
      },
    ],
  },
}

const viewModel = buildTransferWorkspaceViewModel({
  workflow,
  selectedTaskKey: 'entity_authority_checked',
  keyDates: [['Instruction Date', '04 May 2026'], ['Lodgement Date', 'TBD']],
  parties: [{ role: 'Buyer', name: 'John Smith' }],
  activityFeed: [
    { id: 'activity-1', laneKey: 'transfer', stepKey: 'entity_authority_checked', title: 'Authority checked' },
    { id: 'activity-2', laneKey: 'bond', stepKey: 'bond_instruction_received', title: 'Bond instruction' },
    { id: 'activity-3', kind: 'comment', visibility: 'internal', filterKeys: ['transfer'], title: 'Internal note added', body: 'Authority note' },
  ],
})

assert.equal(viewModel.workflowKey, 'transfer')
assert.equal(viewModel.selectedTask.key, 'entity_authority_checked')
assert.equal(viewModel.selectedTask.phaseKey, 'fica_authority')
assert.equal(viewModel.currentPhase.label, 'FICA & Authority')

assert.ok(viewModel.tasks.length > workflow.lane.steps.length, 'adapter must preserve configured workflow tasks, not only persisted rows')
assert.equal(viewModel.progress.completed, 9)
assert.equal(viewModel.progress.total, viewModel.tasks.length)
assert.equal(viewModel.attention.blocked, 0)

const phaseKeys = viewModel.phases.map((phase) => phase.key)
assert.ok(phaseKeys.includes('instruction'))
assert.ok(phaseKeys.includes('fica_authority'))
assert.ok(phaseKeys.includes('documents_guarantees'))
assert.equal(viewModel.currentPhase.sequence, 2)
assert.equal(viewModel.currentPhase.hasCurrentTask, true)
assert.equal(viewModel.currentPhase.completed, 6)
assert.equal(viewModel.currentPhase.total, 7)
assert.equal(viewModel.selectedTask.completionReadiness.canComplete, false)
assert.ok(viewModel.selectedTask.completionReadiness.missingRequiredDocuments.length > 0)
assert.equal(viewModel.selectedTask.dependencySummary.status, 'completed')
assert.ok(viewModel.nextActionableTask)

const relatedKeys = viewModel.selectedTaskContext.relatedDocuments.map((document) => document.sourceRequirementKey)
assert.ok(relatedKeys.includes('buyer_company_resolution'))
assert.ok(relatedKeys.includes('seller_company_resolution'))
assert.equal(
  viewModel.selectedTaskContext.relatedDocuments.find((document) => document.sourceRequirementKey === 'seller_company_resolution')?.ready,
  false,
)

assert.deepEqual(
  viewModel.availableActions.primary.map((action) => action.status).filter((status) => !TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES.includes(status)),
  [],
  'primary actions must only expose statuses the workflow service can persist',
)
assert.equal(viewModel.availableActions.primary.find((action) => action.id === 'mark_complete')?.disabled, true)
assert.ok(viewModel.availableActions.unsupported.some((action) => action.status === 'delayed'))
assert.ok(viewModel.availableActions.unsupported.some((action) => action.status === 'not_applicable'))

assert.equal(viewModel.unsupportedCapabilities.editableTaskAssignee, true)
assert.equal(viewModel.unsupportedCapabilities.persistedChecklistItems, true)
assert.equal(viewModel.selectedTaskContext.keyDates.length, 2)
assert.equal(viewModel.selectedTaskContext.keyDates.find((item) => item.label === 'Lodgement Date')?.value, 'Not set')
assert.ok(viewModel.selectedTaskContext.parties.length >= 4)
assert.ok(viewModel.selectedTaskContext.parties.some((item) => item.label === 'Assigned Attorney'))
assert.equal(viewModel.selectedTaskContext.documentSummary.required, viewModel.selectedTaskContext.relatedDocuments.length)
assert.equal(viewModel.selectedTaskContext.documentSummary.received, 1)
assert.equal(
  viewModel.selectedTaskContext.documentSummary.missing,
  viewModel.selectedTaskContext.documentSummary.required - viewModel.selectedTaskContext.documentSummary.received,
)
assert.equal(viewModel.selectedTaskContext.activityFeed.length, 2)
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'overview'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'checklist'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'documents'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'notes'))
assert.ok(viewModel.selectedTaskContext.tabs.some((tab) => tab.key === 'activity'))
assert.ok(viewModel.selectedTaskContext.checklistItems.some((item) => item.type === 'document'))
assert.equal(viewModel.selectedTaskContext.notes.length, 1)
assert.equal(viewModel.selectedTaskContext.notes[0].visibilityLabel, 'Internal')

const blockedModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      steps: [
        ...workflow.lane.steps,
        { id: 'step-8', stepKey: 'transfer_documents_prepared', status: 'blocked', comment: 'Awaiting seller', sortOrder: 8 },
      ],
    },
  },
  filters: { attention: 'blocked' },
})

assert.equal(blockedModel.selectedTask.key, 'transfer_documents_prepared')
assert.equal(blockedModel.visibleTasks.length, 1)
assert.equal(blockedModel.visibleTasks[0].displayStatus, 'blocked')
const blockedDocumentsPhase = blockedModel.phases.find((phase) => phase.key === 'documents_guarantees')
assert.equal(blockedDocumentsPhase?.blocked, 1)
assert.ok(blockedDocumentsPhase?.warningCount >= 1)

const phaseFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { phaseKey: 'documents_guarantees' },
})

assert.ok(phaseFilteredModel.visibleTasks.length > 0)
assert.ok(phaseFilteredModel.visibleTasks.every((task) => task.phaseKey === 'documents_guarantees'))

const statusFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'completed' },
})

assert.ok(statusFilteredModel.visibleTasks.length > 0)
assert.ok(statusFilteredModel.visibleTasks.every((task) => task.displayStatus === 'completed'))

const openFilteredModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'open' },
})

assert.ok(openFilteredModel.visibleTasks.length > 0)
assert.ok(openFilteredModel.visibleTasks.every((task) => task.displayStatus !== 'completed'))

const sectionSearchModel = buildTransferWorkspaceViewModel({
  workflow,
  search: 'FICA & Authority',
})

assert.ok(sectionSearchModel.visibleTasks.length > 0)
assert.ok(sectionSearchModel.visibleTasks.every((task) => task.phaseKey === 'fica_authority'))

const assignedToMeModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    currentUserRole: 'transfer_attorney',
  },
  filters: { status: 'assigned_to_me' },
})

assert.ok(assignedToMeModel.visibleTasks.length > 0)
assert.ok(assignedToMeModel.visibleTasks.every((task) => task.assignedToMe))

const missingDocumentsModel = buildTransferWorkspaceViewModel({
  workflow,
  filters: { status: 'missing_documents' },
})

assert.ok(missingDocumentsModel.visibleTasks.length > 0)
assert.ok(missingDocumentsModel.visibleTasks.every((task) => task.missingDocumentCount > 0))

const delayedModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      currentStage: 'transfer_documents_prepared',
      steps: [
        ...workflow.lane.steps,
        { id: 'step-8', stepKey: 'transfer_documents_prepared', status: 'at_risk', sortOrder: 8 },
      ],
    },
  },
  filters: { status: 'delayed' },
})

assert.ok(delayedModel.visibleTasks.length > 0)
assert.ok(delayedModel.visibleTasks.every((task) => task.displayStatus === 'delayed'))

const readOnlyModel = buildTransferWorkspaceViewModel({
  workflow: {
    ...workflow,
    lane: {
      ...workflow.lane,
      permissions: { canUpdateStage: false, readOnlyReason: 'view_only' },
    },
  },
})

assert.equal(readOnlyModel.availableActions.primary.length, 0)
assert.equal(readOnlyModel.availableActions.readOnlyReason, 'view_only')

console.log('transferWorkspaceViewModel tests passed')
