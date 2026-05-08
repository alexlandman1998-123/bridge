function normalizeText(value) {
  return String(value || '').trim()
}

export function hasGeneratedFileMetadata(version = {}) {
  const filePath = normalizeText(version?.rendered_file_path || version?.renderedFilePath)
  const fileUrl = normalizeText(version?.rendered_file_url || version?.renderedFileUrl)
  const documentId = normalizeText(version?.rendered_document_id || version?.renderedDocumentId)
  return Boolean(filePath) && Boolean(fileUrl || filePath) && Boolean(documentId)
}

export function summarizePacketGenerationHealth({ otpVersion = null, mandateVersion = null } = {}) {
  return {
    otp: {
      checked: Boolean(otpVersion),
      hasGeneratedFileMetadata: otpVersion ? hasGeneratedFileMetadata(otpVersion) : false,
    },
    mandate: {
      checked: Boolean(mandateVersion),
      hasGeneratedFileMetadata: mandateVersion ? hasGeneratedFileMetadata(mandateVersion) : false,
    },
  }
}
