import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexMigration = await readFile(
  new URL('../../supabase/migrations/202608020004_legal_document_jobs_hot_path_indexes.sql', import.meta.url),
  'utf8',
)
const opsSql = await readFile(
  new URL('../sql/legal-document-generator-operational-health.sql', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

for (const token of [
  'legal_document_jobs_watchdog_generate_created_idx',
  "where job_type = 'generate_packet_version'",
  "status in ('queued','claimed','running','failed')",
  'legal_document_jobs_packet_created_idx',
  'on public.legal_document_jobs (packet_id, created_at desc)',
]) {
  assertIncludes(indexMigration, token, 'Legal document job hot-path index migration')
}

for (const token of [
  'create index concurrently if not exists legal_document_jobs_watchdog_generate_created_idx',
  'create index concurrently if not exists legal_document_jobs_packet_created_idx',
  'from pg_stat_activity',
  'from public.legal_document_jobs',
  'from public.legal_document_job_stage_timings',
  'from storage.objects',
  "metadata_json->>'byteLength'",
  "metadata->>'size'",
  'Disk IO Budget',
  'Do not upgrade storage unless',
]) {
  assertIncludes(opsSql, token, 'Legal document generator operational health SQL')
}

assert.equal(
  packageJson.scripts?.['test:legal-document-generator-operational-health'],
  'node scripts/legal-document-generator-operational-health.test.mjs',
)

console.log('Legal document generator operational health contract passed.')
