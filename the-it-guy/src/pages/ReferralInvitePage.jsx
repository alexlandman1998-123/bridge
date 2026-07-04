import { ArrowRight, BadgeCheck, Building2, FileText, Mail, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getLeadReferralInviteByToken,
  respondToLeadReferralInvite,
} from '../services/leadReferralService'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatStatus(value = '') {
  const normalized = normalizeText(value).replace(/[_-]+/g, ' ')
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Pending'
}

function formatSplit(value) {
  if (value === null || value === undefined || value === '') return 'To be confirmed'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric}%` : 'To be confirmed'
}

function getUnavailableCopy(code = '') {
  if (code === 'expired') return 'This referral invite has expired. Ask the referring agent to issue a fresh link.'
  if (code === 'accepted' || code === 'already_accepted') return 'This referral invite has already been accepted.'
  if (code === 'declined') return 'This referral invite has already been declined.'
  if (code === 'revoked') return 'This referral invite was revoked.'
  return 'We could not validate this referral invite. Ask the sender to resend the referral.'
}

function DetailTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value || 'Not captured'}</p>
        </div>
      </div>
    </div>
  )
}

export default function ReferralInvitePage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [context, setContext] = useState(null)
  const [actorName, setActorName] = useState('')
  const [actorEmail, setActorEmail] = useState('')
  const [responseStatus, setResponseStatus] = useState('')

  const invite = context?.invite || null
  const referral = context?.referral || null
  const client = context?.client || referral?.client || null
  const agreement = context?.agreement || referral?.latestAgreement || null
  const unavailable = !loading && (!context?.ok || ['expired', 'declined', 'revoked'].includes(normalizeText(invite?.status).toLowerCase()))
  const alreadyAccepted = normalizeText(invite?.status).toLowerCase() === 'accepted' || normalizeText(referral?.status).toLowerCase() === 'accepted'
  const canRespond = context?.ok && !unavailable && !alreadyAccepted && !responseStatus

  const agreementText = useMemo(() => normalizeText(agreement?.agreementText || referral?.agreementText), [agreement?.agreementText, referral?.agreementText])
  const recipientEmail = normalizeText(invite?.email || referral?.targetAgentEmail)

  useEffect(() => {
    let cancelled = false
    async function loadInvite() {
      try {
        setLoading(true)
        setError('')
        const result = await getLeadReferralInviteByToken(token)
        if (cancelled) return
        setContext(result)
        const email = normalizeText(result?.invite?.email || result?.referral?.targetAgentEmail)
        const name = normalizeText(result?.referral?.targetAgentName)
        if (email) setActorEmail(email)
        if (name) setActorName(name)
        if (!result?.ok) setError(getUnavailableCopy(result?.code))
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || 'Unable to load this referral invite.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadInvite()
    return () => {
      cancelled = true
    }
  }, [token])

  async function submitResponse(action = '') {
    try {
      setSubmitting(true)
      setError('')
      const result = await respondToLeadReferralInvite(token, action, { actorName, actorEmail })
      setContext(result)
      if (!result?.ok) {
        setError(getUnavailableCopy(result?.code))
        return
      }
      setResponseStatus(result.responseStatus || (action === 'accept' ? 'accepted' : 'declined'))
    } catch (responseError) {
      setError(responseError?.message || 'Unable to respond to this referral invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="bg-slate-950 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Arch9 Referral</p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Referral invite</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Review the referred client, commission split, and referral agreement before accepting.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                {loading ? 'Loading' : formatStatus(responseStatus || referral?.status || invite?.status)}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 p-6 sm:p-8">
              {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : unavailable ? (
            <div className="p-6 sm:p-8">
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-rose-800">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <h2 className="text-sm font-semibold">Invite unavailable</h2>
                    <p className="mt-2 text-sm leading-6">{error || getUnavailableCopy(context?.code || invite?.status)}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 p-6 sm:p-8">
              {(alreadyAccepted || responseStatus) ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-800">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <h2 className="text-sm font-semibold">{formatStatus(responseStatus || referral?.status)} recorded</h2>
                      <p className="mt-2 text-sm leading-6">
                        {normalizeText(responseStatus || referral?.status) === 'declined'
                          ? 'The sender will see that this referral was declined.'
                          : 'The sender will see that this referral was accepted.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {error && !responseStatus ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailTile icon={UserRound} label="Client" value={client?.clientName || referral?.clientName} />
                <DetailTile icon={Building2} label="Lead Type" value={referral?.sourceLeadType === 'seller' ? 'Seller lead' : 'Buyer lead'} />
                <DetailTile icon={Mail} label="Referred By" value={referral?.sourceAgentName || referral?.sourceAgentEmail} />
                <DetailTile icon={ShieldCheck} label="Split" value={formatSplit(agreement?.commissionSplitPercentage ?? referral?.commissionSplitPercentage)} />
              </div>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-blue-700" />
                    <h2 className="text-sm font-semibold text-slate-950">Agreement</h2>
                  </div>
                  <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    {agreementText || 'No agreement text captured.'}
                  </pre>
                </div>

                <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="text-sm font-semibold text-slate-950">Your response</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Accepting confirms the referral and records the commission split agreement.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Name</span>
                      <input
                        value={actorName}
                        onChange={(event) => setActorName(event.target.value)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-300"
                        placeholder="Your name"
                        disabled={!canRespond}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Email</span>
                      <input
                        type="email"
                        value={actorEmail}
                        onChange={(event) => setActorEmail(event.target.value)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-300"
                        placeholder={recipientEmail || 'you@example.com'}
                        disabled={!canRespond}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => submitResponse('accept')}
                      disabled={!canRespond || submitting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {submitting ? 'Saving...' : 'Accept referral'}
                      <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => submitResponse('decline')}
                      disabled={!canRespond || submitting}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </aside>
              </section>
            </div>
          )}
        </section>

        <div className="flex justify-center">
          <Link to="/auth" className="text-sm font-semibold text-slate-500 hover:text-slate-900">
            Sign in or create an Arch9 account
          </Link>
        </div>
      </div>
    </main>
  )
}
