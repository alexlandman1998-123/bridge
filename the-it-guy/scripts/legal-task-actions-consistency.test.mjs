import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLegalTaskWorkbenchModel } from '../src/core/transactions/legalTaskWorkbenchModel.js'

const actions = [
  { id: 'mark_complete', status: 'completed' },
  { id: 'mark_in_progress', status: 'in_progress' },
  { id: 'complete_externally', status: 'completed_externally', requiresReason: true },
  { id: 'mark_not_applicable', status: 'not_applicable', requiresReason: true },
  { id: 'mark_waiting', status: 'waiting', requiresNote: true },
  { id: 'mark_blocked', status: 'blocked', requiresNote: true },
]
for (const lane of ['transfer', 'bond', 'cancellation']) {
  for (const displayStatus of ['not_started', 'in_progress', 'waiting', 'blocked']) {
    const input = {
      task: { key: 'task', displayStatus, completionReadiness: { canComplete: false }, operationalContract: { lane, visibilityPolicy: { clientVisibleAllowed: true, clientAudience: ['buyer'] } } },
      statusActions: actions,
      taskContext: { checklistItems: [{ id: 'otp', required: true, complete: false }] },
    }
    const model = buildLegalTaskWorkbenchModel(input)
    assert.equal(model.canComplete, true, 'missing evidence does not disable authorised completion')
    assert.equal(model.completeAction.requiresNote, true)
    assert.equal(model.canMarkInProgress, displayStatus !== 'in_progress')
    assert.equal(model.outcomeActions.length, 2)
    assert.equal(model.followUpActions.length, 2)
    assert.equal(model.outstandingRequirements.length, 1)
    for (const denied of [{ ...input, statusActions: [] }, { ...input, canUpdateTask: false }]) {
      const readonly = buildLegalTaskWorkbenchModel(denied)
      assert.equal(readonly.canMarkInProgress, false)
      assert.equal(readonly.canComplete, false)
      assert.equal(readonly.readOnly, true)
    }
  }
  for (const displayStatus of ['completed', 'completed_externally', 'not_applicable']) {
    const model = buildLegalTaskWorkbenchModel({
      task: { key: 'task', displayStatus, operationalContract: { lane } },
      statusActions: [{ id: 'reopen_task', status: 'not_started', requiresNote: true }],
      taskContext: { checklistItems: [{ id: 'otp', required: true, complete: false }] },
    })
    assert.equal(model.taskResolved, true)
    assert.equal(model.canMarkInProgress, false)
    assert.equal(model.canComplete, false)
    assert.equal(model.outcomeActions[0].id, 'reopen_task')
    assert.equal(model.outstandingRequirements.length, 1, 'completion does not imply evidence received')
  }
}
const source = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
assert.match(source, /const statusAction = \{ \.\.\.canonicalAction, \.\.\.action \}/, 'preserve workbench completion-note requirements')
assert.match(source, /!taskWorkbenchModel\.canMarkInProgress/)
assert.match(source, /if \(statusDraft.requiresReason && !statusDraft.reason\?\.trim\(\)\) return/)
assert.match(source, /visibility: 'professional_shared'/)
console.log('Task actions: 3 lanes, 7 statuses, access checks and evidence preservation passed')
