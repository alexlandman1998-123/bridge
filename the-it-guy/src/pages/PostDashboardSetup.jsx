import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import OnboardingProgressLayout from '../components/onboarding/OnboardingProgressLayout'
import { APP_ROLE_LABELS } from '../lib/roles'
import { ONBOARDING_STATUSES, ONBOARDING_STEPS } from '../constants/onboardingStatuses'
import { SIGNUP_WORKSPACE_ACTIONS } from '../constants/signupIntents'
import { WORKSPACE_TYPES } from '../constants/workspaceTypes'
import {
  createWorkspaceFromIntent,
  joinWorkspaceFromInvite,
  requestWorkspaceAccess,
} from '../services/workspaceService'

function normalizeText(value) {
  return String(value || '').trim()
}

function getWorkspaceNoun(workspaceType = '') {
  if (workspaceType === WORKSPACE_TYPES.agency) return 'agency'
  if (workspaceType === WORKSPACE_TYPES.developerCompany) return 'developer company'
  if (workspaceType === WORKSPACE_TYPES.attorneyFirm) return 'attorney firm'
  if (workspaceType === WORKSPACE_TYPES.bondOriginator) return 'bond originator business'
  return 'workspace'
}

function getDefaultForm(intent, profile) {
  const workspaceNoun = getWorkspaceNoun(intent?.workspace_type)
  const companyName = normalizeText(profile?.companyName)
  return {
    name: companyName || '',
    legalName: companyName || '',
    registrationNumber: '',
    contactNumber: normalizeText(profile?.phoneNumber),
    businessEmail: normalizeText(profile?.email),
    mainBranchName: intent?.workspace_type === WORKSPACE_TYPES.agency ? 'Main Branch' : 'Main Team',
    province: '',
    city: '',
    operatingArea: '',
    primaryContactName: normalizeText(profile?.fullName),
    workspaceNameForRequest: '',
    requestMessage: `Please approve my access to your ${workspaceNoun} on Bridge.`,
    inviteToken: normalizeText(intent?.invite_token),
  }
}

function getDashboardPath(appRole = '') {
  if (appRole === 'attorney') return '/attorney/dashboard'
  if (appRole === 'client') return '/client-access'
  return '/dashboard'
}

