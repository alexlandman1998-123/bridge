import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function withOffersModule(run) {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  try {
    const service = await server.ssrLoadModule('/src/services/sellerPortalOffersService.js')
    await run(service)
  } finally {
    await server.close()
  }
}

test('keeps seller-review offers distinct from internal offers and exposes safe offer documents', async () => {
  await withOffersModule(({ buildSellerPortalOffersPayload }) => {
    const payload = buildSellerPortalOffersPayload([
      {
        id: 'seller-review',
        status: 'sent_to_seller',
        offerAmount: 2850000,
        buyerName: 'Buyer A',
        documents: [
          { id: 'offer-pdf', name: 'Offer to purchase', url: 'https://files.arch9.co.za/offer.pdf' },
          { id: 'unsafe', name: 'Unsafe', url: 'javascript:alert(1)' },
        ],
      },
      { id: 'private', status: 'submitted', offerAmount: 3000000, buyerName: 'Internal buyer', visibility: 'internal_only' },
    ], { askingPrice: 2900000 })

    assert.equal(payload.offers.length, 1)
    assert.equal(payload.offers[0].status, 'seller_review')
    assert.equal(payload.summary.sellerReviewCount, 1)
    assert.equal(payload.offers[0].documents.length, 1)
    assert.equal(payload.offers[0].documents[0].url, 'https://files.arch9.co.za/offer.pdf')
  })
})

test('preserves an accepted seller-visible offer for the shared sale transition', async () => {
  await withOffersModule(({ buildSellerPortalOffersPayload }) => {
    const payload = buildSellerPortalOffersPayload([{
      id: 'accepted-offer',
      status: 'accepted',
      offerAmount: 2950000,
      buyerName: 'Buyer B',
    }])

    assert.equal(payload.summary.acceptedCount, 1)
    assert.equal(payload.offers[0].status, 'accepted')
  })
})
