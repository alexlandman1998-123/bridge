/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
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

export function resolveExistingWorkspaceJoinProfileRoute({
  role = '',
  signupIntent = null,
  activeMemberships = [],
  currentMembership = null,
  pendingInviteToken = '',
} = {}) {
  const intentToken = String(signupIntent?.invite_token || signupIntent?.inviteToken || '').trim()
  const inviteToken = intentToken || String(pendingInviteToken || '').trim()
  const hasMembership = Boolean(currentMembership?.id || (Array.isArray(activeMemberships) && activeMemberships.length > 0))
  if (!hasMembership && inviteToken) {
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
        onboardingCompleted: isExistingWorkspaceJoin,
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
    <div className="auth-page onboarding-page agency-onboarding-page">
      <main className="auth-shell onboarding-shell agency-onboarding-shell">
        <section className="auth-hero onboarding-hero agency-onboarding-hero">
          <p className="auth-brand">Arch9</p>
          <h1 style={{ color: '#ffffff' }}>Complete Your Profile</h1>
          <p>{isExistingWorkspaceJoin ? 'Confirm your details before opening your workspace.' : 'Set your details and choose the module you want to onboard into first.'}</p>
        </section>

        <section className="auth-card onboarding-card agency-onboarding-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">Profile Setup</span>
            <h2>{cardTitle}</h2>
            <p>{cardDescription}</p>
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
              {showCompanyName ? (
                <label>
                  Company Name
                  <input type="text" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </label>
              ) : null}
              <label>
                Phone Number
                <input type="text" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
              </label>
            </section>

            {isExistingWorkspaceJoin ? (
              <section className="mt-4 rounded-[16px] border border-[#dbe8f3] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#48627d]">
                Arch9 will use the agency details from your accepted invite. You only need to confirm your own profile.
              </section>
            ) : signupIntent ? (
              <section className="mt-4 rounded-[16px] border border-[#dbe8f3] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#48627d]">
                Arch9 will continue with {APP_ROLE_LABELS[signupIntent.app_role] || 'workspace'} setup.
                {signupIntent.workspace_action === 'create_workspace'
                  ? ' You will create the workspace in the next step.'
                  : ' You will join by invite or request access in the next step.'}
              </section>
            ) : null}

            {needsIntentRecovery ? (
              <section className="mt-4 grid gap-4">
                <div>
                  <h3 className="text-sm font-semibold tracking-[0.08em] text-[#5f748b]">Business Type</h3>
                  <div className="mt-3 grid gap-2">
                    {BUSINESS_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-[14px] border px-3 py-2 text-left text-sm ${
                          recoveryBusinessType === option.value
                            ? 'border-[#315b7b] bg-[#eef5fb] text-[#142132]'
                            : 'border-[#dfe8f2] bg-white text-[#31485e]'
                        }`}
                        onClick={() => {
                          setRecoveryBusinessType(option.value)
                          setRecoveryPosition('')
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {recoveryBusinessType ? (
                  <div>
                    <h3 className="text-sm font-semibold tracking-[0.08em] text-[#5f748b]">Position</h3>
                    <div className="mt-3 grid gap-2">
                      {recoveryPositionOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`rounded-[14px] border px-3 py-2 text-left text-sm ${
                            recoveryPosition === option.value
                              ? 'border-[#315b7b] bg-[#eef5fb] text-[#142132]'
                              : 'border-[#dfe8f2] bg-white text-[#31485e]'
                          }`}
                          onClick={() => setRecoveryPosition(option.value)}
                        >
                          <strong className="block">{option.label}</strong>
                          <span className="mt-1 block text-xs text-[#61758a]">{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeProfileError ? <p className="auth-form-error">{activeProfileError}</p> : null}
            {error ? <p className="auth-form-error">{error}</p> : null}

            <div className="auth-actions">
              <button type="submit" className="auth-primary-cta" disabled={saving || !profileComplete || !roleSelected}>
                {saving
                  ? 'Saving…'
                  : isExistingWorkspaceJoin
                    ? 'Continue to Dashboard'
                    : `Continue to ${APP_ROLE_LABELS[effectiveAppRole] || 'Workspace'} Setup`}
              </button>
              <button type="button" className="auth-secondary-cta" onClick={handleSignOut} disabled={saving}>
                Sign out
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

export default OnboardingProfileSetup
