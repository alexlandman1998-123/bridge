import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDocumentExperienceRuntimeRolloutAccess } from '../documentExperienceRuntimeRolloutGate.js'

test('keeps a migration-safe shadow path before explicit rollout configuration', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'shadow', schemaAvailable: false })
  assert.equal(result.allowed, true)
  assert.equal(result.code, 'N6_SHADOW_SCHEMA_PENDING')
})

test('fails closed when enforcement cannot verify the runtime store', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'enforced', schemaAvailable: false })
  assert.equal(result.allowed, false)
  assert.equal(result.code, 'N6_RUNTIME_STORE_UNAVAILABLE')
})

test('allows only an explicitly enrolled active stage', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'enforced', schemaAvailable: true, rpcResult: { configured: true, allowed: true, stage: 'pilot', revision: 3, expires_at: '2026-07-20T00:00:00Z' } })
  assert.equal(result.allowed, true)
  assert.equal(result.stage, 'pilot')
  assert.equal(result.revision, 3)
})

test('an explicit pause blocks even in shadow mode', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'shadow', schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason: 'paused', stage: 'pilot', revision: 4 } })
  assert.equal(result.allowed, false)
  assert.equal(result.code, 'N6_PAUSED')
  assert.ok(result.solution.phases.length >= 2)
})

test('blocks expired, unenrolled and over-limit organisations', () => {
  for (const reason of ['expired', 'not_enrolled', 'cohort_limit_exceeded']) {
    const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'enforced', schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason, stage: 'expanded' } })
    assert.equal(result.allowed, false, reason)
  }
})
