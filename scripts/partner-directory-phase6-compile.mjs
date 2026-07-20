#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (!process.argv.includes('--linked')) {
  console.error('Pass --linked to compile the Phase 1-6 partner migrations in a transaction that is rolled back.')
  process.exit(1)
}

const migrationPaths = [
  'supabase/migrations/202607200008_unified_partner_directory_read_model.sql',
  'supabase/migrations/202607200009_partner_identity_linking_and_deduplication.sql',
  'supabase/migrations/202607200010_canonical_partner_relationship_storage.sql',
  'supabase/migrations/202607200011_partner_role_configuration_separation.sql',
  'supabase/migrations/202607200012_canonical_partner_assignment_ids.sql',
]

const bodies = migrationPaths.map((migrationPath) => {
  const migration = readFileSync(migrationPath, 'utf8')
  const withoutBegin = migration.replace(/^\s*begin;\s*/i, '')
  const withoutCommit = withoutBegin.replace(/\bcommit;\s*$/i, '')
  if (withoutBegin === migration || withoutCommit === withoutBegin) {
    throw new Error(`${migrationPath} must have one removable outer BEGIN/COMMIT pair.`)
  }
  return `-- ${migrationPath}\n${withoutCommit.trim()}`
})

const reconciliationAssertions = String.raw`
do $$
begin
  if exists (
    select 1 from public.transaction_role_players
    where partner_role_configuration_id is null
      and (preferred_partner_id is not null or partner_relationship_id is not null)
  ) then
    raise exception 'Phase 6 reconciliation failed: transaction partner assignment is not canonical';
  end if;

  if exists (
    select 1 from public.private_listing_role_players
    where partner_role_configuration_id is null
      and (preferred_partner_id is not null or partner_relationship_id is not null)
  ) then
    raise exception 'Phase 6 reconciliation failed: private-listing partner assignment is not canonical';
  end if;

  if exists (
    select 1
    from public.transaction_role_players role_player
    join public.transactions transaction on transaction.id = role_player.transaction_id
    join public.organisation_partner_roles role_config
      on role_config.id = role_player.partner_role_configuration_id
    where role_config.organisation_id <> transaction.organisation_id
      or role_config.role_type <> public.bridge_normalize_partner_assignment_role(role_player.role_type)
  ) then
    raise exception 'Phase 6 reconciliation failed: transaction assignment ownership or role mismatch';
  end if;

  if exists (
    select 1
    from public.private_listing_role_players role_player
    join public.private_listings listing on listing.id = role_player.private_listing_id
    join public.organisation_partner_roles role_config
      on role_config.id = role_player.partner_role_configuration_id
    where role_config.organisation_id <> listing.organisation_id
      or role_config.role_type <> public.bridge_normalize_partner_assignment_role(role_player.role_type)
  ) then
    raise exception 'Phase 6 reconciliation failed: private-listing assignment ownership or role mismatch';
  end if;
end;
$$;
`

const rollbackSql = `begin;\n${bodies.join('\n\n')}\n${reconciliationAssertions}\nrollback;`

execFileSync('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', rollbackSql], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 60 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: '1' },
})

console.log('Partner directory Phase 1-6 migrations compiled successfully and were rolled back.')
