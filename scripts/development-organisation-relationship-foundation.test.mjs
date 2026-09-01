import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = resolve(repositoryRoot, 'supabase/migrations/20260901110612_development_organisation_relationship_foundation.sql')
const apiPath = resolve(repositoryRoot, 'the-it-guy/src/lib/api.js')
const migration = readFileSync(migrationPath, 'utf8')
const api = readFileSync(apiPath, 'utf8')

function expect(fragment, message) {
  assert.match(migration, fragment, message)
}

expect(/create table if not exists public\.development_organisation_relationships/i, 'creates the canonical organisation-development relationship')
expect(/relationship_type in \([\s\S]*'owner',[\s\S]*'primary_operator',[\s\S]*'selling_agency'/i, 'models owner, operator, and selling-agency responsibilities')
expect(/can_manage_inventory boolean not null default false/i, 'separates inventory control from general access')
expect(/insert into public\.development_organisation_relationships[\s\S]*'primary_operator'[\s\S]*legacy_developments\.organisation_id/i, 'backfills the legacy organisation as primary operator')
expect(/create trigger trg_development_seed_primary_operator[\s\S]*after insert on public\.developments/i, 'creates a relationship for newly created developments')
expect(/bridge_has_development_relationship_capability[\s\S]*requested_capability text/i, 'uses capability-aware relationship access')
expect(/bridge_can_manage_development_record[\s\S]*bridge_has_development_relationship_capability\(target_development_id, 'manage'\)/i, 'management is relationship-based')
assert.doesNotMatch(
  migration.match(/create or replace function public\.bridge_can_manage_development_record[\s\S]*?\$\$;/i)?.[0] || '',
  /bridge_has_development_access/i,
  'a user-level participant grant cannot become a management grant',
)
expect(/bridge_can_manage_development_units[\s\S]*bridge_has_development_relationship_capability\(target_development_id, 'inventory'\)/i, 'unit changes require inventory control')
expect(/revoke all on table public\.development_organisation_relationships from anon, authenticated/i, 'removes default public-table grants')
expect(/alter table public\.development_organisation_relationships enable row level security/i, 'enables RLS on the new public table')
assert.match(api, /from\('development_organisation_relationships'\)/, 'portfolio loading resolves a workspace through development relationships')
assert.match(api, /\.eq\('status', 'active'\)/, 'portfolio loading ignores inactive relationships')

console.log('development organisation relationship foundation checks passed')
