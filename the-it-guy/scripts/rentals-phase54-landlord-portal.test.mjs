import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [migration, repository, page, app] = await Promise.all([
  read('../supabase/migrations/20260830111624_rental_landlord_portal_read_models.sql'),
  read('src/services/rentals/rentalLandlordPortalReadRepository.js'),
  read('src/pages/rentals/RentalLandlordPortalPage.jsx'),
  read('src/App.jsx'),
])
assert.match(migration, /rental_get_landlord_portal_portfolio/)
assert.match(migration, /relationship\.relationship_status = 'active'/)
assert.match(migration, /relationship\.effective_to >= current_date/)
assert.match(migration, /rental_financial_payments/)
assert.match(migration, /staff assignments/)
assert.match(migration, /revoke all on function/)
assert.match(repository, /rental_get_landlord_portal_portfolio/)
assert.match(page, /Landlord portfolio/)
assert.match(page, /Maintenance/)
assert.match(page, /Inspections/)
assert.match(page, /Lease documents/)
assert.match(app, /\/landlord\/rentals/)
console.log('Rentals Phase 54 landlord portal checks passed.')
