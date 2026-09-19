import { reportDocumentUploadTelemetry } from './documentUploadObservability.js'

export const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024
export const RENTAL_DOCUMENT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
export const DOCUMENT_UPLOAD_POLICY_VERSION = 'document_upload_policy_v2'

const DOCUMENT_UPLOAD_FILE_TYPES = new Map([
  ['pdf', ['application/pdf']],
  ['doc', ['application/msword']],
  ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['jpg', ['image/jpeg']],
  ['jpeg', ['image/jpeg']],
  ['png', ['image/png']],
])

export const DOCUMENT_UPLOAD_ACCEPT = Array.from(
  new Set([...DOCUMENT_UPLOAD_FILE_TYPES.keys()].map((extension) => `.${extension}`)),
).join(',')

// There is no malware-scanning provider configured in this workspace. This is
// intentionally explicit: callers may display the decision or enforce it at
// release time, but must never claim a browser-side MIME check scanned a file.
export const DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION = Object.freeze({
  status: 'not_configured',
  scanned: false,
  disposition: 'accepted_with_server_type_and_size_enforcement',
  releaseBlocker: 'Configure a server-side malware scanner before claiming malware-scanned uploads.',
})

export function getDocumentUploadPolicy({ surface = 'unknown' } = {}) {
  return {
    version: DOCUMENT_UPLOAD_POLICY_VERSION,
    maxBytes: surface === 'rental_application' ? RENTAL_DOCUMENT_UPLOAD_MAX_BYTES : DOCUMENT_UPLOAD_MAX_BYTES,
    accept: DOCUMENT_UPLOAD_ACCEPT,
    malwareScan: DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION,
  }
}

function rejectDocumentUpload(message, code, { surface = 'unknown', transactionId = null, listingId = null } = {}) {
  const error = new Error(message)
  error.code = code
  reportDocumentUploadTelemetry({
    surface,
    stage: 'validation',
    outcome: 'failed',
    error,
    transactionId,
    listingId,
  })
  throw error
}

export function sanitizeDocumentFileName(value, fallback = 'document') {
  const name = String(value || fallback)
    .split(/[\\/]/)
    .pop()
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 140)

  return name || fallback
}

export function validateDocumentUploadFile(
  file,
  { maxBytes = null, surface = 'unknown', transactionId = null, listingId = null } = {},
) {
  const policy = getDocumentUploadPolicy({ surface })
  const effectiveMaxBytes = Number(maxBytes) || policy.maxBytes
  if (!file || typeof file !== 'object') {
    rejectDocumentUpload('Select a document to upload.', 'document_file_required', { surface, transactionId, listingId })
  }

  const safeName = sanitizeDocumentFileName(file.name)
  const extension = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : ''
  const acceptedMimeTypes = DOCUMENT_UPLOAD_FILE_TYPES.get(extension)
  if (!acceptedMimeTypes) {
    rejectDocumentUpload(
      'Unsupported file type. Upload a PDF, Word document, JPG, or PNG file.',
      'document_file_type_invalid',
      { surface, transactionId, listingId },
    )
  }

  const mimeType = String(file.type || '').trim().toLowerCase()
  if (mimeType && !acceptedMimeTypes.includes(mimeType)) {
    rejectDocumentUpload(
      `The selected file type does not match its .${extension} extension.`,
      'document_file_mime_mismatch',
      { surface, transactionId, listingId },
    )
  }

  const size = Number(file.size || 0)
  if (!Number.isFinite(size) || size <= 0) {
    rejectDocumentUpload('The selected file is empty or unreadable.', 'document_file_empty', { surface, transactionId, listingId })
  }
  if (size > effectiveMaxBytes) {
    rejectDocumentUpload(
      `This file is too large. Document uploads are limited to ${Math.round(effectiveMaxBytes / (1024 * 1024))} MB.`,
      'document_file_too_large',
      { surface, transactionId, listingId },
    )
  }

  return {
    safeName,
    extension,
    mimeType: mimeType || acceptedMimeTypes[0],
    size,
    policyVersion: policy.version,
    malwareScan: policy.malwareScan,
  }
}
