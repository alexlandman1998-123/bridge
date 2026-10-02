import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetupReadiness } from '../dealSetupReadiness.js'

const setup = { transactionId: 't', buyers: [{}], primaryBuyerId: 'b', terms: { purchaserType: 'individual', purchasePrice: 100, depositAmount: 0 }, finance: { type: 'cash', cashAmount: 100 } }

test('missing documents do not block otherwise valid deal setup', () => {
  const result = buildDealSetupReadiness({ setup, requirements: [{ label: 'Proof of funds', owner: 'Buyer', satisfiedByProfile: false }] })
  assert.equal(result.ready, true)
  assert.equal(result.blockerCount, 0)
  assert.deepEqual(result.blockers, [])
  assert.equal(result.missingRequirementCount, 1)
  assert.deepEqual(result.documentRequirementIssues, ['Proof of funds is required from Buyer.'])
})

test('reusable documents do not make invalid setup ready', () => {
  const result = buildDealSetupReadiness({ setup: { ...setup, finance: { type: 'cash', cashAmount: 90 } }, requirements: [{ label: 'Proof of funds', owner: 'Buyer', satisfiedByProfile: true }] })
  assert.equal(result.ready, false)
  assert.equal(result.missingRequirementCount, 0)
  assert.ok(result.blockers.some((issue) => issue.includes('must equal the purchase price')))
  assert.deepEqual(result.documentRequirementIssues, [])
  assert.equal(Object.hasOwn(result, 'documentsReady'), false)
})
