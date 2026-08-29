import assert from 'node:assert/strict'
import {
  RENTAL_MODULE_BOUNDARY_VERSION,
  RENTAL_MODULE_PUBLIC_SURFACES,
  RENTAL_MODULE_ROUTE_IDS,
  getRentalModuleRoute,
} from '../shell/rentalModuleRegistry.js'
import { createRentalModuleApi } from '../shared/api/rentalModuleApi.js'

assert.equal(RENTAL_MODULE_BOUNDARY_VERSION, 'arch9_rentals_module_boundary_v1')
for (const surface of ['shell', 'portfolio', 'vacancies', 'applications', 'tenancies', 'collections', 'maintenance', 'inspections', 'renewals', 'portals', 'shared']) {
  assert.ok(RENTAL_MODULE_PUBLIC_SURFACES.includes(surface), `missing public rental surface: ${surface}`)
}
assert.equal(getRentalModuleRoute(RENTAL_MODULE_ROUTE_IDS.dashboard), '/agent/rentals/dashboard')
assert.equal(getRentalModuleRoute(RENTAL_MODULE_ROUTE_IDS.listingDetail), '/agent/rentals/listings/:listingId/:detailTab?')
assert.equal(getRentalModuleRoute('unknown'), '')

const listingsRepository = { list: () => [] }
const api = createRentalModuleApi({ listings: listingsRepository })
assert.equal(api.getRepository('listings'), listingsRepository)
assert.throws(() => api.getRepository('tenancies'), /Rental repository is not registered/)

console.log('Rental module boundary tests passed.')
