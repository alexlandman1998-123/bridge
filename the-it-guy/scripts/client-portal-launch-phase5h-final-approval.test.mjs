import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [packet, rollout, gateSource] = await Promise.all([
  readFile(new URL('config/client-portal-launch-phase5h-final-approval.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('config/client-portal-launch-phase5-rollout.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('scripts/client-portal-launch-phase5h-final-approval.mjs', root), 'utf8')
])

test('final approval binds an immutable source and explicit production rollback target', () => {
  assert.match(packet.candidate.applicationCommit, /^[a-f0-9]{40}$/)
  assert.match(packet.candidate.sourceDeploymentId, /^dpl_/)
  assert.match(packet.production.currentDeploymentId, /^dpl_/)
  assert.match(packet.production.primaryUrl, /^https:\/\//)
  assert.match(packet.production.promotionCommand, /vercel promote dpl_/)
  assert.match(packet.production.rollbackCommand, /vercel rollback dpl_/)
})

test('all Phase 5C through 5G gates are prerequisites', () => {
  assert.deepEqual(Object.keys(packet.prerequisiteGates), [
    'physicalDevices', 'capabilityParity', 'accessibility', 'performance', 'operations'
  ])
})

test('final gate cannot execute or silently enable production promotion', () => {
  assert.doesNotMatch(gateSource, /execSync\([^)]*vercel promote/)
  assert.doesNotMatch(gateSource, /spawnSync\([^)]*vercel promote/)
  assert.equal(packet.promotion.status, 'disabled')
  assert.equal(packet.promotion.maximumPilotAgencies, rollout.maximumPilotAgencies)
  assert.equal(packet.promotion.automaticExpansion, false)
})

test('pending prerequisites, defects and approvals return HOLD', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5h-final-approval.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.blockers.some((item) => item.startsWith('prerequisite:physicalDevices:')))
  assert.ok(report.blockers.includes('defects:openCritical'))
  assert.ok(report.blockers.includes('approval:productOwner:status'))
})

test('enforced final approval rejects an incomplete release', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5h-final-approval.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
