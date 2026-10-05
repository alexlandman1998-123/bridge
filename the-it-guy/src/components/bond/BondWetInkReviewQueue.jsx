import { useCallback, useEffect, useState } from 'react'
import { fetchBondWetInkReviewQueue, readBondWetInkReviewOriginal, reviewBondWetInkSignedCopy } from '../../lib/api.js'
import { downloadBondSigningBytes } from '../../services/bondWetInkSigningService.js'

const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50'
function SignedCopyReview({ item, onReviewed }) {
  const upload = item.uploads.find((entry) => entry.status === 'awaiting_review')
  const [checks, setChecks] = useState({ versionMatches: false, allPagesPresent: false, noAlterations: false, signers: [] })
  const [verified, setVerified] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signers = item.version.snapshot_json.signerManifest || []
  const earliest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.version.created_at))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const complete = verified && signers.length > 0 && checks.versionMatches && checks.allPagesPresent && checks.noAlterations && signers.every((signer) => {
    const evidence = checks.signers.find((entry) => entry.participantKey === signer.participantKey)
    return evidence?.signaturePresent && evidence.identityChecked && evidence.signedDate >= earliest && evidence.signedDate <= today
  })
  function updateSigner(key, field, value) {
    setChecks((current) => ({ ...current, signers: [...current.signers.filter((entry) => entry.participantKey !== key), { ...current.signers.find((entry) => entry.participantKey === key), participantKey: key, [field]: value }] }))
  }
  async function run(action) {
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure.message || 'Review could not be saved.') } finally { setBusy(false) }
  }
  if (!upload) return null
  return <article className="space-y-4 rounded-xl border p-4">
    <div><h3 className="font-semibold">{signers.map((signer) => signer.fullName).join(' and ')}</h3><p className="mt-1 text-sm text-[#60758d]">{item.version.snapshot_json.reviewedVersion.reference} · {upload.file_name}</p></div>
    <button type="button" className={button} disabled={busy} onClick={() => void run(async () => { const bytes = await readBondWetInkReviewOriginal(upload); downloadBondSigningBytes(bytes, upload.file_name); setVerified(true) })}>Download original to review</button>
    <p className="text-sm text-[#60758d]">Compare the reference, every page and answers with the fixed application. Verify each applicant’s identity using your approved process. A download verifies file integrity; the checks below record your review.</p>
    {[['versionMatches', 'The application reference and version match'], ['allPagesPresent', 'Every application page is present and legible'], ['noAlterations', 'The answers and declaration wording have not been altered']].map(([key, label]) => <label className="flex items-start gap-3 text-sm" key={key}><input type="checkbox" disabled={busy} checked={checks[key]} onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}
    {signers.map((signer) => {
      const evidence = checks.signers.find((entry) => entry.participantKey === signer.participantKey) || {}
      return <fieldset key={signer.participantKey} className="space-y-3 rounded-xl border p-3 text-sm"><legend className="px-2 font-semibold">{signer.fullName}</legend>
        <p>{signer.email} · Identity: {signer.identityReference}</p>
        <label className="flex gap-3"><input type="checkbox" disabled={busy} checked={Boolean(evidence.signaturePresent)} onChange={(event) => updateSigner(signer.participantKey, 'signaturePresent', event.target.checked)} /> Signature present and required permissions confirmed</label>
        <label className="flex gap-3"><input type="checkbox" disabled={busy} checked={Boolean(evidence.identityChecked)} onChange={(event) => updateSigner(signer.participantKey, 'identityChecked', event.target.checked)} /> Applicant identity verified</label>
        <label className="block">Date written beside signature<input type="date" min={earliest} max={today} disabled={busy} value={evidence.signedDate || ''} onChange={(event) => updateSigner(signer.participantKey, 'signedDate', event.target.value)} className="ml-3 rounded border p-2" /></label>
        <label className="flex gap-3"><input type="checkbox" disabled={busy} checked={Boolean(evidence.marketingAccepted)} onChange={(event) => updateSigner(signer.participantKey, 'marketingAccepted', event.target.checked)} /> Applicant explicitly selected optional marketing permission on the signed copy</label>
        <label className="flex gap-3"><input type="checkbox" disabled={busy} checked={Boolean(evidence.firstHomeFinanceAccepted)} onChange={(event) => updateSigner(signer.participantKey, 'firstHomeFinanceAccepted', event.target.checked)} /> Applicant explicitly selected optional First Home Finance permission</label>
      </fieldset>
    })}
    <label className="block text-sm">Reason if a replacement is needed<textarea disabled={busy} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-2 block w-full rounded-xl border p-3" /></label>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !complete} className={`${button} bg-[#35546c] text-white`} onClick={() => void run(async () => { await reviewBondWetInkSignedCopy({ uploadId: upload.id, action: 'accepted', checks }); await onReviewed() })}>Accept signed original</button><button type="button" disabled={busy || !feedback.trim()} className={button} onClick={() => void run(async () => { await reviewBondWetInkSignedCopy({ uploadId: upload.id, action: 'rejected', feedback }); await onReviewed() })}>Request replacement</button></div>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
  </article>
}
export default function BondWetInkReviewQueue() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await fetchBondWetInkReviewQueue() || []) } catch { setError('Signed-copy reviews are unavailable. Refresh to retry; the signing service may not yet be enabled.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  return <section className="space-y-4 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Signed applications to review</h2><button type="button" className={button} disabled={loading} onClick={() => void load()}>Refresh signed copies</button></div>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : loading ? <p role="status">Loading signed copies…</p> : !items.length ? <p className="text-sm text-[#60758d]">No signed copies awaiting your review.</p> : null}
    {items.map((item) => <SignedCopyReview key={item.uploads.find((upload) => upload.status === 'awaiting_review')?.id || item.version.id} item={item} onReviewed={load} />)}
  </section>
}
