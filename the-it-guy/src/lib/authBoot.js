import { getOrCreateUserProfile } from './api'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { normalizeCanonicalAppRole, isCanonicalAppRole } from '../constants/appRoles'
import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES } from '../constants/onboardingStatuses'
import { inferWorkspaceTypeFromAppRole } from '../constants/workspaceTypes'
import { SIGNUP_INTENT_STATUSES } from '../constants/signupIntents'
import { loadSignupIntentForUser, markSignupIntentReadyForOnboarding } from './signupIntent'
import { getOnboardingState } from '../services/onboarding/onboardingEngine'
import { resolveCurrentWorkspace } from '../services/workspaceResolutionService'

function normalizeText(value) {
  return String(value || '').trim()
}

function getNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function roundDuration(durationMs) {
  return Math.round(Number(durationMs || 0))
}

let authBootStepSequence = 0
const activeAuthBootSteps = new Map()

function beginAuthBootStep(label, metadata = {}) {
  authBootStepSequence += 1
  const stepId = authBootStepSequence
  activeAuthBootSteps.set(stepId, {
    label,
    metadata,
    startedAt: getNowMs(),
  })
  return stepId
}

function endAuthBootStep(stepId) {
  activeAuthBootSteps.delete(stepId)
}

export function getActiveAuthBootStepDiagnostics() {
  return Array.from(activeAuthBootSteps.values()).map((step) => ({
    label: step.label,
    metadata: step.metadata,
    durationMs: roundDuration(getNowMs() - step.startedAt),
  }))
}

async function runAuthBootStep(label, task, metadata = {}) {
  const startedAt = getNowMs()
  const stepId = beginAuthBootStep(label, metadata)
  console.debug('[AUTH][BOOT] step:start', { label, ...metadata })
  try {
    const result = await task()
    console.debug('[AUTH][BOOT] step:success', {
      label,
      durationMs: roundDuration(getNowMs() - startedAt),
      ...metadata,
    })
    return result
  } catch (error) {
    console.error('[AUTH][BOOT] step:failed', {
      label,
      durationMs: roundDuration(getNowMs() - startedAt),
      ...metadata,
      error,
    })
    throw error
  } finally {
    endAuthBootStep(stepId)
  }
}

function profileNeedsRepair(profile) {
  if (!profile?.id) return ONBOARDING_REQUIRED_REASONS.noProfile
  const firstName = normalizeText(profile.firstName)
  const lastName = normalizeText(profile.lastName)
  if (!firstName || !lastName) return ONBOARDING_REQUIRED_REASONS.profileIncomplete
  if (!isCanonicalAppRole(profile.role)) return ONBOARDING_REQUIRED_REASONS.appRoleMissing
  return ''
}

export function deriveAuthBootOnboardingState({
  profile = null,
  appRole = '',
  activeMemberships = [],
  currentMembership = null,
} = {}) {
  const repairReason = profileNeedsRepair(profile)
  if (repairReason) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: repairReason,
    }
  }

  const hasResolvedWorkspaceAccess = Boolean(
    appRole !== 'client' &&
      activeMemberships.length &&
      currentMembership?.workspace,
  )

  if (!profile?.onboardingCompleted && !hasResolvedWorkspaceAccess) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.onboardingIncomplete,
    }
  }

  if (appRole !== 'client' && !activeMemberships.length) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.noActiveMembership,
    }
  }

  if (appRole !== 'client' && !currentMembership?.workspace) {
    return {
      onboardingComplete: false,
      onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.workspaceMissing,
    }
  }

  return {
    onboardingComplete: true,
    onboardingRequiredReason: ONBOARDING_REQUIRED_REASONS.none,
  }
}

