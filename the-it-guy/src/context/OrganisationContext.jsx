/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuthSession } from './AuthSessionContext'
import { fetchAgencyOnboardingSettings } from '../lib/settingsApi'
import { resolveWorkspaceRole } from '../services/roleResolutionService'

const EMPTY_ORGANISATION_BRANDING = Object.freeze({
  logoUrl: '',
  organisationLabel: '',
  hasCustomLogo: false,
})

const OrganisationContext = createContext(null)

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeOrganisation(organisation = {}) {
  const logoUrl = normalizeText(organisation.logoUrl || organisation.logo_url)
  return {
    ...organisation,
    logoUrl,
    logo_url: logoUrl || null,
  }
}

function resolveOrganisationBranding(snapshot) {
  const onboarding = snapshot?.onboarding || snapshot?.organisationSettings?.agencyOnboarding || {}
  const organisation = normalizeOrganisation(snapshot?.organisation || {})
  const branding = onboarding?.branding || {}
  const agencyInformation = onboarding?.agencyInformation || {}

  const logoLightUrl = normalizeText(branding.logoLight)
  const logoDarkUrl = normalizeText(branding.logoDark)
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
    name: workspace.name || 'Bridge Workspace',
    displayName: workspace.name || 'Bridge Workspace',
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

function isDevAuthOrganisation(authState) {
  return authState.currentMembership?.source === 'dev_auth_bypass'
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

    setLoading(true)
    setError('')

    try {
      const nextState = await fetchAgencyOnboardingSettings({ forceRefresh })
      return applyOrganisationState(nextState)
    } catch (refreshError) {
      setError(refreshError?.message || 'Unable to load organisation settings.')
      throw refreshError
    } finally {
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

      if (active) {
        setLoading(true)
        setError('')
      }

      try {
        const nextState = await fetchAgencyOnboardingSettings({ forceRefresh: true })
        if (active) {
          applyOrganisationState(nextState)
        }
      } catch (hydrateError) {
        if (active) {
          setError(hydrateError?.message || 'Unable to load organisation settings.')
        }
      } finally {
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
      state,
      organisation: state?.organisation || null,
      organisationSettings: state?.organisationSettings || null,
      onboarding: state?.onboarding || state?.organisationSettings?.agencyOnboarding || null,
      membershipRole: state?.membershipRole || '',
      membershipStatus: state?.membershipStatus || '',
      branding: state?.branding || EMPTY_ORGANISATION_BRANDING,
      loading,
      error,
      refreshOrganisation,
      applyOrganisationState,
    }),
    [applyOrganisationState, error, loading, refreshOrganisation, state],
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
