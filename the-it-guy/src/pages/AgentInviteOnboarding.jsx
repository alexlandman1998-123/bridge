import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { recordAuditEvent } from '../lib/activityAudit'
import Field from '../components/ui/Field'
import { completeInvitedMemberOnboarding, fetchOrganisationInviteByToken } from '../lib/settingsApi'
import {
  acceptAgentInvite,
  AGENT_ROLE_OPTIONS,
  getAgentInviteContext,
  startAgentInviteOnboarding,
} from '../lib/agentInviteService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import { getWorkspaceInviteByToken, joinWorkspaceFromInvite } from '../services/workspaceService'

const PENDING_ORG_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'
const LOCAL_INVITE_FALLBACK_ENABLED = isUnsafeFallbackAllowed()

function persistPendingInviteToken(token) {
  if (typeof window === 'undefined') return
  const safeToken = String(token || '').trim()
  if (!safeToken) return
  window.sessionStorage.setItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY, safeToken)
}

function clearPendingInviteToken() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY)
}

function prettyStatus(reason) {
  if (reason === 'expired') return 'Invite Expired'
  if (reason === 'revoked') return 'Invite Revoked'
  if (reason === 'already_accepted') return 'Invite Already Used'
  return 'Invite Not Found'
}

export default function AgentInviteOnboarding() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState(null)
  const [invalidReason, setInvalidReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [inviteSource, setInviteSource] = useState('supabase')
  const [sessionUserEmail, setSessionUserEmail] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    surname: '',
    email: '',
    mobile: '',
    ppraNumber: '',
    photoUrl: '',
    acceptedTerms: false,
  })

  useEffect(() => {
    let active = true
    persistPendingInviteToken(token)

    async function loadInvite() {
      console.debug('[ONBOARDING] invite:load:start', { token: String(token || '').trim() })
      if (isSupabaseConfigured && supabase) {
        let signedInEmail = ''
        try {
          const sessionResult = await supabase.auth.getSession()
          if (!active) return
          signedInEmail = String(sessionResult?.data?.session?.user?.email || '').trim().toLowerCase()
          setSessionUserEmail(signedInEmail)
          if (!signedInEmail && !LOCAL_INVITE_FALLBACK_ENABLED) {
            setInviteSource('workspace')
            setInvite({ token, organisationName: 'your workspace', role: 'agent', email: '' })
            setLoading(false)
            return
          }
          if (signedInEmail) {
            const workspaceInviteContext = await getWorkspaceInviteByToken(token)
            if (!active) return
            if (workspaceInviteContext?.ok && workspaceInviteContext.invite) {
              const activeInvite = {
                ...workspaceInviteContext.invite,
                organisationName:
                  workspaceInviteContext.invite.organisations?.display_name ||
                  workspaceInviteContext.invite.organisations?.name ||
                  'Arch9 Workspace',
                email: workspaceInviteContext.invite.invited_email,
                role: workspaceInviteContext.invite.organisation_role,
                firstName: '',
                surname: '',
                mobile: '',
              }
              setInviteSource('workspace')
              setInvite(activeInvite)
              setForm((previous) => ({
                ...previous,
                email: String(activeInvite?.email || '').trim(),
              }))
              setLoading(false)
              console.debug('[ONBOARDING] invite:load:success', { source: 'workspace_invites', email: activeInvite?.email || '' })
              return
            }
            if (workspaceInviteContext?.reason && workspaceInviteContext.reason !== 'invite_schema_missing' && workspaceInviteContext.reason !== 'not_found') {
              setInvite(workspaceInviteContext?.invite || null)
              setInvalidReason(workspaceInviteContext.reason)
              setLoading(false)
              return
            }
          }

          const inviteContext = await fetchOrganisationInviteByToken(token)
          if (!active) return
          if (inviteContext?.ok && inviteContext.invite) {
            const activeInvite = {
              ...inviteContext.invite,
              surname: inviteContext.invite.lastName,
              mobile: '',
            }
            setInviteSource('supabase')
            setInvite(activeInvite)
            setForm((previous) => ({
              ...previous,
              firstName: String(activeInvite?.firstName || '').trim(),
              surname: String(activeInvite?.surname || '').trim(),
              email: String(activeInvite?.email || '').trim(),
            }))
            setLoading(false)
            console.debug('[ONBOARDING] invite:load:success', { source: 'supabase', email: activeInvite?.email || '' })
            return
          }

          if (inviteContext?.reason !== 'invite_schema_missing') {
            setInvite(inviteContext?.invite || null)
            setInvalidReason(inviteContext?.reason || 'not_found')
            setLoading(false)
            return
          }
        } catch (loadError) {
          if (!active) return
          console.error('[ONBOARDING] invite:load:failed', loadError)
          if (!signedInEmail) {
            setInviteSource('workspace')
            setInvite({ token, organisationName: 'your workspace', role: 'agent', email: '' })
            setLoading(false)
            return
          }
          setError(loadError?.message || 'Unable to load invite.')
        }
      }

      if (!LOCAL_INVITE_FALLBACK_ENABLED) {
        setInvalidReason('not_found')
        setLoading(false)
        return
      }

      const context = startAgentInviteOnboarding(token)
      setInviteSource('local')
      if (!context?.ok) {
        const resolved = getAgentInviteContext(token)
        setInvite(resolved?.invite || null)
        setInvalidReason(resolved?.reason || context?.reason || 'not_found')
        setLoading(false)
        return
      }
      const activeInvite = context.invite
      setInvite(activeInvite)
      setForm((previous) => ({
        ...previous,
        firstName: String(activeInvite?.firstName || '').trim(),
        surname: String(activeInvite?.surname || '').trim(),
        email: String(activeInvite?.email || '').trim(),
        mobile: String(activeInvite?.mobile || '').trim(),
      }))
      setLoading(false)
      console.debug('[ONBOARDING] invite:load:success', { source: 'local', email: activeInvite?.email || '' })
    }

    void loadInvite()
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (done || invalidReason) {
      clearPendingInviteToken()
    }
  }, [done, invalidReason])

  const roleLabel = useMemo(() => {
    const role = String(invite?.role || 'agent').trim().toLowerCase()
    return AGENT_ROLE_OPTIONS.find((option) => option.value === role)?.label || 'Agent'
  }, [invite?.role])

  async function handleSubmit(event) {
    event.preventDefault()
    if (inviteSource === 'workspace' && !sessionUserEmail) {
      const safeToken = String(token || '').trim()
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY, safeToken)
        window.location.assign(`/auth?next=${encodeURIComponent(`/invite/${safeToken}`)}`)
      }
      return
    }

    if (inviteSource !== 'workspace' && (!form.firstName.trim() || !form.surname.trim() || !form.email.trim() || !form.mobile.trim())) {
      setError('First name, surname, email, and mobile are required.')
      return
    }
    if (!form.acceptedTerms) {
      setError('Please accept the invitation terms to continue.')
      return
    }

    try {
      setSaving(true)
      setError('')
      if (inviteSource === 'workspace' && isSupabaseConfigured && supabase) {
        const sessionResult = await supabase.auth.getSession()
        const signedInEmail = String(sessionResult?.data?.session?.user?.email || '').trim().toLowerCase()
        if (!signedInEmail) {
          const safeToken = String(token || '').trim()
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY, safeToken)
            window.location.assign(`/auth?next=${encodeURIComponent(`/invite/${safeToken}`)}`)
          }
          return
        }
        await joinWorkspaceFromInvite(token, sessionResult.data.session.user)
        recordAuditEvent('invite_accepted', {
          source: 'workspace_invites',
          email: signedInEmail,
          organisationName: invite?.organisationName || '',
        })
      } else if (inviteSource === 'supabase' && isSupabaseConfigured && supabase) {
        const sessionResult = await supabase.auth.getSession()
        const signedInEmail = String(sessionResult?.data?.session?.user?.email || '').trim().toLowerCase()
        if (!signedInEmail) {
          const safeToken = String(token || '').trim()
          const nextPath = `/invite/${safeToken}`
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY, safeToken)
            console.debug('[REDIRECT] invite:require-signin', { nextPath })
            window.location.assign(`/auth?next=${encodeURIComponent(nextPath)}`)
          }
          return
        }
        const inviteEmail = String(invite?.email || '').trim().toLowerCase()
        if (inviteEmail && signedInEmail !== inviteEmail) {
          throw new Error(`You are signed in as ${signedInEmail}. Sign in as ${inviteEmail} to accept this invite.`)
        }
        await completeInvitedMemberOnboarding({
          token,
          firstName: form.firstName,
          lastName: form.surname,
          phoneNumber: form.mobile,
          ppraNumber: form.ppraNumber,
          photoUrl: form.photoUrl,
        })
        recordAuditEvent('invite_accepted', {
          source: 'supabase',
          email: String(form.email || '').trim().toLowerCase(),
          organisationName: invite?.organisationName || '',
        })
      } else {
        acceptAgentInvite({
          token,
          firstName: form.firstName,
          surname: form.surname,
          email: form.email,
          mobile: form.mobile,
          ppraNumber: form.ppraNumber,
          photoUrl: form.photoUrl,
          acceptedTerms: form.acceptedTerms,
        })
        recordAuditEvent('invite_accepted', {
          source: 'local',
          email: String(form.email || '').trim().toLowerCase(),
          organisationName: invite?.organisationName || '',
        })
      }
      setDone(true)
      console.debug('[ONBOARDING] invite:complete:success', { source: inviteSource })
    } catch (submitError) {
      console.error('[ONBOARDING] invite:complete:failed', submitError)
      setError(submitError?.message || 'Unable to activate profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-3xl p-6">
        <div className="rounded-[24px] border border-[#dde4ee] bg-white px-6 py-10 text-sm text-[#647a92]">Loading invite…</div>
      </section>
    )
  }

  if (invalidReason && !done) {
    return (
      <section className="mx-auto max-w-3xl p-6">
        <article className="rounded-[24px] border border-[#f1d9cc] bg-[#fff6f2] p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="text-[#b54708]" size={20} />
            <h1 className="text-[1.2rem] font-semibold text-[#142132]">{prettyStatus(invalidReason)}</h1>
          </div>
          <p className="mt-3 text-sm text-[#6d4f38]">
            This onboarding link is no longer valid. Please contact your principal or agency admin to resend the invite.
          </p>
        </article>
      </section>
    )
  }

  if (done) {
    return (
      <section className="mx-auto max-w-3xl p-6">
        <article className="rounded-[24px] border border-[#d5e9dc] bg-[#effcf4] p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-[#1d7d45]" size={20} />
            <h1 className="text-[1.2rem] font-semibold text-[#142132]">Profile Activated</h1>
          </div>
          <p className="mt-3 text-sm text-[#3f6a4e]">
            Your Arch9 agent profile is now active under {invite?.organisationName || 'the organisation'}.
          </p>
          <div className="mt-5">
            {sessionUserEmail ? (
              <Link to="/dashboard" className="inline-flex rounded-[12px] border border-[#1f4f78] bg-[#1f4f78] px-4 py-2 text-sm font-semibold text-white">
                Continue to Dashboard
              </Link>
            ) : (
              <Link to="/auth" className="inline-flex rounded-[12px] border border-[#1f4f78] bg-[#1f4f78] px-4 py-2 text-sm font-semibold text-white">
                Continue to Sign In
              </Link>
            )}
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl p-6">
      <article className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3">
          <Clock3 size={18} className="text-[#1f4f78]" />
          <div>
            <h1 className="text-[1.25rem] font-semibold text-[#142132]">Agent Invitation</h1>
            <p className="text-sm text-[#60758d]">
              Confirm your profile details and accept the invitation to join {invite?.organisationName || 'this organisation'}.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[16px] border border-[#e0e8f2] bg-[#f8fbff] px-4 py-3 text-sm text-[#48627d]">
          Role: <span className="font-semibold text-[#19344f]">{roleLabel}</span>
        </div>

        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">First name</span>
              <Field value={form.firstName} onChange={(event) => setForm((previous) => ({ ...previous, firstName: event.target.value }))} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Surname</span>
              <Field value={form.surname} onChange={(event) => setForm((previous) => ({ ...previous, surname: event.target.value }))} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mobile</span>
              <Field value={form.mobile} onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value }))} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">PPRA / EAAB (optional)</span>
              <Field value={form.ppraNumber} onChange={(event) => setForm((previous) => ({ ...previous, ppraNumber: event.target.value }))} placeholder="PPRA number" />
            </label>
            <label className="grid gap-1.5 sm:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Profile photo URL (optional)</span>
              <Field value={form.photoUrl} onChange={(event) => setForm((previous) => ({ ...previous, photoUrl: event.target.value }))} placeholder="https://..." />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-[14px] border border-[#dde5f0] bg-[#fbfcfe] px-3 py-2.5 text-sm text-[#304960]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={form.acceptedTerms}
                onChange={(event) => setForm((previous) => ({ ...previous, acceptedTerms: event.target.checked }))}
            />
            <span>I accept this invitation and agree to be linked to the selected organisation workspace on Arch9.</span>
          </label>

          {inviteSource === 'supabase' && !sessionUserEmail ? (
            <p className="text-xs text-[#647a92]">
              Sign in with <strong>{form.email}</strong> to complete acceptance. Then return to this invite link.
            </p>
          ) : null}

          {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Activating…' : 'Activate Profile'}
            </Button>
          </div>
        </form>
      </article>
    </section>
  )
}
