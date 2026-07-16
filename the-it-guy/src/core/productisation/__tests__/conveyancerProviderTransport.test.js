import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildConveyancerProviderCommand, buildConveyancerProviderInboundDecision, buildConveyancerProviderTransportControl, buildConveyancerProviderWebhookEndpoint,
  enqueueConveyancerProviderCommand, evaluateConveyancerProviderTransportGate, persistConveyancerProviderTransportControl, persistConveyancerProviderWebhookEndpoint, reviewConveyancerProviderInboundEnvelope, retryConveyancerProviderCommand, stageConveyancerProviderCommandPayload,
} from '../conveyancerProviderTransport.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160010_conveyancer_productisation_p7.sql', import.meta.url), 'utf8')
const dispatcher = readFileSync(new URL('../../../../../supabase/functions/dispatch-conveyancer-provider-commands/index.ts', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-webhook/index.ts', import.meta.url), 'utf8')
const runtime = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-runtime/index.ts', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'; const firmId = '20000000-0000-4000-8000-000000000001'; const transactionId = '30000000-0000-4000-8000-000000000001'; const profileId = '40000000-0000-4000-8000-000000000001'; const envelopeId = '50000000-0000-4000-8000-000000000001'; const at = '2026-07-16T14:00:00.000Z'; const hash = `sha256:${'a'.repeat(64)}`
const pending = []
function test(name, fn) { try { const result = fn(); if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`))); return } console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
function control(overrides = {}) { return buildConveyancerProviderTransportControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', outboundEnabled: true, inboundEnabled: true, pilotTransactionIds: [transactionId], killSwitchEnabled: false, maxAttempts: 4, leaseSeconds: 90, initialRetrySeconds: 30, maxRetrySeconds: 600, replayWindowSeconds: 300, maxInboundBytes: 65536, reason: 'P7 pilot', ...overrides }) }
function command(overrides = {}) { return buildConveyancerProviderCommand({ commandId: 'sars:submit:1', profileId, organisationId: orgId, attorneyFirmId: firmId, transactionId, capability: 'submit_transfer_duty_declaration', operationType: 'submit_declaration', lane: 'transfer', payloadReference: `conveyancer-provider-outbox/${orgId}/${firmId}/${transactionId}/declaration.json`, payloadHash: hash, idempotencyKey: 'sars:submit:1', authorityReference: 'approval:c6:1', requestedAt: at, requestedBy: '60000000-0000-4000-8000-000000000001', ...overrides }) }

test('fails closed and isolates inbound, outbound and exact pilot matter gates', () => {
  assert.equal(evaluateConveyancerProviderTransportGate(control({ killSwitchEnabled: true }), { direction: 'outbound', transactionId }).reason, 'provider_transport_kill_switch_enabled')
  assert.equal(evaluateConveyancerProviderTransportGate(control({ outboundEnabled: false }), { direction: 'outbound', transactionId }).reason, 'provider_outbound_disabled')
  assert.equal(evaluateConveyancerProviderTransportGate(control(), { direction: 'inbound', transactionId: 'other' }).reason, 'matter_outside_provider_transport_pilot')
  assert.equal(evaluateConveyancerProviderTransportGate(control({ mode: 'observe', pilotTransactionIds: [] }), { direction: 'inbound', transactionId }).observeOnly, true)
})

test('builds durable reference-only commands and rejects inline data or secrets', () => {
  assert.equal(command().ok, true); assert.match(command().command.fingerprint, /^fnv1a_/)
  assert.ok(command({ payload: { taxpayer: 'private' } }).errors.includes('provider_command_must_be_reference_only'))
  assert.ok(command({ accessToken: 'raw-token' }).errors.includes('provider_command_must_be_reference_only'))
  assert.ok(command({ payloadHash: 'weak' }).errors.includes('provider_command_evidence_invalid'))
})

test('governs webhook endpoints using secret references and capability allowlists', () => {
  const valid = buildConveyancerProviderWebhookEndpoint({ organisationId: orgId, attorneyFirmId: firmId, profileId, status: 'active', secretReference: 'env://SARS_WEBHOOK_SECRET', allowedEventTypes: ['declaration.updated'], allowedCapabilities: ['receive_transfer_duty_outcome'] })
  assert.equal(valid.ok, true, JSON.stringify(valid.errors))
  assert.ok(buildConveyancerProviderWebhookEndpoint({ ...valid.endpoint, secretReference: 'raw-secret' }).errors.includes('provider_webhook_endpoint_config_invalid'))
  assert.ok(buildConveyancerProviderWebhookEndpoint({ ...valid.endpoint, allowedCapabilities: ['invented_event'] }).errors.includes('provider_webhook_endpoint_config_invalid'))
})

test('stages canonical JSON in the exact tenant/matter outbox path and returns its hash', async () => {
  const calls = []; const client = { storage: { from: (bucket) => ({ upload: async (path, bytes, options) => { calls.push({ bucket, path, bytes, options }); return { data: { path }, error: null } } }) } }
  const result = await stageConveyancerProviderCommandPayload(client, { organisationId: orgId, attorneyFirmId: firmId, transactionId, payload: { declarationId: 'decl:1', amount: 100 } })
  assert.equal(result.ok, true); assert.match(result.payloadHash, /^sha256:[a-f0-9]{64}$/); assert.equal(calls[0].bucket, 'conveyancer-provider-outbox'); assert.ok(calls[0].path.startsWith(`${orgId}/${firmId}/${transactionId}/`)); assert.equal(calls[0].options.upsert, false)
})

test('requires explicit reasoned human review without creating legal truth', () => {
  const decision = buildConveyancerProviderInboundDecision({ envelopeId, organisationId: orgId, attorneyFirmId: firmId, transactionId, decision: 'accept_for_review', reason: 'Signature and matter binding checked.', reviewedBy: '60000000-0000-4000-8000-000000000001', reviewedAt: at })
  assert.equal(decision.ok, true); assert.equal(decision.decision.decision, 'accept_for_review')
  assert.equal(buildConveyancerProviderInboundDecision({ ...decision.decision, reason: '' }).ok, false)
})

test('uses only guarded RPC boundaries for controls, endpoints, enqueue, review and retry', async () => {
  const calls = []; const client = { rpc: async (name) => { calls.push(name); return { data: { ok: true }, error: null } } }
  await persistConveyancerProviderTransportControl(client, control())
  await persistConveyancerProviderWebhookEndpoint(client, { organisationId: orgId, attorneyFirmId: firmId, profileId, status: 'active', secretReference: 'env://SARS_WEBHOOK_SECRET', allowedEventTypes: ['declaration.updated'], allowedCapabilities: ['receive_transfer_duty_outcome'] })
  await enqueueConveyancerProviderCommand(client, command().command)
  await reviewConveyancerProviderInboundEnvelope(client, buildConveyancerProviderInboundDecision({ envelopeId, organisationId: orgId, attorneyFirmId: firmId, transactionId, decision: 'quarantine', reason: 'Provider matter reference differs.', reviewedBy: '60000000-0000-4000-8000-000000000001', reviewedAt: at }).decision)
  await retryConveyancerProviderCommand(client, { commandId: envelopeId, reason: 'Provider confirmed previous attempt was not accepted.' })
  assert.deepEqual(calls, ['bridge_set_conveyancer_provider_transport_control', 'bridge_set_conveyancer_provider_webhook_endpoint', 'bridge_enqueue_conveyancer_provider_command', 'bridge_review_conveyancer_provider_inbound', 'bridge_retry_conveyancer_provider_command'])
})

test('migration supplies durable leases, bounded retries, dead letters and append-only receipts', () => {
  for (const table of ['conveyancer_provider_transport_controls', 'conveyancer_provider_webhook_endpoints', 'conveyancer_provider_outbound_commands', 'conveyancer_provider_inbound_envelopes', 'conveyancer_provider_transport_receipts']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, /for update of command skip locked/i); assert.match(migration, /lease_expires_at/); assert.match(migration, /retry_scheduled/); assert.match(migration, /dead_letter/); assert.match(migration, /reconciliation_required/)
  assert.match(migration, /P7 command idempotency conflict/i); assert.match(migration, /P7 commands must be secret-free references/i); assert.match(migration, /before update or delete on public\.conveyancer_provider_transport_receipts/i)
  assert.match(migration, /grant execute on function public\.bridge_claim_conveyancer_provider_commands\(integer,timestamptz\) to service_role/); assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_provider_outbound_commands.*authenticated/i)
})

test('signed webhook is replay-bounded, size-bounded, private, hash-addressed and review-only', () => {
  assert.match(webhook, /replay_window_seconds/); assert.match(webhook, /max_inbound_bytes/); assert.match(webhook, /crypto\.subtle\.sign\('HMAC'/); assert.match(webhook, /safeEqual\(expected, supplied\)/); assert.match(webhook, /conveyancer-provider-inbox/); assert.match(webhook, /bridge_record_conveyancer_provider_inbound/); assert.match(webhook, /legalTruthCreated: false/)
  assert.doesNotMatch(webhook, /service_role.*reply/i)
})

test('dispatcher authenticates, leases, invokes P6 internally and always completes the lease', () => {
  assert.match(dispatcher, /x-p7-dispatch-secret/); assert.match(dispatcher, /bridge_claim_conveyancer_provider_commands/); assert.match(dispatcher, /x-p7-worker-secret/); assert.match(dispatcher, /bridge_complete_conveyancer_provider_command/); assert.match(dispatcher, /retrySafe/)
  assert.match(runtime, /internalWorker/); assert.match(runtime, /queryClient\.storage/)
})

await Promise.all(pending)
console.log('P7 conveyancer provider transport tests passed.')
