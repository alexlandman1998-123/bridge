/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearStoredDevAuthRole, createDevAuthSession, getStoredDevAuthRole, isDevAuthBypassEnabled } from '../lib/devAuth'
import { getDevBypassWorkspaceId } from '../lib/demoIds'
import { getActiveAuthBootStepDiagnostics, loadBridgeAuthState } from '../lib/authBoot'
import { clearSupabaseLocalAuthState, isSupabaseConfigured, isUnsupportedJwtAlgorithmError, supabase } from '../lib/supabaseClient'
import { getProductionSafetyViolation } from '../lib/envValidation'
import { APP_ROLE_LABELS } from '../lib/appRoleMetadata'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { reportError } from '../services/observability/errorTracking'
import { measureAsyncOperation } from '../services/observability/performanceMetrics'
import { trackAuthMetric, trackWorkspaceBrandingMetric } from '../services/observability/monitoring'
import { setActiveWorkspacePreference } from '../services/workspaceResolutionService'
import { clearWorkspaceScopedRuntimeCaches } from '../services/workspaceScopedCache'

const SESSION_BOOTSTRAP_TIMEOUT_MS = 8000
const BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS = 45000

const EMPTY_AUTH_STATE = Object.freeze({
  status: 'loading',
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
  membershipContexts: Object.freeze({
    effective: null,
    organisation: null,
    attorneyFirm: null,
  }),
  currentWorkspace: null,
  workspaceType: '',
  onboardingComplete: false,
  onboardingRequiredReason: '',
  bootError: '',
})

const AuthSessionContext = createContext(null)

function createDevOnlyAuthState(devAuthRole) {
  const session = createDevAuthSession(devAuthRole)
  if (!session?.user?.id) return null
  const appRole = devAuthRole
  const workspaceType =
    appRole === 'attorney'
      ? WORKSPACE_TYPES.attorneyFirm
      : appRole === 'developer'
        ? WORKSPACE_TYPES.developerCompany
        : appRole === 'bond_originator'
          ? WORKSPACE_TYPES.bondOriginator
          : WORKSPACE_TYPES.agency
  const workspace = {
    id: getDevBypassWorkspaceId(appRole),
    type: workspaceType,
    name: `Dev ${APP_ROLE_LABELS[appRole] || 'Workspace'}`,
  }
  const membership = {
    id: `dev-membership-${appRole}`,
    source: 'dev_auth_bypass',
    userId: session.user.id,
    workspaceId: workspace.id,
    workspace,
    workspaceType,
    appRole,
    role: appRole === 'agent' ? 'principal' : 'owner',
    rawRole: 'dev_bypass',
    status: 'active',
    isActive: true,
  }

  return {
    status: 'authenticated',
    session,
    user: session.user,
    profile: {
      id: session.user.id,
      email: session.user.email,
      firstName: 'Dev',
      lastName: 'User',
      fullName: `Dev ${APP_ROLE_LABELS[appRole] || 'User'}`,
      role: appRole,
      onboardingCompleted: true,
      createdAt: null,
      updatedAt: null,
    },
    signupIntent: null,
    onboardingState: null,
    appRole,
    memberships: [membership],
    activeMemberships: [membership],
    pendingMemberships: [],
    suspendedMemberships: [],
    currentMembership: membership,
    currentMemberships: [membership],
    membershipContexts: {
      effective: membership,
      organisation: membership.source === 'organisation_users' ? membership : null,
      attorneyFirm: membership.source === 'attorney_firm_members' ? membership : null,
    },
    currentWorkspace: workspace,
    workspaceType,
    onboardingComplete: true,
    onboardingRequiredReason: '',
    bootError: '',
  }
}

function buildBootstrapTimeoutMessage({ phase = '', diagnostics = [] } = {}) {
  const labels = diagnostics
    .map((step) => String(step?.label || '').trim())
    .filter(Boolean)
  if (phase === 'bridge' && labels.length) {
    return `Authentication bootstrap timed out while loading ${labels.join(', ')}. Please retry.`
  }
  if (phase === 'session') {
    return 'Authentication bootstrap timed out while restoring your session. Please retry.'
  }
  return 'Authentication bootstrap timed out. Please retry.'
}

function getMembershipWorkspaceId(membership = null) {
  return String(
    membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.workspace?.id ||
      membership?.raw?.workspace_id ||
      membership?.raw?.organisation_id ||
      membership?.raw?.organization_id ||
      membership?.raw?.firm_id ||
      '',
  ).trim()
}

