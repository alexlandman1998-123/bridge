import { getRequiredProductionEnvVars, getUnsafeProductionFlags, isProductionEnvironment, validateProductionConfiguration } from '../config/productionValidation.js'
import {
  resolveGuidedBondApplicationChangeRequestsFlag,
  resolveBondApplicationBankAdaptersFlag,
  resolveBondApplicationExportsFlag,
  resolveBondApplicationExternalStatusSyncFlag,
  resolveBondApplicationLiveDeliveryFlag,
  resolveBondApplicationOobaAdapterFlag,
  resolveGuidedBondApplicationParticipantsFlag,
  resolveGuidedBondApplicationSuretiesFlag,
  resolveGuidedBondApplicationV2Flag,
} from './guidedBondApplicationFeatureFlag.js'

function normalize(value) {
  return String(value || '').trim()
}

function asBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

function runtimeEnv() {
  return import.meta.env || {}
}

export function getUnsafeEnvironmentFlags() {
  const unsafeFlags = getUnsafeProductionFlags()
  return {
    enableDemoMode: unsafeFlags.VITE_ENABLE_DEMO_MODE,
    enableLocalFallbacks: unsafeFlags.VITE_ENABLE_LOCAL_FALLBACKS || unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
    allowUnsafeLocalFallbacks: unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
    enableDevAuthBypass: unsafeFlags.VITE_ENABLE_DEV_AUTH_BYPASS,
    enableMockData: unsafeFlags.VITE_ENABLE_MOCK_DATA,
    enableMissionControlMocks: unsafeFlags.VITE_ENABLE_MISSION_CONTROL_MOCKS,
    disableRoleRestrictions: unsafeFlags.VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS,
  }
}

function isProductionSupabaseProject() {
  const env = runtimeEnv()
  const currentUrl = normalize(env.VITE_SUPABASE_URL)
  const productionUrl = normalize(env.VITE_PRODUCTION_SUPABASE_URL)
  if (!currentUrl || !productionUrl) return false
  return currentUrl.replace(/\/+$/, '') === productionUrl.replace(/\/+$/, '')
}

export function isUnsafeFallbackAllowed() {
  const env = runtimeEnv()
  const unsafeFlags = getUnsafeProductionFlags()
  return Boolean(
    env.DEV &&
      !isProductionEnvironment() &&
      !isProductionSupabaseProject() &&
      unsafeFlags.VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS,
  )
}

export function getUnsafeFallbackEnvironmentDiagnostics() {
  const env = runtimeEnv()
  return {
    allowed: isUnsafeFallbackAllowed(),
    mode: env.MODE || '',
    dev: Boolean(env.DEV),
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
  const env = runtimeEnv()
  const required = isProductionEnvironment() ? getRequiredProductionEnvVars() : ['VITE_SUPABASE_URL']
  const missing = required.filter((name) => !normalize(env[name]))
  const hasAnonKey = Boolean(normalize(env.VITE_SUPABASE_ANON_KEY))
  const hasLegacyKey = Boolean(normalize(env.VITE_SUPABASE_KEY))

  if (!hasAnonKey && !hasLegacyKey) {
    missing.push('VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_KEY')
  }

  return {
    ok: missing.length === 0,
    missing,
    message: buildMissingMessage(missing),
  }
}

export function getFeatureFlags() {
  const env = runtimeEnv()
  const unsafeFlags = getUnsafeEnvironmentFlags()
  return {
    enableClientPortalAlterations: asBoolean(env.VITE_FEATURE_CLIENT_PORTAL_ALTERATIONS, true),
    enableServiceReviews: asBoolean(env.VITE_FEATURE_SERVICE_REVIEWS, true),
    enableSnapshotLinks: asBoolean(env.VITE_FEATURE_SNAPSHOT_LINKS, true),
    enableAdvancedOrganisationSetup: asBoolean(env.VITE_FEATURE_ADVANCED_ORG_SETUP, true),
    enableReportsExport: asBoolean(env.VITE_FEATURE_REPORTS_EXPORT, true),
    enableWhatsAppAutomation: asBoolean(env.VITE_FEATURE_WHATSAPP_AUTOMATION, false),
    enableInviteOnboarding: asBoolean(env.VITE_FEATURE_INVITE_ONBOARDING, true),
    enableNativeMandateRenderer: asBoolean(env.VITE_FEATURE_NATIVE_MANDATE_RENDERER, false),
    enableNativeOtpRenderer: asBoolean(env.VITE_FEATURE_NATIVE_OTP_RENDERER, false),
    guidedBondApplicationV2: resolveGuidedBondApplicationV2Flag({ env }).enabled,
    guidedBondApplicationParticipantsV1: resolveGuidedBondApplicationParticipantsFlag({ env }).enabled,
    guidedBondApplicationSuretiesV1: resolveGuidedBondApplicationSuretiesFlag({ env }).enabled,
    guidedBondApplicationChangeRequestsV1: resolveGuidedBondApplicationChangeRequestsFlag({ env }).enabled,
    bondApplicationExportsV1: resolveBondApplicationExportsFlag({ env }).enabled,
    bondApplicationOobaAdapterV1: resolveBondApplicationOobaAdapterFlag({ env }).enabled,
    bondApplicationBankAdaptersV1: resolveBondApplicationBankAdaptersFlag({ env }).enabled,
    bondApplicationLiveDeliveryV1: resolveBondApplicationLiveDeliveryFlag({ env }).enabled,
    bondApplicationExternalStatusSyncV1: resolveBondApplicationExternalStatusSyncFlag({ env }).enabled,
    enableMobileShell: asBoolean(env.VITE_FEATURE_MOBILE_SHELL, false),
    enableMobileLoginRedirect: asBoolean(env.VITE_FEATURE_MOBILE_LOGIN_REDIRECT, false),
    allowDesktopFallbackOnMobile: asBoolean(env.VITE_FEATURE_MOBILE_DESKTOP_FALLBACK, true),
    disableRoleRestrictions: unsafeFlags.disableRoleRestrictions,
  }
}
