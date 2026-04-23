import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

function normalizeConfigValue(value) {
  return String(value || '').trim()
}

function parseBucketCandidates(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeConfigValue(item))
    .filter(Boolean)
}

function isJwtLikeKey(value = '') {
  const normalized = normalizeConfigValue(value)
  return normalized.startsWith('eyJ') && normalized.split('.').length === 3
}

function isPublishableApiKey(value = '') {
  return normalizeConfigValue(value).startsWith('sb_publishable_')
}

function decodeJwtPayload(token = '') {
  try {
    const [, payload = ''] = String(token).split('.')
    if (!payload) {
      return null
    }
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padLength = (4 - (base64.length % 4)) % 4
    const padded = `${base64}${'='.repeat(padLength)}`
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return JSON.parse(window.atob(padded))
    }
    return null
  } catch {
    return null
  }
}

function resolveSupabaseFrontendKey() {
  const anonCandidate = normalizeConfigValue(import.meta.env.VITE_SUPABASE_ANON_KEY)
  const legacyCandidate = normalizeConfigValue(import.meta.env.VITE_SUPABASE_KEY)
  const selectedCandidate = anonCandidate || legacyCandidate

  if (!selectedCandidate) {
    return ''
  }

  if (isPublishableApiKey(selectedCandidate)) {
    console.error(
      '[supabase] Unsupported key type in frontend config. Use VITE_SUPABASE_ANON_KEY (JWT anon key), not sb_publishable_*.',
    )
    return ''
  }

  if (!isJwtLikeKey(selectedCandidate)) {
    console.error(
      '[supabase] Invalid frontend key format. Expected JWT anon key in VITE_SUPABASE_ANON_KEY (or legacy VITE_SUPABASE_KEY).',
    )
    return ''
  }

  const payload = decodeJwtPayload(selectedCandidate)
  const role = String(payload?.role || '').trim().toLowerCase()
  if (role === 'service_role') {
    console.error('[supabase] Refusing to use service_role key in frontend runtime.')
    return ''
  }

  return selectedCandidate
}

const supabaseKey = resolveSupabaseFrontendKey()

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

async function invokeEdgeFunctionWithAnonAuth(functionName, body, headers = {}) {
  if (!isSupabaseConfigured) {
    return {
      data: null,
      error: { message: 'Supabase is not configured.' },
    }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const fallbackMessage = `Edge function ${functionName} failed with status ${response.status}.`
    return {
      data: null,
      error: {
        code: String(payload?.code || response.status || ''),
        message: String(payload?.error || payload?.message || fallbackMessage),
        details: payload?.details ?? null,
        hint: payload?.hint ?? null,
        status: response.status,
      },
    }
  }

  return {
    data: payload,
    error: null,
  }
}

export async function invokeEdgeFunction(functionName, { body, headers = {}, client = supabase } = {}) {
  if (!client) {
    return {
      data: null,
      error: { message: 'Supabase client is not configured.' },
    }
  }

  const primaryResult = await client.functions.invoke(functionName, {
    body,
    headers,
  })

  if (!primaryResult.error) {
    return primaryResult
  }

  if (!isUnsupportedJwtAlgorithmError(primaryResult.error)) {
    return primaryResult
  }

  return invokeEdgeFunctionWithAnonAuth(functionName, body, headers)
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

const configuredDocumentsBuckets = [
  ...parseBucketCandidates(import.meta.env.VITE_SUPABASE_DOCUMENTS_BUCKET),
  ...parseBucketCandidates(import.meta.env.VITE_DOCUMENTS_BUCKET),
  ...parseBucketCandidates(import.meta.env.VITE_SUPABASE_STORAGE_BUCKET),
]

export const DOCUMENTS_BUCKET = configuredDocumentsBuckets[0] || 'documents'

export const DOCUMENTS_BUCKET_CANDIDATES = Array.from(
  new Set([DOCUMENTS_BUCKET, ...configuredDocumentsBuckets, 'documents'].filter(Boolean)),
)
