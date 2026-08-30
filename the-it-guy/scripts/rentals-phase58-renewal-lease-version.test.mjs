import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [migration, repository, page] = await Promise.all([
  read('../supabase/migrations/20260830113409_rental_renewal_lease_version.sql'),
  read('src/services/rentals/rentalRenewalRepository.js'),
  read('src/pages/rentals/RentalRenewalWorkspacePage.jsx'),
])
assert.match(migration, /rental_renewal_lease_versions/)
assert.match(migration, /rental_lease_versions_effective_dates_no_overlap/)
assert.match(migration, /exclude using gist/)
assert.match(migration, /rental_generate_renewal_lease_version/)
assert.match(migration, /v_start<>v_source\.effective_end_date\+1/)
assert.match(migration, /v_next_number,'draft',false/)
assert.match(migration, /v_next_number,'draft',false/)
assert.match(migration, /enable row level security/)
assert.match(repository, /generateRentalRenewalLeaseVersion/)
assert.match(page, /Create future lease version/)
assert.match(page, /active lease remains unchanged/)
console.log('Rentals Phase 58 renewal lease version checks passed.')
