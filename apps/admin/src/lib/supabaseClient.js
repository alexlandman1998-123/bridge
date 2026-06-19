import { createClient } from '@supabase/supabase-js'

const env = import.meta.env || {}

function normalize(value = '') {
  return String(value || '').trim()
}

function isPlaceholder(value = '') {
  const normalized = normalize(value).toLowerCase()
  return (
    normalized.includes('your-project-ref') ||
    normalized.includes('your-anon-key') ||
    normalized.includes('your_supabase') ||
    normalized.includes('changeme')
  )
}

function isJwtLikeKey(value = '') {
  const normalized = normalize(value)
  return normalized.startsWith('eyJ') && normalized.split('.').length === 3
}

function decodeJwtPayload(token = '') {
  try {
    const [, payload = ''] = String(token).split('.')
    if (!payload || typeof window === 'undefined' || typeof window.atob !== 'function') return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padLength = (4 - (base64.length % 4)) % 4
    return JSON.parse(window.atob(`${base64}${'='.repeat(padLength)}`))
  } catch {
    return null
  }
}

function resolveFrontendKey() {
  const key = normalize(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY)
  if (!key) return ''
  if (key.startsWith('sb_publishable_')) return ''
  if (!isJwtLikeKey(key)) return ''

  const payload = decodeJwtPayload(key)
  if (String(payload?.role || '').toLowerCase() === 'service_role') return ''
  return key
}

const supabaseUrl = normalize(env.VITE_SUPABASE_URL)
const supabaseKey = resolveFrontendKey()

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !isPlaceholder(supabaseUrl) &&
    !isPlaceholder(supabaseKey) &&
    supabaseUrl.startsWith('https://'),
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export function getSupabaseConfigStatus() {
  if (isSupabaseConfigured) return { ok: true, message: 'Connected' }
  if (!supabaseUrl || !supabaseKey) return { ok: false, message: 'Missing Supabase environment variables' }
  return { ok: false, message: 'Invalid Supabase frontend configuration' }
}
