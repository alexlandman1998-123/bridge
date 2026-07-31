import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const runner = await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'prepare_and_send_ready_packet',
  'prepareSigningLink: true',
  'background: true',
  'Mandate signing queued. You can continue working while Arch9 prepares and sends the signing email.',
  'Mandate Signing Queued',
]) {
  assert.ok(agencyPage.includes(token), `Agency quick-start must keep background signing token: ${token}`)
}

assert.match(
  agencyPage,
  /canQueueBackgroundSigningStart[\s\S]+invokeEdgeFunction\('legal-document-job-runner'[\s\S]+action: 'prepare_and_send_ready_packet'[\s\S]+background: true/,
  'Agency quick-start should queue prepare-and-send before foreground signing-link generation.',
)

for (const token of [
  'prepareSigningLinkForSendJob',
  'generateSecureSigningToken',
  'bridge_authorize_applied_envelope_dispatch_e4',
  'phase7BackgroundPrepareSend',
  'action === "prepare_and_send_ready_packet"',
]) {
  assert.ok(runner.includes(token), `Job runner must keep background prepare/send token: ${token}`)
}

assert.match(
  runner,
  /if \(!extractSigningToken\(portalLink\) && booleanFlag\(emailPayload\.prepareSigningLink \|\| emailPayload\.prepare_signing_link\)\) \{[\s\S]+prepareSigningLinkForSendJob/,
  'Runner should prepare a missing signing link inside the send job.',
)

assert.equal(
  packageJson.scripts?.['test:lead-mandate-background-signing-start'],
  'node scripts/lead-mandate-background-signing-start.test.mjs',
)

console.log('Lead mandate background signing start contract passed.')
