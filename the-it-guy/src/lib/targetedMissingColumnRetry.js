const MISSING_COLUMN_ERROR_CODES = new Set(['42703', 'PGRST204'])

const MISSING_COLUMN_PATTERNS = [
  /could not find the ['"]([a-zA-Z_][a-zA-Z0-9_]*)['"] column/gi,
  /column\s+['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+of\s+relation\s+['"]?[a-zA-Z_][a-zA-Z0-9_]*['"]?\s+does not exist/gi,
  /column\s+(?:['"]?[a-zA-Z_][a-zA-Z0-9_]*['"]?\.)?['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s+does not exist/gi,
]

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function isMissingColumnResponse(error) {
  if (!error) return false

  const code = String(error.code || '').trim().toUpperCase()
  const status = Number(error.status || error.statusCode || 0)
  const message = String(error.message || '').toLowerCase()
  if (message.includes('permission denied')) return false

  return (
    MISSING_COLUMN_ERROR_CODES.has(code) ||
    (status === 400 && message.includes('column') && message.includes('does not exist'))
  )
}

export function extractReportedMissingPayloadColumns(error, payload = {}) {
  if (!isMissingColumnResponse(error) || !payload || typeof payload !== 'object') return []

  const payloadKeysByNormalizedName = new Map(
    Object.keys(payload).map((key) => [normalizeKey(key), key]),
  )
  if (!payloadKeysByNormalizedName.size) return []

  const reportedColumns = []
  const seen = new Set()
  const sources = [String(error.message || ''), String(error.details || '')]

  for (const source of sources) {
    for (const pattern of MISSING_COLUMN_PATTERNS) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const normalizedColumn = normalizeKey(match[1])
        const payloadKey = payloadKeysByNormalizedName.get(normalizedColumn)
        if (payloadKey && !seen.has(payloadKey)) {
          seen.add(payloadKey)
          reportedColumns.push(payloadKey)
        }
        match = pattern.exec(source)
      }
    }
  }

  return reportedColumns
}

export async function retryMutationWithoutReportedMissingColumns({
  initialResult,
  payload,
  execute,
  maxAttempts = 8,
  canRemoveColumn = () => true,
  onRemoveColumns = null,
}) {
  if (typeof execute !== 'function') {
    throw new TypeError('execute must be a function')
  }

  let result = initialResult
  const retryPayload = { ...(payload || {}) }
  const removedColumns = []
  const attemptLimit = Math.min(
    Math.max(Number.isFinite(Number(maxAttempts)) ? Math.floor(Number(maxAttempts)) : 0, 0),
    Object.keys(retryPayload).length,
  )
  let attempts = 0

  while (result?.error && attempts < attemptLimit) {
    const reportedColumns = extractReportedMissingPayloadColumns(result.error, retryPayload)
    const removableColumns = reportedColumns.filter((column) => canRemoveColumn(column, result.error))
    if (!removableColumns.length) break

    const currentError = result.error
    for (const column of removableColumns) {
      delete retryPayload[column]
      removedColumns.push(column)
    }
    if (typeof onRemoveColumns === 'function') {
      onRemoveColumns(removableColumns, currentError)
    }

    result = await execute({ ...retryPayload })
    attempts += 1
  }

  return {
    result,
    payload: retryPayload,
    removedColumns,
    attempts,
  }
}
