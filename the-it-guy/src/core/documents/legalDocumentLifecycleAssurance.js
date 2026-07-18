function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function packetType(value) {
  const normalized = text(value).toLowerCase()
  return normalized === 'salesmandate' || normalized === 'sales_mandate' ? 'mandate' : normalized
}

function latestEvent(events, eventTypes, versionId) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => eventTypes.includes(text(event.event_type)) && text(event.version_id) === versionId)
    .sort((left, right) => (timestamp(right.created_at) || 0) - (timestamp(left.created_at) || 0))[0] || null
}

function firstEvent(events, eventTypes, versionId) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => eventTypes.includes(text(event.event_type)) && text(event.version_id) === versionId)
    .sort((left, right) => (timestamp(left.created_at) || 0) - (timestamp(right.created_at) || 0))[0] || null
}

export function assessLifecycleTarget({ packet = {}, version = {}, signers = [], events = [], artifactEvidence = {}, deliveries = [], publication = {} } = {}) {
  const reasons = []
  const versionId = text(version.id)
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const render = record(validation.render_provenance || validation.renderProvenance)
  const approval = record(validation.approval_snapshot || validation.approvalSnapshot)
  const lock = record(validation.lock_snapshot || validation.lockSnapshot)
  const draftArtifact = record(validation.artifact_provenance || validation.artifactProvenance)
  const finalSha256 = text(artifactEvidence.sha256).toLowerCase()
  const finalPath = text(artifactEvidence.path)
  const generationAttemptId = text(render.generationAttemptId)
  const type = packetType(packet.packet_type)

  if (!['otp', 'mandate'].includes(type)) reasons.push('G1_PACKET_TYPE_INVALID')
  if (!versionId || text(version.packet_id) !== text(packet.id) || Number(packet.current_version_number) !== Number(version.version_number)) reasons.push('G1_CURRENT_VERSION_MISMATCH')
  if (text(packet.status).toLowerCase() !== 'completed') reasons.push('G1_PACKET_NOT_COMPLETED')
  if (!generationAttemptId || text(approval.generationAttemptId) !== generationAttemptId || text(lock.generationAttemptId) !== generationAttemptId) reasons.push('G1_GENERATION_LINEAGE_MISMATCH')
  if (!text(draftArtifact.sha256) || text(approval.artifactSha256).toLowerCase() !== text(draftArtifact.sha256).toLowerCase() || text(lock.artifactSha256).toLowerCase() !== text(draftArtifact.sha256).toLowerCase()) reasons.push('G1_DRAFT_ARTIFACT_LINEAGE_MISMATCH')
  if (!finalSha256 || text(publication.artifact_sha256).toLowerCase() !== finalSha256 || text(publication.artifact_path) !== finalPath) reasons.push('G1_FINAL_ARTIFACT_LINEAGE_MISMATCH')

  const generated = firstEvent(events, ['version_generated', 'packet_regenerated'], versionId)
  const approved = latestEvent(events, ['draft_approved'], versionId)
  const locked = latestEvent(events, ['document_locked'], versionId)
  const dispatched = latestEvent(events, ['signer_links_generated'], versionId)
  const viewed = firstEvent(events, ['signer_link_viewed'], versionId)
  const allSigned = latestEvent(events, ['all_signers_completed'], versionId)
  const finalised = latestEvent(events, ['final_signed_document_generated', 'final_signed_otp_generated'], versionId)
  const delivered = latestEvent(events, ['final_signed_delivery_completed'], versionId)
  const milestones = [
    ['generated', generated?.created_at || version.generated_at],
    ['approved', approved?.created_at || approval.approvedAt],
    ['locked', locked?.created_at || lock.lockedAt],
    ['dispatched', dispatched?.created_at],
    ['viewed', viewed?.created_at],
    ['allSigned', allSigned?.created_at],
    ['finalised', finalised?.created_at || version.finalised_at],
    ['published', publication.verified_at],
    ['delivered', delivered?.created_at],
  ]
  if (milestones.some(([, value]) => timestamp(value) === null)) reasons.push('G1_LIFECYCLE_MILESTONE_MISSING')
  for (let index = 1; index < milestones.length; index += 1) {
    const previous = timestamp(milestones[index - 1][1])
    const current = timestamp(milestones[index][1])
    if (previous !== null && current !== null && current < previous) reasons.push('G1_LIFECYCLE_ORDER_INVALID')
  }
  if (generated?.event_payload_json?.generationAttemptId !== generationAttemptId) reasons.push('G1_GENERATION_EVENT_MISMATCH')
  if (finalised?.event_payload_json?.finalArtifactSha256 !== finalSha256) reasons.push('G1_FINAL_EVENT_MISMATCH')
  if (delivered?.event_payload_json?.artifactSha256 !== finalSha256) reasons.push('G1_DELIVERY_EVENT_MISMATCH')

  const signerRows = Array.isArray(signers) ? signers : []
  if (!signerRows.length || signerRows.some((signer) => text(signer.packet_version_id) !== versionId || text(signer.status).toLowerCase() !== 'signed' || timestamp(signer.signed_at) === null)) reasons.push('G1_SIGNER_COMPLETION_INVALID')
  for (const signer of signerRows) {
    const latest = (Array.isArray(deliveries) ? deliveries : [])
      .filter((delivery) => text(delivery.signer_id) === text(signer.id))
      .sort((left, right) => Number(right.attempt_number) - Number(left.attempt_number))[0]
    if (!latest || text(latest.status) !== 'sent' || text(latest.artifact_sha256).toLowerCase() !== finalSha256 || text(latest.artifact_path) !== finalPath) reasons.push('G1_SIGNER_DELIVERY_INVALID')
  }

  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    packetType: type,
    packetId: text(packet.id) || null,
    versionId: versionId || null,
    organisationId: text(packet.organisation_id) || null,
    generationAttemptId: generationAttemptId || null,
    finalArtifactSha256: finalSha256 || null,
    milestoneTimes: Object.fromEntries(milestones),
  }
}

export function assessControlledLifecyclePair(targets = []) {
  const assessments = (Array.isArray(targets) ? targets : []).map(assessLifecycleTarget)
  const reasons = assessments.flatMap((assessment) => assessment.reasons)
  const byType = new Map(assessments.map((assessment) => [assessment.packetType, assessment]))
  if (assessments.length !== 2 || !byType.has('otp') || !byType.has('mandate')) reasons.push('G1_CONTROLLED_PAIR_INCOMPLETE')
  const organisationIds = new Set(assessments.map((assessment) => assessment.organisationId).filter(Boolean))
  if (organisationIds.size !== 1 || assessments.some((assessment) => !assessment.organisationId)) reasons.push('G1_CONTROLLED_PAIR_ORGANISATION_MISMATCH')
  if (new Set(assessments.map((assessment) => assessment.packetId).filter(Boolean)).size !== assessments.length) reasons.push('G1_CONTROLLED_PAIR_PACKET_COLLISION')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], assessments }
}

export function assertControlledLifecyclePair(targets = []) {
  const assessment = assessControlledLifecyclePair(targets)
  if (assessment.ready) return assessment
  const error = new Error('The controlled OTP and mandate lifecycle pair is not coherent.')
  error.code = 'CONTROLLED_LEGAL_LIFECYCLE_NOT_READY'
  error.details = assessment
  throw error
}
