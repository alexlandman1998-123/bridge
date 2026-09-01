import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

const incompleteTask = {
  key: 'buyer_fica_received',
  label: 'Buyer FICA Received',
  description: 'Collect and validate the buyer FICA evidence.',
  displayStatus: 'in_progress',
  statusLabel: 'In Progress',
  ownerLabel: 'Transfer Attorney',
  missingDocumentCount: 1,
  operationalContract: {
    version: '1.0',
    taskType: 'collect_documents',
    primaryAction: { id: 'upload_document' },
    visibilityPolicy: { clientAudience: ['buyer'] },
  },
  dependencySummary: { advisory: false },
  completionReadiness: {
    canComplete: false,
    warnings: ['Buyer identity document is still outstanding.'],
  },
}

const taskContext = {
  checklistItems: [
    { id: 'proof-address', label: 'Proof of address', required: true, complete: true },
    { id: 'identity', label: 'Identity document', required: true, complete: false },
  ],
  relatedDocuments: [
    { id: 'identity', displayName: 'Buyer identity document', ready: false },
  ],
  notes: [],
  activityFeed: [],
}

const workActions = [
  { id: 'request_document', label: 'Request Document' },
  { id: 'upload_document', label: 'Upload Evidence' },
  { id: 'open_documents', label: 'Open Documents' },
  { id: 'add_note', label: 'Add Note' },
]

const statusActions = [
  { id: 'mark_complete', label: 'Mark Complete', status: 'completed', disabled: true },
  { id: 'mark_blocked', label: 'Mark Blocked', status: 'blocked' },
  { id: 'mark_waiting', label: 'Mark Waiting', status: 'waiting' },
]

const incompleteModel = buildLegalTaskWorkbenchModel({
  task: incompleteTask,
  taskContext,
  workActions,
  statusActions,
})

assert.equal(incompleteModel.primaryAction.id, 'request_document', 'missing evidence should make the document request the next action')
assert.equal(incompleteModel.primaryAction.source, 'work')
assert.ok(incompleteModel.secondaryActions.length <= 3, 'the workbench must not expose more than three secondary actions')
assert.ok(incompleteModel.attentionItems.length <= 5, 'attention items must remain deliberately bounded')
assert.deepEqual(incompleteModel.outstandingRequirements.map((item) => item.id), ['identity'])
assert.deepEqual(incompleteModel.completedRequirements.map((item) => item.id), ['proof-address'])
assert.equal(incompleteModel.canComplete, false)
assert.deepEqual(incompleteModel.audience, ['buyer'])

const readyModel = buildLegalTaskWorkbenchModel({
  task: {
    ...incompleteTask,
    missingDocumentCount: 0,
    completionReadiness: { canComplete: true, warnings: [] },
    operationalContract: {
      ...incompleteTask.operationalContract,
      primaryAction: { id: 'mark_complete' },
    },
  },
  taskContext: {
    ...taskContext,
    checklistItems: taskContext.checklistItems.map((item) => ({ ...item, complete: true })),
  },
  workActions,
  statusActions: statusActions.map((action) => ({ ...action, disabled: false })),
})

assert.equal(readyModel.primaryAction.id, 'mark_complete')
assert.equal(readyModel.primaryAction.source, 'status')
assert.equal(readyModel.canComplete, true)

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /Current legal task/)
assert.match(componentSource, /Next action/)
assert.match(componentSource, /Attention required/)
assert.match(componentSource, /<Disclosure/)
assert.doesNotMatch(componentSource, /Lane Command Queue/)
assert.doesNotMatch(componentSource, /Transfer Coverage/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /import LegalTaskWorkbench/)
assert.match(pageSource, /if \(selectedTask\?\.operationalContract\)/)
assert.match(pageSource, /onRunAction=\{handleTaskWorkbenchAction\}/)

console.log('Legal task workbench Phase 2 tests passed.')
