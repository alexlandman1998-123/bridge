/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { updateUserProfile } from '../lib/profileApi'
import { useAuthSession } from './AuthSessionContext'
import { deriveOnboardingSetupState } from '../lib/onboardingRouting'
import { DEFAULT_APP_ROLE, normalizeAppRole } from '../lib/appRoleMetadata'
import { can, canAll, canAny, createPermissionResolver, getPermissionScope } from '../auth/permissions/permissionResolver'
import { completeOnboarding } from '../services/onboarding/onboardingEngine'
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
const DEFAULT_AGENCY_WORKFLOW_MODE = 'agent'
const UNRESOLVED_WORKSPACE = { id: '', name: 'Workspace setup required', type: '' }
const EMPTY_PROFILE_PATCH = {}

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

export function WorkspaceProvider({ children }) {
  const { authState, selectWorkspace } = useAuthSession()
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
      if (payload?.onboardingCompleted === true && baseRole !== 'client' && !authState.currentMembership?.id) {
        throw new Error('Workspace membership is required before onboarding can be marked complete.')
      }
      if (payload?.onboardingCompleted === true) {
        const completed = await completeOnboarding({
          userId: authState.user.id,
          user: authState.user,
          intent: signupIntent,
          appRole: payload.role || authState.appRole || profile?.role,
          workspaceType: authState.workspaceType,
          workspaceId: authState.currentWorkspace?.id || authState.currentMembership?.workspaceId,
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
      setAgencyWorkflowMode,
      setWorkspace,
      setupState,
      signupIntent,
      updateLocalProfile,
      workspace,
      workspaceReady,
      workspaceStatus,
      workspaceSetupStatus,
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
