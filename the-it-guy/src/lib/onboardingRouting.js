import { normalizeAppRole } from './appRoleMetadata'

const ONBOARDING_PATHS = [
  '/onboarding',
  '/onboarding/profile',
  '/onboarding/persona',
  '/agent/onboarding',
  '/developer/onboarding',
  '/bond-originator/onboarding',
  '/attorney/onboarding',
]

function normalizePath(pathname = '') {
  const trimmed = String(pathname || '').trim()
  if (!trimmed) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function isPathMatch(pathname = '', target = '') {
  const path = normalizePath(pathname)
  const base = normalizePath(target)
  return path === base || path.startsWith(`${base}/`)
}

export function isOnboardingRoute(pathname = '') {
  return ONBOARDING_PATHS.some((item) => isPathMatch(pathname, item))
}

function hasAttorneyFirmRepairRequest(search = '') {
  const rawSearch = String(search || '').trim()
  if (!rawSearch) return false

  try {
    const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch : `?${rawSearch}`)
    const repairValue = String(params.get('repair') || '').trim().toLowerCase()
    return repairValue === 'firm' || repairValue === 'attorney_firm'
  } catch {
    return false
  }
}

export function resolveRoleOnboardingPath(role = '') {
  const normalizedRole = normalizeAppRole(role)
  if (normalizedRole === 'agent') return '/agent/onboarding'
  if (normalizedRole === 'attorney') return '/attorney/onboarding'
  if (normalizedRole === 'developer') return '/developer/onboarding'
  if (normalizedRole === 'bond_originator') return '/bond-originator/onboarding'
  return '/onboarding/profile'
}

export function deriveOnboardingSetupState({ profile = null, baseRole = '' } = {}) {
  const normalizedRole = normalizeAppRole(baseRole || profile?.role || '')
  const firstName = String(profile?.firstName || '').trim()
  const lastName = String(profile?.lastName || '').trim()
  const hasNames = Boolean(firstName && lastName)
  const hasRole = normalizedRole !== 'viewer'
  const onboardingCompleted = Boolean(profile?.onboardingCompleted)
  const hasAttorneyFirm = Boolean(String(profile?.primaryAttorneyFirmId || '').trim())

  const profileStatus = hasNames ? 'complete' : 'incomplete'
  const onboardingStatus = onboardingCompleted ? 'complete' : hasNames || hasRole ? 'in_progress' : 'not_started'

  let organisationSetupStatus = 'not_required'
  if (normalizedRole === 'attorney') {
    organisationSetupStatus = hasAttorneyFirm ? 'complete' : 'pending'
  } else if (normalizedRole !== 'client' && normalizedRole !== 'viewer') {
    organisationSetupStatus = onboardingCompleted ? 'pending' : 'not_required'
  }

  const moduleSetupStatus =
    normalizedRole === 'client' || normalizedRole === 'viewer'
      ? 'not_required'
      : onboardingCompleted
        ? organisationSetupStatus === 'complete'
          ? 'complete'
          : 'pending'
        : 'pending'

  return {
    appRole: normalizedRole,
    profileStatus,
    onboardingStatus,
    onboardingCompleted,
    organisationSetupStatus,
    moduleSetupStatus,
    hasRole,
    hasNames,
    hasAttorneyFirm,
  }
}

export function decideAuthRedirect({
  pathname = '/',
  search = '',
  hasSession = false,
  profile = null,
  baseRole = '',
} = {}) {
  const safePath = normalizePath(pathname)
  const setupState = deriveOnboardingSetupState({ profile, baseRole })
  const onOnboardingRoute = isOnboardingRoute(safePath)
  const roleOnboardingPath = resolveRoleOnboardingPath(setupState.appRole)
  const profileRoute = '/onboarding/profile'
  const attorneyFirmRepairRequest =
    setupState.appRole === 'attorney' &&
    isPathMatch(safePath, '/attorney/onboarding') &&
    hasAttorneyFirmRepairRequest(search)

  if (!hasSession) {
    return {
      action: 'redirect',
      to: '/auth',
      reason: 'no_session',
      setupState,
    }
  }

  const mustRepairProfile = !setupState.hasNames || !setupState.hasRole
  if (mustRepairProfile && !isPathMatch(safePath, profileRoute)) {
    return {
      action: 'redirect',
      to: profileRoute,
      reason: 'profile_incomplete',
      setupState,
    }
  }

  if (!setupState.onboardingCompleted && !onOnboardingRoute) {
    return {
      action: 'redirect',
      to: roleOnboardingPath,
      reason: 'onboarding_required',
      setupState,
    }
  }

  if (
    setupState.onboardingCompleted &&
    onOnboardingRoute &&
    !attorneyFirmRepairRequest &&
    !(setupState.appRole === 'attorney' && isPathMatch(safePath, '/attorney/onboarding') && !setupState.hasAttorneyFirm)
  ) {
    return {
      action: 'redirect',
      to: setupState.appRole === 'attorney' ? '/attorney/dashboard' : '/dashboard',
      reason: 'onboarding_complete',
      setupState,
    }
  }

  return {
    action: 'allow',
    to: safePath,
    reason: 'allow',
    setupState,
  }
}
