import { BadgeCheck, Building2, Check, LoaderCircle, Mail, Phone, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { decideAttorneyPublicQuote, resolveAttorneyPublicQuote } from '../services/attorneyQuotePublicService'

const SERVICE_LABELS = Object.freeze({
  transfer_quote: 'Transfer Quote',
  property_transfer: 'Property Transfer',
  bond_registration: 'Bond Registration',
  bond_cancellation: 'Bond Cancellation',
  property_legal_advice: 'Property Legal Advice',
  general_enquiry: 'General Property Enquiry',
})

function formatMoney(value, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(Number(value || 0))
}

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

function BrandMark({ quote }) {
  const [failed, setFailed] = useState(false)
  if (quote.logoUrl && !failed) {
    return <img src={quote.logoUrl} alt={`${quote.firmName} logo`} referrerPolicy="no-referrer" className="h-16 w-16 rounded-2xl border border-white/80 bg-white object-contain p-2 shadow-sm" onError={() => setFailed(true)} />
  }
  return <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[var(--quote-brand)] shadow-sm"><Building2 size={28} aria-hidden="true" /></span>
}

export default function AttorneyQuoteDecisionPage() {
  const { token = '' } = useParams()
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      try {
        const resolved = await resolveAttorneyPublicQuote(token)
        if (active) setQuote(resolved)
      } catch (loadError) {
        if (active) setError(loadError?.message || 'This quote link is unavailable.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [token])

  async function decide(decision) {
    setSaving(true)
    setError('')
    try {
      await decideAttorneyPublicQuote({ token, decision, reason })
      setQuote((current) => ({ ...current, state: decision, decisionReason: decision === 'declined' ? reason : '' }))
      setDeclining(false)
    } catch (saveError) {
      setError(saveError?.message || 'We could not record your decision right now.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50"><LoaderCircle className="animate-spin text-slate-500" size={30} /><span className="ml-3 text-sm text-slate-600">Loading secure quote…</span></main>
  }

  if (!quote) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><X className="mx-auto text-slate-400" size={34} /><h1 className="mt-4 text-xl font-semibold text-slate-900">Quote unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{error || 'This secure link is invalid, revoked, or expired. Please contact the firm for assistance.'}</p></section></main>
  }

  const decided = quote.state === 'accepted' || quote.state === 'declined'
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,color-mix(in_srgb,var(--quote-brand)_10%,white)_0%,#f8fafc_38%,#f8fafc_100%)] px-4 py-8 sm:py-12" style={{ '--quote-brand': quote.primaryColour, '--quote-accent': quote.secondaryColour }}>
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center gap-4"><BrandMark quote={quote} /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Secure quote from</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{quote.firmName}</h1></div></header>

        <section className="mt-7 overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_24px_70px_rgba(15,23,42,0.09)]">
          <div className="border-b border-slate-100 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-sm text-slate-500">{quote.clientFirstName ? `Prepared for ${quote.clientFirstName}` : 'Prepared for you'}</p><h2 className="mt-1 text-2xl font-semibold text-slate-950">{SERVICE_LABELS[quote.serviceType] || 'Property Legal Services'}</h2><p className="mt-2 text-sm text-slate-500">{quote.quoteNumber} · Version {quote.versionNumber}</p></div>
              <span className="self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Valid until {formatDate(quote.validUntil)}</span>
            </div>
          </div>

          <dl className="grid gap-0 p-6 sm:p-8">
            <div className="flex justify-between gap-4 border-b border-slate-100 py-3"><dt className="text-sm text-slate-600">Professional fee</dt><dd className="font-semibold text-slate-900">{formatMoney(quote.professionalFee, quote.currency)}</dd></div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-3"><dt className="text-sm text-slate-600">VAT</dt><dd className="font-semibold text-slate-900">{formatMoney(quote.vatAmount, quote.currency)}</dd></div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-3"><dt className="text-sm text-slate-600">Estimated disbursements</dt><dd className="font-semibold text-slate-900">{formatMoney(quote.disbursements, quote.currency)}</dd></div>
            <div className="mt-3 flex justify-between gap-4 rounded-2xl bg-slate-950 px-5 py-4 text-white"><dt className="font-semibold">Total quote</dt><dd className="text-xl font-semibold">{formatMoney(quote.totalAmount, quote.currency)}</dd></div>
          </dl>

          <div className="border-t border-slate-100 p-6 sm:p-8">
            {decided ? (
              <div className={`rounded-2xl p-5 ${quote.state === 'accepted' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-800'}`} role="status">
                <BadgeCheck size={24} /><h3 className="mt-2 font-semibold">Quote {quote.state}</h3><p className="mt-1 text-sm leading-6">Your decision has been recorded securely. The firm will contact you about the next steps.</p>{quote.decisionReason ? <p className="mt-2 text-sm">Reason: {quote.decisionReason}</p> : null}
              </div>
            ) : declining ? (
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">Reason for declining<textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-[var(--quote-brand)] focus:ring-4 focus:ring-slate-100" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Please help the firm understand your decision." /></label>
                {error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p> : null}
                <div className="flex flex-wrap gap-2"><button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={saving || !reason.trim()} onClick={() => decide('declined')}>{saving ? <LoaderCircle className="mr-2 animate-spin" size={16} /> : null}Confirm decline</button><button type="button" className="min-h-11 rounded-xl px-5 text-sm font-semibold text-slate-600" disabled={saving} onClick={() => { setDeclining(false); setError('') }}>Back</button></div>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Your decision</h3><p className="mt-1 text-sm leading-6 text-slate-600">Accepting records your approval of this quote. It does not itself open a legal Matter or create an attorney-client mandate.</p>
                {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p> : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--quote-brand)] px-5 font-semibold text-white shadow-sm disabled:opacity-60" disabled={saving} onClick={() => decide('accepted')}>{saving ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />} Accept quote</button><button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 font-semibold text-slate-700 disabled:opacity-60" disabled={saving} onClick={() => setDeclining(true)}><X size={18} /> Decline quote</button></div>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-6 text-center text-xs leading-5 text-slate-500"><p className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Secure quote link · Please do not forward it</p>{quote.contactEmail || quote.contactPhone ? <p className="mt-2 flex flex-wrap justify-center gap-4">{quote.contactEmail ? <a className="inline-flex items-center gap-1 hover:text-slate-800" href={`mailto:${quote.contactEmail}`}><Mail size={13} /> {quote.contactEmail}</a> : null}{quote.contactPhone ? <a className="inline-flex items-center gap-1 hover:text-slate-800" href={`tel:${quote.contactPhone}`}><Phone size={13} /> {quote.contactPhone}</a> : null}</p> : null}<p className="mt-3">Powered securely by ARCH9</p></footer>
      </div>
    </main>
  )
}
