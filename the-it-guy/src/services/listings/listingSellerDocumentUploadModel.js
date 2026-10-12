function text(value) {
  return String(value ?? '').trim()
}

export function getSellerDocumentUploadKey(document = {}) {
  return text(document.key || document.id || document.requirementId || document.requirement_id || document.label || document.documentName)
}

function isComplete(document = {}) {
  const status = text(document.status || document.statusKey).toLowerCase().replace(/[\s-]+/g, '_')
  return Boolean(document.uploaded || document.complete || document.completed || ['uploaded', 'complete', 'completed', 'approved', 'verified', 'signed'].includes(status))
}

export function buildSellerDocumentUploadQueue(documents = [], progressByKey = {}) {
  const rows = (Array.isArray(documents) ? documents : [])
    .filter((document) => document?.applicable !== false)
    .map((document) => {
      const key = getSellerDocumentUploadKey(document)
      const progress = progressByKey?.[key] || null
      return {
        ...document,
        uploadKey: key,
        complete: isComplete(document) || progress?.status === 'complete',
        uploadStatus: progress?.status || 'idle',
        uploadFileName: progress?.fileName || '',
        uploadError: progress?.error || '',
      }
    })
  const required = rows.filter((row) => row.required !== false)
  const requiredComplete = required.filter((row) => row.complete).length
  const uploading = rows.filter((row) => row.uploadStatus === 'uploading').length
  const weightedComplete = requiredComplete + required.filter((row) => !row.complete && row.uploadStatus === 'uploading').length * 0.5
  const outstanding = rows
    .filter((row) => !row.complete && row.canUpload !== false)
    .sort((left, right) => Number(right.required !== false) - Number(left.required !== false) || text(left.label).localeCompare(text(right.label)))
  return {
    rows,
    outstanding,
    requiredTotal: required.length,
    requiredComplete,
    outstandingRequired: required.length - requiredComplete,
    uploading,
    percent: required.length ? Math.round((weightedComplete / required.length) * 100) : 100,
    complete: required.length === requiredComplete,
  }
}

// Receipt counts describe saved files, independently of checklist approval.
// The same upload may appear in several categories or lead projections.
export function buildSellerDocumentUploadEvidenceSummary(rows = []) {
  const files = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const storedRecord = row.linkedDocument || row.originalDocument || row.original?.document || row.upload
    const file = storedRecord || row
    const path = text(file.storage_path || file.storagePath || file.filePath || row.storage_path || row.storagePath || row.filePath)
    const id = text(file.id)
    if (row.isGeneratedDraft || file.isGeneratedDraft || file.is_generated_draft) continue
    if (!path && (!storedRecord || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))) continue
    const status = text(file.status || row.status).toLowerCase().replace(/[ -]+/g, '_')
    const approved = ['approved', 'completed', 'verified', 'signed'].includes(status)
    const awaitingReview = ['uploaded', 'under_review', 'awaiting_agent_review'].includes(status)
    if (!path && !approved && !awaitingReview) continue
    files.set(path || id, { approved, awaitingReview })
  }
  return {
    saved: files.size,
    approved: [...files.values()].filter(file => file.approved).length,
    awaitingReview: [...files.values()].filter(file => file.awaitingReview).length,
  }
}
