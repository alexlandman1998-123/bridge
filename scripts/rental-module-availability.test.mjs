import assert from 'node:assert/strict'

import {
  RENTAL_MODULES,
  resolveRentalModuleAvailability,
} from '../the-it-guy/src/services/rentals/rentalModuleAvailability.js'

const allDisabled = resolveRentalModuleAvailability({}, RENTAL_MODULES.listings)
assert.equal(allDisabled.enabled, false)
assert.equal(allDisabled.reason, 'rentals_disabled')

const shellOnlyListings = resolveRentalModuleAvailability({
  rentalsEnabled: true,
}, RENTAL_MODULES.listings)
assert.equal(shellOnlyListings.enabled, true)

const shellOnlyApplications = resolveRentalModuleAvailability({
  rentalsEnabled: true,
}, RENTAL_MODULES.applications)
assert.equal(shellOnlyApplications.enabled, false)
assert.equal(shellOnlyApplications.reason, 'applications_disabled')

const applicationsEnabled = resolveRentalModuleAvailability({
  rentalsEnabled: true,
  rentalApplicationsEnabled: true,
}, RENTAL_MODULES.applications)
assert.equal(applicationsEnabled.enabled, true)

const shellOnlyTenancies = resolveRentalModuleAvailability({
  rentalsEnabled: true,
}, RENTAL_MODULES.tenancies)
assert.equal(shellOnlyTenancies.enabled, false)
assert.equal(shellOnlyTenancies.reason, 'leases_disabled')

const tenanciesEnabled = resolveRentalModuleAvailability({
  rentalsEnabled: true,
  rentalLeasesEnabled: true,
}, RENTAL_MODULES.tenancies)
assert.equal(tenanciesEnabled.enabled, true)

const property24Disabled = resolveRentalModuleAvailability({
  rentalsEnabled: true,
}, RENTAL_MODULES.property24)
assert.equal(property24Disabled.enabled, false)
assert.equal(property24Disabled.reason, 'property24_disabled')

console.log('rental module availability tests passed')
