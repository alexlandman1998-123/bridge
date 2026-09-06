import { buildAttorneyPracticalWalkthroughMatrix } from './attorneyPracticalUatPhase1.js'

export const ATTORNEY_PRACTICAL_PHASE4_VERSION = 'attorney-practical-remediation-regression-phase4-v1'

const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function collectAttorneyPracticalDefects(...evidenceSets) {
  const defects = evidenceSets.flatMap((evidence, phaseIndex) =>
    (evidence?.defects || []).map((defect) => ({ ...defect, sourcePhase: phaseIndex + 1 })),
  )
  return defects.filter((defect, index) => defects.findIndex(({ id }) => id === defect.id) === index)
}

function predecessorBlockers({ contractFingerprint, predecessors }) {
  const blockers = []
  for (const phase of [1, 2, 3]) {
    const item = predecessors.find((candidate) => candidate.phase === phase) || { phase }
    if (item.report?.status !== 'PASSED') blockers.push(issue(`PHASE${item.phase}_NOT_PASSED`, `Pass practical Phase ${item.phase} before final remediation regression.`, { phase: item.phase }))
    if (!item.evidence || item.evidence.contractFingerprint !== contractFingerprint || !text(item.fingerprint) || item.report?.evidenceFingerprint !== item.fingerprint) blockers.push(issue(`PHASE${item.phase}_EVIDENCE_MISMATCH`, `Use the exact passed Phase ${item.phase} evidence.`, { phase: item.phase }))
  }
  return blockers
}

export function buildAttorneyPracticalPhase4Decision({ contract = {}, contractFingerprint = '', predecessors = [], evidence = null, evidenceFingerprint = null } = {}) {
  const matrix = buildAttorneyPracticalWalkthroughMatrix(contract)
  const defects = collectAttorneyPracticalDefects(...predecessors.map(({ evidence: phaseEvidence }) => phaseEvidence))
  const blockers = predecessorBlockers({ contractFingerprint, predecessors })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE4_VERSION, status: 'BLOCKED', executionAuthorized: false, defectCount: defects.length, matrix, blockerCount: blockers.length, blockers, evidenceFingerprint: null }
  if (!evidence) return { version: ATTORNEY_PRACTICAL_PHASE4_VERSION, status: 'READY_TO_RUN', executionAuthorized: true, defectCount: defects.length, matrix, blockerCount: 0, blockers: [], evidenceFingerprint: null }

  const failures = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE4_VERSION) failures.push(issue('EVIDENCE_VERSION_INVALID', 'Use the current Phase 4 evidence format.'))
  if (evidence.environment !== 'staging') failures.push(issue('NON_STAGING_EVIDENCE', 'Run remediation regression only in staging.'))
  if (evidence.contractFingerprint !== contractFingerprint) failures.push(issue('EVIDENCE_CONTRACT_STALE', 'Repeat regression against the current release bar.'))
  if (!text(evidence.executedBy) || !text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.codeRevision) || !text(evidence.deploymentReference)) failures.push(issue('RUN_METADATA_INCOMPLETE', 'Record owner, timestamps, code revision, and staging deployment.'))
  for (const predecessor of predecessors) if (evidence[`phase${predecessor.phase}EvidenceFingerprint`] !== predecessor.fingerprint) failures.push(issue('PREDECESSOR_EVIDENCE_STALE', 'Bind the regression to every exact predecessor evidence file.', { phase: predecessor.phase }))

  const remediations = Array.isArray(evidence.remediations) ? evidence.remediations : []
  const remediationIds = remediations.map(({ defectId }) => defectId)
  const duplicates = remediationIds.filter((id, index) => remediationIds.indexOf(id) !== index)
  if (duplicates.length) failures.push(issue('DUPLICATE_REMEDIATION', 'Keep one remediation record per defect.', { defectIds: [...new Set(duplicates)] }))
  for (const defect of defects) {
    const remediation = remediations.find(({ defectId }) => defectId === defect.id)
    if (!remediation) {
      failures.push(issue('DEFECT_DISPOSITION_MISSING', 'Record the repair or accepted disposition for every discovered defect.', { defectId: defect.id, severity: defect.severity }))
      continue
    }
    if (!text(remediation.owner) || !text(remediation.disposition) || !text(remediation.evidencePath)) failures.push(issue('REMEDIATION_RECORD_INCOMPLETE', 'Record owner, disposition, and evidence.', { defectId: defect.id }))
    if (['P0', 'P1'].includes(defect.severity) && (remediation.status !== 'closed' || remediation.retestPassed !== true || !text(remediation.fixReference))) failures.push(issue('CRITICAL_REMEDIATION_UNVERIFIED', 'P0/P1 defects require a fix reference, closed state, and passed retest.', { defectId: defect.id }))
    if (defect.severity === 'P2' && !['closed', 'accepted'].includes(remediation.status)) failures.push(issue('P2_DISPOSITION_INVALID', 'Close the P2 or record an accepted release disposition.', { defectId: defect.id }))
    if (defect.severity === 'P3' && !['closed', 'accepted', 'backlog'].includes(remediation.status)) failures.push(issue('P3_DISPOSITION_INVALID', 'Close, accept, or backlog the P3.', { defectId: defect.id }))
  }
  const unknownRemediations = remediations.filter(({ defectId }) => !defects.some(({ id }) => id === defectId)).map(({ defectId }) => defectId)
  if (unknownRemediations.length) failures.push(issue('UNKNOWN_REMEDIATION', 'Remove remediation records with no predecessor defect.', { defectIds: unknownRemediations }))

  const requiredSuites = ['phase1_workflow', 'phase2_propagation', 'phase3_ui', 'attorney_regression']
  for (const suite of requiredSuites) {
    const result = (evidence.regressionSuites || []).find(({ key }) => key === suite)
    if (!result || result.passed !== true || !text(result.executedAt) || !text(result.outputPath)) failures.push(issue('REGRESSION_SUITE_FAILED', 'Run and retain every required regression suite.', { suite }))
  }
  for (const expected of matrix) {
    const retest = (evidence.matrixRetests || []).find(({ walkthroughId }) => walkthroughId === expected.id)
    if (!retest || retest.passed !== true || !text(retest.evidencePath)) failures.push(issue('MATRIX_RETEST_FAILED', 'Repeat and prove every role/device journey after remediation.', { walkthroughId: expected.id }))
  }
  if (evidence.newP0Count !== 0 || evidence.newP1Count !== 0 || evidence.reopenedDefectCount !== 0) failures.push(issue('REGRESSION_DEFECTS_DETECTED', 'Resolve all new or reopened P0/P1 defects.', { newP0Count: evidence.newP0Count, newP1Count: evidence.newP1Count, reopenedDefectCount: evidence.reopenedDefectCount }))

  return { version: ATTORNEY_PRACTICAL_PHASE4_VERSION, status: failures.length ? 'FAILED' : 'PASSED', executionAuthorized: true, defectCount: defects.length, matrix, blockerCount: failures.length, blockers: failures, evidenceFingerprint }
}
