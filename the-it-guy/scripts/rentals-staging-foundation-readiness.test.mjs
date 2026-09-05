import assert from 'node:assert/strict'
import {
  assessRentalStagingFoundation,
  parseSupabaseMigrationTable,
  parseSupabaseJson,
  RENTAL_STAGING_FOUNDATION_REQUIRED_OBJECTS,
} from '../src/services/rentals/rentalStagingFoundationReadiness.js'

assert.deepEqual(parseSupabaseJson('Initialising login role...\n{"rows":[{"ok":true}]}\nConnecting...'), { rows: [{ ok: true }] })
assert.deepEqual(parseSupabaseJson('{"migrations":[{"local":"1","remote":"1"}]}').migrations, [{ local: '1', remote: '1' }])
assert.deepEqual(
  parseSupabaseMigrationTable(' Local | Remote | Time (UTC)\n------|--------|----------\n `1` | `1` | `now`\n `2` | ` ` | `later`\n ` ` | `3` | `soon`'),
  [{ local: '1', remote: '1', time: 'now' }, { local: '2', remote: '', time: 'later' }, { local: '', remote: '3', time: 'soon' }],
)

const readyCatalog = Object.fromEntries(RENTAL_STAGING_FOUNDATION_REQUIRED_OBJECTS.map((name) => [name, `public.${name}`]))
const ready = assessRentalStagingFoundation({ migrations: [{ local: '1', remote: '1' }], catalog: readyCatalog })
assert.equal(ready.ready, true)

const blocked = assessRentalStagingFoundation({
  migrations: [{ local: '1', remote: '' }, { local: '', remote: '2' }],
  catalog: { rental_properties: 'rental_properties' },
})
assert.equal(blocked.ready, false)
assert.deepEqual(blocked.migrationLedger.localOnlyMigrations, ['1'])
assert.deepEqual(blocked.migrationLedger.remoteOnlyMigrations, ['2'])
assert.ok(blocked.catalog.missingObjects.includes('rental_tenancies'))
assert.match(blocked.nextAction, /Reconcile the staging migration ledger/)

console.log('Rentals staging foundation readiness checks passed.')
