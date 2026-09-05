import assert from 'node:assert/strict'
import { buildRentalLeadManagementReport } from '../rentalLeadManagementReportModel.js'

const report = buildRentalLeadManagementReport({ now: new Date('2026-09-05T10:00:00.000Z'), leads: [{ id: 'a', assignedAgentName: 'Nandi', branchId: 'cape-town', createdAt: '2026-09-04T10:00:00.000Z', outcome: { status: 'open' } }, { id: 'b', assignedAgentName: 'Nandi', branchId: 'cape-town', createdAt: '2026-08-01T10:00:00.000Z', outcome: { status: 'won' } }, { id: 'c', assignedAgentName: 'Lebo', branchId: 'johannesburg', createdAt: '2026-08-15T10:00:00.000Z', outcome: { status: 'lost' } }], tasks: [{ taskId: 'late', lead: { assignedAgentName: 'Nandi', branchId: 'cape-town' }, status: 'Pending', dueDate: '2026-09-04T10:00:00.000Z' }, { taskId: 'open', lead: { assignedAgentName: 'Lebo', branchId: 'johannesburg' }, status: 'Pending', dueDate: '2026-09-06T10:00:00.000Z' }] })
assert.equal(report.totals.leads, 3)
assert.equal(report.totals.active, 1)
assert.equal(report.totals.won, 1)
assert.equal(report.totals.overdue, 1)
assert.equal(report.agents.find((row) => row.label === 'Nandi').leads, 2)
assert.equal(report.branches.find((row) => row.label === 'cape-town').lost, 0)
assert.equal(report.ageing['0_2'], 1)
console.log('rentalLeadManagementReportModel.test.js passed')
