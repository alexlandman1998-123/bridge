import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const NEXT_EXPANSION_HANDOFF_CONTRACT = 'legal-document-next-expansion-handoff-t4-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

export function buildLegalDocumentNextExpansionHandoff({ t3 = {}, continuation = {}, activation = {}, handedOffAt = new Date().toISOString(), evidenceAgeLimitMinutes = 15 } = {}) {
  const proposal = t3.proposal || {}
  const candidate = (t3.candidateAssessments || []).find((row) => normalize(row.organisationId) === normalize(proposal.addedOrganisationId)) || null
  const checkedAt = Date.parse(t3.checkedAt || '')
  return canonicalLegalDocumentReleaseValue({
    contract: NEXT_EXPANSION_HANDOFF_CONTRACT,
    status: 'handed_off',
    handedOffAt: new Date(handedOffAt).toISOString(),
    expiresAt: new Date(checkedAt + Number(evidenceAgeLimitMinutes) * 60_000).toISOString(),
    sourceT3CheckedAt: t3.checkedAt || null,
    sourceContinuationDigest: normalize(continuation.recordDigest),
    sourceActivationDigest: normalize(activation.activationDigest),
    releaseTarget: continuation.releaseTarget || null,
    currentOrganisationIds: ids(proposal.currentOrganisationIds),
    addedOrganisationId: normalize(proposal.addedOrganisationId),
    proposedOrganisationIds: ids(proposal.proposedOrganisationIds),
    maximumOrganisations: Number(proposal.maximumOrganisations),
    trancheSize: Number(proposal.trancheSize),
    candidateEvidence: candidate ? {
      organisationId: normalize(candidate.organisationId),
      organisationName: candidate.organisationName || null,
      activeAgentCount: Number(candidate.activeAgentCount || 0),
      status: candidate.status,
      blockers: candidate.blockers || [],
    } : null,
    requiredNextPhases: ['U1 accountable expansion approval', 'fresh certification', 'guarded activation', 'fresh release authority'],
  })
}

