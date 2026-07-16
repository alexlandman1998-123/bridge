export const CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION = 'conveyancer_persistence_p1_v1'

export const CONVEYANCER_PERSISTENCE_MIGRATION = Object.freeze({
  version: '202607160001',
  file: '202607160001_conveyancer_productisation_p1.sql',
  strategy: 'expand_verify_activate',
  destructiveRollback: false,
})

export const CONVEYANCER_PERSISTED_TABLES = Object.freeze([
  'conveyancer_matter_plans',
  'conveyancer_action_events',
  'conveyancer_exceptions',
  'conveyancer_exception_events',
  'conveyancer_document_artifacts',
  'conveyancer_signing_records',
  'conveyancer_financial_models',
  'conveyancer_financial_events',
  'conveyancer_coordinations',
  'conveyancer_evidence',
  'conveyancer_evidence_reviews',
  'conveyancer_integration_profiles',
  'conveyancer_integration_events',
  'conveyancer_assurance_reports',
  'conveyancer_audit_events',
])

export const CONVEYANCER_DERIVED_PROJECTIONS = Object.freeze([
  'action_queue',
  'professional_timeline',
  'lodgement_readiness',
])

export const CONVEYANCER_PERSISTENCE_CONTROLS = Object.freeze({
  matterSourceOfTruth: 'transactions',
  workspaceSourceOfTruth: 'organisations',
  firmSourceOfTruth: 'attorney_firms',
  accessFunction: 'bridge_conveyancer_can_access_record',
  transactionAccessFunction: 'bridge_can_access_transaction_spine',
  appendOnly: true,
  revisionedCanonicalRecords: true,
  directAuditWritesAllowed: false,
  authenticatedInsertAllowed: false,
  payloadsStoredByReference: true,
  providerCreatesLegalTruth: false,
  authenticatedUpdateAllowed: false,
  authenticatedDeleteAllowed: false,
})

export const CONVEYANCER_PERSISTENCE_RECORD_MAP = Object.freeze([
  Object.freeze({ p0Key: 'matter', persistedAs: 'transactions', existing: true }),
  Object.freeze({ p0Key: 'matter_plan', persistedAs: 'conveyancer_matter_plans' }),
  Object.freeze({ p0Key: 'action_execution', persistedAs: 'conveyancer_action_events' }),
  Object.freeze({ p0Key: 'exception', persistedAs: 'conveyancer_exceptions' }),
  Object.freeze({ p0Key: 'exception_decision', persistedAs: 'conveyancer_exception_events' }),
  Object.freeze({ p0Key: 'template', persistedAs: 'legal_template_registry', existing: true }),
  Object.freeze({ p0Key: 'document_artifact', persistedAs: 'conveyancer_document_artifacts' }),
  Object.freeze({ p0Key: 'signing_record', persistedAs: 'conveyancer_signing_records' }),
  Object.freeze({ p0Key: 'financial_model', persistedAs: 'conveyancer_financial_models' }),
  Object.freeze({ p0Key: 'financial_event', persistedAs: 'conveyancer_financial_events' }),
  Object.freeze({ p0Key: 'coordination', persistedAs: 'conveyancer_coordinations' }),
  Object.freeze({ p0Key: 'evidence', persistedAs: 'conveyancer_evidence' }),
  Object.freeze({ p0Key: 'evidence_review', persistedAs: 'conveyancer_evidence_reviews' }),
  Object.freeze({ p0Key: 'integration_profile', persistedAs: 'conveyancer_integration_profiles' }),
  Object.freeze({ p0Key: 'inbound_integration_event', persistedAs: 'conveyancer_integration_events', direction: 'inbound' }),
  Object.freeze({ p0Key: 'outbound_integration_command', persistedAs: 'conveyancer_integration_events', direction: 'outbound' }),
  Object.freeze({ p0Key: 'assurance_report', persistedAs: 'conveyancer_assurance_reports' }),
  Object.freeze({ p0Key: 'external_document', persistedAs: 'object_bucket_and_path', externalReference: true }),
  ...CONVEYANCER_DERIVED_PROJECTIONS.map((p0Key) => Object.freeze({ p0Key, persistedAs: null, derived: true })),
])

export function validateConveyancerPersistenceFoundation(input = {}) {
  const errors = []
  const tables = Array.isArray(input.tables) ? input.tables : []
  const controls = input.controls || {}
  if (input.version !== CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION) errors.push('p1_version_invalid')
  if (new Set(tables).size !== CONVEYANCER_PERSISTED_TABLES.length || CONVEYANCER_PERSISTED_TABLES.some((table) => !tables.includes(table))) errors.push('p1_table_coverage_invalid')
  for (const [key, expected] of Object.entries(CONVEYANCER_PERSISTENCE_CONTROLS)) {
    if (controls[key] !== expected) errors.push(`p1_control_invalid:${key}`)
  }
  if (CONVEYANCER_DERIVED_PROJECTIONS.some((projection) => tables.includes(projection))) errors.push('p1_projection_persistence_forbidden')
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) })
}

export function buildConveyancerPersistenceFoundation() {
  const foundation = {
    version: CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION,
    migration: CONVEYANCER_PERSISTENCE_MIGRATION,
    tables: CONVEYANCER_PERSISTED_TABLES,
    projections: CONVEYANCER_DERIVED_PROJECTIONS,
    recordMap: CONVEYANCER_PERSISTENCE_RECORD_MAP,
    controls: CONVEYANCER_PERSISTENCE_CONTROLS,
  }
  const validation = validateConveyancerPersistenceFoundation(foundation)
  return Object.freeze({ ...validation, foundation: Object.freeze(foundation) })
}
