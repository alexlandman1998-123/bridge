/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuthSession } from './AuthSessionContext'
import { fetchAgencyOnboardingSettings } from '../lib/organisationBootstrapApi'
import { resolveWorkspaceRole } from '../services/roleResolutionService'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import {
  DASHBOARD_PERFORMANCE_METRICS,
  createDashboardPerformanceTrace,
  persistDashboardPerformanceTrace,
} from '../services/observability/dashboardPerformanceTelemetry'

const EMPTY_ORGANISATION_BRANDING = Object.freeze({
  logoUrl: '',
  logoIconUrl: '',
  organisationLabel: '',
  hasCustomLogo: false,
})

const ORGANISATION_CONTEXT_GLOBAL_KEY = '__arch9OrganisationContextV1'
const OrganisationContext =
  typeof globalThis !== 'undefined'
    ? (globalThis[ORGANISATION_CONTEXT_GLOBAL_KEY] ||= createContext(null))
    : createContext(null)

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeOrganisation(organisation = {}) {
  const logoUrl = normalizeText(organisation.logoUrl || organisation.logo_url)
  const logoIconUrl = normalizeText(organisation.logoIconUrl || organisation.logo_icon_url || organisation.branding?.logoIcon)
  return {
    ...organisation,
    logoUrl,
    logo_url: logoUrl || null,
    logoIconUrl,
    logo_icon_url: logoIconUrl || null,
  }
}

function resolveOrganisationBranding(snapshot) {
  const onboarding = snapshot?.onboarding || snapshot?.organisationSettings?.agencyOnboarding || {}
  const organisation = normalizeOrganisation(snapshot?.organisation || {})
  const branding = onboarding?.branding || {}
  const agencyInformation = onboarding?.agencyInformation || {}

  const logoLightUrl = normalizeText(branding.logoLight)
  const logoDarkUrl = normalizeText(branding.logoDark)
  const logoIconUrl = normalizeText(branding.logoIcon || branding.logoIconUrl || organisation.logoIconUrl)
  const organisationLogoUrl = normalizeText(organisation.logoUrl)
  const logoUrl = logoLightUrl || organisationLogoUrl || logoDarkUrl
  const organisationLabel =
    normalizeText(agencyInformation.tradingName) ||
    normalizeText(agencyInformation.agencyName) ||
    normalizeText(organisation.displayName) ||
    normalizeText(organisation.display_name) ||
    normalizeText(organisation.name)

  return {
    logoUrl,
    logoIconUrl,
    logoLightUrl,
    logoDarkUrl,
    organisationLabel,
    hasCustomLogo: Boolean(logoUrl),
  }
}

function normalizeOrganisationSnapshot(snapshot) {
  if (!snapshot) return null
  const organisation = normalizeOrganisation(snapshot.organisation || {})
  return {
    ...snapshot,
    organisation,
    branding: resolveOrganisationBranding({ ...snapshot, organisation }),
  }
}

function buildAuthOrganisationSnapshot(authState) {
  const workspace = authState.currentWorkspace || {}
  const membership = authState.currentMembership || {}
  const organisation = normalizeOrganisation({
    id: workspace.id || membership.workspaceId || '',
    name: workspace.name || 'Arch9 Workspace',
    displayName: workspace.name || 'Arch9 Workspace',
    type: workspace.type || authState.workspaceType || '',
    logoUrl: '',
  })

  return normalizeOrganisationSnapshot({
    organisation,
    organisationSettings: {},
    onboarding: {
      agencyInformation: {
        agencyName: organisation.name,
        tradingName: organisation.displayName,
      },
      branding: {},
    },
    membershipRole: resolveWorkspaceRole(membership, {
      appRole: authState.appRole,
      workspaceType: workspace.type || authState.workspaceType,
    }),
    membershipStatus: membership.status || 'active',
    onboardingMode: 'dev_auth_bypass',
    persisted: false,
  })
}

function buildWorkspaceOrganisationSnapshot(authState) {
  const workspace = authState.currentWorkspace || {}
  const membership = authState.currentMembership || {}
  const logoUrl = normalizeText(workspace.logoUrl || workspace.logo_url || workspace.raw?.logo_url)
  const backingOrganisationId = normalizeText(workspace.organisationId || workspace.organisation_id || workspace.raw?.organisation_id)
  const organisation = normalizeOrganisation({
    id: workspace.id || membership.workspaceId || '',
    workspaceId: workspace.id || membership.workspaceId || '',
    organisationId: backingOrganisationId || workspace.id || membership.workspaceId || '',
    partnerOrganisationId: backingOrganisationId || workspace.id || membership.workspaceId || '',
    name: workspace.name || 'Arch9 Workspace',
    displayName: workspace.name || 'Arch9 Workspace',
    type: workspace.type || authState.workspaceType || '',
    logoUrl,
  })

  return normalizeOrganisationSnapshot({
    organisation,
    organisationSettings: {},
    onboarding: {
      agencyInformation: {
        agencyName: organisation.name,
        tradingName: organisation.displayName,
      },
      branding: {
        logoLight: logoUrl,
      },
    },
    membershipRole: resolveWorkspaceRole(membership, {
      appRole: authState.appRole,
      workspaceType: workspace.type || authState.workspaceType,
    }),
    membershipStatus: membership.status || 'active',
    onboardingMode: 'workspace_auth_snapshot',
    persisted: Boolean(workspace.id || membership.workspaceId),
  })
}

