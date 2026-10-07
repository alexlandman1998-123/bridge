import { ClipboardCheck, Loader2, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import PremiumOnboardingLanding from '../../components/onboarding/PremiumOnboardingLanding.jsx'
import './rental-applicant-onboarding.css'
import { resolveOnboardingBranding } from '../../lib/onboardingBranding.js'
import { isRentalContextConfirmed, rentalApplicationFeeLabel } from '../../services/rentals/rentalApplicationCostModel.js'
import { isRentalApplicantPortalReadyToSubmit, rentalApplicationReadinessStages } from '../../services/rentals/rentalApplicantPortalModel.js'
import { rentalApplicationSavedDocumentSlots, initialiseRentalApplicationWizard, isRentalEntityApplicant } from '../../services/rentals/rentalApplicationWizardModel.js'
import { uploadRentalApplicationFile } from '../../services/rentals/rentalApplicationFileUpload.js'
import RentalApplicationWizard from '../../modules/rentals/shared/applications/RentalApplicationWizard.jsx'
import RentalApplicationDocuments from '../../modules/rentals/shared/applications/RentalApplicationDocuments.jsx'
function applicationTheme(branding) {
  const colour = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : /^#[0-9a-f]{3}$/i.test(value || '') ? `#${value.slice(1).split('').map((character) => character + character).join('')}` : fallback
  const primary = colour(branding.primaryColour, '#002b62')
  const action = colour(branding.accentColour, primary)
  const rgb = [1, 3, 5].map((index) => parseInt(action.slice(index, index + 2), 16))
  const actionText = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 >= 150 ? '#142033' : '#ffffff'
  return { '--buyer-brand-primary': primary, '--buyer-brand-action': action, '--buyer-brand-action-text': actionText, '--buyer-brand-action-border': `rgba(${rgb.join(',')},0.5)`, '--buyer-brand-action-soft': `rgba(${rgb.join(',')},0.12)`, '--buyer-brand-action-softer': `rgba(${rgb.join(',')},0.07)` }
}
const consentTypes = [['privacy', 'I consent to processing my personal information for this rental application.'], ['credit_check', 'I consent to credit and affordability checks on me.'], ['identity_verification', 'I consent to verification of my identity.']]
const outcomes = { submitted: ['Application submitted', 'The rentals team will review your application.'], under_review: ['Application under review', 'The rentals team is reviewing your application.'], approved: ['Application approved', 'The rentals team will contact you about the next steps.'], declined: ['Application outcome', 'Unfortunately, your application was not successful on this occasion.'], withdrawn: ['Application withdrawn', 'This application has been withdrawn.'] }
export default function RentalApplicantJourneyPage() {
  const { token = '' } = useParams()
  return <ApplicantOnboardingJourney key={token} token={token} />
}
function ApplicantOnboardingJourney({ token }) {
  const [application, setApplication] = useState(null); const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false)
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [expiresAt, setExpiresAt] = useState('')
  const [requestedChanges, setRequestedChanges] = useState('')
  const [dirty, setDirty] = useState(false)
  const [landingDismissed, setLandingDismissed] = useState(false)
  const [branding, setBranding] = useState({})
  const [contextChecks, setContextChecks] = useState({})
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const [consents, setConsents] = useState({}); const [declaration, setDeclaration] = useState(false)
  const guard = useRef(false)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setApplication(null); setError(''); setConsents({}); setDeclaration(false); setDirty(false)
    fetch('/api/public/rental-application', { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to open application.')
      if (!cancelled) { setApplication(result.application.status === 'draft' ? { ...result.application, data: initialiseRentalApplicationWizard(result.application.data) } : result.application); setBranding(resolveOnboardingBranding(result.branding)); setConsents({ privacy: isRentalContextConfirmed(result.application) }); setDocuments(result.documents || []); setExpiresAt(result.expiresAt || ''); setRequestedChanges(result.requestedChanges || '') }
    }).catch((cause) => { if (!cancelled) setError(cause.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  async function request(method, body) {
    const response = await fetch('/api/public/rental-application', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to save application.'); return result
  }
  async function persist() {
    const result = await request('PATCH', { version: application.version, patch: application.data, upgradeSchema: true })
    setApplication(result.application); setDirty(false); return result.application
  }
  async function run(action) {
    if (guard.current) return false
    guard.current = true; setBusy(true); setError(''); setNotice('')
    try { await action(); return true } catch (cause) { setError(cause.message || 'Unable to save application. Your changes are retained.'); return false }
    finally { guard.current = false; setBusy(false) }
  }
  const confirmContext = () => run(async () => {
    const result = await request('PATCH', { action: 'confirm_context', version: application.version, propertyAccepted: contextChecks.property === true, costsAccepted: contextChecks.costs === true, privacyAccepted: contextChecks.privacy === true })
    setApplication({ ...result.application, data: initialiseRentalApplicationWizard(result.application.data) }); setConsents((current) => ({ ...current, privacy: true })); setNotice('Property, costs and privacy confirmation saved.')
  })
  const save = () => run(async () => { await persist(); setNotice('Draft saved. You can return using the same link before it expires.') })
  const openDocument = (document) => run(async () => { const result = await request('POST', { action: 'open_document', documentId: document.id }); window.open(result.url, '_blank', 'noopener,noreferrer') })
  const upload = (files, slot) => run(async () => {
    let current = application.status === 'draft' ? await persist() : application
    const selected = Array.isArray(files) ? files : [files]
    for (const [index, file] of selected.entries()) {
      const savedSlot = rentalApplicationSavedDocumentSlots(current.data, current.requirements ?? null).find((item) => item.key === slot.key)
      if (!savedSlot?.requirementId) throw new Error('The saved checklist is unavailable. Reopen the application and retry.')
      const result = await uploadRentalApplicationFile(file, { ...savedSlot, appendToPack: index > 0 }, current.version, (body) => request('POST', body))
      current = result.application
      setApplication(current); setDocuments((items) => [result.document, ...items]); setNotice(`${file.name} uploaded.`)
    }
  })
  const submit = () => run(async () => {
    const current = await persist()
    const result = await request('PUT', { action: 'submit', version: current.version, declarationAccepted: declaration, consents: Object.keys(consents).filter((key) => consents[key]) })
    setApplication(result.application)
  })
  if (loading) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading application</span></main>
  if (!application) return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-bold">Application unavailable</h1><p className="mt-2 text-slate-600">{error}</p><p className="mt-4 text-sm text-slate-500">Contact your agent for a new link if this one has expired.</p></main>
  if (application.portalType === 'person') return <main className="tenant-application-page mx-auto max-w-3xl space-y-5 p-6" style={applicationTheme(branding)}><p className="font-semibold">{branding.organisationName || 'Your rentals team'}</p><h1 className="text-2xl font-bold">{application.personName}: documents and permissions</h1><p className="text-sm text-slate-600">Provide your own evidence and permission for this rental application. This link expires {new Date(expiresAt).toLocaleDateString('en-ZA')}.</p>{error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}<dl className="rounded-xl border bg-white p-4 text-sm"><dt className="font-semibold">Your recorded details</dt><dd>{application.data.people?.[0]?.firstName} {application.data.people?.[0]?.lastName}</dd><dd>{application.data.people?.[0]?.identityNumber}</dd><dd>{application.data.people?.[0]?.email || application.data.people?.[0]?.phone}</dd><dd className="mt-2 text-xs text-slate-600">Contact your agent if these details need a correction.</dd></dl><section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">Your permissions</h2>{[['privacy','I acknowledge the privacy notice and consent to processing my information for this rental application.'],['identity','I permit verification of my identity.'],['screening','I permit the credit, affordability, employer and reference checks relevant to my role.'],['own','These are my own details and I am giving my own permission.']].map(([key,label]) => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={consents[key] === true} onChange={(event) => setConsents((values) => ({ ...values, [key]: event.target.checked }))} />{label}</label>)}<p className="text-xs text-slate-600">Your information is used to assess and administer this application. Contact your rentals team to correct information or discuss your permissions.</p><Button disabled={busy || !['privacy','identity','screening','own'].every((key) => consents[key])} onClick={() => void run(async () => { const result = await request('POST', { action: 'record_person_permission', version: application.version, privacyAccepted: true, identityAccepted: true, screeningAccepted: true, ownInformationAccepted: true }); setApplication(result.application); setNotice('Your permissions have been recorded.') })}>Record my permissions</Button></section><RentalApplicationDocuments data={application.data} documents={documents} requirements={application.requirements} afterSubmission disabled={busy} onUpload={upload} onUploadMany={upload} onOpen={openDocument} /></main>
  if (application.status !== 'draft') { const [title, message] = outcomes[application.status] || ['Application update', 'This application is no longer available for editing.']; return <main className="tenant-application-page mx-auto max-w-3xl p-6" style={applicationTheme(branding)}><p className="text-sm font-semibold text-[var(--buyer-brand-primary)]">{branding.organisationName || 'Your rentals team'}</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><p className="mt-3 text-slate-600">{message}</p>{Number(application.costs?.amount) > 0 ? <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Application fee: {rentalApplicationFeeLabel(application.costs)}</h2><p className="mt-2 text-sm">{application.feeDueAt ? 'Your application fee is now payable. Follow your rentals team’s payment instructions below.' : 'Your rentals team will confirm the payment arrangements.'}</p><p className="mt-3 whitespace-pre-wrap text-sm">{application.costs.paymentInstructions}</p><p className="mt-3 text-xs text-slate-500">Payment is not collected or confirmed through this form.</p></section> : <p className="mt-4 text-sm">No application fee.</p>}{['submitted', 'under_review'].includes(application.status) ? <section className="mt-6 space-y-4"><p className="rounded-xl bg-blue-50 p-4 text-sm">Your submitted answers are locked. Upload outstanding documents here, now or later using this same link before it expires. Your agent must accept the required documents and finish the checks before approving your application.{expiresAt ? ` This link expires ${new Date(expiresAt).toLocaleDateString('en-ZA')}.` : ''}</p><ApplicationReadiness application={{ ...application, documents }} />{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}{notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}<RentalApplicationDocuments data={application.data || {}} documents={documents} requirements={application.requirements ?? null} afterSubmission disabled={busy} onUpload={upload} onUploadMany={upload} onOpen={openDocument} /></section> : null}</main> }
  if (!landingDismissed) {
    const property = application.data.property || {}
    const propertyLabel = property.address || property.title || 'Your selected rental property'
    return <main className="min-h-screen overflow-x-hidden bg-[#001a3d]">
      <PremiumOnboardingLanding
        agencyName={branding.organisationName || 'Your property team'}
        agencyLogo={branding.logoDarkUrl || branding.logoLightUrl || branding.logoIconUrl || ''}
        primaryColour={branding.primaryColour}
        secondaryColour={branding.secondaryColour}
        accentColour={branding.accentColour}
        personName={application.data.identity?.firstName || ''}
        label="TENANT ONBOARDING"
        headlinePrefix="Let’s get your rental"
        headlineAccent="application started."
        subtext="A quick and easy tenant application to help us get the right details for your next home."
        ctaLabel="Start tenant onboarding"
        beforeStartTitle="A few details, captured once."
        beforeStartText="Have your identity and income details ready. You can submit your details first and upload supporting documents later using this link. Your agent will review your application and documents."
        contextRows={[
          { icon: MapPin, label: 'Property', value: propertyLabel },
          { icon: ClipboardCheck, label: 'Process', value: 'Tenant application and supporting documents' },
        ]}
        onStart={() => {
          setLandingDismissed(true)
          window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
        }}
      />
    </main>
  }
  const needsContext = Object.keys(application.costs || {}).length > 0 && !isRentalContextConfirmed(application)
  const ready = !needsContext && declaration && isRentalApplicantPortalReadyToSubmit({ data: application.data, documents, consents, requirements: dirty ? null : application.requirements ?? null })
  const agencyName = branding.organisationName || 'Your property team'
  const formLogo = branding.logoLightUrl || branding.logoDarkUrl || branding.logoIconUrl
  return <main className="tenant-application-page min-h-screen bg-[#f3f7fb] px-3 py-4 sm:px-6 sm:py-6" style={applicationTheme(branding)}><div className="mx-auto max-w-[1440px] space-y-5">
    <header className="overflow-hidden rounded-[28px] border border-[#dbe4ee] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] md:p-8">
      <div className="flex items-center gap-3">{formLogo ? <img src={formLogo} alt={`${agencyName} logo`} className="h-12 max-w-[220px] object-contain object-left md:h-16" /> : <span className="grid h-12 w-12 place-items-center rounded-[15px] bg-[var(--buyer-brand-action)] font-semibold text-[var(--buyer-brand-action-text)]">{agencyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}</span>}<span className="text-sm font-semibold text-[#20324a]">{agencyName}</span></div>
      <div className="mt-5 grid gap-5 md:grid-cols-[1.3fr_0.8fr] md:gap-8">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7f96]">Tenant onboarding</p><h1 className="mt-3 text-3xl font-semibold leading-tight text-[#132033] md:text-4xl">Rental application</h1><p className="mt-3 hidden max-w-2xl text-sm leading-6 text-[#556679] md:block">A guided application for your next home. Tell us about yourself and confirm your details for review. Add supporting documents now or return to upload them later.</p><div className="mt-4 hidden flex-wrap gap-2 md:flex">{['Guided questions', 'Save & continue later', 'Secure document uploads'].map((text) => <span key={text} className="rounded-full border border-[#dbe5ef] bg-white px-3 py-2 text-xs font-medium text-[#42566b]">{text}</span>)}</div></div>
        <aside className="rounded-[22px] border border-[#d9e4ee] bg-white p-4 md:p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a7f96]">At a glance</p><p className="mt-3 text-base font-semibold text-[#132033]">{application.data.property?.title || application.data.property?.address || 'Your selected property'}</p>{application.data.property?.monthlyRent ? <p className="mt-2 text-sm text-[#556679]">R {Number(application.data.property.monthlyRent).toLocaleString('en-ZA')} per month</p> : null}<p className="mt-3 text-xs leading-5 text-[#6a7f96]">{expiresAt ? `Your link expires ${new Date(expiresAt).toLocaleDateString('en-ZA')}. ` : ''}Save your draft to return using the same link.</p></aside>
      </div>
    </header>
    {requestedChanges ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-semibold">Changes requested by your agent</h2><p className="mt-2 whitespace-pre-wrap">{requestedChanges}</p><p className="mt-2">Update your application and submit again for a fresh review.</p></section> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p> : null}
    {needsContext ? <section className="mx-auto max-w-3xl rounded-[28px] border border-[#dbe4ee] bg-white p-5 md:p-8"><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Before you begin</p><h2 className="mt-3 text-2xl font-semibold">Confirm your property and application costs</h2><dl className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Property</dt><dd className="mt-1 font-semibold">{application.data.property?.title || 'Selected property'}</dd><dd className="text-sm">{application.data.property?.address}</dd></div><div><dt className="text-sm text-slate-500">Monthly rent</dt><dd className="mt-1 font-semibold">{application.data.property?.monthlyRent ? `R ${Number(application.data.property.monthlyRent).toLocaleString('en-ZA')}` : 'To be confirmed by your agent'}</dd></div><div><dt className="text-sm text-slate-500">Deposit</dt><dd className="mt-1">{application.data.property?.depositAmount != null ? `R ${Number(application.data.property.depositAmount).toLocaleString('en-ZA')}` : 'To be confirmed by your agent'}</dd></div><div><dt className="text-sm text-slate-500">Application fee</dt><dd className="mt-1 font-semibold">{rentalApplicationFeeLabel(application.costs)}</dd><dd className="text-sm">{Number(application.costs.amount) > 0 ? 'Payable after you submit your application.' : 'No payment is required for the application.'}</dd></div></dl><p className="mt-5 text-sm leading-6 text-slate-600">Your rentals team uses your personal information and documents to assess and administer this rental application. Credit and identity checks require your separate permission in the final review step. You can save your answers and return using this link.</p><div className="my-5 space-y-4">{[['property', 'I confirm this is the property I am applying for.'], ['costs', 'I acknowledge the rent, deposit information and application fee shown above.'], ['privacy', 'I consent to processing my personal information for this rental application.']].map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={Boolean(contextChecks[key])} onChange={(event) => setContextChecks((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><Button style={{ backgroundColor: 'var(--buyer-brand-action)', color: 'var(--buyer-brand-action-text)' }} disabled={busy || !contextChecks.property || !contextChecks.costs || !contextChecks.privacy} onClick={() => void confirmContext()}>Confirm and continue</Button></section> : <RentalApplicationWizard guided data={application.data} busy={busy} onChange={(data) => { setApplication((current) => ({ ...current, data })); setNotice(''); setDirty(true) }} onSave={save} documentsContent={<RentalApplicationDocuments data={application.data} documents={documents} requirements={application.requirements ?? null} preview={dirty} disabled={busy} onUpload={upload} onUploadMany={upload} onOpen={openDocument} />} declarationsContent={<div className="space-y-4 rounded-xl border border-[#dce7f2] p-4"><h4 className="font-semibold text-[#29435d]">Your declarations</h4><ApplicationReadiness application={{ ...application, documents, requirements: dirty ? undefined : application.requirements }} />{consentTypes.map(([key, title]) => <label key={key} className="flex items-start gap-3 text-sm text-[#526b83]"><input type="checkbox" disabled={busy} checked={Boolean(consents[key])} onChange={(event) => setConsents((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" />{key === 'credit_check' && isRentalEntityApplicant(application.data) ? 'I am authorised to consent to credit and affordability checks on this entity for its rental application.' : title}</label>)}<label className="flex items-start gap-3 text-sm text-[#526b83]"><input type="checkbox" disabled={busy} checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} className="mt-1" />I confirm that these details are accurate, I am the primary applicant or authorised entity representative, and I have authority to submit this application. Each additional person’s consent evidence is supplied separately.</label><p className="text-xs text-[#60758b]">Submission locks your answers and makes any application fee payable. You can submit now and upload outstanding documents later using this same link. Approval requires accepted documents and completed checks.</p><Button className="bg-[var(--buyer-brand-action)] text-[var(--buyer-brand-action-text)] hover:bg-[var(--buyer-brand-action)]" style={{ backgroundColor: 'var(--buyer-brand-action)', color: 'var(--buyer-brand-action-text)' }} type="button" disabled={busy || !ready} onClick={() => void submit()}>Submit application</Button></div>} />}
  </div></main>
}

function ApplicationReadiness({ application }) {
  const stages = rentalApplicationReadinessStages(application)
  return <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Details</dt><dd className="mt-1 text-sm font-semibold">{stages.details}</dd></div><div><dt className="text-xs text-slate-500">Documents</dt><dd className="mt-1 text-sm font-semibold">{stages.documents.uploaded}/{stages.documents.required} required received</dd></div><div><dt className="text-xs text-slate-500">Review</dt><dd className="mt-1 text-sm font-semibold">{stages.review}</dd></div></dl>
}
