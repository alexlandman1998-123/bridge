import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831111015_rental_controlled_pilot_launch_gate.sql')
const repository = await read('src/services/rentals/rentalPilotLaunchRepository.js')
const page = await read('src/pages/rentals/RentalPilotLaunchPage.jsx')
const app = await read('src/App.jsx')

for (const token of ['rental_pilot_release_decisions', 'enable row level security', 'rental_financial_manager_authorized', 'rental_get_pilot_launch_gate', 'rental_record_pilot_release_decision', 'pg_advisory_xact_lock', "set search_path = ''", 'environment flag is still required', 'never enables Sales', 'revoke all on function']) assert.ok(migration.includes(token), `Missing pilot safeguard: ${token}`)
assert.ok(repository.includes("rpc('rental_get_pilot_launch_gate'"), 'Pilot launch gate must use its protected RPC.')
assert.ok(repository.includes("rpc('rental_record_pilot_release_decision'"), 'Pilot decision must use its protected RPC.')
for (const token of ['does not enable a feature', 'environment flag remains a separate action', 'Record pilot decision']) assert.ok(page.includes(token), `Missing pilot UI guard: ${token}`)
assert.ok(app.includes('/agent/rentals/pilot-launch'), 'Pilot launch route is not registered.')
console.log('Rentals Phase 80 controlled pilot gate checks passed.')
