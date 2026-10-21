#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-push-lock-recovery.mjs')
const productionProjectRef = 'isdowlnollckzvltkasn'

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function run(cwd) {
  return spawnSync(process.execPath, [runner, '--local-only', '--json'], { cwd, encoding: 'utf8' })
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'supabase-recovery-lock-'))

try {
  mkdirSync(path.join(tempDir, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(path.join(tempDir, 'docs'), { recursive: true })

  const pendingRun = run(tempDir)
  assert.equal(pendingRun.status, 0, pendingRun.stderr)
  const pending = JSON.parse(pendingRun.stdout)
  assert.equal(pending.status, 'RECOVERY_LOCK_BLOCKED')
  assert.equal(pending.locked, false)
  assert.equal(pending.evidenceCreated, true)
  assert.ok(pending.blockers.includes('recovery_test_not_recorded'))

  const evidencePath = path.join(tempDir, 'docs', 'supabase-production-recovery-evidence.json')
  const packetPath = path.join(tempDir, 'docs', 'supabase-production-recovery-test-packet.md')
  const evidence = readJson(evidencePath)
  assert.equal(evidence.productionProjectRef, productionProjectRef)
  assert.equal(evidence.recoveryTested, false)
  assert.match(readFileSync(packetPath, 'utf8'), /Required Restore Test/)
  assert.match(readFileSync(packetPath, 'utf8'), /recovery_test_not_recorded/)

  writeFileSync(evidencePath, JSON.stringify({
    productionProjectRef,
    recoveryMethod: 'physical_backup',
    pitrEnabled: false,
    physicalBackupCount: 8,
    equivalentManagedBackupAccepted: false,
    recoveryTested: true,
    testedAt: '2026-07-25T00:00:00.000Z',
    testedBy: 'test operator',
    acceptedBy: 'release owner',
    restoreTarget: 'temporary restore project',
    evidenceUrlOrTicket: 'internal-ticket-123',
    notes: [],
  }, null, 2))

  const cloneOnlyRun = run(tempDir)
  const cloneOnly = JSON.parse(cloneOnlyRun.stdout)
  assert.equal(cloneOnly.locked, false)
  assert.ok(cloneOnly.blockers.includes('backup_restore_not_proven'))

  const proven = readJson(evidencePath)
  proven.backupRestoreTest = {
    method: 'physical_backup_restore',
    sourceProjectRef: productionProjectRef,
    sourceBackupId: 'synthetic-backup-123',
    targetProjectRef: 'isolated-restore-test',
    smokeChecksPassed: true,
  }
  writeFileSync(evidencePath, JSON.stringify(proven))
  const lockedRun = run(tempDir)
  assert.equal(lockedRun.status, 0, lockedRun.stderr)
  const locked = JSON.parse(lockedRun.stdout)
  assert.equal(locked.status, 'RECOVERY_LOCKED')
  assert.equal(locked.locked, true)
  assert.deepEqual(locked.blockers, [])
  assert.match(readFileSync(packetPath, 'utf8'), /RECOVERY_LOCKED/)
  assert.equal(locked.recoveryScope, 'database')
  assert.equal(locked.storageObjectsIncluded, false)

  for (const targetProjectRef of [productionProjectRef, 'vaszuxjeoajeuhlcnzzf', '']) {
    writeFileSync(evidencePath, JSON.stringify({ ...proven, backupRestoreTest: { ...proven.backupRestoreTest, targetProjectRef } }))
    assert.ok(JSON.parse(run(tempDir).stdout).blockers.includes('restore_target_not_isolated'))
  }
  for (const [change, blocker] of [
    [{ method: 'live_database_clone' }, 'backup_restore_not_proven'],
    [{ sourceProjectRef: 'different-source' }, 'restore_source_project_mismatch'],
    [{ sourceBackupId: '' }, 'restore_backup_reference_missing'],
    [{ smokeChecksPassed: false }, 'restored_backup_checks_pending'],
  ]) {
    writeFileSync(evidencePath, JSON.stringify({ ...proven, backupRestoreTest: { ...proven.backupRestoreTest, ...change } }))
    assert.ok(JSON.parse(run(tempDir).stdout).blockers.includes(blocker))
  }

  // Requested live verification must fail closed on unavailable provider data,
  // failed backups, and an accepted historical backup that no longer exists.
  writeFileSync(evidencePath, JSON.stringify({ ...proven, physicalBackupCount: 0, equivalentManagedBackupAccepted: true }))
  const fakeBin = path.join(tempDir, 'bin')
  mkdirSync(fakeBin)
  const runLive = () => spawnSync(process.execPath, [runner, '--verify-live', '--json'], {
    cwd: tempDir, encoding: 'utf8', env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
  })
  for (const [script, blocker] of [
    ['exit 1', 'live_recovery_check_failed'],
    ["printf '%s' '{\"pitr_enabled\":false,\"backups\":[{\"status\":\"FAILED\"}]}'", 'live_recovery_not_available'],
    ["printf '%s' '{\"pitr_enabled\":false,\"backups\":[]}'", 'live_recovery_not_available'],
  ]) {
    writeFileSync(path.join(fakeBin, 'npx'), `#!/bin/sh\n${script}\n`, { mode: 0o755 })
    const result = JSON.parse(runLive().stdout)
    assert.equal(result.locked, false)
    assert.ok(result.blockers.includes(blocker))
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase production recovery lock tests passed.')
