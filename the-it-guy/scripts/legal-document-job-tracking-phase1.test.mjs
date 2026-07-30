import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const migrationPath = path.join(root, '..', 'supabase', 'migrations', '202607300001_legal_document_job_tracking_phase1.sql')
const migration = fs.readFileSync(migrationPath, 'utf8')

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

for (const token of [
  'create table if not exists public.legal_document_jobs',
  'job_type in (',
  "'generate_packet_version'",
  "'send_for_signature'",
  "'generate_and_send_for_signature'",
  "status in ('queued','claimed','running','succeeded','failed','cancelled')",
  'legal_document_jobs_idempotency_phase1_idx',
  'on public.legal_document_jobs (organisation_id, job_type, idempotency_key)',
  'legal_document_jobs_runnable_phase1_idx',
  'bridge_create_legal_document_job_phase1',
  'bridge_update_legal_document_job_phase1',
  'bridge_get_legal_document_job_phase1',
  'bridge_list_legal_document_jobs_for_packet_phase1',
  'bridge_can_access_legal_packet_h2',
  "'trackingOnly',true",
]) {
  assertIncludes(migration, token, 'Phase 1 job tracking migration')
}

assertMatches(
  migration,
  /revoke all on table public\.legal_document_jobs from public, anon, authenticated/i,
  'Phase 1 table must deny direct browser writes',
)
assertMatches(
  migration,
  /grant execute on function public\.bridge_create_legal_document_job_phase1[\s\S]+to service_role/i,
  'Phase 1 create RPC must be service-role only',
)
assertMatches(
  migration,
  /grant execute on function public\.bridge_update_legal_document_job_phase1[\s\S]+to service_role/i,
  'Phase 1 update RPC must be service-role only',
)
assertMatches(
  migration,
  /grant execute on function public\.bridge_get_legal_document_job_phase1[\s\S]+to authenticated,service_role/i,
  'Phase 1 get RPC must allow packet-scoped authenticated reads',
)
assertMatches(
  migration,
  /grant execute on function public\.bridge_list_legal_document_jobs_for_packet_phase1[\s\S]+to authenticated,service_role/i,
  'Phase 1 list RPC must allow packet-scoped authenticated reads',
)
assertMatches(
  migration,
  /if auth\.role\(\)<>'service_role' then[\s\S]+Service-role job tracking authority is required/i,
  'Phase 1 create/update must require service role',
)
assertMatches(
  migration,
  /p_packet_version_id is not null[\s\S]+document_packet_versions[\s\S]+packet_id=v_job\.packet_id/i,
  'Phase 1 update must reject versions from another packet',
)
assert.doesNotMatch(migration, /EdgeRuntime|waitUntil|Deno\.serve|net\.http_post|pg_cron|cron\.schedule/i)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-tracking-phase1'],
  'node scripts/legal-document-job-tracking-phase1.test.mjs',
)

console.log('Legal document job tracking phase 1 contract passed.')
