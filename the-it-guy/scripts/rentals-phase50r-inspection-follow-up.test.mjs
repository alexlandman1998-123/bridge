import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831101048_rental_inspection_comparison_follow_up.sql')
const rlsMigration = await read('../supabase/migrations/20260831101329_rental_inspection_follow_up_link_rls_policy.sql')
const repository = await read('src/services/rentals/rentalInspectionRepository.js')
const page = await read('src/pages/rentals/RentalInspectionFollowUpPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_inspection_item_maintenance_links', 'rental_get_inspection_follow_up', 'rental_create_inspection_maintenance_request', 'pg_advisory_xact_lock', 'enable row level security']) assert.ok(migration.includes(value), `missing Phase 50R backend control ${value}`)
assert.ok(rlsMigration.includes('rental_inspection_item_maintenance_links_branch_read'), 'missing bridge-table branch read policy')
for (const value of ['getRentalInspectionFollowUp', 'createRentalInspectionMaintenanceRequest']) assert.ok(repository.includes(value), `missing inspection follow-up repository command ${value}`)
for (const value of ['Inspection comparison & follow-up', 'Create maintenance request', 'Maintenance linked']) assert.ok(page.includes(value), `missing Phase 50R UI ${value}`)
assert.ok(app.includes('/agent/rentals/inspections/:inspectionId/follow-up'), 'inspection follow-up route missing')
console.log('Rentals Phase 50R inspection comparison and follow-up checks passed.')
