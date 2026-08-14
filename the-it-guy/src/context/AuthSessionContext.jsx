/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearStoredDevAuthRole, createDevAuthSession, getStoredDevAuthRole, isDevAuthBypassEnabled } from '../lib/devAuth'
import { getDevBypassWorkspaceId } from '../lib/demoIds'
import {
  buildDegradedBridgeAuthState,
  getActiveAuthBootStepDiagnostics,
  loadBridgeAuthState,
  persistLastGoodBridgeAuthState,
} from '../lib/authBoot'
import { clearSupabaseLocalAuthState, isSupabaseConfigured, isUnsupportedJwtAlgorithmError, supabase } from '../lib/supabaseClient'
import { getProductionSafetyViolation } from '../lib/envValidation'
import { APP_ROLE_LABELS } from '../lib/appRoleMetadata'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import { createPerfTimer } from '../lib/performanceTrace'
import { reportError } from '../services/observability/errorTracking'
import {
  DASHBOARD_PERFORMANCE_METRICS,
  createDashboardPerformanceTrace,
  persistDashboardPerformanceTrace,
} from '../services/observability/dashboardPerformanceTelemetry'
import { trackAuthMetric, trackWorkspaceBrandingMetric } from '../services/observability/monitoring'
import { setActiveWorkspacePreference } from '../services/workspaceResolutionService'
import { clearWorkspaceScopedRuntimeCaches } from '../services/workspaceScopedCache'

const SESSION_BOOTSTRAP_TIMEOUT_MS = 15000
const BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS = 45000
const BRIDGE_AUTH_BOOTSTRAP_SLOW_MS = 15000
const BRIDGE_AUTH_BOOTSTRAP_RETRY_BASE_MS = 1500
const BRIDGE_AUTH_BOOTSTRAP_RETRY_MAX_MS = 8000
const BRIDGE_AUTH_BOOTSTRAP_RETRY_JITTER_MS = 750
const MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS = 2
const AUTH_BOOT_OBSERVABILITY_STORAGE_KEY = 'arch9:auth-boot-observability:v1'
const AUTH_BOOT_OBSERVABILITY_MAX_BREADCRUMBS = 20

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
  workspaceAccessDegraded: false,
  workspaceDegradedReason: '',
  workspaceDegradedMessage: '',
  bootRetry: null,
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
    workspaceAccessDegraded: false,
    workspaceDegradedReason: '',
    workspaceDegradedMessage: '',
    bootRetry: null,
    bootError: '',
  }
}

function buildBootstrapTimeoutMessage({ phase = '', diagnostics = [] } = {}) {
  const labels = [...new Set(diagnostics
    .map((step) => String(step?.label || '').trim())
    .filter(Boolean))]
  if (phase === 'bridge' && labels.length) {
    return `Authentication bootstrap timed out while loading ${labels.join(', ')}. Please retry.`
  }
  if (phase === 'session') {
    return 'Authentication bootstrap timed out while restoring your session. Please retry.'
  }
  return 'Authentication bootstrap timed out. Please retry.'
}

function getBridgeBootstrapRetryReason(error) {
  const message = String(error?.message || '').toLowerCase()
  const bootHealthStatus = String(error?.bootHealth?.status || '').toLowerCase()
  if (error?.code === 'AUTH_BOOT_STEP_TIMEOUT') return 'step_timeout'
  if (message.includes('authentication bootstrap timed out')) return 'bootstrap_timeout'
  if (message.includes('workspace.resolvecurrentworkspace') && message.includes('timed out')) return 'workspace_timeout'
  if (message.includes('schema cache') && message.includes('retry')) return 'schema_cache'
  if (['timeout', 'schema_cache_unavailable', 'query_error', 'probe_failed'].includes(bootHealthStatus)) {
    return `boot_health_${bootHealthStatus}`
  }
  return ''
}

function getBridgeBootstrapRetryDelayMs(attemptIndex = 0) {
  const baseDelay = Math.min(
    BRIDGE_AUTH_BOOTSTRAP_RETRY_MAX_MS,
    BRIDGE_AUTH_BOOTSTRAP_RETRY_BASE_MS * (2 ** Math.max(0, Number(attemptIndex) || 0)),
  )
  const jitter = Math.floor(Math.random() * BRIDGE_AUTH_BOOTSTRAP_RETRY_JITTER_MS)
  return baseDelay + jitter
}

function normalizeBootNumber(value, fallback = null) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback
}

function getAuthBootRoute() {
  return typeof window !== 'undefined' ? String(window.location?.pathname || '') : ''
}

function getAuthBootObservabilityStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  return window.sessionStorage
}

function readAuthBootBreadcrumbs() {
  const storage = getAuthBootObservabilityStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(AUTH_BOOT_OBSERVABILITY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(-AUTH_BOOT_OBSERVABILITY_MAX_BREADCRUMBS) : []
  } catch {
    return []
  }
}

function writeAuthBootBreadcrumb(eventName, metadata = {}) {
  const storage = getAuthBootObservabilityStorage()
  const breadcrumb = {
    event: String(eventName || '').trim(),
    route: getAuthBootRoute(),
    at: new Date().toISOString(),
    metadata,
  }
  if (!breadcrumb.event) return readAuthBootBreadcrumbs()
  const breadcrumbs = [...readAuthBootBreadcrumbs(), breadcrumb].slice(-AUTH_BOOT_OBSERVABILITY_MAX_BREADCRUMBS)
  if (storage) {
    try {
      storage.setItem(AUTH_BOOT_OBSERVABILITY_STORAGE_KEY, JSON.stringify(breadcrumbs))
    } catch {
      // Observability should never make auth boot less reliable.
    }
  }
  return breadcrumbs
}

function buildAuthBootObservabilityMetadata({
  selectedWorkspaceId = '',
  attempt = 1,
  retry = null,
  retryReason = '',
  retryInMs = null,
  bootHealth = null,
  activeSteps = [],
  currentWorkspaceId = '',
  outcome = '',
  error = null,
} = {}) {
  return {
    selectedWorkspaceProvided: Boolean(selectedWorkspaceId),
    attempt: normalizeBootNumber(attempt, 1),
    maxRetryAttempts: MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS,
    retryAttempt: normalizeBootNumber(retry?.attempt, null),
    retryReason: String(retryReason || retry?.reason || '').trim() || null,
    retryInMs: normalizeBootNumber(retryInMs ?? retry?.retryInMs, null),
    bootHealthOk: bootHealth?.ok === true,
    bootHealthStatus: String(bootHealth?.status || '').trim() || null,
    bootHealthDurationMs: normalizeBootNumber(bootHealth?.durationMs, null),
    activeStepCount: Array.isArray(activeSteps) ? activeSteps.length : 0,
    activeStepLabels: Array.isArray(activeSteps)
      ? activeSteps.map((step) => String(step?.label || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    currentWorkspaceId: String(currentWorkspaceId || '').trim() || null,
    outcome: String(outcome || '').trim() || null,
    errorCode: error?.code || null,
    errorMessage: error?.message || null,
  }
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
  const bridgeRetryScopeRef = useRef({ key: '', attempts: 0 })
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
      const sessionTrace = createDashboardPerformanceTrace({
        metricName: DASHBOARD_PERFORMANCE_METRICS.authSessionRestore,
        resourceOrigin: import.meta.env.VITE_SUPABASE_URL,
      })
      let sessionOutcome = 'success'
      let restoredSessionUserId = ''
      let hasSession = false
      setSessionLoading(true)
      setAuthState((previous) => ({ ...previous, status: 'loading', bootError: '' }))
      try {
        console.debug('[AUTH] session-bootstrap:start')
        const { data, error } = await withBootstrapTimeout(supabase.auth.getSession(), {
          timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS,
          phase: 'session',
        })
        if (!active) {
          sessionOutcome = 'cancelled'
          return
        }
        if (error) {
          if (isUnsupportedJwtAlgorithmError(error)) await clearSupabaseLocalAuthState()
          throw error
        }
        const restoredSession = data?.session || null
        restoredSessionUserId = restoredSession?.user?.id || ''
        hasSession = Boolean(restoredSession)
        setSession(restoredSession)
        console.debug('[AUTH] session-bootstrap:success', { hasSession })
        void trackAuthMetric(restoredSession ? 'session_restored' : 'no_session', {
          userId: restoredSessionUserId,
          metadata: { source: 'session_bootstrap' },
        })
      } catch (error) {
        sessionOutcome = active ? 'failed' : 'cancelled'
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
        void persistDashboardPerformanceTrace(sessionTrace, {
          userId: restoredSessionUserId,
          route: typeof window !== 'undefined' ? window.location.pathname : '',
          appRole: 'unknown',
          dashboardKind: 'auth',
          lifecycle: 'initial',
          outcome: sessionOutcome,
          hasSession,
        })
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
      setAuthState({
        ...EMPTY_AUTH_STATE,
        status: 'unauthenticated',
      })
      return
    }

    let active = true
    const retryScopeKey = `${sessionUserId}:${selectedWorkspaceId || ''}`
    if (bridgeRetryScopeRef.current.key !== retryScopeKey) {
      bridgeRetryScopeRef.current = { key: retryScopeKey, attempts: 0 }
    }

    async function bootBridgeState() {
      const bridgeTrace = createDashboardPerformanceTrace({
        metricName: DASHBOARD_PERFORMANCE_METRICS.authBridgeBoot,
        resourceOrigin: import.meta.env.VITE_SUPABASE_URL,
      })
      const bootTimer = createPerfTimer('auth.bridgeBoot', {
        selectedWorkspaceId: selectedWorkspaceId || null,
        attempt: bootAttempt + 1,
      })
      let bridgeOutcome = 'success'
      let resolvedBridgeState = null
      let slowTimerId = null
      let retryTimerId = null
      let bridgeRetryReason = ''
      let bridgeBootHealthStatus = ''
      let bridgeBreadcrumbCount = 0
      setAuthState((previous) => ({
        ...previous,
        status: 'loading',
        session,
        user: session.user,
        bootRetry: null,
        bootError: '',
      }))
      try {
        console.debug('[AUTH] bridge-boot:start', {
          userId: session.user.id,
          selectedWorkspaceId: selectedWorkspaceId || null,
          attempt: bootAttempt + 1,
          slowWarningMs: BRIDGE_AUTH_BOOTSTRAP_SLOW_MS,
        })
        bootTimer.mark('loadBridgeAuthState:start', {
          userId: session.user.id,
        })
        writeAuthBootBreadcrumb('bridge_boot_start', buildAuthBootObservabilityMetadata({
          selectedWorkspaceId,
          attempt: bootAttempt + 1,
          outcome: 'started',
        }))
        slowTimerId = window.setTimeout(() => {
          if (!active) return
          const diagnostics = getActiveAuthBootStepDiagnostics()
          const slowMetadata = buildAuthBootObservabilityMetadata({
            selectedWorkspaceId,
            attempt: bootAttempt + 1,
            activeSteps: diagnostics,
            outcome: 'slow',
          })
          const breadcrumbs = writeAuthBootBreadcrumb('bridge_boot_slow', slowMetadata)
          console.warn('[AUTH] bridge-boot:slow', {
            userId: session.user.id,
            selectedWorkspaceId: selectedWorkspaceId || null,
            attempt: bootAttempt + 1,
            durationMs: BRIDGE_AUTH_BOOTSTRAP_SLOW_MS,
            activeSteps: diagnostics,
          })
          void trackAuthMetric('auth_boot_slow', {
            userId: session.user.id,
            metadata: {
              ...slowMetadata,
              activeSteps: diagnostics.map((step) => ({
                label: step.label,
                durationMs: step.durationMs,
              })),
              breadcrumbCount: breadcrumbs.length,
            },
          })
        }, BRIDGE_AUTH_BOOTSTRAP_SLOW_MS)
        const nextState = await withBootstrapTimeout(loadBridgeAuthState({ session, selectedWorkspaceId }), {
          timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS,
          phase: 'bridge',
          getDiagnostics: getActiveAuthBootStepDiagnostics,
        })
        resolvedBridgeState = nextState
        bootTimer.mark('loadBridgeAuthState:success', {
          appRole: nextState.appRole || null,
          activeMemberships: nextState.activeMemberships.length,
          currentWorkspaceId: nextState.currentWorkspace?.id || null,
        })
        if (!active) {
          bridgeOutcome = 'cancelled'
          return
        }
        bridgeRetryScopeRef.current = { key: retryScopeKey, attempts: 0 }
        const successMetadata = buildAuthBootObservabilityMetadata({
          selectedWorkspaceId,
          attempt: bootAttempt + 1,
          bootHealth: nextState.workspaceDiagnostics?.bootHealth || null,
          currentWorkspaceId: nextState.currentWorkspace?.id || '',
          outcome: 'success',
        })
        const successBreadcrumbs = writeAuthBootBreadcrumb('bridge_boot_success', successMetadata)
        bridgeBootHealthStatus = successMetadata.bootHealthStatus || ''
        bridgeBreadcrumbCount = successBreadcrumbs.length
        setAuthState(nextState)
        persistLastGoodBridgeAuthState(nextState)
        void trackAuthMetric('auth_boot_success', {
          userId: session.user.id,
          workspaceId: nextState.currentWorkspace?.id || '',
          metadata: {
            ...successMetadata,
            appRole: nextState.appRole || null,
            activeMemberships: nextState.activeMemberships.length,
            onboardingRequiredReason: nextState.onboardingRequiredReason || null,
            bootHealthStatus: nextState.workspaceDiagnostics?.bootHealth?.status || null,
            bootHealthDurationMs: nextState.workspaceDiagnostics?.bootHealth?.durationMs || null,
            retryAttempt: bootAttempt || 0,
            breadcrumbCount: successBreadcrumbs.length,
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
        bridgeOutcome = active ? 'failed' : 'cancelled'
        bootTimer.mark('failed', {
          outcome: bridgeOutcome,
          message: error?.message || null,
        })
        if (!active) return
        const activeStepDiagnostics = getActiveAuthBootStepDiagnostics()
        const retryReason = getBridgeBootstrapRetryReason(error)
        const failureMetadata = buildAuthBootObservabilityMetadata({
          selectedWorkspaceId,
          attempt: bootAttempt + 1,
          retryReason,
          bootHealth: error?.bootHealth || null,
          activeSteps: activeStepDiagnostics,
          outcome: 'failed',
          error,
        })
        const failureBreadcrumbs = writeAuthBootBreadcrumb('bridge_boot_failed', failureMetadata)
        bridgeRetryReason = retryReason
        bridgeBootHealthStatus = failureMetadata.bootHealthStatus || ''
        bridgeBreadcrumbCount = failureBreadcrumbs.length
        console.error('[AUTH] bridge-boot:failed', error)
        void reportError(error, {
          userId: session.user.id,
          operation: 'bridge_auth_boot',
          category: 'auth_error',
          metadata: {
            ...failureMetadata,
            breadcrumbs: failureBreadcrumbs,
          },
        })
        const retryAttemptsUsed = bridgeRetryScopeRef.current.attempts || 0
        const canScheduleRetry = Boolean(retryReason && retryAttemptsUsed < MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS)
        const scheduleRetry = ({ keepCurrentState = false } = {}) => {
          if (!canScheduleRetry) return false
          const nextRetryAttempt = retryAttemptsUsed + 1
          const retryInMs = getBridgeBootstrapRetryDelayMs(retryAttemptsUsed)
          bridgeRetryScopeRef.current = {
            key: retryScopeKey,
            attempts: nextRetryAttempt,
          }
          if (!keepCurrentState) {
            bridgeOutcome = 'retrying'
            setAuthState((previous) => ({
              ...previous,
              status: 'loading',
              session,
              user: session.user,
              bootError: error?.message || 'Workspace bootstrap is taking longer than expected.',
              bootRetry: {
                attempt: nextRetryAttempt,
                maxAttempts: MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS,
                retryInMs,
                reason: retryReason,
              },
            }))
          }
          const retryMetadata = buildAuthBootObservabilityMetadata({
            selectedWorkspaceId,
            attempt: bootAttempt + 1,
            retry: {
              attempt: nextRetryAttempt,
              retryInMs,
              reason: retryReason,
              background: keepCurrentState,
            },
            bootHealth: error?.bootHealth || null,
            outcome: keepCurrentState ? 'degraded' : 'retrying',
            error,
          })
          const retryBreadcrumbs = writeAuthBootBreadcrumb(
            keepCurrentState ? 'bridge_boot_degraded_retry_scheduled' : 'bridge_boot_retry_scheduled',
            retryMetadata,
          )
          bridgeBootHealthStatus = retryMetadata.bootHealthStatus || ''
          bridgeBreadcrumbCount = retryBreadcrumbs.length
          retryTimerId = window.setTimeout(() => {
            if (!active) return
            console.warn('[AUTH] bridge-boot:retrying', {
              userId: session.user.id,
              selectedWorkspaceId: selectedWorkspaceId || null,
              attempt: nextRetryAttempt,
              maxAttempts: MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS,
              retryInMs,
              retryReason,
              background: keepCurrentState,
              previousError: error?.message || null,
            })
            void trackAuthMetric('auth_boot_retry_scheduled', {
              userId: session.user.id,
              metadata: {
                ...retryMetadata,
                selectedWorkspaceId: selectedWorkspaceId || null,
                attempt: nextRetryAttempt,
                maxAttempts: MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS,
                retryInMs,
                retryReason,
                background: keepCurrentState,
                breadcrumbCount: retryBreadcrumbs.length,
              },
            })
            setBootAttempt((previous) => previous + 1)
          }, retryInMs)
          return true
        }
        const degradedState = retryReason
          ? buildDegradedBridgeAuthState({ session, selectedWorkspaceId, error })
          : null
        if (degradedState) {
          bridgeOutcome = 'degraded'
          resolvedBridgeState = degradedState
          console.warn('[AUTH] bridge-boot:degraded', {
            userId: session.user.id,
            selectedWorkspaceId: selectedWorkspaceId || null,
            previousError: error?.message || null,
            currentWorkspaceId: degradedState.currentWorkspace?.id || null,
          })
          const degradedMetadata = buildAuthBootObservabilityMetadata({
            selectedWorkspaceId,
            attempt: bootAttempt + 1,
            retryReason,
            bootHealth: degradedState.workspaceDiagnostics?.bootHealth || error?.bootHealth || null,
            currentWorkspaceId: degradedState.currentWorkspace?.id || '',
            outcome: 'degraded',
            error,
          })
          const degradedBreadcrumbs = writeAuthBootBreadcrumb('bridge_boot_degraded', degradedMetadata)
          bridgeBootHealthStatus = degradedMetadata.bootHealthStatus || ''
          bridgeBreadcrumbCount = degradedBreadcrumbs.length
          setAuthState(degradedState)
          void trackAuthMetric('auth_boot_degraded', {
            userId: session.user.id,
            workspaceId: degradedState.currentWorkspace?.id || '',
            metadata: {
              ...degradedMetadata,
              selectedWorkspaceId: selectedWorkspaceId || null,
              previousError: error?.message || null,
              sourceCapturedAt: degradedState.workspaceDiagnostics?.sourceCapturedAt || null,
              bootHealthStatus: degradedState.workspaceDiagnostics?.bootHealth?.status || null,
              breadcrumbCount: degradedBreadcrumbs.length,
            },
          })
          bridgeRetryScopeRef.current = {
            key: retryScopeKey,
            attempts: MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS,
          }
          return
        }
        if (scheduleRetry()) {
          return
        }
        void trackAuthMetric('auth_boot_failed', {
          userId: session.user.id,
          metadata: {
            ...failureMetadata,
            retryExhausted: Boolean(retryReason),
            breadcrumbCount: failureBreadcrumbs.length,
          },
        })
        setAuthState({
          ...EMPTY_AUTH_STATE,
          status: 'error',
          session,
          user: session.user,
          bootRetry: null,
          bootError: error?.message || 'Unable to load your Arch9 workspace.',
        })
      } finally {
        if (slowTimerId) window.clearTimeout(slowTimerId)
        if (!active && retryTimerId) window.clearTimeout(retryTimerId)
        bootTimer.end({
          outcome: bridgeOutcome,
          appRole: resolvedBridgeState?.appRole || null,
          activeMemberships: resolvedBridgeState?.activeMemberships?.length || 0,
          currentWorkspaceId: resolvedBridgeState?.currentWorkspace?.id || null,
        })
        const bridgeWorkspaceId =
          resolvedBridgeState?.workspaceType === WORKSPACE_TYPES.agency ||
          resolvedBridgeState?.currentWorkspace?.type === WORKSPACE_TYPES.agency
            ? resolvedBridgeState?.currentWorkspace?.id || ''
            : ''
        void persistDashboardPerformanceTrace(bridgeTrace, {
          userId: session.user.id,
          workspaceId: bridgeWorkspaceId,
          route: typeof window !== 'undefined' ? window.location.pathname : '',
          appRole: resolvedBridgeState?.appRole || 'unknown',
          dashboardKind: 'auth',
          lifecycle: bootAttempt > 0 ? 'retry' : 'initial',
          outcome: bridgeOutcome,
          hasData: Boolean(resolvedBridgeState),
          selectedWorkspaceProvided: Boolean(selectedWorkspaceId),
          activeMembershipCount: resolvedBridgeState?.activeMemberships?.length,
          retryCount: bridgeRetryScopeRef.current.attempts || 0,
          bootHealthStatus: bridgeBootHealthStatus,
          retryReason: bridgeRetryReason,
          breadcrumbCount: bridgeBreadcrumbCount,
        })
      }
    }

    void bootBridgeState()

    return () => {
      active = false
    }
  }, [bootAttempt, devAuthRole, productionSafetyViolation, selectedWorkspaceId, sessionLoading, sessionUserId])

  const refreshAuthState = useCallback(() => {
    bridgeRetryScopeRef.current = { key: '', attempts: 0 }
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
      bridgeRetryScopeRef.current = { key: '', attempts: 0 }
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
