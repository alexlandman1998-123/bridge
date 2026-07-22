import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const migration = read('supabase/migrations/202607200010_canonical_partner_relationship_storage.sql')
const networkService = read('the-it-guy/src/services/partnerNetworkService.js')
const portalService = read('the-it-guy/src/services/bondPartnerPortalService.js')
const transactionApi = read('the-it-guy/src/lib/api.js')

for (const column of [
  'organisation_preferred',
  'partner_preferred',
  'accepted_by',
  'declined_by',
  'blocked_by',
  'removed_by',
  'declined_at',
  'blocked_at',
  'removed_at',
]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'))
}

assert.match(migration, /create table if not exists public\.partner_relationship_aliases/i)
assert.match(migration, /bridge_list_organisation_partner_directory\(uuid\)/i)
assert.match(migration, /relationship\.organisation_preferred else relationship\.partner_preferred/i)
assert.match(migration, /for v_legacy in[\s\S]*from public\.partner_connections/i)
assert.match(migration, /insert into public\.partner_relationship_aliases/i)
assert.match(migration, /add column if not exists partner_relationship_id uuid/i)
assert.match(migration, /bridge_resolve_partner_relationship_id/i)
assert.match(migration, /bridge_phase4_connection_payload/i)
assert.match(migration, /create or replace function public\.bridge_phase4_list_partner_connections[\s\S]*from public\.organisation_partners relationship/i)
assert.match(migration, /create or replace function public\.bridge_phase4_request_partner_connection[\s\S]*insert into public\.organisation_partners/i)
assert.match(migration, /create or replace function public\.bridge_phase4_review_partner_connection[\s\S]*update public\.organisation_partners/i)
assert.match(migration, /create or replace function public\.bridge_phase4_set_partner_preferred[\s\S]*organisation_preferred/i)
assert.match(migration, /create or replace function public\.bridge_phase4_remove_partner_connection[\s\S]*relationship_status = 'removed'/i)
assert.match(migration, /create or replace function public\.bridge_activate_partner_portal_onboarding[\s\S]*partner_relationship_id/i)
assert.match(migration, /create or replace function public\.bridge_phase7_get_network_intelligence[\s\S]*from public\.organisation_partners relationship/i)
assert.match(migration, /partner_connections_canonical_write_guard/i)
assert.match(migration, /revoke insert, update, delete on public\.partner_connections from authenticated/i)

const canonicalRuntime = migration.slice(migration.indexOf('create or replace function public.bridge_phase4_log_partner_connection_event'))
assert.doesNotMatch(canonicalRuntime, /\b(?:insert into|update|delete from) public\.partner_connections\b/i)

assert.match(networkService, /partner_relationship_id:/)
assert.doesNotMatch(networkService, /^\s*partner_connection_id:/m)
assert.match(networkService, /relationshipId: row\.relationship_id/)
assert.match(networkService, /source: 'organisation_partner'/)
assert.match(portalService, /partnerRelationshipId:/)
assert.doesNotMatch(transactionApi, /^\s*partner_connection_id:/m)

console.log('Partner directory Phase 4 canonical relationship-storage contract passed.')
