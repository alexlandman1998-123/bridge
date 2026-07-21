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

test('shadow mode observes an explicit pause without blocking production users', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'shadow', schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason: 'paused', stage: 'pilot', revision: 4 } })
  assert.equal(result.allowed, true)
  assert.equal(result.code, 'N6_SHADOW_PAUSED')
  assert.equal(result.observedReason, 'paused')
  assert.equal(result.observedAllowed, false)
})

test('shadow mode observes unenrolled organisations without blocking normal access', () => {
  const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'shadow', schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason: 'not_enrolled', stage: 'pilot', revision: 4 } })
  assert.equal(result.allowed, true)
  assert.equal(result.code, 'N6_SHADOW_NOT_ENROLLED')
  assert.equal(result.observedReason, 'not_enrolled')
})

test('blocks expired, unenrolled and over-limit organisations', () => {
  for (const reason of ['expired', 'not_enrolled', 'cohort_limit_exceeded']) {
    const result = resolveDocumentExperienceRuntimeRolloutAccess({ organisationId: 'org-1', enforcementMode: 'enforced', schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason, stage: 'expanded' } })
    assert.equal(result.allowed, false, reason)
  }
})
