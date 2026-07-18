function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function assessTransactionPdfPersistence({ packet = {}, version = {}, document = {} } = {}) {
  const reasons = []
  const packetId = text(packet.id)
  const versionId = text(version.id)
  const documentId = text(document.id)
  const bucket = text(version.rendered_file_bucket || version.renderedFileBucket)
  const path = text(version.rendered_file_path || version.renderedFilePath)
  const mediaType = text(version.rendered_media_type || version.renderedMediaType).toLowerCase()
  const sha256 = text(version.rendered_sha256 || version.renderedSha256).toLowerCase()
  const byteLength = Number(version.rendered_byte_length || version.renderedByteLength || 0)

  if (version.transaction_pdf_persisted !== true && version.transactionPdfPersisted !== true) reasons.push('D3_PDF_NOT_PERSISTED')
  if (!packetId || text(version.packet_id || version.packetId) !== packetId) reasons.push('D3_PACKET_VERSION_MISMATCH')
  if (!documentId || text(version.rendered_document_id || version.renderedDocumentId) !== documentId) reasons.push('D3_DOCUMENT_VERSION_MISMATCH')
  if (text(document.legal_packet_id || document.legalPacketId) !== packetId) reasons.push('D3_DOCUMENT_PACKET_LINK_MISMATCH')
  if (text(document.legal_packet_version_id || document.legalPacketVersionId) !== versionId) reasons.push('D3_DOCUMENT_VERSION_LINK_MISMATCH')
  if (!bucket || text(document.generated_artifact_bucket || document.generatedArtifactBucket) !== bucket) reasons.push('D3_ARTIFACT_BUCKET_MISMATCH')
  if (!path || text(document.file_path || document.filePath) !== path) reasons.push('D3_ARTIFACT_PATH_MISMATCH')
  if (mediaType !== 'application/pdf') reasons.push('D3_ARTIFACT_MEDIA_TYPE_INVALID')
  if (!Number.isInteger(byteLength) || byteLength < 100) reasons.push('D3_ARTIFACT_SIZE_INVALID')
  if (!/^sha256:[0-9a-f]{64}$/.test(sha256)) reasons.push('D3_ARTIFACT_DIGEST_INVALID')
  if (text(packet.transaction_id || packet.transactionId) && text(document.transaction_id || document.transactionId) !== text(packet.transaction_id || packet.transactionId)) {
    reasons.push('D3_TRANSACTION_LINK_MISMATCH')
  }

  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    artifact: { bucket, path, mediaType, byteLength, sha256 },
  }
}
