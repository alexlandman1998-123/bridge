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
  'runSendForSignatureJob',
  'LEGAL_DOCUMENT_JOB_PHASE3_SEND_ONLY',
  'LEGAL_DOCUMENT_JOB_PACKET_NOT_CERTIFIED',
  'LEGAL_DOCUMENT_JOB_SEND_PAYLOAD_INVALID',
  'LEGAL_DOCUMENT_JOB_SEND_FAILED',
  'legal-document-job-runner-phase3-send-v1',
  'send_for_signature',
  'versionHasCertifiedPdf',
  'callSigningEmailFunction',
  '/functions/v1/send-mandate-signing-email',
  'emailSent: emailConfirmed',
  'documentGenerated: false',
  'phase3SendOnly: true',
]) {
  assertIncludes(source, token, 'Phase 3 send runner')
}

assertMatches(
  source,
  /if \(jobType !== "send_for_signature"\) \{[\s\S]+LEGAL_DOCUMENT_JOB_PHASE3_SEND_ONLY/,
  'Phase 3 must reject generation and combined jobs',
)
assertMatches(
  source,
  /if \(!versionIsCurrent \|\| !versionHasCertifiedPdf\(version\)\) \{[\s\S]+LEGAL_DOCUMENT_JOB_PACKET_NOT_CERTIFIED/,
  'Phase 3 must require an already-generated certified packet before sending',
)
assertMatches(
  source,
  /status: "running"[\s\S]+callSigningEmailFunction[\s\S]+status: "succeeded"/,
  'Phase 3 must record running before provider call and succeeded after confirmed delivery',
)
assertMatches(
  source,
  /if \(!emailResult\.ok\) \{[\s\S]+status: "failed"[\s\S]+LEGAL_DOCUMENT_JOB_SEND_FAILED/,
  'Phase 3 must record failed jobs when delivery is rejected',
)
assertMatches(
  source,
  /dryRun[\s\S]+\? await runDryRunJob[\s\S]+: await runSendForSignatureJob/,
  'Runner must route dry-run and real send modes explicitly',
)
assert.doesNotMatch(source, /generateMandateDocumentFromTemplate|generatePacketVersion|renderStructuredSectionsToPdfBytes|renderHtmlToPdfBytes/)
assert.doesNotMatch(source, /\.upload\(|createSignedUrl/)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-runner-phase3'],
  'node scripts/legal-document-job-runner-phase3.test.mjs',
)

console.log('Legal document job runner phase 3 send-only contract passed.')
