import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831095554_rental_operations_dashboard_snapshot.sql')
const repository = await read('src/services/rentals/rentalOperationsDashboardRepository.js')
const page = await read('src/pages/rentals/RentalOperationsDashboardPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_get_operations_dashboard', 'security definer', "set search_path = ''", 'rental_branch_access', "'managed_properties'", "'notices_to_acknowledge'", "'urgent_maintenance'", 'revoke all on function', 'grant execute']) assert.ok(migration.includes(value), `missing snapshot safeguard: ${value}`)
assert.ok(repository.includes("rpc('rental_get_operations_dashboard')"), 'dashboard must use the single snapshot RPC')
for (const value of ['Needs attention', 'Upcoming tenancy actions', 'Quick actions', 'Create vacancy', 'Operational report']) assert.ok(page.includes(value), `missing dashboard surface: ${value}`)
assert.ok(!page.includes("'/agent/rentals/collections'"), 'dashboard must not expose an unavailable collections route')
assert.ok(!app.includes('Rental lead, listing, application, and lease activity will land here as the module is phased in.'), 'placeholder dashboard copy remains active')
assert.ok(app.includes('<RentalOperationsDashboardPage />'), 'dashboard route does not mount the operations dashboard')
console.log('Rentals Phase 16R dashboard checks passed.')
