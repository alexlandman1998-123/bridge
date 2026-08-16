export const MVP_PILOT_GO_NO_GO_VERSION = 'arch9_mvp_pilot_go_no_go_v2'

function text(value) {
  return String(value || '').trim()
}

function asIssues(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function summarizePilotBatchLineage(batchDryRun = {}) {
  const rows = Array.isArray(batchDryRun.creationLineage) ? batchDryRun.creationLineage : []
  const blockers = new Set()
  const summary = {
    total: rows.length,
    acceptedOffer: 0,
    manualOverride: 0,
    missingLineage: 0,
    confirmed: 0,
    auditVisible: 0,
    acceptedOfferLinked: 0,
    withIssues: 0,
  }

  if (!rows.length) blockers.add('pilot_batch_lineage_missing')

  for (const row of rows) {
    const mode = text(row?.mode)
    const acceptedOfferId = text(row?.acceptedOfferId || row?.accepted_offer_id)
    const issues = asIssues(row?.issues)

    if (mode === 'accepted_offer') {
      summary.acceptedOffer += 1
    } else if (mode === 'manual_override') {
      summary.manualOverride += 1
      blockers.add('pilot_batch_manual_override_lineage')
    } else {
      summary.missingLineage += 1
      blockers.add('pilot_batch_lineage_not_accepted_offer')
    }

    if (mode !== 'accepted_offer') blockers.add('pilot_batch_lineage_not_accepted_offer')
    if (acceptedOfferId) summary.acceptedOfferLinked += 1
    if (!acceptedOfferId) blockers.add('pilot_batch_accepted_offer_id_missing')
    if (row?.confirmed === true) summary.confirmed += 1
    if (row?.confirmed !== true) blockers.add('pilot_batch_lineage_unconfirmed')
    if (row?.auditVisible === true) summary.auditVisible += 1
    if (row?.auditVisible !== true) blockers.add('pilot_batch_lineage_not_audit_visible')
    if (issues.length) {
      summary.withIssues += 1
      blockers.add('pilot_batch_lineage_issues_present')
    }
  }

  return { summary, blockers: Array.from(blockers) }
}

/**
 * Final pilot decision. This is intentionally pure and fail-closed: it cannot
 * change environment configuration, create records, or open the pilot.
 */
export function evaluateMvpPilotGoNoGo({
  releaseCertification = {},
  pilotSession = {},
  batchDryRun = {},
  exposureReadiness = {},
  evidencePath = '',
} = {}) {
  const blockers = []
  if (releaseCertification.passed !== true) blockers.push('release_certification_failed')
  if (pilotSession.decision !== 'go_for_controlled_pilot') blockers.push('pilot_session_not_open')
  if (batchDryRun.passed !== true || Number(batchDryRun.batchSize) > Number(batchDryRun.batchLimit || 2)) {
    blockers.push('pilot_batch_control_not_green')
  }
  const lineageGate = summarizePilotBatchLineage(batchDryRun)
  blockers.push(...lineageGate.blockers)
  if (!text(evidencePath)) blockers.push('staging_evidence_required')
  if (exposureReadiness.decision !== 'ready_for_controlled_exposure') blockers.push('staging_exposure_not_ready')

  return {
    version: MVP_PILOT_GO_NO_GO_VERSION,
    decision: blockers.length ? 'do_not_expose' : 'ready_for_controlled_exposure',
    batchLimit: 2,
    lineageSummary: lineageGate.summary,
    blockers,
    nextStep: blockers.length
      ? 'Keep pilot creation paused. Resolve every blocker and collect fresh staging evidence before rerunning this gate.'
      : 'A named pilot operator may open one batch of at most two transactions and must run the session check again before another batch.',
  }
}
