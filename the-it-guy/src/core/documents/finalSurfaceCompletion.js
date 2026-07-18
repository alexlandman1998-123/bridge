function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessFinalSurfaceCompletion({ packet = {}, version = {}, document = {}, publication = {}, receipt = {}, requirement = {} } = {}) {
  const reasons = []
  const expectedKey = text(packet.packetType || packet.packet_type).toLowerCase() === 'otp' ? 'signed_otp' : 'signed_mandate'
  if (text(receipt.packetVersionId || receipt.packet_version_id) !== text(version.id)) reasons.push('F4_RECEIPT_VERSION_MISMATCH')
  if (text(receipt.documentId || receipt.document_id) !== text(document.id) || text(receipt.publicationId || receipt.publication_id) !== text(publication.id)) reasons.push('F4_RECEIPT_PUBLICATION_MISMATCH')
  if (text(receipt.canonicalDocumentKey || receipt.canonical_document_key) !== expectedKey) reasons.push('F4_CANONICAL_KEY_MISMATCH')
  if (!(receipt.transactionVisible ?? receipt.transaction_visible) || !(receipt.clientVisible ?? receipt.client_visible)) reasons.push('F4_SURFACE_VISIBILITY_INCOMPLETE')
  if (!(receipt.canonicalSatisfied ?? receipt.canonical_satisfied)) reasons.push('F4_CANONICAL_REQUIREMENT_INCOMPLETE')
  const requirementId = text(receipt.canonicalRequirementInstanceId || receipt.canonical_requirement_instance_id)
  if (requirementId && (text(requirement.id) !== requirementId || text(requirement.status).toLowerCase() !== 'completed' || text(requirement.satisfiedByDocumentId || requirement.satisfied_by_document_id) !== text(document.id))) reasons.push('F4_REQUIREMENT_BINDING_INVALID')
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], canonicalDocumentKey: expectedKey, requirementId }
}
