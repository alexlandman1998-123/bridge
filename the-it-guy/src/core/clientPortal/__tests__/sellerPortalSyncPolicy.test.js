import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSellerPortalSyncPolicy } from '../sellerPortalSyncPolicy.js'

test('refreshes a secure seller listing until an offer creates a transaction', () => {
  const policy = resolveSellerPortalSyncPolicy({
    listingId: 'listing-1',
    hasSecureSession: true,
  })

  assert.equal(policy.mode, 'listing')
  assert.equal(policy.useListingRefresh, true)
  assert.equal(policy.listingPollingIntervalMs, 45_000)
})

test('hands refresh ownership to the transaction lane after acceptance', () => {
  const policy = resolveSellerPortalSyncPolicy({
    listingId: 'listing-1',
    transactionId: 'transaction-1',
    hasSecureSession: true,
  })

  assert.equal(policy.mode, 'transaction')
  assert.equal(policy.useListingRefresh, false)
})

test('never polls a demo or unauthenticated seller link', () => {
  assert.equal(resolveSellerPortalSyncPolicy({ listingId: 'listing-1', isDemo: true, hasSecureSession: true }).useListingRefresh, false)
  assert.equal(resolveSellerPortalSyncPolicy({ listingId: 'listing-1' }).useListingRefresh, false)
})
