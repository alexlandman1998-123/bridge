import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_ROLLBACK_AUDIT_ACTION,
  buildOtpRollbackAuditEvent,
  buildOtpRolloutOperations,
} from '../otpRolloutOperations.js'

function template(overrides = {}) {
  return {
    id: 'governed-live',
    packet_type: 'otp',
    organisation_id: 'org-1',
    template_label: 'Governed OTP v2',
    is_active: true,
    is_default: true,
    status: 'published',
    metadata_json: {
      document_kind: 'standard',
      otp_rollout: {
        status: 'activated',
        activatedAt: '2026-07-15T10:00:00.000Z',
        activatedTemplateId: 'governed-live',
        previousTemplateId: 'previous-live',
        previousTemplateLabel: 'OTP v1',
        certificationKey: 'cert-1',
        templateFingerprint: 'fingerprint-1',
      },
    },
    ...overrides,
  }
}

const previous = template({
  id: 'previous-live',
  template_label: 'OTP v1',
  is_default: false,
  metadata_json: { document_kind: 'standard' },
})

test('reports a governed live OTP with a valid prior version as healthy and rollback-ready', () => {
  const live = template()
  const result = buildOtpRolloutOperations({ liveTemplate: live, templates: [live, previous] })
  assert.equal(result.status, 'healthy')
  assert.equal(result.canRollback, true)
  assert.equal(result.rollbackTarget.id, 'previous-live')
  assert.equal(result.checks.every((item) => item.passed), true)
})

test('blocks rollback when the prior template is missing', () => {
  const live = template()
  const result = buildOtpRolloutOperations({ liveTemplate: live, templates: [live] })
  assert.equal(result.status, 'degraded')
  assert.equal(result.canRollback, false)
  assert.ok(result.blockers.some((message) => message.includes('could not be found')))
})

test('blocks rollback across organisation boundaries', () => {
  const live = template()
  const foreignPrevious = { ...previous, organisation_id: 'org-2' }
  const result = buildOtpRolloutOperations({ liveTemplate: live, templates: [live, foreignPrevious] })
  assert.equal(result.canRollback, false)
  assert.equal(result.checks.find((item) => item.key === 'rollback_scope').passed, false)
})

test('blocks withdrawn rollback targets', () => {
  const live = template()
  const withdrawn = { ...previous, is_active: false, status: 'withdrawn' }
  const result = buildOtpRolloutOperations({ liveTemplate: live, templates: [live, withdrawn] })
  assert.equal(result.canRollback, false)
  assert.equal(result.checks.find((item) => item.key === 'rollback_availability').passed, false)
})

test('builds a separate immutable audit payload without modifying either legal template', () => {
  const live = template()
  const event = buildOtpRollbackAuditEvent({
    liveTemplate: live,
    rollbackTemplate: previous,
    organisationId: 'org-1',
    reason: 'Generation smoke test failed.',
    occurredAt: '2026-07-15T12:00:00.000Z',
  })
  assert.equal(event.action, OTP_ROLLBACK_AUDIT_ACTION)
  assert.equal(event.fromTemplate.id, 'governed-live')
  assert.equal(event.toTemplate.id, 'previous-live')
  assert.equal(event.activation.certificationKey, 'cert-1')
  assert.equal(event.reason, 'Generation smoke test failed.')
})
