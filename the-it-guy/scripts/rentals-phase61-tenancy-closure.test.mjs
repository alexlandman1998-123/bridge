import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831101838_rental_tenancy_closure_and_vacancy.sql')
const indexMigration = await read('../supabase/migrations/20260831102006_rental_tenancy_closure_organisation_index.sql')
const repository = await read('src/services/rentals/rentalTenancyClosureRepository.js')
const page = await read('src/pages/rentals/RentalTenancyClosurePage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_tenancy_closures', 'rental_get_tenancy_closure', 'rental_close_tenancy', 'pg_advisory_xact_lock', "active_tenancy_id is distinct from v_tenancy.id", 'enable row level security']) assert.ok(migration.includes(value), `missing tenancy closure backend ${value}`)
assert.ok(indexMigration.includes('rental_tenancy_closures_organisation_id_idx'), 'missing tenancy closure organisation foreign-key index')
for (const value of ['getRentalTenancyClosure', 'closeRentalTenancy']) assert.ok(repository.includes(value), `missing tenancy closure repository command ${value}`)
for (const value of ['Tenancy closure review', 'Create a draft vacancy', 'Tenancy closed', 'Close tenancy']) assert.ok(page.includes(value), `missing tenancy closure UI ${value}`)
assert.ok(app.includes('/agent/rentals/tenancies/:tenancyId/closure'), 'tenancy closure route missing')
console.log('Rentals Phase 61 tenancy closure checks passed.')
