import { Check, CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOnboardingBrandInitials, resolveOnboardingBranding } from '../lib/onboardingBranding'
import { buildSellerSigningDocumentModel } from '../lib/sellerSigningPackDocumentModel'
import { PROPERTY_DISCLOSURE_QUESTIONS, normalizePropertyDisclosure, shouldPromptPropertyDisclosureComment } from '../lib/propertyDisclosure'
import { invokeEdgeFunction } from '../lib/supabaseClient'

const text = (value) => String(value || '').trim()
const documentLabels = { disclosure: 'Disclosure form', fica: 'FICA declaration', mandate: 'Mandate' }
const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback

function BrandMark({ branding }) {
  const [failed, setFailed] = useState(false)
  const name = branding.organisationName || 'Arch9'
  const logo = branding.logoDarkUrl || branding.logoLightUrl || branding.logoIconUrl
  if (logo && !failed) return <img src={logo} alt={`${name} logo`} className="max-h-12 max-w-[200px] object-contain object-left" onError={() => setFailed(true)} />
  return <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-white/15 px-3 text-sm font-bold tracking-wide text-white ring-1 ring-white/20">{getOnboardingBrandInitials(name)}</span>
}

function SellerQuestionnaire({ documentKey, disclosureResponses, ficaDetails, onDisclosureChange, onFicaChange }) {
  if (documentKey === 'disclosure') {
    return <section className="mt-5 space-y-4 rounded-xl border border-[#d6e5f0] bg-[#f8fbfd] p-4">
      <div><h3 className="font-bold text-[#28425c]">Complete the property disclosure</h3><p className="mt-1 text-sm leading-5 text-[#60748b]">Please answer every question. Your answers are included in the signed disclosure form.</p></div>
      {PROPERTY_DISCLOSURE_QUESTIONS.map((question) => {
        const response = disclosureResponses[question.key] || {}
        return <article key={question.key} className="rounded-xl border border-[#e0e8ef] bg-white p-4"><p className="font-semibold leading-5 text-[#28425c]">{question.number}. {question.text}</p><div className="mt-3 flex flex-wrap gap-3 text-sm text-[#334d66]">{['yes', 'no', 'unsure'].map((answer) => <label key={answer} className="inline-flex items-center gap-1.5"><input type="radio" name={`disclosure-${question.key}`} checked={response.answer === answer} onChange={() => onDisclosureChange(question.key, { ...response, answer })} />{answer[0].toUpperCase() + answer.slice(1)}</label>)}</div>{shouldPromptPropertyDisclosureComment(question, response.answer) ? <label className="mt-3 block text-sm font-semibold text-[#47627b]">Please provide details<textarea value={response.note || ''} onChange={(event) => onDisclosureChange(question.key, { ...response, note: event.target.value })} className="mt-1.5 min-h-20 w-full rounded-lg border border-[#cfdce8] p-2 font-normal outline-none focus:border-[var(--signing-primary)]" /></label> : null}</article>
      })}
    </section>
  }
  if (documentKey === 'fica') {
    return <section className="mt-5 rounded-xl border border-[#d6e5f0] bg-[#f8fbfd] p-4"><h3 className="font-bold text-[#28425c]">Complete your FICA declaration</h3><p className="mt-1 text-sm leading-5 text-[#60748b]">Confirm or add the outstanding details. Supporting documents can still be requested separately.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-[#47627b]">ID or passport number<input value={ficaDetails.idNumber || ''} onChange={(event) => onFicaChange('idNumber', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#cfdce8] px-3 py-2 font-normal outline-none focus:border-[var(--signing-primary)]" /></label><label className="text-sm font-semibold text-[#47627b]">Income tax number <span className="font-normal">(if available)</span><input value={ficaDetails.incomeTaxNumber || ''} onChange={(event) => onFicaChange('incomeTaxNumber', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#cfdce8] px-3 py-2 font-normal outline-none focus:border-[var(--signing-primary)]" /></label><label className="text-sm font-semibold text-[#47627b] sm:col-span-2">Residential or registered address<textarea value={ficaDetails.residentialAddress || ''} onChange={(event) => onFicaChange('residentialAddress', event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-[#cfdce8] p-2 font-normal outline-none focus:border-[var(--signing-primary)]" /></label></div></section>
  }
  return null
}

export default function ListingMandateSigning() {
  const { token = '' } = useParams()
  const [session, setSession] = useState(null)
  const [signedName, setSignedName] = useState('')
  const [signature, setSignature] = useState('')
  const [activeDocumentKey, setActiveDocumentKey] = useState('')
  const [acceptedDocuments, setAcceptedDocuments] = useState({})
  const [disclosureResponses, setDisclosureResponses] = useState({})
  const [ficaDetails, setFicaDetails] = useState({})
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
        setAcceptedDocuments(Object.fromEntries((nextSession?.selectedDocuments || []).map((key) => [key, false])))
        const pack = nextSession?.signingPack || {}
        setDisclosureResponses(normalizePropertyDisclosure(pack.disclosure || {}).responses || {})
        setFicaDetails({
          idNumber: text(pack?.seller?.idNumber),
          residentialAddress: text(pack?.seller?.residentialAddress || pack?.seller?.address),
          incomeTaxNumber: text(pack?.seller?.incomeTaxNumber || pack?.seller?.taxNumber),
        })
      }
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [token])

  async function submit(event) {
    event.preventDefault()
    setError('')
    const missingAcceptance = selectedDocuments.find((key) => acceptedDocuments[key] !== true)
    if (missingAcceptance || !text(signedName) || !text(signature)) { setError(missingAcceptance ? `Please review and accept the ${documentLabels[missingAcceptance] || 'document'} before signing.` : 'Enter your full name and signature before submitting.'); return }
    if (selectedDocuments.includes('disclosure') && PROPERTY_DISCLOSURE_QUESTIONS.some((question) => !text(disclosureResponses[question.key]?.answer))) { setError('Answer every property disclosure question before signing.'); return }
    if (selectedDocuments.includes('fica') && (!text(ficaDetails.idNumber) || !text(ficaDetails.residentialAddress))) { setError('Add your ID or passport number and residential or registered address before signing the FICA declaration.'); return }
    setSubmitting(true)
    const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'sign-pack', token, signedName, signature, acceptedDocuments, sellerResponses: { disclosure: { responses: disclosureResponses }, fica: ficaDetails } } })
    setSubmitting(false)
    if (result.error || result.data?.success === false) { setError(result.error?.message || result.data?.error || 'Unable to save your signature.'); return }
    if (result.data?.complete) setComplete({ groupComplete: result.data?.groupComplete === true })
  }

  const mandate = session?.mandate || {}
  const signingPack = session?.signingPack || { mandate }
  const branding = useMemo(() => resolveOnboardingBranding(mandate.branding), [mandate.branding])
  const theme = { '--signing-primary': validHex(branding.primaryColour, '#173f5f'), '--signing-secondary': validHex(branding.secondaryColour, '#102a43') }
  const selectedDocuments = Array.isArray(session?.selectedDocuments) ? session.selectedDocuments : ['mandate']
  const activeDocumentLabel = documentLabels[activeDocumentKey] || 'Document'
  const activeDocument = buildSellerSigningDocumentModel(signingPack, activeDocumentKey)
  const agencyName = branding.organisationName || 'Arch9'
  const commissionLabel = text(mandate.commissionBasis).toLowerCase() === 'fixed'
    ? (text(mandate.commissionAmount) ? `R ${Number(mandate.commissionAmount).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}` : 'As agreed')
    : (text(mandate.commissionPercentage) ? `${text(mandate.commissionPercentage)}%` : 'As agreed')

  return <main className="min-h-screen bg-[#edf3f7] text-[#172334]" style={theme}>
    <div className="min-h-[250px] bg-[linear-gradient(118deg,var(--signing-secondary),var(--signing-primary))] px-4 pb-20 pt-6 sm:px-6 sm:pt-9">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4"><BrandMark branding={branding} /><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15"><LockKeyhole size={14} /> Secure signing</span></header>
      <div className="mx-auto mt-10 max-w-3xl !text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] !text-white/75">Seller document centre</p><h1 className="mt-3 !text-white text-3xl font-bold tracking-tight sm:text-4xl">Review and sign your documents.</h1><p className="mt-3 max-w-xl !text-white/85 text-sm leading-6">{agencyName} has prepared these documents securely for your property.</p></div>
    </div>
    <section className="mx-auto -mt-10 max-w-3xl px-4 pb-10 sm:px-6 sm:pb-16"><div className="overflow-hidden rounded-[24px] bg-white shadow-[0_18px_55px_rgba(16,42,67,0.16)] ring-1 ring-[#dbe6ef]">
      {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-[var(--signing-primary)]" size={28} /></div> : error && !session ? <div className="m-6 rounded-2xl border border-[#f1c5be] bg-[#fff6f4] p-5 text-sm leading-6 text-[#9d3427]">{error}</div> : complete ? <div className="px-6 py-14 text-center sm:px-10"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eaf8ef] text-[#168044]"><CheckCircle2 size={34} /></span><h2 className="mt-5 text-2xl font-bold">Your documents are signed</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#60748b]">{complete.groupComplete ? 'Every required signer has completed the secure pack. The signed documents have been saved with this listing.' : 'Your signed documents have been saved. The pack remains open while the other required signer completes their secure link.'}</p></div> : <form onSubmit={submit}>
        <div className="border-b border-[#e7edf3] px-5 py-5 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#1c3147]">Your signing pack</p><p className="mt-1 text-sm text-[#64778c]">Review each document below, then sign the complete pack once at the end.</p></div><span className="rounded-full bg-[#edf7f1] px-3 py-1.5 text-xs font-bold text-[#187446]">{selectedDocuments.length} document{selectedDocuments.length === 1 ? '' : 's'} · one signature</span></div><div className="mt-5 grid gap-2 sm:grid-cols-3">{selectedDocuments.map((key, index) => {
          const signed = Boolean(session?.progress?.[key]); const active = key === activeDocumentKey
          return <button type="button" key={key} onClick={() => !signed && setActiveDocumentKey(key)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold transition ${signed ? 'border-[#bae0c8] bg-[#f0faf3] text-[#197849]' : active ? 'border-[var(--signing-primary)] bg-[#f5f9fc] text-[#173f5f] shadow-sm' : 'border-[#dce6ef] text-[#5f7287] hover:border-[#b9cbd9]'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${signed ? 'bg-[#1f9153] text-white' : active ? 'bg-[var(--signing-primary)] text-white' : 'bg-[#e8eef4] text-[#64778c]'}`}>{signed ? <Check size={14} /> : index + 1}</span><span>{documentLabels[key] || key}</span></button>
        })}</div></div>
        <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8"><div className="grid gap-3 rounded-2xl border border-[#dfe8f0] bg-[#f8fbfd] p-4 text-sm sm:grid-cols-2"><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Property</span><strong className="mt-1 block text-[#20374f]">{text(mandate.propertyAddress) || 'Property details'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Valid until</span><strong className="mt-1 block text-[#20374f]">{session?.expiresAt ? new Date(session.expiresAt).toLocaleDateString('en-ZA') : '—'}</strong></div>{selectedDocuments.includes('mandate') ? <><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Asking price</span><strong className="mt-1 block text-[#20374f]">{text(mandate.askingPrice) || 'As agreed'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Commission</span><strong className="mt-1 block text-[#20374f]">{commissionLabel} {text(mandate.vatHandling)}</strong></div></> : null}</div>
          <div className="rounded-2xl border border-[#dfe8f0] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5f9] text-[var(--signing-primary)]"><FileCheck2 size={20} /></span><div><h2 className="font-bold text-[#20374f]">{activeDocument.title || activeDocumentLabel}</h2><p className="mt-1 text-sm leading-6 text-[#60748b]">{activeDocument.introduction}</p></div></div><SellerQuestionnaire documentKey={activeDocumentKey} disclosureResponses={disclosureResponses} ficaDetails={ficaDetails} onDisclosureChange={(key, value) => setDisclosureResponses((current) => ({ ...current, [key]: value }))} onFicaChange={(key, value) => setFicaDetails((current) => ({ ...current, [key]: value }))} />{activeDocument.sections?.map((section) => <section key={section.title} className="mt-5 overflow-hidden rounded-xl border border-[#e0e8ef]"><h3 className="bg-[#f8fbfd] px-4 py-3 text-sm font-bold text-[#28425c]">{section.title}</h3><dl className="divide-y divide-[#e7edf3]">{section.rows.map((item) => <div key={item.label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(10rem,0.6fr)_1fr]"><dt className="font-semibold text-[#64778c]">{item.label}</dt><dd className="text-[#263d55]">{item.value}</dd></div>)}</dl></section>)}{activeDocument.questions ? <section className="mt-5 space-y-3">{activeDocument.questions.map((item) => <article key={item.question} className="rounded-xl border border-[#e0e8ef] p-4"><p className="font-semibold leading-5 text-[#28425c]">{item.question}</p><p className="mt-2 text-sm text-[#47627b]"><span className="font-semibold">Answer:</span> {item.answer}</p>{item.note ? <p className="mt-1 text-sm text-[#47627b]"><span className="font-semibold">Note:</span> {item.note}</p> : null}</article>)}</section> : null}<p className="mt-5 rounded-xl bg-[#f8fbfd] p-3 text-sm leading-5 text-[#334d66]">{activeDocument.declaration}</p><label className="mt-4 flex cursor-pointer gap-3 rounded-xl bg-[#f8fbfd] p-3 text-sm leading-5 text-[#334d66]"><input type="checkbox" checked={acceptedDocuments[activeDocumentKey] === true} onChange={(event) => setAcceptedDocuments((current) => ({ ...current, [activeDocumentKey]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--signing-primary)]" />I confirm that I have reviewed the {activeDocumentLabel.toLowerCase()} and consent to signing it electronically.</label></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-[#263d55]">Full legal name<input className="mt-2 w-full rounded-xl border border-[#cfdce8] bg-white px-3 py-3 font-normal text-[#172334] outline-none transition focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" value={signedName} onChange={(event) => setSignedName(event.target.value)} /></label><label className="block text-sm font-bold text-[#263d55]">Type your signature<input className="mt-2 w-full rounded-xl border border-[#cfdce8] bg-white px-3 py-3 font-normal italic text-[#172334] outline-none transition focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Your full name" /></label></div>
          {error ? <p className="rounded-xl border border-[#f1c5be] bg-[#fff6f4] p-3 text-sm text-[#9d3427]">{error}</p> : null}<button type="submit" disabled={submitting || !activeDocumentKey} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--signing-primary)] px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(16,42,67,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}{submitting ? 'Saving your signature…' : `Accept and sign all ${selectedDocuments.length} document${selectedDocuments.length === 1 ? '' : 's'}`}</button><p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-[#73869a]"><LockKeyhole size={13} /> Your single signature is applied to every document in this secure, time-limited pack.</p>
        </div>
      </form>}
    </div><p className="mt-5 text-center text-xs text-[#718397]">Powered by Arch9 · Secure property workflow</p></section>
  </main>
}
