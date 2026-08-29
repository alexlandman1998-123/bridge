import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const matrix = JSON.parse(await read('docs/transaction-sync-phase0-action-matrix.json'))

const requiredRoles = [
  'buyer',
  'seller',
  'agent',
  'bond_originator',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'system',
]
const requiredLanes = [
  'transaction_participants',
  'sales_otp',
  'finance',
  'transfer',
  'bond_registration',
  'seller_bond_cancellation',
  'registration',
]
const requiredOutputs = [
  'transaction_event',
  'lane_state',
  'transaction_rollup',
  'activity_projection',
  'refresh_signal',
  'audit_record',
]
const visibilityKeys = new Set(['internal', 'professional_shared', 'client_visible'])
const currentStates = new Set(['aligned', 'partial', 'disconnected'])

test('freezes the transaction aggregate, outputs, and refresh contract', () => {
  assert.equal(matrix.schemaVersion, 1)
  assert.equal(matrix.phase, 'phase_0_operating_contract')
  assert.equal(matrix.status, 'frozen')
  assert.equal(matrix.canonicalAuthority.aggregate, 'transactions')
  assert.equal(matrix.canonicalAuthority.eventLog, 'transaction_events')
  assert.deepEqual(matrix.requiredOutputs, requiredOutputs)
  assert.equal(matrix.refreshContract.signal, 'transaction_version_changed')
  assert.equal(matrix.refreshContract.scope, 'transaction_id')
  assert.equal(matrix.refreshContract.targetLatencyMs, 2000)
  assert.equal(matrix.refreshContract.pollingFallbackMs, 30000)
})

test('separates reusable identity, transaction participation, and immutable evidence', () => {
  assert.equal(matrix.profileOwnership.accountIdentity.sourceTable, 'profiles')
  assert.equal(matrix.profileOwnership.transactionParticipant.sourceTable, 'transaction_participants')
  assert.equal(matrix.profileOwnership.immutableEvidence.sourceTable, 'documents')
  assert.match(matrix.profileOwnership.accountIdentity.rule, /must not overwrite historical legal or signing evidence/i)
  assert.match(matrix.profileOwnership.transactionParticipant.rule, /transaction command/i)
  assert.match(matrix.profileOwnership.immutableEvidence.rule, /never silently rewritten/i)
})

test('covers every required role and lane with an owned action', () => {
  assert.deepEqual(matrix.roles, requiredRoles)
  assert.deepEqual(matrix.lanes, requiredLanes)

  const ownedRoles = new Set(matrix.actions.map((action) => action.ownerRole))
  const affectedLanes = new Set(matrix.actions.map((action) => action.affectedLane))
  for (const role of requiredRoles) assert.ok(ownedRoles.has(role), `Missing owned action for ${role}`)
  for (const lane of requiredLanes) assert.ok(affectedLanes.has(lane), `Missing action coverage for ${lane}`)
})

test('gives every action one authority, event, audience, visibility, idempotency, and implementation state', () => {
  const actionKeys = new Set()
  const eventTypes = new Set()
  for (const action of matrix.actions) {
    assert.match(action.actionKey, /^[A-Z][A-Z0-9_]+$/)
    assert.ok(!actionKeys.has(action.actionKey), `Duplicate action key ${action.actionKey}`)
    actionKeys.add(action.actionKey)

    assert.ok(requiredRoles.includes(action.ownerRole), `${action.actionKey} has an unknown owner role`)
    assert.match(action.sourceTable, /^[a-z][a-z0-9_]+$/)
    assert.match(action.eventType, /^[A-Z][A-Za-z0-9]+$/)
    assert.ok(!eventTypes.has(action.eventType), `Duplicate event type ${action.eventType}`)
    eventTypes.add(action.eventType)
    assert.ok(requiredLanes.includes(action.affectedLane), `${action.actionKey} has an unknown lane`)
    assert.ok(Array.isArray(action.audiences) && action.audiences.length > 0)
    assert.equal(new Set(action.audiences).size, action.audiences.length, `${action.actionKey} has duplicate audiences`)
    for (const audience of action.audiences) {
      assert.ok(requiredRoles.includes(audience), `${action.actionKey} has unknown audience ${audience}`)
    }
    assert.ok(visibilityKeys.has(action.defaultVisibility))
    assert.ok(action.visibilityRule.length >= 30)
    assert.match(action.idempotencyScope, /transaction_id:/)
    assert.ok(currentStates.has(action.currentState))
  }
  assert.ok(matrix.actions.length >= 25, 'The frozen matrix must cover the complete cross-role baseline')
})

test('locks client-safe projection and privacy invariants', () => {
  const clientActions = matrix.actions.filter((action) => action.defaultVisibility === 'client_visible')
  assert.ok(clientActions.length > 0)
  for (const action of clientActions) {
    assert.ok(action.audiences.includes('buyer') || action.audiences.includes('seller'))
    assert.equal(action.clientSafeProjectionRequired, true, `${action.actionKey} must require a client-safe projection`)
  }

  assert.ok(matrix.invariants.some((rule) => /Client-visible content requires audience-safe copy/i.test(rule)))
  assert.ok(matrix.invariants.some((rule) => /Internal content cannot be exposed/i.test(rule)))
  assert.ok(matrix.invariants.some((rule) => /Historical signed evidence/i.test(rule)))
})

test('retains current gaps as later-phase remediation inputs', () => {
  const disconnected = matrix.actions.filter((action) => action.currentState === 'disconnected')
  const partial = matrix.actions.filter((action) => action.currentState === 'partial')
  assert.ok(disconnected.some((action) => action.actionKey === 'ORIGINATOR_PROGRESS_UPDATED'))
  assert.ok(disconnected.some((action) => action.actionKey === 'SYSTEM_EVIDENCE_RECONCILED'))
  assert.ok(partial.length > 0)
  assert.ok(matrix.phase1EntryCriteria.some((criterion) => /currentState=disconnected/i.test(criterion)))
  assert.ok(matrix.phase1EntryCriteria.some((criterion) => /currentState=partial/i.test(criterion)))
})

test('keeps Phase 0 documentation-only and links the executable artifacts', async () => {
  const doc = await read('docs/transaction-sync-phase0-operating-contract.md')
  await access(new URL('docs/transaction-sync-phase0-action-matrix.json', root))
  assert.match(doc, /does not change runtime behaviour/i)
  assert.match(doc, /transaction-sync-phase0-action-matrix\.json/)
  assert.match(doc, /npm run test:transaction-sync-phase0/)
  assert.match(doc, /must not attempt to create or modify objects in Supabase's locked `realtime` schema/i)
})
