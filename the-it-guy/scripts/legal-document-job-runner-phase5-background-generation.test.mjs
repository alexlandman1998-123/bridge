import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const functionPath = path.join(root, '..', 'supabase', 'functions', 'legal-document-job-runner', 'index.ts')
const source = fs.readFileSync(functionPath, 'utf8')

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(haystack, pattern, label) {
  assert.match(haystack, pattern, `${label} did not match ${pattern}`)
}

for (const token of [
  'createGenerateReadyJobAndRun',
  'runGeneratePacketVersionJob',
  'generate_ready_packet',
  'callGenerateMandateFunction',
  '/functions/v1/generate-mandate',
  'bridge_create_legal_document_job_phase1',
  'generate_packet_version',
  'bridge_create_document_packet_version_i1',
  'bridge_certify_native_structured_legal_pdf',
  'bridge_release_generation_lease_i3',
  'legal-document-job-runner-phase5-background-generation-v1',
  'phase5BackgroundGeneration: true',
  'documentGenerated: true',
  'emailSent: false',
  'queueBackgroundTask',
  'EdgeRuntime.waitUntil',
  'LEGAL_DOCUMENT_BACKGROUND_GENERATION_MANDATE_ONLY',
  'authorizeServiceCredential',
  'LEGAL_DOCUMENT_WATCHDOG_AUTH_REQUIRED',
]) {
  assertIncludes(source, token, 'Phase 5 background generation runner')
}

assertMatches(
  source,
  /if \(action === "generate_ready_packet"\) \{[\s\S]+resolveInvocationAuthority[\s\S]+createGenerateReadyJobAndRun/,
  'Runner must expose an authenticated background generation action',
)
assertMatches(
  source,
  /p_job_type: "generate_packet_version"[\s\S]+p_request_payload_json:[\s\S]+rendererRequest[\s\S]+versionInput/,
  'Background generation must create a tracked generate_packet_version job with renderer and version payloads',
)
assertMatches(
  source,
  /callGenerateMandateFunction[\s\S]+bridge_create_document_packet_version_i1[\s\S]+bridge_certify_native_structured_legal_pdf[\s\S]+status: "succeeded"/,
  'Generation must render, create a packet version, certify it, then mark the job succeeded',
)
assertMatches(
  source,
  /catch \(error\) \{[\s\S]+bridge_release_generation_lease_i3[\s\S]+status: "failed"/,
  'Generation failures must release the lease and mark the job failed',
)
assertMatches(
  source,
  /jobType === "generate_packet_version"[\s\S]+runGeneratePacketVersionJob/,
  'Direct service-role job execution must route generation jobs explicitly',
)
assertMatches(
  source,
  /if \(action === "watchdog_retry"\) \{[\s\S]+authorizeServiceCredential\(supabaseUrl, token\)[\s\S]+runWatchdogRetry/,
  'Watchdog retry must accept a verified service-role credential even when Vault and Edge env keys differ',
)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-runner-phase5-background-generation'],
  'node scripts/legal-document-job-runner-phase5-background-generation.test.mjs',
)

console.log('Legal document job runner phase 5 background generation contract passed.')