export async function loadBridgeAuthState({ session, selectedWorkspaceId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Bridge auth requires Supabase in this environment.')
  }

  if (!session?.user?.id) {
    return {
      status: 'unauthenticated',
      session: null,
      user: null,
      profile: null,
      signupIntent: null,
      onboardingState: null,
      appRole: '',
      memberships: [],
      activeMemberships: [],
      pendingMemberships: [],
      suspendedMemberships: [],
      currentMembership: null,
      currentWorkspace: null,
      workspaceType: '',
      onboardingComplete: false,
      onboardingRequiredReason: '',
      bootError: '',
    }
  }

  const { data: userData, error: userError } = await runAuthBootStep(
    'auth.getUser',
    () => supabase.auth.getUser(),
  )
  if (userError) throw userError
  const user = userData?.user || session.user
  if (!user?.id) throw new Error('Authenticated Supabase user could not be resolved.')

  const [profile, loadedSignupIntent] = await Promise.all([
    runAuthBootStep('profile.getOrCreate', () => getOrCreateUserProfile({ user }), {
      userId: user.id,
    }),
    runAuthBootStep('signupIntent.load', () => loadSignupIntentForUser({ user }), {
      userId: user.id,
    }),
  ])
  const signupIntent = loadedSignupIntent && loadedSignupIntent.status !== SIGNUP_INTENT_STATUSES.readyForOnboarding
    ? await runAuthBootStep(
        'signupIntent.markReady',
        () => markSignupIntentReadyForOnboarding({ user, intent: loadedSignupIntent }),
        { userId: user.id },
      )
    : loadedSignupIntent || null
  const appRole = normalizeCanonicalAppRole(profile?.role)

  if (!isCanonicalAppRole(appRole)) {
    console.warn('[AUTH] profile role requires repair before dashboard access', {
      userId: user.id,
      role: profile?.role || null,
    })
  }

  const workspaceResolution = await runAuthBootStep(
    'workspace.resolveCurrentWorkspace',
    () => resolveCurrentWorkspace(user.id, {
      client: supabase,
      user,
      profile,
      requestedWorkspaceId: selectedWorkspaceId,
    }),
    {
      userId: user.id,
      requestedWorkspaceId: normalizeText(selectedWorkspaceId) || null,
    },
  )
  const memberships = workspaceResolution.memberships
  const activeMemberships = workspaceResolution.activeMemberships
  const pendingMemberships = workspaceResolution.pendingMemberships
  const suspendedMemberships = workspaceResolution.suspendedMemberships
  const currentMembership = workspaceResolution.currentMembership
  const currentWorkspace = workspaceResolution.currentWorkspace
  const workspaceType = workspaceResolution.workspaceType || inferWorkspaceTypeFromAppRole(appRole)
  const onboarding = deriveAuthBootOnboardingState({
    profile,
    signupIntent,
    appRole,
    activeMemberships,
    currentMembership,
  })
  const shouldValidateResolvedWorkspace = Boolean(
    appRole !== 'client' &&
      activeMemberships.length &&
      currentMembership?.workspace,
  )
  const onboardingState = await runAuthBootStep(
    'onboarding.getOnboardingState',
    () => getOnboardingState(user.id, {
      session,
      user,
      profile,
      signupIntent,
      appRole,
      memberships,
      activeMemberships,
      pendingMemberships,
      suspendedMemberships,
      currentMembership,
      currentWorkspace,
      workspaceType,
      workspaceRole: workspaceResolution.workspaceRole,
      permissions: workspaceResolution.permissions,
      workspaceResolution,
      workspaceDiagnostics: workspaceResolution.diagnostics,
      onboardingComplete: onboarding.onboardingComplete,
      onboardingRequiredReason: onboarding.onboardingRequiredReason,
      forceValidate: shouldValidateResolvedWorkspace,
    }),
    {
      userId: user.id,
      workspaceId: currentWorkspace?.id || null,
      workspaceType,
    },
  )
  const engineRequiresSetup = Boolean(onboardingState?.recoveryReason) || (
    onboarding.onboardingComplete &&
    onboardingState?.validation &&
    onboardingState.validation.ok === false
  )
  const engineRequiredReason =
    onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
      ? ONBOARDING_REQUIRED_REASONS.pendingApproval
      : onboardingState?.recoveryReason || onboarding.onboardingRequiredReason

  return {
    status: 'authenticated',
    session,
    user,
    profile,
    signupIntent,
    onboardingState,
    appRole,
    memberships,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    workspaceType,
    workspaceRole: workspaceResolution.workspaceRole,
    permissions: workspaceResolution.permissions,
    workspaceResolution,
    workspaceDiagnostics: workspaceResolution.diagnostics,
    onboardingComplete: engineRequiresSetup ? false : onboarding.onboardingComplete,
    onboardingRequiredReason: engineRequiresSetup || onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
      ? engineRequiredReason
      : onboarding.onboardingRequiredReason,
    bootError: '',
  }
}
