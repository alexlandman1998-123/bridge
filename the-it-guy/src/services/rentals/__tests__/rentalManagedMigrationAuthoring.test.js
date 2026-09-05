import assert from 'node:assert/strict'
import { buildRentalManagedMigrationAuthoringWorkOrder } from '../rentalManagedMigrationAuthoring.js'

const blocked = buildRentalManagedMigrationAuthoringWorkOrder({ authoringAllowed: false })
assert.equal(blocked.status, 'BLOCKED_PENDING_SOURCE_LOCK')
assert.equal(blocked.scaffoldAllowed, false)
assert.equal(blocked.applyAllowed, false)
assert.equal(blocked.items.length, 16)

const ready = buildRentalManagedMigrationAuthoringWorkOrder({ authoringAllowed: true, chainSha256: `sha256:${'a'.repeat(64)}` })
assert.equal(ready.status, 'READY_FOR_SCAFFOLDING_ONLY')
assert.equal(ready.scaffoldAllowed, true)
assert.equal(ready.applyAllowed, false)
assert.equal(ready.items[0].name, 'rental_property_foundation')
assert.equal(ready.items.at(-1).name, 'rental_application_tenancy_conversion')

console.log('Rental managed migration authoring Phase 6 contract passed.')
