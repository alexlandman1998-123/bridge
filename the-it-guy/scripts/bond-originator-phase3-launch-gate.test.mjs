#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function assertIncludes(source, expected, message) {
  assert.equal(source.includes(expected), true, message)
}

const packageSource = read('package.json')
const phase3Script = read('scripts/bond-originator-phase3-launch-gate.mjs')
const phase3Audit = read('docs/audits/bond-originator-phase3-launch-gate.md')
const launchReadiness = read('docs/phase-8-launch-readiness.md')
const queueService = read('src/services/bondOperationalQueueService.js')
const diagnosticsService = read('src/services/bondOperationalDiagnosticsService.js')

assert.match(packageSource, /"test:bond-originator-phase3-launch-gate":\s*"node scripts\/bond-originator-phase3-launch-gate\.test\.mjs"/)
assert.match(packageSource, /"verify:bond-originator-phase3-launch-gate":\s*"node scripts\/bond-originator-phase3-launch-gate\.mjs"/)

for (const commandPath of [
  'scripts/bond-originator-stuck-file-sweep.test.mjs',
  'src/services/__tests__/bondOperationalQueueService.test.js',
  'src/services/__tests__/bondOperationalDiagnosticsService.test.js',
  'src/services/__tests__/bondCommandCenterService.test.js',
  'src/components/bond/__tests__/BondQueuePanel.test.jsx',
  'src/components/bond/__tests__/BondDashboard.test.jsx',
  'src/services/__tests__/bondApplicationClassification.test.js',
]) {
  assertIncludes(phase3Script, commandPath, `Phase 3 gate should run ${commandPath}.`)
}

assertIncludes(phase3Script, "scripts/bond-originator-stuck-file-sweep.mjs', '--live', '--confirm-staging", 'Phase 3 gate should support strict read-only staging sweep.')
assertIncludes(phase3Script, 'READY_LOCAL_GATE', 'Phase 3 gate should have a local-ready status.')
assertIncludes(phase3Script, 'READY_STAGING_GATE', 'Phase 3 gate should have a staging-ready status.')

for (const token of [
  'BOND_OPERATIONAL_QUEUE_KEYS',
  'getBondOperationalQueueContract',
  'isBondOperationallyVisibleRow',
  'AWAITING_BANK_FEEDBACK',
  'ADDITIONAL_DOCUMENTS_REQUIRED',
  'AWAITING_BUYER_REUPLOAD',
  'AWAITING_GRANT_DOCUMENT',
  'AWAITING_SIGNED_GRANT',
  'INSTRUCTION_SENT_AWAITING_ATTORNEY_ACCEPTANCE',
  'ACTIVE_REVIEW_REQUIRED',
]) {
  assertIncludes(queueService, token, `Queue service should preserve ${token}.`)
}

for (const token of [
  'operationalQueueKey',
  'operationalWaitState',
  'operationalQueueReason',
  'buildActionQueues',
  'view=awaiting-bank-feedback',
  'view=additional-documents',
  'view=buyer-reupload',
  'view=awaiting-grant',
  'view=awaiting-signed-grant',
  'view=attorney-acceptance',
  'view=review-required',
]) {
  assertIncludes(diagnosticsService, token, `Diagnostics service should preserve ${token}.`)
}

assert.match(phase3Audit, /# Bond Originator Phase 3 Launch Gate/)
assert.match(phase3Audit, /Phase 0 stuck-file sweep/)
assert.match(phase3Audit, /Phase 1 operational queue contract/)
assert.match(phase3Audit, /Phase 2 diagnostics and dashboard surfacing/)
assert.match(phase3Audit, /npm run verify:bond-originator-phase3-launch-gate/)
assert.match(phase3Audit, /--require-staging-sweep/)
assert.match(phase3Audit, /Decision: GO TO STAGING SWEEP BEFORE RELEASE/)

assert.match(launchReadiness, /Bond originator Phase 3 launch gate: `docs\/audits\/bond-originator-phase3-launch-gate\.md`/)
assert.match(launchReadiness, /Bond originator Phase 4 staging sweep: `docs\/audits\/bond-originator-phase4-staging-sweep\.md`/)
assert.match(launchReadiness, /npm run verify:bond-originator-phase3-launch-gate/)
assert.match(launchReadiness, /node scripts\/bond-originator-phase4-staging-sweep\.mjs --live --confirm-staging --require-live/)

const staticGate = spawnSync(
  process.execPath,
  ['scripts/bond-originator-phase3-launch-gate.mjs', '--static-only'],
  { cwd: projectRoot, encoding: 'utf8' },
)

assert.equal(staticGate.status, 0, staticGate.stderr || staticGate.stdout)
const staticReport = JSON.parse(staticGate.stdout)
assert.equal(staticReport.summary.status, 'READY_STATIC_ONLY')
assert.equal(staticReport.summary.staticBlockedCount, 0)
assert.equal(staticReport.commands.every((command) => command.status === 'SKIPPED'), true)
assert.equal(staticReport.stagingEvidence[0]?.status, 'PENDING')

console.log('bond originator Phase 3 launch gate tests passed')
