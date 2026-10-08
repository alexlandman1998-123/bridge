import { reportDocumentUploadTelemetry } from './documentUploadObservability.js'

// Authenticated workspace access only. Token portals must keep their own
// server-side document resolver (including final-artifact publication checks).
async function resolveFreshDocumentSignedUrl({ client, filePath, fileBucket = '', candidateBuckets = [], expiresInSeconds = 1800, download = false, filename = 'document', isBucketMissing = () => false }) {
  const path = String(filePath || '').trim()
  if (!path) throw new Error('This document does not have a storage path.')
  const bucket = String(fileBucket || '').trim()
  // A persisted bucket identifies the object. Never look for a different
  // tenant's same-named object after an authorization or missing-object error.
  const buckets = bucket ? [bucket] : [...new Set(candidateBuckets.filter(Boolean))]
  let lastError
  for (const name of buckets) {
    const { data, error } = await client.storage.from(name).createSignedUrl(path, expiresInSeconds, download ? { download: filename || 'document' } : undefined)
    if (!error && data?.signedUrl) return data.signedUrl
    lastError = error
    if (bucket || !isBucketMissing(error)) break
  }
  const error = new Error(lastError?.message || 'Unable to open this document right now.')
  error.code = lastError?.code || 'document_access_url_unavailable'
  error.status = lastError?.status || lastError?.statusCode || null
  throw error
}

export function documentStorageReference(document = {}) {
  document = document || {}
  return {
    filePath: document.file_path || document.filePath || document.storage_path || '',
    fileBucket: document.file_bucket || document.fileBucket || document.storage_bucket || document.bucket_key || '',
    filename: document.filename || document.name || 'document',
  }
}

export async function createFreshDocumentSignedUrl(options = {}) {
  try { return await resolveFreshDocumentSignedUrl(options) }
  catch (error) {
    reportDocumentUploadTelemetry({ surface: options.monitorSurface || 'unknown', stage: 'access', outcome: 'failed', error, attemptId: globalThis.crypto?.randomUUID?.() })
    throw error
  }
}
