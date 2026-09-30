import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('rental insert omits an unused unit link and identifies only the missing rental field', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { __privateListingServiceTestUtils: utils } = await server.ssrLoadModule('/src/services/privateListingService.js')
    const payload = utils.buildPrivateListingPayload({
      organisationId: '11111111-1111-4111-8111-111111111111',
      listingCategory: 'rental',
      unitId: null,
      sellerCanonicalFacts: { rentalInfo: { monthlyRent: 18500 } },
    })

    assert.equal('unit_id' in payload, false)
    assert.equal(payload.seller_canonical_facts_json.rentalInfo.monthlyRent, 18500)
    assert.deepEqual(utils.missingRentalCaptureColumns({
      code: '42703',
      message: 'column private_listings.street_number does not exist',
    }), ['street_number'])
    assert.deepEqual(utils.missingRentalCaptureColumns({
      code: 'PGRST204',
      message: "Could not find the 'street_name' column of 'private_listings' in the schema cache",
    }), ['street_name'])
    assert.deepEqual(utils.missingRentalCaptureColumns({
      code: '42703',
      message: 'column private_listings.unit_id does not exist',
    }), [])
  } finally {
    await server.close()
  }
})
