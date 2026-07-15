import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OTP_CANONICAL_RECOVERY_VERSION,
  buildCanonicalOtpRecoveryReadiness,
} from '../otpCanonicalRecovery.js'

function recoveryFixture(status = 'activated') {
  return {
    template: {
      id: 'template-1',
      template_label: 'Kingstons 2026 OTP',
      live_version_id: 'version-2',
      previous_live_version_id: 'version-1',
      metadata_json: {
        otp_rollout: status === 'activated'
          ? { status, activatedVersionId: 'version-2' }
          : { status, restoredVersionId: 'version-2', previousVersionId: 'version-1' },
      },
    },
    versions: [
      { id: 'version-2', template_id: 'template-1', status: 'published' },
      { id: 'version-1', template_id: 'template-1', status: 'superseded', template_label: 'Kingstons 2026 OTP v1' },
    ],
  }
}

test('allows recovery when the canonical live and retained versions are valid', () => {
  const readiness = buildCanonicalOtpRecoveryReadiness(recoveryFixture())

  assert.equal(readiness.schemaVersion, OTP_CANONICAL_RECOVERY_VERSION)
  assert.equal(readiness.status, 'healthy')
  assert.equal(readiness.canRollback, true)
  assert.equal(readiness.liveVersionId, 'version-2')
  assert.equal(readiness.rollbackVersionId, 'version-1')
})

test('supports pointer-level readiness before version evidence is loaded', () => {
  const { template } = recoveryFixture()
  const readiness = buildCanonicalOtpRecoveryReadiness({ template })

  assert.equal(readiness.canRollback, true)
  assert.equal(readiness.rollbackTarget.id, 'version-1')
})

test('blocks recovery without a distinct previous-live pointer', () => {
  const fixture = recoveryFixture()
  fixture.template.previous_live_version_id = fixture.template.live_version_id
  const readiness = buildCanonicalOtpRecoveryReadiness(fixture)

  assert.equal(readiness.canRollback, false)
  assert.equal(readiness.status, 'not_governed')
  assert.equal(readiness.checks.find((item) => item.key === 'recovery_pointer').passed, false)
})

test('blocks recovery when retained version evidence is invalid', () => {
  const fixture = recoveryFixture()
  fixture.versions[1].status = 'published'
  const readiness = buildCanonicalOtpRecoveryReadiness(fixture)

  assert.equal(readiness.canRollback, false)
  assert.equal(readiness.status, 'degraded')
  assert.equal(readiness.checks.find((item) => item.key === 'version_route').passed, false)
})

test('allows a reversible recovery after an earlier canonical rollback', () => {
  const readiness = buildCanonicalOtpRecoveryReadiness(recoveryFixture('rolled_back'))

  assert.equal(readiness.canRollback, true)
  assert.equal(readiness.checks.find((item) => item.key === 'rollout_record').passed, true)
})
