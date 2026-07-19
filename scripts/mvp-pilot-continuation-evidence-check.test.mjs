import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-7d-'))
const closeoutPath = path.join(directory, 'closeout.json')
const sessionPath = path.join(directory, 'session.json')
const closeout = {
  environment: 'production', sessionId: 'pilot-session-001', batchNumber: 1, closedAt: '2026-07-19T08:00:00.000Z',
  closeoutDecision: 'allow_next_session_check', incidentCount: 0, stopConditionsTriggered: false,
}
const session = { environment: 'production', sessionId: 'pilot-session-002', batchNumber: 2, plannedAt: '2026-07-19T09:00:00.000Z' }
try {
  writeFileSync(closeoutPath, JSON.stringify(closeout))
  writeFileSync(sessionPath, JSON.stringify(session))
  const valid = spawnSync(process.execPath, ['scripts/mvp-pilot-continuation-evidence-check.mjs', `--prior-closeout-evidence=${closeoutPath}`, `--next-session-evidence=${sessionPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).nextBatchNumber, 2)
  writeFileSync(closeoutPath, JSON.stringify({ ...closeout, incidentCount: 1 }))
  const incident = spawnSync(process.execPath, ['scripts/mvp-pilot-continuation-evidence-check.mjs', `--prior-closeout-evidence=${closeoutPath}`, `--next-session-evidence=${sessionPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(incident.status, 1, 'An incident in the prior batch must prevent continuation.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP pilot continuation-evidence checks passed.')
