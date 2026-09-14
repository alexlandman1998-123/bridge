import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const repository = await read('src/services/rentals/rentalTenancyNoticeRepository.js')
const panel = await read('src/modules/rentals/shared/tenancies/RentalTenancyNoticePanel.jsx')
const tenancy = await read('src/pages/rentals/RentalTenancyDetailPage.jsx')
const transition = await read('../supabase/migrations/20260913130000_rental_notice_acknowledgement_transition.sql')

for (const token of ['rental_get_tenancy_notice_status', 'rental_capture_notice', 'rental_acknowledge_notice']) {
  assert.ok(repository.includes(token), `Notice repository is missing protected command: ${token}`)
}
for (const token of ['Notice and move-out', 'Capture notice', 'Acknowledge notice', 'Open move-out checklist', 'Evidence link']) {
  assert.ok(panel.includes(token), `Notice-to-move-out workflow is incomplete: ${token}`)
}
assert.ok(tenancy.includes('RentalTenancyNoticePanel'), 'Tenancy workspace does not expose the notice workflow.')
for (const token of ["status = 'notice_given'", "status = 'active'", 'rental_acknowledge_notice']) {
  assert.ok(transition.includes(token), `Acknowledged notice does not advance tenancy state: ${token}`)
}

console.log('Rentals notice-to-move-out workflow checks passed.')
