import { reportDocumentUploadTelemetry } from './documentUploadObservability.js'

export const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024

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
  { maxBytes = DOCUMENT_UPLOAD_MAX_BYTES, surface = 'unknown', transactionId = null, listingId = null } = {},
) {
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
  if (size > maxBytes) {
    rejectDocumentUpload(
      `This file is too large. Document uploads are limited to ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      'document_file_too_large',
      { surface, transactionId, listingId },
    )
  }

  return {
    safeName,
    extension,
    mimeType: mimeType || acceptedMimeTypes[0],
    size,
  }
}
