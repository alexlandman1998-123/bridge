function text(value) { return typeof value === 'string' ? value.trim() : '' }
const SHA256 = /^[0-9a-f]{64}$/i

function eventSignerId(event = {}) {
  const payload = event.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
  return text(payload.signerId || payload.signer_id)
}

export function assessFinalSignedCompletion({ packet = {}, version = {}, signers = [], fields = [], events = [], evidence = {} } = {}) {
  const reasons = []
  const validation = version.validation_summary_json && typeof version.validation_summary_json === 'object' ? version.validation_summary_json : {}
  const lock = validation.lock_snapshot && typeof validation.lock_snapshot === 'object' ? validation.lock_snapshot : {}
  const packetId = text(packet.id)
  const versionId = text(version.id)
  if (text(packet.status).toLowerCase() !== 'completed' || !Number.isFinite(Date.parse(packet.completed_at || ''))) reasons.push('F2_PACKET_NOT_COMPLETED')
  if (!packetId || !versionId || text(version.packet_id) !== packetId || Number(packet.current_version_number) !== Number(version.version_number)) reasons.push('F2_VERSION_BINDING_INVALID')
  if (text(version.render_status).toLowerCase() !== 'generated' || validation.content_locked !== true || text(validation.review_state).toLowerCase() !== 'locked' || text(lock.lockDecision).toLowerCase() !== 'locked' || text(lock.packetId) !== packetId || text(lock.versionId) !== versionId) reasons.push('F2_LOCK_BINDING_INVALID')
  const signerRows = Array.isArray(signers) ? signers : []
  if (!signerRows.length || signerRows.some((signer) => text(signer.packet_version_id) !== versionId || text(signer.status).toLowerCase() !== 'signed' || !Number.isFinite(Date.parse(signer.signed_at || '')))) reasons.push('F2_SIGNERS_INCOMPLETE')
  const requiredFields = (Array.isArray(fields) ? fields : []).filter((field) => field.required === true)
  if (!requiredFields.length || requiredFields.some((field) => text(field.packet_version_id) !== versionId || text(field.status).toLowerCase() !== 'completed')) reasons.push('F2_FIELDS_INCOMPLETE')
  if (requiredFields.some((field) => ['signature', 'initial'].includes(text(field.field_type).toLowerCase()) && !text(field.signature_asset_path))) reasons.push('F2_SIGNATURE_ASSET_MISSING')
  const eventRows = Array.isArray(events) ? events : []
  for (const signer of signerRows) {
    const signerId = text(signer.id)
    if (!eventRows.some((event) => text(event.version_id) === versionId && text(event.event_type) === 'signer_link_viewed' && eventSignerId(event) === signerId)) reasons.push('F2_SIGNER_VIEW_EVIDENCE_MISSING')
    if (!eventRows.some((event) => text(event.version_id) === versionId && text(event.event_type) === 'signer_completed_signing' && eventSignerId(event) === signerId)) reasons.push('F2_SIGNER_COMPLETION_EVIDENCE_MISSING')
  }
  if (!eventRows.some((event) => text(event.version_id) === versionId && text(event.event_type) === 'all_signers_completed')) reasons.push('F2_ALL_SIGNERS_EVENT_MISSING')
  if (text(evidence.packet_id) !== packetId || text(evidence.packet_version_id) !== versionId || text(evidence.path) !== text(version.final_signed_file_path) || text(evidence.bucket) !== text(version.final_signed_file_bucket)) reasons.push('F2_FINAL_EVIDENCE_BINDING_INVALID')
  if (!SHA256.test(text(evidence.sha256)) || !Number.isInteger(Number(evidence.byte_length)) || Number(evidence.byte_length) < 100 || text(evidence.media_type).toLowerCase() !== 'application/pdf') reasons.push('F2_FINAL_EVIDENCE_INVALID')
  if (!text(version.final_signed_file_path) || !text(version.final_signed_file_bucket) || !Number.isFinite(Date.parse(version.finalised_at || ''))) reasons.push('F2_FINAL_ARTIFACT_MISSING')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], signerCount: signerRows.length, requiredFieldCount: requiredFields.length, artifactSha256: text(evidence.sha256).toLowerCase(), artifactByteLength: Number(evidence.byte_length) || 0 }
}

export function assertFinalSignedCompletionReady(input = {}) {
  const assessment = assessFinalSignedCompletion(input)
  if (assessment.ready) return assessment
  const error = new Error('The final signed document does not have complete exact-version evidence.')
  error.code = 'FINAL_SIGNED_COMPLETION_NOT_READY'
  error.details = assessment
  throw error
}
