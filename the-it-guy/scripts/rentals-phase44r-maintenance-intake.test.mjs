import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const repository = await read('src/services/rentals/rentalMaintenanceRepository.js')
const page = await read('src/pages/rentals/RentalMaintenancePage.jsx')
const app = await read('src/App.jsx')
const dashboard = await read('src/pages/rentals/RentalOperationsDashboardPage.jsx')

for (const value of ['rental_get_maintenance_queue', 'rental_create_maintenance_request', 'rental_acknowledge_maintenance_request']) assert.ok(repository.includes(value), `missing maintenance RPC ${value}`)
for (const value of ['Capture staff request', 'Maintenance queue', 'Acknowledge', 'Tenant portal requests feed into this same queue']) assert.ok(page.includes(value), `missing maintenance UI ${value}`)
assert.ok(app.includes('/agent/rentals/maintenance'), 'maintenance route is missing')
assert.ok(dashboard.includes("item.kind === 'maintenance'"), 'dashboard does not link maintenance attention items')
console.log('Rentals Phase 44R maintenance intake checks passed.')
