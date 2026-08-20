/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, LogOut, Route, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS, normalizeAppRole } from '../lib/appRoleMetadata'
import { clearSupabaseLocalAuthState, supabase } from '../lib/supabaseClient'
import { BUSINESS_TYPE_OPTIONS, POSITION_OPTIONS_BY_BUSINESS_TYPE, SIGNUP_INTENT_SOURCE } from '../constants/signupIntents'
import { SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { buildSignupIntent, persistSignupIntent, resolveSignupIntentRoute } from '../lib/signupIntent'

const PROFILE_BOOTSTRAP_TIMEOUT_MS = 12000
const PENDING_ORG_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'

function resolveOnboardingPathForRole(role) {
  const normalizedRole = normalizeAppRole(role)
  if (normalizedRole === 'agent') return '/agent/onboarding'
  if (normalizedRole === 'attorney') return '/attorney/onboarding'
  if (normalizedRole === 'developer') return '/developer/onboarding'
  if (normalizedRole === 'bond_originator') return '/bond-originator/onboarding'
  return ''
}

function resolveDashboardPathForRole(role) {
  const normalizedRole = normalizeAppRole(role)
  if (normalizedRole === 'attorney') return '/attorney/dashboard'
  if (normalizedRole === 'client') return '/client-access'
  return '/dashboard'
}

function getPendingInviteToken() {
  if (typeof window === 'undefined') return ''
  return String(window.sessionStorage.getItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY) || '').trim()
}

export function isExistingWorkspaceJoinProfileStep({
  signupIntent = null,
  activeMemberships = [],
  currentMembership = null,
  pendingInviteToken = '',
} = {}) {
  const workspaceAction = signupIntent?.workspace_action || signupIntent?.workspaceAction || ''
  return Boolean(
    workspaceAction === SIGNUP_WORKSPACE_ACTIONS.acceptInvite ||
      (workspaceAction === SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace && String(pendingInviteToken || '').trim()) ||
      currentMembership?.id ||
      (Array.isArray(activeMemberships) && activeMemberships.length > 0),
  )
}

export function hasExistingWorkspaceMembership({ activeMemberships = [], currentMembership = null } = {}) {
  return Boolean(currentMembership?.id || (Array.isArray(activeMemberships) && activeMemberships.length > 0))
}

export function resolveExistingWorkspaceJoinProfileRoute({
  role = '',
  signupIntent = null,
  activeMemberships = [],
  currentMembership = null,
  pendingInviteToken = '',
} = {}) {
  const intentToken = String(signupIntent?.invite_token || signupIntent?.inviteToken || '').trim()
  const inviteToken = intentToken || String(pendingInviteToken || '').trim()
  if (!hasExistingWorkspaceMembership({ activeMemberships, currentMembership }) && inviteToken) {
    return `/invite/${encodeURIComponent(inviteToken)}?accept=1`
  }
  return resolveDashboardPathForRole(role)
}

function isOutOfSyncSessionError(message) {
  const lowered = String(message || '').toLowerCase()
  return lowered.includes('user from sub claim in jwt does not exist') || lowered.includes('session is out of sync')
}

