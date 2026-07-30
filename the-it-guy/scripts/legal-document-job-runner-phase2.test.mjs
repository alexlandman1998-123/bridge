import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const functionPath = path.join(root, '..', 'supabase', 'functions', 'legal-document-job-runner', 'index.ts')
const denoJsonPath = path.join(root, '..', 'supabase', 'functions', 'legal-document-job-runner', 'deno.json')
const configPath = path.join(root, '..', 'supabase', 'config.toml')

const source = fs.readFileSync(functionPath, 'utf8')
const config = fs.readFileSync(configPath, 'utf8')
const denoJson = JSON.parse(fs.readFileSync(denoJsonPath, 'utf8'))
const dryRunSource = source.match(/async function runDryRunJob[\s\S]+?\nasync function callSigningEmailFunction/)?.[0] || ''

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(haystack, pattern, label) {
  assert.match(haystack, pattern, `${label} did not match ${pattern}`)
}

for (const token of [
  'Deno.serve',
  'LEGAL_DOCUMENT_JOB_RUNNER_AUTH_REQUIRED',
  'EdgeRuntime',
  'waitUntil',
  'bridge_update_legal_document_job_phase1',
  'legal_document_jobs',
  'document_packets',
  'legal-document-job-runner-phase2-dry-run-v1',
  'LEGAL_DOCUMENT_JOB_DRY_RUN_STATUS_WRITE_FAILED',
  'dryRunOnly: true',
  'emailSent: false',
  'documentGenerated: false',
  'wouldGenerate:',
  'wouldSend:',
  'runDryRunJob',
]) {
  assertIncludes(source, token, 'Phase 2 job runner')
}

assertMatches(
  source,
  /if \(bearerToken\(req\) !== serviceRoleKey\)/,
  'Phase 2 runner must require service-role bearer',
)
assertMatches(
  source,
  /status: "running"[\s\S]+status: "succeeded"/,
  'Phase 2 runner must walk running to succeeded in dry run',
)
assertMatches(
  source,
  /if \(background\) \{[\s\S]+queueBackgroundTask[\s\S]+return jsonResponse\(202/,
  'Phase 2 runner must support waitUntil background dry runs',
)
assert.ok(dryRunSource, 'Phase 2 dry-run function source could not be located')
assert.doesNotMatch(dryRunSource, /generateMandateDocumentFromTemplate|generatePacketVersion|handleSellerMandateSentEmail|generate-mandate/)
assert.doesNotMatch(dryRunSource, /\.upload\(|createSignedUrl|signing_token|recipientEmail|resend\.emails/i)

assertIncludes(config, '[functions.legal-document-job-runner]', 'Supabase config')
assertMatches(
  config,
  /\[functions\.legal-document-job-runner\][\s\S]*verify_jwt = true[\s\S]*entrypoint = "\.\/functions\/legal-document-job-runner\/index\.ts"/,
  'Supabase config must register the dry-run runner with JWT verification',
)
assert.equal(denoJson.imports?.supabase, 'npm:@supabase/supabase-js@2.49.9')

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-runner-phase2'],
  'node scripts/legal-document-job-runner-phase2.test.mjs',
)

console.log('Legal document job runner phase 2 dry-run contract passed.')
