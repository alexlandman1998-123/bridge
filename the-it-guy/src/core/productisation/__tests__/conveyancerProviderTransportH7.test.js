import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildConveyancerProviderInboundReviewH7, retryConveyancerProviderOutboundH7, reviewConveyancerProviderInboundH7, runConveyancerProviderOutboundH7 } from '../conveyancerProviderTransportH7.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716200001_conveyancer_h7_provider_transport.sql', import.meta.url), 'utf8')
const dispatcher = readFileSync(new URL('../../../../../supabase/functions/dispatch-conveyancer-provider-commands/index.ts', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-webhook/index.ts', import.meta.url), 'utf8')
const org = '10000000-0000-4000-8000-000000000001'; const firm = '20000000-0000-4000-8000-000000000001'; const tx = '30000000-0000-4000-8000-000000000001'; const profileId = '40000000-0000-4000-8000-000000000001'; const actor = '50000000-0000-4000-8000-000000000001'
const profile = { id: profileId, record_id: profileId, revision: 1, organisation_id: org, attorney_firm_id: firm, provider_key: 'sars', adapter_key: 'generic_http', profile_status: 'sandbox', secret_reference: 'env://SARS_TOKEN', payload: { environment: 'sandbox', allowedOrigin: 'https://sandbox.example', capabilities: ['submit_transfer_duty_declaration'], allowedLanes: ['transfer'], operationPaths: { submit: '/submit' }, authentication: { type: 'bearer', headerName: 'Authorization' } } }
const providerContext = { available: true, control: { mode: 'pilot' }, profiles: [profile], credentialChecks: [] }
const transportSummary = { available: true, control: { organisationId: org, attorneyFirmId: firm, mode: 'pilot', outboundEnabled: true, inboundEnabled: true, pilotTransactionIds: [tx], killSwitchEnabled: false, reason: 'pilot' } }
const rpcCalls = []; const uploads = []
const client = { storage: { from: (bucket) => ({ upload: async (path, bytes) => { uploads.push({ bucket, path, bytes }); return { data: { path }, error: null } } }) }, rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { commandId: 'command:1', status: 'queued' }, error: null } } }
const queued = await runConveyancerProviderOutboundH7(client, { providerContext, transportSummary, organisationId: org, attorneyFirmId: firm, transactionId: tx, commandId: 'sars:1', capability: 'submit_transfer_duty_declaration', operationType: 'submit', lane: 'transfer', payload: { declarationId: 'decl:1' }, idempotencyKey: 'sars:1', authorityReference: 'approval:1', requestedAt: '2026-07-16T12:00:00Z', requestedBy: actor })
assert.equal(queued.decision, 'queued')
assert.equal(uploads[0].bucket, 'conveyancer-provider-outbox')
assert.deepEqual(rpcCalls.map((call) => call.name), ['bridge_enqueue_conveyancer_provider_command'])

const reviewInput = { decisionId: 'review:1', envelopeId: '60000000-0000-4000-8000-000000000001', organisationId: org, attorneyFirmId: firm, transactionId: tx, decision: 'accept_for_review', reason: 'Verified against the matter.', reviewedBy: actor, reviewedAt: '2026-07-16T12:05:00Z' }
assert.equal(buildConveyancerProviderInboundReviewH7(reviewInput).ok, true)
const reviewCalls = []
await reviewConveyancerProviderInboundH7({ rpc: async (name) => { reviewCalls.push(name); return { data: { duplicate: false }, error: null } } }, reviewInput)
await retryConveyancerProviderOutboundH7({ rpc: async (name) => { reviewCalls.push(name); return { data: { duplicate: true }, error: null } } }, { commandId: '70000000-0000-4000-8000-000000000001', requestId: 'retry:1', reason: 'Credential configuration repaired.' })
assert.deepEqual(reviewCalls, ['bridge_review_conveyancer_provider_inbound_h7', 'bridge_retry_conveyancer_provider_command_h7'])

for (const fragment of ['bridge_review_conveyancer_provider_inbound_h7', 'bridge_retry_conveyancer_provider_command_h7', 'H7 review idempotency conflict', 'H7 retry idempotency conflict']) assert.match(migration, new RegExp(fragment))
assert.match(dispatcher, /MAX_CONCURRENCY = 5/)
assert.match(dispatcher, /commands\.slice\(index, index \+ MAX_CONCURRENCY\)/)
assert.match(webhook, /bridge_record_conveyancer_provider_credential_check_h6/)
assert.match(webhook, /retrySafe: false/)

console.log('H7 conveyancer provider transport tests passed.')
