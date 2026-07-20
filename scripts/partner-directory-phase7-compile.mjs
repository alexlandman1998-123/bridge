#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (!process.argv.includes('--linked')) {
  console.error('Pass --linked to compile the Phase 1-7 partner migrations in a transaction that is rolled back.')
  process.exit(1)
}

const migrationPaths = [
  'supabase/migrations/202607200008_unified_partner_directory_read_model.sql',
  'supabase/migrations/202607200009_partner_identity_linking_and_deduplication.sql',
  'supabase/migrations/202607200010_canonical_partner_relationship_storage.sql',
  'supabase/migrations/202607200011_partner_role_configuration_separation.sql',
  'supabase/migrations/202607200012_canonical_partner_assignment_ids.sql',
  'supabase/migrations/202607200013_retire_legacy_partner_paths.sql',
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

const assertions = String.raw`
do $$
begin
  if has_table_privilege('authenticated', 'public.partner_connections', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.organisation_preferred_partners', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.developer_partner_relationships', 'INSERT,UPDATE,DELETE') then
    raise exception 'Phase 7 reconciliation failed: authenticated legacy table write remains';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.bridge_allocate_private_listing_transfer_attorney(uuid,uuid,text,text,text,text,uuid,text,uuid,timestamptz,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.bridge_phase4_list_partner_connections(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Phase 7 reconciliation failed: authenticated legacy RPC execute remains';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.bridge_save_organisation_partner(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.bridge_list_partner_connections_canonical(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Phase 7 reconciliation failed: canonical RPC grant missing';
  end if;
end;
$$;
`

const rollbackSql = `begin;\n${bodies.join('\n\n')}\n${assertions}\nrollback;`

execFileSync('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', rollbackSql], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 70 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: '1' },
})

console.log('Partner directory Phase 1-7 migrations compiled successfully and were rolled back.')
