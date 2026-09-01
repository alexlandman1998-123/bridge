import assert from 'node:assert/strict'
import {
  TRANSACTION_JOURNEY_MATRIX_EXPECTATIONS,
  TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE,
  buildTransactionJourneyMatrixFixture,
} from '../src/services/transactionJourneyMatrixFixtureService.js'

const fixture = buildTransactionJourneyMatrixFixture()
const requiredRoles = ['buyer', 'seller', 'agent', 'developer', 'bond_originator', 'transfer_attorney']

assert.equal(fixture.environment, 'non-production')
assert.equal(fixture.transactionId, TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE.transactionId)
assert.deepEqual(Object.keys(fixture.rolePlayers).sort(), requiredRoles.sort())
assert.equal(fixture.refreshSignal.version, 9)

for (const role of requiredRoles) {
  const visibleIds = fixture.roleModels[role].activity.map((activity) => activity.id).sort()
  assert.deepEqual(visibleIds, [...TRANSACTION_JOURNEY_MATRIX_EXPECTATIONS[role]].sort(), `${role} should receive exactly the intended journey updates.`)
  assert.equal(fixture.roleModels[role].version, fixture.refreshSignal.version)
  assert.equal(fixture.roleModels[role].stage.main.key, 'XFER')
  assert.equal(fixture.roleModels[role].lanes.find((lane) => lane.key === 'transfer')?.currentStep, 'instruction_sent')
}

for (const clientRole of ['buyer', 'seller']) {
  for (const activity of fixture.roleModels[clientRole].activity) {
    assert.equal(activity.visibility, 'client_visible', `${clientRole} must never receive a professional-only update.`)
    assert.equal(activity.audience.includes(clientRole), true, `${clientRole} must only receive explicitly addressed updates.`)
    assert.deepEqual(activity.payload, {}, `${clientRole} updates must not include professional payload data.`)
  }
}

for (const activity of fixture.activityRows.filter((row) => row.visibility === 'client_visible')) {
  assert.deepEqual(activity.payload_json, {}, `${activity.id} must carry client-safe payload data only.`)
  assert.ok(activity.title && activity.description, `${activity.id} needs client-safe copy.`)
}

assert.equal(fixture.roleModels.buyer.activity.some((activity) => activity.id === 'seller-document-professional'), false)
assert.equal(fixture.roleModels.seller.activity.some((activity) => activity.id === 'buyer-document-professional'), false)
assert.equal(fixture.roleModels.bond_originator.activity.some((activity) => activity.id === 'seller-document-client'), false)

console.log('transaction journey matrix phase 3 tests passed')
