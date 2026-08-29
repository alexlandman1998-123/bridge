import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTransactionSyncOperationalAssessment,
} from '../server/services/transactionSyncPhase5OperationalAssuranceService.js'
import {
  assertPhase5AuditTarget,
  parsePhase5Args,
} from './transaction-sync-phase5-operational-assurance.mjs'

const output = {
  transaction_event: 'event-1',
  lane_state: 'lane-1',
  transaction_rollup: 'tx-1',
  activity_projection: 'activity-1',
  refresh_signal: 4,
  audit_record: 'receipt-1',
}

function fixture(overrides = {}) {
  return {
    transaction: { id: 'tx-1' },
    actionCatalogCount: 29,
    rollup: { transaction_id: 'tx-1' },
    lanes: [{ id: 'lane-1' }],
    receipts: [{
      id: 'receipt-1',
      action_key: 'TRANSFER_ATTORNEY_STAGE_UPDATED',
      canonical_event_id: 'event-1',
      transaction_version: 4,
      status: 'projected',
      outputs_json: output,
      created_at: '2026-08-29T10:00:00.000Z',
      completed_at: '2026-08-29T10:00:00.500Z',
    }],
    activities: [{ id: 'activity-1', command_receipt_id: 'receipt-1' }],
    eventIds: ['event-1'],
    refreshSignal: { version: 4, command_receipt_id: 'receipt-1', changed_at: '2026-08-29T10:00:00.500Z' },
    projectionQueue: [{ id: 'queue-1', command_receipt_id: 'receipt-1', status: 'completed', attempt_count: 1 }],
    now: '2026-08-29T10:01:00.000Z',
    ...overrides,
  }
}

test('healthy transaction proves all six durable outputs and the current watermark', () => {
  const assessment = buildTransactionSyncOperationalAssessment(fixture())
  assert.equal(assessment.status, 'healthy')
  assert.equal(assessment.releaseReady, true)
  assert.equal(assessment.version, 4)
  assert.deepEqual(assessment.issues, [])
})

test('missing projections, events, output references, and stale watermarks fail closed', () => {
  const assessment = buildTransactionSyncOperationalAssessment(fixture({
    receipts: [{
      ...fixture().receipts[0],
      status: 'accepted',
      outputs_json: { transaction_event: 'event-1' },
    }],
    activities: [],
    eventIds: [],
    projectionQueue: [{ id: 'queue-1', command_receipt_id: 'receipt-1', status: 'failed', attempt_count: 3 }],
    refreshSignal: { version: 2, command_receipt_id: 'receipt-old' },
    now: '2026-08-29T10:05:00.000Z',
  }))
  assert.equal(assessment.status, 'critical')
  assert.equal(assessment.releaseReady, false)
  const codes = new Set(assessment.issues.map((issue) => issue.code))
  for (const code of [
    'receipt_stuck',
    'receipt_outputs_incomplete',
    'canonical_event_missing',
    'activity_projection_missing',
    'projection_failed',
    'refresh_version_behind',
    'refresh_receipt_mismatch',
  ]) assert.equal(codes.has(code), true, `expected ${code}`)
})

test('latency misses and an unexercised canonical path remain visible warnings', () => {
  const slow = buildTransactionSyncOperationalAssessment(fixture({
    receipts: [{ ...fixture().receipts[0], completed_at: '2026-08-29T10:00:03.000Z' }],
  }))
  assert.equal(slow.status, 'warning')
  assert.equal(slow.issues[0].code, 'propagation_latency_slo_missed')

  const unexercised = buildTransactionSyncOperationalAssessment(fixture({
    receipts: [], activities: [], eventIds: [], refreshSignal: null, projectionQueue: [],
  }))
  assert.equal(unexercised.status, 'warning')
  assert.equal(unexercised.issues[0].code, 'canonical_path_not_exercised')
})

test('fleet audit CLI requires an explicit environment and supports an exact project guard', () => {
  const options = parsePhase5Args([
    '--environment=staging',
    '--transaction-id=tx-1',
    '--limit=10',
    '--receipt-limit=500',
    '--require-project-ref=project-a',
  ])
  assert.equal(options.environment, 'staging')
  assert.equal(options.transactionId, 'tx-1')
  assert.equal(options.receiptLimit, 500)
  assert.doesNotThrow(() => assertPhase5AuditTarget(options, 'project-a'))
  assert.throws(() => assertPhase5AuditTarget(options, 'project-b'), /Project ref mismatch/)
  assert.throws(() => assertPhase5AuditTarget(parsePhase5Args([]), 'project-a'), /--environment/)
})

test('Phase 5 assurance is read-only and audits every canonical durability surface', async () => {
  const source = await readFile(new URL('../server/services/transactionSyncPhase5OperationalAssuranceService.js', import.meta.url), 'utf8')
  for (const table of [
    'transaction_sync_action_catalog',
    'transaction_sync_command_receipts',
    'transaction_events',
    'transaction_activity_projections',
    'transaction_refresh_signals',
    'transaction_sync_projection_queue',
    'transaction_rollups',
    'transaction_subprocesses',
  ]) assert.match(source, new RegExp(`from\\('${table}'\\)`))
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
})

