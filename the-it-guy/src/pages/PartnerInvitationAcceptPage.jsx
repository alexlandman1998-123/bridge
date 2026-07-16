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
  requestPartnerInvitationTraining,
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

function getWorkspaceHomePath(workspaceContext = {}) {
  const role = normalizeText(workspaceContext.role || workspaceContext.currentWorkspace?.role || workspaceContext.workspace?.role).toLowerCase()
  const workspaceType = normalizeText(
    workspaceContext.currentWorkspace?.type ||
      workspaceContext.currentWorkspace?.workspaceType ||
      workspaceContext.workspace?.type ||
      workspaceContext.workspace?.workspaceType,
  ).toLowerCase()

  if (role === 'attorney' || workspaceType === 'attorney_firm') return '/attorney/dashboard'
  if (role === 'commercial' || workspaceType === 'commercial') return '/commercial'
  if (role === 'bond_originator' || workspaceType === 'bond_originator') return '/bond/dashboard'
  if (role === 'client') return '/client'
  return '/dashboard'
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
    <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-4">
      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#dfe8e0] bg-[#fbfcf7] text-[#1f6a57]">
        {createElement(Icon, { size: 16 })}
      </span>
      <div className="min-w-0">
        <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#77857c]">{label}</dt>
        <dd className="mt-1 break-words text-sm font-semibold leading-5 text-[#172033]">{value || 'Not recorded'}</dd>
      </div>
    </div>
  )
}

function ExplanationRow({ icon: Icon, title, children }) {
  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-4 rounded-[16px] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#b7d7ca]/25 bg-[#d8f3e8]/10 text-[#8fd7be]">
        {createElement(Icon, { size: 18 })}
      </span>
      <div>
        <p className="text-[0.98rem] font-semibold text-[#f8fbf7]">{title}</p>
        <p className="mt-1.5 text-[0.95rem] leading-6 text-[#c8d5ce]">{children}</p>
      </div>
    </div>
  )
}

function ConnectorLabel({ children }) {
  return (
    <div className="grid justify-items-center gap-2 py-1 text-center">
      <span className="h-7 w-px bg-gradient-to-b from-[#d6e8df] to-[#1f7a66]" />
      <span className="rounded-full border border-[#d8e5dc] bg-[#fbfaf4] px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#577064]">
        {children}
      </span>
      <span className="h-7 w-px bg-gradient-to-b from-[#1f7a66] to-[#d6e8df]" />
    </div>
  )
}

