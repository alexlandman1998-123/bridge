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
