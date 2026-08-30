import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [migration, repository, page, app] = await Promise.all([
  read('../supabase/migrations/20260830111150_rental_landlord_portal_decisions.sql'),
  read('src/services/rentals/rentalLandlordPortalRepository.js'),
  read('src/pages/rentals/RentalLandlordPortalDecisionsPage.jsx'),
  read('src/App.jsx'),
])
assert.match(migration, /rental_landlord_portal_access/)
assert.match(migration, /rental_landlord_portal_decisions/)
assert.match(migration, /reviewed_snapshot/)
assert.match(migration, /reviewed_version_hash/)
assert.match(migration, /authority in \('full', 'view_only'\)/)
assert.match(migration, /Quote is no longer available for approval/)
assert.match(migration, /Lease version is no longer current/)
assert.match(migration, /enable row level security/)
assert.match(repository, /crypto\.randomUUID/)
assert.match(repository, /rental_submit_landlord_portal_decision/)
assert.match(page, /Maintenance quote/)
assert.match(page, /Renewal intention/)
assert.match(page, /view-only access/)
assert.match(app, /\/landlord\/rentals\/decisions/)
console.log('Rentals Phase 55 landlord decision checks passed.')
