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
  '202608140005_performance_hardening_hot_path_indexes.sql',
)

const sql = await readFile(migrationPath, 'utf8')

const requiredIndexes = [
  'organisation_users_user_created_hot_path_idx',
  'organisation_users_lower_coalesced_email_hot_path_idx',
  'attorney_firm_members_user_created_hot_path_idx',
  'transaction_participants_user_role_tx_hot_path_idx',
  'transaction_participants_email_role_tx_hot_path_idx',
  'transactions_org_assigned_agent_email_hot_path_idx',
  'transactions_org_assigned_attorney_email_hot_path_idx',
  'transactions_org_assigned_bond_originator_email_hot_path_idx',
  'transactions_org_assigned_agent_id_hot_path_idx',
  'private_listings_org_agent_updated_visible_hot_path_idx',
  'private_listings_org_updated_visible_hot_path_idx',
  'transaction_role_players_org_role_tx_hot_path_idx',
  'transaction_bond_applications_assigned_user_tx_hot_path_idx',
  'document_requests_transaction_created_hot_path_idx',
]

for (const indexName of requiredIndexes) {
  assert.ok(sql.includes(`create index if not exists ${indexName}`), `Expected index: ${indexName}`)
}

assert.ok(sql.includes("notify pgrst, 'reload schema'"), 'Expected PostgREST schema reload')
assert.ok(!/security\s+definer/i.test(sql), 'Performance index migration must not add security definer code')

assert.match(
  sql,
  /on public\.private_listings \(organisation_id, assigned_agent_id, updated_at desc\)/i,
  'Expected private listing agent dashboard index shape',
)

assert.match(
  sql,
  /on public\.transaction_role_players \(organisation_id, role_type, transaction_id\)/i,
  'Expected role-player organisation/role lookup index shape',
)

assert.match(
  sql,
  /on public\.document_requests \(transaction_id, created_at desc\)/i,
  'Expected document request dashboard ordering index shape',
)

console.log('Performance hot-path index migration contract verified')
