import assert from 'node:assert/strict'
import {
  assessRentalManagedMigrationScaffolding,
  RENTAL_MANAGED_MIGRATION_SCAFFOLD_CONFIRMATION,
} from '../rentalManagedMigrationScaffolding.js'

assert.equal(assessRentalManagedMigrationScaffolding({ sourceBaseline: { ready: false } }).scaffoldReady, false)
assert.equal(assessRentalManagedMigrationScaffolding({ sourceBaseline: { ready: true }, existingMigrationNames: ['rental_property_foundation'] }).collisions[0], 'rental_property_foundation')
assert.equal(assessRentalManagedMigrationScaffolding({ sourceBaseline: { ready: true } }).status, 'READY_FOR_EXPLICIT_SCAFFOLD_CONFIRMATION')
const ready = assessRentalManagedMigrationScaffolding({ sourceBaseline: { ready: true }, createRequested: true, confirmation: RENTAL_MANAGED_MIGRATION_SCAFFOLD_CONFIRMATION })
assert.equal(ready.createAllowed, true)
assert.equal(ready.applyAllowed, false)
assert.equal(ready.items.length, 16)

console.log('Rental managed migration scaffolding Phase 6 contract passed.')
