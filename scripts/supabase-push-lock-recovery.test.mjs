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

  const lockedRun = run(tempDir)
  assert.equal(lockedRun.status, 0, lockedRun.stderr)
  const locked = JSON.parse(lockedRun.stdout)
  assert.equal(locked.status, 'RECOVERY_LOCKED')
  assert.equal(locked.locked, true)
  assert.deepEqual(locked.blockers, [])
  assert.match(readFileSync(packetPath, 'utf8'), /RECOVERY_LOCKED/)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Supabase production recovery lock tests passed.')
