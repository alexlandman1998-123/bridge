import assert from 'node:assert/strict'
import { buildBondDashboardPerformance } from '../bondDashboardPerformanceModel.js'
const now = new Date('2026-10-20T12:00:00Z')
const tx = (id, extra = {}) => ({ transaction: { id, updated_at: now.toISOString(), ...extra } })
const submission = (id, transaction_id, submitted_at, extra = {}) => ({ id, transaction_id, submitted_at, bank_name: 'FNB', status: 'submitted', ...extra })
const rows = [tx('a', { registered_at: '2026-10-10', bond_amount: 1000000 }), tx('b'), tx('c'), tx('old', { registered_at: '2026-09-10' }), tx('future', { registered_at: '2026-11-01' }), tx('boundary', { registered_at: '2026-09-30T22:00:00Z', bond_amount: 500000 })]
const submissions = [submission('a1','a','2026-10-01', { status:'approved',feedback_received_at:'2026-10-03' }),submission('a2','a','2026-10-02',{status:'declined',feedback_received_at:'2026-10-02'}),submission('b1','b','2026-10-03',{status:'approved'}),submission('c1','c','2026-09-25'),submission('c2','c','2026-10-02'),submission('foreign','secret','2026-10-01',{status:'approved'})]
const commissions = [{id:'one',application_id:'a',status:'Pending',amount:100},{id:'two',application_id:'a',status:'Approved',amount:200},{id:'three',application_id:'b',status:'Processing',amount:300},{id:'four',application_id:'a',status:'Paid',paid_at:'2026-10-15',amount:400},{id:'oldpaid',application_id:'a',status:'Paid',paid_at:'2026-09-15',amount:999},{id:'rejected',application_id:'a',status:'Rejected',amount:999},{id:'foreign',application_id:'secret',status:'Pending',amount:999}]
const scope = { scopeLevel:'workspace_hq', organisationTargets:{monthlyRegistrations:4,monthlyRegisteredLoanValue:2000000,applications:99} }
const model = buildBondDashboardPerformance({ rows, submissions:[...submissions,submissions[0]], commissions:[...commissions,commissions[0]], reportingScope:scope, now })
assert.deepEqual(model.conversion,{submitted:2,approved:2,registered:1,approvalRate:100,registrationRate:50},'A re-submission and two banks must not inflate the cohort')
assert.equal(model.targets[0].actual,2,'Month uses SA midnight, excludes old and future registrations')
assert.equal(model.targets[0].progress,50)
assert.equal(model.targets[1].actual,1500000)
assert.equal(model.banks[0].measured,2,'Undated approvals are excluded from turnaround')
assert.equal(model.banks[0].days,1,'Same-day decision is valid and included')
assert.equal(model.commissionPipeline,600)
assert.deepEqual(model.commissions.map((item)=>item.amount),[100,200,300,400],'Ledger statuses are disjoint, deduplicated and scoped')
const consultant = buildBondDashboardPerformance({ rows, reportingScope:{...scope,scopeLevel:'assigned_only'}, now })
assert.equal(consultant.targets[0].target,0,'Organisation target cannot be compared with individual scope')
assert.equal(consultant.conversion.approvalRate,null,'No denominator means no invented percentage')
assert.equal(buildBondDashboardPerformance({reportingScope:{...scope,organisationTargets:{applications:50}},now}).targets[0].target,0,'Application targets must not be reused as registration targets')
assert.equal(buildBondDashboardPerformance({rows:[tx('updated',{stage:'registered'})],now}).targets[0].actual,0,'Updated date is never a registration event')
console.log('Bond performance model: passed')
