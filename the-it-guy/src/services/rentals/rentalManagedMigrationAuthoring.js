const AUTHORING_ITEMS = Object.freeze([
  ['rental_property_foundation', 'sql/20260829_rental_property_foundation.sql'],
  ['rental_unit_foundation', 'sql/20260829_rental_unit_foundation.sql'],
  ['rental_portfolio_foundation', 'sql/20260829_rental_portfolio_foundation.sql'],
  ['rental_landlord_mandate_foundation', 'sql/20260829_rental_landlord_mandate_foundation.sql'],
  ['rental_vacancy_foundation', 'sql/20260829_rental_vacancy_foundation.sql'],
  ['rental_evidence_foundation', 'sql/20260829_rental_evidence_foundation.sql'],
  ['rental_vacancy_marketing_foundation', 'sql/20260829_rental_vacancy_marketing_foundation.sql'],
  ['rental_internal_marketing_operations', 'sql/20260829_rental_internal_marketing_operations.sql'],
  ['rental_applications_and_applicant_access', 'sql/20260829_rental_applications_and_applicant_access.sql'],
  ['rental_application_submission', 'sql/20260829_rental_application_submission.sql'],
  ['rental_application_documents', 'sql/20260829_rental_application_documents.sql'],
  ['rental_application_review_workspace', 'sql/20260829_rental_application_review_workspace.sql'],
  ['rental_application_screening', 'sql/20260829_rental_application_screening.sql'],
  ['rental_application_screening_reviewer_actor', 'sql/20260829_rental_application_screening_reviewer_actor.sql'],
  ['rental_application_decisions', 'sql/20260829_rental_application_decisions.sql'],
  ['rental_application_tenancy_conversion', 'sql/20260829_rental_application_tenancy_conversion.sql'],
].map(([name, source], order) => ({ order: order + 1, name, source })))

export function buildRentalManagedMigrationAuthoringWorkOrder(sourceLock = {}) {
  const authoringAllowed = sourceLock.authoringAllowed === true
  return {
    version: 'arch9_rental_managed_migration_authoring_phase6_v1',
    status: authoringAllowed ? 'READY_FOR_SCAFFOLDING_ONLY' : 'BLOCKED_PENDING_SOURCE_LOCK',
    sourceLock: sourceLock.chainSha256 || null,
    scaffoldAllowed: authoringAllowed,
    applyAllowed: false,
    items: AUTHORING_ITEMS,
    reviewRequirements: [
      'Create every new managed migration with `supabase migration new`; never invent timestamps.',
      'Copy only the locked source content after dependency, idempotence, RLS, trigger, view, storage, and extension review.',
      'Do not modify the existing rental portal managed migration.',
      'Run local migration and security-advisor checks before any environment apply request.',
    ],
    nextAction: authoringAllowed
      ? 'Create reviewed local migration scaffolds only. Do not apply them to any database in this phase.'
      : 'Attach Phase 4 evidence and regenerate the Phase 5 source lock before scaffolding managed migrations.',
  }
}
