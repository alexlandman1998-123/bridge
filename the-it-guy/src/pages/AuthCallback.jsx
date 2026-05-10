import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { recordAuditEvent } from '../lib/activityAudit'
import { clearSupabaseLocalAuthState, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const AUTH_CALLBACK_TIMEOUT_MS = 15000
const PENDING_ORG_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'

function resolveSafeNextPath(search = '') {
  const raw = new URLSearchParams(search).get('next')
  if (!raw || !raw.startsWith('/')) return '/onboarding/profile'
  if (raw.startsWith('/auth/callback')) return '/onboarding/profile'
  return raw
}

function resolvePendingInvitePath() {
  if (typeof window === 'undefined') return ''
  const token = String(window.sessionStorage.getItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY) || '').trim()
  if (!token) return ''
  return `/agent/invite/${token}`
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      console.debug('[AUTH] callback:start', {
        search: location.search,
        hasHash: Boolean(location.hash),
        attempt: attempt + 1,
      })

      if (!isSupabaseConfigured || !supabase) {
        console.debug('[AUTH] callback:fallback-no-supabase')
        if (!active) return
        navigate('/onboarding/profile', { replace: true })
        return
      }

      const timeoutError = new Error('Authentication callback timed out. Please retry.')
      try {
        setStatus('loading')
        setError('')

        const withTimeout = async (task) => {
          let localTimeoutId = null
          try {
            return await Promise.race([
              task,
              new Promise((_, reject) => {
                localTimeoutId = window.setTimeout(() => reject(timeoutError), AUTH_CALLBACK_TIMEOUT_MS)
              }),
            ])
          } finally {
            if (localTimeoutId) {
              window.clearTimeout(localTimeoutId)
            }
          }
        }

        const code = new URLSearchParams(location.search).get('code')
        if (code) {
          console.debug('[AUTH] callback:exchange-code:start')
          const { error: exchangeError } = await withTimeout(supabase.auth.exchangeCodeForSession(code))
          if (exchangeError) {
            throw exchangeError
          }
          console.debug('[AUTH] callback:exchange-code:success')
        }

        let session = null
        for (let index = 0; index < 6; index += 1) {
          const { data, error: sessionError } = await withTimeout(supabase.auth.getSession())
          if (sessionError) throw sessionError
          session = data?.session || null
          if (session) break
          await new Promise((resolve) => window.setTimeout(resolve, 250))
        }

        if (!session) {
          throw new Error('Session could not be restored from the verification callback.')
        }

        const pendingInvitePath = resolvePendingInvitePath()
        const target = pendingInvitePath || resolveSafeNextPath(location.search)
        recordAuditEvent('session_restored_from_callback', {
          target,
          pendingInvite: Boolean(pendingInvitePath),
        })
        console.debug('[REDIRECT] callback:success', { target, pendingInvite: Boolean(pendingInvitePath) })
        if (!active) return
        navigate(target, { replace: true })
      } catch (restoreError) {
        console.error('[AUTH] callback:failed', restoreError)
        if (!active) return
        setStatus('error')
        setError(restoreError?.message || 'Unable to restore your verified session.')
      } finally {
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [attempt, location.hash, location.search, navigate])

  if (status === 'loading') {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Finalizing your sign in…</h2>
          <p>Restoring your verified session and preparing onboarding.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card">
        <h2>We could not complete sign in.</h2>
        <p>{error || 'Something went wrong while restoring your session.'}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="auth-primary-cta"
            onClick={() => {
              setAttempt((previous) => previous + 1)
            }}
          >
            Retry
          </button>
          <button
            type="button"
            className="auth-secondary-cta"
            onClick={async () => {
              await clearSupabaseLocalAuthState()
              navigate('/auth', { replace: true })
            }}
          >
            Return to Sign-in
          </button>
          <button
            type="button"
            className="auth-secondary-cta"
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </section>
  )
}
