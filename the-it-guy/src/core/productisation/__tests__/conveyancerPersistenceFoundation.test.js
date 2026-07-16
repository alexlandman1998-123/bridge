import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONVEYANCER_DERIVED_PROJECTIONS,
  CONVEYANCER_PERSISTED_TABLES,
  CONVEYANCER_PERSISTENCE_CONTROLS,
  CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION,
  CONVEYANCER_PERSISTENCE_RECORD_MAP,
  buildConveyancerPersistenceFoundation,
  validateConveyancerPersistenceFoundation,
} from '../conveyancerPersistenceFoundation.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/202607160001_conveyancer_productisation_p1.sql', import.meta.url), 'utf8')

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) }
  catch (error) { console.error(`not ok - ${name}`); throw error }
}

test('builds the complete P1 persistence foundation', () => {
  const result = buildConveyancerPersistenceFoundation()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.foundation.version, CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION)
  assert.equal(result.foundation.tables.length, 15)
})

test('maps every persisted P0 record without duplicating matter or templates', () => {
  const map = new Map(CONVEYANCER_PERSISTENCE_RECORD_MAP.map((entry) => [entry.p0Key, entry]))
  assert.deepEqual(map.get('matter'), { p0Key: 'matter', persistedAs: 'transactions', existing: true })
  assert.equal(map.get('template').existing, true)
  assert.equal(map.get('external_document').externalReference, true)
  assert.equal(map.get('inbound_integration_event').direction, 'inbound')
  assert.equal(map.get('outbound_integration_command').direction, 'outbound')
})

test('keeps queues, timelines and readiness as projections', () => {
  assert.deepEqual(CONVEYANCER_DERIVED_PROJECTIONS, ['action_queue', 'professional_timeline', 'lodgement_readiness'])
  for (const projection of CONVEYANCER_DERIVED_PROJECTIONS) assert.equal(CONVEYANCER_PERSISTED_TABLES.includes(projection), false)
})

test('creates every P1 table with RLS, scoped reads and immutable triggers', () => {
  for (const table of CONVEYANCER_PERSISTED_TABLES) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table} \\(`))
    assert.equal(migration.includes(`'${table}'`), true)
  }
  assert.match(migration, /enable row level security/)
  assert.match(migration, /bridge_conveyancer_can_access_record/)
  assert.match(migration, /bridge_conveyancer_reject_mutation/)
})

test('requires canonical firm membership plus existing transaction access', () => {
  assert.match(migration, /firm\.organisation_id = target_organisation_id/)
  assert.match(migration, /member\.user_id = auth\.uid\(\)/)
  assert.match(migration, /member\.status = 'active'/)
  assert.match(migration, /bridge_can_access_transaction_spine\(target_transaction_id\)/)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.authenticatedUpdateAllowed, false)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.authenticatedDeleteAllowed, false)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.authenticatedInsertAllowed, false)
  assert.match(migration, /grant insert on table public\.%I to service_role/)
  assert.match(migration, /revoke all on table public\.%I from anon, authenticated, service_role/)
})

test('uses references and hashes for documents, evidence and provider envelopes', () => {
  for (const column of ['object_bucket text', 'object_path text', 'content_hash text']) assert.match(migration, new RegExp(column))
  assert.equal(migration.includes('secret text'), false)
  assert.equal(migration.includes('document bytea'), false)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.payloadsStoredByReference, true)
})

test('binds child events to the exact parent tenant, firm and matter', () => {
  for (const parent of ['matter_plan_id', 'exception_id', 'financial_model_id', 'evidence_id']) {
    assert.match(migration, new RegExp(`foreign key \\(${parent}, organisation_id, attorney_firm_id, transaction_id\\)`))
  }
  assert.match(migration, /foreign key \(integration_profile_id, organisation_id, attorney_firm_id\)/)
})

test('makes audit writes trigger-only and all records append-only', () => {
  assert.match(migration, /bridge_conveyancer_capture_insert_audit/)
  assert.match(migration, /revoke insert on public\.conveyancer_audit_events from anon, authenticated, service_role/)
  assert.match(migration, /before update or delete/)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.directAuditWritesAllowed, false)
  assert.equal(CONVEYANCER_PERSISTENCE_CONTROLS.appendOnly, true)
})

test('rejects control drift and accidental projection persistence', () => {
  const drift = validateConveyancerPersistenceFoundation({
    version: CONVEYANCER_PERSISTENCE_FOUNDATION_VERSION,
    tables: [...CONVEYANCER_PERSISTED_TABLES, 'action_queue'],
    controls: { ...CONVEYANCER_PERSISTENCE_CONTROLS, appendOnly: false },
  })
  assert.equal(drift.ok, false)
  assert.equal(drift.errors.includes('p1_projection_persistence_forbidden'), true)
  assert.equal(drift.errors.includes('p1_control_invalid:appendOnly'), true)
})

console.log('P1 conveyancer persistence foundation tests passed.')
