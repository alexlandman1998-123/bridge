import { Check, CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOnboardingBrandInitials, resolveOnboardingBranding } from '../lib/onboardingBranding'
import { buildSellerSigningDocumentModel } from '../lib/sellerSigningPackDocumentModel'
import { PROPERTY_DISCLOSURE_QUESTIONS, normalizePropertyDisclosure, shouldPromptPropertyDisclosureComment } from '../lib/propertyDisclosure'
import { invokeEdgeFunction } from '../lib/supabaseClient'

const text = (value) => String(value || '').trim()
const documentLabels = { disclosure: 'Disclosure form', fica: 'FICA declaration', mandate: 'Mandate' }
const documentOrder = ['fica', 'disclosure', 'mandate']
const orderDocuments = (value) => documentOrder.filter((key) => Array.isArray(value) && value.includes(key))
const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback
const splitPersonName = (value = '') => {
  const parts = text(value).split(/\s+/).filter(Boolean)
  return { firstName: parts.slice(0, -1).join(' ') || parts[0] || '', surname: parts.length > 1 ? parts.at(-1) || '' : '' }
}
const missingFicaDetails = (details = {}, seller = {}) => {
  const legalType = text(seller.legalType).toLowerCase()
  const naturalPerson = !['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate'].includes(legalType)
  return [
    naturalPerson && !text(details.firstName) && 'first name',
    naturalPerson && !text(details.surname) && 'surname',
    !text(details.idNumber) && 'ID or passport number',
    naturalPerson && !text(details.dateOfBirth) && 'date of birth',
    !text(details.residentialAddress) && 'residential or registered address',
  ].filter(Boolean)
}

function signingHeaderLogoCandidates(branding = {}) {
  return [branding.logoDarkUrl, branding.logoLightUrl, branding.logoIconUrl]
    .map(text)
    .filter((url, index, values) => url && values.indexOf(url) === index)
}

function BrandMark({ branding }) {
  const [failedLogos, setFailedLogos] = useState([])
  const name = branding.organisationName || 'Arch9'
  const logo = signingHeaderLogoCandidates(branding).find((candidate) => !failedLogos.includes(candidate))
  if (logo) {
    return <img
      src={logo}
      alt={`${name} logo`}
      className="max-h-12 max-w-[200px] object-contain object-left"
      onError={() => setFailedLogos((current) => current.includes(logo) ? current : [...current, logo])}
    />
  }
  return <span data-agency-brand="text-fallback" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-bold tracking-wide text-white ring-1 ring-white/20"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-xs">{getOnboardingBrandInitials(name)}</span><span className="max-w-[154px] truncate">{name}</span></span>
}

function signingStepLabel(key = '') {
  if (key === 'introduction') return 'Start'
  if (key === 'review') return 'Sign'
  if (key === 'fica') return 'FICA'
  if (key === 'mandate') return 'Mandate'
  if (key === 'disclosure') return 'Disclosure'
  return 'Review'
}

