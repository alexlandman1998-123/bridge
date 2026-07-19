import assert from 'node:assert/strict'
import { buildMvpTransactionWorkflowBootstrap } from '../mvpTransactionWorkflowBootstrap.js'
assert.deepEqual(buildMvpTransactionWorkflowBootstrap({ financeType: 'cash' }).lanes.map((lane) => lane.laneType), ['main', 'finance', 'transfer'])
assert.deepEqual(buildMvpTransactionWorkflowBootstrap({ financeType: 'hybrid' }).lanes.map((lane) => lane.laneType), ['main', 'finance', 'transfer', 'bond'])
console.log('mvp transaction workflow bootstrap tests passed')