function getOrganisationSnapshotWorkspaceId(snapshot = null) {
  return normalizeText(
    snapshot?.organisation?.workspaceId ||
      snapshot?.organisation?.id ||
      snapshot?.organisation?.organisationId,
  )
}

function getAuthWorkspaceId(authState = {}) {
  return normalizeText(
    authState.currentWorkspace?.id ||
      authState.currentMembership?.workspaceId ||
      authState.currentMembership?.workspace_id,
  )
}

function getOrganisationMetricWorkspaceId(authState = {}, snapshot = null) {
  const hydratedWorkspaceId = getOrganisationSnapshotWorkspaceId(snapshot)
  if (hydratedWorkspaceId) return hydratedWorkspaceId
  if (
    authState.workspaceType === WORKSPACE_TYPES.agency ||
    authState.currentWorkspace?.type === WORKSPACE_TYPES.agency
  ) {
    return getAuthWorkspaceId(authState)
  }
  return ''
}

function isDevAuthOrganisation(authState) {
  return authState.currentMembership?.source === 'dev_auth_bypass'
}

function shouldUseWorkspaceBranding(authState) {
  return authState.workspaceType === WORKSPACE_TYPES.attorneyFirm || authState.currentWorkspace?.type === WORKSPACE_TYPES.attorneyFirm
}

function buildImmediateOrganisationSnapshot(authState = {}) {
  if (authState.status !== 'authenticated' || !authState.user?.id) return null
  if (isDevAuthOrganisation(authState)) return buildAuthOrganisationSnapshot(authState)
  if (shouldUseWorkspaceBranding(authState)) return buildWorkspaceOrganisationSnapshot(authState)
  return null
}

function resolveOrganisationRenderState(authState = {}, hydratedState = null) {
  const immediateSnapshot = buildImmediateOrganisationSnapshot(authState)
  if (immediateSnapshot) return immediateSnapshot
  if (authState.status !== 'authenticated' || !authState.user?.id) return null

  const authWorkspaceId = getAuthWorkspaceId(authState)
  const hydratedWorkspaceId = getOrganisationSnapshotWorkspaceId(hydratedState)
  if (authWorkspaceId && hydratedWorkspaceId && authWorkspaceId !== hydratedWorkspaceId) return null
  return hydratedState
}

function logOrganisationHydration(snapshot) {
  if (!import.meta.env.DEV) return
  const organisation = snapshot?.organisation || null
  console.log('Organisation Hydrated:', organisation)
  console.log('Organisation Logo URL:', organisation?.logo_url || organisation?.logoUrl || null)
}

