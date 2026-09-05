export const RENTAL_RECOVERY_ENVIRONMENTS = Object.freeze({
  production: 'isdowlnollckzvltkasn',
  staging: 'blhypeflxcrjbycpgfdk',
})

const SHA256 = /^sha256:[a-f0-9]{64}$/i

function text(value) {
  return String(value ?? '').trim()
}

function validTimestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

function commonEvidenceValid(item, projectRef) {
  return Boolean(
    item
    && item.confirmed === true
    && item.projectRef === projectRef
    && text(item.reference)
    && validTimestamp(item.recordedAt)
    && item.containsSecrets === false
    && item.containsCustomerRecords === false,
  )
}

export function assessRentalRecoveryEvidence(evidence = {}) {
  const ledger = evidence.productionLedger
  const catalog = evidence.productionCatalog
  const recovery = evidence.stagingRecovery
  const freeze = evidence.stagingFreeze
  const checks = [
    {
      code: 'PRODUCTION_LEDGER_REDACTED_AND_BOUND',
      pass: commonEvidenceValid(ledger, RENTAL_RECOVERY_ENVIRONMENTS.production) && SHA256.test(text(ledger?.artifactSha256)),
    },
    {
      code: 'PRODUCTION_CATALOG_REDACTED_AND_BOUND',
      pass: commonEvidenceValid(catalog, RENTAL_RECOVERY_ENVIRONMENTS.production) && SHA256.test(text(catalog?.artifactSha256)),
    },
    {
      code: 'STAGING_RECOVERY_BOUND',
      pass: commonEvidenceValid(recovery, RENTAL_RECOVERY_ENVIRONMENTS.staging)
        && ['snapshot', 'disposable'].includes(text(recovery?.recoveryMode)),
    },
    {
      code: 'STAGING_FREEZE_BOUND',
      pass: commonEvidenceValid(freeze, RENTAL_RECOVERY_ENVIRONMENTS.staging)
        && freeze?.deploymentsFrozen === true
        && freeze?.outboundIntegrationsFrozen === true,
    },
  ]

  return {
    version: 'arch9_rental_recovery_evidence_phase4_v1',
    ready: checks.every((check) => check.pass),
    checks,
    nextAction: checks.every((check) => check.pass)
      ? 'Evidence is ready for managed migration authoring only; no database apply is authorised.'
      : 'Attach redacted, project-bound evidence for every failed check before migration authoring.',
  }
}
