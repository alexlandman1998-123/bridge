function normalizeText(value) {
  return String(value || '').trim()
}

export function hasGeneratedPreviewAsset(version = {}) {
  const filePath = normalizeText(version?.rendered_file_path || version?.renderedFilePath)
  const fileUrl = normalizeText(version?.rendered_file_url || version?.renderedFileUrl)
  return Boolean(filePath || fileUrl)
}

export function hasGeneratedDocumentRecord(version = {}) {
  const documentId = normalizeText(version?.rendered_document_id || version?.renderedDocumentId)
  return Boolean(documentId)
}

export function hasGeneratedFileMetadata(version = {}) {
  return hasGeneratedPreviewAsset(version)
}

export function hasFinalSignedArtifact(version = {}) {
  const filePath = normalizeText(version?.final_signed_file_path || version?.finalSignedFilePath)
  const fileUrl = normalizeText(version?.final_signed_file_url || version?.finalSignedFileUrl)
  const documentId = normalizeText(version?.final_signed_document_id || version?.finalSignedDocumentId)
  return Boolean(filePath || fileUrl || documentId)
}

export function summarizeSinglePacketGenerationHealth(version = {}, { signed = false } = {}) {
  const hasPreviewAsset = hasGeneratedPreviewAsset(version)
  const hasDocumentRecord = hasGeneratedDocumentRecord(version)
  const hasFinalArtifact = hasFinalSignedArtifact(version)
  return {
    checked: Boolean(version),
    hasGeneratedFileMetadata: hasGeneratedFileMetadata(version),
    hasGeneratedPreviewAsset: hasPreviewAsset,
    hasGeneratedDocumentRecord: hasDocumentRecord,
    hasFinalSignedArtifact: hasFinalArtifact,
    launchReady: Boolean(version) && hasPreviewAsset && (!signed || hasFinalArtifact),
  }
}

export function summarizePacketGenerationHealth({ otpVersion = null, mandateVersion = null } = {}) {
  return {
    otp: summarizeSinglePacketGenerationHealth(otpVersion),
    mandate: summarizeSinglePacketGenerationHealth(mandateVersion),
  }
}
