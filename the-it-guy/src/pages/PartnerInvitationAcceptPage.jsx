import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  Handshake,
  LockKeyhole,
  Mail,
  Network,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { clearPendingPartnerInvitePath, rememberPendingPartnerInvitePath } from '../lib/pendingPartnerInvite'
import {
  acceptPartnerInvitationByLink,
  previewPartnerInvitationAcceptance,
} from '../lib/partnersRepository'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function titleize(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildReturnPath(location) {
  const path = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`
  return path || '/partners'
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function getScopeLabel(invitation = {}) {
  const scopeType = titleize(invitation?.scopeType || 'organisation')
  return invitation?.scopeName ? `${scopeType}: ${invitation.scopeName}` : scopeType
}

function StatusPanel({ tone = 'info', icon: Icon = ShieldCheck, title, children }) {
  const tones = {
    success: {
      shell: 'border-[#b9dfc8] bg-[#f2fbf5] text-[#174d2b]',
      icon: 'border-[#ccebd6] bg-white text-[#16894f]',
    },
    warning: {
      shell: 'border-[#efd6a4] bg-[#fff8eb] text-[#744b0b]',
      icon: 'border-[#f2d9a8] bg-white text-[#a46405]',
    },
    danger: {
      shell: 'border-[#efc5c2] bg-[#fff6f4] text-[#7f271f]',
      icon: 'border-[#f2cbc7] bg-white text-[#b42318]',
    },
    info: {
      shell: 'border-[#d9e5ef] bg-[#f8fbfd] text-[#31445b]',
      icon: 'border-[#dce8f1] bg-white text-[#35546c]',
    },
  }
  const toneClass = tones[tone] || tones.info
  return (
    <div className={`rounded-[8px] border p-4 ${toneClass.shell}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border ${toneClass.icon}`}>
          {createElement(Icon, { size: 18 })}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1 text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, icon: Icon = BadgeCheck }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3.5">
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#dfe8ee] bg-[#fbfcf8] text-[#5f735f]">
        {createElement(Icon, { size: 16 })}
      </span>
      <div className="min-w-0">
        <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a897e]">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold leading-5 text-[#172033]">{value || 'Not recorded'}</dd>
      </div>
    </div>
  )
}

function TrustItem({ icon: Icon, title, children }) {
  return (
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d8dfd4] bg-[#fffdf8] text-[#1d3d33]">
        {createElement(Icon, { size: 17 })}
      </span>
      <div>
        <p className="text-sm font-semibold text-[#182235]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[#5e6d78]">{children}</p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-[8px] bg-[#eef3ee]" />
      ))}
    </div>
  )
}

export default function PartnerInvitationAcceptPage() {
  const { invitationId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const workspaceContext = useWorkspace()
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [preview, setPreview] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const autoAcceptAttemptedRef = useRef(false)
  const returnPath = useMemo(() => buildReturnPath(location), [location])
  const autoAccept = useMemo(() => new URLSearchParams(location.search).get('accept') === '1', [location.search])
  const authPath = `/auth?next=${encodeURIComponent(returnPath)}`
  const signupPath = `/auth?mode=signup&next=${encodeURIComponent(returnPath)}`
  const session = authState.session
  const workspaceId = normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
  const workspaceName = normalizeText(workspaceContext.currentWorkspace?.name || workspaceContext.workspace?.name)
  const authLoading = authState.status === 'loading' || workspaceContext.profileLoading
  const fromOrganisationName = normalizeText(preview?.fromOrganisationName)
  const invitedWorkspaceName = workspaceName || normalizeText(preview?.toOrganisationName)
  const partnerTypeLabel = titleize(preview?.partnerType || 'partner')
  const relationshipLabel = titleize(preview?.relationshipType || 'approved')
  const panelTitle = accepted
    ? 'Partner connection confirmed'
    : !session
      ? 'Sign in to review the invitation'
      : preview
        ? `${fromOrganisationName || 'A partner'} wants to connect`
        : 'Review your partner invitation'
  const panelCopy = accepted
    ? 'This partner relationship is now active inside Arch9.'
    : !session
      ? 'This secure invitation needs to be accepted by a user from the invited workspace.'
      : 'Accepting creates the workspace connection used for referrals, routing, and transaction coordination.'

  useEffect(() => {
    rememberPendingPartnerInvitePath(returnPath)
  }, [returnPath])

  useEffect(() => {
    if (accepted) {
      clearPendingPartnerInvitePath(returnPath)
    }
  }, [accepted, returnPath])

  useEffect(() => {
    let active = true
    if (!session || !workspaceId || !invitationId) {
      setPreview(null)
      return () => {
        active = false
      }
    }

    async function loadPreview() {
      try {
        setLoadingPreview(true)
        setError('')
        const result = await previewPartnerInvitationAcceptance({
          invitationId,
          organisationId: workspaceId,
        })
        if (!active) return
        setPreview(result?.invitation || null)
        setAccepted(Boolean(result?.alreadyAccepted))
      } catch (previewError) {
        if (active) {
          setPreview(null)
          setError(previewError?.message || 'Unable to load this partner invitation.')
        }
      } finally {
        if (active) setLoadingPreview(false)
      }
    }

    void loadPreview()

    return () => {
      active = false
    }
  }, [invitationId, session, workspaceId])

  const handleAccept = useCallback(async function handleAccept() {
    try {
      setAccepting(true)
      setError('')
      const result = await acceptPartnerInvitationByLink({
        invitationId,
        organisationId: workspaceId,
      })
      setPreview(result?.invitation || preview)
      setAccepted(true)
      clearPendingPartnerInvitePath(returnPath)
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this partner invitation.')
    } finally {
      setAccepting(false)
    }
  }, [invitationId, preview, returnPath, workspaceId])

  useEffect(() => {
    if (
      !autoAccept ||
      autoAcceptAttemptedRef.current ||
      accepting ||
      loadingPreview ||
      error ||
      !session ||
      !workspaceId ||
      !preview
    ) {
      return
    }

    autoAcceptAttemptedRef.current = true
    void handleAccept()
  }, [accepting, autoAccept, error, handleAccept, loadingPreview, preview, session, workspaceId])

  function openPartners() {
    navigate('/partners?tab=invitations', { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#f4f6f1] text-[#172033]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#111827]">Arch9</p>
            <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#778276]">Partner Invitation</p>
          </div>
          <div className="hidden items-center gap-2 rounded-[8px] border border-[#d8dfd4] bg-[#fffdf8] px-3 py-2 text-xs font-semibold text-[#44544c] shadow-[0_12px_30px_rgba(23,32,51,0.06)] sm:flex">
            <LockKeyhole size={14} />
            Workspace-secured
          </div>
        </header>

        <div className="grid flex-1 items-center gap-7 py-7 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
          <aside className="order-2 lg:order-1">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-[8px] border border-[#d6ded2] bg-[#fffdf8] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#536156]">
                <Network size={14} />
                Private property network
              </div>
              <h1 className="mt-6 max-w-lg font-display text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-[#121927] sm:text-5xl">
                The partner layer for serious property work.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#5e6d78]">
                Arch9 brings agencies, developers, finance teams, and legal partners into one controlled operating network, so referrals and transactions move with context instead of scattered follow-ups.
              </p>

              <div className="mt-7 grid gap-4">
                <TrustItem icon={ShieldCheck} title="Workspace controlled">
                  This invitation is accepted from the active workspace that owns the relationship.
                </TrustItem>
                <TrustItem icon={Handshake} title="Built for collaboration">
                  Partner routing, preferred relationships, and shared transaction context can live in one place.
                </TrustItem>
                <TrustItem icon={UsersRound} title="Clear handover">
                  Accepting confirms the connection and keeps the next steps visible inside Partners.
                </TrustItem>
              </div>
            </div>
          </aside>

          <section className="order-1 overflow-hidden rounded-[8px] border border-[#d8dfd4] bg-[#fffdf8] shadow-[0_28px_80px_rgba(23,32,51,0.12)] lg:order-2">
            <div className="border-b border-white/10 bg-[#121927] px-5 py-6 text-white sm:px-7 sm:py-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#d7f8e6]/20 bg-white/8 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#ccebdc]">
                  <ShieldCheck size={14} />
                  Secure partner connection
                </span>
                {accepted ? (
                  <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#d7f8e6]/20 bg-[#d7f8e6]/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#dff7e9]">
                    <CheckCircle2 size={14} />
                    Accepted
                  </span>
                ) : null}
              </div>
              <h2 className="mt-5 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-[2.35rem]">
                {panelTitle}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d7e1ec]">
                {panelCopy}
              </p>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {!invitationId ? (
                <StatusPanel tone="danger" icon={AlertCircle} title="Invitation unavailable">
                  This partner invitation link is missing its invitation id. Ask the sender to resend it from Arch9.
                </StatusPanel>
              ) : authLoading ? (
                <StatusPanel icon={ShieldCheck} title="Checking your session">
                  Preparing your secure invitation view.
                </StatusPanel>
              ) : !session ? (
                <>
                  <StatusPanel icon={Mail} title="Sign in to continue">
                    Sign in with the account that belongs to the invited workspace. Arch9 will bring you back to this invitation afterwards.
                  </StatusPanel>
                  <div className="rounded-[8px] border border-[#e0e7dc] bg-[#fbfcf8] px-4 py-3 text-sm leading-6 text-[#53616f]">
                    You will be able to review the sender, relationship type, scope, and invited workspace before accepting.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild size="lg" className="min-w-[140px] rounded-[8px]">
                      <Link to={authPath}>
                        Sign in
                        <ArrowRight size={17} />
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="lg" className="rounded-[8px]">
                      <Link to={signupPath}>Create account</Link>
                    </Button>
                  </div>
                </>
              ) : !workspaceId ? (
                <>
                  <StatusPanel tone="warning" icon={Building2} title="Workspace required">
                    Your account is signed in, but there is no active workspace available for this partner connection.
                  </StatusPanel>
                  <Button asChild variant="secondary" size="lg" className="rounded-[8px]">
                    <Link to="/onboarding/profile">Open workspace setup</Link>
                  </Button>
                </>
              ) : loadingPreview ? (
                <>
                  <StatusPanel icon={ShieldCheck} title="Loading invitation">
                    Checking this invitation against {workspaceName || 'your active workspace'}.
                  </StatusPanel>
                  <LoadingSkeleton />
                </>
              ) : error ? (
                <>
                  <StatusPanel tone="danger" icon={AlertCircle} title="Invitation cannot be opened">
                    {error}
                  </StatusPanel>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="secondary" size="lg" className="rounded-[8px]">
                      <Link to="/partners?tab=invitations">Open Partners</Link>
                    </Button>
                    <Button asChild variant="ghost" size="lg" className="rounded-[8px]">
                      <Link to={authPath}>Use another account</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {accepted ? (
                    <StatusPanel tone="success" icon={CheckCircle2} title="Connection confirmed">
                      This partner relationship is active for {invitedWorkspaceName || 'your workspace'}.
                    </StatusPanel>
                  ) : (
                    <StatusPanel icon={Building2} title="Ready to accept">
                      You are accepting this invite for {invitedWorkspaceName || 'your active workspace'}.
                    </StatusPanel>
                  )}

                  <div className="rounded-[8px] border border-[#dfe8ee] bg-white px-4 py-1 shadow-[0_10px_26px_rgba(23,32,51,0.04)]">
                    <dl className="divide-y divide-[#e8eee6]">
                      <DetailRow label="Invited by" value={fromOrganisationName} icon={Building2} />
                      <DetailRow label="Your workspace" value={invitedWorkspaceName} icon={UsersRound} />
                      <DetailRow label="Partner type" value={partnerTypeLabel} icon={Handshake} />
                      <DetailRow label="Relationship" value={preview?.preferred ? `${relationshipLabel} preferred partner` : relationshipLabel} icon={BadgeCheck} />
                      <DetailRow label="Scope" value={getScopeLabel(preview)} icon={Network} />
                      <DetailRow label="Invite expires" value={formatDate(preview?.expiresAt)} icon={CalendarClock} />
                    </dl>
                  </div>

                  <div className="rounded-[8px] border border-[#e0e7dc] bg-[#fbfcf8] px-4 py-3 text-sm leading-6 text-[#53616f]">
                    Accepting links the two workspaces for partner coordination. You can manage the connection later from Partners.
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {accepted ? (
                      <Button onClick={openPartners} size="lg" className="rounded-[8px]">
                        Open Partners
                        <ArrowRight size={17} />
                      </Button>
                    ) : (
                      <Button onClick={handleAccept} disabled={accepting} size="lg" className="rounded-[8px]">
                        {accepting ? 'Accepting...' : 'Accept invitation'}
                        <CheckCircle2 size={17} />
                      </Button>
                    )}
                    <Button asChild variant="secondary" size="lg" className="rounded-[8px]">
                      <Link to="/partners?tab=invitations">Review in Partners</Link>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
