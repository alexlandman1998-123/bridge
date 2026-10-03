import { useState } from 'react'
import { getRentalApplicationDocumentUrl, recordRentalApplicationReview } from '../../../../services/rentals/rentalApplicationRepository.js'
import { rentalApplicationSavedDocumentSlots } from '../../../../services/rentals/rentalApplicationWizardModel.js'
import { rentalReviewDocument, rentalApplicationIsReviewable } from '../../../../services/rentals/rentalApplicationReviewModel.js'
export default function RentalApplicationDocumentReviewPanel({ application, onSaved }) {
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function open(document) {
    try { setError(''); const url = await getRentalApplicationDocumentUrl(application.id, document.id); window.open(url, '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause.message) }
  }
  async function review(document, status) {
    if (busy) return
    try { setBusy(true); setError(''); await recordRentalApplicationReview({ applicationId: application.id, expectedVersion: application.version, command: 'review_document', payload: { documentId: document.id, status, note: notes[document.id] || '' } }); await onSaved(); setNotes((current) => ({ ...current, [document.id]: '' })) } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <div className="mt-4 grid gap-3 md:grid-cols-2">{rentalApplicationSavedDocumentSlots(application.data, application.requirements).map((slot) => {
    const doc = rentalReviewDocument(slot, application)
    return <section key={slot.key} className="min-w-0 rounded-xl border border-[#e1eaf3] p-4"><h3 className="font-semibold text-[#29435d]">{slot.title}</h3><p className="mt-1 text-xs text-[#60758b]">{slot.required ? 'Required' : 'Optional'} · {slot.saved ? slot.state : doc?.status || 'Missing'}</p>{doc ? <><button type="button" onClick={() => void open(doc)} className="mt-3 break-all text-left text-sm font-semibold text-[#315f8f] underline">Open {doc.name || slot.title}</button>{doc.review_note ? <p className="mt-2 text-sm text-[#60758b]">{doc.review_note} · {doc.reviewed_at ? new Date(doc.reviewed_at).toLocaleDateString() : ''}</p> : null}{rentalApplicationIsReviewable(application) ? <><label className="mt-3 block text-sm">Review note<textarea aria-label={`${slot.title} review note`} value={notes[doc.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [doc.id]: event.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label><div className="mt-2 flex gap-2">{['accepted', 'rejected'].map((status) => <button key={status} type="button" disabled={busy || !notes[doc.id]?.trim()} onClick={() => void review(doc, status)} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-[#29435d] disabled:opacity-50">{status === 'accepted' ? 'Accept' : 'Reject'}</button>)}</div></> : null}</> : null}</section>
  })}{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}</div>
}
