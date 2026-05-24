import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { setStoredDevAuthRole } from '../lib/devAuth'
import { APP_ROLE_LABELS } from '../lib/roles'
import {
  clearSupabaseLocalAuthState,
  isSupabaseConfigured,
  isUnsupportedJwtAlgorithmError,
  supabase,
} from '../lib/supabaseClient'

function getRedirectPath(location) {
  const nextPath = new URLSearchParams(location.search).get('next')
  if (typeof nextPath === 'string' && nextPath.startsWith('/')) {
    return nextPath
  }

  const fromPath = location.state?.from?.pathname
  if (typeof fromPath === 'string' && fromPath.startsWith('/')) {
    return fromPath
  }

  return '/dashboard'
}

function resolveEmailVerificationRedirectTo() {
  const candidates = [
    import.meta?.env?.VITE_PUBLIC_APP_URL,
    import.meta?.env?.VITE_APP_BASE_URL,
    import.meta?.env?.VITE_SITE_URL,
    typeof window !== 'undefined' ? window.location.origin : '',
  ]

  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (!value) continue
    try {
      const baseUrl = new URL(value)
      const redirectUrl = new URL('/auth/callback', baseUrl.origin)
      redirectUrl.searchParams.set('next', '/onboarding/profile')
      return redirectUrl.toString()
    } catch {
      // Ignore malformed URL candidates and continue.
    }
  }

  return undefined
}

function resolvePendingInvitePath() {
  if (typeof window === 'undefined') return ''
  const pendingInviteToken = String(window.sessionStorage.getItem('itg:pending-org-invite-token') || '').trim()
  if (!pendingInviteToken) return ''
  return `/agent/invite/${pendingInviteToken}`
}

const DEV_BYPASS_ROLES = ['developer', 'agent', 'attorney', 'bond_originator']
const RESEND_COOLDOWN_SECONDS = 90
const RESEND_COOLDOWN_STORAGE_KEY = 'itg:auth:resend-cooldown-until'

function normalizeErrorMessage(error) {
  return String(error?.message || error || '').trim()
}

function isAuthRateLimitError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('over_email_send_rate_limit') ||
    message.includes('email rate limit exceeded')
  )
}

function isExistingOrUnconfirmedUserError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return (
    message.includes('user already registered') ||
    message.includes('already been registered') ||
    message.includes('email already registered') ||
    message.includes('already exists') ||
    message.includes('email not confirmed')
  )
}

