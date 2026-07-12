import { getOrCreateUserProfile } from './profileApi'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import { normalizeCanonicalAppRole, isCanonicalAppRole } from '../constants/appRoles'
import { ONBOARDING_REQUIRED_REASONS, ONBOARDING_STATUSES } from '../constants/onboardingStatuses'
import { inferWorkspaceTypeFromAppRole } from '../constants/workspaceTypes'
import { SIGNUP_INTENT_STATUSES } from '../constants/signupIntents'
import { loadSignupIntentForUser, markSignupIntentReadyForOnboarding } from './signupIntent'
import { getOnboardingState } from '../services/onboarding/onboardingEngine'
import { resolveCurrentWorkspace } from '../services/workspaceResolutionService'

const AUTO_REPAIRABLE_ONBOARDING_REASONS = new Set([
  ONBOARDING_REQUIRED_REASONS.missingBranch,
  ONBOARDING_REQUIRED_REASONS.missingSettings,
])

const AUTO_CLAIMABLE_ONBOARDING_REASONS = new Set([
  ONBOARDING_REQUIRED_REASONS.noActiveMembership,
  ONBOARDING_REQUIRED_REASONS.onboardingIncomplete,
])

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

export function shouldAutoRepairWorkspaceOnboarding({
  appRole = '',
  currentMembership = null,
  currentWorkspace = null,
  onboardingState = null,
} = {}) {
  if (appRole === 'client') return false
  if (!currentWorkspace?.id || !currentMembership?.id) return false
  if (currentMembership.source && currentMembership.source !== 'organisation_users') return false
  const reason = normalizeText(onboardingState?.recoveryReason || onboardingState?.validation?.reason)
  return AUTO_REPAIRABLE_ONBOARDING_REASONS.has(reason)
}

