import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const runner = fs.readFileSync(path.join(root, '..', 'supabase', 'functions', 'legal-document-job-runner', 'index.ts'), 'utf8')
const workspacePage = fs.readFileSync(path.join(root, 'src', 'pages', 'LegalDocumentWorkspacePage.jsx'), 'utf8')
const agencyPage = fs.readFileSync(path.join(root, 'src', 'pages', 'agency', 'AgencyPipelinePage.jsx'), 'utf8')

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

for (const token of [
  'createSendReadyJobAndRun',
  'send_ready_packet',
  'resolveInvocationAuthority',
  'canManagePacket',
  'LEGAL_DOCUMENT_SERVER_SEND_FORBIDDEN',
  'LEGAL_DOCUMENT_SERVER_SEND_PACKET_NOT_CERTIFIED',
  'bridge_create_legal_document_job_phase1',
  'phase4UiServerSend',
]) {
  assertIncludes(runner, token, 'Phase 4 runner bridge')
}

assertMatches(
  runner,
  /if \(action === "send_ready_packet"\) \{[\s\S]+resolveInvocationAuthority[\s\S]+createSendReadyJobAndRun/,
  'Runner must expose a user-authorized send-ready action',
)
assertMatches(
  runner,
  /if \(bearerToken\(req\) !== serviceRoleKey\) \{[\s\S]+LEGAL_DOCUMENT_JOB_RUNNER_AUTH_REQUIRED/,
  'Direct job execution must remain service-role only',
)

for (const [label, source] of [
  ['Legal workspace', workspacePage],
  ['Agency pipeline', agencyPage],
]) {
  assertIncludes(source, 'VITE_LEGAL_DOCUMENT_SERVER_SEND_READY_ENABLED', `${label} feature flag`)
  assertIncludes(source, 'LEGAL_DOCUMENT_SERVER_SEND_READY_ENABLED', `${label} feature flag constant`)
  assertIncludes(source, 'legal-document-job-runner', `${label} server-send runner invocation`)
  assertIncludes(source, 'action: \'send_ready_packet\'', `${label} send-ready action`)
  assertIncludes(source, 'send-mandate-signing-email', `${label} direct-send fallback`)
  assertMatches(
    source,
    /useServerSendReady[\s\S]+\? 'legal-document-job-runner' : 'send-mandate-signing-email'/,
    `${label} must keep a direct-send fallback`,
  )
}

assertMatches(
  workspacePage,
  /const useServerSendReady = LEGAL_DOCUMENT_SERVER_SEND_READY_ENABLED && !resend && !reminder/,
  'Legal workspace must only use server send for initial sends',
)
assertMatches(
  agencyPage,
  /const useServerSendReady = LEGAL_DOCUMENT_SERVER_SEND_READY_ENABLED && options\.resend !== true && options\.reminder !== true/,
  'Agency pipeline must only use server send for initial sends',
)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-job-runner-phase4-ui'],
  'node scripts/legal-document-job-runner-phase4-ui.test.mjs',
)

console.log('Legal document job runner phase 4 UI contract passed.')
