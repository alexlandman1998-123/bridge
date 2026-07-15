import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOtpOperationalAssurance } from '../otpOperationalAssurance.js'

const healthyRollout = { status: 'healthy', blockers: [] }

function diagnostics(overrides = {}) {
  return {
    gate: { status: 'pass', reason: 'No unsafe release states.' },
    queryWarnings: [],
    summary: {
      governedPackets: 3,
      criticalPackets: 0,
      warningPackets: 0,
      awaitingAttorney: 0,
      awaitingApproval: 0,
      score: 100,
    },
    ...overrides,
  }
}

test('keeps release unassessed until the read-only audit runs', () => {
  const result = buildOtpOperationalAssurance({ rolloutOperations: healthyRollout })
  assert.equal(result.status, 'not_run')
  assert.equal(result.releaseDecision, 'not_assessed')
  assert.equal(result.canContinueSignatureRelease, false)
})

test('returns a healthy keep-live decision when routing and release evidence pass', () => {
  const result = buildOtpOperationalAssurance({ rolloutOperations: healthyRollout, releaseDiagnostics: diagnostics() })
  assert.equal(result.status, 'healthy')
  assert.equal(result.templateDecision, 'keep_live')
  assert.equal(result.releaseDecision, 'continue')
  assert.equal(result.steps.every((step) => step.passed), true)
})

test('stops signature progression for unsafe governed release evidence without auto-rollback', () => {
  const result = buildOtpOperationalAssurance({
    rolloutOperations: healthyRollout,
    releaseDiagnostics: diagnostics({
      gate: { status: 'fail', reason: 'One unsafe packet.' },
      summary: { governedPackets: 2, criticalPackets: 1, warningPackets: 0, awaitingAttorney: 0, awaitingApproval: 0, score: 50 },
    }),
  })
  assert.equal(result.status, 'critical')
  assert.equal(result.releaseDecision, 'stop')
  assert.equal(result.templateDecision, 'keep_live')
  assert.match(result.recommendation, /Do not roll back automatically/)
})

test('holds release while attorney or operational review queues remain', () => {
  const result = buildOtpOperationalAssurance({
    rolloutOperations: healthyRollout,
    releaseDiagnostics: diagnostics({
      gate: { status: 'warning', reason: 'Two packets require review.' },
      summary: { governedPackets: 2, criticalPackets: 0, warningPackets: 2, awaitingAttorney: 1, awaitingApproval: 1, score: 50 },
    }),
  })
  assert.equal(result.status, 'review_required')
  assert.equal(result.releaseDecision, 'hold')
})

test('fails closed when diagnostic queries are incomplete', () => {
  const result = buildOtpOperationalAssurance({
    rolloutOperations: healthyRollout,
    releaseDiagnostics: diagnostics({ queryWarnings: [{ source: 'document_packet_versions', message: 'missing column' }] }),
  })
  assert.equal(result.status, 'incomplete')
  assert.equal(result.dataComplete, false)
  assert.equal(result.canContinueSignatureRelease, false)
})

test('distinguishes no generated governed packets from proven healthy release behaviour', () => {
  const result = buildOtpOperationalAssurance({
    rolloutOperations: healthyRollout,
    releaseDiagnostics: diagnostics({ summary: { governedPackets: 0, criticalPackets: 0, warningPackets: 0, awaitingAttorney: 0, awaitingApproval: 0, score: 100 } }),
  })
  assert.equal(result.status, 'no_evidence')
  assert.equal(result.releaseDecision, 'no_evidence')
  assert.equal(result.canContinueSignatureRelease, false)
})
