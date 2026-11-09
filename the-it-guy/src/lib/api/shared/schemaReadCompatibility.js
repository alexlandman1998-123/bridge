// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { isMissingTableError, isMissingColumnError } from './readHelpers.js'

export const knownMissingOptionalRelations = new Set()

export function isOptionalRelationKnownMissing(relationName) {
  return knownMissingOptionalRelations.has(String(relationName || '').trim().toLowerCase())
}

export function rememberMissingOptionalRelation(relationName, error) {
  const normalizedRelationName = String(relationName || '').trim().toLowerCase()
  if (!normalizedRelationName || !isMissingTableError(error, normalizedRelationName)) return false
  knownMissingOptionalRelations.add(normalizedRelationName)
  return true
}

export function getKnownMissingOptionalRelations() {
  return [...knownMissingOptionalRelations]
}

export function resetKnownMissingOptionalRelations() {
  knownMissingOptionalRelations.clear()
}

export const knownMissingSchemaColumns = new Set()

export function registerKnownMissingColumns(error, columnNames = []) {
  if (!error) {
    return false
  }

  let registered = false
  const message = String(error.message || '')
  const details = String(error.details || '')
  const hint = String(error.hint || '')
  const parseSources = [message, details, hint]
  const regexes = [
    /column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+does not exist/gi,
    /could not find the ['"]([a-zA-Z0-9_]+)['"] column/gi,
    /['"]([a-zA-Z0-9_]+)['"]\s+column/gi,
  ]

  for (const source of parseSources) {
    for (const pattern of regexes) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const normalized = String(match[1] || '')
          .trim()
          .toLowerCase()
        if (normalized && !knownMissingSchemaColumns.has(normalized)) {
          knownMissingSchemaColumns.add(normalized)
          registered = true
        }
        match = pattern.exec(source)
      }
    }
  }

  for (const columnName of columnNames) {
    const normalized = String(columnName || '')
      .trim()
      .toLowerCase()
    if (!normalized) {
      continue
    }
    if (isMissingColumnError(error, normalized)) {
      knownMissingSchemaColumns.add(normalized)
      registered = true
    }
  }

  return registered
}

export function selectWithoutKnownMissingColumns(selectClause) {
  const clause = String(selectClause || '').trim()
  if (!clause || !knownMissingSchemaColumns.size) {
    return clause
  }

  const fields = clause
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean)

  const filtered = fields.filter((field) => {
    const normalizedField = field
      .replace(/\s+as\s+.+$/i, '')
      .trim()
      .toLowerCase()
    return !knownMissingSchemaColumns.has(normalizedField)
  })

  return (filtered.length ? filtered : fields).join(', ')
}