function SigningProgressRail({ stepKeys = [], activeStepIndex = 0 }) {
  return <nav aria-label="Signing progress" className="mt-6">
    <ol className="grid gap-0" style={{ gridTemplateColumns: `repeat(${Math.max(stepKeys.length, 1)}, minmax(0, 1fr))` }}>
      {stepKeys.map((key, index) => {
        const complete = index < activeStepIndex
        const active = index === activeStepIndex
        return <li key={key} aria-current={active ? 'step' : undefined} className="relative min-w-0">
          {index < stepKeys.length - 1 ? <span aria-hidden="true" className={`absolute left-1/2 right-0 top-4 h-0.5 ${complete ? 'bg-[#2a9b65]' : 'bg-[#dbe6ef]'}`} /> : null}
          <div className="relative flex flex-col items-center text-center">
            <span className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${complete ? 'border-[#2a9b65] bg-[#2a9b65] text-white' : active ? 'border-[var(--signing-primary)] bg-white text-[var(--signing-primary)] ring-4 ring-[rgba(23,63,95,0.12)]' : 'border-[#dbe6ef] bg-white text-[#7a8da1]'}`}>{complete ? <Check size={15} /> : index + 1}</span>
            <span className={`mt-2 block truncate px-1 text-[0.68rem] font-bold sm:text-xs ${active ? 'text-[#20374f]' : complete ? 'text-[#197849]' : 'text-[#71849a]'}`}>{signingStepLabel(key)}</span>
          </div>
        </li>
      })}
    </ol>
  </nav>
}

function DrawnSignaturePad({ value, onChange, signerName }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let cancelled = false
    const render = () => {
      if (cancelled) return
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width || 640)); const height = Math.max(160, Math.round(rect.height || 190)); const ratio = window.devicePixelRatio || 1
      canvas.width = width * ratio; canvas.height = height * ratio
      const context = canvas.getContext('2d'); if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.strokeStyle = '#172334'; context.lineWidth = 2.6; context.lineCap = 'round'; context.lineJoin = 'round'
      if (/^data:image\//.test(value || '')) { const image = new Image(); image.onload = () => { if (!cancelled) context.drawImage(image, 0, 0, width, height) }; image.src = value }
    }
    render(); window.addEventListener('resize', render)
    return () => { cancelled = true; window.removeEventListener('resize', render) }
  }, [value])

  const point = (event) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
  function begin(event) { const canvas = canvasRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return; canvas.setPointerCapture?.(event.pointerId); drawingRef.current = true; lastPointRef.current = point(event); context.beginPath(); context.moveTo(lastPointRef.current.x, lastPointRef.current.y) }
  function move(event) { if (!drawingRef.current) return; const context = canvasRef.current?.getContext('2d'); const previous = lastPointRef.current; if (!context || !previous) return; const next = point(event); context.quadraticCurveTo(previous.x, previous.y, (previous.x + next.x) / 2, (previous.y + next.y) / 2); context.stroke(); lastPointRef.current = next }
  function end(event) { const canvas = canvasRef.current; if (!canvas || !drawingRef.current) return; canvas.releasePointerCapture?.(event.pointerId); drawingRef.current = false; lastPointRef.current = null; onChange(canvas.toDataURL('image/png')) }
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-[#263d55]">Draw your signature{signerName ? `, ${signerName}` : ''}</p><p className="mt-1 text-xs leading-5 text-[#60748b]">Use a mouse, trackpad, or finger.</p></div><button type="button" onClick={() => onChange('')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfdce8] px-3 text-xs font-bold text-[#334d66]"><Trash2 size={14} />Clear</button></div><div className="mt-3 overflow-hidden rounded-xl border border-[#cfdce8] bg-white"><canvas ref={canvasRef} aria-label="Draw your signature" className="block h-44 w-full touch-none cursor-crosshair" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /></div></div>
}

function FicaField({ label, field, details, onChange, type = 'text', optional = false }) {
  return <label className="text-sm font-semibold text-[#47627b]">{label}{optional ? <span className="font-normal"> (if available)</span> : null}<input type={type} value={details[field] || ''} onChange={(event) => onChange(field, event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#cfdce8] bg-white px-3 py-2.5 font-normal text-[#172334] outline-none focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" /></label>
}

function SellerQuestionnaire({ documentKey, disclosureResponses, ficaDetails, onDisclosureChange, onFicaChange, isPrimaryDocumentContact }) {
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
    if (!isPrimaryDocumentContact) return <section className="mt-5 rounded-xl border border-[#d6e5f0] bg-[#f8fbfd] p-4"><h3 className="font-bold text-[#28425c]">FICA details are managed by the primary contact</h3><p className="mt-1 text-sm leading-5 text-[#60748b]">Review the shared FICA details shown below. If anything is incorrect, flag it for correction so the primary contact or agent can update the pack safely.</p></section>
    return <section className="mt-5 rounded-xl border border-[#d6e5f0] bg-[#f8fbfd] p-4 sm:p-5"><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#71849a]">Shared seller information</p><h3 className="mt-1 font-bold text-[#28425c]">Review and correct your FICA details</h3><p className="mt-1 text-sm leading-5 text-[#60748b]">These details came from seller onboarding. Saving changes updates the seller profile and this unsigned pack for every signer.</p></div><fieldset className="mt-5"><legend className="text-sm font-bold text-[#28425c]">Identity</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><FicaField label="First name" field="firstName" details={ficaDetails} onChange={onFicaChange} /><FicaField label="Surname" field="surname" details={ficaDetails} onChange={onFicaChange} /><FicaField label="ID or passport number" field="idNumber" details={ficaDetails} onChange={onFicaChange} /><FicaField label="Date of birth" field="dateOfBirth" details={ficaDetails} onChange={onFicaChange} type="date" /><FicaField label="Nationality" field="nationality" details={ficaDetails} onChange={onFicaChange} optional /><FicaField label="Country of residence" field="countryOfResidence" details={ficaDetails} onChange={onFicaChange} optional /></div></fieldset><fieldset className="mt-5 border-t border-[#dce6ef] pt-5"><legend className="text-sm font-bold text-[#28425c]">Contact details</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><FicaField label="Email address" field="email" details={ficaDetails} onChange={onFicaChange} type="email" /><FicaField label="Phone number" field="phone" details={ficaDetails} onChange={onFicaChange} type="tel" /><label className="text-sm font-semibold text-[#47627b] sm:col-span-2">Residential or registered address<textarea value={ficaDetails.residentialAddress || ''} onChange={(event) => onFicaChange('residentialAddress', event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-[#cfdce8] bg-white p-2.5 font-normal text-[#172334] outline-none focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" /></label></div></fieldset><fieldset className="mt-5 border-t border-[#dce6ef] pt-5"><legend className="text-sm font-bold text-[#28425c]">Tax and compliance</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><FicaField label="Income tax number" field="incomeTaxNumber" details={ficaDetails} onChange={onFicaChange} optional /><FicaField label="Occupation" field="occupation" details={ficaDetails} onChange={onFicaChange} optional /><label className="text-sm font-semibold text-[#47627b] sm:col-span-2">Source of funds <span className="font-normal">(if available)</span><input value={ficaDetails.sourceOfFunds || ''} onChange={(event) => onFicaChange('sourceOfFunds', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#cfdce8] bg-white px-3 py-2.5 font-normal text-[#172334] outline-none focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" /></label></div></fieldset></section>
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
  const [issue, setIssue] = useState('')
  const [issueReported, setIssueReported] = useState(false)

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
        const selected = orderDocuments(nextSession?.selectedDocuments)
        setActiveDocumentKey('introduction')
        setAcceptedDocuments(Object.fromEntries(selected.map((key) => [key, false])))
        const pack = nextSession?.signingPack || {}
        const seller = pack?.seller || {}
        const fallbackName = splitPersonName(seller.name || nextSession?.signerName)
        setDisclosureResponses(normalizePropertyDisclosure(pack.disclosure || {}).responses || {})
        setFicaDetails({
          firstName: text(seller.firstName || fallbackName.firstName),
          surname: text(seller.surname || fallbackName.surname),
          idNumber: text(seller.idNumber),
          dateOfBirth: text(seller.dateOfBirth),
          nationality: text(seller.nationality),
          countryOfResidence: text(seller.countryOfResidence),
          residentialAddress: text(seller.residentialAddress || seller.address),
          incomeTaxNumber: text(seller.incomeTaxNumber || seller.taxNumber),
          email: text(seller.email),
          phone: text(seller.phone),
          occupation: text(seller.occupation),
          sourceOfFunds: text(seller.sourceOfFunds),
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
    if (!isPrimaryDocumentContact && !session?.primaryDocumentContactSigned) { setError('The primary document contact must complete and sign the shared pack before you can sign.'); return }
    if (isPrimaryDocumentContact && selectedDocuments.includes('disclosure') && PROPERTY_DISCLOSURE_QUESTIONS.some((question) => !text(disclosureResponses[question.key]?.answer))) { setError('Answer every property disclosure question before signing.'); return }
    if (isPrimaryDocumentContact && selectedDocuments.includes('fica')) {
      const missing = missingFicaDetails(ficaDetails, signingPack.seller || {})
      if (missing.length) { setError(`Add ${missing.join(', ')} before signing the FICA declaration.`); return }
    }
    setSubmitting(true)
    const acceptancePayload = { acceptedDocuments }
    const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'sign-pack', token, signedName, signature, ...acceptancePayload, ...(isPrimaryDocumentContact ? { sellerResponses: { disclosure: { responses: disclosureResponses }, fica: ficaDetails } } : {}) } })
    setSubmitting(false)
    if (result.error || result.data?.success === false) { setError(result.error?.message || result.data?.error || 'Unable to save your signature.'); return }
    if (result.data?.complete) setComplete({ groupComplete: result.data?.groupComplete === true })
  }

  async function flagIssue() {
    if (text(issue).length < 5) { setError('Describe the issue so your agent can prepare a corrected pack.'); return }
    setSubmitting(true); setError('')
    const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'flag-issue', token, issue } })
    setSubmitting(false)
    if (result.error || result.data?.success === false) { setError(result.error?.message || result.data?.error || 'Unable to flag this issue.'); return }
    setIssueReported(true)
  }

  const mandate = session?.mandate || {}
  const signingPack = session?.signingPack || { mandate }
  const onboardingSource = signingPack?.onboardingSource || {}
  const branding = useMemo(() => resolveOnboardingBranding(signingPack.branding, resolveOnboardingBranding(mandate.branding)), [signingPack.branding, mandate.branding])
  const theme = { '--signing-primary': validHex(branding.primaryColour, '#173f5f'), '--signing-secondary': validHex(branding.secondaryColour, '#102a43') }
  const selectedDocuments = orderDocuments(session?.selectedDocuments)
  const isPrimaryDocumentContact = session?.isPrimaryDocumentContact !== false
  const primaryDocumentContactPending = !isPrimaryDocumentContact && session?.primaryDocumentContactSigned !== true
  const stepKeys = ['introduction', ...selectedDocuments, 'review']
  const activeStepIndex = Math.max(0, stepKeys.indexOf(activeDocumentKey))
  const activeDocumentLabel = documentLabels[activeDocumentKey] || 'Document'
  const activeDocument = buildSellerSigningDocumentModel(signingPack, activeDocumentKey)
  const agencyName = branding.organisationName || 'Arch9'
  const commissionLabel = text(mandate.commissionBasis).toLowerCase() === 'fixed'
    ? (text(mandate.commissionAmount) ? `R ${Number(mandate.commissionAmount).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}` : 'As agreed')
    : (text(mandate.commissionPercentage) ? `${text(mandate.commissionPercentage)}%` : 'As agreed')

  function validateDocument(documentKey) {
    if (isPrimaryDocumentContact && documentKey === 'disclosure' && PROPERTY_DISCLOSURE_QUESTIONS.some((question) => !text(disclosureResponses[question.key]?.answer))) {
      setError('Answer every property disclosure question before continuing.')
      return false
    }
    if (isPrimaryDocumentContact && documentKey === 'fica') {
      const missing = missingFicaDetails(ficaDetails, signingPack.seller || {})
      if (!missing.length) return true
      setError(`Add ${missing.join(', ')} before continuing.`)
      return false
    }
    if (documentKey !== 'introduction' && !acceptedDocuments[documentKey]) {
      setError(`Please confirm that you have reviewed the ${documentLabels[documentKey] || 'document'} before continuing.`)
      return false
    }
    return true
  }

  async function continueToNextStep() {
    setError('')
    if (!validateDocument(activeDocumentKey)) return
    if (isPrimaryDocumentContact && activeDocumentKey === 'fica') {
      const result = await invokeEdgeFunction('listing-mandate-signing', { body: { action: 'save-fica-details', token, sellerResponses: { fica: ficaDetails } } })
      if (result.error || result.data?.success === false) {
        setError(result.error?.message || result.data?.error || 'Seller details could not be saved. Please try again.')
        return
      }
      setSession((current) => current ? { ...current, signingPack: result.data.signingPack, signingPackDigest: result.data.signingPackDigest } : current)
    }
    setActiveDocumentKey(stepKeys[activeStepIndex + 1] || 'review')
  }

  return <main className="min-h-screen bg-[#edf3f7] text-[#172334]" style={theme}>
    <div className="min-h-[250px] bg-[linear-gradient(118deg,var(--signing-secondary),var(--signing-primary))] px-4 pb-20 pt-6 sm:px-6 sm:pt-9">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4"><BrandMark branding={branding} /><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15"><LockKeyhole size={14} /> Secure signing</span></header>
      <div className="mx-auto mt-10 max-w-3xl !text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] !text-white/75">Seller document centre</p><h1 className="mt-3 !text-white text-3xl font-bold tracking-tight sm:text-4xl">Review and sign your documents.</h1><p className="mt-3 max-w-xl !text-white/85 text-sm leading-6">{agencyName} has prepared these documents securely for your property.</p></div>
    </div>
    <section className="mx-auto -mt-10 max-w-3xl px-4 pb-10 sm:px-6 sm:pb-16"><div className="overflow-hidden rounded-[24px] bg-white shadow-[0_18px_55px_rgba(16,42,67,0.16)] ring-1 ring-[#dbe6ef]">
      {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-[var(--signing-primary)]" size={28} /></div> : error && !session ? <div className="m-6 rounded-2xl border border-[#f1c5be] bg-[#fff6f4] p-5 text-sm leading-6 text-[#9d3427]">{error}</div> : complete ? <div className="px-6 py-14 text-center sm:px-10"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#eaf8ef] text-[#168044]"><CheckCircle2 size={34} /></span><h2 className="mt-5 text-2xl font-bold">Your documents are signed</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#60748b]">{complete.groupComplete ? 'Every required signer has completed the secure pack. The signed documents have been saved with this listing.' : 'Your signed documents have been saved. The pack remains open while the other required signer completes their secure link.'}</p></div> : <form onSubmit={submit}>
        <div className="border-b border-[#e7edf3] px-5 py-5 sm:px-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#71849a]">Your signing journey</p><p className="mt-1 text-base font-bold text-[#1c3147]">Review your documents, then sign once.</p></div><span className="shrink-0 rounded-full bg-[#edf7f1] px-3 py-1.5 text-xs font-bold text-[#187446]">{selectedDocuments.length} docs</span></div><SigningProgressRail stepKeys={stepKeys} activeStepIndex={activeStepIndex} /></div>
        <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          {onboardingSource?.kind === 'seller_onboarding_submission' ? <div className="rounded-2xl border border-[#d6e5f0] bg-[#f8fbfd] p-4 text-sm leading-6 text-[#334d66]"><p className="font-bold text-[#20374f]">Your onboarding information is ready for confirmation</p><p className="mt-1">These FICA, ownership, property and disclosure details were captured in seller onboarding and frozen into this pack. Review them carefully; do not re-enter information unless the primary contact needs to correct a shared detail before signing.</p></div> : null}
          {primaryDocumentContactPending ? <div className="rounded-2xl border border-[#f2dfbd] bg-[#fff9ec] p-4 text-sm leading-6 text-[#7a5a17]">The primary document contact ({session?.primaryDocumentContactEmail || 'the selected seller'}) is completing the shared seller details. You can review the pack now; signing unlocks when they sign the final version.</div> : null}
          {!isPrimaryDocumentContact ? <section className="rounded-2xl border border-[#dfe8f0] bg-[#f8fbfd] p-4 text-sm"><p className="font-bold text-[#20374f]">Something needs correcting?</p><p className="mt-1 leading-5 text-[#60748b]">Flagging an issue pauses this pack for every signer. Your agent will prepare a replacement; nothing currently shown will be changed in place.</p>{issueReported ? <p className="mt-3 rounded-xl bg-[#eaf8ef] p-3 font-semibold text-[#187446]">Issue sent. This pack is now paused for correction.</p> : <><textarea value={issue} onChange={(event) => setIssue(event.target.value)} rows={3} placeholder="Describe what is incorrect" className="mt-3 w-full rounded-xl border border-[#cfdce8] bg-white p-3 text-[#172334]" /><button type="button" onClick={() => void flagIssue()} disabled={submitting} className="mt-3 rounded-xl border border-[#cfdce8] px-3 py-2 font-bold text-[#334d66] disabled:opacity-60">Flag issue for correction</button></>}</section> : null}
          {activeDocumentKey === 'introduction' ? <div className="rounded-2xl border border-[#dfe8f0] p-6"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5f9] text-[var(--signing-primary)]"><FileCheck2 size={22} /></span><h2 className="mt-4 text-xl font-bold text-[#20374f]">Before you begin</h2><p className="mt-2 text-sm leading-6 text-[#60748b]">You have {selectedDocuments.length} document{selectedDocuments.length === 1 ? '' : 's'} to complete for {text(mandate.propertyAddress) || 'your property'}. Each document is saved as part of one secure pack. At the end, you will review the pack and apply one electronic signature.</p><ol className="mt-5 space-y-3 text-sm text-[#334d66]">{selectedDocuments.map((key, index) => <li key={key} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--signing-primary)] text-xs font-bold text-white">{index + 1}</span><span><strong>{documentLabels[key]}</strong><br />Review the information and complete any required fields.</span></li>)}<li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--signing-primary)] text-xs font-bold text-white">{selectedDocuments.length + 1}</span><span><strong>Review and sign</strong><br />Confirm the completed pack and sign once.</span></li></ol></div> : activeDocumentKey === 'review' ? <><div className="rounded-2xl border border-[#dfe8f0] p-5"><h2 className="font-bold text-[#20374f]">Review and sign</h2><p className="mt-1 text-sm leading-6 text-[#60748b]">Your single signature will be applied to every document below.</p><ul className="mt-4 space-y-2">{selectedDocuments.map((key) => <li key={key} className="flex items-center gap-2 text-sm font-semibold text-[#334d66]"><Check size={16} className="text-[#197849]" />{documentLabels[key]} reviewed</li>)}</ul></div><label className="block text-sm font-bold text-[#263d55]">Full legal name<input className="mt-2 w-full rounded-xl border border-[#cfdce8] bg-white px-3 py-3 font-normal text-[#172334] outline-none transition focus:border-[var(--signing-primary)] focus:ring-2 focus:ring-[#dcebf4]" value={signedName} onChange={(event) => setSignedName(event.target.value)} /></label><DrawnSignaturePad value={signature} onChange={setSignature} signerName={signedName} /></> : <><div className="grid gap-3 rounded-2xl border border-[#dfe8f0] bg-[#f8fbfd] p-4 text-sm sm:grid-cols-2"><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Property</span><strong className="mt-1 block text-[#20374f]">{text(mandate.propertyAddress) || 'Property details'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Valid until</span><strong className="mt-1 block text-[#20374f]">{session?.expiresAt ? new Date(session.expiresAt).toLocaleDateString('en-ZA') : '—'}</strong></div>{selectedDocuments.includes('mandate') ? <><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Asking price</span><strong className="mt-1 block text-[#20374f]">{text(mandate.askingPrice) || 'As agreed'}</strong></div><div><span className="block text-[0.68rem] font-bold uppercase tracking-[.12em] text-[#788b9e]">Commission</span><strong className="mt-1 block text-[#20374f]">{commissionLabel} {text(mandate.vatHandling)}</strong></div></> : null}</div><div className="rounded-2xl border border-[#dfe8f0] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5f9] text-[var(--signing-primary)]"><FileCheck2 size={20} /></span><div><h2 className="font-bold text-[#20374f]">{activeDocument.title || activeDocumentLabel}</h2><p className="mt-1 text-sm leading-6 text-[#60748b]">{activeDocument.introduction}</p></div></div><SellerQuestionnaire documentKey={activeDocumentKey} disclosureResponses={disclosureResponses} ficaDetails={ficaDetails} onDisclosureChange={(key, value) => setDisclosureResponses((current) => ({ ...current, [key]: value }))} onFicaChange={(key, value) => setFicaDetails((current) => ({ ...current, [key]: value }))} isPrimaryDocumentContact={isPrimaryDocumentContact} />{activeDocument.sections?.map((section) => <section key={section.title} className="mt-5 overflow-hidden rounded-xl border border-[#e0e8ef]"><h3 className="bg-[#f8fbfd] px-4 py-3 text-sm font-bold text-[#28425c]">{section.title}</h3><dl className="divide-y divide-[#e7edf3]">{section.rows.map((item) => <div key={item.label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(10rem,0.6fr)_1fr]"><dt className="font-semibold text-[#64778c]">{item.label}</dt><dd className="text-[#263d55]">{item.value}</dd></div>)}</dl></section>)}{activeDocument.questions ? <section className="mt-5 space-y-3">{activeDocument.questions.map((item) => <article key={item.question} className="rounded-xl border border-[#e0e8ef] p-4"><p className="font-semibold leading-5 text-[#28425c]">{item.question}</p><p className="mt-2 text-sm text-[#47627b]"><span className="font-semibold">Answer:</span> {item.answer}</p>{item.note ? <p className="mt-1 text-sm text-[#47627b]"><span className="font-semibold">Note:</span> {item.note}</p> : null}</article>)}</section> : null}<p className="mt-5 rounded-xl bg-[#f8fbfd] p-3 text-sm leading-5 text-[#334d66]">{activeDocument.declaration}</p><label className="mt-4 flex cursor-pointer gap-3 rounded-xl bg-[#f8fbfd] p-3 text-sm leading-5 text-[#334d66]"><input type="checkbox" checked={acceptedDocuments[activeDocumentKey] === true} onChange={(event) => setAcceptedDocuments((current) => ({ ...current, [activeDocumentKey]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--signing-primary)]" />I confirm that I have reviewed the {activeDocumentLabel.toLowerCase()} and consent to signing it electronically.</label></div></>}
          {error ? <p className="rounded-xl border border-[#f1c5be] bg-[#fff6f4] p-3 text-sm text-[#9d3427]">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">{activeStepIndex > 0 ? <button type="button" onClick={() => { setError(''); setActiveDocumentKey(stepKeys[activeStepIndex - 1]) }} className="min-h-12 rounded-xl border border-[#cfdce8] px-4 text-sm font-bold text-[#334d66]">Back</button> : <span />}{activeDocumentKey === 'review' ? <button type="submit" disabled={submitting} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--signing-primary)] px-5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(16,42,67,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}{submitting ? 'Saving your signature…' : `Accept and sign all ${selectedDocuments.length} document${selectedDocuments.length === 1 ? '' : 's'}`}</button> : <button type="button" onClick={continueToNextStep} className="min-h-12 rounded-xl bg-[var(--signing-primary)] px-5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(16,42,67,0.2)]">{activeDocumentKey === 'introduction' ? 'Start documents' : 'Save and continue'}</button>}</div>
          {activeDocumentKey === 'review' ? <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-[#73869a]"><LockKeyhole size={13} /> Your single signature is applied to every document in this secure, time-limited pack.</p> : null}
        </div>
      </form>}
    </div></section>
  </main>
}
