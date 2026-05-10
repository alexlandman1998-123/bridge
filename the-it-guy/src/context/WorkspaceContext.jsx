/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getOrCreateUserProfile, updateUserProfile } from '../lib/api'
import { DEMO_PROFILE_ID, getDevBypassUserId } from '../lib/demoIds'
import { deriveOnboardingSetupState } from '../lib/onboardingRouting'
import { APP_ROLE_LABELS, DEFAULT_APP_ROLE, INTERNAL_APP_ROLES, normalizeAppRole } from '../lib/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const WorkspaceContext = createContext(null)
const PERSONA_PREVIEW_STORAGE_KEY = 'itg:persona-preview-role'
const WORKSPACE_STORAGE_KEY = 'itg:selected-workspace'
const ENABLE_PERSONA_PREVIEW = true
const PROFILE_BOOTSTRAP_TIMEOUT_MS = 15000

const ALL_WORKSPACE = { id: 'all', name: 'All Developments' }
const DEMO_PROFILE = {
  id: DEMO_PROFILE_ID,
  email: null,
  firstName: '',
  lastName: '',
  fullName: 'Demo User',
  companyName: '',
  phoneNumber: '',
  role: DEFAULT_APP_ROLE,
  onboardingCompleted: true,
  createdAt: null,
  updatedAt: null,
}

function resolveStoredWorkspace() {
  if (typeof window === 'undefined') {
    return ALL_WORKSPACE
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!raw) {
      return ALL_WORKSPACE
    }

    const parsed = JSON.parse(raw)
    const id = String(parsed?.id || '').trim()
    const name = String(parsed?.name || '').trim()

    if (!id || id === 'all') {
      return ALL_WORKSPACE
    }

    return {
      id,
      name: name || 'Selected Development',
    }
  } catch {
    return ALL_WORKSPACE
  }
}

function normalizeWorkspaceSelection(nextWorkspace) {
  const id = String(nextWorkspace?.id || '').trim()
  if (!id || id === 'all') {
    return ALL_WORKSPACE
  }

  return {
    id,
    name: String(nextWorkspace?.name || '').trim() || 'Selected Development',
  }
}

