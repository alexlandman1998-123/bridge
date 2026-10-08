import { useEffect, useRef, useState } from 'react'
import { FileText, ShieldCheck, Users } from 'lucide-react'
import { rentalListingDocumentProgress, rentalListingRequirementState } from '../../services/rentals/rentalListingDocumentMatrixModel.js'
import { downloadRentalListingDocument, getRentalListingDocumentUrl, reviewRentalListingDocument, uploadRentalListingRequirement } from '../../services/rentals/rentalListingDocumentActions.js'
import { RentalListingCollectionLinks, RentalListingRequirementControls } from './RentalListingDocumentControls.jsx'

const label = (value) => String(value || '').replaceAll('_', ' ')
const dateLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-ZA') : ''
const panelClass = 'overflow-hidden rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]'

function RequirementTable({ rows, kind, section, busy, blocked, onUpload, onOpen, onDownload, onReview }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead className="border-y border-[#edf1f6] bg-[#f6f9fc] text-xs font-semibold uppercase tracking-wide text-[#8195ac]">
        <tr><th scope="col" className="px-5 py-3">Document requirement</th><th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3">Status</th></tr>
      </thead>
      <tbody className="divide-y divide-[#edf1f6]">{rows.map((row) => <tr key={row.id}>
        <td className="px-5 py-4 align-top">
          <p className="text-sm font-semibold text-[#22374d]">{row.title}</p>
          <p className="mt-1 text-xs text-[#607387]">{row.mode === 'preview' ? 'Policy preview — pending confirmation' : row.required ? 'Required for approval' : 'Optional'}</p>
          {row.reason ? <p className="mt-2 max-w-xl text-xs text-[#607387]">{row.reason}</p> : null}
          {row.documents.length ? <ul className="mt-2 space-y-1 text-xs text-[#607387]">{row.documents.map((document) => <li key={document.id} className="break-words">{document.file_name || document.name || 'Uploaded file'} · {label(document.status)}</li>)}</ul> : <p className="mt-2 text-xs text-[#607387]">{row.purpose === 'signed_consent' && row.state === 'accepted' ? 'Personal permission recorded' : 'No current file'}</p>}
          {onUpload && (section.onboarding || section.application) ? <RentalListingRequirementControls key={`${row.id}:${row.generation}`} {...{ kind, section, row, busy, blocked, onUpload, onOpen, onDownload, onReview }} /> : null}
        </td>
        <td className="px-5 py-4 align-top text-sm text-[#607387]">{row.source}</td>
        <td className="px-5 py-4 align-top"><span className="inline-flex rounded-full border border-[#dbe4ef] bg-[#f8fbff] px-2.5 py-1 text-xs font-semibold capitalize text-[#48627f]">{label(rentalListingRequirementState(row))}</span></td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default function RentalListingDocumentsPanel({ snapshot, onRefresh }) {
  const [activeGroup, setActiveGroup] = useState('landlord')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const guard = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const matrix = snapshot?.documentMatrix || { landlords: [], tenants: [], issues: [] }
  const progress = rentalListingDocumentProgress(matrix)
  async function run(action, { mutation = false, restores = false, message = '' } = {}) {
    if (guard.current || (mutation && (blocked || !progress.available))) return false
    guard.current = true
    setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      await action()
      committed = mutation
      if (mutation) {
        const refreshed = await onRefresh()
        if (refreshed?.documentMatrix?.issues?.length || !refreshed?.documentMatrix) throw new Error('Some requirements could not be refreshed.')
      }
      if (mounted.current) { if (mutation || restores) setBlocked(false); setNotice(message) }
      return true
    } catch (cause) {
      if (mounted.current) {
        setError(`${committed ? 'Saved successfully, but the matrix could not refresh. ' : ''}${cause.message}`)
        if (mutation || restores) setBlocked(true)
      }
      return false
    } finally {
      guard.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const runMutation = (action, message) => run(action, { mutation: true, message })
  const runRead = (action) => run(action)
  const upload = (kind, section, row, files) => runMutation(() => uploadRentalListingRequirement(kind, section, row, files), `${files.length} file${files.length === 1 ? '' : 's'} uploaded. Current evidence refreshed.`)
  const review = (kind, section, document, outcome) => runMutation(() => reviewRentalListingDocument(kind, section, document, outcome), 'Evidence review recorded.')
  const open = (kind, section, document) => runRead(async () => {
    const preview = window.open('about:blank', '_blank')
    if (!preview) throw new Error('Allow pop-ups for this workspace to open the document, or use Download.')
    preview.opener = null
    try { preview.location.href = await getRentalListingDocumentUrl(kind, section, document) }
    catch (cause) { preview.close(); throw cause }
  })
  const download = (kind, section, document) => runRead(async () => { const url = await getRentalListingDocumentUrl(kind, section, document); await downloadRentalListingDocument(url, document.file_name || document.name) })
  const refresh = () => run(async () => {
    const result = await onRefresh()
    if (!result?.documentMatrix || result.documentMatrix.issues?.length) throw new Error('Some requirements are unavailable. Refresh before changing evidence.')
  }, { restores: true })
  const landlordCount = matrix.landlords.reduce((total, group) => total + group.rows.length, 0)
  const tenantCount = matrix.tenants.reduce((total, group) => total + group.rows.length, 0)
  const files = snapshot?.documents || []
  const fileError = snapshot?.issues?.includes('Documents')
  const groups = [
    { key: 'landlord', label: 'Landlord', count: landlordCount, title: 'Landlord Documents', icon: ShieldCheck, sections: matrix.landlords, empty: 'No saved landlord checklist is linked to this listing. Save the landlord discovery and link its portfolio property to prepare the matrix.' },
    { key: 'tenant', label: 'Tenant', count: tenantCount, title: 'Tenant Documents', icon: Users, sections: matrix.tenants, empty: 'No tenant application is linked to this listing yet.' },
    ...(files.length || fileError ? [{ key: 'files', label: 'Listing files', count: files.length, title: 'Other listing files', icon: FileText }] : []),
  ]
  const group = groups.find((item) => item.key === activeGroup) || groups[0]
  const Icon = group.icon
  return <section className="space-y-5">
    <section className={panelClass}>
      <header className="flex items-start gap-3 p-5">
        <div className="rounded-[14px] bg-[#eef5fc] p-3 text-[#1f4f78]"><FileText size={22} aria-hidden="true" /></div>
        <div><h2 className="text-xl font-semibold text-[#142132]">Rental Documents</h2><p className="mt-1 text-sm text-[#607387]">Saved requirements for the landlord, this property and each tenant application.</p></div>
        {onRefresh ? <button type="button" disabled={busy} className="ml-auto rounded-lg border px-3 py-2 text-sm text-[#315b7a] disabled:opacity-50" onClick={() => void refresh()}>Refresh matrix</button> : null}
      </header>
      {!snapshot ? <p role="status" className="px-5 pb-5 text-sm text-[#607387]">Loading saved document requirements…</p> : null}
      {snapshot ? progress.available && !blocked ? <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><strong>{progress.total ? `${progress.complete} / ${progress.total}` : 'No active requirements'}</strong><p className="text-sm text-[#607387]">required evidence accepted</p></div>
        <div className="rounded-xl border p-4"><strong>{progress.awaiting}</strong><p className="text-sm text-[#607387]">required evidence awaiting documents</p></div>
        <div className="rounded-xl border p-4"><strong>{progress.review}</strong><p className="text-sm text-[#607387]">requirements ready for review</p></div>
      </div> : <p className="px-5 pb-4 text-sm text-amber-800">Completion counts unavailable. Refresh the matrix before changing evidence.</p> : null}
      {progress.preview ? <p className="px-5 pb-4 text-xs text-[#607387]">{progress.preview} landlord policy preview requirements are excluded from completion counts.</p> : null}
      {error ? <p role="alert" className="px-5 pb-3 text-sm text-red-800">{error}{blocked ? ' Refresh the matrix before continuing.' : ''}</p> : null}
      {notice ? <p role="status" className="px-5 pb-3 text-sm text-emerald-800">{notice}</p> : null}
      {(matrix.issues || []).map((issue) => <p key={issue} role="alert" className="px-5 pb-3 text-sm text-red-800">{issue}</p>)}
      <div className="flex border-t border-[#edf1f6] px-5" role="tablist" aria-label="Rental document groups">
        {groups.map((item) => <button key={item.key} type="button" role="tab" id={`rental-documents-${item.key}-tab`} aria-controls="rental-documents-panel" aria-selected={group.key === item.key} onClick={() => setActiveGroup(item.key)} className={`flex items-center gap-2 border-b-2 px-3 py-4 text-sm font-semibold ${group.key === item.key ? 'border-[#3179a8] text-[#245377]' : 'border-transparent text-[#6b7d93] hover:text-[#245377]'}`}><span>{item.label}</span>{snapshot ? <span className="rounded-full bg-[#f0f5fa] px-2 py-1 text-xs text-[#6b7d93]">{item.count}</span> : null}</button>)}
      </div>
    </section>
    {snapshot ? <section id="rental-documents-panel" role="tabpanel" aria-labelledby={`rental-documents-${group.key}-tab`} className={panelClass}>
      <header className="flex items-center gap-3 p-5"><Icon size={20} className="text-[#1f4f78]" aria-hidden="true" /><h3 className="text-base font-semibold text-[#142132]">{group.title}</h3></header>
      {group.key === 'files' ? <div className="space-y-3 px-5 pb-5">
        <p className="text-sm text-[#607387]">Files attached directly to this listing. Their presence does not fulfil a saved requirement.</p>
        {fileError ? <p role="alert" className="text-sm text-red-800">Listing files could not be loaded. Refresh to retry.</p> : null}
        {files.map((document, index) => <p key={document.id || index} className="break-words text-sm text-[#22374d]">{document.name || document.file_name || document.label || document.document_type || 'Listing document'} · {label(document.status || 'On file')}</p>)}
      </div> : group.sections.length ? group.sections.map((section) => <section key={section.id} className="border-t border-[#edf1f6]">
        <header className="px-5 py-4"><h4 className="font-semibold text-[#22374d]">{section.title}</h4><p className="mt-1 break-words text-xs capitalize text-[#607387]">{group.key === 'tenant' ? ['Application', label(section.status), dateLabel(section.date)].filter(Boolean).join(' · ') : 'Reusable landlord evidence and this property’s requirements'}</p></header>
        {section.manualReviewReason ? <p className="px-5 pb-4 text-sm text-amber-800">{section.manualReviewReason}</p> : null}
        {group.key === 'landlord' && section.propertyLinked === false ? <p className="px-5 pb-4 text-sm text-amber-800">Link this listing to its portfolio property in the landlord workspace to display its disclosure and mandate requirements.</p> : null}
        {section.rows.length ? <RequirementTable rows={section.rows} kind={group.key} section={section} busy={busy} blocked={blocked || !progress.available} onUpload={onRefresh ? upload : null} onOpen={open} onDownload={download} onReview={review} /> : <p className="px-5 pb-5 text-sm text-[#607387]">No saved requirements yet. Save the discovery answers in this {group.key === 'tenant' ? 'application' : 'landlord workspace'} to prepare the checklist.</p>}
        {onRefresh && (section.onboarding || section.application) ? <RentalListingCollectionLinks key={`${group.key}:${section.id}`} kind={group.key} section={section} busy={busy} blocked={blocked || !progress.available} runMutation={runMutation} runRead={runRead} /> : null}
      </section>) : <p className="px-5 pb-5 text-sm text-[#607387]">{matrix.issues.length ? 'Some requirements are unavailable. Refresh before relying on this matrix.' : group.empty}</p>}
    </section> : null}
  </section>
}
