import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

import { CONVEYANCER_PERSISTED_TABLES } from '../conveyancerPersistenceFoundation.js'
import {
  CONVEYANCER_SCHEMA_H1_CONTROLS,
  CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES,
  CONVEYANCER_SCHEMA_H1_FUNCTIONS,
  CONVEYANCER_SCHEMA_H1_INDEXES,
  CONVEYANCER_SCHEMA_H1_MIGRATIONS,
  CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS,
  buildConveyancerSchemaForwardRepair,
  evaluateConveyancerSchemaReconciliation,
  planConveyancerSchemaDeployment,
} from '../conveyancerSchemaReconciliationH1.js'

const migrations = CONVEYANCER_SCHEMA_H1_MIGRATIONS.map((item) => ({ ...item, sql: readFileSync(new URL(`../../../../../supabase/migrations/${item.file}`, import.meta.url), 'utf8') }))
const preflightSql = readFileSync(new URL('../../../../scripts/sql/conveyancer-readiness-h1-preflight.sql', import.meta.url), 'utf8')

const localVersions = ['202607160001', '202607160002', '202607160004', '202607160006', '202607160008', '202607160010', '202607160011', ...CONVEYANCER_SCHEMA_H1_MIGRATIONS.map((item) => item.version)]
const tables = CONVEYANCER_PERSISTED_TABLES.map((name) => ({ name, rlsEnabled: true, policyCount: 1, immutableTrigger: true }))
const columns = CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS.map((item) => ({ table: 'transactions', ...item }))

function snapshot(overrides = {}) {
  return {
    environment: 'staging',
    localMigrationVersions: localVersions,
    remoteMigrationVersions: localVersions,
    columns,
    tables,
    indexes: CONVEYANCER_SCHEMA_H1_INDEXES,
    functions: CONVEYANCER_SCHEMA_H1_FUNCTIONS,
    backupReference: 'backup:h1:before',
    rowCountReconciled: true,
    capturedAt: '2026-07-16T13:00:00.000Z',
    ...overrides,
  }
}

test('defines three ordered forward-only migrations for schema, backfill and constraints', () => {
  assert.deepEqual(CONVEYANCER_SCHEMA_H1_MIGRATIONS.map((item) => item.batch), ['additive_schema', 'backfill', 'constraints_indexes'])
  assert.equal(CONVEYANCER_SCHEMA_H1_CONTROLS.destructiveRollbackAllowed, false)
  assert.equal(CONVEYANCER_SCHEMA_H1_CONTROLS.forwardOnly, true)
  for (const { sql } of migrations) assert.doesNotMatch(sql, /drop\s+(table|column)|truncate|delete\s+from/i)
  assert.match(migrations[0].sql, /add column if not exists/i)
  assert.match(migrations[1].sql, /where existing_bond is distinct from/i)
  assert.match(migrations[2].sql, /create index if not exists/i)
})

test('uses unique migration versions across the complete local migration directory', () => {
  const files = readdirSync(new URL('../../../../../supabase/migrations/', import.meta.url)).filter((file) => file.endsWith('.sql'))
  const versions = files.map((file) => file.split('_')[0])
  const duplicates = [...new Set(versions.filter((version, index) => versions.indexOf(version) !== index))]
  assert.deepEqual(duplicates, [])
})

test('reconciles the complete routing profile contract, not only the first missing column', () => {
  const additive = migrations[0].sql
  for (const column of CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS) assert.match(additive, new RegExp(`add column if not exists ${column.name}`))
  assert.match(migrations[1].sql, /existing_bond = coalesce\(seller_has_existing_bond, false\)/)
  assert.match(migrations[1].sql, /cancellation_required = coalesce\(seller_has_existing_bond, false\)/)
  assert.match(migrations[2].sql, /transactions_routing_profile_json_object_check/)
  for (const index of CONVEYANCER_SCHEMA_H1_INDEXES) assert.match(migrations[2].sql, new RegExp(index))
})

test('blocks remote-only migration history divergence', () => {
  const result = evaluateConveyancerSchemaReconciliation(snapshot({ remoteMigrationVersions: [...localVersions, '202607169999'] }))
  assert.equal(result.decision, 'blocked')
  assert.deepEqual(result.history.remoteOnly, ['202607169999'])
  assert.equal(result.findings.includes('migration_history_remote_only'), true)
})

