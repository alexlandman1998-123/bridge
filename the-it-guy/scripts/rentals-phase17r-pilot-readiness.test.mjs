import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831095838_rental_pilot_readiness.sql')
const repository = await read('src/services/rentals/rentalPilotReadinessRepository.js')
const page = await read('src/pages/rentals/RentalPilotReadinessPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_get_pilot_readiness', 'security definer', "set search_path = ''", 'rental_branch_access', "'portfolio'", "'leases'", "'charges'", 'No source rows are written automatically', 'revoke all on function']) assert.ok(migration.includes(value), `missing readiness safeguard: ${value}`)
assert.ok(repository.includes("rpc('rental_get_pilot_readiness')"), 'readiness repository does not call the scoped RPC')
for (const value of ['Pilot readiness', 'Readiness checks', 'Controlled pilot sequence', 'No structural pilot blockers']) assert.ok(page.includes(value), `missing readiness UI: ${value}`)
assert.ok(app.includes('/agent/rentals/pilot-readiness'), 'pilot readiness route is missing')
console.log('Rentals Phase 17R pilot readiness checks passed.')
