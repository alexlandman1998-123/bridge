import { spawnSync } from 'node:child_process'
import { buildLegalDocumentRemediationExecutionGate } from '../src/core/documents/legalDocumentRemediationExecutionGate.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-l2-remediation-plan.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 700_000, maxBuffer: 30 * 1024 * 1024,
})

let l2
try {
  l2 = JSON.parse(run.stdout)
} catch {
  l2 = {
    status: 'UNAVAILABLE', planComplete: false, launchReady: false, actions: [],
    unassignedBlockers: [{ code: 'L3_L2_PLAN_UNAVAILABLE', detail: run.stderr || null }],
  }
}

const gate = buildLegalDocumentRemediationExecutionGate(l2)
console.log(JSON.stringify({
  phase: 'L3', ...gate,
  evidence: {
    l2Status: l2.status || 'UNAVAILABLE',
    l2CheckedAt: l2.checkedAt || null,
    l2MutatedData: l2.mutatedData,
    l1Status: l2.evidence?.l1Status || 'UNAVAILABLE',
    l1CheckedAt: l2.evidence?.l1CheckedAt || null,
    l1MutatedData: l2.evidence?.l1MutatedData,
    coverage: l2.evidence?.coverage || { otp: false, mandate: false },
    activationProjectRef: l2.evidence?.activationProjectRef || null,
    sourceBlockerCount: Number(l2.blockerCount || 0),
    plannedActionCount: Array.isArray(l2.actions) ? l2.actions.length : 0,
    unassignedBlockerCount: Array.isArray(l2.unassignedBlockers) ? l2.unassignedBlockers.length : 0,
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (gate.status === 'EXECUTION_BLOCKED') process.exitCode = 1
