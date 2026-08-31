import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..'); const read = (path) => readFile(join(root, path), 'utf8')
const repository = await read('src/services/rentals/rentalInspectionRepository.js'); const page = await read('src/pages/rentals/RentalInspectionsPage.jsx'); const app = await read('src/App.jsx')
for (const value of ['rental_create_inspection_template', 'rental_schedule_inspection', 'rental_start_scheduled_inspection']) assert.ok(repository.includes(value), `missing inspection command ${value}`)
for (const value of ['New inspection template', 'Schedule inspection', 'Inspection queue', 'Start inspection', 'incoming','outgoing']) assert.ok(page.includes(value), `missing inspection UI ${value}`)
assert.ok(app.includes('/agent/rentals/inspections'), 'inspection route missing')
console.log('Rentals Phase 48R inspection scheduling checks passed.')
