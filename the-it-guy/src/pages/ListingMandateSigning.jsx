import { Check, CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOnboardingBrandInitials, resolveOnboardingBranding } from '../lib/onboardingBranding'
import { invokeEdgeFunction } from '../lib/supabaseClient'

const text = (value) => String(value || '').trim()
const documentLabels = { disclosure: 'Disclosure form', fica: 'FICA declaration', mandate: 'Exclusive mandate' }
const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback

function BrandMark({ branding }) {
  const [failed, setFailed] = useState(false)
  const name = branding.organisationName || 'Arch9'
  const logo = branding.logoDarkUrl || branding.logoLightUrl || branding.logoIconUrl
  if (logo && !failed) return <img src={logo} alt={`${name} logo`} className="max-h-12 max-w-[200px] object-contain object-left" onError={() => setFailed(true)} />
  return <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-white/15 px-3 text-sm font-bold tracking-wide text-white ring-1 ring-white/20">{getOnboardingBrandInitials(name)}</span>
}

export default function ListingMandateSigning() {
  const { token = '' } = useParams()
  const [session, setSession] = useState(null)
  const [signedName, setSignedName] = useState('')
  const [signature, setSignature] = useState('')
  const [activeDocumentKey, setActiveDocumentKey] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    let live = true
    async function load() {
      const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'resolve', token } })
      if (!live) return
      if (result.error || result.data?.success === false) setError(result.error?.message || result.data?.error || 'This signing link is no longer available.')
      else {
        const nextSession = result.data.session
        setSession(nextSession)
        setSignedName(nextSession?.signerName || '')
        setActiveDocumentKey((nextSession?.selectedDocuments || []).find((key) => !nextSession?.progress?.[key]) || '')
      }
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [token])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!accepted || !text(signedName) || !text(signature)) { setError(`Please accept the ${documentLabels[activeDocumentKey] || 'document'} and enter your signature.`); return }
    setSubmitting(true)
    const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'sign', token, documentKey: activeDocumentKey, signedName, signature, accepted } })
    setSubmitting(false)
    if (result.error || result.data?.success === false) { setError(result.error?.message || result.data?.error || 'Unable to save your signature.'); return }
    if (result.data?.complete) setComplete(true)
    else {
      const progress = result.data?.progress || {}
      setSession((previous) => ({ ...previous, progress }))
      setActiveDocumentKey((session?.selectedDocuments || []).find((key) => !progress?.[key]) || '')
      setAccepted(false)
      setSignature('')
    }
  }

  const mandate = session?.mandate || {}
  const branding = useMemo(() => resolveOnboardingBranding(mandate.branding), [mandate.branding])
  const theme = { '--signing-primary': validHex(branding.primaryColour, '#173f5f'), '--signing-secondary': validHex(branding.secondaryColour, '#102a43') }
  const selectedDocuments = Array.isArray(session?.selectedDocuments) ? session.selectedDocuments : ['mandate']
  const signedCount = selectedDocuments.filter((key) => session?.progress?.[key]).length
  const activeDocumentLabel = documentLabels[activeDocumentKey] || 'Document'
  const agencyName = branding.organisationName || 'Arch9'
  const commissionLabel = text(mandate.commissionBasis).toLowerCase() === 'fixed'
    ? (text(mandate.commissionAmount) ? `R ${Number(mandate.commissionAmount).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}` : 'As agreed')
    : (text(mandate.commissionPercentage) ? `${text(mandate.commissionPercentage)}%` : 'As agreed')

  return <main className="min-h-screen bg-[#edf3f7] text-[#172334]" style={theme}>
    <div className="min-h-[250px] bg-[linear-gradient(118deg,var(--signing-secondary),var(--signing-primary))] px-4 pb-20 pt-6 sm:px-6 sm:pt-9">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4"><BrandMark branding={branding} /><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15"><LockKeyhole size={14} /> Secure signing</span></header>
      <div className="mx-auto mt-10 max-w-3xl text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Seller document centre</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Review and sign your documents.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/80">{agencyName} has prepared these documents securely for your property.</p></div>
    </div>
    <section className="mx-auto -mt-10 max-w-3xl px-4 pb-10 sm:px-6 sm:pb-16"><div className="overflow-hidden rounded-[24px] bg-white shadow-[0_18px_55px_rgba(16,42,67,0.16)] ring-1 ring-[#dbe6ef]">
      {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-[var(--signing-primary)]" size={28} /></div> : error && !session ? <div className="m-6 rounded-2xl border border-[#f1c5be] bg-[#fff6f4] p-5 text-sm leading-6 text-[#9d3427]">{error}</div> : complete ? <div className="px-6 py-14 text-center sm:px-10"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eaf8ef] text-[#168044]"><CheckCircle2 size={34} /></span><h2 className="mt-5 text-2xl font-bold">Documents signed</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#60748b]">Thank you. Your signed documents have been saved securely with this listing. Your agent will be in touch if anything else is needed.</p></div> : <form onSubmit={submit}>
        <div className="border-b border-[#e7edf3] px-5 py-5 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#1c3147]">Your signing progress</p><p className="mt-1 text-sm text-[#64778c]">Complete each document below. You can sign them one at a time.</p></div><span className="rounded-full bg-[#edf7f1] px-3 py-1.5 text-xs font-bold text-[#187446]">{signedCount} of {selectedDocuments.length} signed</span></div><div className="mt-5 grid gap-2 sm:grid-cols-3">{selectedDocuments.map((key, index) => {
          const signed = Boolean(session?.progress?.[key]); const active = key === activeDocumentKey
          return <button type="button" key={key} onClick={() => !signed && setActiveDocumentKey(key)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition ${signed ? 'border-[#bae0c8] bg-[#f0faf3] text-[#197849]' : active ? 'border-[var(--signing-primary)] bg-[#f5f9fc] text-[#173f5f] shadow-sm' : 'border-[#dce6ef] text-[#5f7287] hover:border-[#b9cbd9]'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${signed ? 'bg-[#1f9153] text-white' : active ? 'bg-[var(--signing-primary)] text-white' : 'bg-[#e8eef4] text-[#64778c]'}`}>{signed ? <Check size={14} /> : index + 1}</span><span>{documentLabels[key] || key}</span></button>
        })}</div></div>
        <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8"><div className="grid gap-3 rounded-2xl border border-[#dfe8f0] bg-[#f8fbfd] p-4 text-sm sm:grid-cols-2"><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Property</span><strong className="mt-1 block text-[#20374f]">{text(mandate.propertyAddress) || 'Property details'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Valid until</span><strong className="mt-1 block text-[#20374f]">{session?.expiresAt ? new Date(session.expiresAt).toLocaleDateString('en-ZA') : '—'}</strong></div>{selectedDocuments.includes('mandate') ? <><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Asking price</span><strong className="mt-1 block text-[#20374f]">{text(mandate.askingPrice) || 'As agreed'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Commission</span><strong className="mt-1 block text-[#20374f]">{commissionLabel} {text(mandate.vatHandling)}</strong></div></> : null}</div>
          <div className="rounded-2xl border border-[#dfe8f0] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5f9] text-[var(--signing-primary)]"><FileCheck2 size={20} /></span><div><h2 className="font-bold text-[#20374f]">{activeDocumentLabel}</h2><p className="mt-1 text-sm leading-6 text-[#60748b]">Please review this document and confirm that you agree to sign it electronically.</p></div></div><label className="mt-5 flex cursor-pointer gap-3 rounded-xl bg-[#f8fbfd] p-3 text-sm leading-5 text-[#334d66]"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--signing-primary)]" />I confirm that I have reviewed the {activeDocumentLabel.toLowerCase()} and consent to signing it electronically.</label></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-[#263d55]">Full legal name<input className="mt-2 w-full rounded-xl border border-[#cfdce8] bg-white px-3 py-3 font-normal text-[#172334] outline-none transition focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" value={signedName} onChange={(event) => setSignedName(event.target.value)} /></label><label className="block text-sm font-bold text-[#263d55]">Type your signature<input className="mt-2 w-full rounded-xl border border-[#cfdce8] bg-white px-3 py-3 font-normal italic text-[#172334] outline-none transition focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Your full name" /></label></div>
          {error ? <p className="rounded-xl border border-[#f1c5be] bg-[#fff6f4] p-3 text-sm text-[#9d3427]">{error}</p> : null}<button type="submit" disabled={submitting || !activeDocumentKey} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--signing-primary)] px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(16,42,67,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}{submitting ? 'Saving your signature…' : `Accept and sign ${activeDocumentLabel}`}</button><p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-[#73869a]"><LockKeyhole size={13} /> Your signature and document details are protected by a secure, time-limited link.</p>
        </div>
      </form>}
    </div><p className="mt-5 text-center text-xs text-[#718397]">Powered by Arch9 · Secure property workflow</p></section>
  </main>
}
