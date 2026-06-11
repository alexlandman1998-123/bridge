import { ArrowRight, Building2, CheckCircle2, Mail, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { acceptInvite, getInviteByToken, InviteValidationError } from '../services/inviteService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const PENDING_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'
const PENDING_INVITE_EMAIL_STORAGE_KEY = 'itg:pending-org-invite-email'
const PENDING_INVITE_AUTO_ACCEPT_STORAGE_KEY = 'itg:pending-org-invite-auto-accept-token'
const CLEAR_PENDING_INVITE_REASONS = new Set(['not_found', 'expired', 'revoked', 'already_accepted'])

function normalizeText(value) {
  return String(value || '').trim()
}

function getInviteTitle(reason = '') {
  if (reason === 'expired') return 'Invite Expired'
  if (reason === 'revoked') return 'Invite Revoked'
  if (reason === 'already_accepted') return 'Invite Already Used'
  if (reason === 'invite_email_mismatch') return 'Wrong Account'
  if (reason === 'existing_membership_branch_mismatch') return 'Branch Transfer Required'
  return 'Invite Not Available'
}

function formatInviteRoleLabel(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  const labels = {
    owner: 'Organisation Owner',
    principal: 'Principal',
    admin: 'Admin',
    admin_staff: 'Admin Staff',
    branch_manager: 'Branch Manager',
    team_lead: 'Team Lead',
    agent: 'Agent',
    assistant: 'Assistant',
    transaction_coordinator: 'Transaction Coordinator',
    listing_coordinator: 'Listing Coordinator',
    admin_coordinator: 'Admin Coordinator',
    attorney: 'Attorney',
    developer: 'Developer',
    bond_originator: 'Bond Originator',
  }
  if (labels[normalized]) return labels[normalized]
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Workspace Member'
}

function getInviteBranchName(invite = {}) {
  return normalizeText(invite?.metadata?.branch_name || invite?.metadata?.branchName || invite?.metadata?.office_name || invite?.metadata?.officeName)
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function getInviteWorkspaceLogoUrl(invite = {}) {
  return normalizeText(
    invite?.workspace?.logo_url ||
      invite?.workspace?.logoUrl ||
      invite?.metadata?.organisation_logo_url ||
      invite?.metadata?.organisationLogoUrl ||
      invite?.metadata?.workspace_logo_url ||
      invite?.metadata?.workspaceLogoUrl,
  )
}

function getInviteUnavailableMessage(reason = '') {
  if (reason === 'already_accepted') {
    return 'This invite link has already been used. Sign in with the invited account, or ask the sender to resend access if you still need help.'
  }
  if (reason === 'existing_membership_branch_mismatch') {
    return 'This account is already connected to a different branch. Ask a principal or admin to transfer the membership before accepting this branch invite.'
  }
  if (reason === 'expired') return 'This invite has expired. Ask the sender to issue a fresh invite.'
  if (reason === 'revoked') return 'This invite was revoked. Ask the sender to issue a fresh invite if access is still needed.'
  if (reason === 'invite_email_mismatch') return 'This invite belongs to another email address. Switch accounts to continue.'
  return 'We could not validate this invite. Ask the sender to issue a fresh invite if access is still required.'
}

function getInviteErrorMessage(error, { sessionEmail = '', invitedEmail = '' } = {}) {
  if (error instanceof InviteValidationError) {
    if (error.code === 'invite_email_mismatch') {
      return `You are signed in as ${sessionEmail}. Sign in as ${invitedEmail || 'the invited email'} to accept this invite.`
    }
    if (error.code === 'existing_membership_branch_mismatch') {
      return 'This account is already assigned to another branch. A principal or admin needs to transfer the membership first.'
    }
    if (error.code === 'invite_expired') return 'This invite has expired. Ask the sender for a new invite.'
    if (error.code === 'invite_accepted') return 'This invite has already been accepted.'
    return error.message || error.code
  }
  return error?.message || 'Unable to accept this invite.'
}

function getRedirectTarget(result = {}) {
  if (result.redirect_to) return result.redirect_to
  if (result.transaction_id) return `/transactions/${result.transaction_id}`
  return '/dashboard'
}

function getInviteTarget(invite = {}) {
  if (invite.targetTransactionId) return `/transactions/${invite.targetTransactionId}`
  return '/dashboard'
}

function clearPendingInviteToken() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY)
  window.sessionStorage.removeItem(PENDING_INVITE_EMAIL_STORAGE_KEY)
  window.sessionStorage.removeItem(PENDING_INVITE_AUTO_ACCEPT_STORAGE_KEY)
}

