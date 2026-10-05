import test from 'node:test'
import assert from 'node:assert/strict'
import { commitSharedJourneyTask, commitSharedJourneyLaneUpdate } from '../attorneyWorkflow/sharedJourneyCommandService.js'
import { buildAttorneyWorkflowCoordinationSummary } from '../../constants/attorneyWorkflowUsability.js'

test('coordination requires the saved target outcome, not position or lane summary', () => {
  for (const status of ['completed', 'approved', 'in_progress', 'not_started', 'not_applicable', 'completed_externally']) {
    const result = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'bond', lanes: [{
      laneKey: 'transfer', status: 'completed', currentStage: 'registered',
      steps: [{ stepKey: 'payment_security_review', status }, { stepKey: 'registered', status: 'completed' }],
    }] })
    const item = result.items.find(item => item.targetStage === 'payment_security_review')
    assert.ok(item)
    assert.equal(item.status === 'ready', ['completed', 'approved'].includes(status))
  }
})

test('received guarantees cannot mask an unfinished acceptance review through historical aliases', () => {
  const historical = [{ stepKey: 'guarantees_received', status: 'completed' },
    { stepKey: 'transfer_guarantees_accepted', status: 'waiting' }]
  const result = steps => buildAttorneyWorkflowCoordinationSummary({ laneKey: 'bond', lanes: [{
    laneKey: 'transfer', assignmentId: 'appointed', currentStage: 'registered', steps,
  }] }).items.find(item => item.targetStage === 'payment_security_review')
  assert.equal(result(historical).status, 'waiting')
  assert.equal(result([...historical, { stepKey: 'payment_security_review', status: 'completed' }]).status, 'ready')
  assert.equal(result([{ stepKey: 'payment_security_review', status: 'waiting' },
    { stepKey: 'transfer_guarantees_accepted', status: 'completed' }]).status, 'waiting')
})

for (const commit of [commitSharedJourneyTask, commitSharedJourneyLaneUpdate]) {
  test(`${commit.name}: retries transient failures only, preserving command identity`, async () => {
    const payload = { p_command_id: 'same-command' }
    const calls = []
    await commit({ rpc: async (name, args) => { calls.push(args); return calls.length === 1 ? { error: { message: 'Failed to fetch' } } : { data: { replayed: true } } } }, payload)
    assert.deepEqual(calls, [payload, payload])
    calls.length = 0
    await commit({ rpc: async (name, args) => { calls.push(args); return calls.length < 3 ? { error: { code: '57014', message: 'statement timeout' } } : { data: { replayed: true } } } }, payload)
    assert.deepEqual(calls, [payload, payload, payload])
    for (const error of [{ message: 'Permission denied' }, { code: '40001', message: 'Conflict' }]) {
      let count = 0
      assert.equal((await commit({ rpc: async () => { count++; return { error } } }, payload)).error, error)
      assert.equal(count, 1)
    }
    await assert.rejects(commit({ rpc: async () => ({ data: null }) }, payload), /No saved outcome/)
    let count = 0
    await assert.rejects(commit({ rpc: async () => { count++; throw new Error('Invalid outcome') } }, payload), /Invalid outcome/)
    assert.equal(count, 1)
  })
}
