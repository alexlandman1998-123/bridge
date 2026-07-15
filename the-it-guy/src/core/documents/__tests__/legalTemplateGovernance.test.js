import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canTransitionLegalTemplateStatus,
  normalizeLegalTemplateLifecycleStatus,
  resolveLegalTemplateGovernance,
} from '../legalTemplateGovernance.js'

test('normalises legacy lifecycle names without treating approved as published', () => {
  assert.equal(normalizeLegalTemplateLifecycleStatus('in review'), 'attorney_review')
  assert.equal(normalizeLegalTemplateLifecycleStatus('active'), 'published')
  assert.equal(normalizeLegalTemplateLifecycleStatus('approved'), 'approved')
  assert.equal(normalizeLegalTemplateLifecycleStatus('archived'), 'withdrawn')
})

test('allows the governed review and publish sequence', () => {
  assert.equal(canTransitionLegalTemplateStatus('draft', 'attorney_review'), true)
  assert.equal(canTransitionLegalTemplateStatus('attorney_review', 'approved'), true)
  assert.equal(canTransitionLegalTemplateStatus('approved', 'published'), true)
  assert.equal(canTransitionLegalTemplateStatus('published', 'draft'), false)
})

test('keeps legacy published templates signable for backwards compatibility', () => {
  const governance = resolveLegalTemplateGovernance({ status: 'published', is_active: true })

  assert.equal(governance.legacyCompatible, true)
  assert.equal(governance.selectableForSigning, true)
})

test('requires approval for governed templates and enforces effective dates', () => {
  const unapproved = resolveLegalTemplateGovernance({
    status: 'published',
    is_active: true,
    governance_version: 1,
  })
  const future = resolveLegalTemplateGovernance({
    status: 'published',
    is_active: true,
    governance_version: 1,
    approved_at: '2026-01-01T00:00:00.000Z',
    effective_from: '2027-01-01T00:00:00.000Z',
  }, { at: new Date('2026-07-14T12:00:00.000Z') })

  assert.equal(unapproved.selectableForSigning, false)
  assert.deepEqual(unapproved.blockingReasons, ['approval_not_recorded'])
  assert.equal(future.selectableForSigning, false)
  assert.deepEqual(future.blockingReasons, ['not_yet_effective'])
})

