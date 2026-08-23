/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { updateUserProfile } from '../lib/profileApi'
import { useAuthSession } from './AuthSessionContext'
import { deriveOnboardingSetupState } from '../lib/onboardingRouting'
import { DEFAULT_APP_ROLE, normalizeAppRole } from '../lib/appRoleMetadata'
import { can, canAll, canAny, createPermissionResolver, getPermissionScope } from '../auth/permissions/permissionResolver'
import { completeOnboarding } from '../services/onboarding/onboardingEngine'
import {
  BUSINESS_WORKSPACES,
  normalizeBusinessWorkspace,
  resolveBusinessWorkspaceRolloutAccess,
  resolveBusinessWorkspaceState,
} from '../lib/businessWorkspaceAccess'
import { getFeatureFlags } from '../lib/envValidation'
import {
  isOrganisationOwnerMembership,
  resolveActiveOrganisationMembership,
  resolveOrganisationMembershipRole,
} from '../lib/organisationMembershipResolution'
import { resolveCurrentWorkspaceAppRole } from '../services/roleResolutionService'

const WORKSPACE_CONTEXT_GLOBAL_KEY = '__arch9WorkspaceContextV1'
const WorkspaceContext =
  typeof globalThis !== 'undefined'
    ? (globalThis[WORKSPACE_CONTEXT_GLOBAL_KEY] ||= createContext(null))
    : createContext(null)
const AGENCY_WORKFLOW_MODE_STORAGE_KEY = 'itg:agency-workflow-mode:v1'
const BUSINESS_WORKSPACE_STORAGE_KEY = 'arch9:business-workspace:v1'
const DEFAULT_AGENCY_WORKFLOW_MODE = 'agent'
const UNRESOLVED_WORKSPACE = { id: '', name: 'Workspace setup required', type: '' }
const EMPTY_PROFILE_PATCH = {}

function normalizeText(value) {
  return String(value || '').trim()
}

function getMembershipWorkspaceId(membership = null) {
  return normalizeText(
    membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.workspace?.id ||
      membership?.organisationId ||
      membership?.organisation_id ||
      membership?.organizationId ||
      membership?.organization_id ||
      membership?.firmId ||
      membership?.firm_id ||
      membership?.raw?.workspace_id ||
      membership?.raw?.organisation_id ||
      membership?.raw?.organization_id ||
      membership?.raw?.firm_id,
  )
}

export function resolveOnboardingCompletionWorkspace(authState = {}) {
  const membershipCandidates = [
    authState.currentMembership,
    authState.membershipContexts?.effective,
    authState.membershipContexts?.organisation,
    authState.membershipContexts?.attorneyFirm,
    ...(Array.isArray(authState.currentMemberships) ? authState.currentMemberships : []),
    ...(Array.isArray(authState.activeMemberships) ? authState.activeMemberships : []),
  ].filter(Boolean)
  const membership = membershipCandidates.find((candidate) => candidate?.id) || null
  const workspaceId = normalizeText(authState.currentWorkspace?.id) || getMembershipWorkspaceId(membership)
  return {
    hasMembership: Boolean(membership?.id),
    workspaceId,
    membership,
  }
}

function normalizeAgencyWorkflowMode(value, fallback = DEFAULT_AGENCY_WORKFLOW_MODE) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'principal' || normalized === 'agent') return normalized
  return fallback
}

function normalizeWorkspaceSelection(nextWorkspace) {
  const id = String(nextWorkspace?.id || nextWorkspace?.workspaceId || '').trim()
  if (!id || id === 'all') return UNRESOLVED_WORKSPACE
  return {
    id,
    name: String(nextWorkspace?.name || '').trim() || 'Selected Workspace',
    type: String(nextWorkspace?.type || '').trim(),
  }
}

function resolveWorkspaceStatus(authState) {
  if (authState.status === 'loading') return 'loading'
  if (authState.status === 'unauthenticated') return 'unauthenticated'
  if (authState.status === 'error') return 'profile_error'
  if (!authState.profile?.id) return 'missing_profile'
  if (authState.onboardingRequiredReason) return authState.onboardingRequiredReason
  return 'active_user'
}

