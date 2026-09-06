export const ATTORNEY_PRACTICAL_PHASE1_VERSION = 'attorney-practical-browser-uat-phase1-v1'

const text = (value) => String(value || '').trim()
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

export function buildAttorneyPracticalWalkthroughMatrix(contract = {}) {
  return Object.entries(contract.roles || {}).flatMap(([role, actions]) =>
    (contract.viewports || []).map((viewport) => ({
      id: `${role}:${viewport}`,
      role,
      viewport,
      requiredActions: [...actions],
    })),
  )
}

function validatePhase0({ phase0Report, phase0Approval, contractFingerprint }) {
  const blockers = []
  if (phase0Report?.status !== 'ACCEPTED') blockers.push(issue('PHASE0_NOT_ACCEPTED', 'Approve the practical Phase 0 release bar before using UAT credentials or changing staging data.'))
  if (!text(contractFingerprint) || phase0Report?.contractFingerprint !== contractFingerprint) blockers.push(issue('PHASE0_REPORT_STALE', 'Regenerate Phase 0 against the current release-bar contract.'))
  if (phase0Approval?.contractFingerprint !== contractFingerprint || phase0Approval?.confirmation !== 'ACCEPT_ATTORNEY_RELEASE_BAR') blockers.push(issue('PHASE0_APPROVAL_MISSING_OR_STALE', 'Provide the exact Phase 0 approval for the current contract fingerprint.'))
  return blockers
}

export function buildAttorneyPracticalPhase1Decision({ contract = {}, contractFingerprint = '', phase0Report = null, phase0Approval = null, evidence = null, evidenceFingerprint = null } = {}) {
  const matrix = buildAttorneyPracticalWalkthroughMatrix(contract)
  const blockers = validatePhase0({ phase0Report, phase0Approval, contractFingerprint })
  if (blockers.length) return {
    version: ATTORNEY_PRACTICAL_PHASE1_VERSION,
    status: 'BLOCKED',
    executionAuthorized: false,
    matrix,
    blockerCount: blockers.length,
    blockers,
    evidenceFingerprint: null,
  }

  if (!evidence) return {
    version: ATTORNEY_PRACTICAL_PHASE1_VERSION,
    status: 'READY_TO_RUN',
    executionAuthorized: true,
    matrix,
    blockerCount: 0,
    blockers: [],
    evidenceFingerprint: null,
  }

  const defects = []
  if (evidence.version !== ATTORNEY_PRACTICAL_PHASE1_VERSION) defects.push(issue('EVIDENCE_VERSION_INVALID', 'Use the current Phase 1 evidence format.'))
  if (evidence.environment !== 'staging') defects.push(issue('NON_STAGING_EVIDENCE', 'Capture Phase 1 evidence only in the approved staging environment.'))
  if (evidence.contractFingerprint !== contractFingerprint) defects.push(issue('EVIDENCE_CONTRACT_STALE', 'Repeat UAT against the current release-bar fingerprint.'))
  if (!text(evidence.startedAt) || !text(evidence.completedAt) || !text(evidence.executedBy)) defects.push(issue('RUN_METADATA_INCOMPLETE', 'Record the executor and run timestamps.'))

  const walkthroughs = Array.isArray(evidence.walkthroughs) ? evidence.walkthroughs : []
  const duplicates = walkthroughs.map(({ id }) => id).filter((id, index, values) => values.indexOf(id) !== index)
  if (duplicates.length) defects.push(issue('DUPLICATE_WALKTHROUGH', 'Keep exactly one evidence record per role and viewport.', { ids: [...new Set(duplicates)] }))

  for (const expected of matrix) {
    const actual = walkthroughs.find(({ id }) => id === expected.id)
    if (!actual) {
      defects.push(issue('WALKTHROUGH_MISSING', 'Complete the authenticated role and viewport walkthrough.', { walkthroughId: expected.id }))
      continue
    }
    if (actual.authenticated !== true) defects.push(issue('AUTHENTICATION_NOT_PROVEN', 'Prove login with the assigned staging actor.', { walkthroughId: expected.id }))
    if (actual.assignedMatterOpened !== true || !text(actual.matterId)) defects.push(issue('ASSIGNED_MATTER_NOT_PROVEN', 'Open and record an assigned staging matter.', { walkthroughId: expected.id }))
    if (actual.consoleErrorCount !== 0 || actual.errorOverlaySeen !== false) defects.push(issue('BROWSER_HEALTH_FAILURE', 'Resolve console errors and visible error overlays.', { walkthroughId: expected.id }))
    if (actual.responsiveUiPassed !== true) defects.push(issue('RESPONSIVE_UI_FAILURE', 'Pass the required viewport without clipped, hidden, or unusable controls.', { walkthroughId: expected.id }))
    if (!text(actual.screenshotOrTracePath)) defects.push(issue('VISUAL_EVIDENCE_MISSING', 'Attach a screenshot or browser trace.', { walkthroughId: expected.id }))
    for (const action of expected.requiredActions) {
      const actionEvidence = (actual.actions || []).find(({ key }) => key === action)
      if (!actionEvidence || actionEvidence.passed !== true || !text(actionEvidence.receiptId) || !text(actionEvidence.completedAt)) {
        defects.push(issue('ACTION_NOT_PROVEN', 'Complete the action and retain its durable receipt.', { walkthroughId: expected.id, action }))
      }
    }
  }

  const openReleaseDefects = (evidence.defects || []).filter(({ status, severity }) => status === 'open' && ['P0', 'P1'].includes(severity))
  if (openReleaseDefects.length) defects.push(issue('OPEN_P0_P1_DEFECTS', 'Close every P0/P1 defect before Phase 1 passes.', { defectIds: openReleaseDefects.map(({ id }) => id) }))
  const unknownWalkthroughs = walkthroughs.filter(({ id }) => !matrix.some((item) => item.id === id)).map(({ id }) => id)
  if (unknownWalkthroughs.length) defects.push(issue('UNKNOWN_WALKTHROUGH', 'Remove evidence outside the approved matrix.', { ids: unknownWalkthroughs }))

  return {
    version: ATTORNEY_PRACTICAL_PHASE1_VERSION,
    status: defects.length ? 'FAILED' : 'PASSED',
    executionAuthorized: true,
    matrix,
    blockerCount: defects.length,
    blockers: defects,
    evidenceFingerprint,
  }
}
