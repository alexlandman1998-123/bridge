import assert from 'node:assert/strict'
import {
  TransactionCreationIncompleteError,
  buildTransactionCreationPersistencePatch,
  createTransactionCreationLifecycle,
  getTransactionCreationIncompleteSteps,
  getTransactionCreationIssues,
  setTransactionCreationStepOutcome,
} from '../transactionCreationLifecycle.js'

const startedAt = '2026-08-31T07:00:00.000Z'
const completedAt = '2026-08-31T07:00:05.000Z'

let lifecycle = createTransactionCreationLifecycle({
  attorneyAssignmentRequired: true,
  bondOriginatorAssignmentRequired: true,
  sellerHandoffRequired: true,
  portalSetupRequired: true,
  startedAt,
})

assert.deepEqual(getTransactionCreationIncompleteSteps(lifecycle), [
  'attorney_assignment',
  'bond_originator_assignment',
  'onboarding_snapshot',
  'requirement_generation',
  'seller_handoff',
  'portal_setup',
])
assert.throws(
  () => buildTransactionCreationPersistencePatch({ lifecycle, status: 'complete', at: completedAt }),
  /cannot be completed/i,
)

for (const stepKey of [
  'attorney_assignment',
  'bond_originator_assignment',
  'onboarding_snapshot',
  'requirement_generation',
  'seller_handoff',
  'portal_setup',
]) {
  lifecycle = setTransactionCreationStepOutcome(lifecycle, stepKey, {
    status: 'complete',
    at: completedAt,
    detail: { verified: true },
  })
}

const completePatch = buildTransactionCreationPersistencePatch({
  lifecycle,
  status: 'complete',
  at: completedAt,
})
assert.equal(completePatch.creation_status, 'complete')
assert.equal(completePatch.is_active, true)
assert.equal(completePatch.creation_completed_at, completedAt)
assert.equal(completePatch.creation_incomplete_at, null)
assert.deepEqual(completePatch.creation_error, {})
assert.equal(completePatch.creation_steps.requirement_generation.detail.verified, true)

let failedLifecycle = createTransactionCreationLifecycle({
  attorneyAssignmentRequired: false,
  portalSetupRequired: true,
  startedAt,
})
failedLifecycle = setTransactionCreationStepOutcome(failedLifecycle, 'onboarding_snapshot', {
  status: 'complete',
  at: completedAt,
})
failedLifecycle = setTransactionCreationStepOutcome(failedLifecycle, 'requirement_generation', {
  status: 'failed',
  error: { code: 'PGRST205', message: 'Requirement store is unavailable.' },
  at: completedAt,
})

const incompletePatch = buildTransactionCreationPersistencePatch({
  lifecycle: failedLifecycle,
  status: 'incomplete',
  error: { code: 'TRANSACTION_CREATION_INCOMPLETE', message: 'Creation did not finish.' },
  warnings: [{ area: 'required_documents', message: 'Requirements failed.' }],
  at: completedAt,
})
assert.equal(incompletePatch.creation_status, 'incomplete')
assert.equal(incompletePatch.is_active, false)
assert.equal(incompletePatch.creation_completed_at, null)
assert.equal(incompletePatch.creation_incomplete_at, completedAt)
assert.deepEqual(incompletePatch.creation_error.incompleteSteps, ['requirement_generation', 'portal_setup'])
assert.equal(incompletePatch.creation_steps.attorney_assignment.status, 'not_required')
assert.equal(incompletePatch.creation_steps.bond_originator_assignment.status, 'not_required')
assert.equal(incompletePatch.creation_steps.requirement_generation.status, 'failed')
assert.equal(incompletePatch.creation_error.warnings[0].area, 'required_documents')

const surfaced = new TransactionCreationIncompleteError({
  transactionId: 'transaction-1',
  incompleteSteps: incompletePatch.creation_error.incompleteSteps,
})
assert.equal(surfaced.code, 'TRANSACTION_CREATION_INCOMPLETE')
assert.equal(surfaced.transactionId, 'transaction-1')
assert.match(surfaced.message, /requirement_generation/)

const issues = getTransactionCreationIssues(incompletePatch)
assert.deepEqual(issues.map(issue => issue.key), ['requirement_generation', 'portal_setup'])
assert.match(issues[0].label, /document checklist/)
assert.match(issues[0].message, /setup service is unavailable/)
assert.match(issues[1].message, /not finished/)
assert.deepEqual(getTransactionCreationIssues({...incompletePatch,creation_status:'complete'}), [])
assert.match(getTransactionCreationIssues({creation_status:'incomplete',creation_steps:{attorney_assignment:{required:true,status:'failed',error:{code:'42501',message:'row level security'}}}})[0].message,/permissions blocked/)
assert.deepEqual(getTransactionCreationIssues({creation_status:'initializing',creation_steps:{portal_setup:{required:false,status:'not_required'}}}),[])

console.log('transaction creation lifecycle tests passed')
