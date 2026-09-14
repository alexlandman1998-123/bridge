import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const operationsMigration = await read('../supabase/migrations/20260831095640_rental_operations_dashboard_snapshot.sql')
const managementMigration = await read('../supabase/migrations/20260831125040_rental_management_dashboard_read_model.sql')
const managementBottomHalfMigration = await read('../supabase/migrations/20260831130316_rental_management_dashboard_bottom_half.sql')
const repository = await read('src/services/rentals/rentalOperationsDashboardRepository.js')
const page = await read('src/pages/rentals/RentalOperationsDashboardPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_get_operations_dashboard', 'security definer', "set search_path = ''", 'rental_branch_access', 'revoke all on function', 'grant execute']) assert.ok(operationsMigration.includes(value), `missing legacy dashboard safeguard: ${value}`)
for (const value of ['rental_get_management_dashboard', 'security definer', "set search_path = ''", 'rental_branch_access', 'revoke all on function', 'grant execute']) assert.ok(managementMigration.includes(value), `missing management dashboard safeguard: ${value}`)
for (const value of ['rental_get_management_dashboard_bottom_half', 'security definer', "set search_path = ''", 'rental_branch_access', 'revoke all on function', 'grant execute']) assert.ok(managementBottomHalfMigration.includes(value), `missing management dashboard detail safeguard: ${value}`)
for (const value of ["rpc('rental_get_management_dashboard'", "rpc('rental_get_management_dashboard_bottom_half'"]) assert.ok(repository.includes(value), `dashboard must use the scoped management RPC: ${value}`)
for (const value of ['Active Applications', 'Portfolio Health', 'Vacancy & Letting Performance', 'Lease & Renewal Overview', 'Collections Snapshot', 'Maintenance Overview']) assert.ok(page.includes(value), `missing dashboard surface: ${value}`)
assert.ok(!page.includes("'/agent/rentals/collections'"), 'dashboard must not expose an unavailable collections route')
assert.ok(!app.includes('Rental lead, listing, application, and lease activity will land here as the module is phased in.'), 'placeholder dashboard copy remains active')
assert.ok(app.includes('<RentalOperationsDashboardPage />'), 'dashboard route does not mount the operations dashboard')
console.log('Rentals Phase 16R dashboard checks passed.')
