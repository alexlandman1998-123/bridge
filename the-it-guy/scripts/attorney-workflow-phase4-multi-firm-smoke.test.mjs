#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ATTORNEY_WORKFLOW_PHASE4_ENV_KEYS,
  attorneyPhase4LaneExpectations,
  runAttorneyWorkflowPhase4MultiFirmSmoke,
} from './attorney-workflow-phase4-multi-firm-smoke.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const scriptSource = read('scripts/attorney-workflow-phase4-multi-firm-smoke.mjs')
const packageSource = read('package.json')
const envExampleSource = read('.env.example')
const phase0AuditSource = read('docs/audits/attorney-workflow-contract-phase0.md')
const phase3AuditSource = read('docs/audits/attorney-workflow-phase3-launch-gate.md')
const phase4AuditSource = read('docs/audits/attorney-workflow-phase4-multi-firm-smoke.md')
const launchReadinessSource = read('docs/phase-8-launch-readiness.md')

assert.deepEqual(
  attorneyPhase4LaneExpectations.map((item) => item.laneKey),
  ['transfer', 'bond', 'cancellation'],
  'Phase 4 must prove transfer, bond, and cancellation lanes.',
)
assert.deepEqual(
  attorneyPhase4LaneExpectations.map((item) => item.attorneyRole),
  ['transfer_attorney', 'bond_attorney', 'cancellation_attorney'],
  'Phase 4 must prove all attorney roles.',
)

for (const expected of [
  'scripts/attorney-workflow-phase3-launch-gate.mjs',
  'transaction_attorney_assignments',
  'transaction_subprocesses',
  'signInWithPassword',
  'at least two distinct attorney firms',
  'unrelated user must not see the transaction',
  '--live',
  '--confirm-staging',
  '--require-live',
]) {
  assert.equal(scriptSource.includes(expected), true, `Phase 4 script should include ${expected}`)
}

for (const key of ATTORNEY_WORKFLOW_PHASE4_ENV_KEYS) {
  assert.match(envExampleSource, new RegExp(`^${key}=`, 'm'), `.env.example should declare ${key}`)
}

assert.match(packageSource, /"test:attorney-workflow-phase4-multi-firm-smoke":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.test\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase4-multi-firm-smoke":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.mjs"/)
assert.match(packageSource, /"verify:attorney-workflow-phase4-live":\s*"node scripts\/attorney-workflow-phase4-multi-firm-smoke\.mjs --live --confirm-staging --require-live"/)

assert.match(phase0AuditSource, /Attorney workflow Phase 4 multi-firm smoke/)
assert.match(phase0AuditSource, /\| B-ATTY-0-4 \| Pending Live Evidence \| QA \/ Release \| Strict live multi-firm transfer\/bond\/cancellation smoke harness is implemented; staging evidence still required\. \| Phase 4 \|/)
assert.match(phase3AuditSource, /Phase 4 multi-firm smoke harness is implemented/)
assert.match(phase4AuditSource, /# Attorney Workflow Phase 4 Multi-Firm Smoke/)
assert.match(phase4AuditSource, /Decision: PHASE 4 HARNESS IMPLEMENTED; STRICT LIVE MULTI-FIRM EVIDENCE REQUIRED/)
assert.match(launchReadinessSource, /Attorney workflow Phase 4 multi-firm smoke: `docs\/audits\/attorney-workflow-phase4-multi-firm-smoke\.md`/)
assert.match(launchReadinessSource, /npm run verify:attorney-workflow-phase4-live/)

const staticOnlyReport = await runAttorneyWorkflowPhase4MultiFirmSmoke({
  staticOnly: true,
  skipPrerequisites: true,
  live: false,
  confirmStaging: false,
  requireLive: false,
})
assert.equal(staticOnlyReport.summary.staticBlockedCount, 0, 'Phase 4 static contract should pass.')
assert.equal(staticOnlyReport.summary.status, 'READY_LOCAL_CONTRACT', 'Static-only Phase 4 should be a local contract, not live sign-off.')

console.log('attorney workflow Phase 4 multi-firm smoke tests passed')
