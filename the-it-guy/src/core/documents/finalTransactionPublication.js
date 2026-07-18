function text(value) { return typeof value === 'string' ? value.trim() : '' }

export function assessFinalTransactionPublication({ packet = {}, version = {}, artifact = {}, publication = {}, document = {}, deliveries = [] } = {}) {
  const reasons = []
  const transactionId = text(packet.transactionId || packet.transaction_id)
  const versionId = text(version.id)
  const sha256 = text(artifact.sha256).toLowerCase()
  if (!transactionId) reasons.push('F3_TRANSACTION_MISSING')
  if (text(publication.packetVersionId || publication.packet_version_id) !== versionId || text(publication.transactionId || publication.transaction_id) !== transactionId) reasons.push('F3_TRANSACTION_PUBLICATION_BINDING_INVALID')
  if (text(publication.artifactSha256 || publication.artifact_sha256).toLowerCase() !== sha256 || text(publication.artifactPath || publication.artifact_path) !== text(artifact.path)) reasons.push('F3_TRANSACTION_ARTIFACT_MISMATCH')
  if (text(document.id) !== text(publication.documentId || publication.document_id) || text(document.transactionId || document.transaction_id) !== transactionId) reasons.push('F3_TRANSACTION_DOCUMENT_MISMATCH')
  if (text(document.filePath || document.file_path) !== text(artifact.path) || text(document.finalArtifactSha256 || document.final_artifact_sha256).toLowerCase() !== sha256) reasons.push('F3_DOCUMENT_ARTIFACT_MISMATCH')
  if (text(artifact.bucket) && text(document.fileBucket || document.file_bucket) !== text(artifact.bucket)) reasons.push('F3_DOCUMENT_BUCKET_MISMATCH')
  if (text(document.visibilityScope || document.visibility_scope).toLowerCase() !== 'shared' || !(document.isClientVisible ?? document.is_client_visible)) reasons.push('F3_DOCUMENT_NOT_SHARED')
  const deliveryRows = Array.isArray(deliveries) ? deliveries : []
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], transactionId, documentId: text(document.id), deliveredRecipientCount: deliveryRows.filter((row) => text(row.status).toLowerCase() === 'sent').length }
}
