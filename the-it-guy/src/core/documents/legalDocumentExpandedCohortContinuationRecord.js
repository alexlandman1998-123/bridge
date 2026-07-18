import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANDED_CONTINUATION_CONTRACT = 'legal-document-expanded-cohort-continuation-t1-v1'

function normalize(value) {
  return String(value || '').trim()
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function target(value = {}) {
  return canonicalLegalDocumentReleaseValue({ environment: normalize(value.environment).toLowerCase(), projectRef: normalize(value.projectRef), organisationIds: [...new Set((value.organisationIds || []).map(normalize).filter(Boolean))].sort() })
}

export function buildLegalDocumentExpandedCohortContinuationPayload({ s4 = {}, claim = {}, activation = {}, recordedBy, continuationReference, recordedAt = new Date().toISOString() } = {}) {
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANDED_CONTINUATION_CONTRACT,
    status: 'continued',
    decision: 'CONTINUE_EXPANDED_COHORT',
    recordedAt: new Date(recordedAt).toISOString(),
    recordedBy: normalize(recordedBy),
    continuationReference: normalize(continuationReference),
    releaseTarget: target(s4.launchTarget || claim.releaseTarget),
    previousOrganisationIds: [...new Set((activation.previousOrganisationIds || []).map(normalize).filter(Boolean))].sort(),
    addedOrganisationId: normalize(activation.addedOrganisationId),
    sourceActivationDigest: normalize(activation.activationDigest),
    sourceClaimDigest: normalize(claim.claimDigest),
    sourceReceiptDigest: normalize(claim.sourceReceiptDigest),
    sourceAuthorityDigest: normalize(claim.sourceAuthorityDigest),
    s4CheckedAt: s4.checkedAt || null,
    watchdog: s4.evidence?.watchdog || null,
    canaries: (s4.acceptedCanaries || []).map((row) => canonicalLegalDocumentReleaseValue({ packetType: normalize(row.packetType).toLowerCase(), packetId: normalize(row.packetId), versionId: normalize(row.versionId), organisationId: normalize(row.organisationId), finalArtifactSha256: normalize(row.finalArtifactSha256).toLowerCase(), deliveredAt: row.deliveredAt || null })).sort((a, b) => a.packetType.localeCompare(b.packetType)),
    requiredNextPhases: ['T2 expanded-cohort soak gate'],
  })
}

export function assessLegalDocumentExpandedCohortContinuationRecord({ record = null, claim = null, activation = null, digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!record || record.status !== 'continued') push('T1_CONTINUATION_NOT_RECORDED', 'Run the guarded T1 recorder during a READY_FOR_T1 expanded-claim window.')
  if (!claim || claim.status !== 'claimed') push('T1_SOURCE_CLAIM_MISSING', 'Restore the exact R3 claim bound to the continuation record.')
  if (!activation || activation.status !== 'activated') push('T1_SOURCE_ACTIVATION_MISSING', 'Restore the exact Q2 activation bound to the continuation record.')
  if (record) {
    if (record.contract !== EXPANDED_CONTINUATION_CONTRACT || record.decision !== 'CONTINUE_EXPANDED_COHORT') push('T1_CONTINUATION_CONTRACT_INVALID', 'Recreate the continuation record through the current T1 contract.')
    if (!normalize(record.recordedBy) || !normalize(record.continuationReference)) push('T1_CONTINUATION_ACCOUNTABILITY_MISSING', 'Record the accountable continuation operator and change/incident reference.')
    if (!claim?.claimDigest || record.sourceClaimDigest !== claim.claimDigest || record.sourceReceiptDigest !== claim.sourceReceiptDigest || record.sourceAuthorityDigest !== claim.sourceAuthorityDigest) push('T1_AUTHORITY_BINDING_INVALID', 'Restore the record bound to the exact R3 claim, R2 receipt, and R1 authority.')
    if (!activation?.activationDigest || record.sourceActivationDigest !== activation.activationDigest || claim?.sourceActivationDigest !== activation.activationDigest) push('T1_ACTIVATION_BINDING_INVALID', 'Bind continuation to the exact active Q2 expansion receipt.')
    if (JSON.stringify(target(record.releaseTarget)) !== JSON.stringify(target(claim?.releaseTarget)) || JSON.stringify(target(record.releaseTarget)) !== JSON.stringify(target(activation?.activationTarget))) push('T1_CONTINUATION_TARGET_DRIFT', 'Make the continuation target exactly match the claimed and activated environment, project, and cohort.')
    const previousIds = [...new Set((record.previousOrganisationIds || []).map(normalize).filter(Boolean))].sort()
    const targetIds = record.releaseTarget?.organisationIds || []
    const added = normalize(record.addedOrganisationId)
    if (!added || previousIds.includes(added) || targetIds.length !== previousIds.length + 1 || !targetIds.includes(added) || previousIds.some((id) => !targetIds.includes(id)) || added !== normalize(activation?.addedOrganisationId)) push('T1_EXPANSION_TRANCHE_INVALID', 'Record exactly the single organisation added by the current Q2 activation.')
    const types = new Set((record.canaries || []).map((row) => normalize(row.packetType).toLowerCase()))
    const packetIds = new Set((record.canaries || []).map((row) => normalize(row.packetId)).filter(Boolean))
    const versionIds = new Set((record.canaries || []).map((row) => normalize(row.versionId)).filter(Boolean))
    const canariesValid = record.canaries?.length === 2 && types.has('otp') && types.has('mandate') && packetIds.size === 2 && versionIds.size === 2 && record.canaries.every((row) => normalize(row.organisationId) === added && /^[a-f0-9]{64}$/i.test(normalize(row.finalArtifactSha256)) && timestamp(row.deliveredAt) !== null)
    if (!canariesValid) push('T1_CANARY_BINDING_INVALID', 'Record the exact distinct added-organisation OTP and mandate packet/version/hash/delivery evidence accepted by S4.')
    const recordedAt = timestamp(record.recordedAt)
    const s4CheckedAt = timestamp(record.s4CheckedAt)
    const claimStart = timestamp(claim?.claimedAt)
    const claimExpiry = timestamp(claim?.expiresAt)
    if (recordedAt === null || s4CheckedAt === null || claimStart === null || claimExpiry === null || s4CheckedAt < claimStart || recordedAt < s4CheckedAt || recordedAt >= claimExpiry) push('T1_CONTINUATION_WINDOW_INVALID', 'Record continuation after the S4 decision and before the R3 claim expires.')
    if (record.watchdog?.status !== 'healthy' || !normalize(record.watchdog?.id) || Number(record.watchdog?.blockerCount || 0) !== 0) push('T1_WATCHDOG_BINDING_INVALID', 'Record the healthy no-blocker watchdog snapshot used by S4.')
    if (typeof digest === 'function') {
      const { recordDigest, ...payload } = record
      if (!normalize(recordDigest) || recordDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('T1_CONTINUATION_DIGEST_INVALID', 'Restore the committed record or create a new authorised expansion attempt; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { EXPANDED_CONTINUATION_CONTRACT as LEGAL_DOCUMENT_T1_CONTINUATION_CONTRACT }
