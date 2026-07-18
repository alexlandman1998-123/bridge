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
