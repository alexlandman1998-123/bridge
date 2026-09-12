import test from 'node:test'
import assert from 'node:assert/strict'
import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import { BOND_PHASE4_GUARANTEE_COORDINATION_PAIRS } from '../attorneyWorkflow/bondLaneJourneyMap.js'
import { CANCELLATION_PHASE4_GUARANTEE_COORDINATION_PAIRS } from '../attorneyWorkflow/cancellationLaneJourneyMap.js'

test('bond and cancellation guarantee dependencies reference current, not retired, tasks', () => {
  for (const pair of [...BOND_PHASE4_GUARANTEE_COORDINATION_PAIRS, ...CANCELLATION_PHASE4_GUARANTEE_COORDINATION_PAIRS]) {
    const keys = getAttorneyStageDefinitionsForLane(pair.dependencyLaneKey).map(task => task.key)
    assert.ok(keys.includes(pair.dependencyStageKey), `${pair.key}: missing ${pair.dependencyStageKey}`)
    if (pair.requestingStageKey) assert.ok(getAttorneyStageDefinitionsForLane(pair.requestingLaneKey).some(task => task.key === pair.requestingStageKey))
  }
})

test('historical transfer guarantee keys still resolve through aliases', () => {
  const task = getAttorneyStageDefinitionsForLane('transfer').find(item => item.key === 'payment_security_review')
  for (const alias of ['guarantees_received', 'transfer_guarantees_accepted']) assert.ok(task.aliases.includes(alias))
})
