import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const workspacePage = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const runner = await readFile(new URL('../../supabase/functions/legal-document-job-runner/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const [label, source] of [
  ['Agency pipeline', agencyPage],
  ['Legal workspace', workspacePage],
]) {
  for (const token of [
    'VITE_LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED',
    'LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED',
    'read',
    'VITE_LEGAL_DOCUMENT_SERVER_SEND_READY_ENABLED',
    'jobDisplayType: \'send_mandate_for_signature\'',
    'phase4SignatureSendJob: true',
    'modalMayClose: true',
  ]) {
    assert.ok(source.includes(token), `${label} must include Phase 4 send-job token: ${token}`)
  }
}

assert.match(
  agencyPage,
  /const LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED = readPipelineBooleanFlag\([\s\S]+VITE_LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED,[\s\S]+true/,
  'Agency pipeline should default the Phase 4 signature job flag on.',
)
assert.match(
  workspacePage,
  /const LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED = readLegalWorkspaceBooleanFlag\([\s\S]+VITE_LEGAL_DOCUMENT_SERVER_SIGNATURE_JOB_ENABLED,[\s\S]+true/,
  'Legal workspace should default the Phase 4 signature job flag on.',
)
assert.match(
  agencyPage,
  /if \(canQueueBackgroundSigningStart\) \{[\s\S]+setMandateQuickStartProgress\('Sending started…'\)[\s\S]+action: 'prepare_and_send_ready_packet'[\s\S]+background: true[\s\S]+prepareSigningLink: true/,
  'Agency quick-start should queue a prepare-and-send job immediately.',
)
assert.ok(
  agencyPage.includes('setMandatePacketStatus((previous) => (') &&
    agencyPage.includes('findLatestMandateSendJob') &&
    agencyPage.includes('Mandate signing email sent.'),
  'Agency pipeline should track send jobs without a full records reload.',
)
assert.match(
  workspacePage,
  /action: 'send_ready_packet'[\s\S]+background: true[\s\S]+jobDisplayType: 'send_mandate_for_signature'[\s\S]+emailResponse\?\.data\?\.accepted === true[\s\S]+queued: true/,
  'Legal workspace should treat background send acceptance as a queued result.',
)

for (const token of [
  'prepareMandateSigningEnvelopeForSendJob',
  'resolveMandateSendSignerIdentity',
  'bridge_save_signing_field_placement_e2',
  'bridge_apply_signing_field_layout_e3',
  'bridge_authorize_applied_envelope_dispatch_e4',
  'mandate_signing_envelope_prepared_by_job',
  'phase4-signature-prepare-send',
  'jobDisplayType',
  'phase4SignatureSendJob',
]) {
  assert.ok(runner.includes(token), `Runner must include Phase 4 server-send token: ${token}`)
}

assert.match(
  runner,
  /preparedSigningEnvelope = await timeJobStage[\s\S]+prepareMandateSigningEnvelopeForSendJob[\s\S]+preparedSigningLink = await timeJobStage[\s\S]+prepareSigningLinkForSendJob[\s\S]+callSigningEmailFunction/,
  'Runner should prepare envelope, prepare link, then send email inside the job.',
)
assert.match(
  runner,
  /p_job_type: "send_for_signature"[\s\S]+p_metadata_json: \{[\s\S]+\.\.\.jobMetadata[\s\S]+phase4SignatureSendJob: true[\s\S]+jobDisplayType/,
  'Runner should create a send_for_signature job with Phase 4 metadata.',
)

assert.equal(
  packageJson.scripts?.['test:legal-document-signature-send-job-phase4'],
  'node scripts/legal-document-signature-send-job-phase4.test.mjs',
)

console.log('Legal document signature send job phase 4 contract passed.')
