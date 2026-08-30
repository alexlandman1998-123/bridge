import { createClient } from '@supabase/supabase-js'

const viteEnv = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : {}
const processEnv = typeof globalThis !== 'undefined' && globalThis?.process?.env ? globalThis.process.env : {}
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || processEnv.VITE_SUPABASE_URL || ''

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

function isSecretApiKey(value = '') {
  return normalizeConfigValue(value).startsWith('sb_secret_')
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
  const anonCandidate = normalizeConfigValue(viteEnv.VITE_SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY)
  const legacyCandidate = normalizeConfigValue(viteEnv.VITE_SUPABASE_KEY || processEnv.VITE_SUPABASE_KEY)
  const selectedCandidate = anonCandidate || legacyCandidate

  if (!selectedCandidate) {
    return ''
  }

  if (isPublishableApiKey(selectedCandidate)) {
    return selectedCandidate
  }

  if (isSecretApiKey(selectedCandidate)) {
    console.error('[supabase] Refusing to use sb_secret key in frontend runtime.')
    return ''
  }

  if (!isJwtLikeKey(selectedCandidate)) {
    console.error(
      '[supabase] Invalid frontend key format. Expected a publishable key or JWT anon key in VITE_SUPABASE_ANON_KEY (or legacy VITE_SUPABASE_KEY).',
    )
    return ''
  }

  const payload = decodeJwtPayload(selectedCandidate)
  const role = String(payload?.role || '')
    .trim()
    .toLowerCase()
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

const AUTH_READ_CACHE_TTL_MS = 750
const AUTH_READ_LOCK_RETRY_DELAY_MS = 75
const AUTH_READ_LOCK_RETRY_ATTEMPTS = 2
const AUTH_READ_OBSERVABILITY_EVENT = 'arch9:auth-read-observability'
const AUTH_READ_SLOW_THRESHOLD_MS = 1000
const AUTH_READ_OBSERVABILITY_LOG_COOLDOWN_MS = 30_000
const AUTH_MUTATION_METHODS = [
  'exchangeCodeForSession',
  'refreshSession',
  'setSession',
  'signInAnonymously',
  'signInWithIdToken',
  'signInWithOAuth',
  'signInWithOtp',
  'signInWithPassword',
  'signInWithSSO',
  'signOut',
  'signUp',
  'updateUser',
  'verifyOtp',
]
const authReadObservabilityWarnedAt = new Map()

function isZeroArgumentAuthRead(args = []) {
  return !Array.isArray(args) || args.length === 0
}

function isSuccessfulAuthRead(result) {
  return result && !result.error
}

function isSupabaseAuthLockRecoveryError(error) {
  const name = String(error?.name || '').toLowerCase()
  const message = String(error?.message || error || '').toLowerCase()
  return (
    (name === 'aborterror' && message.includes('lock broken by another request')) ||
    message.includes("lock broken by another request with the 'steal' option") ||
    message.includes('lock broken by another request with the "steal" option')
  )
}

function getAuthReadNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function delayAuthReadRetry(delayMs = AUTH_READ_LOCK_RETRY_DELAY_MS) {
  return new Promise((resolve) => {
    const timer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout
      : setTimeout
    timer(resolve, delayMs)
  })
}

function emitAuthReadObservability(detail = {}) {
  const elapsedMs = Math.max(0, Math.round(Number(detail.elapsedMs || 0)))
  const payload = {
    contract: 'arch9-supabase-auth-read-observability-v1',
    methodName: String(detail.methodName || '').trim(),
    source: String(detail.source || '').trim(),
    elapsedMs,
    cacheable: detail.cacheable === true,
    success: detail.success !== false,
    errorMessage: String(detail.errorMessage || '').trim(),
    joinedCount: Math.max(0, Math.round(Number(detail.joinedCount || 0))),
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(AUTH_READ_OBSERVABILITY_EVENT, { detail: payload }))
  }
  if (!payload.success || elapsedMs >= AUTH_READ_SLOW_THRESHOLD_MS) {
    const warnKey = [
      payload.methodName,
      payload.source,
      payload.success ? 'slow' : 'failed',
      payload.success ? '' : payload.errorMessage,
    ].join(':')
    const now = Date.now()
    const lastWarnedAt = Number(authReadObservabilityWarnedAt.get(warnKey) || 0)
    if (!lastWarnedAt || now - lastWarnedAt >= AUTH_READ_OBSERVABILITY_LOG_COOLDOWN_MS) {
      authReadObservabilityWarnedAt.set(warnKey, now)
      console.warn('[AUTH] auth read observability', payload)
    }
  }
}