export function WorkspaceProvider({ children, user = null, authBypassRole = null }) {
  const [workspace, setWorkspaceState] = useState(() => resolveStoredWorkspace())
  const bypassRole = normalizeAppRole(authBypassRole || '')
  const isDevAuthBypass = import.meta.env.DEV && Boolean(authBypassRole)
  const userId = user?.id || null
  const userEmail = user?.email || null
  const bypassProfile = useMemo(
    () =>
      isDevAuthBypass
        ? {
            ...DEMO_PROFILE,
            id: getDevBypassUserId(bypassRole),
            role: bypassRole,
            email: userEmail || `${bypassRole.replace(/_/g, '.')}@bridge.local`,
            firstName: 'Demo',
            lastName: 'User',
            fullName: `Demo ${APP_ROLE_LABELS[bypassRole] || 'Workspace User'}`,
          }
        : null,
    [bypassRole, isDevAuthBypass, userEmail],
  )
  const requiresInitialProfileBoot = Boolean(isSupabaseConfigured && !isDevAuthBypass && userId)
  const [profile, setProfile] = useState(() => (isSupabaseConfigured && !isDevAuthBypass ? null : bypassProfile || DEMO_PROFILE))
  const [profileLoading, setProfileLoading] = useState(Boolean(requiresInitialProfileBoot))
  const [profileError, setProfileError] = useState('')
  const [workspaceReady, setWorkspaceReady] = useState(() => !requiresInitialProfileBoot)
  const [workspaceStatus, setWorkspaceStatus] = useState(() => {
    if (!userId) return 'unauthenticated'
    if (requiresInitialProfileBoot) return 'authenticated_no_profile'
    return 'active_user'
  })
  const [profileBootstrapAttempt, setProfileBootstrapAttempt] = useState(0)
  const [personaPreviewRole, setPersonaPreviewRole] = useState(() => {
    if (!ENABLE_PERSONA_PREVIEW) {
      return null
    }

    if (typeof window === 'undefined') {
      return null
    }

    const rawValue = String(window.localStorage.getItem(PERSONA_PREVIEW_STORAGE_KEY) || '').trim()
    if (!rawValue) {
      return null
    }

    const storedValue = normalizeAppRole(rawValue)
    return INTERNAL_APP_ROLES.includes(storedValue) ? storedValue : null
  })

  const setWorkspace = useCallback((nextWorkspace) => {
    setWorkspaceState((previous) => {
      const resolvedWorkspace =
        typeof nextWorkspace === 'function' ? normalizeWorkspaceSelection(nextWorkspace(previous)) : normalizeWorkspaceSelection(nextWorkspace)
      return resolvedWorkspace
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const selection = normalizeWorkspaceSelection(workspace)
    if (selection.id === 'all') {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        ...selection,
        owner: userId || null,
      }),
    )
  }, [userId, workspace])

  useEffect(() => {
    if (!userId) {
      setWorkspaceState(ALL_WORKSPACE)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      }
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw)
      const owner = String(parsed?.owner || '').trim()
      if (owner && owner !== userId) {
        setWorkspaceState(ALL_WORKSPACE)
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      }
    } catch {
      setWorkspaceState(ALL_WORKSPACE)
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
    }
  }, [userId])

  useEffect(() => {
    if (requiresInitialProfileBoot) {
      setWorkspaceReady(false)
      setWorkspaceStatus('authenticated_no_profile')
      return
    }

    setWorkspaceReady(true)
    if (!userId) {
      setWorkspaceStatus('unauthenticated')
      return
    }
    setWorkspaceStatus('active_user')
  }, [requiresInitialProfileBoot])

  useEffect(() => {
    let active = true
    const timeoutError = new Error('We couldn’t resolve your account profile in time. Please retry.')

    async function withTimeout(task) {
      let timeoutId = null
      try {
        return await Promise.race([
          task,
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(timeoutError), PROFILE_BOOTSTRAP_TIMEOUT_MS)
          }),
        ])
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId)
        }
      }
    }

    async function loadProfile() {
      if (isDevAuthBypass) {
        if (!active) return
        console.debug('[PROFILE] bootstrap:dev-bypass', { userId: userId || null, role: bypassRole })
        setProfile(bypassProfile)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        setWorkspaceStatus('active_user')
        return
      }

      if (!isSupabaseConfigured) {
        if (!active) return
        console.debug('[PROFILE] bootstrap:demo-fallback')
        setProfile(DEMO_PROFILE)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        setWorkspaceStatus('active_user')
        return
      }

      if (!userId) {
        if (!active) return
        console.debug('[PROFILE] bootstrap:unauthenticated')
        setProfile(null)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        setWorkspaceStatus('unauthenticated')
        return
      }

      if (profileError) {
        if (!active) return
        // Avoid repeated failing bootstrap calls until user retries explicitly.
        setProfileLoading(false)
        setWorkspaceReady(true)
        setWorkspaceStatus('profile_error')
        return
      }

      if (profile?.id === userId && !profileError) {
        if (!active) return
        console.debug('[PROFILE] bootstrap:cached', { userId })
        setProfileLoading(false)
        setWorkspaceReady(true)
        setWorkspaceStatus('active_user')
        return
      }

      try {
        if (active) {
          setProfileLoading(true)
          setProfileError('')
          setWorkspaceStatus('authenticated_no_profile')
        }
        console.debug('[PROFILE] bootstrap:start', {
          userId,
          attempt: profileBootstrapAttempt + 1,
        })
        const nextProfile = await withTimeout(getOrCreateUserProfile({ user }))
        if (!active) {
          return
        }
        console.debug('[PROFILE] bootstrap:success', {
          userId,
          role: nextProfile?.role || null,
          onboardingCompleted: Boolean(nextProfile?.onboardingCompleted),
        })
        setProfile(nextProfile)
        setWorkspaceReady(true)
        setWorkspaceStatus(nextProfile?.onboardingCompleted ? 'onboarding_complete' : 'onboarding_in_progress')
      } catch (loadError) {
        if (!active) {
          return
        }
        console.error('[PROFILE] bootstrap:failed', loadError)
        setProfileError(loadError.message || 'Unable to load role profile.')
        setProfile(null)
        setWorkspaceReady(true)
        setWorkspaceStatus('profile_error')
      } finally {
        if (active) {
          setProfileLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [bypassProfile, bypassRole, isDevAuthBypass, profile?.id, profileError, profileBootstrapAttempt, user, userId])

  const baseRole = normalizeAppRole(profile?.role || DEFAULT_APP_ROLE)
  const role =
    ENABLE_PERSONA_PREVIEW && personaPreviewRole && INTERNAL_APP_ROLES.includes(personaPreviewRole)
      ? personaPreviewRole
      : baseRole
  const onboardingCompleted = Boolean(profile?.onboardingCompleted)
  const rolePreviewActive = Boolean(ENABLE_PERSONA_PREVIEW && personaPreviewRole && personaPreviewRole !== baseRole)
  const setupState = useMemo(
    () => deriveOnboardingSetupState({ profile, baseRole }),
    [baseRole, profile],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!ENABLE_PERSONA_PREVIEW) {
      window.localStorage.removeItem(PERSONA_PREVIEW_STORAGE_KEY)
      if (personaPreviewRole) {
        setPersonaPreviewRole(null)
      }
      return
    }

    if (rolePreviewActive && INTERNAL_APP_ROLES.includes(personaPreviewRole)) {
      window.localStorage.setItem(PERSONA_PREVIEW_STORAGE_KEY, personaPreviewRole)
      return
    }

    window.localStorage.removeItem(PERSONA_PREVIEW_STORAGE_KEY)
    if (!rolePreviewActive && personaPreviewRole) {
      setPersonaPreviewRole(null)
    }
  }, [personaPreviewRole, rolePreviewActive])

  const setActivePersona = useCallback(
    (nextRole) => {
      if (!ENABLE_PERSONA_PREVIEW) {
        setPersonaPreviewRole(null)
        return
      }

      const normalized = normalizeAppRole(nextRole)
      if (!INTERNAL_APP_ROLES.includes(normalized) || normalized === baseRole) {
        setPersonaPreviewRole(null)
        return
      }

      setPersonaPreviewRole(normalized)
    },
    [baseRole],
  )

  const refreshProfile = useCallback(async () => {
      if (isDevAuthBypass) {
        return bypassProfile
      }

      if (!isSupabaseConfigured || !user?.id) {
        return profile || DEMO_PROFILE
      }

    setProfileLoading(true)
    setProfileError('')
    try {
      setWorkspaceStatus('authenticated_no_profile')
      const latest = await getOrCreateUserProfile({ user })
      setProfile(latest)
      setWorkspaceStatus(latest?.onboardingCompleted ? 'onboarding_complete' : 'onboarding_in_progress')
      return latest
    } catch (refreshError) {
      if (!profile?.id) {
        setProfileError(refreshError.message || 'Unable to refresh profile.')
      }
      setWorkspaceStatus('profile_error')
      throw refreshError
    } finally {
      setProfileLoading(false)
    }
  }, [bypassProfile, isDevAuthBypass, profile, user])

  const retryWorkspaceBootstrap = useCallback(() => {
    setProfileError('')
    setWorkspaceReady(false)
    setProfileLoading(true)
    setWorkspaceStatus('authenticated_no_profile')
    setProfileBootstrapAttempt((previous) => previous + 1)
  }, [])

  const saveProfileDraft = useCallback(async (payload) => {
    if (isDevAuthBypass) {
      const merged = {
        ...(profile || bypassProfile || DEMO_PROFILE),
        ...payload,
        role: normalizeAppRole(payload?.role || role),
      }
      setProfile(merged)
      return merged
    }

    if (!isSupabaseConfigured || !user?.id) {
      const merged = {
        ...(profile || DEMO_PROFILE),
        ...payload,
        role: normalizeAppRole(payload?.role || role),
      }
      setProfile(merged)
      return merged
    }

    const mergedDraft = {
      firstName: payload?.firstName !== undefined ? payload.firstName : profile?.firstName,
      lastName: payload?.lastName !== undefined ? payload.lastName : profile?.lastName,
      companyName: payload?.companyName !== undefined ? payload.companyName : profile?.companyName,
      phoneNumber: payload?.phoneNumber !== undefined ? payload.phoneNumber : profile?.phoneNumber,
      role: payload?.role !== undefined ? payload.role : role,
      onboardingCompleted: payload?.onboardingCompleted,
    }

    console.debug('[PROFILE] draft:save', {
      userId: user?.id || null,
      role: mergedDraft.role || null,
      onboardingCompleted: mergedDraft.onboardingCompleted ?? null,
    })

    const updated = await updateUserProfile({
      userId: user.id,
      firstName: mergedDraft.firstName,
      lastName: mergedDraft.lastName,
      companyName: mergedDraft.companyName,
      phoneNumber: mergedDraft.phoneNumber,
      role: mergedDraft.role,
      onboardingCompleted: mergedDraft.onboardingCompleted,
    })
    setProfile(updated)
    return updated
  }, [bypassProfile, isDevAuthBypass, profile, role, user])

  const value = useMemo(
    () => ({
      workspace,
      setWorkspace,
      allWorkspace: ALL_WORKSPACE,
      role,
      baseRole,
      rolePreviewActive,
      activePersona: role,
      setActivePersona,
      personaOptions: INTERNAL_APP_ROLES.map((item) => ({ value: item, label: APP_ROLE_LABELS[item] || item })),
      profile,
      profileLoading,
      workspaceReady,
      profileError,
      workspaceStatus,
      onboardingCompleted,
      setupState,
      refreshProfile,
      retryWorkspaceBootstrap,
      saveProfileDraft,
    }),
    [
      baseRole,
      onboardingCompleted,
      setupState,
      profile,
      profileError,
      profileLoading,
      retryWorkspaceBootstrap,
      workspaceReady,
      workspaceStatus,
      refreshProfile,
      role,
      rolePreviewActive,
      saveProfileDraft,
      setActivePersona,
      workspace,
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
