import { DOCUMENT_UPLOAD_HELP_TEXT } from '../../lib/documentUploadPolicy.js'
import { useState } from 'react'
import { DOCUMENT_UPLOAD_ACCEPT, validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import { transactionCaptureDocumentOptions } from '../../core/transactions/transactionCaptureDocuments.js'

export default function TransactionCaptureDocuments({ parties, financeType, entries, onChange, saved = false, busy = false, onRetry, sellerHasExistingBond = false }) {
  const [selected, setSelected] = useState('signed_otp')
  const [error, setError] = useState('')
  const options = transactionCaptureDocumentOptions(parties, financeType, sellerHasExistingBond)
  const selectedOption = options.find((option) => option.value === selected) || options[0]
  function addFiles(event) {
    const additions = []
    const errors = []
    for (const file of Array.from(event.target.files || [])) {
      try {
        validateDocumentUploadFile(file, { surface: 'internal_transaction' })
        additions.push({ ...selectedOption, id: crypto.randomUUID(), file, status: 'queued' })
      } catch (failure) { errors.push(`${file.name}: ${failure.message}`) }
    }
    onChange([...entries, ...additions])
    setError(errors.join(' '))
    event.target.value = ''
  }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" aria-label="Existing transaction documents">
    <h3 className="font-semibold text-slate-800">Existing documents</h3>
    <p className="text-sm text-slate-600">Add the files you already have, or continue and upload them later. Files are saved after the transaction is created. Received documents still need review.</p>
    {!saved ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Document for<select className="block w-full rounded-lg border p-2" value={selectedOption.value} onChange={(event) => setSelected(event.target.value)} disabled={busy}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="space-y-1 text-sm">Choose documents<input className="block w-full" type="file" title={DOCUMENT_UPLOAD_HELP_TEXT} multiple accept={DOCUMENT_UPLOAD_ACCEPT} onChange={addFiles} disabled={busy} /><span className="block text-xs font-normal text-slate-500">{DOCUMENT_UPLOAD_HELP_TEXT}</span>
      </label>
      
    </div> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <ul className="space-y-2">{entries.map((entry) => <li key={entry.id} className="rounded-lg border p-3 text-sm">
      <strong>{entry.file.name}</strong><p>{entry.label}</p><p role="status">{entry.status === 'queued' ? (saved ? 'Not uploaded — add from the transaction workspace after setup' : 'Ready to upload after creation') : entry.status === 'saved' ? `Saved${entry.needsMatching ? ' — match to the checklist in the document workspace' : ' — checklist processing queued'}` : entry.status === 'uploading' ? 'Uploading…' : entry.error}</p>
      {!saved ? <button type="button" className="mt-2 underline" disabled={busy} onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}>Remove {entry.file.name}</button> : null}
    </li>)}</ul>
    {saved && entries.some((entry) => entry.status === 'failed') ? <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 font-medium" onClick={onRetry}>Retry failed uploads</button> : null}
    {saved && entries.some((entry) => entry.status === 'failed') ? <p className="text-sm text-amber-800">The transaction is saved. Retry here before closing, or upload these files later from its document workspace.</p> : null}
  </section>
}
