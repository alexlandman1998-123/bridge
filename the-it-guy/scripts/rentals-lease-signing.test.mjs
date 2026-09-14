import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const repository = await read('src/services/rentals/rentalLeaseSigningRepository.js')
const panel = await read('src/modules/rentals/shared/tenancies/RentalLeaseSigningPanel.jsx')
const tenancy = await read('src/pages/rentals/RentalTenancyDetailPage.jsx')
const maintenance = await read('src/pages/rentals/RentalMaintenancePage.jsx')
const inspections = await read('src/pages/rentals/RentalInspectionsPage.jsx')
const leaseVersionSeed = await read('../supabase/migrations/20260913123000_rental_lease_version_seed_for_conversions.sql')

for (const token of ['rental_save_lease_draft', 'rental_prepare_lease_signing', 'rental_record_lease_signature']) {
  assert.ok(repository.includes(token), `Lease signing repository does not use protected command: ${token}`)
}
for (const token of ['Lease terms and signatures', 'Save lease draft', 'Prepare signing', 'Record signature', 'Landlord name']) {
  assert.ok(panel.includes(token), `Lease workflow is missing an essential step: ${token}`)
}
assert.ok(tenancy.includes('RentalLeaseSigningPanel'), 'Tenancy detail does not expose lease signing.')
for (const token of ['rental_seed_initial_lease_version', 'trg_rental_leases_seed_initial_version', 'where not exists (select 1 from public.rental_lease_versions']) {
  assert.ok(leaseVersionSeed.includes(token), `Converted leases are not guaranteed an initial version: ${token}`)
}
for (const source of [maintenance, inspections]) {
  assert.ok(source.includes('useSearchParams'), 'Operations workspace does not accept tenancy context.')
  assert.ok(source.includes("searchParams.get('tenancyId')"), 'Operations workspace does not prefill the tenancy context.')
}

console.log('Rentals lease signing and tenancy-context workflow checks passed.')