export function assessLegalDocumentNextExpansionHandoff({ t3 = {}, handoff = null, continuation = null, activation = null, pilot = {}, now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, kind, solution) => blockers.push({ code, kind, solution })
  if (t3.status !== 'READY_FOR_T4' || t3.ready !== true || !t3.proposal) push('T4_T3_NOT_READY', 'upstream', 'Resolve T3 and regenerate a current single-organisation proposal.')
  if (!continuation || continuation.status !== 'continued') push('T4_CONTINUATION_RECORD_MISSING', 'upstream', 'Restore the exact T1 continuation record used by T3.')
  if (!activation || activation.status !== 'activated') push('T4_ACTIVATION_RECORD_MISSING', 'upstream', 'Restore the exact Q2 activation record used by T3.')
  if (!handoff || handoff.status !== 'handed_off') push('T4_HANDOFF_MISSING', 'upstream', 'Build the T4 integrity handoff from a current READY_FOR_T4 proposal.')
  if (handoff) {
    if (handoff.contract !== NEXT_EXPANSION_HANDOFF_CONTRACT) push('T4_HANDOFF_CONTRACT_INVALID', 'stop', 'Rebuild the handoff using the current T4 contract.')
    if (!continuation?.recordDigest || handoff.sourceContinuationDigest !== continuation.recordDigest || t3.proposal?.sourceContinuationDigest !== continuation.recordDigest) push('T4_CONTINUATION_BINDING_INVALID', 'stop', 'Rebuild T3/T4 from the exact current T1 continuation digest.')
    if (!activation?.activationDigest || handoff.sourceActivationDigest !== activation.activationDigest || t3.proposal?.sourceActivationDigest !== activation.activationDigest || continuation?.sourceActivationDigest !== activation.activationDigest) push('T4_ACTIVATION_BINDING_INVALID', 'stop', 'Rebuild T3/T4 from the exact Q2 activation digest bound by T1.')
    const currentIds = ids(handoff.currentOrganisationIds)
    const proposedIds = ids(handoff.proposedOrganisationIds)
    const configuredIds = ids(pilot.organisationIds)
    const continuedIds = ids(continuation?.releaseTarget?.organisationIds)
    const activatedIds = ids(activation?.activatedOrganisationIds)
    const added = normalize(handoff.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== continuedIds.join(',') || currentIds.join(',') !== activatedIds.join(',')) push('T4_CURRENT_COHORT_DRIFT', 'stop', 'Restore the configured, T1, Q2, and T4 current cohort match.')
    const handoffTarget = handoff.releaseTarget || {}
    const continuedTarget = continuation?.releaseTarget || {}
    const activatedTarget = activation?.activationTarget || {}
    if (normalize(handoffTarget.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(handoffTarget.projectRef) !== normalize(continuedTarget.projectRef) || ids(handoffTarget.organisationIds).join(',') !== currentIds.join(',') || normalize(activatedTarget.environment).toLowerCase() !== normalize(continuedTarget.environment).toLowerCase() || normalize(activatedTarget.projectRef) !== normalize(continuedTarget.projectRef)) push('T4_RELEASE_TARGET_DRIFT', 'stop', 'Restore the exact T1/Q2 environment, project, and current-cohort target before handoff.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id)) || Number(handoff.trancheSize) !== 1) push('T4_TRANCHE_INVALID', 'stop', 'Hand off exactly one new organisation while retaining the full current cohort.')
    const maximum = Number(handoff.maximumOrganisations)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5 || proposedIds.length > maximum || maximum !== Number(pilot.limits?.maxOrganisations)) push('T4_EXPANSION_LIMIT_INVALID', 'stop', 'Keep the handoff within the unchanged one-to-five organisation safety limit.')
    const candidate = handoff.candidateEvidence
    if (!candidate || normalize(candidate.organisationId) !== added || candidate.status !== 'READY' || (candidate.blockers || []).length || Number(candidate.activeAgentCount || 0) < Number(pilot.cohortPreparation?.minimumActiveAgents || 1)) push('T4_CANDIDATE_EVIDENCE_INVALID', 'stop', 'Regenerate T3 after the selected agency has complete, blocker-free readiness evidence.')
    const currentCandidate = (t3.candidateAssessments || []).find((row) => normalize(row.organisationId) === added)
    if (!currentCandidate || currentCandidate.status !== candidate?.status || Number(currentCandidate.activeAgentCount || 0) !== Number(candidate?.activeAgentCount || 0) || JSON.stringify(currentCandidate.blockers || []) !== JSON.stringify(candidate?.blockers || [])) push('T4_CURRENT_CANDIDATE_DRIFT', 'stop', 'Discard the handoff and rebuild it from the current T3 candidate assessment.')
    const sourceCheckedAt = Date.parse(handoff.sourceT3CheckedAt || '')
    const handedOffAt = Date.parse(handoff.handedOffAt || '')
    const expiresAt = Date.parse(handoff.expiresAt || '')
    if (!Number.isFinite(sourceCheckedAt) || !Number.isFinite(handedOffAt) || !Number.isFinite(expiresAt) || handedOffAt < sourceCheckedAt || handedOffAt > now + 60_000 || expiresAt <= handedOffAt || now >= expiresAt) push('T4_HANDOFF_EXPIRED_OR_MISORDERED', 'stop', 'Re-run T3 and rebuild T4 inside the fresh proposal evidence window.')
    if (t3.checkedAt !== handoff.sourceT3CheckedAt || ids(t3.proposal?.proposedOrganisationIds).join(',') !== proposedIds.join(',') || normalize(t3.proposal?.addedOrganisationId) !== added) push('T4_CURRENT_PROPOSAL_DRIFT', 'stop', 'Discard the stale handoff and rebuild it from the current T3 proposal.')
    if (typeof digest === 'function') {
      const { handoffDigest, ...payload } = handoff
      if (!normalize(handoffDigest) || handoffDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('T4_HANDOFF_DIGEST_INVALID', 'stop', 'Restore the exact T4 output or rebuild it; do not hand-edit handoff evidence.')
    }
  }
  const stop = blockers.some((row) => row.kind === 'stop')
  return { ready: blockers.length === 0, status: blockers.length === 0 ? 'READY_FOR_U1' : stop ? 'HANDOFF_BLOCKED' : 'NO_GO', blockers }
}

export { NEXT_EXPANSION_HANDOFF_CONTRACT as LEGAL_DOCUMENT_T4_HANDOFF_CONTRACT }
