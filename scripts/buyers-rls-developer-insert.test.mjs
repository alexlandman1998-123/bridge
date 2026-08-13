import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608130003_buyers_member_insert_rls_repair.sql', import.meta.url),
  'utf8',
)
const api = await readFile(new URL('../the-it-guy/src/lib/api.js', import.meta.url), 'utf8')

assert.match(migration, /create policy buyers_select_member_scope[\s\S]*public\.bridge_is_active_member\(organisation_id\)/)
assert.match(migration, /create policy buyers_insert_member_scope[\s\S]*for insert to authenticated/)
assert.match(migration, /buyers_insert_member_scope[\s\S]*with check \([\s\S]*organisation_id is not null[\s\S]*public\.bridge_is_active_member\(organisation_id\)/)
assert.match(migration, /create policy buyers_update_member_scope[\s\S]*for update to authenticated/)
assert.doesNotMatch(migration, /to anon|using \(true\)|with check \(true\)/i)

assert.match(api, /async function findOrCreateBuyer\(client, \{ name, phone, email, organisationId = null \}\)/)
assert.match(api, /insertPayload\.organisation_id = normalizedOrganisationId/)
assert.match(api, /buyer = await findOrCreateBuyer\(client,[\s\S]*organisationId: resolvedOrganisationId/)
assert.match(api, /const buyerOrganisationId =[\s\S]*resolveDevelopmentOrganisationId/)
assert.match(api, /organisationId: buyerOrganisationId/)

console.log('Buyers developer insert RLS contract passed.')
