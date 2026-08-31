import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831111956_rental_pilot_review_log.sql')
const repository = await read('src/services/rentals/rentalPilotReviewRepository.js')
const page = await read('src/pages/rentals/RentalPilotReviewsPage.jsx')
const app = await read('src/App.jsx')

for (const token of ['rental_pilot_reviews', 'enable row level security', 'rental_financial_manager_authorized', 'rental_record_pilot_review', 'rental_get_pilot_reviews', 'pg_advisory_xact_lock', "set search_path = ''", 'action_taken', 'never release switches', 'revoke all on function']) assert.ok(migration.includes(token), `Missing review-log safeguard: ${token}`)
assert.ok(repository.includes("rpc('rental_get_pilot_reviews'"), 'Pilot reviews must use the protected read RPC.')
assert.ok(repository.includes("rpc('rental_record_pilot_review'"), 'Pilot review writes must use the protected RPC.')
for (const token of ['Governance only', 'does not activate, pause, or close a pilot', 'Review history']) assert.ok(page.includes(token), `Missing review UI guard: ${token}`)
assert.ok(app.includes('/agent/rentals/pilot-reviews'), 'Pilot review route is not registered.')
console.log('Rentals Phase 82 pilot review log checks passed.')
