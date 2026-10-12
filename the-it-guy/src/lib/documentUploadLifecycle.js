// Shared, presentation-neutral contract for every document upload surface.
// A caller may show these events as a spinner, progress copy, or an audit log.
// `linked` is deliberately separate from `complete`: older upload paths can
// report durable storage first while a later projection links the document to a
// requirement or another workspace.
export const DOCUMENT_UPLOAD_STAGES = Object.freeze({
  preparing: 'preparing',
  matching: 'matching',
  uploading: 'uploading',
  saving: 'saving',
  linked: 'linked',
  complete: 'complete',
  failed: 'failed',
})

const STAGE_MESSAGES = Object.freeze({
  [DOCUMENT_UPLOAD_STAGES.preparing]: 'Checking the document and preparing a secure upload…',
  [DOCUMENT_UPLOAD_STAGES.matching]: 'Matching the document to its record…',
  [DOCUMENT_UPLOAD_STAGES.uploading]: 'Uploading the file to secure storage…',
  [DOCUMENT_UPLOAD_STAGES.saving]: 'Saving the document record…',
  [DOCUMENT_UPLOAD_STAGES.linked]: 'Linking the document to its workflow…',
  [DOCUMENT_UPLOAD_STAGES.complete]: 'Uploaded',
  [DOCUMENT_UPLOAD_STAGES.failed]: 'The document could not be uploaded. Please try again.',
})

const ACTIVE_STAGES = new Set([
  DOCUMENT_UPLOAD_STAGES.preparing,
  DOCUMENT_UPLOAD_STAGES.matching,
  DOCUMENT_UPLOAD_STAGES.uploading,
  DOCUMENT_UPLOAD_STAGES.saving,
  DOCUMENT_UPLOAD_STAGES.linked,
])

export function isDocumentUploadStage(value) {
  return Object.values(DOCUMENT_UPLOAD_STAGES).includes(String(value || '').trim())
}

export function createDocumentUploadProgress(stage, message = '', extra = {}) {
  const normalizedStage = isDocumentUploadStage(stage)
    ? String(stage).trim()
    : DOCUMENT_UPLOAD_STAGES.failed
  return {
    stage: normalizedStage,
    message: String(message || '').trim() || STAGE_MESSAGES[normalizedStage],
    busy: ACTIVE_STAGES.has(normalizedStage),
    terminal: [DOCUMENT_UPLOAD_STAGES.complete, DOCUMENT_UPLOAD_STAGES.failed].includes(normalizedStage),
    ...extra,
  }
}

export function createDocumentUploadProgressReporter(onProgress = null) {
  return (stage, message = '', extra = {}) => {
    const event = createDocumentUploadProgress(stage, message, extra)
    // Presentation must never turn an accepted save into an upload failure.
    try { if (typeof onProgress === 'function') onProgress(event) } catch { /* Keep the saved result. */ }
    return event
  }
}

export const DOCUMENT_UPLOAD_TIMEOUTS = Object.freeze({ preparing: 15000, uploading: 120000, saving: 30000, recovery: 10000, followUp: 10000 })

export async function withDocumentUploadDeadline(operation, { timeoutMs = DOCUMENT_UPLOAD_TIMEOUTS.preparing, message = 'This step took too long. Please retry.', code = 'document_upload_timeout' } = {}) {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => typeof operation === 'function' ? operation(controller.signal) : operation),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error(message), { code })) }, timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

export async function runDocumentUploadWithLifecycle({ upload, onProgress = null } = {}) {
  if (typeof upload !== 'function') throw new Error('A document upload operation is required.')
  const report = createDocumentUploadProgressReporter(onProgress)
  try {
    const result = await upload({ onProgress: report })
    report(DOCUMENT_UPLOAD_STAGES.complete, result?.persistenceWarnings?.[0] || 'Document saved successfully.', {
      documentId: result?.id || null,
      postUploadProcessing: result?.postUploadProcessing || null,
      warnings: result?.persistenceWarnings || result?.persistence?.warnings || [],
    })
    return result
  } catch (error) {
    report(DOCUMENT_UPLOAD_STAGES.failed, error?.message || '', { error })
    throw error
  }
}

export async function refreshAfterSavedDocumentUpload(result, refresh, onWarning = null) {
  const warnings = [...(result?.persistenceWarnings || result?.persistence?.warnings || [])]
  try { await refresh?.() } catch {
    warnings.push('Document saved, but the list could not be refreshed. Reopen the record to see it; the file does not need to be uploaded again.')
  }
  if (warnings.length) onWarning?.(warnings.join(' '))
  return result
}
