function normalizeText(value) {
  return String(value || '').trim()
}

function normalizedFailureCode(error) {
  const code = normalizeText(error?.code).toUpperCase()
  if (code) return code
  const message = normalizeText(error?.message || error).toLowerCase()
  if (message.includes('taking too long') || message.includes('timed out') || message.includes('timeout')) return 'GENERATION_TIMEOUT'
  return ''
}

function versionsFromStatus(status) {
  const resolved = status?.resolved || status
  if (Array.isArray(resolved)) return resolved
  if (Array.isArray(resolved?.versions)) return resolved.versions
  return []
}

function isGeneratedVersion(version) {
  return normalizeText(version?.render_status).toLowerCase() === 'generated'
}

export function isAmbiguousLegalDocumentGenerationFailure(error = null) {
  return ['GENERATION_ALREADY_IN_PROGRESS', 'GENERATION_TIMEOUT'].includes(normalizedFailureCode(error))
}

export function captureLegalDocumentGenerationBaseline(statusOrVersions = null) {
  const versions = versionsFromStatus(statusOrVersions)
  return {
    generatedVersionIds: versions.filter(isGeneratedVersion).map((version) => normalizeText(version?.id)).filter(Boolean),
    maxVersionNumber: versions.reduce((highest, version) => Math.max(highest, Number(version?.version_number || 0)), 0),
  }
}

export function findReconciledLegalDocumentVersion(statusOrVersions = null, baseline = {}) {
  const knownIds = new Set(Array.isArray(baseline?.generatedVersionIds) ? baseline.generatedVersionIds : [])
  const baselineVersion = Number(baseline?.maxVersionNumber || 0)
  return versionsFromStatus(statusOrVersions).find((version) => {
    if (!isGeneratedVersion(version)) return false
    const id = normalizeText(version?.id)
    const versionNumber = Number(version?.version_number || 0)
    return (id && !knownIds.has(id)) || versionNumber > baselineVersion
  }) || null
}

export async function reconcileLegalDocumentGenerationFailure({
  error = null,
  baseline = {},
  loadStatus,
  delaysMs = [0, 600, 1400, 2600],
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  if (!isAmbiguousLegalDocumentGenerationFailure(error) || typeof loadStatus !== 'function') {
    return { attempted: false, confirmed: false, status: null, version: null, checks: 0 }
  }
  let latestStatus = null
  let checks = 0
  for (const delayMs of delaysMs) {
    if (Number(delayMs) > 0) await wait(Number(delayMs))
    try {
      latestStatus = await loadStatus()
      checks += 1
      const version = findReconciledLegalDocumentVersion(latestStatus, baseline)
      if (version) return { attempted: true, confirmed: true, status: latestStatus?.resolved || latestStatus, version, checks }
    } catch {
      checks += 1
    }
  }
  return { attempted: true, confirmed: false, status: latestStatus?.resolved || latestStatus, version: null, checks }
}
