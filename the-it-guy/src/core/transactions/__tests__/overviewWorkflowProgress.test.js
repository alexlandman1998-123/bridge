import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOverviewWorkflowProgress, getExistingBondLabel, selectImmediateWorkflow } from '../overviewWorkflowProgress.js'

const workflow = (...requiredSteps) => ({ required: true, requiredSteps })
const step = (key, status, ownerRole = '') => ({ key, label: key, status, ownerRole })
const legal = { status: 'ready', snapshot: { transactionId: 'tx', revision: 3, planRevision: 3, lanes: [
  { key: 'transfer', phases: [{ tasks: [{ key: 'signed', label: 'Transfer documents being signed', status: 'in_progress', revision: 3 }] }] },
  { key: 'bond', phases: [{ tasks: [{ key: 'issued', label: 'Guarantees being prepared', status: 'waiting', revision: 3 }] }] },
  { key: 'cancellation', phases: [{ tasks: [{ key: 'figures', label: 'Waiting on cancellation figures', status: 'waiting', revision: 3 }] }] },
] } }
const rollup = { transactionId: 'tx', usedLegacyFallback: false, workflows: {
  sales_otp: workflow(step('signed_otp_received', 'complete')),
  finance_cash: { required: false, requiredSteps: [] },
  finance_bond: workflow(step('applications_submitted', 'complete'), step('feedback_received', 'pending', 'bank'), step('quote_approved', 'pending', 'buyer')),
}, transactionJourneySnapshot: { legalJourney: legal } }

test('shows current subprocesses across all applicable lanes alongside bank feedback', () => {
  const rows = buildOverviewWorkflowProgress({ transactionId: 'tx', rollup })
  assert.deepEqual(rows.map(row => row.label), ['Sales / OTP', 'Finance', 'Transfer', 'Bond registration', 'Bond cancellation'])
  assert.equal(rows[0].status, 'complete')
  assert.equal(rows[1].detail, 'Waiting on bank feedback / quotes')
  assert.equal(rows[1].status, 'waiting')
  assert.equal(rows[1].owner, 'Bank')
  assert.equal(rows[2].detail, 'Transfer documents being signed')
  assert.deepEqual(rows.map(row => row.target), ['deal_setup', 'finance', 'transfer', 'transfer', 'transfer'])
})
test('missing, legacy, mismatched and invalid snapshots do not manufacture progress', () => {
  const absent = buildOverviewWorkflowProgress({ transactionId: 'tx' })
  assert.ok(absent.every(row => row.status === 'unknown'))
  const wrong = buildOverviewWorkflowProgress({ transactionId: 'another', rollup })
  assert.ok(wrong.every(row => row.status === 'unknown'))
  const legacy = buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: { ...rollup, usedLegacyFallback: true } })
  assert.equal(legacy[1].status, 'unknown')
  const staleRevision = structuredClone(rollup)
  staleRevision.transactionJourneySnapshot.legalJourney.snapshot.lanes[0].phases[0].tasks[0].revision = 2
  assert.equal(buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: staleRevision }).at(-1).detail, 'Progress not available')
})
test('an authorised empty legal snapshot distinguishes no setup from a failed read', () => {
  const empty = structuredClone(rollup)
  empty.transactionJourneySnapshot.legalJourney.snapshot.lanes = []
  assert.equal(buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: empty }).at(-1).detail, 'Workflow not set up yet')
  empty.transactionJourneySnapshot.legalJourney.stale = true
  empty.transactionJourneySnapshot.legalJourney.snapshot.lanes = legal.snapshot.lanes
  assert.equal(buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: empty }).at(-1).note, 'Last saved progress')
})
test('finance follows a changed route and skips optional steps without claiming a bank outcome', () => {
  const cash = structuredClone(rollup)
  cash.workflows.finance_bond.required = false
  cash.workflows.finance_cash = workflow({ ...step('optional', 'pending'), required: false }, step('proof_of_funds_received', 'pending', 'buyer'))
  const finance = buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: cash })[1]
  assert.equal(finance.detail, 'Waiting on proof of funds')
  assert.equal(finance.owner, 'Buyer')
  cash.workflows.finance_bond.required = true
  assert.equal(buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: cash })[1].status, 'unknown')
})
test('existing bond distinguishes explicit yes/no from an uncaptured answer and buyer finance', () => {
  assert.equal(getExistingBondLabel({ seller_has_existing_bond: false }), 'No')
  assert.equal(getExistingBondLabel({ seller_has_existing_bond: true }), 'Yes')
  assert.equal(getExistingBondLabel({ seller_has_existing_bond: null, finance_type: 'bond', bond_amount: 500000 }), 'Not confirmed')
  assert.equal(getExistingBondLabel({ routing_profile_json: { mvpProfile: { sellerExistingBond: 'false' } }, seller_has_existing_bond: true }), 'No')
})
test('immediate progress follows the saved active workflow and advances when it completes', () => {
  const rows = buildOverviewWorkflowProgress({ transactionId: 'tx', rollup: { ...rollup, activeWorkflowKey: 'finance_bond' } })
  assert.equal(selectImmediateWorkflow(rows).key, 'finance')
  assert.equal(selectImmediateWorkflow(rows).detail, 'Waiting on bank feedback / quotes')
  rows[1].status = 'complete'
  assert.equal(selectImmediateWorkflow(rows).key, 'transfer')
  assert.equal(selectImmediateWorkflow([]).status, 'unknown')
  assert.equal(selectImmediateWorkflow(rows.map(row => ({ ...row, status: 'complete' }))).status, 'complete')
})
