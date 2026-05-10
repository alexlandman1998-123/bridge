function normalize(value) {
  return String(value || '').trim()
}

function asBoolean(value, fallback = false) {
  const normalized = normalize(value).toLowerCase()
  if (!normalized) return fallback
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)
}

function buildMissingMessage(vars = []) {
  if (!vars.length) return ''
  return `Missing required environment variables: ${vars.join(', ')}`
}

export function getRuntimeEnvValidation() {
  const required = ['VITE_SUPABASE_URL']
  const missing = required.filter((name) => !normalize(import.meta.env[name]))
  const hasAnonKey = Boolean(normalize(import.meta.env.VITE_SUPABASE_ANON_KEY))
  const hasLegacyKey = Boolean(normalize(import.meta.env.VITE_SUPABASE_KEY))

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
  return {
    enableClientPortalAlterations: asBoolean(import.meta.env.VITE_FEATURE_CLIENT_PORTAL_ALTERATIONS, true),
    enableServiceReviews: asBoolean(import.meta.env.VITE_FEATURE_SERVICE_REVIEWS, true),
    enableSnapshotLinks: asBoolean(import.meta.env.VITE_FEATURE_SNAPSHOT_LINKS, true),
    enableAdvancedOrganisationSetup: asBoolean(import.meta.env.VITE_FEATURE_ADVANCED_ORG_SETUP, true),
    enableReportsExport: asBoolean(import.meta.env.VITE_FEATURE_REPORTS_EXPORT, true),
    enableWhatsAppAutomation: asBoolean(import.meta.env.VITE_FEATURE_WHATSAPP_AUTOMATION, false),
    enableInviteOnboarding: asBoolean(import.meta.env.VITE_FEATURE_INVITE_ONBOARDING, true),
    disableRoleRestrictions: asBoolean(import.meta.env.VITE_FEATURE_DISABLE_ROLE_RESTRICTIONS, true),
  }
}
