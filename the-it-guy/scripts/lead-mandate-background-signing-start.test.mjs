import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const runner = await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'prepare_and_send_ready_packet',
  'prepareSigningLink: true',
  'background: true',
  'Mandate sending started. You can continue working while Arch9 prepares and sends the signing email.',
  'Sending started…',
  'phase4SignatureSendJob: true',
  'jobDisplayType: \'send_mandate_for_signature\'',
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
  'prepareMandateSigningEnvelopeForSendJob',
  'generateSecureSigningToken',
  'bridge_save_signing_field_placement_e2',
  'bridge_apply_signing_field_layout_e3',
  'bridge_authorize_applied_envelope_dispatch_e4',
  'phase4SignatureSendJob',
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

const queueBlockStart = agencyPage.indexOf('if (canQueueBackgroundSigningStart) {')
const queueBlockEnd = agencyPage.indexOf('if (isSupabaseConfigured && isUuidLike(mandatePacketId)', queueBlockStart)
assert.ok(queueBlockStart > -1 && queueBlockEnd > queueBlockStart, 'Agency quick-start queue block should be discoverable.')
const queueBlock = agencyPage.slice(queueBlockStart, queueBlockEnd)
assert.ok(
  !queueBlock.includes('Preparing signing envelope'),
  'Agency quick-start should not prepare the mandate signing envelope in the modal before queueing the job.',
)

assert.equal(
  packageJson.scripts?.['test:lead-mandate-background-signing-start'],
  'node scripts/lead-mandate-background-signing-start.test.mjs',
)

console.log('Lead mandate background signing start contract passed.')