function readStoredBusinessWorkspace(storageKey = '') {
  if (typeof window === 'undefined' || !storageKey) return BUSINESS_WORKSPACES.sales
  try {
    const stored = JSON.parse(window.localStorage.getItem(BUSINESS_WORKSPACE_STORAGE_KEY) || '{}')
    if (stored?.key !== storageKey) return BUSINESS_WORKSPACES.sales
    return normalizeBusinessWorkspace(stored?.workspace, BUSINESS_WORKSPACES.sales)
  } catch {
    return BUSINESS_WORKSPACES.sales
  }
}

function writeStoredBusinessWorkspace(storageKey = '', workspace = BUSINESS_WORKSPACES.sales) {
  if (typeof window === 'undefined' || !storageKey) return
  window.localStorage.setItem(
    BUSINESS_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      key: storageKey,
      workspace: normalizeBusinessWorkspace(workspace, BUSINESS_WORKSPACES.sales),
    }),
  )
}

export function WorkspaceProvider({ children }) {
  const { authState, selectWorkspace } = useAuthSession()
  const featureFlags = getFeatureFlags()
  const rawProfile = authState.profile || null
  const [profilePatchState, setProfilePatchState] = useState({ userId: '', patch: {} })
  const activeProfilePatch = profilePatchState.userId === rawProfile?.id ? profilePatchState.patch : EMPTY_PROFILE_PATCH
  const profile = useMemo(
    () => (rawProfile ? { ...rawProfile, ...activeProfilePatch } : null),
    [activeProfilePatch, rawProfile],
  )
  const signupIntent = authState.signupIntent || null
  const onboardingState = authState.onboardingState || null
  const userId = authState.user?.id || null
  const baseRole = normalizeAppRole(authState.appRole || profile?.role || DEFAULT_APP_ROLE)
  const role = resolveCurrentWorkspaceAppRole({
    baseRole,
    workspaceType: authState.workspaceType || authState.currentWorkspace?.type,
    workspaceRole:
      authState.workspaceRole ||
      authState.currentMembership?.workspaceRole ||
      authState.currentMembership?.workspace_role ||
      authState.currentMembership?.role ||
      '',
  })
  const workspace = useMemo(
    () =>
      authState.currentWorkspace
        ? {
            id: authState.currentWorkspace.id,
            name: authState.currentWorkspace.name || 'Workspace',
            type: authState.currentWorkspace.type || authState.workspaceType || '',
          }
        : UNRESOLVED_WORKSPACE,
    [authState.currentWorkspace, authState.workspaceType],
  )
  const onboardingCompleted = Boolean(authState.onboardingComplete)
  const profileLoading = authState.status === 'loading'
  const profileError = authState.bootError || ''
  const workspaceReady = authState.status !== 'loading'
  const workspaceStatus = resolveWorkspaceStatus(authState)
  const workspaceAccessDegraded = authState.workspaceAccessDegraded === true
  const workspaceDegradedReason = String(authState.workspaceDegradedReason || '').trim()
  const workspaceDegradedMessage = String(authState.workspaceDegradedMessage || '').trim()
  const workspaceSetupStatus =
    authState.activeMemberships.length > 0
      ? 'active'
      : authState.pendingMemberships.length > 0
        ? 'pending_approval'
        : authState.suspendedMemberships.length > 0
          ? 'access_blocked'
          : authState.onboardingRequiredReason || 'setup_required'
  const setupState = useMemo(
    () => ({
      ...deriveOnboardingSetupState({ profile, baseRole }),
      organisationSetupStatus:
        authState.activeMemberships.length > 0
          ? 'complete'
          : authState.onboardingRequiredReason === 'no_active_membership'
            ? 'pending'
            : deriveOnboardingSetupState({ profile, baseRole }).organisationSetupStatus,
      moduleSetupStatus: authState.onboardingComplete ? 'complete' : 'pending',
      onboardingRequiredReason: authState.onboardingRequiredReason,
    }),
    [authState.activeMemberships.length, authState.onboardingComplete, authState.onboardingRequiredReason, baseRole, profile],
  )
  const permissionContext = useMemo(
    () => ({
      profile,
      appRole: baseRole,
      currentMembership: authState.currentMembership,
      currentMemberships: authState.currentMemberships,
      membershipContexts: authState.membershipContexts,
      currentWorkspace: authState.currentWorkspace,
      workspaceType: authState.workspaceType,
      activeMemberships: authState.activeMemberships,
    }),
    [authState.activeMemberships, authState.currentMembership, authState.currentMemberships, authState.currentWorkspace, authState.membershipContexts, authState.workspaceType, baseRole, profile],
  )
  const permissionResolver = useMemo(() => createPermissionResolver(permissionContext), [permissionContext])
  const organisationMembership = useMemo(
    () => resolveActiveOrganisationMembership({
      currentMembership: authState.currentMembership,
      currentMemberships: authState.currentMemberships,
      membershipContexts: authState.membershipContexts,
      currentWorkspace: authState.currentWorkspace,
    }),
    [authState.currentMembership, authState.currentMemberships, authState.currentWorkspace, authState.membershipContexts],
  )
  const organisationMembershipRole = resolveOrganisationMembershipRole(organisationMembership)
  const isOrganisationOwner = isOrganisationOwnerMembership(organisationMembership)
  const isAgentBaseRole = baseRole === 'agent'
  const [agencyWorkflowMode, setAgencyWorkflowModeState] = useState(DEFAULT_AGENCY_WORKFLOW_MODE)
  const [businessWorkspacePreferenceState, setBusinessWorkspacePreferenceState] = useState({
    key: '',
    workspace: BUSINESS_WORKSPACES.sales,
  })
  const businessWorkspaceRolloutAccess = useMemo(
    () => resolveBusinessWorkspaceRolloutAccess({
      enabled: featureFlags.salesRentalsWorkspaceSplitEnabled,
      requiresAllowlist: featureFlags.salesRentalsWorkspaceSplitRequiresAllowlist,
      allowedWorkspaceIdentifiers: featureFlags.salesRentalsWorkspaceAllowlist,
      allowedUserIdentifiers: featureFlags.salesRentalsUserAllowlist,
      currentWorkspace: authState.currentWorkspace,
      currentMembership: authState.currentMembership,
      profile,
      user: authState.user,
    }),
    [
      authState.currentMembership,
      authState.currentWorkspace,
      authState.user,
      featureFlags.salesRentalsUserAllowlist,
      featureFlags.salesRentalsWorkspaceAllowlist,
      featureFlags.salesRentalsWorkspaceSplitEnabled,
      featureFlags.salesRentalsWorkspaceSplitRequiresAllowlist,
      profile,
    ],
  )
  const businessWorkspaceSplitEnabled = businessWorkspaceRolloutAccess.enabled
  const businessWorkspaceStorageKey = useMemo(() => {
    if (!businessWorkspaceSplitEnabled || !userId || !workspace.id || workspace.id === 'all' || !isAgentBaseRole) return ''
    return `${userId}:${workspace.id}`
  }, [businessWorkspaceSplitEnabled, isAgentBaseRole, userId, workspace.id])
  const businessWorkspacePreference =
    businessWorkspacePreferenceState.key === businessWorkspaceStorageKey
      ? businessWorkspacePreferenceState.workspace
      : BUSINESS_WORKSPACES.sales
  const businessWorkspaceState = useMemo(
    () => resolveBusinessWorkspaceState({
      enabled: businessWorkspaceSplitEnabled,
      appRole: baseRole,
      workspaceType: authState.workspaceType || authState.currentWorkspace?.type,
      currentMembership: authState.currentMembership,
      membershipRole: organisationMembershipRole,
      preferredWorkspace: businessWorkspacePreference,
    }),
    [
      authState.currentMembership,
      authState.currentWorkspace?.type,
      authState.workspaceType,
      baseRole,
      businessWorkspacePreference,
      businessWorkspaceSplitEnabled,
      organisationMembershipRole,
    ],
  )

  useEffect(() => {
    if (!businessWorkspaceStorageKey) {
      setBusinessWorkspacePreferenceState((previous) =>
        previous.key || previous.workspace !== BUSINESS_WORKSPACES.sales
          ? { key: '', workspace: BUSINESS_WORKSPACES.sales }
          : previous,
      )
      return
    }
    setBusinessWorkspacePreferenceState((previous) => {
      if (previous.key === businessWorkspaceStorageKey) return previous
      return {
        key: businessWorkspaceStorageKey,
        workspace: readStoredBusinessWorkspace(businessWorkspaceStorageKey),
      }
    })
  }, [businessWorkspaceStorageKey])

  useEffect(() => {
    if (!businessWorkspaceStorageKey || businessWorkspacePreferenceState.key !== businessWorkspaceStorageKey) return
    if (businessWorkspacePreferenceState.workspace !== businessWorkspaceState.currentId) {
      setBusinessWorkspacePreferenceState({
        key: businessWorkspaceStorageKey,
        workspace: businessWorkspaceState.currentId,
      })
      return
    }
    writeStoredBusinessWorkspace(businessWorkspaceStorageKey, businessWorkspaceState.currentId)
  }, [businessWorkspacePreferenceState, businessWorkspaceState.currentId, businessWorkspaceStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!userId || !isAgentBaseRole) {
      window.localStorage.removeItem(AGENCY_WORKFLOW_MODE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(
      AGENCY_WORKFLOW_MODE_STORAGE_KEY,
      JSON.stringify({
        owner: userId,
        mode: normalizeAgencyWorkflowMode(agencyWorkflowMode),
      }),
    )
  }, [agencyWorkflowMode, isAgentBaseRole, userId])

  const setWorkspace = useCallback(
    (nextWorkspace) => {
      const resolved = typeof nextWorkspace === 'function' ? normalizeWorkspaceSelection(nextWorkspace(workspace)) : normalizeWorkspaceSelection(nextWorkspace)
      selectWorkspace(resolved.id)
    },
    [selectWorkspace, workspace],
  )

  const setAgencyWorkflowMode = useCallback(
    (nextMode) => {
      if (baseRole !== 'agent') {
        setAgencyWorkflowModeState(DEFAULT_AGENCY_WORKFLOW_MODE)
        return
      }
      setAgencyWorkflowModeState((previous) =>
        typeof nextMode === 'function'
          ? normalizeAgencyWorkflowMode(nextMode(previous))
          : normalizeAgencyWorkflowMode(nextMode),
      )
    },
    [baseRole],
  )

  const setBusinessWorkspace = useCallback(
    (nextWorkspace) => {
      if (!businessWorkspaceStorageKey || !businessWorkspaceSplitEnabled || baseRole !== 'agent') return
      setBusinessWorkspacePreferenceState((previous) => {
        const previousWorkspace = previous.key === businessWorkspaceStorageKey ? previous.workspace : businessWorkspaceState.currentId
        const requested = typeof nextWorkspace === 'function' ? nextWorkspace(previousWorkspace) : nextWorkspace
        const normalized = normalizeBusinessWorkspace(requested, previousWorkspace)
        const next = businessWorkspaceState.availableIds.includes(normalized) ? normalized : businessWorkspaceState.currentId
        return { key: businessWorkspaceStorageKey, workspace: next }
      })
    },
    [
      baseRole,
      businessWorkspaceState.availableIds,
      businessWorkspaceState.currentId,
      businessWorkspaceStorageKey,
      businessWorkspaceSplitEnabled,
    ],
  )

  const refreshProfile = useCallback(async () => {
    authState.refreshAuthState?.()
    return authState.profile || null
  }, [authState])

  const retryWorkspaceBootstrap = useCallback(() => {
    authState.refreshAuthState?.()
  }, [authState])

  const updateLocalProfile = useCallback((patch = {}) => {
    const profileId = rawProfile?.id || ''
    setProfilePatchState((previous) => ({
      userId: profileId,
      patch: previous.userId === profileId ? { ...previous.patch, ...patch } : { ...patch },
    }))
  }, [rawProfile?.id])

  const saveProfileDraft = useCallback(
    async (payload = {}) => {
      if (!authState.user?.id) {
        throw new Error('You must be signed in before updating your profile.')
      }
      const completionWorkspace = resolveOnboardingCompletionWorkspace(authState)
      if (payload?.onboardingCompleted === true && baseRole !== 'client' && !completionWorkspace.hasMembership) {
        throw new Error('Workspace membership is required before onboarding can be marked complete.')
      }
      if (payload?.onboardingCompleted === true) {
        const completed = await completeOnboarding({
          userId: authState.user.id,
          user: authState.user,
          intent: signupIntent,
          appRole: payload.role || authState.appRole || profile?.role,
          workspaceType: authState.workspaceType,
          workspaceId: completionWorkspace.workspaceId,
          profilePatch: {
            first_name: payload.firstName || undefined,
            last_name: payload.lastName || undefined,
            company_name: payload.companyName || undefined,
            phone_number: payload.phoneNumber || undefined,
            avatar_url: payload.avatarUrl || undefined,
          },
          context: { source: 'workspace_context_save_profile_draft' },
        })
        authState.refreshAuthState?.()
        return completed.profile
      }

      const updated = await updateUserProfile({
        userId: authState.user.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        companyName: payload.companyName,
        phoneNumber: payload.phoneNumber,
        avatarUrl: payload.avatarUrl,
        role: payload.role,
        onboardingCompleted: payload.onboardingCompleted,
      })
      authState.refreshAuthState?.()
      return updated
    },
    [authState, baseRole, profile?.role, signupIntent],
  )

  const value = useMemo(
    () => ({
      workspace,
      setWorkspace,
      allWorkspace: UNRESOLVED_WORKSPACE,
      role,
      baseRole,
      agencyWorkflowMode,
      setAgencyWorkflowMode,
      businessWorkspace: businessWorkspaceState.current,
      businessWorkspaceId: businessWorkspaceState.currentId,
      availableBusinessWorkspaces: businessWorkspaceState.available,
      availableBusinessWorkspaceIds: businessWorkspaceState.availableIds,
      businessWorkspaceSplitEnabled: businessWorkspaceState.enabled,
      showBusinessWorkspaceSwitcher: businessWorkspaceState.showSwitcher,
      setBusinessWorkspace,
      profile,
      signupIntent,
      onboardingState,
      profileLoading,
      workspaceReady,
      profileError,
      workspaceStatus,
      workspaceSetupStatus,
      onboardingCompleted,
      setupState,
      memberships: authState.memberships,
      activeMemberships: authState.activeMemberships,
      pendingMemberships: authState.pendingMemberships,
      suspendedMemberships: authState.suspendedMemberships,
      currentMembership: authState.currentMembership,
      currentMemberships: authState.currentMemberships,
      membershipContexts: authState.membershipContexts,
      organisationMembership,
      organisationMembershipRole,
      isOrganisationOwner,
      currentWorkspace: authState.currentWorkspace,
      workspaceType: authState.workspaceType,
      workspaceRole: authState.workspaceRole,
      permissions: authState.permissions || {},
      workspaceResolution: authState.workspaceResolution || null,
      workspaceDiagnostics: authState.workspaceDiagnostics || null,
      workspaceAccessDegraded,
      workspaceDegradedReason,
      workspaceDegradedMessage,
      onboardingRequiredReason: authState.onboardingRequiredReason,
      permissionResolver,
      can: (permission) => can(permission, permissionContext),
      canAny: (permissions) => canAny(permissions, permissionContext),
      canAll: (permissions) => canAll(permissions, permissionContext),
      getPermissionScope: (permission) => getPermissionScope(permission, permissionContext),
      refreshProfile,
      retryWorkspaceBootstrap,
      updateLocalProfile,
      saveProfileDraft,
    }),
    [
      agencyWorkflowMode,
      authState.activeMemberships,
      authState.currentMembership,
      authState.currentMemberships,
      authState.membershipContexts,
      organisationMembership,
      organisationMembershipRole,
      isOrganisationOwner,
      authState.currentWorkspace,
      authState.memberships,
      authState.pendingMemberships,
      authState.permissions,
      authState.onboardingRequiredReason,
      onboardingState,
      authState.suspendedMemberships,
      authState.workspaceDiagnostics,
      authState.workspaceResolution,
      authState.workspaceRole,
      authState.workspaceType,
      baseRole,
      businessWorkspaceState.available,
      businessWorkspaceState.availableIds,
      businessWorkspaceState.current,
      businessWorkspaceState.currentId,
      businessWorkspaceState.enabled,
      businessWorkspaceState.showSwitcher,
      onboardingCompleted,
      permissionContext,
      permissionResolver,
      profile,
      profileError,
      profileLoading,
      refreshProfile,
      retryWorkspaceBootstrap,
      role,
      saveProfileDraft,
      setBusinessWorkspace,
      setAgencyWorkflowMode,
      setWorkspace,
      setupState,
      signupIntent,
      updateLocalProfile,
      workspace,
      workspaceReady,
      workspaceStatus,
      workspaceSetupStatus,
      workspaceAccessDegraded,
      workspaceDegradedMessage,
      workspaceDegradedReason,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}