function rememberPendingInvite({ token = '', email = '' } = {}) {
  if (typeof window === 'undefined') return
  const safeToken = normalizeText(token)
  const safeEmail = normalizeText(email).toLowerCase()
  if (safeToken) window.sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, safeToken)
  if (safeEmail) window.sessionStorage.setItem(PENDING_INVITE_EMAIL_STORAGE_KEY, safeEmail)
}

function rememberPendingInviteAutoAccept(token = '') {
  if (typeof window === 'undefined') return
  const safeToken = normalizeText(token)
  if (safeToken) window.sessionStorage.setItem(PENDING_INVITE_AUTO_ACCEPT_STORAGE_KEY, safeToken)
}

function clearPendingInviteAutoAccept() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_INVITE_AUTO_ACCEPT_STORAGE_KEY)
}

function shouldAutoAcceptInvite(token = '') {
  if (typeof window === 'undefined') return false
  const safeToken = normalizeText(token)
  return Boolean(safeToken && window.sessionStorage.getItem(PENDING_INVITE_AUTO_ACCEPT_STORAGE_KEY) === safeToken)
}

function getAuthInvitePath({ token = '', email = '', mode = '' } = {}) {
  const safeToken = normalizeText(token)
  const params = new URLSearchParams()
  params.set('next', `/invite/${safeToken}`)
  const safeEmail = normalizeText(email).toLowerCase()
  if (safeEmail) params.set('email', safeEmail)
  if (mode) params.set('mode', mode)
  return `/auth?${params.toString()}`
}