function resolveInitialCooldownUntil() {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(RESEND_COOLDOWN_STORAGE_KEY)
  const parsed = Number(raw || 0)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function Auth({ onDevBypass = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('')
  const [resendCooldownUntil, setResendCooldownUntil] = useState(() => resolveInitialCooldownUntil())
  const [nowTick, setNowTick] = useState(Date.now())

  const redirectTo = useMemo(() => getRedirectPath(location), [location])
  const resendSecondsRemaining = Math.max(0, Math.ceil((resendCooldownUntil - nowTick) / 1000))
  const resendCooldownActive = resendSecondsRemaining > 0

  function setResendCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
    const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : RESEND_COOLDOWN_SECONDS
    const nextUntil = Date.now() + safeSeconds * 1000
    setResendCooldownUntil(nextUntil)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RESEND_COOLDOWN_STORAGE_KEY, String(nextUntil))
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick(Date.now())
    }, 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!resendCooldownActive && resendCooldownUntil > 0 && typeof window !== 'undefined') {
      window.localStorage.removeItem(RESEND_COOLDOWN_STORAGE_KEY)
    }
  }, [resendCooldownActive, resendCooldownUntil])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return
    }

    async function checkSession() {
      console.debug('[AUTH] session:check:start')
      const { data, error } = await supabase.auth.getSession()
      if (error && isUnsupportedJwtAlgorithmError(error)) {
        await clearSupabaseLocalAuthState()
        return
      }
      if (data?.session) {
        const pendingInvitePath = resolvePendingInvitePath()
        const target = pendingInvitePath || redirectTo
        console.debug('[REDIRECT] auth:session-present', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
      }
    }

    void checkSession()
  }, [navigate, redirectTo])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env.')
      return
    }

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    if (!password.trim()) {
      setError('Password is required.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    try {
      setLoading(true)
      setError('')
      setMessage('')
      const emailRedirectTo = resolveEmailVerificationRedirectTo()

      if (mode === 'login') {
        console.debug('[AUTH] login:start', { email: email.trim().toLowerCase() })
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          throw signInError
        }

        const pendingInvitePath = resolvePendingInvitePath()
        const target = pendingInvitePath || redirectTo
        console.debug('[AUTH] login:success', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
        return
      }

      console.debug('[AUTH] signup:start', { email: email.trim().toLowerCase() })
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
        },
      })

      if (signUpError) {
        const signUpMessage = String(signUpError?.message || '').toLowerCase()
        if (signUpMessage.includes('redirect') && signUpMessage.includes('not allowed')) {
          throw new Error('Verification redirect URL is not allowed by Supabase Auth. Add your app URLs to Auth redirect settings and retry.')
        }
        if (isAuthRateLimitError(signUpError)) {
          setPendingVerificationEmail(email.trim())
          setMode('login')
          setResendCooldown(RESEND_COOLDOWN_SECONDS)
          setMessage('Too many verification emails were sent recently. Wait a moment, then use Resend verification.')
          setPassword('')
          setConfirmPassword('')
          return
        }
        if (isExistingOrUnconfirmedUserError(signUpError)) {
          setPendingVerificationEmail(email.trim())
          setMode('login')
          setMessage('This email is already registered or pending verification. Sign in, or resend verification below.')
          setPassword('')
          setConfirmPassword('')
          return
        }
        throw signUpError
      }

      if (data?.session) {
        const pendingInvitePath = resolvePendingInvitePath()
        const target = pendingInvitePath || '/onboarding/profile'
        console.debug('[REDIRECT] signup:session-created', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
        return
      }

      const identities = Array.isArray(data?.user?.identities) ? data.user.identities : null
      const receivedObfuscatedUser = Array.isArray(identities) && identities.length === 0

      if (receivedObfuscatedUser) {
        setMessage('If this email is already registered, use Login. If it is unconfirmed, check your inbox or resend verification below.')
      } else {
        setMessage('Account created. Check your email to confirm before signing in.')
      }
      setPendingVerificationEmail(email.trim())
      setMode('login')
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to complete authentication request.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    const targetEmail = String(pendingVerificationEmail || email || '').trim()
    if (!targetEmail) {
      setError('Enter your email address first so we can resend verification.')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env.')
      return
    }

    if (resendCooldownActive) {
      setError(`Please wait ${resendSecondsRemaining}s before requesting another verification email.`)
      return
    }

    try {
      setResendLoading(true)
      setError('')
      const emailRedirectTo = resolveEmailVerificationRedirectTo()
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo,
        },
      })
      if (resendError) {
        throw resendError
      }
      setPendingVerificationEmail(targetEmail)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setMessage('Verification email resent. Check inbox/spam and allow a few minutes for delivery.')
    } catch (resendError) {
      if (isAuthRateLimitError(resendError)) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS)
        setError(`Email rate limit reached. Wait ${RESEND_COOLDOWN_SECONDS}s, then try again.`)
        return
      }
      setError(resendError?.message || 'Unable to resend verification email right now.')
    } finally {
      setResendLoading(false)
    }
  }

  function handleDevBypass(role) {
    setStoredDevAuthRole(role)
    onDevBypass?.(role)
    navigate('/dashboard', { replace: true })
  }

  const securityLogoutMessage = new URLSearchParams(location.search).get('security') === '1'

  return (
    <div className="auth-page">
      <main className="auth-shell">
        <section className="auth-hero">
          <p className="auth-brand">bridge.</p>
          <h1 style={{ color: '#ffffff' }}>Property Transaction Command Centre</h1>
          <p>Secure workspace access for authorized transaction teams and partners.</p>

          <div className="auth-hero-points">
            <article>
              <ShieldCheck size={16} />
              <div>
                <strong>Secure Access</strong>
                <span>Role-based entry to the internal operations platform.</span>
              </div>
            </article>
            <article>
              <Building2 size={16} />
              <div>
                <strong>Portfolio Control</strong>
                <span>Track developments, units, transfer milestones, and risk in one place.</span>
              </div>
            </article>
            <article>
              <CheckCircle2 size={16} />
              <div>
                <strong>Executive Ready</strong>
                <span>Management-grade reporting and mobile snapshot views.</span>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">Launch App</span>
            <h2>{mode === 'login' ? 'Sign in to Bridge' : 'Create your Bridge account'}</h2>
            <p>
              {mode === 'login'
                ? 'Use your assigned workspace credentials to open the transaction platform.'
                : 'Set up your secure workspace access to continue into the app.'}
            </p>
          </div>

          {securityLogoutMessage ? (
            <p className="auth-feedback success">You were signed out for security. Please log in again.</p>
          ) : null}

          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login')
                setError('')
                setMessage('')
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => {
                setMode('signup')
                setError('')
                setMessage('')
              }}
            >
              Sign Up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
            </label>

            {mode === 'signup' ? (
              <label>
                Confirm Password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  required
                />
              </label>
            ) : null}

            {error ? <p className="auth-feedback error">{error}</p> : null}
            {message ? <p className="auth-feedback success">{message}</p> : null}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Processing...' : mode === 'login' ? 'Launch Workspace' : 'Create Account'}
              {!loading ? <ArrowRight size={15} /> : null}
            </button>
          </form>

          {mode === 'login' ? (
            <div className="auth-footer" style={{ borderTop: 0, paddingTop: 0 }}>
              <span>Didn&apos;t receive the verification email?</span>
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={resendLoading || resendCooldownActive}
              >
                {resendLoading ? 'Resending…' : resendCooldownActive ? `Resend in ${resendSecondsRemaining}s` : 'Resend verification'}
              </button>
            </div>
          ) : null}

          <div className="auth-footer">
            <span>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => setMode((previous) => (previous === 'login' ? 'signup' : 'login'))}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </div>

          {!isSupabaseConfigured ? (
            <p className="auth-demo-note">
              Supabase env vars are missing, so auth is disabled. You can still open the app in demo mode via{' '}
              <Link to="/dashboard">Dashboard</Link>.
            </p>
          ) : null}

          {import.meta.env.DEV ? (
            <div className="mt-6 rounded-[24px] border border-[#d8e2f0] bg-[#f4f7fb] p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6f87a7]">Local Dev Bypass</h3>
                <p className="mt-2 text-sm leading-6 text-[#61738f]">
                  Enter the app without Supabase auth while you are still building. This is only available locally.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {DEV_BYPASS_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="flex items-center justify-between rounded-[18px] border border-[#cfdced] bg-white px-4 py-3 text-left text-sm font-semibold text-[#142132] transition hover:border-[#365c7c] hover:bg-[#f7faff]"
                    onClick={() => handleDevBypass(role)}
                  >
                    <span>{APP_ROLE_LABELS[role] || role}</span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default Auth
