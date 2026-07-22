function normalize(value) {
  return String(value || '').trim()
}

function asBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

function decodeJwtPayload(token = '') {
  try {
    const [, payload = ''] = String(token).split('.')
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    const decoded =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        : typeof Buffer !== 'undefined'
          ? Buffer.from(padded, 'base64').toString('utf8')
          : ''
    return decoded ? JSON.parse(decoded) : null
  } catch {
    return null
  }
}

export function validateSupabaseBrowserKey(value = '') {
  const key = normalize(value)
  if (!key) {
    return {
      ok: false,
      code: 'missing_supabase_anon_key',
      message: 'VITE_SUPABASE_ANON_KEY is required.',
    }
  }

  if (key.startsWith('sb_publishable_')) {
    return {
      ok: false,
      code: 'unsupported_supabase_publishable_key',
      message: 'VITE_SUPABASE_ANON_KEY must be the Supabase JWT anon key, not an sb_publishable key.',
    }
  }

  if (!key.startsWith('eyJ') || key.split('.').length !== 3) {
    return {
      ok: false,
      code: 'invalid_supabase_anon_key_format',
      message: 'VITE_SUPABASE_ANON_KEY must be the Supabase JWT anon key.',
    }
  }

  const payload = decodeJwtPayload(key)
  const role = normalize(payload?.role).toLowerCase()
  if (role === 'service_role') {
    return {
      ok: false,
      code: 'service_role_key_in_browser_env',
      message: 'VITE_SUPABASE_ANON_KEY must not be a service_role key.',
    }
  }

  if (role && role !== 'anon') {
    return {
      ok: false,
      code: 'unexpected_supabase_anon_key_role',
      message: `VITE_SUPABASE_ANON_KEY must carry the anon role, not ${role}.`,
    }
  }

  return { ok: true, code: '', message: '' }
}

export const UNSAFE_PRODUCTION_FLAG_NAMES = Object.freeze([
  'VITE_ENABLE_DEMO_MODE',
  'VITE_ENABLE_LOCAL_FALLBACKS',
  'VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS',
  'VITE_ENABLE_DEV_AUTH_BYPASS',
  'VITE_ENABLE_MOCK_DATA',
  'VITE_ENABLE_MISSION_CONTROL_MOCKS',
  'VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS',
])

export function getDeploymentEnvironment() {
  return normalize(import.meta.env.VITE_APP_ENV || import.meta.env.VITE_DEPLOY_ENV || import.meta.env.VITE_VERCEL_ENV || 'development').toLowerCase()
}

export function isProductionEnvironment() {
  return getDeploymentEnvironment() === 'production'
}

export function isDemoLikeEnvironment() {
  return ['demo', 'staging', 'preview', 'local', 'development', 'test'].includes(getDeploymentEnvironment())
}

export function getUnsafeProductionFlags() {
  return {
    VITE_ENABLE_DEMO_MODE: asBoolean(import.meta.env.VITE_ENABLE_DEMO_MODE, false),
    VITE_ENABLE_LOCAL_FALLBACKS: asBoolean(import.meta.env.VITE_ENABLE_LOCAL_FALLBACKS, false),
    VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: asBoolean(import.meta.env.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS, false),
    VITE_ENABLE_DEV_AUTH_BYPASS: asBoolean(import.meta.env.VITE_ENABLE_DEV_AUTH_BYPASS, false),
    VITE_ENABLE_MOCK_DATA: asBoolean(import.meta.env.VITE_ENABLE_MOCK_DATA, false),
    VITE_ENABLE_MISSION_CONTROL_MOCKS: asBoolean(import.meta.env.VITE_ENABLE_MISSION_CONTROL_MOCKS, false),
    VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS: asBoolean(import.meta.env.VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS, false),
  }
}

export function getRequiredProductionEnvVars() {
  return [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ]
}

export function validateProductionConfiguration({ strict = isProductionEnvironment() } = {}) {
  const unsafeFlags = getUnsafeProductionFlags()
  const enabledUnsafeFlags = Object.entries(unsafeFlags)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name)
  const requiredEnvVars = getRequiredProductionEnvVars()
  const missingEnvVars = requiredEnvVars.filter((name) => !normalize(import.meta.env[name]))
  const supabaseKeyValidation = validateSupabaseBrowserKey(import.meta.env.VITE_SUPABASE_ANON_KEY)
  const issues = []

  if (strict && enabledUnsafeFlags.length) {
    issues.push({
      code: 'unsafe_production_flags_enabled',
      severity: 'critical',
      message: `Unsafe production flags are enabled: ${enabledUnsafeFlags.join(', ')}.`,
      metadata: { enabledUnsafeFlags },
    })
  }

  if (strict && missingEnvVars.length) {
    issues.push({
      code: 'missing_required_production_env',
      severity: 'critical',
      message: `Missing required production environment variables: ${missingEnvVars.join(', ')}.`,
      metadata: { missingEnvVars },
    })
  }

  if (strict && !missingEnvVars.includes('VITE_SUPABASE_ANON_KEY') && !supabaseKeyValidation.ok) {
    issues.push({
      code: supabaseKeyValidation.code,
      severity: 'critical',
      message: supabaseKeyValidation.message,
      metadata: { envVar: 'VITE_SUPABASE_ANON_KEY' },
    })
  }

  if (
    strict &&
    !normalize(import.meta.env.VITE_SUPABASE_ANON_KEY) &&
    normalize(import.meta.env.VITE_SUPABASE_KEY).startsWith('sb_publishable_')
  ) {
    issues.push({
      code: 'legacy_supabase_publishable_key_configured',
      severity: 'critical',
      message: 'Remove VITE_SUPABASE_KEY=sb_publishable_* from production; browser auth must use VITE_SUPABASE_ANON_KEY.',
      metadata: { envVar: 'VITE_SUPABASE_KEY' },
    })
  }

  return {
    ok: issues.length === 0,
    strict,
    environment: getDeploymentEnvironment(),
    enabledUnsafeFlags,
    missingEnvVars,
    issues,
    message: issues.map((issue) => issue.message).join(' '),
  }
}

export function assertProductionConfiguration() {
  const validation = validateProductionConfiguration({ strict: isProductionEnvironment() })
  if (!validation.ok) {
    const message = validation.message || 'Production configuration is unsafe.'
    console.error(`[PRODUCTION SAFETY] ${message}`, validation)
    throw new Error(message)
  }
  return validation
}
