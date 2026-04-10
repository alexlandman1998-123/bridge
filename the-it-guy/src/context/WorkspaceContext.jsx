/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getOrCreateUserProfile, updateUserProfile } from '../lib/api'
import { DEMO_PROFILE_ID, getDevBypassUserId } from '../lib/demoIds'
import { APP_ROLE_LABELS, DEFAULT_APP_ROLE, INTERNAL_APP_ROLES, normalizeAppRole } from '../lib/roles'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const WorkspaceContext = createContext(null)
const PERSONA_PREVIEW_STORAGE_KEY = 'itg:persona-preview-role'
const WORKSPACE_STORAGE_KEY = 'itg:selected-workspace'

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
  const [personaPreviewRole, setPersonaPreviewRole] = useState(() => {
    if (typeof window === 'undefined') {
      return null
    }

    const storedValue = normalizeAppRole(window.localStorage.getItem(PERSONA_PREVIEW_STORAGE_KEY))
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
      return
    }

    setWorkspaceReady(true)
  }, [requiresInitialProfileBoot])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (isDevAuthBypass) {
        if (!active) return
        setProfile(bypassProfile)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        return
      }

      if (!isSupabaseConfigured) {
        if (!active) return
        setProfile(DEMO_PROFILE)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        return
      }

      if (!userId) {
        if (!active) return
        setProfile(null)
        setProfileLoading(false)
        setProfileError('')
        setWorkspaceReady(true)
        return
      }

      if (profile?.id === userId && !profileError) {
        if (!active) return
        setProfileLoading(false)
        setWorkspaceReady(true)
        return
      }

      try {
        if (active) {
          setProfileLoading(true)
          setProfileError('')
        }
        const nextProfile = await getOrCreateUserProfile({ user })
        if (!active) {
          return
        }
        setProfile(nextProfile)
        setWorkspaceReady(true)
      } catch (loadError) {
        if (!active) {
          return
        }
        setProfileError(loadError.message || 'Unable to load role profile.')
        setProfile(null)
        setWorkspaceReady(true)
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
  }, [bypassProfile, isDevAuthBypass, profile?.id, profileError, user, userId])

  const baseRole = normalizeAppRole(profile?.role || DEFAULT_APP_ROLE)
  const role =
    personaPreviewRole && INTERNAL_APP_ROLES.includes(personaPreviewRole)
      ? personaPreviewRole
      : baseRole
  const onboardingCompleted = Boolean(profile?.onboardingCompleted)
  const rolePreviewActive = Boolean(personaPreviewRole && personaPreviewRole !== baseRole)

  useEffect(() => {
    if (typeof window === 'undefined') {
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
      const latest = await getOrCreateUserProfile({ user })
      setProfile(latest)
      return latest
    } catch (refreshError) {
      if (!profile?.id) {
        setProfileError(refreshError.message || 'Unable to refresh profile.')
      }
      throw refreshError
    } finally {
      setProfileLoading(false)
    }
  }, [bypassProfile, isDevAuthBypass, profile, user])

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

    const updated = await updateUserProfile({
      userId: user.id,
      firstName: payload?.firstName,
      lastName: payload?.lastName,
      companyName: payload?.companyName,
      phoneNumber: payload?.phoneNumber,
      role: payload?.role,
      onboardingCompleted: payload?.onboardingCompleted,
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
      onboardingCompleted,
      refreshProfile,
      saveProfileDraft,
    }),
    [
      baseRole,
      onboardingCompleted,
      profile,
      profileError,
      profileLoading,
      workspaceReady,
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
