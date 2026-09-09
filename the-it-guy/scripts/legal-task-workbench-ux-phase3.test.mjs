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
    visibilityPolicy: { clientVisibleAllowed: true, clientAudience: ['buyer', 'seller'] },
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
assert.equal(model.clientUpdate.available, true, 'client publication must be opt-in capable, not the default workflow visibility')

const componentSource = readFileSync(new URL('../src/components/attorney/workflow/LegalTaskWorkbench.jsx', import.meta.url), 'utf8')
assert.match(componentSource, /legal-task-outstanding-heading/)
assert.match(componentSource, /Complete task/)
assert.match(componentSource, /Missing evidence remains visible after completion/)
assert.match(componentSource, /aria-label=\{`\$\{phase\.label\} tasks`\}/)
assert.match(componentSource, /!model\.readOnly && !model\.taskResolved/)
assert.match(componentSource, /Also notify \{model\.clientUpdate\.audienceLabel\}/)
assert.match(componentSource, /visibility === 'client_visible'/)

const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /legalTaskReturnContext/)
assert.match(pageSource, /openTaskLinkedWorkspace/)
assert.match(pageSource, /returnToLegalTask/)
assert.match(pageSource, /Return to task/)
assert.match(pageSource, /workflowDetailKey: activeLegalWorkflowDetailKey/)
assert.match(pageSource, /function markTaskInProgress\(\)/)
assert.match(pageSource, /Task marked in progress from the Work tab\./)
assert.match(pageSource, /visibility: 'professional_shared'/)
assert.match(pageSource, /handleArchlineLegalWorkflowStepUpdate\(workflow, step, status, note, workPacket = null, visibility = 'professional_shared'\)/)

console.log('Legal task workbench UX Phase 3 checks passed.')
