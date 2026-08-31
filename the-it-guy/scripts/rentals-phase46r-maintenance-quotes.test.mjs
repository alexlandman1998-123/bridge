import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const repository = await read('src/services/rentals/rentalMaintenanceRepository.js')
const page = await read('src/pages/rentals/RentalMaintenanceQuotesPage.jsx')
const app = await read('src/App.jsx')
for (const value of ['rental_submit_maintenance_quote', 'rental_record_maintenance_quote_decision', 'listRentalMaintenanceQuotes']) assert.ok(repository.includes(value), `missing quote command ${value}`)
for (const value of ['Quote comparison', 'Quote evidence link', 'Landlord name', 'Approval evidence link', 'Approve', 'Reject']) assert.ok(page.includes(value), `missing quote UI ${value}`)
assert.ok(app.includes('/agent/rentals/maintenance/quotes'), 'quote route missing')
console.log('Rentals Phase 46R maintenance quote checks passed.')
