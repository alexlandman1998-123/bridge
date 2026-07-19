import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateMvpScaleProgression } from '../the-it-guy/src/core/transactions/mvpScaleProgression.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<production-rollout-evidence.json>.')
const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
const progression = evaluateMvpScaleProgression(input)

assert.equal(input.environment, 'production', 'Scale entry evidence must be marked production.')
assert.equal(progression.decision === 'pause_rollout', false, 'Scale entry cannot proceed while rollout controls are paused.')
assert.equal(Array.isArray(input.pilotCloseouts), true, 'Scale entry requires pilotCloseouts.')
assert.ok(input.pilotCloseouts.length >= 1, 'At least one clean pilot closeout is required before scaling.')
assert.equal(input.completedBatchAudits, input.pilotCloseouts.length, 'completedBatchAudits must match the recorded pilot closeouts.')
const sessionIds = new Set()
const batchNumbers = new Set()
for (const closeout of input.pilotCloseouts) {
  assert.ok(String(closeout.sessionId || '').trim(), 'Each pilot closeout requires sessionId.')
  assert.equal(Number.isInteger(closeout.batchNumber), true, 'Each pilot closeout requires an integer batchNumber.')
  assert.equal(sessionIds.has(closeout.sessionId), false, `Duplicate pilot closeout session: ${closeout.sessionId}`)
  assert.equal(batchNumbers.has(closeout.batchNumber), false, `Duplicate pilot closeout batch: ${closeout.batchNumber}`)
  sessionIds.add(closeout.sessionId)
  batchNumbers.add(closeout.batchNumber)
  assert.equal(closeout.auditPassed, true, `Pilot closeout ${closeout.sessionId} must have a passing audit.`)
  assert.equal(closeout.closeoutDecision, 'allow_next_session_check', `Pilot closeout ${closeout.sessionId} must permit continuation.`)
  assert.equal(closeout.incidentCount, 0, `Pilot closeout ${closeout.sessionId} must have no incidents.`)
  assert.equal(closeout.stopConditionsTriggered, false, `Pilot closeout ${closeout.sessionId} must have no stop condition.`)
}

const approval = input.scaleApproval || {}
for (const field of ['approvedBy', 'approvedAt', 'approvedByRole', 'decision']) {
  assert.ok(String(approval[field] || '').trim(), `scaleApproval requires ${field}.`)
}
assert.equal(['release', 'operations', 'executive'].includes(String(approval.approvedByRole).toLowerCase()), true, 'scaleApproval.approvedByRole must be release, operations, or executive.')
assert.equal(approval.fromCapacity, progression.currentCapacity, 'scaleApproval.fromCapacity must match current capacity.')
assert.equal(approval.toCapacity, progression.nextCapacity, 'scaleApproval.toCapacity must match the next allowed capacity.')
assert.equal(approval.productionCredentialsUsed, false, 'Scale approval evidence must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(approval.approvedAt)), false, 'scaleApproval.approvedAt must be an ISO-compatible timestamp.')
if (progression.decision === 'advance_rollout') assert.equal(approval.decision, 'approved_to_next_mvp_capacity', 'Scale approval must explicitly approve the next MVP capacity.')
if (progression.decision === 'maintain_mvp_capacity') assert.equal(approval.decision, 'approved_to_maintain_mvp_capacity', 'Capacity 100 requires an approval to maintain, not expand.')

console.log(JSON.stringify({
  version: 'arch9_mvp_scale_entry_evidence_v1',
  passed: true,
  decision: progression.decision,
  currentCapacity: progression.currentCapacity,
  nextCapacity: progression.nextCapacity,
  completedPilotCloseouts: input.pilotCloseouts.length,
  approvedBy: approval.approvedBy,
  safety: 'This validates MVP scale-entry evidence only; it does not change production capacity or create transactions.',
}, null, 2))
