import assert from 'node:assert/strict'
import { buildRentalLeadFollowUpDraft, getRentalLeadFollowUpState, sortRentalLeadFollowUps, validateRentalLeadFollowUp } from '../rentalLeadFollowUpModel.js'

assert.equal(buildRentalLeadFollowUpDraft({ id: 'lead-1', role: 'tenant', stage: 'qualified', name: 'Ava' }).title, 'Schedule viewing')
assert.match(validateRentalLeadFollowUp({}).join(' '), /Choose a rental lead/)
assert.equal(getRentalLeadFollowUpState({ status: 'Pending', dueDate: '2026-09-01T08:00:00Z' }, new Date('2026-09-02T08:00:00Z')), 'overdue')
assert.equal(sortRentalLeadFollowUps([{ taskId: 'open', dueDate: '2026-09-04' }, { taskId: 'overdue', dueDate: '2026-09-01' }], new Date('2026-09-02'))[0].taskId, 'overdue')
console.log('Rental lead follow-up model tests passed.')
