import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { isRentalApplicantPortalReadyToSubmit } from '../../services/rentals/rentalApplicantPortalModel.js'
import { rentalApplicationSavedDocumentSlots, initialiseRentalApplicationWizard, isRentalEntityApplicant } from '../../services/rentals/rentalApplicationWizardModel.js'
import { uploadRentalApplicationFile } from '../../services/rentals/rentalApplicationFileUpload.js'
import RentalApplicationWizard from '../../modules/rentals/shared/applications/RentalApplicationWizard.jsx'
import RentalApplicationDocuments from '../../modules/rentals/shared/applications/RentalApplicationDocuments.jsx'
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
      if (!cancelled) { setApplication(result.application.status === 'draft' ? { ...result.application, data: initialiseRentalApplicationWizard(result.application.data) } : result.application); setDocuments(result.documents || []); setExpiresAt(result.expiresAt || ''); setRequestedChanges(result.requestedChanges || '') }
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
  const save = () => run(async () => { await persist(); setNotice('Draft saved. You can return using the same link before it expires.') })
  const upload = (file, slot) => run(async () => {
    const current = await persist()
    const savedSlot = rentalApplicationSavedDocumentSlots(current.data, current.requirements ?? null).find((item) => item.key === slot.key)
    if (!savedSlot?.requirementId) throw new Error('The saved checklist is unavailable. Reopen the application and retry.')
    const result = await uploadRentalApplicationFile(file, savedSlot, current.version, (body) => request('POST', body))
    setApplication(result.application); setDocuments((items) => [result.document, ...items]); setNotice(`${file.name} uploaded.`)
  })
  const submit = () => run(async () => {
    const current = await persist()
    const result = await request('PUT', { action: 'submit', version: current.version, declarationAccepted: declaration, consents: Object.keys(consents).filter((key) => consents[key]) })
    setApplication(result.application)
  })
  if (loading) return <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading application</span></main>
  if (!application) return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-bold">Application unavailable</h1><p className="mt-2 text-slate-600">{error}</p><p className="mt-4 text-sm text-slate-500">Contact your agent for a new link if this one has expired.</p></main>
  if (application.status !== 'draft') { const [title, message] = outcomes[application.status] || ['Application update', 'This application is no longer available for editing.']; return <main className="mx-auto max-w-xl p-6"><p className="text-sm font-semibold text-[#18704f]">Arch9 Rentals</p><h1 className="mt-2 text-2xl font-bold">{title}</h1><p className="mt-3 text-slate-600">{message}</p></main> }
  const ready = declaration && isRentalApplicantPortalReadyToSubmit({ data: application.data, documents, consents, requirements: dirty ? null : application.requirements ?? null })
  return <main className="mx-auto min-h-screen max-w-6xl space-y-5 bg-[#f5f8fb] p-4 sm:p-6"><header className="rounded-2xl bg-[#102d4a] p-5 text-white"><p className="text-xs font-semibold uppercase tracking-wider text-white/70">Arch9 Rentals</p><h1 className="mt-2 text-2xl font-semibold text-white">Rental application</h1><p className="mt-2 text-sm text-white/80">{application.data.property?.title || application.data.property?.address || 'Complete your application for the selected property.'}</p>{expiresAt ? <p className="mt-3 text-xs text-white/70">Link expires {new Date(expiresAt).toLocaleDateString('en-ZA')}. Save before leaving to resume later.</p> : null}</header>
    {requestedChanges ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><h2 className="font-semibold">Changes requested by your agent</h2><p className="mt-2 whitespace-pre-wrap">{requestedChanges}</p><p className="mt-2">Update your application and submit again for a fresh review.</p></section> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p> : null}
    <RentalApplicationWizard data={application.data} busy={busy} onChange={(data) => { setApplication((current) => ({ ...current, data })); setNotice(''); setDirty(true) }} onSave={save} documentsContent={<RentalApplicationDocuments data={application.data} documents={documents} requirements={application.requirements ?? null} preview={dirty} disabled={busy} onUpload={upload} />} declarationsContent={<div className="space-y-4 rounded-xl border border-[#dce7f2] p-4"><h4 className="font-semibold text-[#29435d]">Your declarations</h4>{consentTypes.map(([key, title]) => <label key={key} className="flex items-start gap-3 text-sm text-[#526b83]"><input type="checkbox" disabled={busy} checked={Boolean(consents[key])} onChange={(event) => setConsents((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" />{key === 'credit_check' && isRentalEntityApplicant(application.data) ? 'I am authorised to consent to credit and affordability checks on this entity for its rental application.' : title}</label>)}<label className="flex items-start gap-3 text-sm text-[#526b83]"><input type="checkbox" disabled={busy} checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} className="mt-1" />I confirm that these details are accurate, I am the primary applicant or authorised entity representative, and I have authority to submit this application. Each additional person’s consent evidence is supplied separately.</label><p className="text-xs text-[#60758b]">Submission locks this draft for review. Save your answers and complete every required document before submitting.</p><Button type="button" disabled={busy || !ready} onClick={() => void submit()}>Submit application</Button></div>} />
  </main>
}
