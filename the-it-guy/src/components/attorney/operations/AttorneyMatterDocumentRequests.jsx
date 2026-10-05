import { useState } from 'react'
import Button from '../../ui/Button'
import { ATTORNEY_REQUEST_STATES } from '../../../services/documents/attorneyDocumentRequestModel.js'

const tone = { requested: 'border-amber-200 bg-amber-50 text-amber-900', pending_review: 'border-sky-200 bg-sky-50 text-sky-900', rejected: 'border-rose-200 bg-rose-50 text-rose-900', completed: 'border-emerald-200 bg-emerald-50 text-emerald-900', cancelled: 'border-slate-200 bg-slate-50 text-slate-600' }
const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
const visibilityLabel = value => ({ client_visible: 'Client visible', internal_only: 'Internal', shared_role_players: 'Professional role players' }[value] || label(value))

export default function AttorneyMatterDocumentRequests({ rows = [], onUpload, onReview, onOpen, canUpload = () => false, canReview = () => false }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [opening, setOpening] = useState('')
  const [accessError, setAccessError] = useState('')
  const shown = rows.filter(row => (filter === 'all' || row.status === filter) && `${row.displayName} ${row.requestedFrom} ${row.notes}`.toLowerCase().includes(search.trim().toLowerCase()))
  async function open(row) {
    setOpening(row.id)
    setAccessError('')
    try { await onOpen?.(row) } catch (error) { setAccessError(error?.message || 'Unable to open the received document.') }
    finally { setOpening('') }
  }
  return (
    <section aria-label="Document requests and reviews" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_auto]">
        <div><h3 className="text-base font-semibold text-slate-950">Document requests and reviews</h3><p className="mt-1 text-xs text-slate-600">Track the requested file, review it, and return it for correction when needed.</p></div>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Search requests<input type="search" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Request status">
          {ATTORNEY_REQUEST_STATES.map(option => <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${filter === option.key ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}>{option.label} ({option.key === 'all' ? rows.length : rows.filter(row => row.status === option.key).length})</button>)}
        </div>
      </header>
      {accessError ? <p role="alert" className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{accessError}</p> : null}
      <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
        {shown.map(row => <article key={row.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-semibold text-slate-950">{row.displayName}</h4><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone[row.status]}`}>{row.statusLabel}</span>{row.overdue ? <span className="text-xs font-semibold text-rose-800">Overdue</span> : null}</div>
            <p className="mt-1 text-xs text-slate-600">{label(row.requestedFrom)} · {visibilityLabel(row.visibility)}{row.dueDate ? ` · Due ${row.dueDate}` : ''}{row.priority === 'urgent' || row.priority === 'required' ? ' · Urgent' : ''}</p>
            <p className="mt-1 text-xs text-slate-500">{row.canonicalRequirementInstanceId ? 'Linked to a checklist requirement' : 'Additional supporting document'}{row.document?.name ? ` · Received: ${row.document.name}` : ''}</p>
            {row.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{row.notes}</p> : null}
            {row.correctionReason ? <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-rose-50 p-2 text-sm text-rose-900"><strong>Correction required: </strong>{row.correctionReason}</p> : null}
            {row.stale ? <p className="mt-2 text-xs text-amber-900">The checklist file has changed. Refresh the matter and review the current file.</p> : null}
            {row.documentId && !row.hasFile ? <p className="mt-2 text-xs text-amber-900">The received file could not be loaded. Refresh the documents before reviewing it.</p> : null}
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
            {row.hasFile && onOpen ? <Button type="button" variant="secondary" size="sm" disabled={Boolean(opening)} onClick={() => void open(row)}>{opening === row.id ? 'Opening…' : 'Open file'}</Button> : null}
            {row.canReview && canReview(row) && onReview ? <><Button type="button" size="sm" onClick={() => onReview('approve', row)}>Approve</Button><Button type="button" variant="secondary" size="sm" onClick={() => onReview('reject', row)}>Request correction</Button></> : null}
            {row.status !== 'cancelled' && canUpload(row) && onUpload ? <Button type="button" variant="secondary" size="sm" onClick={() => onUpload(row)}>{row.documentId ? 'Upload replacement' : 'Upload received file'}</Button> : null}
          </div>
        </article>)}
        {!shown.length ? <p className="p-6 text-sm text-slate-500">{rows.length ? 'No requests match this view.' : 'No document requests yet. Use Request Document to ask for checklist evidence or an additional file.'}</p> : null}
      </div>
    </section>
  )
}
