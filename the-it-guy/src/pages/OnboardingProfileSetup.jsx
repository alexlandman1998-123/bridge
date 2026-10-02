/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import './onboarding-profile-setup.css'
import { ArrowRight, Building2, Check, CheckCircle2, HandCoins, House, Landmark, Layers3, Scale, UserRound } from 'lucide-react'
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

const BUSINESS_PRESENTATION = {
  agency: { icon: House, title: 'Residential agency', detail: 'Property sales & rentals' },
  commercial_brokerage: { icon: Building2, title: 'Commercial brokerage', detail: 'Commercial property & leasing' },
  mixed_agency: { icon: Layers3, title: 'Residential + commercial', detail: 'Both sides of the property market' },
  developer: { icon: Landmark, title: 'Developer', detail: 'Developments & project sales' },
  attorney: { icon: Scale, title: 'Attorney / conveyancer', detail: 'Property law & transfers' },
  bond_originator: { icon: HandCoins, title: 'Bond originator', detail: 'Home finance & applications' },
  client: { icon: UserRound, title: 'Buyer / seller', detail: 'Your personal property transaction' },
}

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
  const cardDescription = isPrincipalClaimIntent
    ? 'Confirm your details before claiming your organisation’s workspace.'
    : isExistingWorkspaceJoin
      ? 'Confirm your details to continue to your workspace.'
      : needsIntentRecovery
        ? 'Add your details and choose the business you work in.'
        : 'Confirm your details before setting up your workspace.'
  const selectedBusinessTypeLabel = BUSINESS_TYPE_OPTIONS.find((option) => option.value === recoveryBusinessType)?.label || ''
  const pathSummary = isExistingWorkspaceJoin
    ? 'Existing workspace'
    : signupIntent
      ? APP_ROLE_LABELS[signupIntent.app_role] || 'Workspace'
      : selectedBusinessTypeLabel

  const previewName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
  const previewInitials = [firstName.trim()[0], lastName.trim()[0]].filter(Boolean).join('').toUpperCase()
  const previewRole = recoveryPositionOptions.find((option) => option.value === recoveryPosition)?.label
    || (roleSelected ? APP_ROLE_LABELS[effectiveAppRole] : '')
  const continuationHint = !profileComplete
    ? 'Add your first and last name to continue.'
    : !roleSelected
      ? recoveryBusinessType ? 'Choose your role below to continue.' : 'Choose your business and role to continue.'
      : 'Your profile is ready to continue.'

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
          <span className="profile-setup-logo">arch9</span>
          <div className="profile-setup-rail-content">
            <p className="profile-setup-kicker">Account setup</p>
            <ol className="profile-setup-steps">
              <li className="active" aria-current="step"><span>01</span><strong>Your profile</strong></li>
              <li><span>02</span><strong>{isExistingWorkspaceJoin ? 'Open workspace' : 'Your workspace'}</strong></li>
            </ol>
            {pathSummary ? (
              <p className="profile-setup-path-summary">{pathSummary}</p>
            ) : null}
          </div>
          <div className={`profile-setup-preview ${previewName ? 'has-name' : ''}`}>
            <span className="profile-setup-preview-label">Your profile, at a glance</span>
            <div className="profile-setup-avatar" aria-hidden="true">{previewInitials || <UserRound size={26} strokeWidth={1.5} />}</div>
            <strong className="profile-setup-preview-name">{previewName || 'Your name'}</strong>
            {showCompanyName && companyName.trim() ? <span className="profile-setup-preview-company">{companyName.trim()}</span> : null}
            <span className="profile-setup-preview-role">{previewRole || pathSummary || 'Choose a business to get started'}</span>
            <div className="profile-setup-preview-status">
              <span className={profileComplete ? 'done' : ''}>{profileComplete ? <Check size={14} /> : <span className="profile-setup-status-dot" />} Personal details</span>
              <span className={roleSelected ? 'done' : ''}>{roleSelected ? <Check size={14} /> : <span className="profile-setup-status-dot" />} Business & role</span>
            </div>
          </div>
        </aside>

        <section className="profile-setup-panel">
          <header className="profile-setup-panel-head">
            <span className="profile-setup-overline">Welcome to Arch9</span>
            <h1>Let’s set up your profile.</h1>
            <p>{cardDescription}</p>
          </header>

          <form className="profile-setup-form" onSubmit={handleContinue}>
            <section className="profile-setup-section">
              <div className="profile-setup-section-head">
                <div className="profile-setup-heading-row"><h2><span>01</span> Personal details</h2>{profileComplete ? <span className="profile-setup-section-status"><Check size={14} /> Added</span> : null}</div>
                <p>Start with your name. Company and phone details are optional.</p>
              </div>

              <div className="profile-setup-field-grid">
                <label>
                  First name *
                  <input type="text" autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>
                <label>
                  Last name *
                  <input type="text" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>
                {showCompanyName ? (
                  <label>
                    <span>Company name <em>Optional</em></span>
                    <input type="text" autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                  </label>
                ) : null}
                <label>
                  <span>Phone number <em>Optional</em></span>
                  <input type="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
                </label>
              </div>
            </section>

            {isExistingWorkspaceJoin ? (
              <section className="profile-setup-info-band">
                <p>Your organisation details are linked to your workspace.</p>
              </section>
            ) : signupIntent ? (
              <section className="profile-setup-info-band">
                <p>
                  {isPrincipalClaimIntent
                    ? 'Next: claim your organisation’s workspace.'
                    : signupIntent.workspace_action === 'create_workspace'
                      ? 'Next: set up your organisation’s workspace.'
                      : 'Next: join a workspace by invitation or request access.'}
                </p>
              </section>
            ) : null}

            {needsIntentRecovery ? (
              <section className="profile-setup-section">
                <div className="profile-setup-section-head">
                  <div className="profile-setup-heading-row"><h2><span>02</span> Your business</h2>{roleSelected ? <span className="profile-setup-section-status"><Check size={14} /> Selected</span> : null}</div>
                  <p>Which of these best describes what you do?</p>
                </div>

                <div className="profile-setup-choice-group" role="group" aria-label="Business type">
                  {BUSINESS_TYPE_OPTIONS.map((option) => {
                    const presentation = BUSINESS_PRESENTATION[option.value]
                    const BusinessIcon = presentation.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`profile-setup-choice ${recoveryBusinessType === option.value ? 'selected' : ''}`}
                        aria-pressed={recoveryBusinessType === option.value}
                        aria-label={option.label}
                        onClick={() => {
                          if (recoveryBusinessType !== option.value) {
                            setRecoveryBusinessType(option.value)
                            setRecoveryPosition('')
                          }
                        }}
                      >
                        <BusinessIcon className="profile-setup-business-icon" size={22} strokeWidth={1.5} aria-hidden="true" />
                        <span className="profile-setup-choice-copy"><strong>{presentation.title}</strong><small>{presentation.detail}</small></span>
                        <span className="profile-setup-selection-mark" aria-hidden="true">{recoveryBusinessType === option.value ? <Check size={12} /> : null}</span>
                      </button>
                    )
                  })}
                </div>

                {recoveryBusinessType ? (
                  <div key={recoveryBusinessType} className="profile-setup-position-group" role="group" aria-label="Position">
                    <span className="profile-setup-mini-label">How do you work in this business?</span>
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

            <p className={`profile-setup-continuation-hint ${profileComplete && roleSelected ? 'ready' : ''}`} role="status">{profileComplete && roleSelected ? <CheckCircle2 size={16} /> : null}{continuationHint}</p>
            <div className="profile-setup-actions">
              <button type="button" className="profile-setup-secondary" onClick={handleSignOut} disabled={saving}>
                Sign out
              </button>
              <button type="submit" className="profile-setup-primary" disabled={saving || !profileComplete || !roleSelected}>
                <span>
                  {saving
                    ? 'Saving...'
                    : isExistingWorkspaceJoin
                      ? 'Open workspace'
                      : 'Continue'}
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
