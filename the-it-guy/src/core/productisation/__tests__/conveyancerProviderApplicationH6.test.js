import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runConveyancerProviderApplicationCommand, selectConveyancerProviderProfile } from '../conveyancerProviderApplicationH6.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716190001_conveyancer_h6_provider_application.sql', import.meta.url), 'utf8')
const edge = readFileSync(new URL('../../../../../supabase/functions/conveyancer-provider-runtime/index.ts', import.meta.url), 'utf8')
const org = '10000000-0000-4000-8000-000000000001'; const firm = '20000000-0000-4000-8000-000000000001'; const tx = '30000000-0000-4000-8000-000000000001'; const profileId = '40000000-0000-4000-8000-000000000001'
const profile = { id: profileId, record_id: profileId, revision: 1, organisation_id: org, attorney_firm_id: firm, provider_key: 'sars', adapter_key: 'generic_http', profile_status: 'sandbox', secret_reference: 'env://SARS_SANDBOX_TOKEN', source_phase: 'P6', payload: { environment: 'sandbox', allowedOrigin: 'https://sandbox.provider.example', capabilities: ['submit_transfer_duty_declaration'], allowedLanes: ['transfer'], operationPaths: { submit: '/v1/submit' }, authentication: { type: 'bearer', headerName: 'Authorization' } } }
const check = { integration_profile_id: profileId, status: 'verified', checked_at: '2026-07-16T12:00:00Z', expires_at: '2099-07-16T12:15:00Z' }

assert.equal(selectConveyancerProviderProfile({ profiles: [profile], credentialChecks: [check], capability: 'submit_transfer_duty_declaration', lane: 'transfer' }).reason, 'provider_profile_ready')
assert.equal(selectConveyancerProviderProfile({ profiles: [profile], credentialChecks: [], capability: 'submit_transfer_duty_declaration', lane: 'transfer' }).manualFallbackRequired, true)
assert.equal(selectConveyancerProviderProfile({ profiles: [profile], credentialChecks: [], capability: 'submit_transfer_duty_declaration', lane: 'transfer' }).canAttempt, true)
assert.equal(selectConveyancerProviderProfile({ profiles: [profile], credentialChecks: [check], capability: 'request_bank_guarantee', lane: 'bond' }).reason, 'provider_profile_not_configured')

const calls = []
const result = await runConveyancerProviderApplicationCommand({
  functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { ok: true, decision: 'committed', code: 'provider_operation_completed' }, error: null } } },
}, { context: { available: true, control: { mode: 'pilot' }, profiles: [profile], credentialChecks: [check] }, organisationId: org, attorneyFirmId: firm, transactionId: tx, operationId: 'op:1', capability: 'submit_transfer_duty_declaration', operationType: 'submit', lane: 'transfer', payloadReference: 'provider-payloads/matter/declaration.json', payloadHash: `sha256:${'a'.repeat(64)}`, idempotencyKey: 'sars:1', authorityReference: 'approval:1', requestedAt: '2026-07-16T12:00:00Z', requestedBy: 'user:1' })
assert.equal(result.ok, true)
assert.equal(calls[0].name, 'conveyancer-provider-runtime')
assert.equal(calls[0].options.body.profileId, profileId)

for (const fragment of ['conveyancer_provider_credential_checks', 'bridge_record_conveyancer_provider_credential_check_h6', 'minimal and secret-free', 'bridge_conveyancer_reject_mutation']) assert.match(migration, new RegExp(fragment))
assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_provider_credential_checks.*authenticated/i)
assert.match(edge, /bridge_record_conveyancer_provider_credential_check_h6/)
assert.match(edge, /provider_credential_unavailable/)
assert.doesNotMatch(edge, /credentialValue|rawCredential/)

console.log('H6 conveyancer provider application tests passed.')
