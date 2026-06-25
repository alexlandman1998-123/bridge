import { isCanonicalAppRole, normalizeCanonicalAppRole } from '../../constants/appRoles'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createIntegrityIssue, INTEGRITY_ISSUES, INTEGRITY_SEVERITIES, summarizeIssues } from './integrityChecks'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is required for validation.')
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

export async function loadProfileForValidation(userId) {
  const id = normalizeText(userId)
  if (!id) return null
  const result = await requireClient()
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, role, onboarding_completed, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (result.error) {
    if (isMissingSchemaError(result.error, 'profiles')) return null
    throw result.error
  }
  return result.data || null
}

export async function validateProfileState(userId, options = {}) {
  const profile = options.profile || await loadProfileForValidation(userId)
  const issues = []
  const id = normalizeText(userId || profile?.id)

  if (!profile?.id) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.profileMissing,
      severity: INTEGRITY_SEVERITIES.critical,
      entityType: 'user',
      entityId: id,
      message: 'Authenticated user has no Arch9 profile.',
    }))
    return { entityType: 'profile', entityId: id, profile: null, issues, ...summarizeIssues(issues) }
  }

  const appRole = normalizeCanonicalAppRole(profile.role, '')
  if (!isCanonicalAppRole(appRole)) {
    issues.push(createIntegrityIssue({
      code: INTEGRITY_ISSUES.invalidAppRole,
      severity: INTEGRITY_SEVERITIES.error,
      entityType: 'profile',
      entityId: profile.id,
      message: 'Profile role is not a valid app role.',
      metadata: { role: profile.role },
    }))
  }

  return {
    entityType: 'profile',
    entityId: profile.id,
    profile,
    appRole,
    issues,
    ...summarizeIssues(issues),
  }
}
