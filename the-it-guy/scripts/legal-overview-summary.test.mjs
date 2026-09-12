import assert from 'node:assert/strict'
import { buildLegalOverviewSummary } from '../src/core/transactions/legalOverviewSummary.js'
const phases = [
  { label: 'Instruction & File Opening', tasks: [{ key: 'instruction_received', label: 'Instruction Received', status: 'completed' }] },
  { label: 'FICA & Authority', tasks: [{ key: 'buyer_fica', label: 'Review & Approve Buyer FICA', status: 'not_started' }] },
]
phases.forEach(phase => phase.tasks.forEach(task => { task.revision = 1 }))
const journey = { status: 'ready', snapshot: { transactionId: 'matter', revision: 1, planRevision: 1, lanes: [{ key: 'transfer', phases }] } }
let result = buildLegalOverviewSummary('matter', journey)
assert.equal(result.stageLabel, 'FICA & Authority')
assert.equal(result.title, 'Review & Approve Buyer FICA')
assert.equal(result.target, 'transfer')
phases[0].tasks[0].status = 'not_started'
assert.equal(buildLegalOverviewSummary('matter', journey).taskKey, 'instruction_received', 'Reopen must move the summary back')
phases[0].tasks[0].status = 'completed_externally'
phases[1].tasks[0].status = 'not_applicable'
assert.equal(buildLegalOverviewSummary('matter', journey).stageLabel, 'Legal work complete')
assert.equal(buildLegalOverviewSummary('other', journey), null)
assert.equal(buildLegalOverviewSummary('matter', {status:'unavailable'}), null)
assert.equal(buildLegalOverviewSummary('matter', journey, 'bond'), null)
journey.snapshot.planRevision = 2
assert.equal(buildLegalOverviewSummary('matter', journey), null, 'Mixed revisions must not publish a stage')
console.log('PASS: legal overview follows saved outcomes, external completion, N/A, reopen and matter boundaries')
