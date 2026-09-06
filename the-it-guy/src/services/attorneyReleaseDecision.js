import { ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS, ATTORNEY_RELEASE_ROLES } from '../constants/attorneyReleaseReadinessPhase0.js'

export const ATTORNEY_RELEASE_PHASE5_VERSION = 'attorney-release-candidate-phase5-v1'
export const ATTORNEY_RELEASE_VIEWPORTS = Object.freeze(['desktop', 'mobile'])

const text = (value) => String(value || '').trim()

function blocker(code, remedy, details = {}) {
  return { code, remedy, ...details }
}

export function buildAttorneyReleaseDecision({
  sourceFingerprint = '',
  codeGatePassed = false,
  buildPassed = false,
  actors = [],
  fixture = null,
  propagation = null,
  browserEvidence = null,
  approval = null,
} = {}) {
  const blockers = []
  if (!codeGatePassed) blockers.push(blocker('CODE_GATE_FAILED', 'Run and repair npm run test:attorney-release-phase5.'))
  if (!buildPassed) blockers.push(blocker('PRODUCTION_BUILD_FAILED', 'Run and repair npm run build.'))

  for (const role of ATTORNEY_RELEASE_ROLES) {
    const actor = actors.find((item) => item.role === role.transactionRole)
    if (!actor?.authenticated || !actor?.activeAttorneyMembership) {
      blockers.push(blocker('ATTORNEY_ACTOR_NOT_READY', `Repair the managed ${role.label} staging actor.`, { role: role.transactionRole }))
    }
    for (const viewport of ATTORNEY_RELEASE_VIEWPORTS) {
      const walkthrough = browserEvidence?.walkthroughs?.find((item) => item.role === role.transactionRole && item.viewport === viewport)
      if (!walkthrough?.passed) {
        blockers.push(blocker('BROWSER_WALKTHROUGH_MISSING', `Complete the ${role.label} ${viewport} walkthrough.`, { role: role.transactionRole, viewport }))
      }
    }
  }

  if (!fixture?.ready || Number(fixture?.expectedTransactions || 0) < 1) {
    blockers.push(blocker('ATTORNEY_FIXTURE_NOT_READY', 'Seed and verify deterministic attorney staging matters.'))
  }
  if (!propagation || text(propagation.status).toLowerCase() !== 'healthy' || Number(propagation.gapCount || 0) > 0) {
    blockers.push(blocker('PROPAGATION_NOT_HEALTHY', 'Resolve all unexplained propagation gaps and rerun the staging preflight.', { gapCount: Number(propagation?.gapCount || 0) }))
  }

  for (const destination of ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS) {
    const check = browserEvidence?.destinations?.find((item) => item.destination === destination)
    if (!check?.passed) blockers.push(blocker('DESTINATION_EVIDENCE_MISSING', `Verify attorney updates in ${destination}.`, { destination }))
  }

  if (!sourceFingerprint || browserEvidence?.sourceFingerprint !== sourceFingerprint) {
    blockers.push(blocker('BROWSER_EVIDENCE_STALE', 'Rerun browser UAT against the exact Phase 5 source fingerprint.'))
  }
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt)) {
    blockers.push(blocker('RELEASE_APPROVAL_MISSING', 'Record the accountable release owner and approval timestamp.'))
  }
  if (!sourceFingerprint || approval?.sourceFingerprint !== sourceFingerprint) {
    blockers.push(blocker('RELEASE_APPROVAL_STALE', 'Approve the exact Phase 5 source fingerprint after UAT passes.'))
  }

  return {
    version: ATTORNEY_RELEASE_PHASE5_VERSION,
    sourceFingerprint,
    status: blockers.length ? 'NO_GO' : 'GO',
    evaluatedAt: new Date().toISOString(),
    summary: {
      requiredActors: ATTORNEY_RELEASE_ROLES.length,
      requiredWalkthroughs: ATTORNEY_RELEASE_ROLES.length * ATTORNEY_RELEASE_VIEWPORTS.length,
      requiredDestinations: ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS.length,
      blockerCount: blockers.length,
    },
    blockers,
  }
}
