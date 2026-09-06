import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildAttorneyPracticalWalkthroughMatrix } from '../src/services/attorneyPracticalUatPhase1.js'
import { ATTORNEY_PRACTICAL_PHASE3_VERSION, buildAttorneyPracticalPhase3Decision } from '../src/services/attorneyPracticalUiPhase3.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url))
const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex')
const matrix = buildAttorneyPracticalWalkthroughMatrix(contract)
const phase1Evidence = { contractFingerprint, walkthroughs: [] }
const phase1EvidenceFingerprint = 'phase1-hash'
const phase2EvidenceFingerprint = 'phase2-hash'
const predecessors = { phase1Report: { status: 'PASSED', evidenceFingerprint: phase1EvidenceFingerprint }, phase1Evidence, phase1EvidenceFingerprint, phase2Report: { status: 'PASSED', evidenceFingerprint: phase2EvidenceFingerprint }, phase2EvidenceFingerprint }
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint, ...predecessors }).status, 'READY_TO_RUN')
const evidence = {
  version: ATTORNEY_PRACTICAL_PHASE3_VERSION, environment: 'staging', contractFingerprint, phase1EvidenceFingerprint, phase2EvidenceFingerprint,
  executedBy: 'UX reviewer', startedAt: '2026-09-06T13:00:00.000Z', completedAt: '2026-09-06T14:00:00.000Z', defects: [],
  audits: matrix.map((item) => ({
    walkthroughId: item.id, route: '/attorney/matters/example', screenshotPath: `output/attorney-release/evidence/${item.id}-ui.png`,
    viewportWidth: item.viewport === 'mobile' ? 390 : 1440, viewportHeight: item.viewport === 'mobile' ? 844 : 900,
    horizontalOverflowPx: 0, unnamedInteractiveControls: 0, criticalA11yViolations: 0, seriousA11yViolations: 0,
    keyboardNavigationPassed: true, visibleFocusPassed: true, modalFocusAndEscapePassed: true, loadingFeedbackPassed: true,
    successFeedbackPassed: true, errorRecoveryPassed: true, minimumTouchTargetPx: item.viewport === 'mobile' ? 44 : 32,
    visualReview: { hierarchyPassed: true, spacingPassed: true, readabilityPassed: true, consistencyPassed: true },
    touchpoints: item.requiredActions.map((key) => ({ key, discoverable: true, operable: true, feedbackPassed: true })),
  })),
}
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint, ...predecessors, evidence, evidenceFingerprint: 'phase3-hash' }).status, 'PASSED')
const inaccessible = structuredClone(evidence); inaccessible.audits[0].unnamedInteractiveControls = 1
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint, ...predecessors, evidence: inaccessible }).status, 'FAILED')
const clipped = structuredClone(evidence); clipped.audits.find(({ walkthroughId }) => walkthroughId.endsWith(':mobile')).minimumTouchTargetPx = 36
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint, ...predecessors, evidence: clipped }).status, 'FAILED')
const unresolved = structuredClone(evidence); unresolved.defects = [{ id: 'UI-2', severity: 'P2', status: 'open' }]
assert.equal(buildAttorneyPracticalPhase3Decision({ contract, contractFingerprint, ...predecessors, evidence: unresolved }).status, 'FAILED')
console.log('Attorney practical UI quality Phase 3 gate passed.')
