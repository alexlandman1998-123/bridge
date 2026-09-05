import { assessRentalRecoveryEvidence } from './rentalRecoveryEvidence.js'

const REQUIRED_CATALOG_GROUPS = Object.freeze([
  'tables',
  'functions',
  'policies',
  'triggers',
  'indexes',
  'storage',
])

function hasRequiredGroups(groups) {
  const provided = new Set(Array.isArray(groups) ? groups : [])
  return REQUIRED_CATALOG_GROUPS.every((group) => provided.has(group))
}

export function assessRentalProductionBaselineAuthority(evidence = {}) {
  const recoveryAssessment = assessRentalRecoveryEvidence(evidence)
  const checksByCode = new Map(recoveryAssessment.checks.map((check) => [check.code, check.pass]))
  const ledger = evidence.productionLedger || {}
  const catalog = evidence.productionCatalog || {}
  const checks = [
    {
      code: 'PRODUCTION_LEDGER_READ_ONLY_AND_FINGERPRINTED',
      pass: checksByCode.get('PRODUCTION_LEDGER_REDACTED_AND_BOUND') === true
        && ledger.readOnly === true
        && ledger.artifactKind === 'migration_ledger',
    },
    {
      code: 'PRODUCTION_CATALOG_COMPLETE_AND_FINGERPRINTED',
      pass: checksByCode.get('PRODUCTION_CATALOG_REDACTED_AND_BOUND') === true
        && catalog.readOnly === true
        && hasRequiredGroups(catalog.objectGroups),
    },
  ]

  return {
    version: 'arch9_rental_production_baseline_authority_phase2_v1',
    ready: checks.every((check) => check.pass),
    checks,
    requiredCatalogGroups: REQUIRED_CATALOG_GROUPS,
    nextAction: checks.every((check) => check.pass)
      ? 'Production baseline evidence is recorded. Compare it with the source lock before authoring managed migrations.'
      : 'Capture redacted, read-only production ledger and complete Rental catalog evidence.',
  }
}
