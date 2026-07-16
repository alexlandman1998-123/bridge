const REQUIRED_FOUNDATION_TABLES = Object.freeze([
  'document_definitions',
  'document_requirement_rules',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function rowCount(result = {}) {
  if (Array.isArray(result.rows)) return result.rows.length
  if (Number.isFinite(Number(result.fetchedRows))) return Number(result.fetchedRows)
  return 0
}

function guardError(code, detail) {
  const error = new Error(`${code}: ${detail}`)
  error.code = code
  return error
}

export function assertCanonicalVerificationDataSource({
  snapshotAvailable = false,
  snapshotError = null,
  tables = null,
  scoped = false,
} = {}) {
  if (!snapshotAvailable) {
    throw guardError(
      'CANONICAL_VERIFICATION_SNAPSHOT_UNAVAILABLE',
      normalizeText(snapshotError) || 'The canonical staging snapshot RPC did not return a readable snapshot.',
    )
  }
  if (!tables || typeof tables !== 'object') {
    throw guardError('CANONICAL_VERIFICATION_TABLES_MISSING', 'The staging snapshot did not contain table results.')
  }

  const unreadableTables = Object.entries(tables)
    .filter(([, result]) => result?.available === false || normalizeText(result?.error))
    .map(([table, result]) => `${table}: ${normalizeText(result?.error) || 'unavailable'}`)
  if (unreadableTables.length) {
    throw guardError(
      'CANONICAL_VERIFICATION_TABLE_READ_FAILED',
      `Required staging data could not be read (${unreadableTables.join('; ')}).`,
    )
  }

  const emptyFoundationTables = REQUIRED_FOUNDATION_TABLES
    .filter((table) => !tables[table] || rowCount(tables[table]) === 0)
  if (emptyFoundationTables.length) {
    throw guardError(
      'CANONICAL_VERIFICATION_FOUNDATION_EMPTY',
      `Unexpected zero-row canonical foundation tables: ${emptyFoundationTables.join(', ')}.`,
    )
  }

  if (!scoped && (!tables.document_requirement_instances || rowCount(tables.document_requirement_instances) === 0)) {
    throw guardError(
      'CANONICAL_VERIFICATION_INSTANCES_EMPTY',
      'The unscoped staging snapshot unexpectedly returned zero canonical requirement instances.',
    )
  }

  return {
    ok: true,
    dataSource: 'canonical_document_verification_snapshot',
    foundationRowCounts: Object.fromEntries(REQUIRED_FOUNDATION_TABLES.map((table) => [table, rowCount(tables[table])])),
  }
}
