import { buildDefaultProfileFromUser, getOrCreateUserProfile } from './profileApi'
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

const AUTH_BOOT_REQUIRED_STEP_TIMEOUT_MS = 10000
const AUTH_BOOT_OPTIONAL_STEP_TIMEOUT_MS = 5000
const AUTH_BOOT_HEALTH_PROBE_TIMEOUT_MS = 2500
const AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS = 12000
const AUTH_BOOT_TRANSIENT_SCHEMA_RETRY_DELAYS_MS = [750, 1750, 3500]
const DEGRADED_WORKSPACE_BOOT_STORAGE_KEY = 'arch9:last-good-auth-boot:v1'
const DEGRADED_WORKSPACE_BOOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

function cloneJsonSafe(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback))
  } catch {
    return fallback
  }
}

function buildEmptyMembershipContexts() {
  return {
    effective: null,
    organisation: null,
    attorneyFirm: null,
  }
}

function hasMembershipForWorkspace(memberships = [], workspaceId = '') {
  const id = normalizeText(workspaceId)
  if (!id) return false
  return (Array.isArray(memberships) ? memberships : []).some((membership) => {
    const membershipWorkspaceId = normalizeText(
      membership?.workspaceId ||
        membership?.workspace_id ||
        membership?.workspace?.id ||
        membership?.raw?.workspace_id ||
        membership?.raw?.organisation_id ||
        membership?.raw?.organization_id ||
        membership?.raw?.firm_id,
    )
    return membershipWorkspaceId === id || normalizeText(membership?.id) === id
  })
}

