import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function createMockRpcClient(result) {
  const calls = []
  return {
    calls,
    rpc(name, payload) {
      calls.push({ name, payload })
      return Promise.resolve(result)
    },
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    __privateListingServiceTestUtils,
  } = await server.ssrLoadModule('/src/services/privateListingService.js')

  const acceptedFormData = {
    sellerFirstName: 'Jane',
    sellerSurname: 'Seller',
    email: 'jane@example.com',
    phone: '+27000000000',
    platformFeeConsent: {
      accepted: true,
      acceptedAt: '2026-07-29T08:00:00.000Z',
      feeAmount: '750.00',
      currency: 'ZAR',
      wordingVersion: 'seller-platform-fee-v1',
      wordingSnapshot: 'Seller fee wording',
    },
    propertyDisclosure: {
      generatedDocument: {
        id: 'property-disclosure-listing-1',
      },
    },
  }

  const deferredClient = createMockRpcClient({
    data: null,
    error: {
      code: '22023',
      message: 'Seller platform fee consent requires a linked transaction.',
    },
  })
  const deferredResult = await __privateListingServiceTestUtils.acceptSellerPlatformFeeConsent(deferredClient, {
    token: 'seller-token',
    formData: acceptedFormData,
    listing: {
      seller: { name: 'Jane Seller', email: 'jane@example.com', phone: '+27000000000' },
    },
  })

  assert.equal(deferredResult.deferred, true)
  assert.equal(deferredResult.reason, 'transaction_not_linked')
  assert.equal(deferredClient.calls.length, 1)
  assert.equal(deferredClient.calls[0].name, 'bridge_accept_seller_platform_fee_consent')
  assert.equal(deferredClient.calls[0].payload.p_acceptance.relatedDocumentId, '')

  const timeoutClient = createMockRpcClient({
    data: null,
    error: {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    },
  })
  const timeoutResult = await __privateListingServiceTestUtils.acceptSellerPlatformFeeConsent(timeoutClient, {
    token: 'seller-token',
    formData: acceptedFormData,
    listing: {
      seller: { name: 'Jane Seller', email: 'jane@example.com', phone: '+27000000000' },
    },
  })

  assert.equal(timeoutResult.deferred, true)
  assert.equal(timeoutResult.reason, 'projection_timeout')
  assert.equal(timeoutClient.calls.length, 1)
  assert.equal(timeoutClient.calls[0].name, 'bridge_accept_seller_platform_fee_consent')

  const uncheckedClient = createMockRpcClient({ data: null, error: null })
  await assert.rejects(
    () => __privateListingServiceTestUtils.acceptSellerPlatformFeeConsent(uncheckedClient, {
      token: 'seller-token',
      formData: {
        ...acceptedFormData,
        platformFeeConsent: { ...acceptedFormData.platformFeeConsent, accepted: false },
      },
    }),
    /Please acknowledge the ARCH9 Transaction Platform Fee authorisation/,
  )
  assert.equal(uncheckedClient.calls.length, 0)
} finally {
  await server.close()
}

console.log('private listing seller platform fee consent projection passed')
