import { buildAttorneyPracticalWalkthroughMatrix } from './attorneyPracticalUatPhase1.js'

export const ATTORNEY_PRACTICAL_PHASE3_VERSION = 'attorney-practical-ui-quality-phase3-v1'

const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

function predecessorBlockers({ contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint, phase2Report, phase2EvidenceFingerprint }) {
  const blockers = []
  if (phase1Report?.status !== 'PASSED') blockers.push(issue('PHASE1_NOT_PASSED', 'Pass all authenticated role and viewport walkthroughs before UI certification.'))
  if (phase1Evidence?.contractFingerprint !== contractFingerprint || phase1Report?.evidenceFingerprint !== phase1EvidenceFingerprint) blockers.push(issue('PHASE1_EVIDENCE_MISMATCH', 'Use the exact passed Phase 1 evidence for UI certification.'))
  if (phase2Report?.status !== 'PASSED') blockers.push(issue('PHASE2_NOT_PASSED', 'Pass cross-module propagation proof before UI certification.'))
  if (!text(phase2EvidenceFingerprint) || phase2Report?.evidenceFingerprint !== phase2EvidenceFingerprint) blockers.push(issue('PHASE2_EVIDENCE_MISMATCH', 'Use the exact passed Phase 2 evidence for UI certification.'))
  return blockers
}

