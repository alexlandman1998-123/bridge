#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationPath = 'supabase/migrations/202607200008_unified_partner_directory_read_model.sql'
const migration = readFileSync(migrationPath, 'utf8')

assert.match(migration, /create or replace function public\.bridge_list_organisation_partner_directory\s*\(/i)
assert.match(migration, /returns jsonb/i)
assert.match(migration, /language plpgsql/i)
assert.match(migration, /stable/i)
assert.match(migration, /security definer/i)
assert.match(migration, /set search_path = public, pg_temp/i)

assert.match(migration, /auth\.uid\(\)/i)
assert.match(migration, /from public\.organisation_users/i)
assert.match(migration, /membership\.organisation_id = p_organisation_id/i)
assert.match(migration, /membership\.user_id = v_user_id/i)
assert.match(migration, /'not_authenticated'/i)
assert.match(migration, /'not_authorized'/i)

for (const source of [
  'public.organisation_partners',
  'public.organisation_preferred_partners',
  'public.partner_invitations',
]) {
  assert.match(migration, new RegExp(source.replaceAll('.', '\\.'), 'i'))
}

assert.match(migration, /least|organisation_partners relationship/i)
assert.match(migration, /'organisation:' \|\| counterpart\.id::text/i)
assert.match(migration, /'external:' \|\| preferred\.id::text/i)
assert.match(migration, /matched_external\.id/i)
assert.match(migration, /lower\(trim\(preferred\.email_address\)\)/i)
assert.match(migration, /array_agg\(distinct role_type order by role_type\)/i)
assert.match(migration, /when 'agency' then 'referral_agency'/i)
assert.match(migration, /when 'attorney_firm' then 'transfer_attorney'/i)

for (const status of ['external', 'invite_pending', 'connected', 'inactive']) {
  assert.match(migration, new RegExp(`'${status}'`, 'i'))
}

for (const field of [
  'directoryId',
  'ownerOrganisationId',
  'partnerOrganisationId',
  'relationshipId',
  'externalPartnerId',
  'invitationId',
  'displayName',
  'primaryContact',
  'roles',
  'status',
  'connectionStatus',
  'invitationStatus',
  'isPreferred',
  'isActive',
  'sources',
]) {
  assert.match(migration, new RegExp(`'${field}'`, 'i'))
}

assert.match(migration, /revoke all on function public\.bridge_list_organisation_partner_directory\(uuid\)/i)
assert.match(migration, /grant execute on function public\.bridge_list_organisation_partner_directory\(uuid\)\s+to authenticated/i)
assert.doesNotMatch(migration, /grant execute[^;]+\bto\s+(?:anon|public)\b/i)

const functionBody = migration.match(/as \$\$([\s\S]+?)\$\$;/i)?.[1] || ''
assert.ok(functionBody, 'Function body was not found.')
assert.doesNotMatch(functionBody, /\binsert\s+into\b/i)
assert.doesNotMatch(functionBody, /\bupdate\s+public\./i)
assert.doesNotMatch(functionBody, /\bdelete\s+from\b/i)

console.log('Phase 1 unified partner-directory read-model contract passed.')
