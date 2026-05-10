/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearStoredDevAuthRole, createDevAuthSession, getStoredDevAuthRole } from '../lib/devAuth'
import { clearSupabaseLocalAuthState, isSupabaseConfigured, isUnsupportedJwtAlgorithmError, supabase } from '../lib/supabaseClient'

const AUTH_BOOTSTRAP_TIMEOUT_MS = 15000

const AuthSessionContext = createContext(null)

export function AuthSessionProvider({ children }) {
  const [devAuthRole, setDevAuthRole] = useState(() => getStoredDevAuthRole())
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(isSupabaseConfigured && supabase && !devAuthRole))
  const [authError, setAuthError] = useState('')
  const devSession = useMemo(() => (devAuthRole ? createDevAuthSession(devAuthRole) : null), [devAuthRole])
  const effectiveSession = useMemo(() => session || devSession || null, [devSession, session])

  useEffect(() => {
    if (devAuthRole) {
      setAuthError('')
      setAuthLoading(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false)
      return
    }

    let active = true
    const timeoutError = new Error('Authentication bootstrap timed out. Please retry.')

    async function withTimeout(task) {
      let timeoutId = null
      try {
        return await Promise.race([
          task,
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(timeoutError), AUTH_BOOTSTRAP_TIMEOUT_MS)
          }),
        ])
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId)
        }
      }
    }

    async function loadSession() {
      console.debug('[AUTH] bootstrap:start')
      const { data, error } = await withTimeout(supabase.auth.getSession())
      if (!active) {
        return
      }

      if (error) {
        console.error('[AUTH] bootstrap:failed', error)
        if (isUnsupportedJwtAlgorithmError(error)) {
          await clearSupabaseLocalAuthState()
        }
        setAuthError(String(error?.message || 'Unable to restore your session.'))
        setSession(null)
        setAuthLoading(false)
        return
      }

      console.debug('[AUTH] bootstrap:success', { hasSession: Boolean(data?.session) })
      setAuthError('')
      setSession(data?.session || null)
      setAuthLoading(false)
    }

    void loadSession()

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      console.debug('[AUTH] state-change', { event, hasSession: Boolean(nextSession) })
      setSession(nextSession)
      setAuthLoading(false)
      setAuthError('')
    })

    return () => {
      active = false
      authSubscription.subscription.unsubscribe()
    }
  }, [devAuthRole])

  const retryAuthBootstrap = useCallback(() => {
    if (devAuthRole || !isSupabaseConfigured || !supabase) {
      return
    }

    setAuthError('')
    setAuthLoading(true)
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setAuthError(String(error?.message || 'Unable to restore your session.'))
          setSession(null)
        } else {
          setAuthError('')
          setSession(data?.session || null)
        }
        setAuthLoading(false)
      })
      .catch((error) => {
        setAuthError(String(error?.message || 'Unable to restore your session.'))
        setSession(null)
        setAuthLoading(false)
      })
  }, [devAuthRole])

  const logout = useCallback(async () => {
    clearStoredDevAuthRole()
    setDevAuthRole(null)

    if (!supabase) {
      setSession(null)
      return
    }

    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      session: effectiveSession,
      user: effectiveSession?.user || null,
      authLoading,
      authError,
      devAuthRole,
      setDevAuthRole,
      retryAuthBootstrap,
      logout,
    }),
    [authError, authLoading, devAuthRole, effectiveSession, logout, retryAuthBootstrap],
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
