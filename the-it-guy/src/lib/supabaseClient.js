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
