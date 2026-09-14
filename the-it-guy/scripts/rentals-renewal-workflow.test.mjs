import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const repository = await read('src/services/rentals/rentalRenewalRepository.js')
const panel = await read('src/modules/rentals/shared/tenancies/RentalRenewalPanel.jsx')
const tenancy = await read('src/pages/rentals/RentalTenancyDetailPage.jsx')

for (const token of ['rental_open_renewal', 'rental_save_renewal_terms', 'rental_decide_renewal', 'rental_generate_renewal_lease_version']) {
  assert.ok(repository.includes(token), `Renewal repository is missing protected command: ${token}`)
}
for (const token of ['Open renewal', 'Save proposed terms', 'Accept renewal', 'Decline renewal', 'Generate future lease version', 'does not replace the active lease']) {
  assert.ok(panel.includes(token), `Renewal workflow is incomplete: ${token}`)
}
assert.ok(tenancy.includes('RentalRenewalPanel'), 'Tenancy workspace does not expose renewal management.')

console.log('Rentals renewal workflow checks passed.')
