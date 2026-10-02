import { useEffect, useState } from 'react'
import { listRentalApplicationScreeningChecks, recordRentalApplicationReview } from '../../../../services/rentals/rentalApplicationRepository.js'
import { RENTAL_REVIEW_CHECKS, rentalReviewSubjects, rentalApplicationIsReviewable } from '../../../../services/rentals/rentalApplicationReviewModel.js'
const STATUSES = ['not_started', 'in_progress', 'passed', 'needs_review', 'failed', 'expired']
const title = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export default function RentalApplicationScreeningPanel({ application, onSaved }) {
  const [checks, setChecks] = useState([])
  const [checkType, setCheckType] = useState('identity')
  const [subjectId, setSubjectId] = useState('primary')
  const [status, setStatus] = useState('not_started')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; setLoaded(false); listRentalApplicationScreeningChecks(application.id).then((items) => { if (active) { setChecks(items); setLoaded(true) } }).catch((cause) => { if (active) setError(cause.message) }); return () => { active = false } }, [application.id, application.version])
  useEffect(() => { const item = checks.find((row) => row.checkType === checkType)?.result?.subjects?.[subjectId]; setStatus(item?.status || 'not_started'); setEvidenceNote(item?.evidenceNote || ''); setExpiresAt(item?.expiresAt || '') }, [checks, checkType, subjectId])
  const subjects = rentalReviewSubjects(application.data, checkType)
  async function save(event) {
    event.preventDefault()
    if (saving) return
    try { setSaving(true); setError(''); await recordRentalApplicationReview({ applicationId: application.id, expectedVersion: application.version, command: 'screening', payload: { checkType, subjectId, status, evidenceNote, expiresAt } }); await onSaved() } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  const locked = !rentalApplicationIsReviewable(application)
  return <section className="rounded-2xl border border-[#e1eaf3] bg-white p-5"><h3 className="text-lg font-semibold text-[#142132]">Screening review</h3><p className="mt-1 text-sm text-[#60758b]">Record the evidence checked for each person. No external credit or identity check runs automatically.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{RENTAL_REVIEW_CHECKS.map((kind) => <button key={kind} type="button" aria-pressed={checkType === kind} onClick={() => { setCheckType(kind); setSubjectId(rentalReviewSubjects(application.data, kind)[0].id) }} className={`rounded-xl border p-3 text-left text-sm ${kind === checkType ? 'border-[#102d4a] bg-[#edf4fa]' : 'bg-white'}`}><b>{title(kind)}</b><span className="mt-1 block text-[#60758b]">{title(checks.find((item) => item.checkType === kind)?.status || 'not_started')}</span></button>)}</div><form onSubmit={save} className="mt-4 grid gap-4 rounded-xl bg-[#f8fbfe] p-4"><fieldset disabled={saving || locked || !loaded} className="grid gap-4 sm:grid-cols-2"><label className="form-field"><span>Person / entity</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="form-field"><span>Reviewer outcome</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label><label className="form-field sm:col-span-2"><span>Evidence / reviewer note</span><textarea required value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="min-h-24 rounded-lg border p-3" /></label><label className="form-field"><span>Evidence expiry (optional)</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label></fieldset>{!locked ? <button disabled={saving || !loaded || !evidenceNote.trim()} className="w-fit rounded-xl bg-[#176c50] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save screening check'}</button> : <p className="text-sm text-[#60758b]">{application.status === 'draft' ? 'Submit this application before screening.' : 'This application is locked.'}</p>}</form>{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}</section>
}
