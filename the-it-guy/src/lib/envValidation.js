import { getRequiredProductionEnvVars, getUnsafeProductionFlags, isProductionEnvironment, validateProductionConfiguration } from '../config/productionValidation'

function normalize(value) {
  return String(value || '').trim()
}

function asBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

export function getUnsafeEnvironmentFlags() {
  const unsafeFlags = getUnsafeProductionFlags()
  return {
    enableDemoMode: unsafeFlags.VITE_ENABLE_DEMO_MODE,
    enableLocalFallbacks: unsafeFlags.VITE_ENABLE_LOCAL_FALLBACKS || unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
    allowUnsafeLocalFallbacks: unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
    enableDevAuthBypass: unsafeFlags.VITE_ENABLE_DEV_AUTH_BYPASS,
    enableMockData: unsafeFlags.VITE_ENABLE_MOCK_DATA,
    disableRoleRestrictions: unsafeFlags.VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS,
  }
}

function isProductionSupabaseProject() {
  const currentUrl = normalize(import.meta.env.VITE_SUPABASE_URL)
  const productionUrl = normalize(import.meta.env.VITE_PRODUCTION_SUPABASE_URL)
  if (!currentUrl || !productionUrl) return false
  return currentUrl.replace(/\/+$/, '') === productionUrl.replace(/\/+$/, '')
}

export function isUnsafeFallbackAllowed() {
  const unsafeFlags = getUnsafeProductionFlags()
  return Boolean(
    import.meta.env.DEV &&
      !isProductionEnvironment() &&
      !isProductionSupabaseProject() &&
      unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
  )
}

export function getUnsafeFallbackEnvironmentDiagnostics() {
  return {
    allowed: isUnsafeFallbackAllowed(),
    mode: import.meta.env.MODE || '',
    dev: Boolean(import.meta.env.DEV),
    productionEnvironment: isProductionEnvironment(),
    productionSupabaseProject: isProductionSupabaseProject(),
    allowUnsafeLocalFallbacks: Boolean(getUnsafeProductionFlags().VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS),
  }
}

export function getProductionSafetyViolation() {
  const validation = validateProductionConfiguration({ strict: isProductionEnvironment() })
  return validation.ok ? '' : validation.message
}

function buildMissingMessage(vars = []) {
  if (!vars.length) return ''
  return `Missing required environment variables: ${vars.join(', ')}`
}

export function getRuntimeEnvValidation() {
  const required = isProductionEnvironment() ? getRequiredProductionEnvVars() : ['VITE_SUPABASE_URL']
  const missing = required.filter((name) => !normalize(import.meta.env[name]))
  const hasAnonKey = Boolean(normalize(import.meta.env.VITE_SUPABASE_ANON_KEY))
  const hasLegacyKey = Boolean(normalize(import.meta.env.VITE_SUPABASE_KEY))

  if (!isProductionEnvironment() && !hasAnonKey && !hasLegacyKey) {
    missing.push('VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_KEY')
  }

  return {
    ok: missing.length === 0,
    missing,
    message: buildMissingMessage(missing),
  }
}

export function getFeatureFlags() {
  const unsafeFlags = getUnsafeEnvironmentFlags()
  return {
    enableClientPortalAlterations: asBoolean(import.meta.env.VITE_FEATURE_CLIENT_PORTAL_ALTERATIONS, true),
    enableServiceReviews: asBoolean(import.meta.env.VITE_FEATURE_SERVICE_REVIEWS, true),
    enableSnapshotLinks: asBoolean(import.meta.env.VITE_FEATURE_SNAPSHOT_LINKS, true),
    enableAdvancedOrganisationSetup: asBoolean(import.meta.env.VITE_FEATURE_ADVANCED_ORG_SETUP, true),
    enableReportsExport: asBoolean(import.meta.env.VITE_FEATURE_REPORTS_EXPORT, true),
    enableWhatsAppAutomation: asBoolean(import.meta.env.VITE_FEATURE_WHATSAPP_AUTOMATION, false),
    enableInviteOnboarding: asBoolean(import.meta.env.VITE_FEATURE_INVITE_ONBOARDING, true),
    enableNativeMandateRenderer: asBoolean(import.meta.env.VITE_FEATURE_NATIVE_MANDATE_RENDERER, false),
    enableNativeOtpRenderer: asBoolean(import.meta.env.VITE_FEATURE_NATIVE_OTP_RENDERER, false),
    disableRoleRestrictions: unsafeFlags.disableRoleRestrictions,
  }
}
