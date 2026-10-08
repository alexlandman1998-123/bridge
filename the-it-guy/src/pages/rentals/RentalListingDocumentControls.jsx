import { getDocumentUploadPolicy } from '../../lib/documentUploadPolicy.js'
import { useEffect, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../lib/documentUploadPolicy.js'
import { rentalListingCanUpload, rentalListingCanReview } from '../../services/rentals/rentalListingDocumentActions.js'
import { requestRentalLandlordOnboarding } from '../../services/rentals/rentalLandlordOnboardingService.js'
import { createPersistedRentalApplicantAccess, listPersistedRentalApplicantAccess, revokePersistedRentalApplicantAccess } from '../../services/rentals/rentalApplicationRepository.js'
const documentUploadPolicy = getDocumentUploadPolicy({ surface: 'rental_application' })


const button = 'rounded-lg border border-[#dce7f2] bg-white px-3 py-2 text-xs font-semibold text-[#315b7a] disabled:opacity-50'
const fileName = (document) => document.file_name || document.name || 'Uploaded file'

export function RentalListingRequirementControls({ kind, section, row, busy, blocked, onUpload, onOpen, onDownload, onReview }) {
  const [notes, setNotes] = useState({})
  const [signed, setSigned] = useState({})
  const editable = rentalListingCanUpload(kind, section, row)
  return <div className="mt-3 space-y-3">
    {editable ? <><label className={`${button} inline-block cursor-pointer`}>
      {row.documents.length ? kind === 'tenant' ? 'Replace pack' : 'Replace file' : 'Upload'}
      <input type="file" title={documentUploadPolicy.helpText} aria-label={`Upload ${row.title}`} className="sr-only" accept={documentUploadPolicy.accept} multiple={kind === 'tenant'} disabled={busy || blocked} onChange={(event) => {
        const files = Array.from(event.target.files || [])
        event.target.value = ''
        if (files.length) void onUpload(kind, section, row, files)
      }} />
    
    </label>
<span className="block text-xs font-normal text-slate-500">{documentUploadPolicy.helpText}</span></> : null}
    {kind === 'tenant' && !editable && ['submitted', 'under_review'].includes(section.application?.status) ? <p className="text-xs text-[#607387]">Accepted evidence is locked until rejected or expired.</p> : null}
    {row.documents.map((document) => <div key={document.id} className="space-y-2 rounded-lg border border-[#e1eaf3] p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => void onOpen(kind, section, document)}>Open {fileName(document)}</button>
        <button type="button" className={button} disabled={busy} onClick={() => void onDownload(kind, section, document)}>Download {fileName(document)}</button>
      </div>
      {document.review_note ? <p className="text-xs text-[#607387]">{document.review_note}</p> : null}
      {rentalListingCanReview(kind, section) ? <>
        <label className="block text-xs text-[#607387]">Review note
          <textarea aria-label={`${row.title}: ${fileName(document)} review note`} className="mt-1 w-full rounded-lg border p-2" disabled={busy || blocked} value={notes[document.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [document.id]: event.target.value }))} />
        </label>
        {kind === 'landlord' && row.purpose === 'property_disclosure' ? <label className="flex gap-2 text-xs text-[#607387]"><input type="checkbox" disabled={busy || blocked} checked={Boolean(signed[document.id])} onChange={(event) => setSigned((current) => ({ ...current, [document.id]: event.target.checked }))} />I checked the prescribed disclosure is completed and signed.</label> : null}
        <div className="flex gap-2">{['accepted', 'rejected'].map((status) => <button type="button" key={status} className={button} disabled={busy || blocked || !notes[document.id]?.trim() || (status === 'accepted' && kind === 'landlord' && row.purpose === 'property_disclosure' && !signed[document.id])} onClick={async () => {
          const saved = await onReview(kind, section, document, { status, note: notes[document.id], completedSigned: Boolean(signed[document.id]) })
          if (saved) { setNotes((current) => ({ ...current, [document.id]: '' })); setSigned((current) => ({ ...current, [document.id]: false })) }
        }}>{status === 'accepted' ? 'Accept evidence' : 'Reject evidence'}</button>)}</div>
      </> : null}
    </div>)}
  </div>
}

