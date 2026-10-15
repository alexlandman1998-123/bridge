import { useState } from 'react'

export default function RentalPortalDocumentList({ documents = [], onOpenDocument }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [readyUrl, setReadyUrl] = useState('')
  const open = async document => {
    if (busy || !document.available) return
    const popup = window.open('', '_blank')
    if (popup) popup.opener = null
    try {
      setBusy(document.id); setError(''); setReadyUrl('')
      const url = await onOpenDocument(document)
      if (new URL(url).protocol !== 'https:') throw new Error('This file could not be opened.')
      if (popup) popup.location.href = url
      else setReadyUrl(url)
    } catch (cause) { popup?.close(); setError(cause?.message || 'This file could not be opened.') }
    finally { setBusy('') }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Shared documents">
    <h2 className="text-lg font-semibold">Shared documents</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{documents.map(document => <article key={document.id} className="rounded-xl border border-slate-200 p-4">
      <p className="font-medium">{document.label || document.document_label || 'Property document'}</p>
      {document.unitLabel ? <p className="text-sm text-slate-600">{document.unitLabel}</p> : null}
      <p className="mt-1 text-sm text-slate-600">{String(document.category || 'Document').replaceAll('_', ' ')}</p>
      {document.available ? <button type="button" disabled={Boolean(busy)} onClick={() => void open(document)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy === document.id ? 'Opening…' : 'Open document'}</button> : <p className="mt-3 text-sm text-slate-600">The rental team has recorded this document. A downloadable copy has not been shared here.</p>}
    </article>)}</div>
    {!documents.length ? <p className="mt-3 text-sm text-slate-600">No documents have been shared yet.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {readyUrl ? <a href={readyUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block underline">Open saved file</a> : null}
  </section>
}
