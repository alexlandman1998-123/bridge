import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONVEYANCER_DOCUMENT_OPERATIONS as O,
  buildConveyancerDocumentCommand,
  buildConveyancerDocumentPipelineControl,
  evaluateConveyancerDocumentPipelineGate,
  executeConveyancerDocumentCommand,
  persistConveyancerDocumentPipelineControl,
  runConveyancerDocumentJob,
} from '../conveyancerDocumentPipeline.js'
import {
  createArch9PacketConveyancerDocumentAdapter,
  createManualConveyancerDocumentAdapter,
} from '../../../services/attorneyWorkflow/conveyancerDocumentPipelineAdapter.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160006_conveyancer_productisation_p5.sql', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../../../../../supabase/functions/conveyancer-signing-webhook/index.ts', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'
const firmId = '20000000-0000-4000-8000-000000000001'
const transactionId = '30000000-0000-4000-8000-000000000001'
const at = '2026-07-16T10:00:00.000Z'
const hash = `sha256:${'a'.repeat(64)}`
const pending = []

function test(name, fn) {
  try { const result = fn(); if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`))); return } console.log(`ok - ${name}`) }
  catch (error) { console.error(`not ok - ${name}`); throw error }
}

function control(overrides = {}) {
  return buildConveyancerDocumentPipelineControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedOperations: Object.values(O), allowedAdapters: ['arch9_packet', 'manual'], pilotTransactionIds: [transactionId], killSwitchEnabled: false, reason: 'P5 pilot', ...overrides })
}

function renderCommand(overrides = {}) {
  return {
    commandId: 'render:transfer-instruction:1', operation: O.render, adapter: 'arch9_packet',
    organisationId: orgId, attorneyFirmId: firmId, transactionId, documentType: 'transfer_instruction', requestedAt: at,
    source: { documentId: 'document:c4:1', packetId: '50000000-0000-4000-8000-000000000001', packetType: 'otp', storageBucket: 'generated-documents', templateReference: 'template:c1:1', contentFingerprint: 'fingerprint:content', provenanceFingerprint: 'fingerprint:provenance', approvalFingerprint: 'fingerprint:approval' },
    humanReleaseApproved: false, ...overrides,
  }
}

function signingCommand(overrides = {}) {
  return {
    commandId: 'sign:transfer-instruction:1', operation: O.sendForSigning, adapter: 'arch9_packet',
    organisationId: orgId, attorneyFirmId: firmId, transactionId, documentType: 'transfer_instruction', requestedAt: at,
    source: { artifactId: '50000000-0000-4000-8000-000000000002', packetId: '50000000-0000-4000-8000-000000000001', packetVersionId: '50000000-0000-4000-8000-000000000003' },
    artifact: { bucket: 'generated-documents', path: 'matter/rendered.pdf', mimeType: 'application/pdf', contentHash: hash },
    signing: { planFingerprint: 'fingerprint:signing-plan', signers: [{ role: 'seller', signerId: 'seller:1' }], targetSignerRole: 'seller', expiresInHours: 72 },
    humanReleaseApproved: true, ...overrides,
  }
}

test('defaults fail-closed and isolates adapter, operation and pilot scope', () => {
  const disabled = buildConveyancerDocumentPipelineControl({ organisationId: orgId, attorneyFirmId: firmId, reason: 'Not enabled' })
  const command = buildConveyancerDocumentCommand(renderCommand()).command
  assert.equal(evaluateConveyancerDocumentPipelineGate(disabled, command).reason, 'document_pipeline_kill_switch_enabled')
  assert.equal(evaluateConveyancerDocumentPipelineGate(control({ allowedAdapters: ['manual'] }), command).reason, 'document_adapter_not_enabled')
  assert.equal(evaluateConveyancerDocumentPipelineGate(control(), { ...command, transactionId: 'other' }).reason, 'matter_outside_document_pilot')
})

test('requires C6 approval provenance for rendering and human release for signing', () => {
  assert.equal(buildConveyancerDocumentCommand(renderCommand()).ok, true)
  assert.deepEqual(buildConveyancerDocumentCommand(renderCommand({ source: { ...renderCommand().source, approvalFingerprint: '' } })).errors, ['render_source_approval_invalid'])
  assert.equal(buildConveyancerDocumentCommand(signingCommand()).ok, true)
  assert.deepEqual(buildConveyancerDocumentCommand(signingCommand({ humanReleaseApproved: false })).errors, ['signing_release_contract_invalid'])
})

test('keeps verified provider completion as review-bound signed-pack evidence', () => {
  const command = buildConveyancerDocumentCommand({
    commandId: 'finalise:1', operation: O.finaliseSignedPack, adapter: 'manual', organisationId: orgId, attorneyFirmId: firmId, transactionId,
    documentType: 'signed_transfer_pack', requestedAt: at, source: { signingRecordId: '50000000-0000-4000-8000-000000000004', providerEventId: 'provider:event:1' },
    artifact: { bucket: 'signed-documents', path: 'matter/signed.pdf', mimeType: 'application/pdf', contentHash: hash },
    signing: { webhookVerified: true, completionCertificateReference: 'certificate:1' }, humanReleaseApproved: false,
  })
  assert.equal(command.ok, true)
  assert.equal(command.command.humanReleaseApproved, false)
})

test('executes a renderer adapter only after the gate and validates stored artifact evidence', async () => {
  const adapter = { execute: async () => ({ ok: true, completedAt: at, artifact: { bucket: 'generated-documents', path: 'matter/rendered.pdf', mimeType: 'application/pdf', contentHash: hash }, providerReference: 'arch9_packet:1' }) }
  const result = await executeConveyancerDocumentCommand({ control: control(), command: renderCommand(), adapters: { arch9_packet: adapter } })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.persistenceEnvelope.operation, O.render)
  assert.equal(result.persistenceEnvelope.result.artifact.contentHash, hash)
})

test('observe mode never invokes a document adapter', async () => {
  let calls = 0
  const result = await executeConveyancerDocumentCommand({ control: control({ mode: 'observe', pilotTransactionIds: [] }), command: renderCommand(), adapters: { arch9_packet: { execute: async () => { calls += 1 } } } })
  assert.equal(result.decision, 'observed')
  assert.equal(calls, 0)
})

test('connects the existing packet renderer and signer through injected, hash-verifying adapters', async () => {
  const arch9 = createArch9PacketConveyancerDocumentAdapter({
    generatePacketVersion: async () => ({ packet: { id: 'packet:1' }, version: { id: 'version:1', rendered_file_path: 'matter/rendered.pdf', rendered_document_id: 'document:1' } }),
    generateSigningLinks: async () => ({ packetId: 'packet:1', packetVersionId: 'version:1', signers: [{ id: 'signer:1' }], expiresAt: '2026-07-19T10:00:00.000Z' }),
    hashStoredObject: async () => hash,
  })
  const rendered = await arch9.execute(buildConveyancerDocumentCommand(renderCommand()).command, {})
  const signing = await arch9.execute(buildConveyancerDocumentCommand(signingCommand()).command, {})
  assert.equal(rendered.artifact.contentHash, hash)
  assert.equal(signing.signingProviderReference, 'arch9_packet:version:1')

  const manual = createManualConveyancerDocumentAdapter({ hashStoredObject: async () => hash })
  const uploaded = await manual.execute(buildConveyancerDocumentCommand({ commandId: 'manual:1', operation: O.manualUpload, adapter: 'manual', organisationId: orgId, attorneyFirmId: firmId, transactionId, documentType: 'authority_document', requestedAt: at, source: { capturedByUserId: 'user:1' }, artifact: { bucket: 'matter-documents', path: 'matter/authority.pdf', mimeType: 'application/pdf', contentHash: hash }, humanReleaseApproved: false }).command, {})
  assert.equal(uploaded.ok, true)
})

test('runs enqueue, claim, adapter execution and immutable completion through guarded RPCs', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); if (name.includes('enqueue')) return { data: { jobId: 'job:1' }, error: null }; if (name.includes('claim')) return { data: { ok: true }, error: null }; return { data: { ok: true, artifactId: 'artifact:1' }, error: null } } }
  const result = await runConveyancerDocumentJob(client, { control: control(), command: renderCommand(), adapters: { arch9_packet: { execute: async () => ({ ok: true, completedAt: at, artifact: { bucket: 'generated-documents', path: 'matter/rendered.pdf', mimeType: 'application/pdf', contentHash: hash } }) } } })
  assert.equal(result.ok, true)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_enqueue_conveyancer_document_job', 'bridge_claim_conveyancer_document_job', 'bridge_complete_conveyancer_document_job'])
})

test('versions P5 activation through a firm-admin RPC', async () => {
  const calls = []
  const result = await persistConveyancerDocumentPipelineControl({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { revision: 1 }, error: null } } }, control())
  assert.equal(result.ok, true)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_set_conveyancer_document_pipeline_control'])
})

test('migration enforces reference-only jobs, scoped records and review-bound provider events', () => {
  for (const table of ['conveyancer_document_pipeline_controls', 'conveyancer_document_jobs', 'conveyancer_signing_provider_events']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, /references only, never document bytes, links or secrets/i)
  assert.match(migration, /P5 command idempotency conflict/i)
  assert.match(migration, /P5 signing source artifact binding is invalid/i)
  assert.match(migration, /P5 signed-pack provider evidence binding is invalid/i)
  assert.match(migration, /signatureVerified/)
  assert.match(migration, /'humanReviewRequired',true/)
  assert.match(migration, /grant execute on function public\.bridge_record_conveyancer_signing_provider_event\(jsonb\) to service_role/)
  assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_document_jobs.*authenticated/i)
})

test('provider webhook verifies timestamp and HMAC before recording minimal evidence', () => {
  assert.match(webhook, /5 \* 60 \* 1000/)
  assert.match(webhook, /crypto\.subtle\.sign\("HMAC"/)
  assert.match(webhook, /safeEqual\(expectedSignature, suppliedSignature\)/)
  assert.match(webhook, /bridge_record_conveyancer_signing_provider_event/)
  assert.doesNotMatch(webhook, /documentBytes|fileBytes/)
})

await Promise.all(pending)
console.log('P5 conveyancer document pipeline tests passed.')