export function OrganisationProvider({ children }) {
  const { authState } = useAuthSession()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const immediateSnapshot = useMemo(
    () => buildImmediateOrganisationSnapshot(authState),
    [authState],
  )
  const renderState = useMemo(
    () => immediateSnapshot || resolveOrganisationRenderState(authState, state),
    [authState, immediateSnapshot, state],
  )
  const hasImmediateSnapshot = Boolean(immediateSnapshot)

  const applyOrganisationState = useCallback((nextState) => {
    const normalized = normalizeOrganisationSnapshot(nextState)
    setState(normalized)
    logOrganisationHydration(normalized)
    return normalized
  }, [])

  const refreshOrganisation = useCallback(async ({ forceRefresh = true } = {}) => {
    if (authState.status !== 'authenticated' || !authState.user?.id) {
      setState(null)
      setError('')
      setLoading(false)
      return null
    }

      if (isDevAuthOrganisation(authState)) {
        const nextState = buildAuthOrganisationSnapshot(authState)
        setLoading(false)
        setError('')
        return applyOrganisationState(nextState)
      }

      if (shouldUseWorkspaceBranding(authState)) {
        const nextState = buildWorkspaceOrganisationSnapshot(authState)
        setLoading(false)
        setError('')
        return applyOrganisationState(nextState)
      }

    setLoading(true)
    setError('')

    const bootstrapTrace = createDashboardPerformanceTrace({
      metricName: DASHBOARD_PERFORMANCE_METRICS.organisationBootstrap,
      resourceOrigin: import.meta.env.VITE_SUPABASE_URL,
    })
    let bootstrapOutcome = 'success'
    let nextState = null
    try {
      nextState = await fetchAgencyOnboardingSettings({ forceRefresh })
      return applyOrganisationState(nextState)
    } catch (refreshError) {
      bootstrapOutcome = 'failed'
      setError(refreshError?.message || 'Unable to load organisation settings.')
      throw refreshError
    } finally {
      void persistDashboardPerformanceTrace(bootstrapTrace, {
        userId: authState.user.id,
        workspaceId: getOrganisationMetricWorkspaceId(authState, nextState),
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        appRole: authState.appRole || 'unknown',
        dashboardKind: 'organisation',
        lifecycle: 'refresh',
        outcome: bootstrapOutcome,
        hasData: Boolean(nextState),
        isInitialLoad: false,
      })
      setLoading(false)
    }
  }, [applyOrganisationState, authState])

  useEffect(() => {
    let active = true

    async function hydrateOrganisation() {
      if (authState.status !== 'authenticated' || !authState.user?.id) {
        if (active) {
          setState(null)
          setError('')
          setLoading(false)
        }
        return
      }

      if (isDevAuthOrganisation(authState)) {
        if (active) {
          applyOrganisationState(buildAuthOrganisationSnapshot(authState))
          setLoading(false)
          setError('')
        }
        return
      }

      if (shouldUseWorkspaceBranding(authState)) {
        if (active) {
          applyOrganisationState(buildWorkspaceOrganisationSnapshot(authState))
          setLoading(false)
          setError('')
        }
        return
      }

      if (active) {
        setLoading(true)
        setError('')
      }

      const bootstrapTrace = createDashboardPerformanceTrace({
        metricName: DASHBOARD_PERFORMANCE_METRICS.organisationBootstrap,
        resourceOrigin: import.meta.env.VITE_SUPABASE_URL,
      })
      let bootstrapOutcome = 'success'
      let nextState = null
      try {
        // Auth and workspace changes already clear the scoped runtime cache.
        // Keep initial hydration coalescible for StrictMode and colocated
        // consumers; explicit user-triggered refreshes still force a reload.
        nextState = await fetchAgencyOnboardingSettings()
        if (active) {
          applyOrganisationState(nextState)
        } else {
          bootstrapOutcome = 'cancelled'
        }
      } catch (hydrateError) {
        bootstrapOutcome = active ? 'failed' : 'cancelled'
        if (active) {
          setError(hydrateError?.message || 'Unable to load organisation settings.')
        }
      } finally {
        void persistDashboardPerformanceTrace(bootstrapTrace, {
          userId: authState.user.id,
          workspaceId: getOrganisationMetricWorkspaceId(authState, nextState),
          route: typeof window !== 'undefined' ? window.location.pathname : '',
          appRole: authState.appRole || 'unknown',
          dashboardKind: 'organisation',
          lifecycle: 'initial',
          outcome: bootstrapOutcome,
          hasData: Boolean(nextState),
          isInitialLoad: true,
        })
        if (active) {
          setLoading(false)
        }
      }
    }

    void hydrateOrganisation()

    return () => {
      active = false
    }
  }, [applyOrganisationState, authState])

  const value = useMemo(
    () => ({
      state: renderState,
      organisation: renderState?.organisation || null,
      organisationSettings: renderState?.organisationSettings || null,
      onboarding: renderState?.onboarding || renderState?.organisationSettings?.agencyOnboarding || null,
      membershipRole: renderState?.membershipRole || '',
      membershipStatus: renderState?.membershipStatus || '',
      branding: renderState?.branding || EMPTY_ORGANISATION_BRANDING,
      loading: loading && !hasImmediateSnapshot,
      error,
      refreshOrganisation,
      applyOrganisationState,
    }),
    [applyOrganisationState, error, hasImmediateSnapshot, loading, refreshOrganisation, renderState],
  )

  return <OrganisationContext.Provider value={value}>{children}</OrganisationContext.Provider>
}

export function useOrganisation() {
  const context = useContext(OrganisationContext)
  if (!context) {
    throw new Error('useOrganisation must be used within OrganisationProvider')
  }
  return context
}

export function useOptionalOrganisation() {
  return useContext(OrganisationContext)
}

export const __organisationContextTestUtils = Object.freeze({
  buildImmediateOrganisationSnapshot,
  buildWorkspaceOrganisationSnapshot,
  getAuthWorkspaceId,
  getOrganisationSnapshotWorkspaceId,
  resolveOrganisationRenderState,
})
