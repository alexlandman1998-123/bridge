import { AlertCircle, ArrowRight, Building2, CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useAuthSession } from '../context/AuthSessionContext'
import { invokeEdgeFunction } from '../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function buildReturnPath(location) {
  const path = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`
  return path || '/dashboard'
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

async function invokeDeveloperAccessInvite(body) {
  const { data, error } = await invokeEdgeFunction('development-access-invite', { body })
  if (error || data?.error) {
    throw new Error(error?.message || data?.error || 'Unable to open this developer access invite.')
  }
  return data
}

export default function DeveloperAccessInvitePage() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [invite, setInvite] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const returnPath = useMemo(() => buildReturnPath(location), [location])
  const authPath = `/auth?next=${encodeURIComponent(returnPath)}`
  const signupPath = `/auth?mode=signup&next=${encodeURIComponent(returnPath)}`
  const session = authState.session
  const authLoading = authState.status === 'loading'

  useEffect(() => {
    let active = true
    if (!token) {
      setInvite(null)
      return () => {
        active = false
      }
    }

    async function loadPreview() {
      try {
        setLoadingPreview(true)
        setError('')
        const result = await invokeDeveloperAccessInvite({ action: 'preview', token })
        if (!active) return
        setInvite(result?.invite || null)
        setAccepted(Boolean(result?.alreadyAccepted))
      } catch (previewError) {
        if (active) {
          setInvite(null)
          setError(previewError?.message || 'Unable to load this developer access invite.')
        }
      } finally {
        if (active) setLoadingPreview(false)
      }
    }

    void loadPreview()

    return () => {
      active = false
    }
  }, [token])

  async function handleAccept() {
    try {
      setAccepting(true)
      setError('')
      const result = await invokeDeveloperAccessInvite({ action: 'accept', token })
      setInvite(result?.invite || invite)
      setAccepted(true)
      if (result?.redirectTo) {
        navigate(result.redirectTo, { replace: true })
      }
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this developer access invite.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-8 text-[#142132]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-[#0f2742]">Arch9</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#71869d]">Developer Access Invite</p>
        </div>

        <section className="overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-white shadow-[0_20px_60px_rgba(15,47,79,0.10)]">
          <div className="border-b border-[#e5edf6] bg-[#0f2742] px-6 py-7 text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#c6f6ec]">
              <ShieldCheck size={14} />
              Secure development access
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">
              {accepted ? 'Developer access confirmed' : 'Review your developer access invite'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#dbeafe]">
              Accepting links your Arch9 account to the development workspace selected by the sender.
            </p>
          </div>

          <div className="space-y-5 p-6">
            {!token ? (
              <StatusPanel tone="danger" icon={AlertCircle} title="Invite unavailable">
                This developer access link is missing its token. Ask the sender to resend it from Arch9.
              </StatusPanel>
            ) : loadingPreview ? (
              <StatusPanel icon={ShieldCheck} title="Loading invite">
                Checking this secure developer access link.
              </StatusPanel>
            ) : error ? (
              <StatusPanel tone="danger" icon={AlertCircle} title="Invite cannot be opened">
                {error}
              </StatusPanel>
            ) : (
              <>
                {invite ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Development" value={invite.developmentName} />
                    <DetailRow label="Company" value={invite.companyName} />
                    <DetailRow label="Contact" value={invite.contactName} />
                    <DetailRow label="Email" value={invite.email} />
                  </div>
                ) : null}

                {authLoading ? (
                  <StatusPanel icon={ShieldCheck} title="Checking your session">
                    Preparing your secure invitation view.
                  </StatusPanel>
                ) : !session ? (
                  <>
                    <StatusPanel icon={Mail} title="Sign in to continue">
                      Use the invited email address so Arch9 can attach the development access to the correct account.
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
                ) : accepted ? (
                  <>
                    <StatusPanel tone="success" icon={CheckCircle2} title="Access already active">
                      This development invite has already been accepted.
                    </StatusPanel>
                    <Button asChild>
                      <Link to={invite?.developmentId ? `/developments/${invite.developmentId}` : '/dashboard'}>
                        Open development
                        <ArrowRight size={17} />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <StatusPanel icon={Building2} title="Ready to accept">
                      You are signed in and can connect this development access to your account.
                    </StatusPanel>
                    <Button onClick={handleAccept} disabled={accepting}>
                      {accepting ? 'Accepting...' : 'Accept developer access'}
                      <CheckCircle2 size={17} />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