function readLastGoodBridgeAuthSnapshot() {
  const storage = getStorage()
  if (!storage) return null
  try {
    const parsed = JSON.parse(storage.getItem(DEGRADED_WORKSPACE_BOOT_STORAGE_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.warn('[AUTH] degraded workspace cache could not be read', error)
    return null
  }
}

export function persistLastGoodBridgeAuthState(state = {}) {
  const storage = getStorage()
  if (!storage || state?.status !== 'authenticated' || state?.workspaceAccessDegraded) return
  const userId = normalizeText(state?.user?.id)
  const currentWorkspaceId = normalizeText(state?.currentWorkspace?.id)
  const activeMemberships = Array.isArray(state?.activeMemberships) ? state.activeMemberships : []
  if (!userId || !currentWorkspaceId || !activeMemberships.length) return

  const snapshot = {
    version: 1,
    capturedAt: new Date().toISOString(),
    userId,
    profile: cloneJsonSafe(state.profile, null),
    appRole: normalizeText(state.appRole),
    memberships: cloneJsonSafe(state.memberships, []),
    activeMemberships: cloneJsonSafe(activeMemberships, []),
    pendingMemberships: cloneJsonSafe(state.pendingMemberships, []),
    suspendedMemberships: cloneJsonSafe(state.suspendedMemberships, []),
    currentMembership: cloneJsonSafe(state.currentMembership, null),
    currentMemberships: cloneJsonSafe(state.currentMemberships, []),
    membershipContexts: cloneJsonSafe(state.membershipContexts, buildEmptyMembershipContexts()),
    currentWorkspace: cloneJsonSafe(state.currentWorkspace, null),
    workspaceType: normalizeText(state.workspaceType),
    workspaceRole: normalizeText(state.workspaceRole),
    permissions: cloneJsonSafe(state.permissions, {}),
    onboardingComplete: state.onboardingComplete === true,
    onboardingRequiredReason: normalizeText(state.onboardingRequiredReason),
  }

  try {
    storage.setItem(DEGRADED_WORKSPACE_BOOT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch (error) {
    console.warn('[AUTH] degraded workspace cache could not be written', error)
  }
}

export function buildDegradedBridgeAuthState({ session = null, selectedWorkspaceId = '', error = null } = {}) {
  const snapshot = readLastGoodBridgeAuthSnapshot()
  const userId = normalizeText(session?.user?.id)
  if (!snapshot || !userId || normalizeText(snapshot.userId) !== userId) return null
  const capturedAtMs = Date.parse(snapshot.capturedAt || '')
  if (!Number.isFinite(capturedAtMs) || Date.now() - capturedAtMs > DEGRADED_WORKSPACE_BOOT_MAX_AGE_MS) return null
  const requestedWorkspaceId = normalizeText(selectedWorkspaceId)
  const activeMemberships = Array.isArray(snapshot.activeMemberships) ? snapshot.activeMemberships : []
  if (requestedWorkspaceId && !hasMembershipForWorkspace(activeMemberships, requestedWorkspaceId)) return null
  const currentWorkspace = snapshot.currentWorkspace && typeof snapshot.currentWorkspace === 'object'
    ? snapshot.currentWorkspace
    : null
  if (!currentWorkspace?.id || !activeMemberships.length) return null

  const profile = snapshot.profile && typeof snapshot.profile === 'object'
    ? snapshot.profile
    : buildDefaultProfileFromUser(session.user)
  const membershipContexts =
    snapshot.membershipContexts && typeof snapshot.membershipContexts === 'object'
      ? snapshot.membershipContexts
      : buildEmptyMembershipContexts()
  const diagnostics = {
    degraded: true,
    reason: 'workspace_boot_timeout',
    recoveredFromCache: true,
    sourceCapturedAt: snapshot.capturedAt,
    originalError: error?.message || '',
    warnings: ['workspace_boot_degraded_from_last_good_snapshot'],
  }

  return {
    status: 'authenticated',
    session,
    user: session.user,
    profile: {
      ...profile,
      bootFallback: profile.bootFallback === true,
    },
    signupIntent: null,
    onboardingState: {
      degraded: true,
      recoveryReason: '',
      validation: {
        ok: true,
        degraded: true,
        reason: '',
      },
    },
    appRole: normalizeText(snapshot.appRole || profile.role),
    memberships: Array.isArray(snapshot.memberships) ? snapshot.memberships : activeMemberships,
    activeMemberships,
    pendingMemberships: Array.isArray(snapshot.pendingMemberships) ? snapshot.pendingMemberships : [],
    suspendedMemberships: Array.isArray(snapshot.suspendedMemberships) ? snapshot.suspendedMemberships : [],
    currentMembership: snapshot.currentMembership || activeMemberships[0] || null,
    currentMemberships: Array.isArray(snapshot.currentMemberships) && snapshot.currentMemberships.length
      ? snapshot.currentMemberships
      : activeMemberships,
    membershipContexts,
    currentWorkspace,
    workspaceType: normalizeText(snapshot.workspaceType || currentWorkspace.type || inferWorkspaceTypeFromAppRole(snapshot.appRole || profile.role)),
    workspaceRole: normalizeText(snapshot.workspaceRole),
    permissions: snapshot.permissions && typeof snapshot.permissions === 'object' ? snapshot.permissions : {},
    workspaceResolution: {
      ok: true,
      status: 'degraded',
      reason: '',
      diagnostics,
    },
    workspaceDiagnostics: diagnostics,
    workspaceAccessDegraded: true,
    workspaceDegradedReason: 'workspace_boot_timeout',
    workspaceDegradedMessage: 'Workspace data is refreshing from the last successful session while Arch9 reconnects to the backend.',
    onboardingComplete: snapshot.onboardingComplete !== false,
    onboardingRequiredReason: normalizeText(snapshot.onboardingRequiredReason),
    bootError: '',
  }
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

function delay(ms = 0) {
  const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
    ? window.setTimeout.bind(window)
    : setTimeout
  return new Promise((resolve) => setTimer(resolve, Math.max(0, Number(ms) || 0)))
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

export function clearActiveAuthBootStepDiagnostics() {
  activeAuthBootSteps.clear()
}

function withStepTimeout(task, {
  label = 'auth boot step',
  timeoutMs = AUTH_BOOT_REQUIRED_STEP_TIMEOUT_MS,
} = {}) {
  let timeoutId = null
  const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
    ? window.setTimeout.bind(window)
    : setTimeout
  const clearTimer = typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
    ? window.clearTimeout.bind(window)
    : clearTimeout
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimer(() => {
        const error = new Error(`${label} timed out.`)
        error.code = 'AUTH_BOOT_STEP_TIMEOUT'
        reject(error)
      }, timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimer(timeoutId)
  })
}

function isAuthBootStepTimeout(error) {
  return error?.code === 'AUTH_BOOT_STEP_TIMEOUT' || String(error?.message || '').toLowerCase().includes('timed out')
}

function isTransientSchemaCacheError(error = null) {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return (
    code === 'PGRST002' ||
    code === 'PGRST003' ||
    message.includes('could not query the database for the schema cache') ||
    (message.includes('schema cache') && message.includes('retrying'))
  )
}

function buildAuthBootHealthProbeResult({
  ok,
  status,
  durationMs = 0,
  checkedAt = new Date().toISOString(),
  error = null,
} = {}) {
  return {
    ok: ok === true,
    status: normalizeText(status) || (ok ? 'healthy' : 'unhealthy'),
    durationMs: roundDuration(durationMs),
    checkedAt,
    errorCode: error?.code || null,
    errorMessage: error?.message || null,
  }
}

export async function probeAuthBootHealth({ user, client = supabase } = {}) {
  const startedAt = getNowMs()
  const userId = normalizeText(user?.id)
  if (!isSupabaseConfigured || !client || !userId) {
    return buildAuthBootHealthProbeResult({
      ok: false,
      status: 'unconfigured',
      durationMs: getNowMs() - startedAt,
    })
  }

  try {
    const result = await withStepTimeout(
      client
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle(),
      {
        label: 'bootHealth.profilesProbe',
        timeoutMs: AUTH_BOOT_HEALTH_PROBE_TIMEOUT_MS,
      },
    )

    if (result.error) {
      const status = isTransientSchemaCacheError(result.error)
        ? 'schema_cache_unavailable'
        : 'query_error'
      return buildAuthBootHealthProbeResult({
        ok: false,
        status,
        durationMs: getNowMs() - startedAt,
        error: result.error,
      })
    }

    return buildAuthBootHealthProbeResult({
      ok: true,
      status: 'healthy',
      durationMs: getNowMs() - startedAt,
    })
  } catch (error) {
    return buildAuthBootHealthProbeResult({
      ok: false,
      status: isAuthBootStepTimeout(error) ? 'timeout' : 'probe_failed',
      durationMs: getNowMs() - startedAt,
      error,
    })
  }
}

function attachBootHealthToWorkspaceResolution(workspaceResolution = null, bootHealth = null) {
  if (!workspaceResolution || !bootHealth) return workspaceResolution
  const diagnostics = workspaceResolution.diagnostics && typeof workspaceResolution.diagnostics === 'object'
    ? workspaceResolution.diagnostics
    : {}
  const warnings = Array.isArray(diagnostics.warnings) ? diagnostics.warnings : []
  workspaceResolution.diagnostics = {
    ...diagnostics,
    bootHealth,
    warnings: bootHealth.ok ? warnings : [...new Set([...warnings, 'boot_health_probe_unhealthy'])],
  }
  return workspaceResolution
}

function attachBootHealthToError(error, bootHealth = null) {
  if (error && bootHealth && typeof error === 'object' && !error.bootHealth) {
    error.bootHealth = bootHealth
  }
  return error
}

async function runAuthBootStepWithBootHealth(label, task, metadata = {}, bootHealth = null) {
  try {
    return await runAuthBootStep(label, task, metadata)
  } catch (error) {
    throw attachBootHealthToError(error, bootHealth)
  }
}

async function withTransientSchemaRetry(task, {
  label = 'auth boot query',
  userId = '',
  retryDelaysMs = AUTH_BOOT_TRANSIENT_SCHEMA_RETRY_DELAYS_MS,
} = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    if (attempt > 0) await delay(retryDelaysMs[attempt - 1])
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!isTransientSchemaCacheError(error) || attempt >= retryDelaysMs.length) throw error
      console.warn('[AUTH] transient schema-cache boot query failed; retrying.', {
        label,
        userId: normalizeText(userId) || null,
        attempt: attempt + 1,
        retryInMs: retryDelaysMs[attempt],
        errorCode: error?.code || null,
      })
    }
  }
  throw lastError || new Error(`${label} failed.`)
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

export function shouldIgnoreStaleMembershipRecovery({
  appRole = '',
  activeMemberships = [],
  currentMembership = null,
  currentWorkspace = null,
  onboardingState = null,
} = {}) {
  if (appRole === 'client') return false
  if (!activeMemberships.length || !currentMembership?.id || !currentWorkspace?.id) return false

  const recoveryReason = normalizeText(onboardingState?.recoveryReason || onboardingState?.validation?.reason)
  return recoveryReason === ONBOARDING_REQUIRED_REASONS.noActiveMembership
}

export async function loadBridgeAuthState({ session, selectedWorkspaceId = '' } = {}) {
  clearActiveAuthBootStepDiagnostics()
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
      currentMemberships: [],
      membershipContexts: {
        effective: null,
        organisation: null,
        attorneyFirm: null,
      },
      currentWorkspace: null,
      workspaceType: '',
      onboardingComplete: false,
      onboardingRequiredReason: '',
      workspaceAccessDegraded: false,
      workspaceDegradedReason: '',
      workspaceDegradedMessage: '',
      bootError: '',
    }
  }

  const user = session.user?.id
    ? session.user
    : (await runAuthBootStep(
        'auth.getUser',
        () => supabase.auth.getUser(),
      ))?.data?.user
  if (!user?.id) throw new Error('Authenticated Supabase user could not be resolved.')

  const bootHealth = await runAuthBootStep(
    'bootHealth.probe',
    () => probeAuthBootHealth({ user, client: supabase }),
    { userId: user.id },
  )
  if (!bootHealth.ok) {
    console.warn('[AUTH] boot health probe reported degraded backend access', {
      userId: user.id,
      status: bootHealth.status,
      durationMs: bootHealth.durationMs,
      errorCode: bootHealth.errorCode,
      errorMessage: bootHealth.errorMessage,
    })
  }

  const profile = await runAuthBootStep(
    'profile.getOrCreate',
    async () => {
      try {
        return await withTransientSchemaRetry(
          () => withStepTimeout(getOrCreateUserProfile({ user }), {
            label: 'profile.getOrCreate',
            timeoutMs: AUTH_BOOT_REQUIRED_STEP_TIMEOUT_MS,
          }),
          { label: 'profile.getOrCreate', userId: user.id },
        )
      } catch (error) {
        if (!isAuthBootStepTimeout(error) && !isTransientSchemaCacheError(error)) throw error
        console.warn('[AUTH] profile load unavailable; using session metadata fallback for this boot.', {
          userId: user.id,
          reason: isTransientSchemaCacheError(error) ? 'schema_cache_unavailable' : 'timeout',
        })
        return {
          ...buildDefaultProfileFromUser(user),
          bootFallback: true,
          bootFallbackReason: isTransientSchemaCacheError(error) ? 'profile_schema_cache_unavailable' : 'profile_timeout',
        }
      }
    },
    { userId: user.id },
  )
  const loadedSignupIntent = await runAuthBootStep(
    'signupIntent.load',
    async () => {
      try {
        return await withTransientSchemaRetry(
          () => withStepTimeout(loadSignupIntentForUser({ user }), {
            label: 'signupIntent.load',
            timeoutMs: AUTH_BOOT_OPTIONAL_STEP_TIMEOUT_MS,
          }),
          { label: 'signupIntent.load', userId: user.id },
        )
      } catch (error) {
        if (!isAuthBootStepTimeout(error) && !isTransientSchemaCacheError(error)) throw error
        console.warn('[AUTH] signup intent load unavailable; continuing without signup intent for this boot.', {
          userId: user.id,
          reason: isTransientSchemaCacheError(error) ? 'schema_cache_unavailable' : 'timeout',
        })
        return null
      }
    },
    { userId: user.id },
  )
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

  let workspaceResolution = await runAuthBootStepWithBootHealth(
    'workspace.resolveCurrentWorkspace',
    () => withTransientSchemaRetry(
      () => withStepTimeout(
        resolveCurrentWorkspace(user.id, {
          client: supabase,
          user,
          profile,
          requestedWorkspaceId: selectedWorkspaceId,
        }),
        {
          label: 'workspace.resolveCurrentWorkspace',
          timeoutMs: AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS,
        },
      ),
      { label: 'workspace.resolveCurrentWorkspace', userId: user.id },
    ),
    {
      userId: user.id,
      requestedWorkspaceId: normalizeText(selectedWorkspaceId) || null,
    },
    bootHealth,
  )
  attachBootHealthToWorkspaceResolution(workspaceResolution, bootHealth)
  let memberships = workspaceResolution.memberships
  let activeMemberships = workspaceResolution.activeMemberships
  let pendingMemberships = workspaceResolution.pendingMemberships
  let suspendedMemberships = workspaceResolution.suspendedMemberships
  let currentMembership = workspaceResolution.currentMembership
  let currentMemberships = workspaceResolution.currentMemberships
  let membershipContexts = workspaceResolution.membershipContexts
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
      workspaceResolution = await runAuthBootStepWithBootHealth(
        'workspace.resolveCurrentWorkspace.afterClaim',
        () => withTransientSchemaRetry(
          () => withStepTimeout(
            resolveCurrentWorkspace(user.id, {
              client: supabase,
              user,
              profile,
              requestedWorkspaceId: claimRepair.data.workspace_id || claimRepair.data.organisation_id || selectedWorkspaceId,
            }),
            {
              label: 'workspace.resolveCurrentWorkspace.afterClaim',
              timeoutMs: AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS,
            },
          ),
          { label: 'workspace.resolveCurrentWorkspace.afterClaim', userId: user.id },
        ),
        {
          userId: user.id,
          requestedWorkspaceId: claimRepair.data.workspace_id || claimRepair.data.organisation_id || normalizeText(selectedWorkspaceId) || null,
        },
        bootHealth,
      )
      attachBootHealthToWorkspaceResolution(workspaceResolution, bootHealth)
      memberships = workspaceResolution.memberships
      activeMemberships = workspaceResolution.activeMemberships
      pendingMemberships = workspaceResolution.pendingMemberships
      suspendedMemberships = workspaceResolution.suspendedMemberships
      currentMembership = workspaceResolution.currentMembership
      currentMemberships = workspaceResolution.currentMemberships
      membershipContexts = workspaceResolution.membershipContexts
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
    () => withTransientSchemaRetry(
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
      { label: 'onboarding.getOnboardingState', userId: user.id },
    ),
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
      workspaceResolution = await runAuthBootStepWithBootHealth(
        'workspace.resolveCurrentWorkspace.afterRepair',
        () => withTransientSchemaRetry(
          () => withStepTimeout(
            resolveCurrentWorkspace(user.id, {
              client: supabase,
              user,
              profile,
              requestedWorkspaceId: repair.data.workspace_id || repair.data.organisation_id || currentWorkspace?.id,
            }),
            {
              label: 'workspace.resolveCurrentWorkspace.afterRepair',
              timeoutMs: AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS,
            },
          ),
          { label: 'workspace.resolveCurrentWorkspace.afterRepair', userId: user.id },
        ),
        {
          userId: user.id,
          requestedWorkspaceId: repair.data.workspace_id || repair.data.organisation_id || currentWorkspace?.id || null,
        },
        bootHealth,
      )
      attachBootHealthToWorkspaceResolution(workspaceResolution, bootHealth)
      memberships = workspaceResolution.memberships
      activeMemberships = workspaceResolution.activeMemberships
      pendingMemberships = workspaceResolution.pendingMemberships
      suspendedMemberships = workspaceResolution.suspendedMemberships
      currentMembership = workspaceResolution.currentMembership
      currentMemberships = workspaceResolution.currentMemberships
      membershipContexts = workspaceResolution.membershipContexts
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
        () => withTransientSchemaRetry(
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
          { label: 'onboarding.getOnboardingState.afterRepair', userId: user.id },
        ),
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

  const staleMembershipRecovery = shouldIgnoreStaleMembershipRecovery({
    appRole,
    activeMemberships,
    currentMembership,
    currentWorkspace,
    onboardingState,
  })
  const engineRequiresSetup = (!staleMembershipRecovery && Boolean(onboardingState?.recoveryReason)) || (
    onboarding.onboardingComplete &&
    onboardingState?.validation &&
    onboardingState.validation.ok === false &&
    !staleMembershipRecovery
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
    currentMemberships,
    membershipContexts,
    currentWorkspace,
    workspaceType,
    workspaceRole: workspaceResolution.workspaceRole,
    permissions: workspaceResolution.permissions,
    workspaceResolution,
    workspaceDiagnostics: workspaceResolution.diagnostics,
    workspaceAccessDegraded: false,
    workspaceDegradedReason: '',
    workspaceDegradedMessage: '',
    onboardingComplete: engineRequiresSetup ? false : onboarding.onboardingComplete,
    onboardingRequiredReason: engineRequiresSetup || onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval
      ? engineRequiredReason
      : onboarding.onboardingRequiredReason,
    bootError: '',
  }
}