function InviteDetailList({ details = [] }) {
  if (!details.length) return null
  return (
    <dl className="grid gap-3 border-y border-borderSoft bg-surfaceAlt px-6 py-5 sm:grid-cols-3 sm:px-8">
      {details.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-label font-semibold uppercase text-textMuted">{item.label}</dt>
          <dd className="mt-1 truncate text-base font-semibold text-textStrong">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function InvitePageShell({ children }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-mutedBg px-4 py-10 sm:px-6">
      {children}
    </main>
  )
}

function InviteCard({ children }) {
  return (
    <section className="w-full max-w-[760px] overflow-hidden rounded-surface-xl border border-borderDefault bg-surface shadow-modal">
      <div className="h-1.5 bg-primary" />
      {children}
    </section>
  )
}

function InviteBrandStrip({ workspaceName = '', workspaceLogoUrl = '' }) {
  const inviterName = normalizeText(workspaceName) || 'Inviting workspace'

  return (
    <div className="flex items-center justify-between gap-4 border-b border-borderSoft px-5 py-5 sm:px-7">
      <div className="flex min-w-0 items-center">
        {workspaceLogoUrl ? (
          <img src={workspaceLogoUrl} alt={`${inviterName} logo`} className="h-16 w-24 rounded-control border border-borderSoft bg-surface object-contain p-2 shadow-surface sm:h-20 sm:w-32" />
        ) : (
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-control border border-borderSoft bg-primarySoft text-xl font-semibold text-primary shadow-surface sm:h-20 sm:w-32">
            {getInitials(inviterName)}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end">
        <img src="/brand/bridge_9_white_background.png" alt="Bridge9" className="h-10 w-[100px] object-contain object-right sm:h-12 sm:w-[120px]" />
      </div>
    </div>
  )
}

function InviteHeader({ icon, eyebrow = 'Bridge Invite', title, subtitle, tone = 'primary' }) {
  const iconClassName = tone === 'danger'
    ? 'bg-dangerSoft text-danger'
    : tone === 'success'
      ? 'bg-successSoft text-success'
      : 'bg-primarySoft text-primary'

  return (
    <header className="flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center sm:px-8">
      <div className={`flex h-12 w-12 items-center justify-center rounded-control ${iconClassName}`}>
        {icon}
      </div>
      <div className="max-w-[560px] space-y-2">
        <span className="text-label font-semibold uppercase tracking-[0.18em] text-textMuted">{eyebrow}</span>
        <h1 className="text-page-title font-semibold text-textStrong">{title}</h1>
        {subtitle ? <p className="text-secondary leading-6 text-textMuted">{subtitle}</p> : null}
      </div>
    </header>
  )
}

function InviteActionPanel({ children }) {
  return (
    <div className="px-6 py-6 sm:px-8">
      <div className="space-y-4 rounded-control border border-borderSoft bg-mutedBg p-5">
        {children}
      </div>
    </div>
  )
}

function InviteFooter({ children }) {
  return (
    <footer className="flex items-center justify-center gap-2 border-t border-borderSoft px-6 py-4 text-center text-helper text-textMuted sm:px-8">
      {children}
    </footer>
  )
}

function SecondaryInviteLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-[42px] items-center justify-center rounded-control border border-borderDefault bg-surface px-4 py-2 text-secondary font-semibold text-textStrong shadow-surface transition hover:border-borderStrong hover:bg-mutedBg">
      {children}
    </Link>
  )
}

export default function InviteResolver() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviteContext, setInviteContext] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [acceptedResult, setAcceptedResult] = useState(null)
  const [sessionEmail, setSessionEmail] = useState('')
  const [sessionUserId, setSessionUserId] = useState('')

  useEffect(() => {
    let active = true
    async function loadInvite() {
      const safeToken = normalizeText(token)
      rememberPendingInvite({ token: safeToken })
      if (!safeToken) {
        setReason('not_found')
        setLoading(false)
        return
      }
      if (!isSupabaseConfigured || !supabase) {
        setReason('invite_backend_unavailable')
        setLoading(false)
        return
      }

      let signedInEmail = ''
      try {
        const sessionResult = await supabase.auth.getSession()
        if (!active) return
        const user = sessionResult?.data?.session?.user || null
        signedInEmail = normalizeText(user?.email).toLowerCase()
        setSessionUserId(normalizeText(user?.id))
        setSessionEmail(signedInEmail)
        const context = await getInviteByToken(safeToken)
        if (!active) return
        setInviteContext(context.invite || null)
        setReason(context.ok ? '' : context.reason || 'not_found')
        if (context.invite?.email) {
          rememberPendingInvite({ token: safeToken, email: context.invite.email })
        }
      } catch (loadError) {
        if (!active) return
        if (!signedInEmail) {
          setInviteContext({ token: safeToken })
        } else {
          setError(loadError?.message || 'Unable to load this invite.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInvite()
    return () => {
      active = false
    }
  }, [token])

  const invite = inviteContext?.inviteType ? inviteContext : null
  const invitedEmail = normalizeText(invite?.email)
  const signedInAsInvitedEmail = Boolean(sessionEmail && invitedEmail && sessionEmail === invitedEmail.toLowerCase())
  const acceptedBySignedInUser = Boolean(sessionUserId && invite?.acceptedByUserId && sessionUserId === invite.acceptedByUserId)
  const acceptedInviteBelongsToSession = Boolean(reason === 'already_accepted' && (signedInAsInvitedEmail || acceptedBySignedInUser))
  const pendingInviteWrongAccount = Boolean(reason === '' && sessionEmail && invitedEmail && !signedInAsInvitedEmail)
  const workspaceName = normalizeText(invite?.workspace?.display_name || invite?.workspace?.name)
  const workspaceLogoUrl = getInviteWorkspaceLogoUrl(invite)
  const branchName = getInviteBranchName(invite)
  const roleLabel = invite ? formatInviteRoleLabel(invite?.metadata?.role_label || invite?.targetWorkspaceRole || invite?.metadata?.role) : ''
  const inviteDetails = useMemo(() => {
    const rows = []
    if (workspaceName) rows.push({ label: 'Workspace', value: workspaceName })
    if (branchName) rows.push({ label: 'Branch', value: branchName })
    if (roleLabel) rows.push({ label: 'Role', value: roleLabel })
    return rows
  }, [branchName, roleLabel, workspaceName])
  const invitePurpose = useMemo(() => {
    if (!invite) return 'Bridge invite'
    if (invite.inviteType === 'transaction_invite') return 'Transaction collaboration'
    if (invite.inviteType === 'workspace_and_transaction_invite') return 'Workspace and transaction collaboration'
    if (invite.inviteType === 'client_invite') return 'Client access'
    if (invite.inviteType === 'branch_invite') {
      return branchName && workspaceName ? `${branchName} branch at ${workspaceName}` : 'Branch workspace access'
    }
    if (invite.inviteType === 'team_invite') return 'Team workspace access'
    return workspaceName ? `${workspaceName} workspace` : 'Workspace access'
  }, [branchName, invite, workspaceName])

  useEffect(() => {
    if (acceptedInviteBelongsToSession) {
      clearPendingInviteToken()
    }
  }, [acceptedInviteBelongsToSession])

  useEffect(() => {
    if (CLEAR_PENDING_INVITE_REASONS.has(reason) && !pendingInviteWrongAccount) {
      clearPendingInviteToken()
    }
  }, [pendingInviteWrongAccount, reason])

  const handleAccept = useCallback(async () => {
    const safeToken = normalizeText(token)
    if (!safeToken) return
    if (!sessionEmail) {
      rememberPendingInvite({ token: safeToken, email: invitedEmail })
      rememberPendingInviteAutoAccept(safeToken)
      navigate(getAuthInvitePath({ token: safeToken, email: invitedEmail, mode: 'signup' }))
      return
    }

    try {
      setSaving(true)
      setError('')
      const result = await acceptInvite(safeToken)
      setAcceptedResult(result)
      clearPendingInviteToken()
    } catch (acceptError) {
      clearPendingInviteAutoAccept()
      if (acceptError instanceof InviteValidationError) {
        setReason(acceptError.code)
        setError(getInviteErrorMessage(acceptError, { sessionEmail, invitedEmail }))
      } else {
        setError(getInviteErrorMessage(acceptError, { sessionEmail, invitedEmail }))
      }
    } finally {
      setSaving(false)
    }
  }, [invitedEmail, navigate, sessionEmail, token])

  useEffect(() => {
    const safeToken = normalizeText(token)
    if (!safeToken || saving || acceptedResult) return
    if (reason || pendingInviteWrongAccount || !signedInAsInvitedEmail) return
    if (!shouldAutoAcceptInvite(safeToken)) return
    void handleAccept()
  }, [acceptedResult, handleAccept, pendingInviteWrongAccount, reason, saving, signedInAsInvitedEmail, token])

  async function handleSwitchAccount() {
    const safeToken = normalizeText(token)
    rememberPendingInvite({ token: safeToken, email: invitedEmail })
    await supabase?.auth?.signOut?.()
    navigate(getAuthInvitePath({ token: safeToken, email: invitedEmail }), { replace: true })
  }

  if (loading) {
    return (
      <InvitePageShell>
        <InviteCard>
          <InviteBrandStrip />
          <InviteHeader
            icon={<Mail size={22} />}
            title="Loading invite"
            subtitle="Checking the invite details before you continue."
          />
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (acceptedResult) {
    const target = getRedirectTarget(acceptedResult)
    return (
      <InvitePageShell>
        <InviteCard>
          <InviteBrandStrip workspaceName={workspaceName} workspaceLogoUrl={workspaceLogoUrl} />
          <InviteHeader
            icon={<CheckCircle2 size={22} />}
            title="Invite accepted"
            subtitle="Your access has been created and verified."
            tone="success"
          />
          <InviteActionPanel>
            <Link to={target} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-primary px-5 py-2.5 text-secondary font-semibold text-white shadow-surface transition hover:bg-primaryHover">
              Continue <ArrowRight size={16} />
            </Link>
          </InviteActionPanel>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (acceptedInviteBelongsToSession) {
    const target = getInviteTarget(invite)
    return (
      <InvitePageShell>
        <InviteCard>
          <InviteBrandStrip workspaceName={workspaceName} workspaceLogoUrl={workspaceLogoUrl} />
          <InviteHeader
            icon={<CheckCircle2 size={22} />}
            title="You’re already connected"
            subtitle={`This invite has already been accepted for ${invitedEmail || 'your account'}. Continue into Bridge to access the workspace.`}
            tone="success"
          />
          <InviteActionPanel>
            <Link to={target} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-primary px-5 py-2.5 text-secondary font-semibold text-white shadow-surface transition hover:bg-primaryHover">
              Continue to Bridge <ArrowRight size={16} />
            </Link>
          </InviteActionPanel>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (pendingInviteWrongAccount) {
    return (
      <InvitePageShell>
        <InviteCard>
          <InviteBrandStrip workspaceName={workspaceName} workspaceLogoUrl={workspaceLogoUrl} />
          <InviteHeader
            icon={<ShieldAlert size={22} />}
            title="Wrong account"
            subtitle={<>This invite is for <strong>{invitedEmail}</strong>, but you are signed in as <strong>{sessionEmail}</strong>.</>}
            tone="danger"
          />
          <InviteDetailList details={inviteDetails} />
          <InviteActionPanel>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void handleSwitchAccount()}>
                Switch account
              </Button>
              <SecondaryInviteLink to="/dashboard">Back to Bridge</SecondaryInviteLink>
            </div>
          </InviteActionPanel>
        </InviteCard>
      </InvitePageShell>
    )
  }

  if (reason && reason !== 'not_authenticated') {
    return (
      <InvitePageShell>
        <InviteCard>
          <InviteBrandStrip workspaceName={workspaceName} workspaceLogoUrl={workspaceLogoUrl} />
          <InviteHeader
            icon={<ShieldAlert size={22} />}
            title={getInviteTitle(reason)}
            subtitle={getInviteUnavailableMessage(reason)}
            tone="danger"
          />
          <InviteDetailList details={inviteDetails} />
          <InviteActionPanel>
            {error ? <p className="rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-secondary text-danger">{error}</p> : null}
            <div className="flex justify-center">
              <SecondaryInviteLink to="/dashboard">Back to Bridge</SecondaryInviteLink>
            </div>
          </InviteActionPanel>
        </InviteCard>
      </InvitePageShell>
    )
  }

  return (
    <InvitePageShell>
      <InviteCard>
        <InviteBrandStrip workspaceName={workspaceName} workspaceLogoUrl={workspaceLogoUrl} />
        <InviteHeader
          icon={<Building2 size={22} />}
          title="Accept Invite"
          subtitle={invitePurpose}
        />

        <InviteDetailList details={inviteDetails} />

        <InviteActionPanel>
          {invitedEmail ? (
            <p className="text-center text-secondary text-textBody">
              This invite is for <strong>{invitedEmail}</strong>.
            </p>
          ) : null}
          {sessionEmail ? (
            <p className="text-center text-helper text-textMuted">Signed in as {sessionEmail}</p>
          ) : (
            <p className="text-center text-helper text-textMuted">
              Continue with the invited email address. Bridge will apply the workspace and role from this invite.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => void handleAccept()} disabled={saving}>
              {saving ? 'Accepting…' : 'Accept invite'}
            </Button>
          </div>
        </InviteActionPanel>

        {error ? (
          <div className="px-6 pb-4 sm:px-8">
            <p className="rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-secondary text-danger">{error}</p>
          </div>
        ) : null}
        <InviteFooter>
          <Mail size={14} />
          <span>Invite acceptance is validated against the signed-in email.</span>
        </InviteFooter>
      </InviteCard>
    </InvitePageShell>
  )
}
