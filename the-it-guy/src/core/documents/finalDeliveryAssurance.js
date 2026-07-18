function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessFinalDelivery({ packet = {}, version = {}, signers = [], artifactEvidence = {}, deliveries = [], publication = {}, events = [] } = {}) {
  const reasons = []
  const versionId = text(version.id)
  const artifactSha256 = text(artifactEvidence.sha256).toLowerCase()
  const artifactPath = text(artifactEvidence.path)
  const expectedSurface = text(packet.packet_type).toLowerCase() === 'mandate' ? 'seller_portal' : 'client_portal'
  if (!versionId || text(artifactEvidence.packet_version_id) !== versionId || text(version.final_signed_file_path) !== artifactPath) reasons.push('F3_F2_ARTIFACT_BINDING_INVALID')
  if (text(publication.packet_version_id) !== versionId || text(publication.artifact_sha256).toLowerCase() !== artifactSha256 || text(publication.artifact_path) !== artifactPath || text(publication.portal_surface) !== expectedSurface || !Number.isFinite(Date.parse(publication.verified_at || ''))) reasons.push('F3_PORTAL_PUBLICATION_INVALID')
  const signerRows = Array.isArray(signers) ? signers : []
  const deliveryRows = Array.isArray(deliveries) ? deliveries : []
  if (!signerRows.length) reasons.push('F3_RECIPIENTS_MISSING')
  for (const signer of signerRows) {
    const signerId = text(signer.id)
    const matching = deliveryRows.filter((delivery) => text(delivery.signer_id) === signerId).sort((a, b) => Number(b.attempt_number) - Number(a.attempt_number))[0]
    if (!matching || text(matching.status) !== 'sent' || !text(matching.provider_message_id) || text(matching.artifact_sha256).toLowerCase() !== artifactSha256 || text(matching.artifact_path) !== artifactPath || text(matching.recipient_email).toLowerCase() !== text(signer.signer_email).toLowerCase()) reasons.push('F3_RECIPIENT_DELIVERY_INCOMPLETE')
  }
  const completionEvent = (Array.isArray(events) ? events : []).find((event) => text(event.version_id) === versionId && text(event.event_type) === 'final_signed_delivery_completed' && text(event.event_payload_json?.artifactSha256).toLowerCase() === artifactSha256)
  if (!completionEvent || Number(completionEvent.event_payload_json?.recipientCount) !== signerRows.length || Number(completionEvent.event_payload_json?.sentCount) !== signerRows.length || text(completionEvent.event_payload_json?.portalSurface) !== expectedSurface) reasons.push('F3_DELIVERY_EVENT_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], recipientCount: signerRows.length, sentRecipientCount: signerRows.filter((signer) => deliveryRows.some((delivery) => text(delivery.signer_id) === text(signer.id) && text(delivery.status) === 'sent')).length, portalSurface: expectedSurface }
}

export function assertFinalDeliveryReady(input = {}) {
  const assessment = assessFinalDelivery(input)
  if (assessment.ready) return assessment
  const error = new Error('Final signed document delivery is incomplete.')
  error.code = 'FINAL_DELIVERY_NOT_READY'
  error.details = assessment
  throw error
}
