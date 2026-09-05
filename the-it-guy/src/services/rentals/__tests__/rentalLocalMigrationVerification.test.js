import assert from 'node:assert/strict'
import { RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS } from '../rentalManagedMigrationAuthoring.js'
import { assessRentalLocalMigrationVerification, RENTAL_LOCAL_MIGRATION_VERIFY_CONFIRMATION } from '../rentalLocalMigrationVerification.js'

const entries = RENTAL_MANAGED_MIGRATION_AUTHORING_ITEMS.map((item, index) => ({ name: item.name, sourceSha256: `sha256:${index}`, migrationSha256: `sha256:${index}` }))
assert.equal(assessRentalLocalMigrationVerification({ sourceBaseline: { ready: false }, migrationEntries: entries }).verificationReady, false)
assert.equal(assessRentalLocalMigrationVerification({ sourceBaseline: { ready: true }, migrationEntries: entries.slice(1) }).missingMigrations[0], 'rental_property_foundation')
assert.equal(assessRentalLocalMigrationVerification({ sourceBaseline: { ready: true }, migrationEntries: [{ ...entries[0], migrationSha256: 'sha256:changed' }, ...entries.slice(1)] }).driftedMigrations[0], 'rental_property_foundation')
const ready = assessRentalLocalMigrationVerification({ sourceBaseline: { ready: true }, migrationEntries: entries, verifyRequested: true, confirmation: RENTAL_LOCAL_MIGRATION_VERIFY_CONFIRMATION })
assert.equal(ready.verifyAllowed, true)
assert.equal(ready.applyAllowed, false)

console.log('Rental local migration verification Phase 7 contract passed.')
