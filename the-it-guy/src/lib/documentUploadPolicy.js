import { reportDocumentUploadTelemetry } from './documentUploadObservability.js'

export const DOCUMENT_UPLOAD_MAX_BYTES = 35 * 1024 * 1024
export const RENTAL_DOCUMENT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
export const DOCUMENT_UPLOAD_POLICY_VERSION = 'document_upload_policy_v2'

const DOCUMENT_UPLOAD_FILE_TYPES = new Map([
  ['pdf', ['application/pdf']],
  ['doc', ['application/msword']],
  ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['jpg', ['image/jpeg']],
  ['jpeg', ['image/jpeg']],
  ['png', ['image/png']],
  ['webp', ['image/webp']],
  ['svg', ['image/svg+xml']],
])

const commonExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
const profiles = {
  document_image: { extensions: ['jpg', 'jpeg', 'png'], formats: 'JPG or PNG' },
  signed_pdf: { extensions: ['pdf'], formats: 'PDF' },
  signed_packet: { extensions: ['pdf'], formats: 'PDF' },
  bank_statement: { extensions: ['pdf', 'jpg', 'jpeg', 'png'], formats: 'PDF, JPG or PNG' },
  rental_application: { maxBytes: RENTAL_DOCUMENT_UPLOAD_MAX_BYTES },
  rental_landlord: { maxBytes: RENTAL_DOCUMENT_UPLOAD_MAX_BYTES },
  recruitment_document: { maxBytes: 10 * 1024 * 1024, extensions: ['pdf', 'jpg', 'jpeg', 'png'], formats: 'PDF, JPG or PNG' },
  recruitment_onboarding: { maxBytes: 10 * 1024 * 1024, extensions: ['pdf', 'jpg', 'jpeg', 'png'], formats: 'PDF, JPG or PNG' },
  recruitment_contract: { maxBytes: 10 * 1024 * 1024, extensions: ['pdf'], formats: 'PDF' },
  recruitment_signed_contract: { maxBytes: 10 * 1024 * 1024, extensions: ['pdf'], formats: 'PDF' },
  fic_policy: { maxBytes: 10 * 1024 * 1024, extensions: ['pdf'], formats: 'PDF' },
  bond_signed_application: { maxBytes: 25 * 1024 * 1024, extensions: ['pdf'], formats: 'PDF' },
  legal_template: { maxBytes: 25 * 1024 * 1024, extensions: ['docx'], formats: 'Word DOCX' },
  documents_storage: { extensions: [...commonExtensions, 'webp', 'svg'], formats: 'PDF, Word, JPG, PNG, WebP or SVG' },
  development_image: { extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'], formats: 'JPG, PNG, WebP or SVG' },
  development_plan: { extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'svg'], formats: 'PDF, JPG, PNG, WebP or SVG' },
  development_asset: { extensions: [...commonExtensions, 'webp', 'svg'], formats: 'PDF, Word, JPG, PNG, WebP or SVG' },
}
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
  const profile = profiles[surface] || {}
  const extensions = profile.extensions || commonExtensions
  const maxBytes = profile.maxBytes || DOCUMENT_UPLOAD_MAX_BYTES
  const formats = profile.formats || 'PDF, Word, JPG or PNG'
  return {
    version: DOCUMENT_UPLOAD_POLICY_VERSION,
    maxBytes,
    extensions: [...extensions],
    mimeTypes: [...new Set(extensions.flatMap(extension => DOCUMENT_UPLOAD_FILE_TYPES.get(extension)))],
    accept: extensions.map(extension => `.${extension}`).join(','),
    formats,
    helpText: `${formats} · up to ${maxBytes / (1024 * 1024)} MB per file.`,
    malwareScan: DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION,
  }
}

export const DOCUMENT_UPLOAD_ACCEPT = getDocumentUploadPolicy().accept
export const DOCUMENT_UPLOAD_HELP_TEXT = getDocumentUploadPolicy().helpText
export const DOCUMENT_IMAGE_UPLOAD_ACCEPT = getDocumentUploadPolicy({ surface: 'document_image' }).accept
export const DOCUMENT_IMAGE_UPLOAD_HELP_TEXT = getDocumentUploadPolicy({ surface: 'document_image' }).helpText

// Use the validated MIME type for Storage too: a browser may leave File.type
// blank, and Storage then defaults to a type rejected by the bucket.
export function getDocumentUploadOptions(file, { surface = 'unknown', fileName = '', ...storageOptions } = {}) {
  const validated = validateDocumentUploadFile({ name: file?.name || fileName, type: file?.type, size: file?.size }, { surface })
  return { ...storageOptions, contentType: validated.mimeType }
}

// Supabase serialises browser Blobs as multipart form data. That part uses the
// Blob's own type, ignoring the contentType upload option. Rewrap the same bytes
// with the validated type while keeping the original File for recovery hashing.
export function withDocumentUploadMimeType(file, mimeType) {
  if (typeof Blob === 'undefined' || !(file instanceof Blob) || file.type === mimeType) return file
  if (typeof File !== 'undefined' && file instanceof File) {
    return new File([file], file.name, { type: mimeType, lastModified: file.lastModified })
  }
  return file.slice(0, file.size, mimeType)
}

function rejectDocumentUpload(message, code, { surface = 'unknown', transactionId = null, listingId = null } = {}) {
  const error = new Error(message)
  error.code = code
  // Local validation proves no object was uploaded; recovery must not retain
  // it as an uncertain Storage request.
  error.status = 400
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

  if (name.length <= 140) return name || fallback
  const extension = name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] || ''
  return `${name.slice(0, 140 - extension.length)}${extension}`
}

export function validateDocumentUploadFile(
  file,
  { maxBytes = null, surface = 'unknown', transactionId = null, listingId = null } = {},
) {
  const policy = getDocumentUploadPolicy({ surface })
  const effectiveMaxBytes = Math.min(Number(maxBytes) > 0 ? Number(maxBytes) : policy.maxBytes, policy.maxBytes)
  if (!file || typeof file !== 'object') {
    rejectDocumentUpload('Select a document to upload.', 'document_file_required', { surface, transactionId, listingId })
  }

  const safeName = sanitizeDocumentFileName(file.name)
  const extension = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : ''
  const acceptedMimeTypes = DOCUMENT_UPLOAD_FILE_TYPES.get(extension)
  if (!acceptedMimeTypes || !policy.extensions.includes(extension)) {
    rejectDocumentUpload(
      `Unsupported file type. Upload ${policy.formats}.`,
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
  if (!Number.isSafeInteger(size) || size <= 0) {
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
