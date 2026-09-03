import { AlertTriangle, ArrowRight, CheckCircle2, Image, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import {
  acceptDevelopmentMarketingInvite,
  fetchDevelopmentMarketingInvite,
} from '../lib/developmentDetailApi'

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function toTitle(value = '') {
  return String(value || 'viewer').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function DevelopmentMarketingInvitePage() {
  const { token } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const returnPath = useMemo(() => `${location.pathname}${location.search}${location.hash}`, [location])
  const authPath = `/auth?next=${encodeURIComponent(returnPath)}`
  const signupPath = `/auth?mode=signup&next=${encodeURIComponent(returnPath)}`
  const session = authState.session

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchDevelopmentMarketingInvite(token)
      .then((nextInvite) => {
        if (active) setInvite(nextInvite)
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Unable to load this marketing invitation.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function handleAccept() {
    if (!session) {
      navigate(authPath)
      return
    }
    setAccepting(true)
    setError('')
    try {
      await acceptDevelopmentMarketingInvite(token)
      setAccepted(true)
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept this marketing invitation.')
    } finally {
      setAccepting(false)
    }
  }

  const unavailable = ['revoked', 'expired', 'accepted'].includes(invite?.status)

  return (
    <main className="min-h-screen bg-[#f5f8fc] px-4 py-10 text-[#142132] sm:px-6">
      <section className="mx-auto max-w-xl rounded-[24px] border border-[#dfe8f2] bg-white p-6 shadow-[0_24px_70px_rgba(36,64,99,0.12)] sm:p-9">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#eaf7f0] text-[#168153]"><Image size={23} /></div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#168153]">Arch9 Marketing Hub</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Collaborate on approved development marketing</h1>
        <p className="mt-3 text-sm leading-6 text-[#64758b]">This invitation gives access only to approved marketing material. It never provides transaction, finance, inventory, or operational development access.</p>

        {loading ? <div className="mt-7 rounded-2xl bg-[#f5f8fc] px-4 py-6 text-sm text-[#64758b]">Loading invitation…</div> : null}
        {!loading && error ? <div className="mt-7 flex gap-3 rounded-2xl border border-[#ffd9d0] bg-[#fff7f4] p-4 text-sm text-[#b23a23]"><AlertTriangle className="mt-0.5 shrink-0" size={18} />{error}</div> : null}
        {!loading && invite ? <div className="mt-7 grid gap-3 rounded-2xl border border-[#e1eaf3] bg-[#fbfdff] p-4 text-sm">
          <div><span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#718299]">Development</span><strong className="mt-1 block">{invite.developmentName || 'Development'}</strong></div>
          <div><span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#718299]">Marketing role</span><strong className="mt-1 block">{toTitle(invite.accessRole)}</strong></div>
          <div><span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#718299]">Invitation expires</span><strong className="mt-1 block">{formatDate(invite.expiresAt)}</strong></div>
        </div> : null}

        {accepted ? <div className="mt-7 rounded-2xl border border-[#cdeedc] bg-[#f1fbf5] p-4"><div className="flex gap-3"><CheckCircle2 className="shrink-0 text-[#168153]" size={20} /><div><strong className="block">Marketing access confirmed</strong><p className="mt-1 text-sm leading-6 text-[#477061]">Your Arch9 account now has the scoped Marketing Hub access included in this invitation.</p></div></div><button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#168153]" onClick={() => navigate('/dashboard')}>Open Arch9 <ArrowRight size={16} /></button></div> : null}
        {!loading && invite && !accepted && !unavailable ? <div className="mt-7"><button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#168153] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" onClick={() => void handleAccept()} disabled={accepting}>{accepting ? 'Accepting…' : session ? 'Accept marketing invitation' : 'Sign in to accept'} <ArrowRight size={16} /></button>{!session ? <p className="mt-3 text-center text-sm text-[#64758b]">New to Arch9? <Link className="font-semibold text-[#168153]" to={signupPath}>Create an account</Link></p> : null}</div> : null}
        {!loading && invite && !accepted && unavailable ? <div className="mt-7 flex gap-3 rounded-2xl border border-[#e3ebf4] bg-[#fbfcfe] p-4 text-sm text-[#64758b]"><ShieldCheck className="mt-0.5 shrink-0 text-[#718299]" size={18} />This invitation is {invite.status}. Ask the development team to create a new Marketing Hub invitation if you still need access.</div> : null}
      </section>
    </main>
  )
}
