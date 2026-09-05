import assert from 'node:assert/strict'
import { buildRentalLeadAutomationFollowUp, buildRentalLeadAutomationQueue } from '../rentalLeadAutomationModel.js'

const now = new Date('2026-09-05T10:00:00.000Z')
const queue = buildRentalLeadAutomationQueue({ now, leads: [{ id: 'new', stage: 'new' }, { id: 'mandate', stage: 'mandate_pending' }, { id: 'fica', stage: 'fica_pending' }, { id: 'covered', stage: 'new' }], tasks: [{ taskId: 'late', leadId: 'new', title: 'Call tenant', status: 'Pending', dueDate: '2026-09-04T10:00:00.000Z' }, { taskId: 'open', leadId: 'covered', title: 'Existing task', status: 'Pending', dueDate: '2026-09-06T10:00:00.000Z' }] })
assert.equal(queue.length, 3)
assert.equal(queue[0].type, 'overdue_follow_up')
assert.equal(queue.find((item) => item.leadId === 'mandate').type, 'mandate_follow_up')
assert.equal(queue.find((item) => item.leadId === 'fica').type, 'fica_follow_up')
const draft = buildRentalLeadAutomationFollowUp(queue.find((item) => item.leadId === 'mandate'), now)
assert.equal(draft.priority, 'High')
assert.throws(() => buildRentalLeadAutomationFollowUp(queue[0], now), /cannot create/)
console.log('rentalLeadAutomationModel.test.js passed')
