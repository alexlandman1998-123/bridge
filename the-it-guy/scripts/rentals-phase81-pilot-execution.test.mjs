import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831111812_rental_pilot_execution_monitoring.sql')
const repository = await read('src/services/rentals/rentalPilotExecutionRepository.js')
const page = await read('src/pages/rentals/RentalPilotExecutionPage.jsx')
const app = await read('src/App.jsx')

for (const token of ['rental_get_pilot_execution_monitor', 'stable', 'security definer', "set search_path = ''", 'rental_financial_manager_authorized', 'rental_get_pilot_launch_gate', 'rental_pilot_release_decisions', 'rental_maintenance_requests', 'Read-only pilot observation', 'revoke all on function']) assert.ok(migration.includes(token), `Missing pilot monitoring safeguard: ${token}`)
assert.ok(repository.includes("rpc('rental_get_pilot_execution_monitor'"), 'Pilot execution page must use its protected read RPC.')
for (const token of ['read-only operational check', 'cannot activate a release', 'Attention queue']) assert.ok(page.includes(token), `Missing monitoring UI guard: ${token}`)
assert.ok(app.includes('/agent/rentals/pilot-execution'), 'Pilot execution route is not registered.')
console.log('Rentals Phase 81 pilot execution monitoring checks passed.')
