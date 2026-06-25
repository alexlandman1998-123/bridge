import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import {
  acceptTransactionPartnerInvitation,
  declineTransactionPartnerInvitation,
  getTransactionPartnerInvitationByToken,
  getTransactionPartnerRoleLabel,
} from '../services/transactionPartnerInvitationService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const PROFESSIONAL_ROLE_OPTIONS = [
  { value: 'attorney', professionalRole: 'transfer_attorney', label: 'Transfer Attorney' },
  { value: 'attorney', professionalRole: 'bond_attorney', label: 'Bond Attorney' },
  { value: 'attorney', professionalRole: 'conveyancing_secretary', label: 'Conveyancing Secretary' },
  { value: 'bond_originator', professionalRole: 'bond_originator', label: 'Bond Originator' },
  { value: 'agent', professionalRole: 'estate_agent', label: 'Estate Agent' },
  { value: 'developer', professionalRole: 'developer', label: 'Developer' },
  { value: 'viewer', professionalRole: 'admin', label: 'Admin' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function defaultAppRoleForInvitation(roleType) {
  if (roleType === 'transfer_attorney') return 'attorney'
  if (roleType === 'bond_originator') return 'bond_originator'
  if (roleType === 'developer') return 'developer'
  return 'viewer'
}

function TransactionPartnerInvitePage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [sessionUser, setSessionUser] = useState(null)
  const [context, setContext] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const invitation = context?.invitation || null
  const defaultRole = defaultAppRoleForInvitation(invitation?.roleType)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    password: '',
    appRole: defaultRole,
    professionalRole: invitation?.roleType || '',
  })

  useEffect(() => {
    let active = true

    async function loadInvitation() {
      if (!isSupabaseConfigured) {
        setError('Supabase is not configured for invitations.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const [inviteResult, sessionResult] = await Promise.all([
          getTransactionPartnerInvitationByToken(token),
          supabase.auth.getSession(),
        ])
        if (!active) return

        if (!inviteResult?.ok) {
          setError(inviteResult?.reason === 'expired' ? 'This invitation has expired.' : 'This invitation is invalid or no longer available.')
          setContext(inviteResult || null)
          return
        }

        const invite = inviteResult.invitation
        const user = sessionResult?.data?.session?.user || null
        setContext(inviteResult)
        setSessionUser(user)
        setForm((previous) => ({
          ...previous,
          email: invite?.email || user?.email || previous.email,
          appRole: defaultAppRoleForInvitation(invite?.roleType),
          professionalRole: invite?.roleType || previous.professionalRole,
        }))
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load this invitation.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInvitation()

    return () => {
      active = false
    }
  }, [token])

  const roleLabel = useMemo(
    () => getTransactionPartnerRoleLabel(invitation?.roleType),
    [invitation?.roleType],
  )

  function updateForm(field, value) {
    setMessage('')
    setError('')
    if (field === 'professionalRole') {
      const option = PROFESSIONAL_ROLE_OPTIONS.find((item) => item.professionalRole === value)
      setForm((previous) => ({
        ...previous,
        professionalRole: value,
        appRole: option?.value || previous.appRole,
      }))
      return
    }
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  async function acceptWithCurrentSession(user = sessionUser) {
    const accepted = await acceptTransactionPartnerInvitation({
      token,
      profile: {
        firstName: form.firstName,
        lastName: form.lastName,
        mobileNumber: form.mobileNumber,
        role: form.appRole,
        professionalRole: form.professionalRole,
      },
    })
    setResult(accepted)
    setSessionUser(user)
    return accepted
  }

  async function handleAcceptInvitation(event) {
    event.preventDefault()
    if (!invitation) return

    try {
      setBusy(true)
      setError('')
      setMessage('')

      const existingSession = await supabase.auth.getSession()
      const user = existingSession?.data?.session?.user || null

      if (user) {
        await acceptWithCurrentSession(user)
        return
      }

      if (!normalizeText(form.firstName)) throw new Error('First name is required.')
      if (!normalizeText(form.lastName)) throw new Error('Last name is required.')
      if (!normalizeText(form.email)) throw new Error('Email address is required.')
      if (!normalizeText(form.mobileNumber)) throw new Error('Mobile number is required.')
      if (!normalizeText(form.password) || normalizeText(form.password).length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            first_name: form.firstName,
            last_name: form.lastName,
            full_name: `${form.firstName} ${form.lastName}`.trim(),
            phone: form.mobileNumber,
            app_role: form.appRole,
            professional_role: form.professionalRole,
            transaction_partner_invitation_token: token,
          },
        },
      })

      if (signUpError) throw signUpError

      if (data?.session?.user) {
        await acceptWithCurrentSession(data.session.user)
        return
      }

      setMessage('Account created. Confirm your email, then reopen this invitation link to complete access.')
    } catch (acceptError) {
      setError(acceptError.message || 'Unable to accept this invitation.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeclineInvitation() {
    try {
      setBusy(true)
      setError('')
      await declineTransactionPartnerInvitation(token)
      setMessage('Invitation declined. The transaction owner will be notified.')
    } catch (declineError) {
      setError(declineError.message || 'Unable to decline this invitation.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f8fb] px-4 py-10">
        <section className="mx-auto max-w-[760px] rounded-[24px] border border-[#dbe4ef] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-[#60758d]">Loading invitation...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-10">
      <section className="mx-auto max-w-[820px] overflow-hidden rounded-[28px] border border-[#dbe4ef] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.1)]">
        <div className="border-b border-[#e6edf5] bg-[#fbfdff] px-6 py-5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8395aa]">Arch9 Transaction Invitation</span>
          <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">
            You have been invited to participate in a property transaction.
          </h1>
        </div>

        {invitation ? (
          <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
            <aside className="border-b border-[#e6edf5] bg-[#f8fbff] p-6 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8395aa]">Role</span>
                  <strong className="mt-1 block text-lg text-[#142132]">{roleLabel}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8395aa]">Company</span>
                  <strong className="mt-1 block text-lg text-[#142132]">{invitation.companyName}</strong>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8395aa]">Invited By</span>
                  <strong className="mt-1 block text-lg text-[#142132]">{invitation.invitedByOrganisation}</strong>
                </div>
                <div className="rounded-[18px] border border-[#dbe4ef] bg-white p-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8395aa]">Transaction</span>
                  <strong className="mt-1 block text-base text-[#142132]">{invitation.transactionReference}</strong>
                  <p className="mt-2 text-sm leading-6 text-[#60758d]">{invitation.propertyLabel}</p>
                </div>
                <p className="flex items-start gap-2 text-sm leading-6 text-[#60758d]">
                  <ShieldCheck className="mt-0.5 shrink-0 text-[#247857]" size={18} />
                  Access is limited to this transaction only: documents, activity feed, parties, messages, and workflow stages.
                </p>
              </div>
            </aside>

            <div className="p-6">
              {result ? (
                <div className="space-y-4 rounded-[20px] border border-[#cfe8d7] bg-[#f3fbf5] p-5">
                  <div className="flex items-center gap-2 text-[#247857]">
                    <CheckCircle2 size={18} />
                    <strong>Account Created</strong>
                  </div>
                  <p className="text-sm leading-6 text-[#4c6b59]">
                    You now have access to {invitation.transactionReference} as {result.roleLabel || roleLabel}.
                  </p>
                  <Link
                    to={`/transactions/${result.transactionId}`}
                    className="inline-flex rounded-[12px] bg-[#142132] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Open Transaction
                  </Link>
                  <div className="rounded-[18px] border border-[#dbe4ef] bg-white p-4">
                    <h3 className="text-sm font-semibold text-[#142132]">Do you belong to an organization?</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">
                      You can create or join a firm now, or skip this and keep working from this transaction.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to="/organizations?intent=join"
                        className="inline-flex rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-semibold text-[#35546c]"
                      >
                        Join Existing
                      </Link>
                      <Link
                        to="/organizations?intent=create"
                        className="inline-flex rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-sm font-semibold text-[#35546c]"
                      >
                        Create Organization
                      </Link>
                      <Link
                        to={`/transactions/${result.transactionId}`}
                        className="inline-flex rounded-[12px] border border-transparent px-3 py-2 text-sm font-semibold text-[#60758d]"
                      >
                        Skip For Now
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleAcceptInvitation}>
                  <div>
                    <h2 className="text-lg font-semibold text-[#142132]">Create Account</h2>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">
                      This creates your Arch9 account and connects it to this transaction only.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-semibold text-[#233247]">
                      <span>First Name</span>
                      <input
                        className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8]"
                        value={form.firstName}
                        onChange={(event) => updateForm('firstName', event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-[#233247]">
                      <span>Last Name</span>
                      <input
                        className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8]"
                        value={form.lastName}
                        onChange={(event) => updateForm('lastName', event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-[#233247]">
                      <span>Email</span>
                      <input
                        className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8] disabled:bg-[#f1f5f9]"
                        type="email"
                        value={form.email}
                        disabled={Boolean(invitation.email)}
                        onChange={(event) => updateForm('email', event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-[#233247]">
                      <span>Mobile Number</span>
                      <input
                        className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8]"
                        type="tel"
                        value={form.mobileNumber}
                        onChange={(event) => updateForm('mobileNumber', event.target.value)}
                      />
                    </label>
                    {!sessionUser ? (
                      <label className="space-y-2 text-sm font-semibold text-[#233247] sm:col-span-2">
                        <span>Password</span>
                        <input
                          className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8]"
                          type="password"
                          value={form.password}
                          onChange={(event) => updateForm('password', event.target.value)}
                        />
                      </label>
                    ) : null}
                    <label className="space-y-2 text-sm font-semibold text-[#233247] sm:col-span-2">
                      <span>Professional Role</span>
                      <select
                        className="w-full rounded-[14px] border border-[#dbe4ef] px-4 py-3 text-sm outline-none focus:border-[#86a6d8]"
                        value={form.professionalRole}
                        onChange={(event) => updateForm('professionalRole', event.target.value)}
                      >
                        {PROFESSIONAL_ROLE_OPTIONS.map((option) => (
                          <option key={option.professionalRole} value={option.professionalRole}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
                  {message ? <p className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm text-[#35546c]">{message}</p> : null}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={busy}>
                      {busy ? 'Accepting...' : 'Accept Invitation'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleDeclineInvitation()} disabled={busy}>
                      Decline
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">
              {error || 'This invitation is unavailable.'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-[#e6edf5] px-6 py-4 text-xs text-[#60758d]">
          <Mail size={14} />
          Invitation links are one-time use and expire after 30 days.
        </div>
      </section>
    </main>
  )
}

export default TransactionPartnerInvitePage
