import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve('..', 'supabase', 'migrations', '202607150002_canonical_otp_template_versioning_phase2.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

for (const table of [
  'document_template_field_mappings',
  'document_template_approvals',
  'approved_special_conditions',
  'document_generation_runs',
]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`), `${table} must be created`)
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`)
}

for (const pointer of ['live_version_id', 'candidate_version_id', 'previous_live_version_id']) {
  assert.match(sql, new RegExp(`add column if not exists ${pointer}`), `${pointer} must be retained on the master template`)
}

assert.match(sql, /document_model in \('legacy_sectioned', 'single_master_document'\)/)
assert.match(sql, /where status = 'published'/)
assert.match(sql, /status in \(\s*'draft',\s*'awaiting_approval',\s*'approved'/)
assert.match(sql, /is_variable_legal_text boolean not null default false/)
assert.match(sql, /not is_variable_legal_text or coverage_type = 'approved_clause'/)
assert.match(sql, /public\.bridge_is_org_admin\(organisation_id\)/)
assert.match(sql, /public\.bridge_is_active_member\(organisation_id\)/)

console.log('Canonical OTP Phase 2 schema contract passed.')
