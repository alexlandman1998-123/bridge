import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [migration, repository, page, app] = await Promise.all([
  read('../supabase/migrations/20260830112831_rental_renewal_workflow.sql'),
  read('src/services/rentals/rentalRenewalRepository.js'),
  read('src/pages/rentals/RentalRenewalWorkspacePage.jsx'),
  read('src/App.jsx'),
])
assert.match(migration, /rental_renewals/)
assert.match(migration, /rental_renewal_intentions/)
assert.match(migration, /rental_renewal_events/)
assert.match(migration, /proposal_version/)
assert.match(migration, /rental_open_renewal/)
assert.match(migration, /rental_save_renewal_terms/)
assert.match(migration, /rental_submit_renewal_intention/)
assert.match(migration, /rental_decide_renewal/)
assert.match(migration, /enable row level security/)
assert.match(repository, /rental_decide_renewal/)
assert.match(page, /Participant intentions/)
assert.match(page, /Phase 58 creates the new lease version/)
assert.match(app, /tenancies\/:tenancyId\/renewal/)
console.log('Rentals Phase 57 renewal workflow checks passed.')
