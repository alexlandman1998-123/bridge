import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PHASE1_VERSION, buildAttorneyPracticalPhase1Decision, buildAttorneyPracticalWalkthroughMatrix } from '../src/services/attorneyPracticalUatPhase1.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url))
const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const approval = { contractFingerprint, confirmation: 'ACCEPT_ATTORNEY_RELEASE_BAR' }
const phase0Report = { status: 'ACCEPTED', contractFingerprint }
const matrix = buildAttorneyPracticalWalkthroughMatrix(contract)
assert.equal(matrix.length, 6)
assert.equal(matrix.reduce((sum, item) => sum + item.requiredActions.length, 0), 30)
assert.equal(buildAttorneyPracticalPhase1Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase1Decision({ contract, contractFingerprint, phase0Report, phase0Approval: approval }).status, 'READY_TO_RUN')

const evidence = {
  version: ATTORNEY_PRACTICAL_PHASE1_VERSION,
  environment: 'staging',
  contractFingerprint,
  executedBy: 'UAT owner',
  startedAt: '2026-09-06T10:00:00.000Z',
  completedAt: '2026-09-06T12:00:00.000Z',
  walkthroughs: matrix.map((item) => ({
    id: item.id,
    matterId: `matter-${item.role}`,
    authenticated: true,
    assignedMatterOpened: true,
    consoleErrorCount: 0,
    errorOverlaySeen: false,
    responsiveUiPassed: true,
    screenshotOrTracePath: `output/attorney-release/evidence/${item.id}.png`,
    actions: item.requiredActions.map((key) => ({ key, passed: true, receiptId: `${item.id}:${key}`, completedAt: '2026-09-06T11:00:00.000Z' })),
  })),
  defects: [],
}
const passed = buildAttorneyPracticalPhase1Decision({ contract, contractFingerprint, phase0Report, phase0Approval: approval, evidence, evidenceFingerprint: 'evidence-sha256' })
assert.equal(passed.status, 'PASSED')
assert.equal(passed.evidenceFingerprint, 'evidence-sha256')
const broken = structuredClone(evidence)
broken.walkthroughs[0].actions[0].receiptId = ''
assert.equal(buildAttorneyPracticalPhase1Decision({ contract, contractFingerprint, phase0Report, phase0Approval: approval, evidence: broken }).status, 'FAILED')
const stale = buildAttorneyPracticalPhase1Decision({ contract, contractFingerprint, phase0Report, phase0Approval: { ...approval, contractFingerprint: 'stale' }, evidence })
assert.equal(stale.status, 'BLOCKED')
assert.equal(stale.executionAuthorized, false)
const checker = readFileSync(new URL('./check-attorney-practical-phase1.mjs', import.meta.url), 'utf8')
assert.match(checker, /productionMutated: false/)
assert.doesNotMatch(checker, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney practical browser UAT Phase 1 gate passed.')
