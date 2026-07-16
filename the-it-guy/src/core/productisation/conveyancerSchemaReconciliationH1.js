import { CONVEYANCER_PERSISTED_TABLES } from './conveyancerPersistenceFoundation.js'

export const CONVEYANCER_SCHEMA_H1_VERSION = 'conveyancer_schema_reconciliation_h1_v1'

export const CONVEYANCER_SCHEMA_H1_MIGRATIONS = Object.freeze([
  Object.freeze({ version: '20260716150001', file: '20260716150001_conveyancer_h1_routing_columns.sql', batch: 'additive_schema' }),
  Object.freeze({ version: '20260716150002', file: '20260716150002_conveyancer_h1_routing_backfill.sql', batch: 'backfill' }),
  Object.freeze({ version: '20260716150003', file: '20260716150003_conveyancer_h1_routing_constraints.sql', batch: 'constraints_indexes' }),
])

export const CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS = Object.freeze([
  Object.freeze({ name: 'property_tenure', dataType: 'text', nullable: true }),
  Object.freeze({ name: 'seller_type', dataType: 'text', nullable: true }),
  Object.freeze({ name: 'existing_bond', dataType: 'boolean', nullable: false }),
  Object.freeze({ name: 'cancellation_required', dataType: 'boolean', nullable: false }),
  Object.freeze({ name: 'vat_treatment', dataType: 'text', nullable: true }),
  Object.freeze({ name: 'routing_profile_version', dataType: 'text', nullable: true }),
  Object.freeze({ name: 'routing_profile_json', dataType: 'jsonb', nullable: false }),
])

export const CONVEYANCER_SCHEMA_H1_INDEXES = Object.freeze([
  'transactions_routing_profile_version_idx',
  'transactions_routing_attention_idx',
])

export const CONVEYANCER_SCHEMA_H1_FUNCTIONS = Object.freeze([
  'bridge_conveyancer_can_access_record',
  'bridge_set_conveyancer_orchestration_control',
  'bridge_apply_conveyancer_orchestration_batch',
  'bridge_set_conveyancer_notification_control',
  'bridge_enqueue_conveyancer_document_job',
  'bridge_set_conveyancer_provider_runtime_control',
  'bridge_set_conveyancer_provider_transport_control',
  'bridge_set_conveyancer_provider_kill_switch',
  'bridge_rollback_conveyancer_release',
])

export const CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES = Object.freeze([
  Object.freeze({ id: 'preflight', mutating: false, requires: Object.freeze([]), rollback: 'none' }),
  Object.freeze({ id: 'additive_schema', mutating: true, requires: Object.freeze(['preflight']), rollback: 'forward_repair' }),
  Object.freeze({ id: 'backfill', mutating: true, requires: Object.freeze(['additive_schema']), rollback: 'forward_repair' }),
  Object.freeze({ id: 'constraints_indexes', mutating: true, requires: Object.freeze(['backfill']), rollback: 'forward_repair' }),
  Object.freeze({ id: 'security_verification', mutating: false, requires: Object.freeze(['constraints_indexes']), rollback: 'none' }),
  Object.freeze({ id: 'activation', mutating: true, requires: Object.freeze(['security_verification']), rollback: 'kill_switch' }),
])

export const CONVEYANCER_SCHEMA_H1_CONTROLS = Object.freeze({
  forwardOnly: true,
  idempotentMigrationsRequired: true,
  destructiveRollbackAllowed: false,
  preflightRequired: true,
  backupReferenceRequired: true,
  rowCountReconciliationRequired: true,
  migrationHistoryReconciliationRequired: true,
  rlsVerificationRequired: true,
  immutableTriggerVerificationRequired: true,
  rpcVerificationRequired: true,
  h0ReadinessRequiredForActivation: true,
  killSwitchRequiredForActivation: true,
  externalProvidersRequired: false,
})

const text = (value = '') => String(value ?? '').trim()
const unique = (values = []) => [...new Set(values.filter(Boolean))]
const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(freeze)
  return Object.freeze(value)
}

function normalizeVersions(values = []) {
  return unique(values.map((item) => text(typeof item === 'object' ? item.version : item)).filter((value) => /^\d{12,14}$/.test(value))).sort()
}

function normalizeSnapshot(input = {}) {
  return {
    environment: text(input.environment).toLowerCase(),
    localMigrationVersions: normalizeVersions(input.localMigrationVersions),
    remoteMigrationVersions: normalizeVersions(input.remoteMigrationVersions),
    columns: (input.columns || []).map((item) => ({ table: text(item.table || item.tableName).toLowerCase(), name: text(item.name || item.columnName).toLowerCase(), dataType: text(item.dataType).toLowerCase(), nullable: item.nullable !== false })),
    tables: (input.tables || []).map((item) => ({ name: text(item.name || item.tableName).toLowerCase(), rlsEnabled: item.rlsEnabled === true, policyCount: Math.max(0, Number(item.policyCount || 0)), immutableTrigger: item.immutableTrigger === true })),
    indexes: unique((input.indexes || []).map((item) => text(typeof item === 'object' ? item.name : item).toLowerCase())),
    functions: unique((input.functions || []).map((item) => text(typeof item === 'object' ? item.name : item).toLowerCase())),
    backupReference: text(input.backupReference) || null,
    rowCountReconciled: input.rowCountReconciled === true,
    capturedAt: text(input.capturedAt) || null,
  }
}

