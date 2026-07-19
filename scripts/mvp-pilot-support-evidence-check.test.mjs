import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(path.join(os.tmpdir(), 'arch9-mvp-6c-'))
const decisionPath = path.join(directory, 'decision.json')
const supportPath = path.join(directory, 'support.json')
const decision = { pilotOwner: 'operations.owner@arch9.test', supportOwner: 'support.owner@arch9.test', rollbackOwner: 'engineering.owner@arch9.test' }
const support = {
  environment: 'production', preparedBy: 'support.owner@arch9.test', preparedAt: '2026-07-19T06:00:00.000Z',
  ...decision, supportChannel: 'pilot-support@arch9.test', incidentLogReference: 'operations/pilot-incidents', escalationRunbookReference: 'docs/mvp-pilot-escalation.md',
  stopAuthority: decision.pilotOwner, incidentRecordingEnabled: true, productionCredentialsUsed: false, responseTargetMinutes: 30,
}
try {
  writeFileSync(decisionPath, JSON.stringify(decision))
  writeFileSync(supportPath, JSON.stringify(support))
  const valid = spawnSync(process.execPath, ['scripts/mvp-pilot-support-evidence-check.mjs', `--evidence=${supportPath}`, `--decision-evidence=${decisionPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).passed, true)
  writeFileSync(supportPath, JSON.stringify({ ...support, stopAuthority: support.supportOwner }))
  const invalidStopAuthority = spawnSync(process.execPath, ['scripts/mvp-pilot-support-evidence-check.mjs', `--evidence=${supportPath}`, `--decision-evidence=${decisionPath}`], { cwd: repoRoot, encoding: 'utf8' })
  assert.equal(invalidStopAuthority.status, 1, 'Only the approved pilot or rollback owner may stop a pilot batch.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('MVP pilot support-evidence checks passed.')
