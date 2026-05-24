function normalize(value) {
  return String(value || '').trim()
}

function asBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

export const UNSAFE_PRODUCTION_FLAG_NAMES = Object.freeze([
  'VITE_ENABLE_DEMO_MODE',
  'VITE_ENABLE_LOCAL_FALLBACKS',
  'VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS',
  'VITE_ENABLE_DEV_AUTH_BYPASS',
  'VITE_ENABLE_MOCK_DATA',
  'VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS',
])

export function getDeploymentEnvironment() {
  return normalize(import.meta.env.VITE_APP_ENV || import.meta.env.VITE_DEPLOY_ENV || import.meta.env.MODE || 'development').toLowerCase()
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