function OnboardingProfileSetup() {
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const {
    profile,
    signupIntent,
    profileLoading,
    profileError,
    workspaceReady,
    activeMemberships,
    currentMembership,
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
  const [recoveryBusinessType, setRecoveryBusinessType] = useState('')
  const [recoveryPosition, setRecoveryPosition] = useState('')

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
  const recoveryIntent = useMemo(
    () =>
      recoveryPosition
        ? buildSignupIntent({
            position: recoveryPosition,
            source: SIGNUP_INTENT_SOURCE.recovery,
          })
        : null,
    [recoveryPosition],
  )
  const effectiveIntent = signupIntent || recoveryIntent
  const effectiveAppRole = effectiveIntent?.app_role || selectedRole
  const roleSelected = effectiveAppRole !== 'viewer'
  const needsIntentRecovery = !signupIntent && selectedRole === 'viewer'
  const recoveryPositionOptions = POSITION_OPTIONS_BY_BUSINESS_TYPE[recoveryBusinessType] || []
  const isPrincipalClaimIntent = effectiveIntent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.claimExistingWorkspace
  const pendingInviteToken = getPendingInviteToken()
  const hasWorkspaceMembership = hasExistingWorkspaceMembership({ activeMemberships, currentMembership })
  const isExistingWorkspaceJoin = !isPrincipalClaimIntent && isExistingWorkspaceJoinProfileStep({
    signupIntent: effectiveIntent,
    activeMemberships,
    currentMembership,
    pendingInviteToken,
  })
  const showCompanyName = !isExistingWorkspaceJoin
  const cardTitle = isPrincipalClaimIntent
    ? 'Before We Claim the Workspace'
    : isExistingWorkspaceJoin
      ? 'Before You Join'
      : 'Before We Continue'
  const cardDescription = isPrincipalClaimIntent
    ? 'We found a principal claim. Confirm your profile details before Arch9 captures the workspace as yours.'
    : isExistingWorkspaceJoin
      ? 'Your invite is accepted. Confirm your personal details before opening the agency workspace.'
      : signupIntent
        ? 'We found your signup path. Confirm your profile details before workspace setup.'
        : 'Confirm your business type and position so Arch9 can recover the correct onboarding path.'
  const selectedBusinessTypeLabel = BUSINESS_TYPE_OPTIONS.find((option) => option.value === recoveryBusinessType)?.label || ''
  const selectedPositionLabel = recoveryPositionOptions.find((option) => option.value === recoveryPosition)?.label || ''
  const pathSummary = isExistingWorkspaceJoin
    ? 'Joining existing workspace'
    : signupIntent
      ? `${APP_ROLE_LABELS[signupIntent.app_role] || 'Workspace'} setup`
      : selectedPositionLabel || selectedBusinessTypeLabel || 'Choose your workspace path'
  const setupSteps = [
    { label: 'Profile details', done: profileComplete },
    { label: 'Workspace path', done: roleSelected },
    { label: isExistingWorkspaceJoin ? 'Open workspace' : 'Start setup', done: false },
  ]

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
      setError('Confirm your business type and position before continuing.')
      return
    }

    try {
      setSaving(true)
      setError('')
      console.debug('[ONBOARDING] profile:continue:start', {
        profileId: profile?.id || null,
        selectedRole: effectiveAppRole,
      })
      if (effectiveIntent && authState.user?.id) {
        await persistSignupIntent({
          intent: {
            ...effectiveIntent,
            email: profile?.email || authState.user.email || '',
          },
          user: authState.user,
          email: profile?.email || authState.user.email || '',
          status: 'ready_for_onboarding',
        })
      }
      const profilePayload = {
        firstName: String(firstName || '').trim(),
        lastName: String(lastName || '').trim(),
        phoneNumber: String(phoneNumber || '').trim(),
        role: effectiveAppRole,
        onboardingCompleted: hasWorkspaceMembership,
      }
      if (showCompanyName) {
        profilePayload.companyName = String(companyName || '').trim()
      }
      await saveProfileDraft(profilePayload)
      const route = isExistingWorkspaceJoin
        ? resolveExistingWorkspaceJoinProfileRoute({
            role: effectiveAppRole,
            signupIntent: effectiveIntent,
            activeMemberships,
            currentMembership,
            pendingInviteToken,
          })
        : signupIntent || recoveryIntent
          ? resolveSignupIntentRoute(effectiveIntent)
          : resolveOnboardingPathForRole(effectiveAppRole)
      if (!route) {
        throw new Error('Could not determine onboarding route for the selected role.')
      }
      console.debug('[REDIRECT] profile:continue', { route, selectedRole: effectiveAppRole })
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
    <div className="auth-page onboarding-page profile-setup-page">
      <main className="profile-setup-shell">
        <aside className="profile-setup-rail" aria-label="Onboarding progress">
          <div className="profile-setup-brand-row">
            <span className="profile-setup-logo">Arch9</span>
            <span className="profile-setup-secure"><ShieldCheck size={15} /> Secure setup</span>
          </div>

          <div className="profile-setup-rail-copy">
            <span className="profile-setup-kicker">Workspace onboarding</span>
            <h1>Let’s get your profile pointed in the right direction.</h1>
            <p>
              Confirm who you are, then Arch9 will open the setup path that matches your business and role.
            </p>
          </div>

          <section className="profile-setup-path-card" aria-label="Selected setup path">
            <span className="profile-setup-path-icon"><Route size={18} /></span>
            <div>
              <span>Current path</span>
              <strong>{pathSummary}</strong>
            </div>
          </section>

          <ol className="profile-setup-steps">
            {setupSteps.map((step, index) => (
              <li key={step.label} className={step.done ? 'complete' : index === setupSteps.findIndex((item) => !item.done) ? 'active' : ''}>
                <span>{step.done ? <CheckCircle2 size={16} /> : index + 1}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>

          <div className="profile-setup-rail-note">
            <Building2 size={18} />
            <p>{isExistingWorkspaceJoin ? 'Your organisation details are already linked from the invite.' : 'Company details can be refined during the next workspace setup step.'}</p>
          </div>
        </aside>

        <section className="profile-setup-panel">
          <header className="profile-setup-panel-head">
            <span className="profile-setup-kicker">Profile setup</span>
            <h2>{cardTitle}</h2>
            <p>{cardDescription}</p>
          </header>

          <form className="profile-setup-form" onSubmit={handleContinue}>
            <section className="profile-setup-section">
              <div className="profile-setup-section-head">
                <span><UserRound size={17} /></span>
                <div>
                  <h3>Your details</h3>
                  <p>This is the personal profile your workspace will recognise.</p>
                </div>
              </div>

              <div className="profile-setup-field-grid">
                <label>
                  First name
                  <input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>
                <label>
                  Last name
                  <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>
                {showCompanyName ? (
                  <label className="profile-setup-span-2">
                    Company name
                    <input type="text" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                  </label>
                ) : null}
                <label className={showCompanyName ? 'profile-setup-span-2' : ''}>
                  Phone number
                  <input type="text" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
                </label>
              </div>
            </section>

            {isExistingWorkspaceJoin ? (
              <section className="profile-setup-info-band">
                <CheckCircle2 size={18} />
                <p>Arch9 will use the agency details from your accepted invite. You only need to confirm your own profile.</p>
              </section>
            ) : signupIntent ? (
              <section className="profile-setup-info-band">
                <CheckCircle2 size={18} />
                <p>
                  Arch9 will continue with {APP_ROLE_LABELS[signupIntent.app_role] || 'workspace'} setup.
                  {signupIntent.workspace_action === 'create_workspace'
                    ? ' You will create the workspace in the next step.'
                    : ' You will join by invite or request access in the next step.'}
                </p>
              </section>
            ) : null}

            {needsIntentRecovery ? (
              <section className="profile-setup-section">
                <div className="profile-setup-section-head">
                  <span><BriefcaseBusiness size={17} /></span>
                  <div>
                    <h3>Workspace path</h3>
                    <p>Choose the setup route that best matches the business.</p>
                  </div>
                </div>

                <div className="profile-setup-choice-group" aria-label="Business type">
                  {BUSINESS_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`profile-setup-choice ${recoveryBusinessType === option.value ? 'selected' : ''}`}
                      aria-pressed={recoveryBusinessType === option.value}
                      onClick={() => {
                        setRecoveryBusinessType(option.value)
                        setRecoveryPosition('')
                      }}
                    >
                      <span>{option.label}</span>
                      {recoveryBusinessType === option.value ? <CheckCircle2 size={17} /> : null}
                    </button>
                  ))}
                </div>

                {recoveryBusinessType ? (
                  <div className="profile-setup-position-group" aria-label="Position">
                    <span className="profile-setup-mini-label">Position</span>
                    {recoveryPositionOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`profile-setup-position ${recoveryPosition === option.value ? 'selected' : ''}`}
                        aria-pressed={recoveryPosition === option.value}
                        onClick={() => setRecoveryPosition(option.value)}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          <em>{option.description}</em>
                        </span>
                        {recoveryPosition === option.value ? <CheckCircle2 size={17} /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeProfileError ? <p className="auth-form-error">{activeProfileError}</p> : null}
            {error ? <p className="auth-form-error">{error}</p> : null}

            <div className="profile-setup-actions">
              <button type="button" className="profile-setup-secondary" onClick={handleSignOut} disabled={saving}>
                <LogOut size={17} />
                Sign out
              </button>
              <button type="submit" className="profile-setup-primary" disabled={saving || !profileComplete || !roleSelected}>
                <span>
                  {saving
                    ? 'Saving...'
                    : isExistingWorkspaceJoin
                      ? 'Continue to Dashboard'
                      : `Continue to ${APP_ROLE_LABELS[effectiveAppRole] || 'Workspace'} Setup`}
                </span>
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

export default OnboardingProfileSetup
