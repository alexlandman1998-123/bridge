import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchDocumentExperienceRuntimeRolloutAccess } from '../documentExperienceRuntimeRolloutService.js'

test('maps the runtime RPC decision without exposing control internals', async () => {
  let call = null
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: { configured: true, allowed: true, stage: 'pilot', revision: 2 }, error: null } } }
  const result = await fetchDocumentExperienceRuntimeRolloutAccess({ organisationId: '00000000-0000-4000-8000-000000000001', enforcementMode: 'enforced', client })
  assert.equal(call.name, 'bridge_document_experience_runtime_access_n6')
  assert.equal(result.allowed, true)
  assert.deepEqual(Object.keys(result).sort(), ['allowed', 'code', 'configured', 'contract', 'expiresAt', 'revision', 'stage', 'status'].sort())
})

test('keeps runtime RPC failures fail-open in shadow mode', async () => {
  const client = { rpc: async () => ({ data: null, error: { code: '42501', message: 'Organisation membership required.' } }) }
  const result = await fetchDocumentExperienceRuntimeRolloutAccess({ organisationId: '00000000-0000-4000-8000-000000000001', enforcementMode: 'shadow', client })
  assert.equal(result.allowed, true)
  assert.equal(result.code, 'N6_SHADOW_INVALID_CONTROL')
  assert.equal(result.observedReason, 'invalid_control')
})

test('blocks runtime RPC failures only when rollout is enforced', async () => {
  const client = { rpc: async () => { throw new Error('network unavailable') } }
  const result = await fetchDocumentExperienceRuntimeRolloutAccess({ organisationId: '00000000-0000-4000-8000-000000000001', enforcementMode: 'enforced', client })
  assert.equal(result.allowed, false)
  assert.equal(result.code, 'N6_INVALID_CONTROL')
})
