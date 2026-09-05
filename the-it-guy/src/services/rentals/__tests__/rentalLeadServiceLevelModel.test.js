import assert from 'node:assert/strict'
import { buildRentalLeadServiceLevelSummary, getRentalLeadServiceLevelOwner, getRentalLeadServiceLevelState } from '../rentalLeadServiceLevelModel.js'

const now = new Date('2026-09-05T10:00:00.000Z')
assert.equal(getRentalLeadServiceLevelState({ status: 'Pending', dueDate: '2026-09-05T09:59:00.000Z' }, now), 'overdue')
assert.equal(getRentalLeadServiceLevelState({ status: 'Pending', dueDate: '2026-09-06T09:00:00.000Z' }, now), 'at_risk')
assert.equal(getRentalLeadServiceLevelState({ status: 'Pending', dueDate: '2026-09-07T10:00:00.000Z' }, now), 'on_track')
assert.equal(getRentalLeadServiceLevelState({ status: 'Completed', dueDate: '2026-09-01T10:00:00.000Z' }, now), 'completed')
const summary = buildRentalLeadServiceLevelSummary([{ taskId: 'open', status: 'Pending', dueDate: '2026-09-07T10:00:00.000Z' }, { taskId: 'risk', status: 'Pending', dueDate: '2026-09-05T12:00:00.000Z' }, { taskId: 'late', status: 'Pending', dueDate: '2026-09-04T10:00:00.000Z' }], now)
assert.deepEqual(summary.counts, { overdue: 1, at_risk: 1, on_track: 1, completed: 0 })
assert.deepEqual(summary.queue.map((task) => task.taskId), ['late', 'risk', 'open'])
assert.equal(getRentalLeadServiceLevelOwner({ lead: { assignedAgentName: 'Nandi Agent' } }), 'Nandi Agent')
console.log('rentalLeadServiceLevelModel.test.js passed')
