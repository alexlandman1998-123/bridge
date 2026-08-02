import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const functionPath = path.join(root, '..', 'supabase', 'functions', 'legal-document-job-runner', 'index.ts')
const source = fs.readFileSync(functionPath, 'utf8')
const watchdogSource = source.match(/async function runWatchdogRetry[\s\S]+?\nasync function runGeneratePacketVersionJob/)?.[0] || ''

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(haystack, pattern, label) {
  assert.match(haystack, pattern, `${label} did not match ${pattern}`)
}

assert.ok(watchdogSource, 'Phase 6 watchdog source could not be located')

for (const token of [
  'watchdog_retry',
  'runWatchdogRetry',
  'fetchWatchdogCandidateJobs',
  'watchdogRetryDecision',
  'retryableGenerationFailure',
  'reconcileGeneratedJobIfCertified',
  'claimGenerationLease',
  'bridge_claim_generation_lease_i3',
  'legal-document-job-runner-phase6-watchdog-retry-v1',
  'legal-document-job-runner-phase6-watchdog-reconciled-v1',
  'phase6WatchdogRetry: true',
  'LEGAL_DOCUMENT_WATCHDOG_AUTH_REQUIRED',
  'WATCHDOG_MAX_BATCH_LIMIT',
  'RETRYABLE_GENERATION_ERROR_CODES',
]) {
  assertIncludes(source, token, 'Phase 6 watchdog retry runner')
}

assertMatches(
  source,
  /if \(action === "watchdog_retry"\) \{[\s\S]+authorizeServiceCredential\(supabaseUrl, token\)[\s\S]+LEGAL_DOCUMENT_WATCHDOG_AUTH_REQUIRED/,
  'Watchdog retry action must require a verified service credential',
)
assertMatches(
  watchdogSource,
  /fetchWatchdogCandidateJobs[\s\S]+if \(retried\.length \+ reconciled\.length >= limit\) break/,
  'Watchdog must scan and process a bounded batch',
)
assertMatches(
  watchdogSource,
  /reconcileGeneratedJobIfCertified[\s\S]+if \(recovered\) \{[\s\S]+reconciled\.push/,
  'Watchdog must reconcile an already-certified generated version before retrying',
)
assertMatches(
  watchdogSource,
  /claimGenerationLease[\s\S]+generationAttemptId: decision\.generationAttemptId[\s\S]+runGeneratePacketVersionJob/,
  'Watchdog must refresh the same generation attempt lease before retrying generation',
)
assertMatches(
  source,
  /if \(attempts >= maxAttempts\) \{[\s\S]+max_attempts_exhausted/,
  'Watchdog must not retry exhausted jobs',
)
assertMatches(
  source,
  /if \(status === "failed"\) \{[\s\S]+retryableGenerationFailure\(job\)[\s\S]+failed_retry_due/,
  'Watchdog must only retry retryable failed jobs after the retry delay',
)
assertMatches(
  source,
  /if \(status === "running" \|\| status === "claimed"\) \{[\s\S]+WATCHDOG_RUNNING_STALE_MS/,
  'Watchdog must only retry stale running or claimed jobs',
)
assert.doesNotMatch(
  watchdogSource,
  /runSendForSignatureJob|callSigningEmailFunction|send-mandate-signing-email|send_for_signature/,
  'Phase 6 watchdog must not retry signing email sends',
)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-runner-phase6-watchdog-retry'],
  'node scripts/legal-document-job-runner-phase6-watchdog-retry.test.mjs',
)

console.log('Legal document job runner phase 6 watchdog retry contract passed.')
