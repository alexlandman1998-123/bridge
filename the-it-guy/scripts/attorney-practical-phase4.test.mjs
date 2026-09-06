import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildAttorneyPracticalWalkthroughMatrix } from '../src/services/attorneyPracticalUatPhase1.js'
import { ATTORNEY_PRACTICAL_PHASE4_VERSION, buildAttorneyPracticalPhase4Decision, collectAttorneyPracticalDefects } from '../src/services/attorneyPracticalRemediationPhase4.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url)); const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const phaseEvidence = [
  { contractFingerprint, defects: [{ id: 'WF-1', severity: 'P1', status: 'closed' }] },
  { contractFingerprint, defects: [{ id: 'SYNC-2', severity: 'P2', status: 'open', disposition: 'fix' }] },
  { contractFingerprint, defects: [{ id: 'UI-3', severity: 'P3', status: 'open' }, { id: 'WF-1', severity: 'P1', status: 'closed' }] },
]
const predecessors = phaseEvidence.map((evidence, index) => ({ phase: index + 1, evidence, fingerprint: `phase${index + 1}-hash`, report: { status: 'PASSED', evidenceFingerprint: `phase${index + 1}-hash` } }))
assert.equal(collectAttorneyPracticalDefects(...phaseEvidence).length, 3)
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint, predecessors }).status, 'READY_TO_RUN')
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint, predecessors: [{ phase: 1, report: { status: 'BLOCKED' } }] }).status, 'BLOCKED')
const evidence = {
  version: ATTORNEY_PRACTICAL_PHASE4_VERSION, environment: 'staging', contractFingerprint, executedBy: 'Release engineer', startedAt: '2026-09-06T14:00:00.000Z', completedAt: '2026-09-06T15:00:00.000Z', codeRevision: 'abc123', deploymentReference: 'staging-deploy-1',
  phase1EvidenceFingerprint: 'phase1-hash', phase2EvidenceFingerprint: 'phase2-hash', phase3EvidenceFingerprint: 'phase3-hash', newP0Count: 0, newP1Count: 0, reopenedDefectCount: 0,
  remediations: [
    { defectId: 'WF-1', owner: 'Engineering', disposition: 'fixed', status: 'closed', retestPassed: true, fixReference: 'commit-1', evidencePath: 'output/WF-1.json' },
    { defectId: 'SYNC-2', owner: 'Engineering', disposition: 'accepted for release', status: 'accepted', retestPassed: true, evidencePath: 'output/SYNC-2.json' },
    { defectId: 'UI-3', owner: 'Design', disposition: 'backlog', status: 'backlog', retestPassed: false, evidencePath: 'output/UI-3.json' },
  ],
  regressionSuites: ['phase1_workflow', 'phase2_propagation', 'phase3_ui', 'attorney_regression'].map((key) => ({ key, passed: true, executedAt: '2026-09-06T14:30:00.000Z', outputPath: `output/${key}.txt` })),
  matrixRetests: buildAttorneyPracticalWalkthroughMatrix(contract).map(({ id }) => ({ walkthroughId: id, passed: true, evidencePath: `output/${id}.json` })),
}
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint, predecessors, evidence, evidenceFingerprint: 'phase4-hash' }).status, 'PASSED')
const unverified = structuredClone(evidence); unverified.remediations[0].retestPassed = false
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint, predecessors, evidence: unverified }).status, 'FAILED')
const regression = structuredClone(evidence); regression.regressionSuites[0].passed = false
assert.equal(buildAttorneyPracticalPhase4Decision({ contract, contractFingerprint, predecessors, evidence: regression }).status, 'FAILED')
console.log('Attorney practical remediation and regression Phase 4 gate passed.')