export function evaluateConveyancerSchemaReconciliation(input = {}) {
  const snapshot = normalizeSnapshot(input)
  const findings = []
  if (!['local', 'staging', 'production'].includes(snapshot.environment)) findings.push('schema_environment_invalid')
  const local = new Set(snapshot.localMigrationVersions)
  const remote = new Set(snapshot.remoteMigrationVersions)
  const remoteOnly = snapshot.remoteMigrationVersions.filter((version) => !local.has(version))
  const pendingLocal = snapshot.localMigrationVersions.filter((version) => !remote.has(version))
  if (remoteOnly.length) findings.push('migration_history_remote_only')

  const finalVersion = CONVEYANCER_SCHEMA_H1_MIGRATIONS.at(-1).version
  const h1Applied = remote.has(finalVersion)
  const columns = new Map(snapshot.columns.filter((item) => item.table === 'transactions').map((item) => [item.name, item]))
  const missingColumns = CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS.filter((expected) => {
    const actual = columns.get(expected.name)
    return !actual || actual.dataType !== expected.dataType || actual.nullable !== expected.nullable
  }).map((item) => item.name)
  const missingIndexes = CONVEYANCER_SCHEMA_H1_INDEXES.filter((name) => !snapshot.indexes.includes(name))
  const tables = new Map(snapshot.tables.map((item) => [item.name, item]))
  const missingTables = CONVEYANCER_PERSISTED_TABLES.filter((name) => !tables.has(name))
  const rlsFailures = CONVEYANCER_PERSISTED_TABLES.filter((name) => {
    const table = tables.get(name)
    return table && (!table.rlsEnabled || table.policyCount < 1)
  })
  const triggerFailures = CONVEYANCER_PERSISTED_TABLES.filter((name) => tables.has(name) && !tables.get(name).immutableTrigger)
  const missingFunctions = CONVEYANCER_SCHEMA_H1_FUNCTIONS.filter((name) => !snapshot.functions.includes(name))

  if (missingTables.length) findings.push('conveyancer_tables_missing')
  if (rlsFailures.length) findings.push('conveyancer_rls_incomplete')
  if (triggerFailures.length) findings.push('conveyancer_immutable_triggers_incomplete')
  if (missingFunctions.length) findings.push('conveyancer_rpcs_missing')
  if (h1Applied && missingColumns.length) findings.push('h1_columns_missing_after_migration')
  if (h1Applied && missingIndexes.length) findings.push('h1_indexes_missing_after_migration')
  if (h1Applied && !snapshot.backupReference) findings.push('h1_backup_reference_missing')
  if (h1Applied && !snapshot.rowCountReconciled) findings.push('h1_row_count_not_reconciled')

  const structuralBlockers = findings.filter((finding) => finding !== 'h1_backup_reference_missing' && finding !== 'h1_row_count_not_reconciled')
  let decision = 'blocked'
  if (!remoteOnly.length && !h1Applied && !missingTables.length && !rlsFailures.length && !triggerFailures.length && !missingFunctions.length) decision = 'ready_to_apply'
  if (h1Applied && !findings.length && !pendingLocal.length) decision = 'reconciled'
  if (h1Applied && !structuralBlockers.length && pendingLocal.length) decision = 'verification_required'

  return freeze({
    version: CONVEYANCER_SCHEMA_H1_VERSION,
    decision,
    findings: unique(findings),
    history: { remoteOnly, pendingLocal, h1Applied },
    schema: { missingColumns, missingIndexes, missingTables, rlsFailures, triggerFailures, missingFunctions },
    snapshot,
    controls: CONVEYANCER_SCHEMA_H1_CONTROLS,
  })
}

export function planConveyancerSchemaDeployment(input = {}) {
  const completed = unique((input.completedBatches || []).map((item) => text(item).toLowerCase()))
  const evidence = input.evidence || {}
  const findings = []
  for (const batch of CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES) {
    if (completed.includes(batch.id) && batch.requires.some((requirement) => !completed.includes(requirement))) findings.push(`deployment_batch_out_of_order:${batch.id}`)
  }
  if (completed.includes('additive_schema') && !text(evidence.backupReference)) findings.push('deployment_backup_reference_required')
  if (completed.includes('backfill') && evidence.rowCountReconciled !== true) findings.push('deployment_row_count_reconciliation_required')
  if (completed.includes('security_verification') && evidence.securityPreflightPassed !== true) findings.push('deployment_security_verification_required')
  if (completed.includes('activation') && evidence.h0Decision !== 'ready_for_h1') findings.push('deployment_h0_readiness_required')
  if (completed.includes('activation') && evidence.killSwitchArmed !== true) findings.push('deployment_kill_switch_required')
  if (completed.includes('activation') && !text(evidence.activationApprovalReference)) findings.push('deployment_activation_approval_required')
  const nextBatch = CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES.find((batch) => !completed.includes(batch.id))?.id || null
  return freeze({ valid: findings.length === 0, findings: unique(findings), completedBatches: completed, nextBatch, complete: !nextBatch && findings.length === 0, controls: CONVEYANCER_SCHEMA_H1_CONTROLS })
}

export function buildConveyancerSchemaForwardRepair(input = {}) {
  const failedBatch = text(input.failedBatch).toLowerCase()
  const known = CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES.some((batch) => batch.id === failedBatch)
  const repair = {
    version: CONVEYANCER_SCHEMA_H1_VERSION,
    failedBatch: known ? failedBatch : null,
    incidentReference: text(input.incidentReference) || null,
    owner: text(input.owner) || null,
    reason: text(input.reason) || null,
    action: failedBatch === 'activation' ? 'enable_kill_switch_and_forward_repair' : 'stop_and_forward_repair',
    destructiveRollbackAllowed: false,
    databaseCommands: [],
  }
  const findings = []
  if (!repair.failedBatch || !repair.incidentReference || !repair.owner || !repair.reason) findings.push('forward_repair_context_invalid')
  return freeze({ valid: findings.length === 0, findings, repair })
}
