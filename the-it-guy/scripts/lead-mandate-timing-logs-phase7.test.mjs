import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202608010003_legal_document_job_stage_timings_phase7.sql', import.meta.url),
  'utf8',
)
const runner = await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assertIncludes(
  migration,
  'create table if not exists public.legal_document_job_stage_timings',
  'Phase 7 timing table',
)

for (const column of [
  'job_id uuid',
  'packet_id uuid',
  'stage text not null',
  'started_at timestamptz not null',
  'completed_at timestamptz',
  'duration_ms integer',
  'status text not null',
  'error_code text',
]) {
  assertIncludes(migration, column, 'Phase 7 timing table column')
}

for (const stage of [
  'resolve_template',
  'map_mandate_data',
  'resolve_merge_fields',
  'create_editable_draft',
  'freeze_draft',
  'render_pdf',
  'certify_pdf',
  'prepare_signing_fields',
  'apply_signing_layout',
  'create_signing_links',
  'send_email',
  'record_delivery',
]) {
  assertIncludes(migration, `'${stage}'`, 'Phase 7 allowed timing stage')
}

for (const token of [
  'bridge_list_legal_document_job_stage_timings_phase7',
  'bridge_can_access_legal_packet_h2',
  'grant execute on function public.bridge_list_legal_document_job_stage_timings_phase7',
]) {
  assertIncludes(migration, token, 'Phase 7 timing inspection RPC')
}

for (const token of [
  'function normalizeErrorCode',
  'async function recordJobStageTiming',
  'async function timeJobStage',
  '.from("legal_document_job_stage_timings")',
  'phase7 stage timing write skipped',
]) {
  assertIncludes(runner, token, 'Phase 7 runner timing helper')
}

assertMatches(
  runner,
  /stage: "render_pdf"[\s\S]+callGenerateMandateFunction/,
  'Generate job should time renderer invocation.',
)
assertMatches(
  runner,
  /stage: "certify_pdf"[\s\S]+bridge_certify_native_structured_legal_pdf/,
  'Generate job should time PDF certification.',
)
assertMatches(
  runner,
  /stage: "prepare_signing_fields"[\s\S]+prepareMandateSigningEnvelopeForSendJob/,
  'Send job should time signing-field preparation.',
)
assertMatches(
  runner,
  /stage: "apply_signing_layout"[\s\S]+sourceStage: "prepare_signing_fields"/,
  'Send job should record signing-layout application.',
)
assertMatches(
  runner,
  /stage: "create_signing_links"[\s\S]+prepareSigningLinkForSendJob/,
  'Send job should time signing-link creation.',
)
assertMatches(
  runner,
  /callSigningEmailFunction[\s\S]+stage: "send_email"[\s\S]+status: emailResult\.ok \? "succeeded" : "failed"/,
  'Send job should time email delivery.',
)
assertMatches(
  runner,
  /stage: "record_delivery"[\s\S]+emailConfirmed/,
  'Send job should record delivery evidence timing.',
)

assert.equal(
  packageJson.scripts?.['test:lead-mandate-timing-logs-phase7'],
  'node scripts/lead-mandate-timing-logs-phase7.test.mjs',
)

console.log('Lead mandate timing logs phase 7 contract passed.')
