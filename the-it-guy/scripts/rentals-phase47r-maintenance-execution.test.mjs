import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..'); const read = (path) => readFile(join(root, path), 'utf8')
const migration = await read('../supabase/migrations/20260831100432_rental_maintenance_execution_reopen.sql'); const repository = await read('src/services/rentals/rentalMaintenanceRepository.js'); const page = await read('src/pages/rentals/RentalMaintenanceExecutionPage.jsx'); const app = await read('src/App.jsx')
for (const value of ['work_reopened', 'rental_reopen_maintenance_request', 'A reopen reason of at least 5 characters', 'revoke all on function']) assert.ok(migration.includes(value), `missing reopen safeguard ${value}`)
for (const value of ['rental_record_maintenance_work_event', 'reopenRentalMaintenanceRequest', 'listRentalMaintenanceWorkEvents']) assert.ok(repository.includes(value), `missing execution repository ${value}`)
for (const value of ['Work execution', 'Actual cost', 'Completion evidence link', 'Reopen resolved work', 'Work history']) assert.ok(page.includes(value), `missing execution UI ${value}`)
assert.ok(app.includes('/agent/rentals/maintenance/execution'), 'execution route missing')
console.log('Rentals Phase 47R maintenance execution checks passed.')
