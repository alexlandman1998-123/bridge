import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildConveyancerProviderOperation, buildConveyancerProviderProfile, buildConveyancerProviderRuntimeControl,
  createGenericHttpConveyancerProviderAdapter, evaluateConveyancerProviderRuntimeGate, executeConveyancerProviderOperation,
  invokeConveyancerProviderOperation, persistConveyancerProviderProfile, persistConveyancerProviderRuntimeControl,
} from '../conveyancerProviderRuntime.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160008_conveyancer_productisation_p6.sql', import.meta.url), 'utf8')
const edge = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-runtime/index.ts', import.meta.url), 'utf8')
const orgId = '10000000-0000-4000-8000-000000000001'; const firmId = '20000000-0000-4000-8000-000000000001'; const transactionId = '30000000-0000-4000-8000-000000000001'; const profileId = '40000000-0000-4000-8000-000000000001'
const capability = 'submit_transfer_duty_declaration'; const at = '2026-07-16T12:00:00.000Z'; const hash = `sha256:${'a'.repeat(64)}`
const pending = []
function test(name, fn) { try { const result = fn(); if (result?.then) { pending.push(result.then(() => console.log(`ok - ${name}`))); return } console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
function control(overrides = {}) { return buildConveyancerProviderRuntimeControl({ organisationId: orgId, attorneyFirmId: firmId, mode: 'pilot', allowedAdapters: ['manual', 'generic_http'], allowedCapabilities: [capability], pilotTransactionIds: [transactionId], killSwitchEnabled: false, failureThreshold: 3, cooldownSeconds: 300, timeoutMs: 5000, reason: 'P6 pilot', ...overrides }) }
function profile(overrides = {}) { return buildConveyancerProviderProfile({ profileId, organisationId: orgId, attorneyFirmId: firmId, providerKey: 'sars', adapterKey: 'generic_http', environment: 'sandbox', status: 'sandbox', secretReference: 'env://SARS_SANDBOX_TOKEN', allowedOrigin: 'https://sandbox.provider.example', capabilities: [capability], allowedLanes: ['transfer'], operationPaths: { submit_declaration: '/v1/declarations' }, authentication: { type: 'bearer' }, ...overrides }) }
function operation(overrides = {}) { return buildConveyancerProviderOperation({ operationId: 'op:sars:1', profileId, organisationId: orgId, attorneyFirmId: firmId, transactionId, capability, operationType: 'submit_declaration', lane: 'transfer', payloadReference: 'provider-payloads/matter/declaration.json', payloadHash: hash, idempotencyKey: 'sars:declaration:1', authorityReference: 'approval:c6:1', requestedAt: at, requestedBy: 'user:1', ...overrides }) }

test('defaults fail closed and scopes pilot, adapter, capability, lane and circuit', () => {
  const disabled = control({ mode: 'disabled', killSwitchEnabled: true }); assert.equal(evaluateConveyancerProviderRuntimeGate(disabled, profile().profile, operation().operation).reason, 'provider_kill_switch_enabled')
  assert.equal(evaluateConveyancerProviderRuntimeGate(control(), profile().profile, operation({ transactionId: 'other' }).operation).reason, 'matter_outside_provider_pilot')
  assert.equal(evaluateConveyancerProviderRuntimeGate(control(), profile().profile, operation({ lane: 'bond' }).operation).reason, 'provider_lane_not_enabled')
  assert.equal(evaluateConveyancerProviderRuntimeGate(control(), profile().profile, operation().operation, { state: 'open', reopenAt: '2999-01-01T00:00:00.000Z' }).reason, 'provider_circuit_open')
})

test('accepts references but rejects raw credentials and inline payloads', () => {
  assert.equal(profile().ok, true, JSON.stringify(profile().errors)); assert.equal(operation().ok, true)
  assert.ok(profile({ accessToken: 'raw-secret' }).errors.includes('provider_profile_contains_raw_secret_material'))
  assert.ok(profile({ secretReference: 'plain-secret' }).errors.includes('provider_secret_reference_invalid'))
  assert.ok(operation({ payload: { taxpayer: 'secret' } }).errors.includes('provider_operation_must_be_reference_only'))
})

test('executes an allowlisted HTTPS adapter with transient credential and payload resolvers', async () => {
  let request
  const adapter = createGenericHttpConveyancerProviderAdapter({ fetchImpl: async (url, options) => { request = { url: String(url), options }; return { ok: true, status: 200, headers: { get: (name) => name === 'x-provider-reference' ? 'sars:123' : name === 'x-content-sha256' ? hash : null } } } })
  const result = await executeConveyancerProviderOperation({ control: control(), profile: profile().profile, operation: operation().operation, adapters: { generic_http: adapter }, runtime: { resolveCredential: async () => 'transient-token', resolvePayload: async () => ({ declarationId: 'decl:1' }) } })
  assert.equal(result.ok, true); assert.equal(result.outcome.providerReference, 'sars:123'); assert.equal(request.url, 'https://sandbox.provider.example/v1/declarations'); assert.equal(request.options.headers.Authorization, 'Bearer transient-token'); assert.doesNotMatch(JSON.stringify(result), /transient-token/)
})

test('observe mode performs no provider call and adapter failures route to manual work', async () => {
  let calls = 0
  const observed = await executeConveyancerProviderOperation({ control: control({ mode: 'observe', pilotTransactionIds: [] }), profile: profile().profile, operation: operation().operation, adapters: { generic_http: { execute: async () => { calls += 1 } } } })
  assert.equal(observed.decision, 'observed'); assert.equal(calls, 0)
  const failed = await executeConveyancerProviderOperation({ control: control(), profile: profile().profile, operation: operation().operation, adapters: { generic_http: { execute: async () => ({ ok: false, code: 'provider_offline' }) } } })
  assert.equal(failed.decision, 'manual_fallback'); assert.equal(failed.outcome.humanReviewRequired, true)
})

test('blocks an adapter result that attempts to leak a credential', async () => {
  const result = await executeConveyancerProviderOperation({ control: control(), profile: profile().profile, operation: operation().operation, adapters: { generic_http: { execute: async () => ({ ok: true, providerReference: 'x', accessToken: 'leaked' }) } } })
  assert.equal(result.code, 'provider_adapter_secret_leak_blocked')
})

test('versions controls and profiles through firm-admin RPCs', async () => {
  const calls = []; const client = { rpc: async (name) => { calls.push(name); return { data: { ok: true }, error: null } } }
  await persistConveyancerProviderRuntimeControl(client, control()); await persistConveyancerProviderProfile(client, profile().profile)
  assert.deepEqual(calls, ['bridge_set_conveyancer_provider_runtime_control', 'bridge_set_conveyancer_provider_profile'])
})

test('invokes the authenticated server runtime with a validated reference-only operation', async () => {
  const calls = []; const client = { functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { ok: true, code: 'provider_operation_completed' }, error: null } } } }
  const result = await invokeConveyancerProviderOperation(client, operation().operation)
  assert.equal(result.ok, true); assert.equal(calls[0].name, 'conveyancer-provider-runtime'); assert.equal(calls[0].options.body.payloadReference, 'provider-payloads/matter/declaration.json'); assert.equal(Object.hasOwn(calls[0].options.body, 'payload'), false)
})

test('migration is append-only, reference-only, scoped and service-recorded', () => {
  for (const table of ['conveyancer_provider_runtime_controls', 'conveyancer_provider_health_events']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, /exact transaction cohort/i); assert.match(migration, /credential reference and exact HTTPS origin/i); assert.match(migration, /health evidence must be minimal and secret-free/i)
  assert.match(migration, /grant execute on function public\.bridge_record_conveyancer_provider_health\(jsonb\) to service_role/)
  assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_provider_health_events.*authenticated/i)
})

test('edge runtime hash-checks user-readable payloads, contains credentials and enforces circuit fallback', () => {
  assert.match(edge, /queryClient\.storage/); assert.match(edge, /crypto\.subtle\.digest\('SHA-256'/); assert.match(edge, /target\.origin !== origin\.origin/); assert.match(edge, /privateHost/); assert.match(edge, /provider_circuit_open/); assert.match(edge, /Deno\.env\.get/); assert.match(edge, /provider_result_unrecorded/); assert.match(edge, /x-p7-worker-secret/)
})

await Promise.all(pending)
console.log('P6 conveyancer provider runtime tests passed.')