function SetupStatusCard({ title, children, tone = 'info' }) {
  const toneClass =
    tone === 'warning'
      ? 'border-[#f5d3a4] bg-[#fff8ec] text-[#8a4b10]'
      : tone === 'error'
        ? 'border-[#f2c8c4] bg-[#fff5f4] text-[#9f1c1c]'
        : tone === 'success'
          ? 'border-[#cfe8d8] bg-[#effaf3] text-[#236340]'
          : 'border-[#dbe8f3] bg-[#f8fbff] text-[#1f3d59]'
  return (
    <div className={`rounded-[14px] border px-4 py-3 text-sm leading-6 ${toneClass}`}>
      <strong className="block text-[#142132]">{title}</strong>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export default function PostDashboardSetup() {
  const navigate = useNavigate()
  const { authState, refreshAuthState } = useAuthSession()
  const {
    profile,
    baseRole,
    signupIntent,
    activeMemberships,
    pendingMemberships,
    suspendedMemberships,
    currentMembership,
    currentWorkspace,
    onboardingState,
    onboardingRequiredReason,
  } = useWorkspace()
  const intent = signupIntent || null
  const [form, setForm] = useState(() => getDefaultForm(intent, profile))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [request, setRequest] = useState(null)
  const workspaceNoun = getWorkspaceNoun(intent?.workspace_type)
  const canCreateWorkspace = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.createWorkspace
  const canJoinOrRequest = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace
  const canAcceptInvite = intent?.workspace_action === SIGNUP_WORKSPACE_ACTIONS.acceptInvite
  const pageTitle = useMemo(() => {
    if (canCreateWorkspace) return `Create your ${workspaceNoun}`
    if (canAcceptInvite) return 'Accept your workspace invite'
    if (canJoinOrRequest) return `Join a ${workspaceNoun}`
    return 'Workspace setup'
  }, [canAcceptInvite, canCreateWorkspace, canJoinOrRequest, workspaceNoun])

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault()
    if (!intent) {
      setError('Signup intent is missing. Confirm your business type and position first.')
      return
    }
    if (!normalizeText(form.name)) {
      setError('Workspace name is required.')
      return
    }
    if (!normalizeText(form.businessEmail)) {
      setError('Business email is required.')
      return
    }
    if (!normalizeText(form.contactNumber)) {
      setError('Contact number is required.')
      return
    }
    if (intent.workspace_type === WORKSPACE_TYPES.agency && !normalizeText(form.mainBranchName)) {
      setError('Main branch name is required for agency setup.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const result = await createWorkspaceFromIntent(intent, authState.user, {
        ...form,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      })
      refreshAuthState?.()
      setMessage(`${result.workspace.name} is ready. Opening your dashboard...`)
      window.setTimeout(() => {
        navigate(getDashboardPath(intent.app_role), { replace: true })
      }, 500)
    } catch (createError) {
      setError(createError?.message || 'Workspace setup failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAcceptInvite(event) {
    event.preventDefault()
    const token = normalizeText(form.inviteToken)
    if (!token) {
      setError('Invite token is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      await joinWorkspaceFromInvite(token, authState.user, { intent })
      refreshAuthState?.()
      setMessage('Invite accepted. Opening your workspace...')
      window.setTimeout(() => {
        navigate(getDashboardPath(intent?.app_role || baseRole), { replace: true })
      }, 500)
    } catch (inviteError) {
      setError(inviteError?.message || 'Invite acceptance failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRequestAccess(event) {
    event.preventDefault()
    if (!intent) {
      setError('Signup intent is missing. Confirm your business type and position first.')
      return
    }
    if (!normalizeText(form.workspaceNameForRequest)) {
      setError('Enter the workspace or business name you need access to.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')
      const createdRequest = await requestWorkspaceAccess(intent, authState.user, {
        workspaceName: form.workspaceNameForRequest,
        message: form.requestMessage,
      })
      setRequest(createdRequest)
      refreshAuthState?.()
      setMessage('Access request sent. You will remain pending until an owner or admin approves it.')
    } catch (requestError) {
      setError(requestError?.message || 'Access request failed.')
    } finally {
      setSaving(false)
    }
  }

  const hasActiveMembership = activeMemberships.length > 0
  const hasPendingMembership = pendingMemberships.length > 0
  const hasSuspendedMembership = suspendedMemberships.length > 0
  const hasPendingOnboardingState = onboardingState?.onboardingStatus === ONBOARDING_STATUSES.workspacePendingApproval

  return (
    <OnboardingProgressLayout
      title={pageTitle}
      description="Bridge has your profile and signup path. The last step is creating or joining a real backend workspace so dashboard access is tied to an active membership."
      activeStep={onboardingState?.onboardingStep || ONBOARDING_STEPS.createOrJoinWorkspace}
    >

        {intent ? (
          <SetupStatusCard title="Signup path">
            <p>
              {APP_ROLE_LABELS[intent.app_role] || intent.app_role} · {workspaceNoun} ·{' '}
              {intent.intended_org_role.replace(/_/g, ' ')}
            </p>
          </SetupStatusCard>
        ) : (
          <SetupStatusCard title="Signup intent missing" tone="warning">
            <p>
              This looks like a legacy or interrupted account. Confirm your business type on the profile recovery
              screen before creating or joining a workspace.
            </p>
            <button type="button" className="header-secondary-cta mt-3" onClick={() => navigate('/onboarding/profile')}>
              Continue profile recovery
            </button>
          </SetupStatusCard>
        )}

        {hasActiveMembership ? (
          <SetupStatusCard title="Workspace membership active" tone="success">
            <p>Your active membership is ready. You can open your dashboard.</p>
            {currentWorkspace?.name ? (
              <p className="mt-2">
                You are joining {currentWorkspace.name} as {(currentMembership?.role || '').replace(/_/g, ' ') || 'a member'}.
              </p>
            ) : null}
            <button type="button" className="header-secondary-cta mt-3" onClick={() => navigate(getDashboardPath(baseRole))}>
              Open dashboard
            </button>
          </SetupStatusCard>
        ) : null}

        {hasPendingMembership || hasPendingOnboardingState || request ? (
          <SetupStatusCard title="Pending approval" tone="warning">
            <p>
              Your workspace access is pending. You cannot open protected dashboards until an owner, principal, partner,
              or manager approves your membership.
            </p>
          </SetupStatusCard>
        ) : null}

        {hasSuspendedMembership ? (
          <SetupStatusCard title="Access unavailable" tone="error">
            <p>Your existing workspace membership is suspended or removed. Contact your workspace administrator.</p>
          </SetupStatusCard>
        ) : null}

        {canCreateWorkspace ? (
          <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleCreateWorkspace}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                {workspaceNoun[0].toUpperCase() + workspaceNoun.slice(1)} name
                <input className="auth-input" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Legal name
                <input className="auth-input" value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Business email
                <input className="auth-input" type="email" value={form.businessEmail} onChange={(event) => updateField('businessEmail', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Contact number
                <input className="auth-input" value={form.contactNumber} onChange={(event) => updateField('contactNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Registration number
                <input className="auth-input" value={form.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Province
                <input className="auth-input" value={form.province} onChange={(event) => updateField('province', event.target.value)} />
              </label>
              {intent?.workspace_type === WORKSPACE_TYPES.agency || intent?.workspace_type === WORKSPACE_TYPES.bondOriginator ? (
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  {intent.workspace_type === WORKSPACE_TYPES.agency ? 'Main branch name' : 'Main team name'}
                  <input className="auth-input" value={form.mainBranchName} onChange={(event) => updateField('mainBranchName', event.target.value)} />
                </label>
              ) : null}
              {intent?.workspace_type === WORKSPACE_TYPES.developerCompany ? (
                <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                  Operating area
                  <input className="auth-input" value={form.operatingArea} onChange={(event) => updateField('operatingArea', event.target.value)} />
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="submit" className="header-primary-cta" disabled={saving}>
                {saving ? 'Creating workspace...' : `Create ${workspaceNoun}`}
              </button>
            </div>
          </form>
        ) : null}

        {canAcceptInvite ? (
          <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleAcceptInvite}>
            <SetupStatusCard title="Invite acceptance">
              <p>Confirm the invite token and Bridge will create your active membership if the invite is valid.</p>
            </SetupStatusCard>
            <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
              Invite token
              <input className="auth-input" value={form.inviteToken} onChange={(event) => updateField('inviteToken', event.target.value)} />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="submit" className="header-primary-cta" disabled={saving}>
                {saving ? 'Accepting invite...' : 'Accept invite'}
              </button>
            </div>
          </form>
        ) : null}

        {canJoinOrRequest ? (
          <div className="grid gap-4">
            <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleAcceptInvite}>
              <SetupStatusCard title="Have an invite code?">
                <p>Paste it here. Operational users can only enter a workspace through a valid invite or approval.</p>
              </SetupStatusCard>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Invite token
                <input className="auth-input" value={form.inviteToken} onChange={(event) => updateField('inviteToken', event.target.value)} />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="submit" className="header-secondary-cta" disabled={saving}>
                  Accept invite
                </button>
              </div>
            </form>

            <form className="grid gap-4 rounded-[16px] border border-[#dde4ee] bg-white px-4 py-4" onSubmit={handleRequestAccess}>
              <SetupStatusCard title="Request access" tone="warning">
                <p>This creates a pending backend request. It does not create a workspace or unlock dashboards.</p>
              </SetupStatusCard>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Workspace or business name
                <input className="auth-input" value={form.workspaceNameForRequest} onChange={(event) => updateField('workspaceNameForRequest', event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#31485e]">
                Message
                <textarea className="auth-input min-h-[96px]" value={form.requestMessage} onChange={(event) => updateField('requestMessage', event.target.value)} />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="submit" className="header-primary-cta" disabled={saving}>
                  {saving ? 'Sending request...' : 'Request access'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {!intent && onboardingRequiredReason ? (
          <SetupStatusCard title="Repair state" tone="warning">
            <p>Current setup reason: {onboardingRequiredReason.replace(/_/g, ' ')}.</p>
          </SetupStatusCard>
        ) : null}

        {onboardingState?.recoveryReason ? (
          <SetupStatusCard title="Recovery required" tone="warning">
            <p>Bridge needs to repair: {onboardingState.recoveryReason.replace(/_/g, ' ')}.</p>
          </SetupStatusCard>
        ) : null}

        {message ? <p className="rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-2 text-sm text-[#236340]">{message}</p> : null}
        {error ? <p className="rounded-[12px] border border-[#f2c8c4] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f1c1c]">{error}</p> : null}
    </OnboardingProgressLayout>
  )
}