export function RentalListingCollectionLinks({ kind, section, busy, blocked, runMutation, runRead }) {
  const workspace = useWorkspace()
  const [recipient, setRecipient] = useState('')
  const [access, setAccess] = useState(null)
  const [links, setLinks] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [now] = useState(() => Date.now())
  const source = kind === 'landlord' ? section.onboarding : section.application
  const allowed = kind === 'landlord' || ['submitted', 'under_review'].includes(source?.status)
  useEffect(() => {
    let cancelled = false
    if (kind !== 'tenant' || !allowed) return () => { cancelled = true }
    listPersistedRentalApplicantAccess(section.id).then((result) => { if (!cancelled) { setLinks(result); setError('') } }).catch((cause) => { if (!cancelled) setError(cause.message) })
    return () => { cancelled = true }
  }, [kind, section.id, source?.version, allowed])
  if (!allowed) return null
  const existing = kind === 'landlord' ? source.accessLinks || [] : links
  const active = existing.filter((link) => !(link.revokedAt || link.revoked_at) && Date.parse(link.expiresAt || link.expires_at) > now && (link.id !== (access?.id || access?.accessId)))
  async function create() {
    await runMutation(async () => {
      const result = kind === 'landlord'
        ? await requestRentalLandlordOnboarding(section.id, 'POST', { action: 'create_access' })
        : await createPersistedRentalApplicantAccess(section.id, { createdBy: resolveRentalWorkspaceScope(workspace).assignedAgentId, ...(recipient ? { subjectId: recipient } : {}) })
      setAccess({ ...result, url: `${window.location.origin}/${kind === 'landlord' ? 'rental-landlord-onboarding' : 'rental-application'}/${result.token}` })
      if (kind === 'tenant') setLinks((current) => [...current, { id: result.id, expires_at: result.expiresAt }])
    }, 'Secure collection link created.')
  }
  async function revoke(id) {
    await runMutation(async () => {
      if (kind === 'landlord') await requestRentalLandlordOnboarding(section.id, 'POST', { action: 'revoke_access', accessId: id })
      else await revokePersistedRentalApplicantAccess(id)
      if (id === (access?.id || access?.accessId)) setAccess(null)
      setLinks((current) => current.filter((link) => link.id !== id))
    }, 'Collection link revoked.')
  }
  return <section className="mx-5 mb-5 space-y-3 rounded-xl border bg-slate-50 p-4">
    <h5 className="font-semibold text-[#22374d]">{kind === 'landlord' ? 'Collect landlord documents' : 'Collect outstanding documents'}</h5>
    <p className="text-xs text-[#607387]">Copy and share the secure link. No email is sent automatically.</p>
    {kind === 'tenant' ? <label className="block text-sm">Link recipient<select aria-label={`Link recipient for ${section.title}`} className="ml-3 rounded-lg border p-2" disabled={busy || blocked} value={recipient} onChange={(event) => { setRecipient(event.target.value); setAccess(null); setNotice('') }}>
      <option value="">Primary applicant — complete application</option>
      {(source.data?.people || []).map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} — own documents and permissions</option>)}
    </select></label> : null}
    <button type="button" className={button} disabled={busy || blocked} onClick={() => void create()}>Create {kind === 'landlord' ? 'landlord' : 'document'} collection link</button>
    {access ? <div className="space-y-2">
      <label className="block text-sm">Secure collection link<input aria-label={`Secure collection link for ${section.title}`} className="mt-1 w-full rounded-lg border p-2" readOnly value={access.url} /></label>
      <p className="text-xs text-[#607387]">Expires {new Date(access.expiresAt).toLocaleString('en-ZA')}.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void runRead(async () => { await navigator.clipboard.writeText(access.url); setNotice('Link copied.') })}>Copy collection link</button><button type="button" className={button} disabled={busy || blocked} onClick={() => void revoke(access.id || access.accessId)}>Revoke this link</button></div>
    </div> : null}
    {active.map((link) => <div key={link.id} className="flex flex-wrap items-center gap-3 text-xs text-[#607387]"><span>Existing link expires {new Date(link.expiresAt || link.expires_at).toLocaleString('en-ZA')}.</span><button type="button" className={button} disabled={busy || blocked} onClick={() => void revoke(link.id)}>Revoke existing link</button></div>)}
    {kind === 'landlord' && source.status === 'submitted' ? <div className="space-y-2 border-t pt-3"><p className="text-xs text-[#607387]">The landlord submitted these details. Request corrections before replacing files.</p><textarea aria-label={`Landlord correction request for ${section.title}`} className="w-full rounded-lg border p-2" disabled={busy || blocked} value={message} onChange={(event) => setMessage(event.target.value)} /><button type="button" className={button} disabled={busy || blocked || !message.trim()} onClick={() => void runMutation(() => requestRentalLandlordOnboarding(section.id, 'POST', { action: 'request_changes', version: source.version, patch: { message } }), 'Corrections requested. The landlord can use the same valid link.')}>Request corrections</button></div> : null}
    {error ? <p role="alert" className="text-sm text-red-800">Existing links could not be loaded: {error}</p> : null}
    {notice ? <p role="status" className="text-xs text-[#607387]">{notice}</p> : null}
  </section>
}
