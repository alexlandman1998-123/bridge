export const MVP_EXPOSURE_READINESS_VERSION = 'arch9_mvp_exposure_readiness_v1'

export const MVP_REQUIRED_STAGING_SCENARIOS = Object.freeze([
  'cash_individual',
  'bond_company',
  'hybrid_trust',
  'development_company',
])

function text(value) {
  return String(value || '').trim()
}

function rows(value) {
  return Array.isArray(value) ? value : []
}

function isFresh(value, now, maxAgeHours) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return now.getTime() - date.getTime() <= maxAgeHours * 60 * 60 * 1000 && date.getTime() <= now.getTime()
}

function scenarioPasses(scenario = {}) {
  const record = scenario.postDeployCheck || scenario.post_deploy_check || {}
  const batch = record.batchRecord || record.batch_record || {}
  return scenario.leadToRegistrationPassed === true &&
    record.passed === true &&
    Boolean(text(batch.transactionId || record.transactionId)) &&
    Boolean(text(batch.idempotencyKey)) &&
    batch.participantBootstrapComplete === true &&
    batch.documentBootstrapComplete === true &&
    batch.workflowBootstrapComplete === true &&
    batch.conversionConfirmed === true &&
    batch.healthAudited === true &&
    batch.notificationDeliveryReviewed === true
}

/**
 * Fail-closed exposure decision: local code certification is necessary but
 * never substitutes for fresh, accountable staging evidence.
 */
export function evaluateMvpExposureReadiness({ localChecks = {}, stagingEvidence = null, now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const blockers = []
  if (localChecks.releaseCertificationPassed !== true) blockers.push('release_certification_failed')
  if (localChecks.pilotSessionPassed !== true) blockers.push('pilot_session_check_failed')
  if (localChecks.supportRunbookPassed !== true) blockers.push('pilot_support_runbook_check_failed')

  if (!stagingEvidence || typeof stagingEvidence !== 'object') {
    blockers.push('staging_evidence_missing')
  } else {
    if (text(stagingEvidence.environment).toLowerCase() !== 'staging') blockers.push('staging_environment_not_confirmed')
    if (!isFresh(stagingEvidence.collectedAt, now, maxEvidenceAgeHours)) blockers.push('staging_evidence_stale_or_invalid')
    if (!text(stagingEvidence.operator?.name || stagingEvidence.operatorName)) blockers.push('staging_evidence_operator_missing')
    const deployment = stagingEvidence.deployment || {}
    if (deployment.contractCheckPassed !== true) blockers.push('staging_rpc_contract_not_verified')
    if (deployment.atomicCreationMigrationApplied !== true) blockers.push('staging_atomic_creation_migration_not_confirmed')
    const notificationSafety = stagingEvidence.notificationSafety || stagingEvidence.notification_safety || {}
    if (notificationSafety.testDataSuppressionPassed !== true) blockers.push('test_data_notification_safety_not_verified')
    if (notificationSafety.outboxSmokePassed !== true) blockers.push('notification_outbox_smoke_not_verified')

    const scenarios = rows(stagingEvidence.scenarios)
    for (const key of MVP_REQUIRED_STAGING_SCENARIOS) {
      const scenario = scenarios.find((item) => text(item.key) === key)
      if (!scenario) blockers.push(`staging_scenario_missing:${key}`)
      else if (!scenarioPasses(scenario)) blockers.push(`staging_scenario_failed:${key}`)
    }
  }

  return {
    version: MVP_EXPOSURE_READINESS_VERSION,
    decision: blockers.length ? 'do_not_expose' : 'ready_for_controlled_exposure',
    maxEvidenceAgeHours,
    requiredStagingScenarios: MVP_REQUIRED_STAGING_SCENARIOS,
    blockers,
  }
}
