import { CheckCircle2, Mail, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { acceptInvite, getInviteByToken, InviteValidationError } from '../services/inviteService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const PENDING_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'

function normalizeText(value) {
  return String(value || '').trim()
}

function getInviteTitle(reason = '') {
  if (reason === 'expired') return 'Invite Expired'
  if (reason === 'revoked') return 'Invite Revoked'
  if (reason === 'already_accepted') return 'Invite Already Used'
  if (reason === 'invite_email_mismatch') return 'Wrong Account'
  return 'Invite Not Available'
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
      if (typeof window !== 'undefined' && safeToken) {
        window.sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, safeToken)
      }
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

      try {
        const sessionResult = await supabase.auth.getSession()
        if (!active) return
        const user = sessionResult?.data?.session?.user || null
        const signedInEmail = normalizeText(user?.email).toLowerCase()
        setSessionUserId(normalizeText(user?.id))
        setSessionEmail(signedInEmail)
        if (!signedInEmail) {
          setInviteContext({ token: safeToken })
          setLoading(false)
          return
        }
        const context = await getInviteByToken(safeToken)
        if (!active) return
        setInviteContext(context.invite || null)
        setReason(context.ok ? '' : context.reason || 'not_found')
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load this invite.')
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
  const invitePurpose = useMemo(() => {
    if (!invite) return 'Bridge invite'
    if (invite.inviteType === 'transaction_invite') return 'Transaction collaboration'
    if (invite.inviteType === 'workspace_and_transaction_invite') return 'Workspace and transaction collaboration'
    if (invite.inviteType === 'client_invite') return 'Client access'
    return workspaceName ? `${workspaceName} workspace` : 'Workspace access'
  }, [invite, workspaceName])

  useEffect(() => {
    if (acceptedInviteBelongsToSession) {
      clearPendingInviteToken()
    }
  }, [acceptedInviteBelongsToSession])

  async function handleAccept() {
    const safeToken = normalizeText(token)
    if (!safeToken) return
    if (!sessionEmail) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, safeToken)
      }
      navigate(`/auth?next=${encodeURIComponent(`/invite/${safeToken}`)}`)
      return
    }

    try {
      setSaving(true)
      setError('')
      const result = await acceptInvite(safeToken)
      setAcceptedResult(result)
      clearPendingInviteToken()
    } catch (acceptError) {
      if (acceptError instanceof InviteValidationError) {
        setReason(acceptError.code)
        setError(acceptError.code === 'invite_email_mismatch'
          ? `You are signed in as ${sessionEmail}. Sign in as ${invitedEmail || 'the invited email'} to accept this invite.`
          : acceptError.message || acceptError.code)
      } else {
        setError(acceptError?.message || 'Unable to accept this invite.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSwitchAccount() {
    const safeToken = normalizeText(token)
    if (typeof window !== 'undefined' && safeToken) {
      window.sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, safeToken)
    }
    await supabase?.auth?.signOut?.()
    navigate(`/auth?next=${encodeURIComponent(`/invite/${safeToken}`)}`, { replace: true })
  }

  if (loading) {
    return <section className="mx-auto max-w-[720px] rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">Loading invite…</section>
  }

  if (acceptedResult) {
    const target = getRedirectTarget(acceptedResult)
    return (
      <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 size={18} />
          <h1 className="text-page-title font-semibold">Invite accepted</h1>
        </div>
        <p className="text-secondary text-textMuted">Your access has been created and verified.</p>
        <Link to={target} className="inline-flex rounded-control bg-primary px-4 py-2 text-secondary font-semibold text-white">
          Continue
        </Link>
      </section>
    )
  }

  if (acceptedInviteBelongsToSession) {
    const target = getInviteTarget(invite)
    return (
      <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 size={18} />
          <h1 className="text-page-title font-semibold">You’re already connected</h1>
        </div>
        <p className="text-secondary text-textMuted">
          This invite has already been accepted for {invitedEmail || 'your account'}. Continue into Bridge to access the workspace.
        </p>
        <Link to={target} className="inline-flex rounded-control bg-primary px-4 py-2 text-secondary font-semibold text-white">
          Continue to Bridge
        </Link>
      </section>
    )
  }

  if (pendingInviteWrongAccount) {
    return (
      <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert size={18} />
          <h1 className="text-page-title font-semibold">Wrong account</h1>
        </div>
        <p className="text-secondary text-textMuted">
          This invite is for <strong>{invitedEmail}</strong>, but you are signed in as <strong>{sessionEmail}</strong>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleSwitchAccount()}>
            Switch account
          </Button>
          <Link to="/dashboard" className="inline-flex rounded-control border border-borderDefault px-4 py-2 text-secondary font-semibold text-textStrong">
            Back to Bridge
          </Link>
        </div>
      </section>
    )
  }

  if (reason && reason !== 'not_authenticated') {
    return (
      <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert size={18} />
          <h1 className="text-page-title font-semibold">{getInviteTitle(reason)}</h1>
        </div>
        <p className="text-secondary text-textMuted">
          {reason === 'already_accepted'
            ? 'This invite link has already been used. Sign in with the invited account, or ask the sender to resend access if you still need help.'
            : 'We could not validate this invite. Ask the sender to issue a fresh invite if access is still required.'}
        </p>
        {error ? <p className="rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-secondary text-danger">{error}</p> : null}
        <Link to="/dashboard" className="inline-flex rounded-control border border-borderDefault px-4 py-2 text-secondary font-semibold text-textStrong">
          Back to Bridge
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
      <div className="space-y-1.5">
        <span className="text-label font-semibold uppercase text-textMuted">Bridge Invite</span>
        <h1 className="text-page-title font-semibold text-textStrong">Accept Invite</h1>
        <p className="text-secondary text-textMuted">{invitePurpose}</p>
      </div>

      <div className="space-y-3 rounded-control border border-borderSoft bg-surfaceAlt p-4">
        {invitedEmail ? (
          <p className="text-secondary text-textBody">
            This invite is for <strong>{invitedEmail}</strong>.
          </p>
        ) : null}
        {sessionEmail ? (
          <p className="text-helper text-textMuted">Signed in as {sessionEmail}</p>
        ) : (
          <p className="text-helper text-textMuted">
            Sign in, or create an account with the invited email address, to continue.
          </p>
        )}
        <Button type="button" onClick={() => void handleAccept()} disabled={saving}>
          {saving ? 'Accepting…' : sessionEmail ? 'Accept Invite' : 'Sign in or Create Account'}
        </Button>
      </div>

      {error ? <p className="rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-secondary text-danger">{error}</p> : null}
      <p className="inline-flex items-center gap-2 text-helper text-textMuted">
        <Mail size={14} />
        Invite acceptance is validated against the signed-in email.
      </p>
    </section>
  )
}
