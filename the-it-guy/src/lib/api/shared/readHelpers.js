// Shared read primitives retain the existing singleton and compatibility rules.
import { supabase } from '../../supabaseClient'

export function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY to .env.')
  }

  return supabase
}

export function isMissingTableError(error, tableName) {
  if (!error) {
    return false
  }

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  if (code && !['42P01', 'PGRST205', 'NOT_FOUND'].includes(code)) return false
  if (message.includes('permission denied')) {
    return false
  }
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'NOT_FOUND' ||
    status === 404 ||
    message.includes('relation does not exist') ||
    (message.includes('schema cache') && message.includes(String(tableName || '').toLowerCase()) && /\b(table|relation)\b/.test(message)) ||
    message.includes(`could not find the table '${String(tableName || '').toLowerCase()}'`) ||
    message.includes(`could not find the '${String(tableName || '').toLowerCase()}' table`)
  )
}

export function isMissingColumnError(error, columnName) {
  if (!error) {
    return false
  }

  const status = Number(error.status || error.statusCode || 0)
  const code = String(error.code || '').toUpperCase()
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  const hint = String(error.hint || '').toLowerCase()
  const normalizedColumnName = String(columnName || '')
    .trim()
    .toLowerCase()
  if (message.includes('permission denied')) {
    return false
  }
  const missingColumnByCode = code === '42703' || code === 'PGRST204' || code === 'PGRST116'
  const hasNamedColumnMatch = normalizedColumnName
    ? message.includes(normalizedColumnName) ||
      details.includes(normalizedColumnName) ||
      hint.includes(normalizedColumnName)
    : true
  if (missingColumnByCode) {
    return hasNamedColumnMatch
  }
  if (status === 400 && message.includes('column') && message.includes('does not exist')) {
    return hasNamedColumnMatch
  }
  return normalizedColumnName
    ? message.includes('column') && message.includes(normalizedColumnName)
    : message.includes('column')
}

export function isMissingSchemaError(error) {
  if (!error) {
    return false
  }

  return ['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202'].includes(error.code)
}

export function isPermissionDeniedError(error) {
  if (!error) {
    return false
  }

  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return (
    error.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    details.includes('permission denied') ||
    details.includes('row-level security')
  )
}

export function normalizeTextValue(value) {
  const text = String(value || '').trim()
  return text
}

export function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return null
  }

  return parsed
}
