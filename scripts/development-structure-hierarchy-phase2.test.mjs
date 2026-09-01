import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migration = readFileSync(resolve(repositoryRoot, 'supabase/migrations/20260901170254_development_structure_hierarchy_phase2.sql'), 'utf8')

assert.match(migration, /create table if not exists public\.development_structure_nodes/, 'Phase 2 creates the canonical structure table')
assert.match(migration, /node_type in \('building', 'block', 'wing', 'precinct', 'floor', 'level', 'zone'\)/, 'Phase 2 supports every canonical physical node type')
assert.match(migration, /add column if not exists structure_node_id/, 'Phase 2 adds an optional structure reference to existing units')
assert.match(migration, /on delete set null/, 'Deleting a structure node never deletes sellable unit inventory')
assert.match(migration, /A structure node parent must belong to the same development/, 'Hierarchy parents cannot cross development boundaries')
assert.match(migration, /circular hierarchy/, 'Circular hierarchy references are rejected')
assert.match(migration, /A unit can only link to a structure node in its own development/, 'Units cannot cross-link into another development')
assert.match(migration, /enable row level security/, 'The new exposed table has RLS enabled')
assert.match(migration, /bridge_can_view_development_record\(development_id\)/, 'Viewing respects development access')
assert.match(migration, /bridge_can_manage_development_record\(development_id\)/, 'Structure changes require development management capability')
assert.match(migration, /notify pgrst, 'reload schema'/, 'PostgREST reloads its schema cache after the migration')

console.log('development structure hierarchy phase 2 checks passed')
