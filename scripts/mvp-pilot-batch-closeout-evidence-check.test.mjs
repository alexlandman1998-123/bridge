import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-7c-'))
const evidencePath = path.join(directory, 'closeout.json')
const auditPath = path.join(directory, 'audit.json')
const sessionPath = path.join(directory, 'session.json')
const supportPath = path.join(directory, 'support.json')
const session = { sessionId: 'pilot-session-001', batchNumber: 1, pilotOwner: 'operations.owner@arch9.test', plannedTransactionReferences: ['lead-001', 'lead-002'] }
const support = { supportOwner: 'support.owner@arch9.test' }
const closeout = {
  environment: 'production', sessionId: session.sessionId, batchNumber: session.batchNumber, closedBy: session.pilotOwner, closedAt: '2026-07-19T08:00:00.000Z',
  supportAcknowledgedBy: support.supportOwner, supportAcknowledgedAt: '2026-07-19T08:05:00.000Z', incidentCount: 0, stopConditionsTriggered: false,
  closeoutDecision: 'allow_next_session_check', productionCredentialsUsed: false,
}
try {
  writeFileSync(sessionPath, JSON.stringify(session))
  writeFileSync(supportPath, JSON.stringify(support))
  writeFileSync(auditPath, JSON.stringify({ passed: true, issues: [], sessionId: session.sessionId, batchNumber: session.batchNumber, batchSize: 2 }))
  writeFileSync(evidencePath, JSON.stringify(closeout))
  const valid = spawnSync(process.execPath, ['scripts/mvp-pilot-batch-closeout-evidence-check.mjs', `--evidence=${evidencePath}`, `--batch-audit=${auditPath}`, `--session-evidence=${sessionPath}`, `--support-evidence=${supportPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).decision, 'ready_for_next_session_check')
  writeFileSync(evidencePath, JSON.stringify({ ...closeout, incidentCount: 1 }))
  const incident = spawnSync(process.execPath, ['scripts/mvp-pilot-batch-closeout-evidence-check.mjs', `--evidence=${evidencePath}`, `--batch-audit=${auditPath}`, `--session-evidence=${sessionPath}`, `--support-evidence=${supportPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(incident.status, 1, 'A batch with an incident must not unlock another session.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP pilot batch-closeout checks passed.')
