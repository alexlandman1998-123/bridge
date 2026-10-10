import { useState } from 'react'
import { recruitmentDocumentAccept, recruitmentDocumentPack, recruitmentDocumentError } from './recruitmentDocumentsModel'
const input = 'mt-2 block w-full rounded-xl border border-[#dbe6f1] bg-white px-3 py-2 text-sm text-[#142132]'
export default function RecruitmentDocumentPack({ lead, busy, dirty, onUpload, onDownload, onSaveExceptions }) {
  const [waivers, setWaivers] = useState(() => lead.document_waivers_json || {}), [error, setError] = useState('')
  const editable = !!lead.application_submitted_at && !lead.approved_at && ['application_submitted', 'documents_uploaded', 'under_review'].includes(lead.status)
  return <section aria-label="Required application documents" className="space-y-4 text-[#20364c]">
    <p>Upload each required document, or record why it does not apply. Staff review the files and exceptions before approval.</p>
    {!lead.application_submitted_at && <p>Documents can be uploaded here once the application is submitted.</p>}
    {recruitmentDocumentPack(lead).map(item => <article key={item.type} className="rounded-xl border border-[#dbe7f2] p-4">
      <h3 className="font-semibold">{item.label}</h3>
      {item.files.map(file => <div key={file.path} className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="break-all text-sm">{file.name}</span><button className="text-sm font-semibold text-[#315b7a]" disabled={busy} type="button" onClick={() => onDownload(file)}>Download {file.name}</button></div>)}
      {editable && <label className="mt-4 block text-sm font-semibold">Upload {item.label}<input aria-label={`Upload ${item.label} manually`} className={input} type="file" accept={recruitmentDocumentAccept} disabled={busy || dirty} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; const invalid = recruitmentDocumentError(file); setError(invalid); if (!invalid) onUpload(file, item.type) }} /></label>}
      {!item.files.length && item.type !== 'Other' && <label className="mt-4 block text-sm font-semibold">Reason {item.label} does not apply<textarea className={input} rows={2} maxLength={2000} disabled={!editable || busy || dirty} value={waivers[item.type] || ''} onChange={event => setWaivers(previous => ({ ...previous, [item.type]: event.target.value }))} /></label>}
      {item.reason && item.files.length > 0 && <p className="mt-3 text-sm">Recorded exception: {item.reason}</p>}
    </article>)}
    {editable && <button type="button" className="rounded-xl bg-[#0f2743] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || dirty} onClick={() => {
      const reasons = Object.fromEntries(Object.entries(waivers).filter(([, value]) => value.trim()))
      if (Object.values(reasons).some(value => value.trim().length < 5)) { setError('Use at least five characters for each exception reason.'); return }
      setError(''); onSaveExceptions(reasons)
    }}>Save document exceptions</button>}
    <p className="text-xs text-[#60758b]">PDF, JPG or PNG · up to 10 MB per file.</p>{error && <p role="alert" className="text-sm text-[#9f3028]">{error}</p>}
  </section>
}
