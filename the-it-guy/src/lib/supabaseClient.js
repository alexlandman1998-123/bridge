import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

function isPlaceholder(value = '') {
  const normalized = String(value).toLowerCase()
  return (
    normalized.includes('your-project-ref') ||
    normalized.includes('your-anon-key') ||
    normalized.includes('your_supabase') ||
    normalized.includes('changeme')
  )
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !isPlaceholder(supabaseUrl) &&
    !isPlaceholder(supabaseKey) &&
    String(supabaseUrl).startsWith('https://'),
)

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null

function getSupabaseProjectRef() {
  try {
    const hostname = new URL(String(supabaseUrl || '')).hostname
    const [projectRef] = hostname.split('.')
    return projectRef || ''
  } catch {
    return ''
  }
}

export function isUnsupportedJwtAlgorithmError(error) {
  const code = String(error?.code || '').trim()
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  return (
    code === 'UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM' ||
    message.includes('unsupported jwt algorithm') ||
    details.includes('unsupported jwt algorithm') ||
    message.includes('unsupported token algorithm')
  )
}

export async function clearSupabaseLocalAuthState() {
  if (!supabase) {
    return
  }

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Best-effort cleanup continues via storage key removal.
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  const projectRef = getSupabaseProjectRef()
  const prefixes = projectRef
    ? [`sb-${projectRef}-`, 'supabase.auth.']
    : ['sb-', 'supabase.auth.']

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (!key) {
      continue
    }
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      window.localStorage.removeItem(key)
    }
  }
}

export function createScopedSupabaseClient(headers = {}) {
  if (!isSupabaseConfigured) {
    return null
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers,
    },
  })
}

export const DOCUMENTS_BUCKET = 'documents'