function createSingleFlightAuthRead(auth, methodName, {
  cacheTtlMs = AUTH_READ_CACHE_TTL_MS,
  clearers = [],
} = {}) {
  const originalMethod = auth?.[methodName]
  if (typeof originalMethod !== 'function') return null

  let inFlight = null
  let inFlightJoinCount = 0
  let cachedResult = null
  let cachedAt = 0
  let cacheGeneration = 0

  const invalidate = () => {
    cacheGeneration += 1
    cachedResult = null
    cachedAt = 0
  }
  clearers.push(invalidate)

  const wrappedMethod = async (...args) => {
    const cacheable = isZeroArgumentAuthRead(args)
    const now = Date.now()

    if (cacheable && cachedResult && now - cachedAt < cacheTtlMs) {
      return cachedResult
    }

    if (cacheable && inFlight) {
      inFlightJoinCount += 1
      return inFlight
    }

    const startedAt = getAuthReadNow()
    const requestGeneration = cacheGeneration
    if (cacheable) inFlightJoinCount = 0
    const runAuthReadWithLockRecovery = async () => {
      let attempts = 0
      while (true) {
        try {
          const result = await originalMethod.apply(auth, args)
          if (
            result?.error &&
            isSupabaseAuthLockRecoveryError(result.error) &&
            attempts < AUTH_READ_LOCK_RETRY_ATTEMPTS
          ) {
            attempts += 1
            emitAuthReadObservability({
              methodName,
              source: 'auth_lock_retry',
              elapsedMs: getAuthReadNow() - startedAt,
              cacheable,
              success: false,
              errorMessage: result.error?.message || 'Supabase auth lock was interrupted.',
            })
            await delayAuthReadRetry()
            continue
          }
          return result
        } catch (error) {
          if (!isSupabaseAuthLockRecoveryError(error) || attempts >= AUTH_READ_LOCK_RETRY_ATTEMPTS) {
            throw error
          }
          attempts += 1
          emitAuthReadObservability({
            methodName,
            source: 'auth_lock_retry',
            elapsedMs: getAuthReadNow() - startedAt,
            cacheable,
            success: false,
            errorMessage: error?.message || 'Supabase auth lock was interrupted.',
          })
          await delayAuthReadRetry()
        }
      }
    }
    const request = Promise.resolve()
      .then(runAuthReadWithLockRecovery)
      .then((result) => {
        if (cacheable && requestGeneration === cacheGeneration && isSuccessfulAuthRead(result)) {
          cachedResult = result
          cachedAt = Date.now()
        }
        emitAuthReadObservability({
          methodName,
          source: cacheable ? 'network_single_flight_owner' : 'network_direct',
          elapsedMs: getAuthReadNow() - startedAt,
          cacheable,
          success: isSuccessfulAuthRead(result),
          errorMessage: result?.error?.message || '',
          joinedCount: cacheable ? inFlightJoinCount : 0,
        })
        return result
      })
      .catch((error) => {
        emitAuthReadObservability({
          methodName,
          source: cacheable ? 'network_single_flight_owner' : 'network_direct',
          elapsedMs: getAuthReadNow() - startedAt,
          cacheable,
          success: false,
          errorMessage: error?.message || 'Supabase auth read failed.',
          joinedCount: cacheable ? inFlightJoinCount : 0,
        })
        throw error
      })

    if (cacheable) {
      inFlight = request.finally(() => {
        inFlight = null
        inFlightJoinCount = 0
      })
      return inFlight
    }

    return request
  }

  auth[methodName] = wrappedMethod
  return clear
}

