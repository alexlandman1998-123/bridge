import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTransactionSyncFleetRelease,
} from '../server/services/transactionSyncPhase8FleetReleaseService.js'
import {
  assertPhase8Target,
  parsePhase8Args,
} from './transaction-sync-phase8-fleet-release.mjs'

const migrationUrl = new URL('../../supabase/migrations/20260829112530_transaction_sync_phase8_fleet_release_gate.sql', import.meta.url)

function certification(transactionId, certified = true) {
  return {
    transactionId,
    certification: {
      certified,
      evidenceHash: certified ? `${transactionId === 'tx-1' ? 'a' : 'b'}`.repeat(64) : 'c'.repeat(64),
    },
  }
}

test('complete healthy fleet with recent canary is release-ready', () => {
  const release = buildTransactionSyncFleetRelease({
    environment: 'staging',
    projectRef: 'projectref01',
    fleet: { complete: true, snapshotAt: '2026-08-29T10:00:00.000Z', expectedRows: 2, transactions: [{ id: 'tx-1' }, { id: 'tx-2' }] },
    canaries: [{ id: 'canary-1' }],
    certifications: [certification('tx-1'), certification('tx-2')],
    failures: [],
  })
  assert.equal(release.status, 'passed')
  assert.equal(release.releaseReady, true)
  assert.equal(release.passedTransactionCount, 2)
  assert.equal(release.failedTransactionCount, 0)
  assert.match(release.evidenceHash, /^[a-f0-9]{64}$/)
})

test('fleet gate fails closed for truncation, missing canary, failed certification, or execution error', () => {
  const release = buildTransactionSyncFleetRelease({
    environment: 'staging',
    projectRef: 'projectref01',
    fleet: { complete: false, snapshotAt: '2026-08-29T10:00:00.000Z', expectedRows: 2, transactions: [{ id: 'tx-1' }, { id: 'tx-2' }] },
    canaries: [],
    certifications: [certification('tx-1', false)],
    failures: [{ transactionId: 'tx-2', message: 'query failed' }],
  })
  assert.equal(release.status, 'failed')
  assert.equal(release.failedTransactionCount, 2)
  assert.deepEqual(release.issueCodes, [
    'certification_execution_failed',
    'fleet_enumeration_truncated',
    'passing_canary_missing',
    'transaction_certification_failed',
  ])

  const incomplete = buildTransactionSyncFleetRelease({
    environment: 'staging',
    projectRef: 'projectref01',
    fleet: { complete: true, snapshotAt: '2026-08-29T10:00:00.000Z', expectedRows: 2, transactions: [{ id: 'tx-1' }, { id: 'tx-2' }] },
    canaries: [{ id: 'canary-1' }],
    certifications: [certification('tx-1')],
  })
  assert.equal(incomplete.releaseReady, false)
  assert.deepEqual(incomplete.issueCodes, ['transaction_certification_failed'])
})

test('fleet evidence hash is stable regardless of certification ordering', () => {
  const input = {
    environment: 'staging',
    projectRef: 'projectref01',
    fleet: { complete: true, snapshotAt: '2026-08-29T10:00:00.000Z', expectedRows: 2, transactions: [{ id: 'tx-1' }, { id: 'tx-2' }] },
    canaries: [{ id: 'canary-2' }, { id: 'canary-1' }],
    failures: [],
  }
  const left = buildTransactionSyncFleetRelease({ ...input, certifications: [certification('tx-1'), certification('tx-2')] })
  const right = buildTransactionSyncFleetRelease({ ...input, certifications: [certification('tx-2'), certification('tx-1')] })
  assert.equal(left.evidenceHash, right.evidenceHash)
})

test('fleet release receipt is immutable, RLS-protected, and internally scoped', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create table if not exists public\.transaction_sync_fleet_release_runs/i)
  assert.match(sql, /alter table public\.transaction_sync_fleet_release_runs enable row level security/i)
  assert.match(sql, /using \(public\.bridge_transaction_scope_is_internal_user\(\)\)/i)
  assert.match(sql, /grant select, insert on table public\.transaction_sync_fleet_release_runs to service_role/i)
  assert.match(sql, /passed_transaction_count \+ failed_transaction_count = active_transaction_count/i)
  assert.match(sql, /active_transaction_count <= enumerated_transaction_count/i)
  assert.match(sql, /fleet_snapshot_at timestamptz not null/i)
  assert.doesNotMatch(sql, /update public\.transaction_sync_fleet_release_runs|delete from public\.transaction_sync_fleet_release_runs/i)
})

test('recording a release requires explicit fleet, project, and production confirmations', () => {
  const plan = parsePhase8Args(['--environment=staging', '--page-size=25', '--canary-max-age-hours=48'])
  assert.equal(plan.pageSize, 25)
  assert.equal(plan.canaryMaxAgeHours, 48)
  assert.doesNotThrow(() => assertPhase8Target(plan, 'project-a'))

  const record = parsePhase8Args([
    '--record-release', '--environment=staging', '--confirm-fleet-release', '--confirm-project-ref=project-a',
  ])
  assert.doesNotThrow(() => assertPhase8Target(record, 'project-a'))
  assert.throws(() => assertPhase8Target({ ...record, confirmFleetRelease: false }, 'project-a'), /confirm-fleet-release/)
  assert.throws(() => assertPhase8Target(record, 'project-b'), /confirm-project-ref=project-b/)
  assert.throws(() => assertPhase8Target({ ...record, environment: 'production' }, 'project-a'), /confirm-production/)
})

test('runtime exhausts pagination, consumes Phase 7, and writes only on explicit recording', async () => {
  const source = await readFile(new URL('../server/services/transactionSyncPhase8FleetReleaseService.js', import.meta.url), 'utf8')
  assert.match(source, /while \(page < maxPages\)/)
  assert.match(source, /if \(pageRows\.length < pageSize\)/)
  assert.match(source, /snapshotAt/)
  assert.match(source, /count: 'exact'/)
  assert.match(source, /uniqueIds\.size === expectedRows/)
  assert.match(source, /runTransactionSyncPhase7CanaryCertification/)
  assert.match(source, /transaction_sync_certification_runs/)
  assert.match(source, /if \(options\.recordRelease === true\)/)
  assert.match(source, /transaction_sync_fleet_release_runs/)
})
