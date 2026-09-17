import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { invokeEdgeFunction } from '../lib/supabaseClient'

const text = (value) => String(value || '').trim()

export default function ListingMandateSigning() {
  const { token = '' } = useParams()
  const [session, setSession] = useState(null)
  const [signedName, setSignedName] = useState('')
  const [signature, setSignature] = useState('')
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
      else { setSession(result.data.session); setSignedName(result.data.session?.signerName || '') }
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [token])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!accepted || !text(signedName) || !text(signature)) { setError('Please accept the mandate and enter your signature.'); return }
    setSubmitting(true)
    const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'sign', token, signedName, signature, accepted } })
    setSubmitting(false)
    if (result.error || result.data?.success === false) { setError(result.error?.message || result.data?.error || 'Unable to save your signature.'); return }
    setComplete(true)
  }

  const mandate = session?.mandate || {}
  return <main className="min-h-screen bg-[#f4f8fb] px-4 py-8 text-[#172334] sm:py-14"><section className="mx-auto max-w-2xl rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-[#dfe8f2] sm:p-8">
    <div className="flex items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eaf6ef] text-[#187446]"><ShieldCheck size={22} /></span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#64748b]">Arch9 secure signing</p><h1 className="mt-1 text-2xl font-bold">Exclusive mandate</h1><p className="mt-2 text-sm leading-6 text-[#60748b]">Review the details below, then sign electronically. This link can only be used once.</p></div></div>
    {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#1f7d44]" /></div> : error && !session ? <p className="mt-8 rounded-xl bg-[#fff4f2] p-4 text-sm text-[#a83d2e]">{error}</p> : complete ? <div className="mt-8 rounded-2xl bg-[#eefaf2] p-6 text-center"><CheckCircle2 className="mx-auto text-[#1f7d44]" size={36} /><h2 className="mt-3 text-lg font-bold">Mandate signed</h2><p className="mt-2 text-sm text-[#416454]">Thank you. Your signed mandate has been saved securely with this listing.</p></div> : <form className="mt-8 space-y-6" onSubmit={submit}>
      <div className="grid gap-3 rounded-2xl border border-[#dfe8f2] bg-[#fbfdff] p-4 text-sm sm:grid-cols-2"><div><span className="block text-xs font-bold uppercase tracking-wide text-[#718096]">Property</span><strong>{text(mandate.propertyAddress) || 'Property details'}</strong></div><div><span className="block text-xs font-bold uppercase tracking-wide text-[#718096]">Asking price</span><strong>{text(mandate.askingPrice) || 'As agreed'}</strong></div><div><span className="block text-xs font-bold uppercase tracking-wide text-[#718096]">Commission</span><strong>{text(mandate.commissionPercentage) ? `${text(mandate.commissionPercentage)}%` : 'As agreed'} {text(mandate.vatHandling)}</strong></div><div><span className="block text-xs font-bold uppercase tracking-wide text-[#718096]">Valid until</span><strong>{session?.expiresAt ? new Date(session.expiresAt).toLocaleDateString() : ''}</strong></div></div>
      <div className="rounded-2xl border border-[#dfe8f2] p-4 text-sm leading-6 text-[#42566d]"><p className="font-semibold text-[#172334]">Declaration</p><p className="mt-2">I confirm that I have reviewed this exclusive mandate, understand the commission arrangement shown above, and agree to appoint the agency to market the property on these terms.</p></div>
      <label className="flex gap-3 text-sm leading-5"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" />I accept the exclusive mandate and consent to signing it electronically.</label>
      <label className="block text-sm font-semibold">Full legal name<input className="mt-2 w-full rounded-xl border border-[#cfdce8] px-3 py-3 font-normal" value={signedName} onChange={(event) => setSignedName(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Type your signature<input className="mt-2 w-full rounded-xl border border-[#cfdce8] px-3 py-3 font-normal italic" value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Your full name" /></label>
      {error ? <p className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#a83d2e]">{error}</p> : null}<Button type="submit" disabled={submitting} className="w-full justify-center">{submitting ? <Loader2 size={16} className="animate-spin" /> : null}{submitting ? 'Saving signature...' : 'Accept and sign mandate'}</Button>
    </form>}
  </section></main>
}