function installAuthReadSingleFlight(client) {
  const auth = client?.auth
  if (!auth || auth.__arch9AuthReadSingleFlightInstalled) return client

  const clearers = []
  createSingleFlightAuthRead(auth, 'getSession', { clearers })
  createSingleFlightAuthRead(auth, 'getUser', { clearers })

  const clearAuthReadCache = () => {
    clearers.forEach((clear) => clear())
  }

  if (typeof auth.onAuthStateChange === 'function') {
    const originalOnAuthStateChange = auth.onAuthStateChange.bind(auth)
    auth.onAuthStateChange = (callback) =>
      originalOnAuthStateChange((event, nextSession) => {
        // Do not clear an active read: GoTrue owns a storage lock while it is
        // running. Keeping it joinable prevents a second call from triggering
        // the orphaned-lock recovery loop. The generation still prevents stale
        // results from entering the completed-value cache.
        clearAuthReadCache()
        return callback?.(event, nextSession)
      })
  }

  AUTH_MUTATION_METHODS.forEach((methodName) => {
    if (typeof auth[methodName] !== 'function') return
    const originalMethod = auth[methodName].bind(auth)
    auth[methodName] = async (...args) => {
      clearAuthReadCache()
      try {
        return await originalMethod(...args)
      } finally {
        clearAuthReadCache()
      }
    }
  })

  Object.defineProperty(auth, '__arch9AuthReadSingleFlightInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
  })

  return client
}

export const supabase = isSupabaseConfigured ? installAuthReadSingleFlight(createClient(supabaseUrl, supabaseKey)) : null
const scopedClientCache = new Map()

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

export function isUserFromSubClaimMissingError(error) {
  const code = String(error?.code || '')
    .trim()
    .toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  return (
    message.includes('user from sub claim in jwt does not exist') ||
    details.includes('user from sub claim in jwt does not exist') ||
    (code === 'user_not_found' && message.includes('jwt'))
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
  const prefixes = projectRef ? [`sb-${projectRef}-`, 'supabase.auth.'] : ['sb-', 'supabase.auth.']

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
        code: String(payload?.errorCode || payload?.error_code || payload?.code || response.status || ''),
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

function isGenericInvokeNon2xxError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('edge function returned a non-2xx status code')
}

function isGenericInvokeTransportError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const name = String(error?.name || '').toLowerCase()
  return (
    name.includes('functionsfetcherror') ||
    message.includes('functionsfetcherror') ||
    message.includes('failed to send a request to the edge function') ||
    message.includes('failed to fetch')
  )
}

