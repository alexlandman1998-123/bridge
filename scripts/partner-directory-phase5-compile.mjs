#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

if (!process.argv.includes('--linked')) {
  console.error('Pass --linked to compile the Phase 1-5 partner migrations in a transaction that is rolled back.')
  process.exit(1)
}

const migrationPaths = [
  'supabase/migrations/202607200008_unified_partner_directory_read_model.sql',
  'supabase/migrations/202607200009_partner_identity_linking_and_deduplication.sql',
  'supabase/migrations/202607200010_canonical_partner_relationship_storage.sql',
  'supabase/migrations/202607200011_partner_role_configuration_separation.sql',
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
    select 1 from public.organisation_partner_roles
    where relationship_id is null and external_partner_id is null
  ) then
    raise exception 'Phase 5 reconciliation failed: role without identity';
  end if;

  if exists (
    select 1
    from public.organisation_partner_roles role_config
    join public.organisation_preferred_partners external
      on external.id = role_config.external_partner_id
    where role_config.organisation_id <> external.organisation_id
  ) then
    raise exception 'Phase 5 reconciliation failed: external identity owner mismatch';
  end if;

  if exists (
    select 1
    from public.organisation_partner_roles
    where is_active and is_preferred_default
    group by organisation_id, role_type
    having count(*) > 1
  ) then
    raise exception 'Phase 5 reconciliation failed: duplicate active default';
  end if;

  if exists (
    select 1
    from public.organisation_preferred_partners external
    left join public.organisation_partner_roles role_config
      on role_config.organisation_id = external.organisation_id
      and role_config.external_partner_id = external.id
      and role_config.role_type = public.bridge_normalize_partner_role_type(external.partner_type)
    where role_config.id is null
  ) then
    raise exception 'Phase 5 reconciliation failed: external identity role missing';
  end if;

  if exists (
    select 1
    from public.organisation_partners relationship
    cross join lateral (values
      (relationship.organisation_id),
      (relationship.partner_organisation_id)
    ) owner(organisation_id)
    left join public.organisation_partner_roles role_config
      on role_config.relationship_id = relationship.id
      and role_config.organisation_id = owner.organisation_id
    where role_config.id is null
  ) then
    raise exception 'Phase 5 reconciliation failed: relationship-side role missing';
  end if;
end;
$$;
`

const rollbackSql = `begin;\n${bodies.join('\n\n')}\n${reconciliationAssertions}\nrollback;`

execFileSync('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', rollbackSql], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 50 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: '1' },
})

console.log('Partner directory Phase 1-5 migrations compiled successfully and were rolled back.')