export function shouldAutoClaimWorkspaceMembership({
  profile = null,
  appRole = '',
  activeMemberships = [],
  currentMembership = null,
  signupIntent = null,
  onboardingRequiredReason = '',
} = {}) {
  if (appRole === 'client') return false
  if (activeMemberships.length || currentMembership?.id) return false
  if (!profile?.id || !normalizeText(profile.email)) return false
  if (profileNeedsRepair(profile)) return false
  if (!signupIntent?.id) return false
  const reason = normalizeText(onboardingRequiredReason)
  return AUTO_CLAIMABLE_ONBOARDING_REASONS.has(reason)
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
    throw new Error('Supabase is not configured. Arch9 auth requires Supabase in this environment.')
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

  let workspaceResolution = await runAuthBootStep(
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
  let memberships = workspaceResolution.memberships
  let activeMemberships = workspaceResolution.activeMemberships
  let pendingMemberships = workspaceResolution.pendingMemberships
  let suspendedMemberships = workspaceResolution.suspendedMemberships
  let currentMembership = workspaceResolution.currentMembership
  let currentWorkspace = workspaceResolution.currentWorkspace
  let workspaceType = workspaceResolution.workspaceType || inferWorkspaceTypeFromAppRole(appRole)
  let onboarding = deriveAuthBootOnboardingState({
    profile,
    signupIntent,
    appRole,
    activeMemberships,
    currentMembership,
  })

  if (shouldAutoClaimWorkspaceMembership({
    profile,
    appRole,
    activeMemberships,
    currentMembership,
    signupIntent,
    onboardingRequiredReason: onboarding.onboardingRequiredReason,
  })) {
    const claimRepair = await runAuthBootStep(
      'onboarding.autoClaimWorkspaceMembership',
      () => supabase.rpc('bridge_repair_workspace_onboarding', { target_user_id: user.id }),
      {
        userId: user.id,
        email: normalizeText(profile?.email || user.email).toLowerCase() || null,
        reason: onboarding.onboardingRequiredReason || null,
      },
    )

    if (claimRepair.error) {
      console.warn('[AUTH] workspace membership auto-claim failed', {
        userId: user.id,
        email: normalizeText(profile?.email || user.email).toLowerCase() || null,
        reason: onboarding.onboardingRequiredReason || null,
        error: claimRepair.error,
      })
    } else if (claimRepair.data?.success) {
      workspaceResolution = await runAuthBootStep(
        'workspace.resolveCurrentWorkspace.afterClaim',
        () => resolveCurrentWorkspace(user.id, {
          client: supabase,
          user,
          profile,
          requestedWorkspaceId: claimRepair.data.workspace_id || claimRepair.data.organisation_id || selectedWorkspaceId,
        }),
        {
          userId: user.id,
          requestedWorkspaceId: claimRepair.data.workspace_id || claimRepair.data.organisation_id || normalizeText(selectedWorkspaceId) || null,
        },
      )
      memberships = workspaceResolution.memberships
      activeMemberships = workspaceResolution.activeMemberships
      pendingMemberships = workspaceResolution.pendingMemberships
      suspendedMemberships = workspaceResolution.suspendedMemberships
      currentMembership = workspaceResolution.currentMembership
      currentWorkspace = workspaceResolution.currentWorkspace
      workspaceType = workspaceResolution.workspaceType || inferWorkspaceTypeFromAppRole(appRole)
      onboarding = deriveAuthBootOnboardingState({
        profile: { ...profile, onboardingCompleted: true },
        signupIntent,
        appRole,
        activeMemberships,
        currentMembership,
      })
    } else {
      console.debug('[AUTH] workspace membership auto-claim skipped', {
        userId: user.id,
        email: normalizeText(profile?.email || user.email).toLowerCase() || null,
        reason: onboarding.onboardingRequiredReason || null,
        result: claimRepair.data || null,
      })
    }
  }

  let shouldValidateResolvedWorkspace = Boolean(
    appRole !== 'client' &&
      activeMemberships.length &&
      currentMembership?.workspace,
  )
  let onboardingState = await runAuthBootStep(
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

  if (shouldAutoRepairWorkspaceOnboarding({ appRole, currentMembership, currentWorkspace, onboardingState })) {
    const repair = await runAuthBootStep(
      'onboarding.autoRepairWorkspace',
      () => supabase.rpc('bridge_repair_workspace_onboarding', { target_user_id: user.id }),
      {
        userId: user.id,
        workspaceId: currentWorkspace?.id || null,
        reason: onboardingState?.recoveryReason || onboardingState?.validation?.reason || null,
      },
    )

    if (repair.error) {
      console.warn('[AUTH] workspace auto-repair failed', {
        userId: user.id,
        workspaceId: currentWorkspace?.id || null,
        reason: onboardingState?.recoveryReason || onboardingState?.validation?.reason || null,
        error: repair.error,
      })
    } else if (repair.data?.success) {
      workspaceResolution = await runAuthBootStep(
        'workspace.resolveCurrentWorkspace.afterRepair',
        () => resolveCurrentWorkspace(user.id, {
          client: supabase,
          user,
          profile,
          requestedWorkspaceId: repair.data.workspace_id || repair.data.organisation_id || currentWorkspace?.id,
        }),
        {
          userId: user.id,
          requestedWorkspaceId: repair.data.workspace_id || repair.data.organisation_id || currentWorkspace?.id || null,
        },
      )
      memberships = workspaceResolution.memberships
      activeMemberships = workspaceResolution.activeMemberships
      pendingMemberships = workspaceResolution.pendingMemberships
      suspendedMemberships = workspaceResolution.suspendedMemberships
      currentMembership = workspaceResolution.currentMembership
      currentWorkspace = workspaceResolution.currentWorkspace
      workspaceType = workspaceResolution.workspaceType || inferWorkspaceTypeFromAppRole(appRole)
      onboarding = deriveAuthBootOnboardingState({
        profile: { ...profile, onboardingCompleted: true },
        signupIntent,
        appRole,
        activeMemberships,
        currentMembership,
      })
      shouldValidateResolvedWorkspace = Boolean(
        appRole !== 'client' &&
          activeMemberships.length &&
          currentMembership?.workspace,
      )
      onboardingState = await runAuthBootStep(
        'onboarding.getOnboardingState.afterRepair',
        () => getOnboardingState(user.id, {
          session,
          user,
          profile: { ...profile, onboardingCompleted: true },
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
    } else {
      console.warn('[AUTH] workspace auto-repair returned unresolved result', {
        userId: user.id,
        workspaceId: currentWorkspace?.id || null,
        result: repair.data || null,
      })
    }
  }

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