async function invokeEdgeFunctionWithAccessToken(functionName, body, accessToken, headers = {}) {
  if (!isSupabaseConfigured || !accessToken) {
    return {
      data: null,
      error: {
        message: 'Supabase is not configured or access token is missing.',
      },
    }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken}`,
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
        code: String(payload?.errorCode || payload?.error_code || payload?.code || response.status || ''),
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
  if (typeof client.functions?.invoke !== 'function') {
    return {
      data: null,
      error: { message: 'Supabase Edge Functions are not configured on this client.' },
    }
  }

  const primaryResult = await client.functions.invoke(functionName, {
    body,
    headers,
  })

  if (!primaryResult.error) {
    return primaryResult
  }

  if (isGenericInvokeNon2xxError(primaryResult.error) || isGenericInvokeTransportError(primaryResult.error)) {
    try {
      const sessionResult = await client.auth.getSession()
      const accessToken = sessionResult?.data?.session?.access_token || ''
      if (accessToken) {
        const directResult = await invokeEdgeFunctionWithAccessToken(functionName, body, accessToken, headers)
        if (directResult.error) {
          return directResult
        }
        return directResult
      }
    } catch {
      // Continue with existing fallback logic.
    }

    if (isGenericInvokeTransportError(primaryResult.error)) {
      return invokeEdgeFunctionWithAnonAuth(functionName, body, headers)
    }
  }

  if (!isUnsupportedJwtAlgorithmError(primaryResult.error)) {
    return primaryResult
  }

  return invokeEdgeFunctionWithAnonAuth(functionName, body, headers)
}

export function getEdgeFunctionInvokeError(result) {
  if (!result) return { message: 'Edge function did not return a response.' }
  const error = result.error || result.data?.error || null
  if (!error) return null
  if (typeof error === 'string') {
    return {
      message: error,
      details: result.data?.details ?? null,
      status: result.data?.status ?? null,
    }
  }
  return {
    ...error,
    message: error.message || error.error || 'Edge function request failed.',
    details: error.details ?? result.data?.details ?? null,
    status: error.status ?? result.data?.status ?? null,
  }
}

export function assertEdgeFunctionSuccess(result, fallbackMessage = 'Edge function request failed.') {
  const error = getEdgeFunctionInvokeError(result)
  if (!error) return result
  const wrapped = new Error(error.message || fallbackMessage)
  wrapped.code = error.code || ''
  wrapped.details = error.details ?? null
  wrapped.status = error.status ?? null
  throw wrapped
}

export function createScopedSupabaseClient(headers = {}) {
  if (!isSupabaseConfigured) {
    return null
  }

  const normalizedEntries = Object.entries(headers || {})
    .map(([key, value]) => [
      String(key || '')
        .trim()
        .toLowerCase(),
      String(value || '').trim(),
    ])
    .filter(([key, value]) => key && value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  const cacheKey = JSON.stringify(normalizedEntries)
  const cached = scopedClientCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const scopedClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: Object.fromEntries(normalizedEntries),
    },
  })
  scopedClientCache.set(cacheKey, scopedClient)
  return scopedClient
}

export const __supabaseClientTestUtils = Object.freeze({
  createSingleFlightAuthRead,
  isSupabaseAuthLockRecoveryError,
})

const configuredDocumentsBuckets = [
  ...parseBucketCandidates(viteEnv.VITE_SUPABASE_DOCUMENTS_BUCKET || processEnv.VITE_SUPABASE_DOCUMENTS_BUCKET),
  ...parseBucketCandidates(viteEnv.VITE_SUPABASE_DOCUMENT_BUCKET || processEnv.VITE_SUPABASE_DOCUMENT_BUCKET),
  ...parseBucketCandidates(viteEnv.VITE_DOCUMENTS_BUCKET || processEnv.VITE_DOCUMENTS_BUCKET),
  ...parseBucketCandidates(viteEnv.VITE_SUPABASE_STORAGE_BUCKET || processEnv.VITE_SUPABASE_STORAGE_BUCKET),
]

export const DOCUMENTS_BUCKET = configuredDocumentsBuckets[0] || 'documents'

export const DOCUMENTS_BUCKET_CANDIDATES = Array.from(
  new Set([DOCUMENTS_BUCKET, ...configuredDocumentsBuckets, 'documents'].filter(Boolean)),
)

const configuredLegalTemplateBuckets = [
  ...parseBucketCandidates(
    viteEnv.VITE_SUPABASE_LEGAL_TEMPLATES_BUCKET || processEnv.VITE_SUPABASE_LEGAL_TEMPLATES_BUCKET,
  ),
  ...parseBucketCandidates(viteEnv.VITE_LEGAL_TEMPLATES_BUCKET || processEnv.VITE_LEGAL_TEMPLATES_BUCKET),
]

export const LEGAL_TEMPLATES_BUCKET = configuredLegalTemplateBuckets[0] || 'legal-templates'

export const LEGAL_TEMPLATES_BUCKET_CANDIDATES = Array.from(
  new Set([LEGAL_TEMPLATES_BUCKET, ...configuredLegalTemplateBuckets, ...DOCUMENTS_BUCKET_CANDIDATES].filter(Boolean)),
)

const configuredBrandingBuckets = [
  ...parseBucketCandidates(viteEnv.VITE_SUPABASE_BRANDING_BUCKET || processEnv.VITE_SUPABASE_BRANDING_BUCKET),
  ...parseBucketCandidates(viteEnv.VITE_BRANDING_BUCKET || processEnv.VITE_BRANDING_BUCKET),
  ...parseBucketCandidates(viteEnv.VITE_SUPABASE_STORAGE_BUCKET || processEnv.VITE_SUPABASE_STORAGE_BUCKET),
]

export const BRANDING_BUCKET = configuredBrandingBuckets[0] || 'organisation-branding'

export const BRANDING_BUCKET_CANDIDATES = Array.from(
  new Set(
    [BRANDING_BUCKET, ...configuredBrandingBuckets, 'organisation-branding', ...DOCUMENTS_BUCKET_CANDIDATES].filter(
      Boolean,
    ),
  ),
)

const configuredProfileAvatarBuckets = [
  ...parseBucketCandidates(
    viteEnv.VITE_SUPABASE_PROFILE_AVATAR_BUCKET || processEnv.VITE_SUPABASE_PROFILE_AVATAR_BUCKET,
  ),
  ...parseBucketCandidates(viteEnv.VITE_PROFILE_AVATAR_BUCKET || processEnv.VITE_PROFILE_AVATAR_BUCKET),
]

export const PROFILE_AVATAR_BUCKET = configuredProfileAvatarBuckets[0] || 'profile-avatars'

export const PROFILE_AVATAR_BUCKET_CANDIDATES = Array.from(
  new Set([PROFILE_AVATAR_BUCKET, ...configuredProfileAvatarBuckets, 'profile-avatars'].filter(Boolean)),
)
