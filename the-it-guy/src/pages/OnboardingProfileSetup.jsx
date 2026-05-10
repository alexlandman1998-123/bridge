import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS, APP_ROLE_ONBOARDING_OPTIONS, normalizeAppRole } from '../lib/roles'
import { clearSupabaseLocalAuthState, supabase } from '../lib/supabaseClient'

const PROFILE_BOOTSTRAP_TIMEOUT_MS = 12000

function resolveOnboardingPathForRole(role) {
  const normalizedRole = normalizeAppRole(role)
  if (normalizedRole === 'agent') return '/agent/onboarding'
  if (normalizedRole === 'attorney') return '/attorney/onboarding'
  if (normalizedRole === 'developer') return '/developer/onboarding'
  if (normalizedRole === 'bond_originator') return '/bond-originator/onboarding'
  return ''
}

function isOutOfSyncSessionError(message) {
  const lowered = String(message || '').toLowerCase()
  return lowered.includes('user from sub claim in jwt does not exist') || lowered.includes('session is out of sync')
}

function OnboardingProfileSetup() {
  const navigate = useNavigate()
  const {
    profile,
    profileLoading,
    profileError,
    workspaceReady,
    retryWorkspaceBootstrap,
    saveProfileDraft,
  } = useWorkspace()
  const [timedOut, setTimedOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [selectedRole, setSelectedRole] = useState('viewer')

  const waitingForBootstrap = profileLoading || !workspaceReady
  const activeProfileError = error || profileError || ''

  useEffect(() => {
    if (!waitingForBootstrap) {
      setTimedOut(false)
      return undefined
    }
    const timeoutId = window.setTimeout(() => {
      console.error('[OnboardingProfileSetup] bootstrap timeout')
      setTimedOut(true)
    }, PROFILE_BOOTSTRAP_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [waitingForBootstrap])

  useEffect(() => {
    setFirstName(String(profile?.firstName || '').trim())
    setLastName(String(profile?.lastName || '').trim())
    setCompanyName(String(profile?.companyName || '').trim())
    setPhoneNumber(String(profile?.phoneNumber || '').trim())
    setSelectedRole(normalizeAppRole(profile?.role || 'viewer'))
  }, [profile?.companyName, profile?.firstName, profile?.lastName, profile?.phoneNumber, profile?.role])

  const profileComplete = useMemo(
    () => Boolean(String(firstName || '').trim() && String(lastName || '').trim()),
    [firstName, lastName],
  )
  const roleSelected = selectedRole !== 'viewer'

  async function handleSignOut() {
    console.debug('[AUTH] onboarding-profile:signout')
    try {
      await clearSupabaseLocalAuthState()
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    } finally {
      window.location.assign('/auth')
    }
  }

  async function handleRetry() {
    console.debug('[ONBOARDING] profile:retry')
    setError('')
    retryWorkspaceBootstrap?.()
  }

  async function handleContinue(event) {
    event.preventDefault()
    if (!String(firstName || '').trim() || !String(lastName || '').trim()) {
      setError('First name and last name are required.')
      return
    }
    if (!roleSelected) {
      setError('Select the module you want to set up first.')
      return
    }

    try {
      setSaving(true)
      setError('')
      console.debug('[ONBOARDING] profile:continue:start', {
        profileId: profile?.id || null,
        selectedRole,
      })
      await saveProfileDraft({
        firstName: String(firstName || '').trim(),
        lastName: String(lastName || '').trim(),
        companyName: String(companyName || '').trim(),
        phoneNumber: String(phoneNumber || '').trim(),
        role: selectedRole,
        onboardingCompleted: false,
      })
      const route = resolveOnboardingPathForRole(selectedRole)
      if (!route) {
        throw new Error('Could not determine onboarding route for the selected role.')
      }
      console.debug('[REDIRECT] profile:continue', { route, selectedRole })
      navigate(route, { replace: true })
    } catch (submitError) {
      setError(submitError?.message || 'Unable to continue onboarding right now.')
    } finally {
      setSaving(false)
    }
  }

  if (isOutOfSyncSessionError(activeProfileError)) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Session expired for this environment</h2>
          <p>Please sign in again to continue your onboarding setup.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" className="auth-primary-cta" onClick={handleSignOut}>
              Sign In Again
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (waitingForBootstrap) {
    if (timedOut) {
      return (
        <section className="auth-loading-screen">
          <div className="auth-loading-card">
            <h2>We couldn’t load your onboarding profile.</h2>
            <p>Authentication or profile setup took too long. Please retry.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button type="button" className="auth-primary-cta" onClick={handleRetry}>
                Retry
              </button>
              <button type="button" className="auth-secondary-cta" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>Preparing your onboarding profile…</h2>
          <p>
            Resolving your verified session and profile setup.
            <br />
            <span className="text-xs text-[#6c8198]">If this takes longer than 12 seconds, retry.</span>
          </p>
        </div>
      </section>
    )
  }

  if (activeProfileError) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>We couldn’t load your onboarding profile.</h2>
          <p>{activeProfileError}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" className="auth-primary-cta" onClick={handleRetry}>
              Retry
            </button>
            <button type="button" className="auth-secondary-cta" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="auth-page onboarding-page agency-onboarding-page">
      <main className="auth-shell onboarding-shell agency-onboarding-shell">
        <section className="auth-hero onboarding-hero agency-onboarding-hero">
          <p className="auth-brand">bridge.</p>
          <h1 style={{ color: '#ffffff' }}>Complete Your Profile</h1>
          <p>Set your details and choose the module you want to onboard into first.</p>
        </section>

        <section className="auth-card onboarding-card agency-onboarding-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">Profile Setup</span>
            <h2>Before We Continue</h2>
            <p>We need your profile details and role selection before organisation onboarding.</p>
          </div>

          <form className="auth-form onboarding-form agency-onboarding-form" onSubmit={handleContinue}>
            <section className="agency-grid">
              <label>
                First Name
                <input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label>
                Last Name
                <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
              <label>
                Company Name
                <input type="text" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </label>
              <label>
                Phone Number
                <input type="text" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
              </label>
            </section>

            <section className="mt-4">
              <h3 className="text-sm font-semibold tracking-[0.08em] text-[#5f748b]">Select Module</h3>
              <div className="agency-role-grid mt-3">
                {APP_ROLE_ONBOARDING_OPTIONS.map((option) => {
                  const isActive = selectedRole === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`agency-role-card ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedRole(option.value)}
                    >
                      <div className="agency-role-card-head">
                        <div>
                          <strong>{APP_ROLE_LABELS[option.value] || option.label}</strong>
                          <span>{option.description}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {activeProfileError ? <p className="auth-form-error">{activeProfileError}</p> : null}
            {error ? <p className="auth-form-error">{error}</p> : null}

            <div className="auth-actions">
              <button type="submit" className="auth-primary-cta" disabled={saving || !profileComplete || !roleSelected}>
                {saving ? 'Saving…' : 'Continue'}
              </button>
              <button type="button" className="auth-secondary-cta" onClick={handleSignOut} disabled={saving}>
                Sign Out
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

export default OnboardingProfileSetup
