// Shared listing read primitives preserve the existing service's compatibility rules.
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

export function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

export function normalizeText(value) {
  return String(value || '').trim()
}

export function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

export function normalizeUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

export function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  const status = Number(String(error.status || error.statusCode || 0))
  const text = String(message).toLowerCase()
  const tableNameHint = normalizeText(tableName).toLowerCase()
  const mentionsTable = Boolean(tableNameHint && text.includes(tableNameHint))
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    code === 'not_found' ||
    status === 404 ||
    text.includes('schema cache') ||
    text.includes('could not find the table') ||
    text.includes('relation does not exist') ||
    (mentionsTable && (
      text.includes('does not exist') ||
      text.includes('not found') ||
      text.includes('could not find') ||
      text.includes('schema cache')
    ))
  )
}

export function isMissingSchemaError(error) {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const text = [
    error.message,
    error.details,
    error.hint,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  return (
    code === 'pgrst200' ||
    code === 'pgrst204' ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('does not exist')
  )
}

export function isPermissionDeniedError(error) {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const status = Number(String(error.status || error.statusCode || 0))
  const text = [
    error.message,
    error.details,
    error.hint,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    text.includes('permission denied') ||
    text.includes('row-level security')
  )
}
