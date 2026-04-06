import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { setStoredDevAuthRole } from '../lib/devAuth'
import { APP_ROLE_LABELS } from '../lib/roles'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

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

const DEV_BYPASS_ROLES = ['developer', 'agent', 'attorney', 'bond_originator']

function Auth({ onDevBypass = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const redirectTo = useMemo(() => getRedirectPath(location), [location])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return
    }

    async function checkSession() {
      const { data } = await supabase.auth.getSession()
      if (data?.session) {
        navigate(redirectTo, { replace: true })
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
      const emailRedirectTo =
        typeof window !== 'undefined'
          ? (() => {
              const redirectUrl = new URL('/auth', window.location.origin)
              redirectUrl.searchParams.set('next', '/onboarding/profile')
              return redirectUrl.toString()
            })()
          : undefined

      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          throw signInError
        }

        navigate(redirectTo, { replace: true })
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
        },
      })

      if (signUpError) {
        throw signUpError
      }

      if (data?.session) {
        navigate('/onboarding/profile', { replace: true })
        return
      }

      setMessage('Account created. Check your email to confirm before signing in.')
      setMode('login')
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to complete authentication request.')
    } finally {
      setLoading(false)
    }
  }

  function handleDevBypass(role) {
    setStoredDevAuthRole(role)
    onDevBypass?.(role)
    navigate('/dashboard', { replace: true })
  }

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
