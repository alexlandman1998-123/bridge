import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const migrationPath = path.join(
  repoRoot,
  'supabase',
  'migrations',
  '202608140004_backend_drift_compatibility_columns.sql',
)

const sql = await readFile(migrationPath, 'utf8')

const requiredSnippets = [
  'add column if not exists branch_id uuid',
  'add column if not exists assigned_agent_email text',
  'add column if not exists organisation_name text',
  'add column if not exists workspace_id uuid',
  'add column if not exists uploaded_at timestamptz',
  'bridge_sync_backend_drift_transaction_branch',
  'bridge_sync_backend_drift_private_listing_agent_email',
  'bridge_sync_backend_drift_role_player_aliases',
  'bridge_sync_backend_drift_document_uploaded_at',
  "notify pgrst, 'reload schema'",
]

for (const snippet of requiredSnippets) {
  assert.ok(sql.includes(snippet), `Expected migration to include: ${snippet}`)
}

assert.match(
  sql,
  /update public\.transactions\s+set branch_id = assigned_branch_id/is,
  'Expected transaction branch compatibility backfill',
)

assert.match(
  sql,
  /update public\.private_listings pl\s+set assigned_agent_email = p\.email/is,
  'Expected private listing agent email compatibility backfill',
)

assert.match(
  sql,
  /update public\.transaction_role_players\s+set workspace_id = organisation_id/is,
  'Expected role player workspace compatibility backfill',
)

assert.match(
  sql,
  /update public\.documents\s+set uploaded_at = created_at/is,
  'Expected document uploaded_at compatibility backfill',
)

console.log('Backend drift compatibility migration contract verified')
