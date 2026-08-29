import assert from 'node:assert/strict'
import {
  clearBuyerFinanceTransactionDataLoaderCache,
  loadBuyerFinanceTransactionData,
  shouldLoadBuyerFinanceTransactionTab,
} from '../buyerFinanceTransactionDataLoader.js'

assert.equal(shouldLoadBuyerFinanceTransactionTab('buyer_profile'), true)
assert.equal(shouldLoadBuyerFinanceTransactionTab('onboarding_otp'), true)
assert.equal(shouldLoadBuyerFinanceTransactionTab('overview'), false)
assert.equal(shouldLoadBuyerFinanceTransactionTab('appointments'), false)

clearBuyerFinanceTransactionDataLoaderCache()
let requestCount = 0
let resolveRequest
const diagnostic = { transaction: { id: 'transaction-1' }, onboardingPrefill: { id: 'prefill-1' } }
const fetchDiagnostic = (payload) => {
  requestCount += 1
  assert.equal(payload.transactionId, 'transaction-1')
  return new Promise((resolve) => { resolveRequest = resolve })
}
const baseRequest = {
  organisationId: 'workspace-1',
  leadId: 'buyer-1',
  transactionId: 'transaction-1',
  fetchDiagnostic,
  now: () => 100,
}

const firstLoad = loadBuyerFinanceTransactionData(baseRequest)
const concurrentLoad = loadBuyerFinanceTransactionData(baseRequest)
assert.equal(firstLoad, concurrentLoad, 'concurrent finance and transaction loads should share one promise')
await Promise.resolve()
assert.equal(requestCount, 1)
resolveRequest(diagnostic)
assert.equal(await firstLoad, diagnostic)

assert.equal(await loadBuyerFinanceTransactionData({ ...baseRequest, now: () => 200 }), diagnostic)
assert.equal(requestCount, 1, 'a warm finance and transaction diagnostic should use the short-lived cache')

let revisionRequestCount = 0
await loadBuyerFinanceTransactionData({
  ...baseRequest,
  revision: 1,
  now: () => 201,
  fetchDiagnostic: async () => {
    revisionRequestCount += 1
    return { transaction: { id: 'transaction-1', stage: 'updated' } }
  },
})
assert.equal(revisionRequestCount, 1, 'a finance, onboarding, or transaction mutation must force a fresh diagnostic')

clearBuyerFinanceTransactionDataLoaderCache()
let failedRequestCount = 0
const failingFetcher = async () => {
  failedRequestCount += 1
  throw new Error('diagnostic unavailable')
}
await assert.rejects(
  () => loadBuyerFinanceTransactionData({ ...baseRequest, fetchDiagnostic: failingFetcher }),
  /diagnostic unavailable/,
)
await assert.rejects(
  () => loadBuyerFinanceTransactionData({ ...baseRequest, fetchDiagnostic: failingFetcher }),
  /diagnostic unavailable/,
)
assert.equal(failedRequestCount, 2, 'failed diagnostics must not enter the completed cache')

await assert.rejects(
  () => loadBuyerFinanceTransactionData({ organisationId: '', leadId: '' }),
  /requires an organisation and lead/,
)
await assert.rejects(
  () => loadBuyerFinanceTransactionData({ organisationId: 'workspace-1', leadId: 'buyer-1' }),
  /requires an offer or transaction/,
)

console.log('buyer finance and transaction data loader tests passed')
