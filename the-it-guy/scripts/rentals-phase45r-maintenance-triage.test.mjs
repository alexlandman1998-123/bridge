import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(root, path), 'utf8')
const repository = await read('src/services/rentals/rentalMaintenanceRepository.js')
const page = await read('src/pages/rentals/RentalMaintenancePage.jsx')

assert.ok(repository.includes('rental_triage_maintenance_request'), 'triage command is not wired')
for (const value of ['Acknowledge, triage, and assign work without leaving the queue.', 'Assignee', 'Notes', 'Assign and set SLA', 'Reassign and reset SLA', 'sla_breached']) assert.ok(page.includes(value), `missing triage UI: ${value}`)
console.log('Rentals Phase 45R maintenance triage checks passed.')