function RelationshipDiagram({ fromOrganisationName = '', invitedWorkspaceName = '' }) {
  const sourceName = fromOrganisationName || 'Invitation details pending'
  const destinationName = invitedWorkspaceName || 'Your Business'
  const checklist = ['Future referrals', 'Shared transactions', 'Secure messaging', 'Document sharing']

  return (
    <div className="rounded-[26px] border border-[#d8e1d8] bg-[#fffdf8]/95 p-4 shadow-[0_26px_70px_rgba(20,35,31,0.12)] sm:p-5">
      <div className="rounded-[20px] border border-[#dce6dc] bg-white p-4 shadow-[0_12px_28px_rgba(23,32,51,0.06)]">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7a897f]">Inviting Organisation</p>
        <p className="mt-2 text-base font-semibold text-[#14221d]">{sourceName}</p>
      </div>

      <ConnectorLabel>Invites</ConnectorLabel>

      <div className="rounded-[20px] border border-[#b9d7ca] bg-[#f2fbf6] p-4 shadow-[0_12px_28px_rgba(31,122,102,0.1)]">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#1f6a57]">Your Business</p>
        <p className="mt-2 text-base font-semibold text-[#14221d]">{destinationName}</p>
      </div>

      <ConnectorLabel>Once Accepted</ConnectorLabel>

      <div className="rounded-[20px] border border-[#dce6dc] bg-white p-4">
        <div className="grid gap-2">
          {checklist.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm font-medium text-[#34443d]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e3f5ed] text-[#1f7a66]">
                <CheckCircle2 size={13} />
              </span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReviewItem({ title, children }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#cfe4da] bg-[#f0fbf6] text-[#1f7a66]">
        <CheckCircle2 size={15} />
      </span>
      <div>
        <p className="text-sm font-semibold text-[#172033]">{title}</p>
        <p className="mt-1 text-sm leading-5 text-[#65746c]">{children}</p>
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
  const [trainingRequesting, setTrainingRequesting] = useState(false)
  const [trainingMessage, setTrainingMessage] = useState('')
  const [trainingError, setTrainingError] = useState('')
  const autoAcceptAttemptedRef = useRef(false)
  const returnPath = useMemo(() => buildReturnPath(location), [location])
  const autoAccept = useMemo(() => new URLSearchParams(location.search).get('accept') === '1', [location.search])
  const autoAcceptRedirectPath = useMemo(() => getWorkspaceHomePath(workspaceContext), [workspaceContext])
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
  const canAcceptInvitation = Boolean(preview)
  const currentUserEmail = normalizeText(authState.user?.email || session?.user?.email)
  const profile = workspaceContext.profile || {}
  const currentUserName = normalizeText(
    profile.fullName ||
      profile.full_name ||
      [profile.firstName || profile.first_name, profile.lastName || profile.last_name].filter(Boolean).join(' ') ||
      currentUserEmail,
  )
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

  const handleAccept = useCallback(async function handleAccept({ redirectOnSuccess = false } = {}) {
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
      if (redirectOnSuccess) {
        navigate(autoAcceptRedirectPath, { replace: true })
      }
    } catch (acceptError) {
      if (acceptError?.details?.invitation || acceptError?.invitation) {
        setPreview(acceptError.details?.invitation || acceptError.invitation)
      }
      setError(acceptError?.message || 'Unable to accept this partner invitation.')
    } finally {
      setAccepting(false)
    }
  }, [autoAcceptRedirectPath, invitationId, navigate, preview, returnPath, workspaceId])

  const handleRequestTraining = useCallback(async function handleRequestTraining() {
    if (!preview) {
      setTrainingError('Load the invitation before requesting training.')
      return
    }

    try {
      setTrainingRequesting(true)
      setTrainingError('')
      setTrainingMessage('')
      await requestPartnerInvitationTraining({
        invitationId,
        invitation: {
          ...preview,
          toOrganisationName: invitedWorkspaceName || preview.toOrganisationName,
          scopeLabel: getScopeLabel(preview),
        },
        contactName: currentUserName,
        contactEmail: currentUserEmail,
        companyName: invitedWorkspaceName,
      })
      setTrainingMessage('Training request sent. The Arch9 team will reach out.')
    } catch (trainingErrorValue) {
      setTrainingError(trainingErrorValue?.message || 'Unable to send the training request.')
    } finally {
      setTrainingRequesting(false)
    }
  }, [currentUserEmail, currentUserName, invitationId, invitedWorkspaceName, preview])

  useEffect(() => {
    if (
      !autoAccept ||
      autoAcceptAttemptedRef.current ||
      accepting ||
      loadingPreview ||
      error ||
      !session ||
      !workspaceId ||
      !preview ||
      !canAcceptInvitation
    ) {
      return
    }

    autoAcceptAttemptedRef.current = true
    void handleAccept({ redirectOnSuccess: true })
  }, [accepting, autoAccept, canAcceptInvitation, error, handleAccept, loadingPreview, preview, session, workspaceId])

  function openPartners() {
    navigate('/partners?tab=invitations', { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#172033]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-[#101814]">Arch9</p>
            <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#68776f]">PRIVATE PROPERTY NETWORK</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d6ded2] bg-[#fffdf8] px-3.5 py-2 text-xs font-semibold text-[#3c4f46] shadow-[0_12px_30px_rgba(23,32,51,0.06)]">
            <LockKeyhole size={14} />
            Workspace-secured
          </div>
        </header>

        <div className="grid flex-1 items-center gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.76fr)] lg:gap-8">
          <div className="order-2 grid min-w-0 gap-5 lg:order-1 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-center">
            <aside className="order-2 flex min-h-[620px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#071611] p-6 text-white shadow-[0_34px_90px_rgba(10,24,20,0.28)] sm:p-8 lg:order-1">
              <div>
                <span className="inline-flex rounded-full border border-[#8fd7be]/25 bg-[#d8f3e8]/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#9ee1ca]">
                  YOU&apos;VE BEEN INVITED
                </span>
                <h1 className="mt-7 max-w-xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-[#f9fbf7] sm:text-5xl">
                  One invitation.
                  <br />
                  Every future transaction.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-[#d6e0da]">
                  Someone has emailed you about connecting your business to their trusted Arch9 network.
                </p>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#bac9c2]">
                  Sign in as your company contact, accept the connection for your workspace, and bring the rest of your team in when you&apos;re ready.
                </p>
              </div>

              <div className="mt-8 grid gap-3">
                <ExplanationRow icon={Handshake} title="Trusted connection">
                  Accept once. Work together across every future transaction without spreadsheets, WhatsApp groups, or endless emails.
                </ExplanationRow>
                <ExplanationRow icon={Network} title="Shared context">
                  Everyone sees what they need. Documents, milestones, and communication stay attached to the transaction.
                </ExplanationRow>
                <ExplanationRow icon={BadgeCheck} title="Built for professionals">
                  Designed specifically for South African property professionals &mdash; not generic project management software.
                </ExplanationRow>
              </div>

              <div className="mt-auto pt-8">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-4">
                  <p className="text-sm font-semibold text-[#f5faf7]">Trusted by professionals across South Africa.</p>
                  <p className="mt-2 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#9fb1a8]">
                    Agencies | Attorneys | Bond Originators | Developers
                  </p>
                </div>
              </div>
            </aside>

            <div className="order-1 lg:order-2">
              <RelationshipDiagram fromOrganisationName={fromOrganisationName} invitedWorkspaceName={invitedWorkspaceName} />
            </div>
          </div>

          <section className="order-1 overflow-hidden rounded-[30px] border border-[#d8dfd4] bg-[#fffdf8] shadow-[0_30px_90px_rgba(23,32,51,0.14)] lg:order-2">
            <div className="p-6 sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe4da] bg-[#f1fbf6] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#1f6a57]">
                <ShieldCheck size={14} />
                Secure invitation
              </span>

              <h2 className="mt-6 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#101814] sm:text-[2.55rem]">
                Review your invitation
              </h2>
              <p className="mt-4 text-base leading-7 text-[#5f6f66]">
                Before joining, you&apos;ll be able to see all the details and understand exactly what this connection means.
              </p>

              <div className="mt-8 rounded-[22px] border border-[#e0e7dc] bg-white p-5 shadow-[0_16px_40px_rgba(23,32,51,0.06)]">
                <p className="text-sm font-semibold text-[#172033]">Here&apos;s what you&apos;ll see before deciding:</p>
                <div className="mt-5 grid gap-4">
                  <ReviewItem title="Who invited you">
                    The organisation and person who sent the invite.
                  </ReviewItem>
                  <ReviewItem title="Which organisation they'll connect with">
                    The workspace that will become the connected partner.
                  </ReviewItem>
                  <ReviewItem title="The relationship they'll create">
                    How the two organisations will be connected.
                  </ReviewItem>
                  <ReviewItem title="What happens next">
                    After accepting, you can invite your team or ask Arch9 for free platform training.
                  </ReviewItem>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#cfe4da] bg-[#f2fbf6] p-4 text-sm leading-6 text-[#36534a]">
                <p className="font-semibold text-[#183d33]">Nothing is accepted automatically.</p>
                <p className="mt-1">
                  You&apos;ll have the opportunity to review every detail before deciding whether to join.
                </p>
              </div>

              <div className="mt-6 space-y-5">
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
                    <div className="grid gap-3">
                      <Button asChild size="lg" className="min-h-12 w-full rounded-[14px] bg-[#0c332a] px-5 text-white shadow-[0_16px_34px_rgba(12,51,42,0.22)] hover:bg-[#0f4538]">
                        <Link to={authPath}>
                          Review Invitation
                          <ArrowRight size={17} />
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="min-h-12 w-full whitespace-normal rounded-[14px] border-[#d8dfd4] bg-[#fffdf8] px-5 py-3 text-center leading-5 text-[#24342e]">
                        <Link to={signupPath}>New to Arch9? Create your workspace</Link>
                      </Button>
                    </div>
                  </>
                ) : !workspaceId ? (
                  <>
                    <StatusPanel tone="warning" icon={Building2} title="Workspace required">
                      Your account is signed in, but there is no active workspace available for this partner connection.
                    </StatusPanel>
                    <div className="grid gap-3">
                      <Button asChild size="lg" className="min-h-12 w-full rounded-[14px] bg-[#0c332a] text-white hover:bg-[#0f4538]">
                        <Link to="/onboarding/profile">Open workspace setup</Link>
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="min-h-12 w-full whitespace-normal rounded-[14px] border-[#d8dfd4] bg-[#fffdf8] px-5 py-3 text-center leading-5 text-[#24342e]">
                        <Link to={signupPath}>New to Arch9? Create your workspace</Link>
                      </Button>
                    </div>
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
                      <Button asChild variant="secondary" size="lg" className="rounded-[14px] border-[#d8dfd4] bg-[#fffdf8]">
                        <Link to="/partners?tab=invitations">Open Partners</Link>
                      </Button>
                      <Button asChild variant="ghost" size="lg" className="rounded-[14px]">
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
                      <StatusPanel icon={Building2} title="Invitation details ready">
                        Review the sender, workspace, relationship, scope, and expiry before accepting this company connection.
                      </StatusPanel>
                    )}

                    <div className="rounded-[22px] border border-[#dfe8ee] bg-white px-4 py-1 shadow-[0_12px_32px_rgba(23,32,51,0.05)]">
                      <dl className="divide-y divide-[#e8eee6]">
                        <DetailRow label="Invited by" value={fromOrganisationName} icon={Building2} />
                        <DetailRow label="Your workspace" value={invitedWorkspaceName} icon={UsersRound} />
                        <DetailRow label="Partner type" value={partnerTypeLabel} icon={Handshake} />
                        <DetailRow label="Relationship" value={preview?.preferred ? `${relationshipLabel} preferred partner` : relationshipLabel} icon={BadgeCheck} />
                        <DetailRow label="Scope" value={getScopeLabel(preview)} icon={Network} />
                        <DetailRow label="Invite expires" value={formatDate(preview?.expiresAt)} icon={CalendarClock} />
                      </dl>
                    </div>

                    {accepted ? (
                      <div className="rounded-[22px] border border-[#cfe4da] bg-[#f2fbf6] p-5 shadow-[0_12px_32px_rgba(23,32,51,0.05)]">
                        <div>
                          <p className="text-sm font-semibold text-[#183d33]">Next steps for {invitedWorkspaceName || 'your company'}</p>
                          <p className="mt-1 text-sm leading-6 text-[#65746c]">
                            Bring the right people into the workspace, or ask the Arch9 team to walk your team through the platform.
                          </p>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Button asChild variant="secondary" size="lg" className="min-h-12 whitespace-normal rounded-[14px] border-[#b8d6ca] bg-white px-4 py-3 text-center leading-5 text-[#183d33]">
                            <Link to="/team?intent=invite-team">
                              <UsersRound size={17} />
                              Invite your team
                            </Link>
                          </Button>
                          <Button type="button" onClick={handleRequestTraining} disabled={trainingRequesting} variant="secondary" size="lg" className="min-h-12 whitespace-normal rounded-[14px] border-[#b8d6ca] bg-white px-4 py-3 text-center leading-5 text-[#183d33]">
                            <Mail size={17} />
                            {trainingRequesting ? 'Requesting...' : 'Request free training'}
                          </Button>
                        </div>
                        {trainingError ? <p className="mt-3 text-sm font-semibold text-[#9a2b25]">{trainingError}</p> : null}
                        {trainingMessage ? <p className="mt-3 text-sm font-semibold text-[#1f6a57]">{trainingMessage}</p> : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      {accepted ? (
                        <Button onClick={openPartners} size="lg" className="rounded-[14px] bg-[#0c332a] text-white hover:bg-[#0f4538]">
                          Open Partners
                          <ArrowRight size={17} />
                        </Button>
                      ) : (
                        <Button onClick={() => void handleAccept()} disabled={accepting} size="lg" className="rounded-[14px] bg-[#0c332a] text-white hover:bg-[#0f4538]">
                          {accepting ? 'Accepting...' : 'Accept invitation'}
                          <CheckCircle2 size={17} />
                        </Button>
                      )}
                      <Button asChild variant="secondary" size="lg" className="rounded-[14px] border-[#d8dfd4] bg-[#fffdf8] text-[#24342e]">
                        <Link to="/partners?tab=invitations">Review in Partners</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex items-center gap-2 border-t border-[#e5e8df] pt-4 text-xs font-medium text-[#6b7b72]">
                <LockKeyhole size={14} />
                Your information is secure and encrypted
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
