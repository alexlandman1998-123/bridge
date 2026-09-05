export const RENTAL_FOUNDATION_MIGRATION_SOURCES = Object.freeze([
  'sql/20260829_rental_property_foundation.sql',
  'sql/20260829_rental_unit_foundation.sql',
  'sql/20260829_rental_portfolio_foundation.sql',
  'sql/20260829_rental_landlord_mandate_foundation.sql',
  'sql/20260829_rental_vacancy_foundation.sql',
  'sql/20260829_rental_evidence_foundation.sql',
  'sql/20260829_rental_vacancy_marketing_foundation.sql',
  'sql/20260829_rental_internal_marketing_operations.sql',
  'sql/20260829_rental_applications_and_applicant_access.sql',
  'sql/20260829_rental_application_submission.sql',
  'sql/20260829_rental_application_documents.sql',
  'sql/20260829_rental_application_review_workspace.sql',
  'sql/20260829_rental_application_screening.sql',
  'sql/20260829_rental_application_screening_reviewer_actor.sql',
  'sql/20260829_rental_application_decisions.sql',
  'sql/20260829_rental_application_tenancy_conversion.sql',
  'supabase/migrations/20260905120250_rental_portal_foundation.sql',
])
import { assessRentalRecoveryEvidence } from './rentalRecoveryEvidence.js'

export function assessRentalFoundationMigrationPlan({ evidence = {}, sourceFiles = [] } = {}) {
  const suppliedSources = Array.isArray(sourceFiles) ? sourceFiles : []
  const sourceOrderMatches = suppliedSources.length === RENTAL_FOUNDATION_MIGRATION_SOURCES.length
    && suppliedSources.every((source, index) => source === RENTAL_FOUNDATION_MIGRATION_SOURCES[index])
  const evidenceAssessment = assessRentalRecoveryEvidence(evidence)
  const missingEvidence = evidenceAssessment.checks
    .filter((check) => !check.pass)
    .map((check) => check.code)

  return {
    version: 'arch9_rental_foundation_migration_plan_phase3_v1',
    status: missingEvidence.length || !sourceOrderMatches
      ? 'BLOCKED_PENDING_RECOVERY_EVIDENCE'
      : 'READY_FOR_MANAGED_MIGRATION_AUTHORING_ONLY',
    sourceOrderMatches,
    sourceFiles: RENTAL_FOUNDATION_MIGRATION_SOURCES,
    missingEvidence,
    evidenceChecks: evidenceAssessment.checks,
    generationAllowed: evidenceAssessment.ready && sourceOrderMatches,
    applyAllowed: false,
    nextAction: missingEvidence.length || !sourceOrderMatches
      ? 'Attach all recovery evidence and preserve the approved source order before authoring managed migrations.'
      : 'Author reviewed managed migrations only; a separately authorised later phase controls any database apply.',
  }
}
