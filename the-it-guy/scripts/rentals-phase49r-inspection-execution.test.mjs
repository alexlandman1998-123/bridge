import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const repository = await read('src/services/rentals/rentalInspectionRepository.js')
const page = await read('src/pages/rentals/RentalInspectionExecutionPage.jsx')
const app = await read('src/App.jsx')

for (const command of ['rental_record_field_inspection_item', 'rental_complete_field_inspection']) assert.ok(repository.includes(command), `missing inspection execution command ${command}`)
for (const copy of ['Field inspection', 'Save item', 'Acknowledgement name', 'Signature evidence link', 'Complete inspection']) assert.ok(page.includes(copy), `missing inspection execution UI ${copy}`)
assert.ok(app.includes('/agent/rentals/inspections/:inspectionId'), 'inspection execution route missing')
console.log('Rentals Phase 49R inspection execution checks passed.')
