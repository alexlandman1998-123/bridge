import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recordAuditEvent } from '../lib/activityAudit'
import { clearPostLoginRedirect } from '../lib/resolveMobileAwareRedirect'
import { clearSupabaseLocalAuthState, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const MIN_PASSWORD_LENGTH = 8
const SUCCESS_REDIRECT_DELAY_MS = 900
export const INVALID_RECOVERY_SESSION_MESSAGE = 'This password reset link is invalid or has expired. Request a new reset link.'

export function getRecoverySessionError(error) {
  const message = String(error?.message || '').toLowerCase()
  if (
    message.includes('session') ||
    message.includes('refresh token') ||
    message.includes('invalid token') ||
    message.includes('expired')
  ) {
    return INVALID_RECOVERY_SESSION_MESSAGE
  }

  return error?.message || 'We could not update your password. Please try again.'
}

export function validateAgentResetPassword({ password = '', confirmPassword = '' } = {}) {
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.'
  }

  return ''
}

export async function resolveAgentPasswordRecoverySession(authClient) {
  if (!authClient?.getSession) {
    return {
      hasSession: false,
      error: 'Password reset is not available in this environment.',
    }
  }

  try {
    const { data, error } = await authClient.getSession()
    if (error) throw error
    const session = data?.session || null
    return {
      hasSession: Boolean(session),
      error: session ? '' : INVALID_RECOVERY_SESSION_MESSAGE,
    }
  } catch (error) {
    return {
      hasSession: false,
      error: getRecoverySessionError(error),
      cause: error,
    }
  }
}

export async function updateAgentPasswordWithRecoverySession(authClient, password) {
  if (!authClient?.updateUser) {
    throw new Error('Password reset is not available in this environment.')
  }

  const { data, error } = await authClient.updateUser({ password })
  if (error) throw error
  return data?.user || null
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const redirectTimerRef = useRef(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function checkSession() {
      if (!isSupabaseConfigured || !supabase) {
        if (!active) return
        setCheckingSession(false)
        setHasRecoverySession(false)
        setError('Password reset is not available in this environment.')
        return
      }

      try {
        const result = await resolveAgentPasswordRecoverySession(supabase.auth)
        if (!active) return
        setHasRecoverySession(result.hasSession)
        setCheckingSession(false)
        if (result.error) {
          setError(result.error)
        }
        if (result.cause) {
          console.warn('[AUTH] password reset session check failed', {
            name: result.cause?.name || '',
            message: result.cause?.message || '',
            status: result.cause?.status || '',
          })
        }
      } catch (sessionError) {
        console.warn('[AUTH] password reset session check failed', {
          name: sessionError?.name || '',
          message: sessionError?.message || '',
          status: sessionError?.status || '',
        })
        if (!active) return
        setCheckingSession(false)
        setHasRecoverySession(false)
        setError(getRecoverySessionError(sessionError))
      }
    }

    void checkSession()

    return () => {
      active = false
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  async function handleReturnToSignIn() {
    await clearSupabaseLocalAuthState()
    navigate('/auth', { replace: true })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!hasRecoverySession || saving) return

    const nextPassword = password
    setError('')
    setMessage('')

    const validationError = validateAgentResetPassword({
      password: nextPassword,
      confirmPassword,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setSaving(true)
      const user = await updateAgentPasswordWithRecoverySession(supabase.auth, nextPassword)

      clearPostLoginRedirect()
      recordAuditEvent('agent_password_reset_completed', {
        userId: user?.id || '',
      })
      setPassword('')
      setConfirmPassword('')
      setMessage('Password updated.')
      redirectTimerRef.current = window.setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, SUCCESS_REDIRECT_DELAY_MS)
    } catch (updateError) {
      console.warn('[AUTH] password reset update failed', {
        name: updateError?.name || '',
        message: updateError?.message || '',
        status: updateError?.status || '',
      })
      setError(getRecoverySessionError(updateError))
    } finally {
      setSaving(false)
    }
  }

  if (checkingSession) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Opening your reset link...</h2>
          <p>Checking the secure recovery session.</p>
        </div>
      </section>
    )
  }

  return (
    <div className="auth-page auth-page-login">
      <main className="auth-shell">
        <section className="auth-hero">
          <div className="auth-hero-glow" aria-hidden="true" />
          <div className="auth-network-pattern" aria-hidden="true" />
          <div className="auth-hero-orbit" aria-hidden="true" />
          <div className="auth-hero-top">
            <p className="auth-brand">Arch9</p>
          </div>
          <div className="auth-hero-copy">
            <h1>Secure access, <span>restored.</span></h1>
            <p>Choose a new password for your Arch9 agent workspace.</p>
          </div>

          <div className="auth-architecture" aria-hidden="true">
            <span className="auth-building auth-building-one" />
            <span className="auth-building auth-building-two" />
            <span className="auth-building auth-building-three" />
            <span className="auth-connection auth-connection-one" />
            <span className="auth-connection auth-connection-two" />
            <span className="auth-connection auth-connection-three" />
            <i className="auth-node auth-node-one" />
            <i className="auth-node auth-node-two" />
            <i className="auth-node auth-node-three" />
          </div>

          <div className="auth-hero-trust">
            <ShieldCheck size={22} />
            <span>Recovery links are verified before your password can be changed</span>
          </div>
        </section>

        <section className="auth-card auth-card-login">
          <form id="agent-reset-password-form" className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-card-head compact">
              <span className="auth-card-eyebrow">Agent Access</span>
              <h2>Set a new password</h2>
              <p>Use at least 8 characters. Once saved, we will take you back into your workspace.</p>
            </div>

            <div className="auth-field-stack">
              <div className="auth-password-field">
                <label htmlFor="agent-reset-password">New password</label>
                <div className="auth-password-input">
                  <input
                    id="agent-reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    disabled={!hasRecoverySession || saving || Boolean(message)}
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={!hasRecoverySession || saving || Boolean(message)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="auth-password-field">
                <label htmlFor="agent-reset-confirm-password">Confirm password</label>
                <div className="auth-password-input">
                  <input
                    id="agent-reset-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    disabled={!hasRecoverySession || saving || Boolean(message)}
                    required
                  />
                </div>
              </div>
            </div>

            {error ? <p className="auth-feedback error">{error}</p> : null}
            {message ? (
              <p className="auth-feedback success">
                <CheckCircle2 size={16} />
                {message}
              </p>
            ) : null}
          </form>

          {hasRecoverySession && !message ? (
            <button type="submit" form="agent-reset-password-form" className="auth-submit" disabled={saving}>
              {saving ? 'Updating...' : 'Update password'}
              {!saving ? <ArrowRight size={15} /> : null}
            </button>
          ) : null}

          {message ? (
            <button type="button" className="auth-submit" onClick={() => navigate('/dashboard', { replace: true })}>
              Continue to dashboard
              <ArrowRight size={15} />
            </button>
          ) : null}

          {!hasRecoverySession ? (
            <button type="button" className="auth-secondary-cta" onClick={handleReturnToSignIn}>
              <ArrowLeft size={14} />
              Return to sign in
            </button>
          ) : null}
        </section>
      </main>
    </div>
  )
}