export function buildAttorneyPracticalPhase3Decision({
  contract = {},
  contractFingerprint = '',
  phase1Report = null,
  phase1Evidence = null,
  phase1EvidenceFingerprint = '',
  phase2Report = null,
  phase2EvidenceFingerprint = '',
  evidence = null,
  evidenceFingerprint = null,
} = {}) {
  const matrix = buildAttorneyPracticalWalkthroughMatrix(contract)
  const blockers = predecessorBlockers({ contractFingerprint, phase1Report, phase1Evidence, phase1EvidenceFingerprint, phase2Report, phase2EvidenceFingerprint })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE3_VERSION, status: 'BLOCKED', executionAuthorized: false, matrix, blockerCount: blockers.length, blockers, evidenceFingerprint: null }
  if (!evidence) return { version: ATTORNEY_PRACTICAL_PHASE3_VERSION, status: 'READY_TO_RUN', executionAuthorized: true, matrix, blockerCount: 0, blockers: [], evidenceFingerprint: null }

  const defects = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE3_VERSION) defects.push(issue('EVIDENCE_VERSION_INVALID', 'Use the current Phase 3 evidence format.'))
  if (evidence.environment !== 'staging') defects.push(issue('NON_STAGING_EVIDENCE', 'Capture UI evidence only in staging.'))
  if (evidence.contractFingerprint !== contractFingerprint) defects.push(issue('EVIDENCE_CONTRACT_STALE', 'Repeat UI review against the current release bar.'))
  if (evidence.phase1EvidenceFingerprint !== phase1EvidenceFingerprint || evidence.phase2EvidenceFingerprint !== phase2EvidenceFingerprint) defects.push(issue('PREDECESSOR_EVIDENCE_STALE', 'Bind UI evidence to the exact passed workflow and propagation runs.'))
  if (!text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.executedBy)) defects.push(issue('RUN_METADATA_INCOMPLETE', 'Record the reviewer and run timestamps.'))

  const audits = Array.isArray(evidence.audits) ? evidence.audits : []
  const ids = audits.map(({ walkthroughId }) => walkthroughId)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicateIds.length) defects.push(issue('DUPLICATE_UI_AUDIT', 'Keep one UI audit per role and viewport.', { walkthroughIds: [...new Set(duplicateIds)] }))
  for (const expected of matrix) {
    const audit = audits.find(({ walkthroughId }) => walkthroughId === expected.id)
    if (!audit) {
      defects.push(issue('UI_AUDIT_MISSING', 'Complete the UI audit for this authenticated journey.', { walkthroughId: expected.id }))
      continue
    }
    if (!text(audit.route) || !text(audit.screenshotPath)) defects.push(issue('VISUAL_EVIDENCE_MISSING', 'Record the tested route and full-page screenshot.', { walkthroughId: expected.id }))
    if (!Number.isInteger(audit.viewportWidth) || !Number.isInteger(audit.viewportHeight) || audit.viewportWidth <= 0 || audit.viewportHeight <= 0) defects.push(issue('VIEWPORT_NOT_RECORDED', 'Record the exact browser viewport dimensions.', { walkthroughId: expected.id }))
    if (expected.viewport === 'mobile' && audit.viewportWidth > 480) defects.push(issue('MOBILE_VIEWPORT_INVALID', 'Use a mobile viewport no wider than 480px.', { walkthroughId: expected.id }))
    if (expected.viewport === 'desktop' && audit.viewportWidth < 1024) defects.push(issue('DESKTOP_VIEWPORT_INVALID', 'Use a desktop viewport at least 1024px wide.', { walkthroughId: expected.id }))
    if (Number(audit.horizontalOverflowPx) > 1 || Number(audit.horizontalOverflowPx) < 0) defects.push(issue('HORIZONTAL_OVERFLOW', 'Remove unintended horizontal scrolling.', { walkthroughId: expected.id }))
    if (Number(audit.unnamedInteractiveControls) !== 0) defects.push(issue('UNNAMED_CONTROLS', 'Give every interactive control an accessible name.', { walkthroughId: expected.id }))
    if (Number(audit.criticalA11yViolations) !== 0 || Number(audit.seriousA11yViolations) !== 0) defects.push(issue('ACCESSIBILITY_VIOLATIONS', 'Resolve all critical and serious automated accessibility violations.', { walkthroughId: expected.id }))
    if (audit.keyboardNavigationPassed !== true || audit.visibleFocusPassed !== true) defects.push(issue('KEYBOARD_OR_FOCUS_FAILURE', 'Make the journey operable by keyboard with visible focus.', { walkthroughId: expected.id }))
    if (audit.modalFocusAndEscapePassed !== true) defects.push(issue('MODAL_ACCESSIBILITY_FAILURE', 'Trap and restore focus and support Escape in dialogs.', { walkthroughId: expected.id }))
    if (audit.loadingFeedbackPassed !== true || audit.successFeedbackPassed !== true || audit.errorRecoveryPassed !== true) defects.push(issue('STATE_FEEDBACK_FAILURE', 'Provide usable loading, success, failure, and retry behavior.', { walkthroughId: expected.id }))
    if (audit.visualReview?.hierarchyPassed !== true || audit.visualReview?.spacingPassed !== true || audit.visualReview?.readabilityPassed !== true || audit.visualReview?.consistencyPassed !== true) defects.push(issue('VISUAL_QUALITY_FAILURE', 'Resolve hierarchy, spacing, readability, and consistency issues.', { walkthroughId: expected.id }))
    if (expected.viewport === 'mobile' && Number(audit.minimumTouchTargetPx) < 44) defects.push(issue('TOUCH_TARGET_FAILURE', 'Keep mobile interactive targets at least 44px.', { walkthroughId: expected.id }))
    for (const action of expected.requiredActions) {
      const touchpoint = (audit.touchpoints || []).find(({ key }) => key === action)
      if (!touchpoint || touchpoint.discoverable !== true || touchpoint.operable !== true || touchpoint.feedbackPassed !== true) defects.push(issue('ACTION_TOUCHPOINT_FAILED', 'Prove the action is discoverable, operable, and gives clear feedback.', { walkthroughId: expected.id, action }))
    }
  }
  const unknownAudits = audits.filter(({ walkthroughId }) => !matrix.some(({ id }) => id === walkthroughId)).map(({ walkthroughId }) => walkthroughId)
  if (unknownAudits.length) defects.push(issue('UNKNOWN_UI_AUDIT', 'Remove audits outside the approved matrix.', { walkthroughIds: unknownAudits }))
  const openReleaseDefects = (evidence.defects || []).filter(({ status, severity }) => status === 'open' && ['P0', 'P1'].includes(severity))
  const unresolvedP2 = (evidence.defects || []).filter(({ status, severity, disposition }) => status === 'open' && severity === 'P2' && !text(disposition))
  if (openReleaseDefects.length) defects.push(issue('OPEN_P0_P1_DEFECTS', 'Close all P0/P1 UI defects.', { defectIds: openReleaseDefects.map(({ id }) => id) }))
  if (unresolvedP2.length) defects.push(issue('P2_DISPOSITION_MISSING', 'Record an agreed disposition for every open P2.', { defectIds: unresolvedP2.map(({ id }) => id) }))

  return { version: ATTORNEY_PRACTICAL_PHASE3_VERSION, status: defects.length ? 'FAILED' : 'PASSED', executionAuthorized: true, matrix, blockerCount: defects.length, blockers: defects, evidenceFingerprint }
}
