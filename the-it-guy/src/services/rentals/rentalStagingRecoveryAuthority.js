import { RENTAL_RECOVERY_ENVIRONMENTS } from './rentalRecoveryEvidence.js'

function text(value) {
  return String(value ?? '').trim()
}

function validTimestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

function validRecord(record) {
  return Boolean(
    record
    && record.confirmed === true
    && record.projectRef === RENTAL_RECOVERY_ENVIRONMENTS.staging
    && text(record.reference)
    && validTimestamp(record.recordedAt)
    && record.containsSecrets === false
    && record.containsCustomerRecords === false,
  )
}

export function assessRentalStagingRecoveryAuthority(evidence = {}) {
  const recovery = evidence.stagingRecovery
  const freeze = evidence.stagingFreeze
  const checks = [
    {
      code: 'STAGING_RECOVERY_POSITION_CONFIRMED',
      pass: validRecord(recovery) && ['snapshot', 'disposable'].includes(text(recovery?.recoveryMode)),
    },
    {
      code: 'STAGING_OPERATIONS_FROZEN',
      pass: validRecord(freeze)
        && freeze?.deploymentsFrozen === true
        && freeze?.outboundIntegrationsFrozen === true,
    },
  ]

  return {
    version: 'arch9_rental_staging_recovery_authority_phase1_v1',
    ready: checks.every((check) => check.pass),
    checks,
    nextAction: checks.every((check) => check.pass)
      ? 'Staging recovery authority is recorded. The next phase may use only the approved recovery posture.'
      : 'Record a redacted staging snapshot/disposability decision and an independent operations-freeze confirmation.',
  }
}
