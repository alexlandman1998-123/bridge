import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831101508_rental_move_out_workflow.sql')
const indexMigration = await read('../supabase/migrations/20260831101727_rental_move_out_foreign_key_indexes.sql')
const repository = await read('src/services/rentals/rentalMoveOutRepository.js')
const page = await read('src/pages/rentals/RentalMoveOutPage.jsx')
const app = await read('src/App.jsx')

for (const value of ['rental_move_out_workflows', 'rental_move_out_checklist_items', 'rental_start_move_out_workflow', 'rental_record_move_out_checklist_item', 'rental_reschedule_move_out_inspection', 'enable row level security']) assert.ok(migration.includes(value), `missing move-out backend ${value}`)
for (const value of ['rental_move_out_workflows_organisation_id_idx', 'rental_move_out_checklist_items_completed_by_idx']) assert.ok(indexMigration.includes(value), `missing move-out foreign-key index ${value}`)
for (const value of ['getRentalMoveOutWorkflow', 'startRentalMoveOutWorkflow', 'recordRentalMoveOutItem']) assert.ok(repository.includes(value), `missing move-out repository command ${value}`)
for (const value of ['Move-out workspace', 'Start move-out workflow', 'closure blocker', 'Reschedule outgoing inspection']) assert.ok(page.includes(value), `missing move-out UI ${value}`)
assert.ok(app.includes('/agent/rentals/tenancies/:tenancyId/move-out'), 'move-out route missing')
console.log('Rentals Phase 60 move-out workflow checks passed.')
