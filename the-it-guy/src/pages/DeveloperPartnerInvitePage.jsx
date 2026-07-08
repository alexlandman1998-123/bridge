import { AlertTriangle, ArrowRight, Building2, CheckCircle2, FileText, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  acceptDeveloperPartnerInvitationByToken,
  fetchDeveloperPartnerInvitation,
} from '../lib/api'
import { clearPendingPartnerInvitePath, rememberPendingPartnerInvitePath } from '../lib/pendingPartnerInvite'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildReturnPath(location) {
  const path = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`
  return path || '/dashboard'
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getAgreementLabel(partnerType = '') {
  if (partnerType === 'transfer_attorney') return 'Transfer Attorney SLA'
  if (partnerType === 'bond_originator') return 'Bond Originator SLA'
  return 'Agency Mandate'
}

function getScopeLabel(context = {}) {
  const scopeType = context.relationship?.scopeType
  const scopeJson = context.relationship?.scopeJson || {}
  if (scopeType === 'specific_developments') {
    const count = Array.isArray(scopeJson.developmentIds) ? scopeJson.developmentIds.length : 0
    return count ? `${count} specific developments` : 'Specific developments'
  }
  if (scopeType === 'specific_phases') return 'Specific phases'
  if (scopeType === 'specific_units') return 'Specific units'
  return 'All developments'
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-[8px] border border-[#e2eaf4] bg-[#fbfdff] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#71869d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#142132]">{value || 'Not recorded'}</p>
    </div>
  )
}

export default function DeveloperPartnerInvitePage() {
  const { token } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const workspaceContext = useWorkspace()
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ partnerDisplayName: '', partnerEmail: '' })
  const autoAcceptAttemptedRef = useRef(false)
  const returnPath = useMemo(() => buildReturnPath(location), [location])
  const autoAccept = useMemo(() => new URLSearchParams(location.search).get('accept') === '1', [location.search])
  const authPath = `/auth?next=${encodeURIComponent(returnPath)}`
  const signupPath = `/auth?mode=signup&next=${encodeURIComponent(returnPath)}`
  const session = authState.session
  const authLoading = authState.status === 'loading' || workspaceContext.profileLoading
  const workspaceId = normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
  const workspaceName = normalizeText(workspaceContext.currentWorkspace?.name || workspaceContext.workspace?.name)

  useEffect(() => {
    rememberPendingPartnerInvitePath(returnPath)
  }, [returnPath])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchDeveloperPartnerInvitation(token)
      .then((nextContext) => {
        if (!active) return
        setContext(nextContext)
        setForm({
          partnerDisplayName: nextContext.relationship.partnerDisplayName || nextContext.partner?.name || '',
          partnerEmail: nextContext.relationship.partnerInvitationEmail || '',
        })
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError?.message || 'Unable to load this partner invite.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const partnerTypeLabel = context?.relationship?.partnerTypeLabel || 'Partner'
  const agreementLabel = useMemo(() => getAgreementLabel(context?.relationship?.partnerType), [context?.relationship?.partnerType])

  async function acceptCurrentInvite() {
    setAccepting(true)
    setError('')
    try {
      const result = await acceptDeveloperPartnerInvitationByToken(token, {
        ...form,
        partnerOrganisationId: workspaceId,
      })
      setAccepted(true)
      clearPendingPartnerInvitePath(returnPath)
      if (result?.redirectTo) {
        navigate(result.redirectTo, { replace: true })
      }
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this partner invite.')
    } finally {
      setAccepting(false)
    }
  }

  async function handleAccept() {
    if (!session) {
      navigate(authPath, { replace: false })
      return
    }
    if (!workspaceId) {
      setError('Complete workspace setup before accepting this partner invite.')
      return
    }

    await acceptCurrentInvite()
  }

  useEffect(() => {
    if (
      !autoAccept ||
      autoAcceptAttemptedRef.current ||
      loading ||
      authLoading ||
      accepted ||
      accepting ||
      error ||
      !session ||
      !workspaceId ||
      !context ||
      !normalizeText(form.partnerDisplayName)
    ) {
      return
    }

    autoAcceptAttemptedRef.current = true
    void acceptCurrentInvite()
  }, [accepted, accepting, authLoading, autoAccept, context, error, form.partnerDisplayName, loading, session, workspaceId])

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-[#0f2742]">Arch9</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#71869d]">Developer Partner Invite</p>
        </div>

        <section className="overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-white shadow-[0_20px_60px_rgba(15,47,79,0.10)]">
          <div className="border-b border-[#e5edf6] bg-[#0f2742] px-6 py-7 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bfe2ff]">Partner relationship</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              {loading ? 'Loading invite' : accepted ? 'Invite accepted' : `${context?.developer?.name || 'Developer'} invited you`}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#dbeafe]">
              Accepting confirms the relationship. The developer can then generate the related mandate or SLA in Arch9.
            </p>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-[8px] bg-[#eef3f8]" />)}
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 rounded-[8px] border border-[#f8d7da] bg-[#fff5f6] px-4 py-3 text-sm text-[#8d2831]">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : accepted ? (
              <div className="rounded-[8px] border border-[#cfeedd] bg-[#f1fbf6] p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#0f8f4c]" />
                  <div>
                    <h2 className="text-lg font-semibold text-[#10243a]">Relationship accepted</h2>
                    <p className="mt-2 text-sm leading-6 text-[#52677f]">
                      The developer workspace has been updated. The next step is agreement generation and activation.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard', { replace: true })}
                      className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
                    >
                      Open dashboard
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Developer" value={context?.developer?.name} />
                  <InfoRow label="Partner role" value={partnerTypeLabel} />
                  <InfoRow label="Scope" value={getScopeLabel(context)} />
                  <InfoRow label="Invite expires" value={formatDate(context?.relationship?.expiresAt)} />
                </div>

                {authLoading ? (
                  <div className="flex items-start gap-3 rounded-[8px] border border-[#d8e5f0] bg-[#f8fbfe] px-4 py-3 text-sm text-[#334e68]">
                    <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                    <span>Checking your secure workspace.</span>
                  </div>
                ) : !session ? (
                  <div className="rounded-[8px] border border-[#d8e5f0] bg-[#f8fbfe] p-4">
                    <div className="flex items-start gap-3 text-sm leading-6 text-[#334e68]">
                      <Mail size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-[#10243a]">Sign in to connect your workspace</p>
                        <p className="mt-1">Arch9 will bring you back here after authentication so the invite can attach to your organisation.</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link to={authPath} className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]">
                        Sign in
                        <ArrowRight size={16} />
                      </Link>
                      <Link to={signupPath} className="inline-flex h-11 items-center justify-center rounded-[8px] border border-[#d8e2ef] bg-white px-4 text-sm font-semibold text-[#10243a] transition hover:bg-[#f8fbfe]">
                        Create account
                      </Link>
                    </div>
                  </div>
                ) : !workspaceId ? (
                  <div className="rounded-[8px] border border-[#f5d08a] bg-[#fff8eb] p-4">
                    <div className="flex items-start gap-3 text-sm leading-6 text-[#7a4b00]">
                      <Building2 size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-[#513200]">Workspace setup required</p>
                        <p className="mt-1">Finish your organisation setup first. We will keep this invite ready so it can connect to the new workspace.</p>
                      </div>
                    </div>
                    <Link to="/onboarding/profile" className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]">
                      Complete workspace setup
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-[8px] border border-[#cfeedd] bg-[#f1fbf6] px-4 py-3 text-sm text-[#14532d]">
                    <Building2 size={18} className="mt-0.5 shrink-0" />
                    <span>You are accepting this invite for {workspaceName || 'your active workspace'}.</span>
                  </div>
                )}

                <div className="rounded-[8px] border border-[#e2eaf4] bg-[#fbfdff] p-4">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="mt-0.5 shrink-0 text-[#0f8f4c]" />
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">{agreementLabel}</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">
                        The developer can generate this agreement after you accept the relationship.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Organisation name</span>
                    <input
                      value={form.partnerDisplayName}
                      onChange={(event) => setForm((current) => ({ ...current, partnerDisplayName: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="Your organisation"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-[#10243a]">Contact email</span>
                    <input
                      type="email"
                      value={form.partnerEmail}
                      onChange={(event) => setForm((current) => ({ ...current, partnerEmail: event.target.value }))}
                      className="mt-1 h-11 w-full rounded-[8px] border border-[#d8e2ef] bg-white px-3 text-sm text-[#10243a] outline-none transition focus:border-[#0f8f4c] focus:ring-4 focus:ring-[#0f8f4c]/10"
                      placeholder="partner@example.com"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#0f2742] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  onClick={handleAccept}
                  disabled={accepting || authLoading || !session || !workspaceId || !normalizeText(form.partnerDisplayName)}
                >
                  <ShieldCheck size={17} />
                  {accepting ? 'Accepting...' : 'Accept Invite'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
