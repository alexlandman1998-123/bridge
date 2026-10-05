import { useMemo, useState } from 'react'
import Button from '../../ui/Button'
import Field from '../../ui/Field'
import Modal from '../../ui/Modal'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../../lib/documentUploadPolicy.js'
import { ATTORNEY_DOCUMENT_VERSION_KINDS, buildAttorneyDocumentVersionGroups, buildAttorneyVersionUploadContext } from '../../../services/documents/attorneyDocumentVersionModel.js'

const kindLabel = kind => ATTORNEY_DOCUMENT_VERSION_KINDS.find(option => option.value === kind)?.label || 'Supporting evidence'
const requirementId = row => row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || row.id || ''

export default function AttorneyDocumentVersions({ documents = [], requirements = [], editableLanes = [], onSave, onOpen }) {
  const groups = useMemo(() => buildAttorneyDocumentVersionGroups({ documents, requirements }), [documents, requirements])
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [opening, setOpening] = useState('')
  const [search, setSearch] = useState('')
  const canEdit = document => editableLanes.some(lane => lane.laneKey === document.lane_key)
  function edit(document = null) {
    setError('')
    setProgress('')
    const context = document ? buildAttorneyVersionUploadContext(document) : {}
    setForm({ ...context, file: null, notes: '', attorneyLaneKey: context.attorneyLaneKey || editableLanes[0]?.laneKey || '',
      attorneyVersionKind: document?.attorney_version_kind || 'draft',
      canonicalRequirementInstanceId: context.canonicalRequirementInstanceId || '', documentType: context.documentType || '',
      visibilityScope: context.visibilityScope || 'internal', clientRecipientRole: context.clientRecipientRole || '',
    })
  }
  async function save(event) {
    event.preventDefault()
    if (!form?.file || busy) return
    setBusy(true)
    setError('')
    try {
      await onSave({ ...form, onProgress: update => setProgress(update.message) })
      setForm(null)
    } catch (saveError) { setError(saveError?.message || 'The document version could not be saved.') }
    finally { setBusy(false); setProgress('') }
  }
  async function open(document) {
    setOpening(document.id)
    setError('')
    try { await onOpen?.({ document }) } catch (openError) { setError(openError?.message || 'Unable to open this version.') }
    finally { setOpening('') }
  }
  const working = form && ['draft', 'final'].includes(form.attorneyVersionKind)
  const shown = groups.filter(group => `${group.title} ${group.laneKey} ${group.versions.map(version => version.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section aria-label="Drafting and document versions" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
      <div><h3 className="text-base font-semibold text-slate-950">Drafting and document versions</h3><p className="mt-1 max-w-xl text-xs text-slate-600">Prepare documents in Word or your firm’s templates. Upload each revision here, then upload the signed copy for evidence review.</p></div>
      {editableLanes.length > 0 && onSave ? <Button type="button" size="sm" onClick={() => edit()}>Upload draft</Button> : null}
      {groups.length ? <label className="grid w-full gap-1 text-xs font-semibold text-slate-600">Search versions<Field type="search" value={search} onChange={event => setSearch(event.target.value)} /></label> : null}
    </header>
    {error && !form ? <p role="alert" className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    <div className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
      {shown.map(group => <article key={group.id} className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h4 className="break-words text-sm font-semibold capitalize text-slate-950">{group.title}</h4><p className="mt-1 text-xs text-slate-600">{group.laneKey} · v{group.current.attorney_version_number} · {kindLabel(group.current.attorney_version_kind)}</p>{group.requirementId ? <p className="mt-1 text-xs text-slate-500">Exact checklist requirement retained across revisions</p> : null}</div>
          {canEdit(group.current) && onSave ? <Button type="button" variant="secondary" size="sm" onClick={() => edit(group.current)}>Upload next version</Button> : null}
        </div>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Version history ({group.versions.length})</summary>
          <ol className="mt-3 grid gap-3">{group.versions.map(version => <li key={version.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-slate-100 pt-2">
            <div className="min-w-0 flex-1"><p className="break-words text-sm text-slate-800">v{version.attorney_version_number} · {kindLabel(version.attorney_version_kind)} · {version.name}</p><p className="mt-1 text-xs text-slate-500">{version.id === group.current.id ? 'Latest revision · ' : ''}{version.id === group.activeEvidenceId ? 'Current checklist evidence · ' : ''}{version.review_status ? `${version.review_status} · ` : ''}{version.created_at ? new Date(version.created_at).toLocaleString() : ''}</p>{version.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600">{version.notes}</p> : null}</div>
            {onOpen ? <Button type="button" size="sm" variant="secondary" disabled={Boolean(opening)} onClick={() => void open(version)}>{opening === version.id ? 'Opening…' : 'Open version'}</Button> : null}
          </li>)}</ol>
        </details>
      </article>)}
      {!shown.length ? <p className="p-6 text-sm text-slate-500">{groups.length ? 'No versions match this search.' : 'Upload a working draft to start a document history. Drafts and unsigned copies stay internal and do not complete checklist requirements.'}</p> : null}
    </div>
    <Modal open={Boolean(form)} onClose={busy ? undefined : () => setForm(null)} title={form?.attorneyPreviousVersionId ? 'Upload next document version' : 'Upload drafting document'} className="max-w-2xl">
      {form ? <form onSubmit={save} className="grid gap-4">
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          <label className="grid gap-1 text-sm font-medium">File<Field type="file" accept={DOCUMENT_UPLOAD_ACCEPT} required onChange={event => setForm(previous => ({ ...previous, file: event.target.files?.[0] || null }))} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Version type<Field as="select" value={form.attorneyVersionKind} onChange={event => setForm(previous => ({ ...previous, attorneyVersionKind: event.target.value }))}>{ATTORNEY_DOCUMENT_VERSION_KINDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Field></label>
            <label className="grid gap-1 text-sm font-medium">Attorney workflow<Field as="select" disabled={Boolean(form.attorneyPreviousVersionId)} value={form.attorneyLaneKey} onChange={event => setForm(previous => ({ ...previous, attorneyLaneKey: event.target.value }))}>{editableLanes.map(lane => <option key={lane.laneKey} value={lane.laneKey}>{lane.label || lane.laneKey}</option>)}</Field></label>
          </div>
          <label className="grid gap-1 text-sm font-medium">Intended checklist requirement<Field as="select" disabled={Boolean(form.attorneyPreviousVersionId)} value={form.canonicalRequirementInstanceId} onChange={event => {
            const requirement = requirements.find(row => requirementId(row) === event.target.value)
            setForm(previous => ({ ...previous, canonicalRequirementInstanceId: event.target.value, documentType: requirement?.key || requirement?.documentType || previous.documentType }))
          }}><option value="">General drafting document</option>{requirements.map(row => <option key={requirementId(row)} value={requirementId(row)}>{row.label || row.displayName || row.key}{row.requiredParty || row.partyName ? ` — ${row.partyName || row.requiredParty}` : ''}</option>)}</Field></label>
          <label className="grid gap-1 text-sm font-medium">Document type<Field required value={form.documentType} readOnly={Boolean(form.attorneyPreviousVersionId || form.canonicalRequirementInstanceId)} placeholder="e.g. power of attorney" onChange={event => setForm(previous => ({ ...previous, documentType: event.target.value }))} /></label>
          {working ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This unsigned copy stays internal. The current checklist evidence and its review remain in place.</p> : <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Visibility<Field as="select" value={form.visibilityScope} onChange={event => setForm(previous => ({ ...previous, visibilityScope: event.target.value }))}><option value="internal">Internal</option><option value="professional_shared">Professional role players</option><option value="client">Client portal</option></Field></label>
            {form.visibilityScope === 'client' ? <label className="grid gap-1 text-sm font-medium">Client recipient<Field as="select" value={form.clientRecipientRole} onChange={event => setForm(previous => ({ ...previous, clientRecipientRole: event.target.value }))}><option value="">Buyer and seller</option><option value="buyer">Buyer</option><option value="seller">Seller</option></Field></label> : null}
            <p className="text-xs text-slate-600 sm:col-span-2">A changed evidence file requires a fresh review. Earlier versions and reviews remain in history.</p>
          </div>}
          <label className="grid gap-1 text-sm font-medium">Revision notes<Field as="textarea" rows={3} value={form.notes} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} placeholder="What changed in this version?" /></label>
        </fieldset>
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {progress ? <p role="status" className="text-sm text-slate-600">{progress}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</Button><Button type="submit" disabled={busy || !form.file}>{busy ? 'Saving version…' : 'Save version'}</Button></div>
      </form> : null}
    </Modal>
  </section>
}
