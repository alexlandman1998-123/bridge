import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [migration, repository, page, app] = await Promise.all([
  read('../supabase/migrations/20260830110700_rental_tenant_portal_actions.sql'),
  read('src/services/rentals/rentalTenantPortalRepository.js'),
  read('src/pages/rentals/RentalTenantPortalActionsPage.jsx'),
  read('src/App.jsx'),
])

assert.match(migration, /rental_tenant_portal_access/)
assert.match(migration, /rental_tenant_portal_actions/)
assert.match(migration, /enable row level security/)
assert.match(migration, /rental_submit_tenant_portal_action/)
assert.match(migration, /client_request_id/)
assert.match(migration, /Too many actions submitted/)
assert.match(migration, /canonical_record_id/)
assert.match(repository, /crypto\.randomUUID/)
assert.match(repository, /rental_submit_tenant_portal_action/)
assert.match(page, /Report maintenance/)
assert.match(page, /Submit document link/)
assert.match(page, /Send notice/)
assert.match(page, /payment reference/)
assert.match(page, /do not automatically alter your lease or account/)
assert.match(app, /\/tenant\/rentals\/actions/)
console.log('Rentals Phase 53 tenant portal action checks passed.')
