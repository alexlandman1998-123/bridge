import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const repository = await read('src/services/rentals/rentalTenancyMoveInRepository.js')
const panel = await read('src/modules/rentals/shared/tenancies/RentalMoveInPanel.jsx')
const tenancy = await read('src/pages/rentals/RentalTenancyDetailPage.jsx')
const conversion = await read('src/modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx')

for (const token of ['rental_get_tenancy_workspace_summary', 'rental_record_move_in_readiness', 'rental_start_incoming_inspection', 'rental_activate_tenancy']) {
  assert.ok(repository.includes(token), `Move-in repository does not use the protected tenancy command: ${token}`)
}
for (const token of ['Move-in and activation', 'Verify evidence', 'Start incoming inspection', 'Activate tenancy', 'Fully signed lease', 'Completed incoming inspection and handover']) {
  assert.ok(panel.includes(token), `Move-in workspace is missing an operational step: ${token}`)
}
assert.ok(tenancy.includes('RentalMoveInPanel'), 'Tenancy detail does not expose move-in controls.')
for (const token of ['Open tenancy workspace', 'signing, move-in readiness, inspection, and activation']) {
  assert.ok(conversion.includes(token), `Approved application does not continue into tenancy setup: ${token}`)
}

console.log('Rentals tenancy move-in workflow checks passed.')