test('allows a controlled apply when H1 is pending but the security foundation is healthy', () => {
  const beforeH1 = localVersions.filter((version) => !CONVEYANCER_SCHEMA_H1_MIGRATIONS.some((item) => item.version === version))
  const result = evaluateConveyancerSchemaReconciliation(snapshot({ remoteMigrationVersions: beforeH1, columns: [], indexes: [], backupReference: null, rowCountReconciled: false }))
  assert.equal(result.decision, 'ready_to_apply')
  assert.equal(result.history.h1Applied, false)
  assert.deepEqual(result.schema.missingColumns, CONVEYANCER_SCHEMA_H1_TRANSACTION_COLUMNS.map((item) => item.name))
})

test('fails closed when applied migration history disagrees with the actual schema', () => {
  const result = evaluateConveyancerSchemaReconciliation(snapshot({ columns: columns.slice(1), indexes: [] }))
  assert.equal(result.decision, 'blocked')
  assert.equal(result.schema.missingColumns.includes('property_tenure'), true)
  assert.equal(result.findings.includes('h1_columns_missing_after_migration'), true)
  assert.equal(result.findings.includes('h1_indexes_missing_after_migration'), true)
})

test('requires RLS, policies, immutable triggers and guarded RPCs', () => {
  const unsafeTables = tables.map((item, index) => index === 0 ? { ...item, rlsEnabled: false, policyCount: 0, immutableTrigger: false } : item)
  const result = evaluateConveyancerSchemaReconciliation(snapshot({ tables: unsafeTables, functions: [] }))
  assert.equal(result.decision, 'blocked')
  assert.equal(result.findings.includes('conveyancer_rls_incomplete'), true)
  assert.equal(result.findings.includes('conveyancer_immutable_triggers_incomplete'), true)
  assert.equal(result.findings.includes('conveyancer_rpcs_missing'), true)
})

test('returns reconciled only for exact history, schema and reconciliation evidence', () => {
  const result = evaluateConveyancerSchemaReconciliation(snapshot())
  assert.equal(result.decision, 'reconciled')
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.history.pendingLocal, [])
})

test('enforces ordered deployment and independent activation evidence', () => {
  assert.deepEqual(CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES.map((item) => item.id), ['preflight', 'additive_schema', 'backfill', 'constraints_indexes', 'security_verification', 'activation'])
  assert.equal(planConveyancerSchemaDeployment().nextBatch, 'preflight')
  const outOfOrder = planConveyancerSchemaDeployment({ completedBatches: ['additive_schema'] })
  assert.equal(outOfOrder.valid, false)
  assert.equal(outOfOrder.findings.includes('deployment_batch_out_of_order:additive_schema'), true)
  const activated = planConveyancerSchemaDeployment({ completedBatches: CONVEYANCER_SCHEMA_H1_DEPLOYMENT_BATCHES.map((item) => item.id), evidence: { backupReference: 'backup:h1', rowCountReconciled: true, securityPreflightPassed: true, h0Decision: 'ready_for_h1', killSwitchArmed: true, activationApprovalReference: 'approval:h1' } })
  assert.equal(activated.complete, true)
})

test('creates forward-repair instructions without destructive database commands', () => {
  const repair = buildConveyancerSchemaForwardRepair({ failedBatch: 'activation', incidentReference: 'incident:h1', owner: 'owner:rollback', reason: 'Pilot error rate exceeded.' })
  assert.equal(repair.valid, true)
  assert.equal(repair.repair.action, 'enable_kill_switch_and_forward_repair')
  assert.equal(repair.repair.destructiveRollbackAllowed, false)
  assert.deepEqual(repair.repair.databaseCommands, [])
})

test('ships a read-only database preflight for columns, indexes, RLS, triggers, RPCs and history', () => {
  for (const token of ['information_schema.columns', 'pg_indexes', 'pg_class', 'pg_policies', 'pg_trigger', 'pg_proc', 'supabase_migrations.schema_migrations']) assert.match(preflightSql, new RegExp(token.replace('.', '\\.')))
  assert.doesNotMatch(preflightSql, /\b(insert|update|delete|alter|drop|truncate|create)\b/i)
})

console.log('H1 conveyancer schema reconciliation tests passed.')
