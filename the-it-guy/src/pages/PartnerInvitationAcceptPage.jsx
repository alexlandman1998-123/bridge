import { AlertCircle, ArrowRight, Building2, CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
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

function StatusPanel({ tone = 'info', icon: Icon = ShieldCheck, title, children }) {
  const tones = {
    success: 'border-[#b7e4c7] bg-[#f1fbf6] text-[#14532d]',
    warning: 'border-[#f5d08a] bg-[#fff8eb] text-[#7a4b00]',
    danger: 'border-[#f5b7bd] bg-[#fff5f6] text-[#842029]',
    info: 'border-[#d8e5f0] bg-[#f8fbfe] text-[#334e68]',
  }
  return (
    <div className={`rounded-[8px] border p-4 ${tones[tone] || tones.info}`}>
      <div className="flex items-start gap-3">
        <Icon size={19} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <div className="mt-2 text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-[8px] border border-[#e2eaf4] bg-[#fbfdff] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#71869d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#142132]">{value || 'Not recorded'}</p>
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
  const returnPath = useMemo(() => buildReturnPath(location), [location])
  const authPath = `/auth?next=${encodeURIComponent(returnPath)}`
  const signupPath = `/auth?mode=signup&next=${encodeURIComponent(returnPath)}`
  const session = authState.session
  const workspaceId = normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
  const workspaceName = normalizeText(workspaceContext.currentWorkspace?.name || workspaceContext.workspace?.name)
  const authLoading = authState.status === 'loading' || workspaceContext.profileLoading

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

  async function handleAccept() {
    try {
      setAccepting(true)
      setError('')
      const result = await acceptPartnerInvitationByLink({
        invitationId,
        organisationId: workspaceId,
      })
      setPreview(result?.invitation || preview)
      setAccepted(true)
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this partner invitation.')
    } finally {
      setAccepting(false)
    }
  }

  function openPartners() {
    navigate('/partners?tab=invitations', { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-[#0f2742]">Arch9</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#71869d]">Partner Invitation</p>
        </div>

        <section className="overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-white shadow-[0_20px_60px_rgba(15,47,79,0.10)]">
          <div className="border-b border-[#e5edf6] bg-[#0f2742] px-6 py-7 text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#c6f6ec]">
              <ShieldCheck size={14} />
              Secure partner connection
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              {accepted ? 'Partner invitation accepted' : 'Review your partner invitation'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#dbeafe]">
              Accepting links the invited workspace with the sender on Arch9 for partner coordination.
            </p>
          </div>

          <div className="space-y-5 p-6">
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
                  This invite needs to be accepted by a signed-in user from the invited workspace.
                </StatusPanel>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to={authPath}>
                      Sign in
                      <ArrowRight size={17} />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link to={signupPath}>Create account</Link>
                  </Button>
                </div>
              </>
            ) : !workspaceId ? (
              <>
                <StatusPanel tone="warning" icon={Building2} title="Workspace required">
                  Your account is signed in, but there is no active workspace available for this partner connection.
                </StatusPanel>
                <Button asChild variant="secondary">
                  <Link to="/onboarding/profile">Open workspace setup</Link>
                </Button>
              </>
            ) : loadingPreview ? (
              <StatusPanel icon={ShieldCheck} title="Loading invitation">
                Checking this invitation against {workspaceName || 'your active workspace'}.
              </StatusPanel>
            ) : error ? (
              <>
                <StatusPanel tone="danger" icon={AlertCircle} title="Invitation cannot be opened">
                  {error}
                </StatusPanel>
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="secondary">
                    <Link to="/partners?tab=invitations">Open Partners</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to={authPath}>Use another account</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                {accepted ? (
                  <StatusPanel tone="success" icon={CheckCircle2} title="Connection confirmed">
                    This partner relationship is active for {workspaceName || 'your workspace'}.
                  </StatusPanel>
                ) : (
                  <StatusPanel icon={Building2} title="Ready to accept">
                    You are accepting this invite for {workspaceName || 'your active workspace'}.
                  </StatusPanel>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Invited by" value={preview?.fromOrganisationName} />
                  <DetailRow label="Your workspace" value={workspaceName || preview?.toOrganisationName} />
                  <DetailRow label="Partner type" value={titleize(preview?.partnerType || 'partner')} />
                  <DetailRow label="Relationship" value={titleize(preview?.relationshipType || 'approved')} />
                  <DetailRow label="Scope" value={preview?.scopeName ? `${titleize(preview.scopeType)}: ${preview.scopeName}` : titleize(preview?.scopeType || 'organisation')} />
                  <DetailRow label="Preferred" value={preview?.preferred ? 'Yes' : 'No'} />
                </div>

                <div className="flex flex-wrap gap-3">
                  {accepted ? (
                    <Button onClick={openPartners}>
                      Open Partners
                      <ArrowRight size={17} />
                    </Button>
                  ) : (
                    <Button onClick={handleAccept} disabled={accepting}>
                      {accepting ? 'Accepting...' : 'Accept invitation'}
                      <CheckCircle2 size={17} />
                    </Button>
                  )}
                  <Button asChild variant="secondary">
                    <Link to="/partners?tab=invitations">Review in Partners</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