async function withBootstrapTimeout(task, {
  timeoutMs = SESSION_BOOTSTRAP_TIMEOUT_MS,
  phase = '',
  getDiagnostics = null,
} = {}) {
  let timeoutId = null
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          const diagnostics = typeof getDiagnostics === 'function' ? getDiagnostics() : []
          reject(new Error(buildBootstrapTimeoutMessage({ phase, diagnostics })))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

export function AuthSessionProvider({ children }) {
  const [devAuthRole, setDevAuthRoleState] = useState(() => getStoredDevAuthRole())
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authState, setAuthState] = useState(EMPTY_AUTH_STATE)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const productionSafetyViolation = getProductionSafetyViolation()
  const sessionUserId = session?.user?.id || ''

  const setDevAuthRole = useCallback((nextRole) => {
    if (!isDevAuthBypassEnabled()) {
      clearStoredDevAuthRole()
      setDevAuthRoleState(null)
      return
    }
    setDevAuthRoleState(nextRole)
  }, [])

  useEffect(() => {
    if (productionSafetyViolation) {
      console.error(`[AUTH][PRODUCTION SAFETY] ${productionSafetyViolation}`)
      setSessionLoading(false)
      setAuthState({
        ...EMPTY_AUTH_STATE,
        status: 'error',
        bootError: productionSafetyViolation,
      })
      return
    }

    if (devAuthRole && isDevAuthBypassEnabled()) {
      console.warn('[AUTH] dev auth bypass is enabled. This must never be enabled in production.')
      setSessionLoading(false)
      setSession(null)
      setAuthState(createDevOnlyAuthState(devAuthRole) || {
        ...EMPTY_AUTH_STATE,
        status: 'error',
        bootError: 'Dev auth bypass could not create a session.',
      })
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setSessionLoading(false)
      setSession(null)
      setAuthState({
        ...EMPTY_AUTH_STATE,
        status: 'error',
        bootError: 'Supabase is not configured. Arch9 auth requires Supabase.',
      })
      return
    }

    let active = true

    async function loadSession() {
      setSessionLoading(true)
      setAuthState((previous) => ({ ...previous, status: 'loading', bootError: '' }))
      try {
        console.debug('[AUTH] session-bootstrap:start')
        const { data, error } = await withBootstrapTimeout(supabase.auth.getSession(), {
          timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS,
          phase: 'session',
        })
        if (!active) return
        if (error) {
          if (isUnsupportedJwtAlgorithmError(error)) await clearSupabaseLocalAuthState()
          throw error
        }
        setSession(data?.session || null)
        console.debug('[AUTH] session-bootstrap:success', { hasSession: Boolean(data?.session) })
        void trackAuthMetric(data?.session ? 'session_restored' : 'no_session', {
          userId: data?.session?.user?.id || '',
          metadata: { source: 'session_bootstrap' },
        })
      } catch (error) {
        if (!active) return
        console.error('[AUTH] session-bootstrap:failed', error)
        void reportError(error, {
          userId: '',
          operation: 'session_bootstrap',
          category: 'auth_error',
        })
        setSession(null)
        setAuthState({
          ...EMPTY_AUTH_STATE,
          status: 'error',
          bootError: error?.message || 'Unable to restore your session.',
        })
      } finally {
        if (active) setSessionLoading(false)
      }
    }

    void loadSession()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug('[AUTH] state-change', { event, hasSession: Boolean(nextSession) })
      setSession((previousSession) => {
        const previousUserId = previousSession?.user?.id || ''
        const nextUserId = nextSession?.user?.id || ''
        const previousAccessToken = previousSession?.access_token || ''
        const nextAccessToken = nextSession?.access_token || ''

        if (previousUserId !== nextUserId) {
          clearWorkspaceScopedRuntimeCaches()
        }

        if (
          previousUserId === nextUserId &&
          previousAccessToken === nextAccessToken
        ) {
          return previousSession
        }

        return nextSession || null
      })
    })

    return () => {
      active = false
      authSubscription?.subscription?.unsubscribe?.()
    }
  }, [devAuthRole, productionSafetyViolation])

  useEffect(() => {
    if (productionSafetyViolation || (devAuthRole && isDevAuthBypassEnabled())) return
    if (sessionLoading) return

    if (!sessionUserId) {
      setAuthState((previous) => {
        if (previous.status === 'error' && previous.bootError) return previous
        return {
          ...EMPTY_AUTH_STATE,
          status: 'unauthenticated',
        }
      })
      return
    }

    let active = true

    async function bootBridgeState() {
      setAuthState((previous) => ({
        ...previous,
        status: 'loading',
        session,
        user: session.user,
        bootError: '',
      }))
      try {
        console.debug('[AUTH] bridge-boot:start', {
          userId: session.user.id,
          selectedWorkspaceId: selectedWorkspaceId || null,
          attempt: bootAttempt + 1,
          timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS,
        })
        const nextState = await measureAsyncOperation(
          'auth_bridge_boot',
          () => withBootstrapTimeout(loadBridgeAuthState({ session, selectedWorkspaceId }), {
            timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS,
            phase: 'bridge',
            getDiagnostics: getActiveAuthBootStepDiagnostics,
          }),
          { userId: session.user.id, route: typeof window !== 'undefined' ? window.location.pathname : '' },
        )
        if (!active) return
        setAuthState(nextState)
        void trackAuthMetric('auth_boot_success', {
          userId: session.user.id,
          workspaceId: nextState.currentWorkspace?.id || '',
          metadata: {
            appRole: nextState.appRole || null,
            activeMemberships: nextState.activeMemberships.length,
            onboardingRequiredReason: nextState.onboardingRequiredReason || null,
          },
        })
        void trackWorkspaceBrandingMetric('workspace_branding_resolved', {
          userId: session.user.id,
          workspaceId: nextState.currentWorkspace?.id || '',
          workspaceType: nextState.workspaceType,
          membershipSource: nextState.currentMembership?.source,
          membershipSources: nextState.currentMemberships?.map((membership) => membership?.source),
          brandingSource: nextState.currentWorkspace?.brandingSource,
          logoPresent: Boolean(nextState.currentWorkspace?.logoUrl || nextState.currentWorkspace?.logo_url),
        })
        console.debug('[AUTH] bridge-boot:success', {
          userId: session.user.id,
          appRole: nextState.appRole || null,
          activeMemberships: nextState.activeMemberships.length,
          currentWorkspaceId: nextState.currentWorkspace?.id || null,
          onboardingRequiredReason: nextState.onboardingRequiredReason || null,
        })
      } catch (error) {
        if (!active) return
        const backendUnavailable = error?.code === 'AUTH_BACKEND_UNAVAILABLE'
        const bootError = backendUnavailable
          ? 'Arch9’s data service is temporarily unavailable. Your sign-in is still active; please try again in a moment.'
          : error?.message || 'Unable to load your Arch9 workspace.'
        console.error('[AUTH] bridge-boot:failed', {
          error,
          userId: session.user.id,
          selectedWorkspaceId: selectedWorkspaceId || null,
          activeSteps: getActiveAuthBootStepDiagnostics(),
        })
        void reportError(error, {
          userId: session.user.id,
          operation: 'bridge_auth_boot',
          category: 'auth_error',
        })
        setAuthState({
          ...EMPTY_AUTH_STATE,
          status: 'error',
          session,
          user: session.user,
          bootError,
        })
      }
    }

    void bootBridgeState()

    return () => {
      active = false
    }
  }, [bootAttempt, devAuthRole, productionSafetyViolation, selectedWorkspaceId, sessionLoading, sessionUserId])

  const refreshAuthState = useCallback(() => {
    setBootAttempt((previous) => previous + 1)
  }, [])

  const selectWorkspace = useCallback(
    (workspaceId) => {
      const id = String(workspaceId || '').trim()
      const allowed = authState.activeMemberships.some((membership) => getMembershipWorkspaceId(membership) === id || membership.id === id)
      if (!allowed || !id || id === 'all') {
        console.warn('[AUTH] ignored workspace selection not present in active memberships', { workspaceId: id })
        return
      }
      clearWorkspaceScopedRuntimeCaches()
      setSelectedWorkspaceId(id)
      void setActiveWorkspacePreference(authState.user?.id || session?.user?.id || '', id, {
        user: authState.user || session?.user || null,
        profile: authState.profile,
        source: 'user_selected',
      }).catch((error) => {
        console.error('[AUTH] workspace preference persist failed', error)
        void reportError(error, {
          userId: authState.user?.id || session?.user?.id || '',
          operation: 'workspace_switch',
          category: 'workspace_resolution',
          metadata: { workspaceId: id },
        })
      })
    },
    [authState.activeMemberships, authState.profile, authState.user, session?.user],
  )

  const logout = useCallback(async () => {
    const userId = authState.user?.id || session?.user?.id || ''
    const workspaceId = authState.currentWorkspace?.id || ''
    clearStoredDevAuthRole()
    clearWorkspaceScopedRuntimeCaches()
    setDevAuthRoleState(null)
    setSession(null)
    setAuthState({
      ...EMPTY_AUTH_STATE,
      status: 'unauthenticated',
    })

    if (supabase) {
      await supabase.auth.signOut()
    }
    void trackAuthMetric('logout', { userId, workspaceId })
  }, [authState.currentWorkspace?.id, authState.user?.id, session?.user?.id])

  const value = useMemo(
    () => ({
      authState: {
        ...authState,
        refreshAuthState,
      },
      session: session || authState.session,
      user: session?.user || authState.user || null,
      authLoading: sessionLoading || authState.status === 'loading',
      authError: authState.bootError,
      devAuthRole,
      setDevAuthRole,
      retryAuthBootstrap: refreshAuthState,
      refreshAuthState,
      selectWorkspace,
      logout,
    }),
    [authState, devAuthRole, logout, refreshAuthState, selectWorkspace, session, sessionLoading, setDevAuthRole],
  )

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext)
  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider')
  }
  return context
}
