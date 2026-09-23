import assert from 'node:assert/strict'
import { verifyProperty24SpecialistSalesProduction } from './property24-specialist-sales-production-verify.mjs'

const configuredEnvironment = {
  PROPERTY24_PRODUCTION_BASE_URL: 'https://api.property24.example',
  PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME: 'user@example.test',
  PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD: 'secret',
  PROPERTY24_PRODUCTION_API_VERSION: 'v55',
}

const verified = await verifyProperty24SpecialistSalesProduction({
  env: configuredEnvironment,
  property24: {
    fetchPropertyTypes: async () => ({
      status: 200,
      data: [
        { id: 4, description: 'House' }, { id: 5, description: 'Apartment / Flat' }, { id: 6, description: 'Townhouse' },
        { id: 8, description: 'Vacant Land / Plot' }, { id: 10, description: 'Farm' },
        { id: 11, description: 'Commercial Property' }, { id: 12, description: 'Industrial Property' },
      ],
    }),
  },
})
assert.equal(verified.status, 'PASS')
assert.equal(verified.apiVersion, 'v55')
assert.equal(verified.safety.listingWritten, false)
assert.equal(verified.propertyTypes.catalogue.matches, true)

const wrongVersion = await verifyProperty24SpecialistSalesProduction({
  env: { ...configuredEnvironment, PROPERTY24_PRODUCTION_API_VERSION: 'v53' },
})
assert.equal(wrongVersion.status, 'BLOCKED')
assert.deepEqual(wrongVersion.missingConfiguration, ['PROPERTY24_PRODUCTION_API_VERSION=v55'])
assert.equal(wrongVersion.safety.property24ApiCalled, false)

console.log('Property24 specialist sales production verification contract passed')
