import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { scopeAttorneyWorkflowOperations } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const { resolveLegalRequirements } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowResolver.js')
  const workflow = resolveLegalRequirements({ finance_type: 'bond', purchaser_type: 'individual', seller_has_existing_bond: true })
  assert.equal(Array.isArray(workflow.dataRequirements), false)
  const lanes = ['transfer', 'bond', 'cancellation'].map(laneKey => ({ laneKey, steps: [{ stepKey: 'instruction_received', status: 'completed' }] }))
  for (const visibleLaneKeys of [[], ['transfer'], ['bond'], ['transfer', 'bond', 'cancellation']]) {
    const result = scopeAttorneyWorkflowOperations({ workflow, lanes }, { scoped: true, visibleLaneKeys })
    assert.deepEqual(Object.keys(result.workflow.dataRequirements), Object.keys(workflow.dataRequirements).filter(key => visibleLaneKeys.includes(key)))
    assert.deepEqual(result.lanes.map(lane => lane.laneKey), visibleLaneKeys)
    for (const lane of result.lanes) assert.equal(lane.steps[0].status, 'completed', 'scoping must retain persisted state')
    for (const [key, requirements] of Object.entries(result.workflow.dataRequirements)) assert.deepEqual(requirements, workflow.dataRequirements[key])
  }
  console.log('Scoped workflow load passed: real resolver shape, persisted completion, denied and multi-lane access.')
} finally {
  await server.close()
}
