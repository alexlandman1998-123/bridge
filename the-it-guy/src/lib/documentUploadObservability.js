const DOCUMENT_UPLOAD_TELEMETRY_EVENT = 'arch9:document-upload-telemetry'

function normalizeTelemetryValue(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function reportDocumentUploadTelemetry({
  surface = 'unknown',
  stage = 'unknown',
  outcome = 'unknown',
  error = null,
  transactionId = null,
  listingId = null,
  documentId = null,
} = {}) {
  const payload = {
    event: 'document_upload',
    surface: normalizeTelemetryValue(surface),
    stage: normalizeTelemetryValue(stage),
    outcome: normalizeTelemetryValue(outcome),
    errorCode: normalizeTelemetryValue(error?.code),
    errorMessage: normalizeTelemetryValue(error?.message || error?.error),
    transactionId: normalizeTelemetryValue(transactionId),
    listingId: normalizeTelemetryValue(listingId),
    documentId: normalizeTelemetryValue(documentId),
    occurredAt: new Date().toISOString(),
  }

  const logger = outcome === 'failed' ? console.warn : console.info
  logger('[document-upload]', payload)

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(DOCUMENT_UPLOAD_TELEMETRY_EVENT, { detail: payload }))
  }

  return payload
}

export { DOCUMENT_UPLOAD_TELEMETRY_EVENT }
