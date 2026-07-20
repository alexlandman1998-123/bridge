import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const migration = read('supabase/migrations/202607200011_partner_role_configuration_separation.sql')
const settingsApi = read('the-it-guy/src/lib/settingsApi.js')

assert.match(migration, /create table if not exists public\.organisation_partner_roles/i)
assert.match(migration, /constraint organisation_partner_roles_identity_check[\s\S]*relationship_id is not null or external_partner_id is not null/i)
assert.match(migration, /organisation_partner_roles_relationship_role_idx/i)
assert.match(migration, /organisation_partner_roles_external_role_idx/i)
assert.match(migration, /organisation_partner_roles_default_role_idx[\s\S]*where is_active and is_preferred_default/i)
assert.match(migration, /with ranked_defaults as[\s\S]*preference_rank > 1/i)

assert.match(migration, /insert into public\.organisation_partner_roles[\s\S]*from public\.organisation_preferred_partners external/i)
assert.match(migration, /insert into public\.organisation_partner_roles[\s\S]*relationshipSide', 'organisation'/i)
assert.match(migration, /insert into public\.organisation_partner_roles[\s\S]*relationshipSide', 'partner'/i)

assert.match(migration, /create trigger external_partner_role_configuration_sync/i)
assert.match(migration, /create trigger relationship_role_configuration_sync/i)
assert.match(migration, /create trigger external_partner_role_identity_detach/i)
assert.match(migration, /create trigger relationship_role_identity_detach/i)
assert.match(migration, /create or replace function public\.bridge_upsert_organisation_partner_role/i)
assert.match(migration, /create or replace function public\.bridge_list_organisation_partner_roles/i)
assert.match(migration, /bridge_phase3_can_manage_organization\(p_organisation_id\)/i)
assert.match(migration, /bridge_is_active_member\(p_organisation_id\)/i)

assert.match(migration, /rename to bridge_list_organisation_partner_directory_phase1_legacy/i)
assert.match(migration, /roleConfigurationSource', 'organisation_partner_roles'/i)
assert.match(migration, /jsonb_set\(v_partner, '\{roles\}'/i)

assert.match(migration, /alter table public\.transaction_role_players[\s\S]*partner_role_configuration_id uuid/i)
assert.match(migration, /alter table public\.private_listing_role_players[\s\S]*partner_role_configuration_id uuid/i)
assert.match(migration, /Canonical role configuration lives in organisation_partner_roles/i)
assert.match(migration, /Canonical role defaults live in organisation_partner_roles/i)
assert.match(migration, /Canonical role scope lives in organisation_partner_roles/i)

assert.match(settingsApi, /bridge_save_organisation_partner/i)
assert.match(settingsApi, /p_partner_role_configuration_id/i)

console.log('Partner directory Phase 5 role-configuration separation contract passed.')
