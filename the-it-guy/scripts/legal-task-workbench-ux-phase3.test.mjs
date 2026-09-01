import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

const task = {
  key: 'buyer_fica_received',
  label: 'Buyer FICA received',
  description: 'Review the buyer identity and address evidence.',
  displayStatus: 'in_progress',
  statusLabel: 'In progress',
  completionReadiness: { canComplete: false, warnings: ['Identity document is outstanding.'] },
  dependencySummary: { advisory: false },
  operationalContract: {
    taskType: 'review_evidence',
    primaryAction: { id: 'review_document' },
    visibilityPolicy: { clientAudience: [] },
  },
}
const workActions = [
  { id: 'open_documents', label: 'Review evidence' },
  { id: 'request_document', label: 'Request document' },
  { id: 'upload_document', label: 'Upload evidence' },
  { id: 'add_note', label: 'Add note' },
]
const statusActions = [
  { id: 'mark_complete', label: 'Complete task', disabled: true },
  { id: 'mark_blocked', label: 'Mark blocked' },
]

const model = buildLegalTaskWorkbenchModel({ task, workActions, statusActions })
assert.equal(model.primaryAction.id, 'open_documents')
assert.ok(model.secondaryActions.length <= 2, 'the task workbench should expose at most two secondary actions')

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, />Objective</)
assert.match(componentSource, /legal-task-outstanding-heading/)
assert.match(componentSource, /Complete task/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /legalTaskReturnContext/)
assert.match(pageSource, /openTaskLinkedWorkspace/)
assert.match(pageSource, /returnToLegalTask/)
assert.match(pageSource, /Return to task/)
assert.match(pageSource, /workflowDetailKey: activeLegalWorkflowDetailKey/)

console.log('Legal task workbench UX Phase 3 checks passed.')
