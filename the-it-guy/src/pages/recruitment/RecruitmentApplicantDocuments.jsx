import { useRef, useState } from 'react'
import { Check, Download, FileText, Files, Upload } from 'lucide-react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { homeSeekersRecruitmentOrganisationId, recruitmentDocumentAccept, recruitmentDocumentError, recruitmentDocumentMime, recruitmentDocumentTypes, requiredRecruitmentDocuments, recruitmentDocumentsComplete, recruitmentDocumentPresentation } from './recruitmentDocumentsModel'

export default function RecruitmentApplicantDocuments({ applicant, endpoint, token, preview = false, disabled = false, homeSeekers = false, presentation = 'default', onSaved, onBusy, onSessionExpired }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const attempt = useRef(null), inFlight = useRef(false)
  const files = applicant.documents || [], editable = applicant.documentsEditable !== false && !preview
  const options = { endpoint, token, codeOnly: true }
  const documentTypes = homeSeekers ? recruitmentDocumentTypes : requiredRecruitmentDocuments
  function activity(value) { inFlight.current = value; setBusy(value); onBusy?.(value) }
  async function upload(file, type) {
    if (inFlight.current || disabled || !editable) return
    const invalid = recruitmentDocumentError(file)
    if (invalid) { setError(invalid); return }
    if (!attempt.current || attempt.current.file !== file || attempt.current.type !== type) attempt.current = { id: crypto.randomUUID(), file, type, uploaded: false }
    const pending = attempt.current
    activity(true); setError(''); setNotice('')
    try {
      const prepared = await recruitmentSignupRequest('prepare_document', { requestId: pending.id, document: { name: file.name, size: file.size, mimeType: recruitmentDocumentMime(file), type } }, options)
      if (!prepared.committed && !pending.uploaded) {
        if (!prepared.uploadUrl) throw new Error('The upload could not be prepared. Retry this file.')
        const response = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': recruitmentDocumentMime(file) }, body: file })
        // A successful upload with a lost response can report "already exists".
        // Finalisation checks the exact retained request and Storage metadata.
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          if (![400, 409].includes(response.status) || !/already exists|duplicate/i.test(String(result.message || result.error || ''))) throw new Error('The upload did not finish. Retry this file.')
        }
        pending.uploaded = true
      }
      const result = await recruitmentSignupRequest('commit_document', { requestId: pending.id }, options)
      if (!result.saved || !result.applicant) throw new Error('The document could not be confirmed. Retry this file.')
      onSaved(result.applicant); attempt.current = null; setNotice(`${homeSeekers && type === 'Other' ? 'FICA document' : type} uploaded.`)
    } catch (failure) {
      setError(failure.message)
      if (failure.status === 401) onSessionExpired?.()
    } finally { activity(false) }
  }
  async function download(file) {
    if (inFlight.current || disabled) return
    activity(true); setError('')
    try {
      const result = await recruitmentSignupRequest('download_document', { documentPath: file.path }, options)
      if (!result.downloadUrl) throw new Error('Document unavailable.')
      const link = document.createElement('a'); link.href = result.downloadUrl; link.download = file.name; link.rel = 'noreferrer'; link.click()
    } catch (failure) { setError(failure.message); if (failure.status === 401) onSessionExpired?.() }
    finally { activity(false) }
  }
  if (presentation === 'setup') return <section aria-label="Your recruitment documents">
    <header className="applicant-setup__documents-head"><div><p className="applicant-setup__eyebrow">Your next step</p><h2>Your documents</h2><p>Give our team what they need to review your application. Add a clear copy of each document below.</p><p className="applicant-setup__file-hint">PDF, JPG or PNG · up to 10 MB per file</p></div><Files size={27} aria-hidden="true" /></header>
    {!editable && !preview && <p role="status" className="applicant-setup__notice">Your reviewed document pack is preserved. Contact Home Seekers if you need to provide another file.</p>}
    <div className="applicant-setup__document-list">{documentTypes.map(type => {
      const saved = files.filter(file => file.type === type && typeof file.path === 'string' && file.path.trim())
      const exception = applicant.documentWaivers?.[type]
      const ready = saved.length > 0 || (typeof exception === 'string' && exception.trim().length >= 5)
      const { title } = recruitmentDocumentPresentation(type, homeSeekers)
      const hint = type === 'Identity document' ? 'Upload your ID or passport for FICA.' : type === 'Registration evidence' ? 'Upload your FFC certificate here.' : type === 'Other' ? 'A recent proof of address or other supporting FICA evidence.' : type === 'CV' ? 'Your experience and professional background.' : 'Your relevant qualifications and certificates.'
      const locked = busy || disabled || !editable
      return <section key={type} className="applicant-setup__document" aria-label={title}>
        <div className="applicant-setup__document-head"><span className="applicant-setup__file-icon"><FileText size={18} aria-hidden="true" /></span><div><h3>{title}</h3><p>{hint}</p></div><span className={`applicant-setup__document-state${ready ? ' applicant-setup__document-state--saved' : ''}`}>{ready ? <><Check size={13} aria-hidden="true" />{saved.length ? 'Uploaded' : 'Exception noted'}</> : 'To add'}</span></div>
        <div className="applicant-setup__document-actions"><label className={`applicant-setup__file-control${locked ? ' applicant-setup__file-control--disabled' : ''}`}><Upload size={14} aria-hidden="true" />{busy && attempt.current?.type === type ? 'Saving file…' : saved.length ? 'Add another file' : 'Choose file'}<input aria-label={`Upload ${homeSeekers && type === 'Other' ? 'supporting FICA documents / proof of address' : type}`} type="file" accept={recruitmentDocumentAccept} disabled={locked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file, type) }} /></label>
          {saved.map(file => <div key={file.path} className="applicant-setup__saved-file"><FileText size={14} aria-hidden="true" /><span>{file.name}</span><button type="button" disabled={busy || disabled} className="applicant-setup__download" aria-label={`Download ${file.name}`} onClick={() => download(file)}><Download size={15} aria-hidden="true" /></button></div>)}
        </div>{exception && <p className="applicant-setup__exception">Agency exception: {exception}</p>}
      </section>
    })}</div>
    {files.filter(file => !documentTypes.includes(file.type)).map(file => <button key={file.path} disabled={busy || disabled} type="button" className="recruitment-signup__secondary" onClick={() => download(file)}>Download {file.name}</button>)}
    {applicant.documentsComplete && <p role="status" className="applicant-setup__notice"><Check size={16} aria-hidden="true" />Your document pack is ready for the recruitment team to review.</p>}
    {error && <p role="alert" className="applicant-setup__notice applicant-setup__notice--error">{error}</p>}{notice && <p role="status" className="applicant-setup__notice">{notice}</p>}
    {attempt.current && !busy && editable && <button type="button" disabled={disabled} className="recruitment-signup__submit" onClick={() => upload(attempt.current.file, attempt.current.type)}>Retry {homeSeekers && attempt.current.type === 'Other' ? 'FICA document' : attempt.current.type} upload</button>}
  </section>
  return <section className="recruitment-profile" aria-label="Your recruitment documents">
    <h4>Your documents</h4><p>{homeSeekers ? 'Upload your supporting FICA documents and FFC certificate so our team can review your application. Add your CV and qualifications below too.' : 'Upload your CV, identity document, qualifications and registration evidence. If an item does not apply, contact the recruitment team so they can record the reason.'}</p>
    <p className="recruitment-signup__note">PDF, JPG or PNG · up to 10 MB per file. This screen gives you access to your own application documents.</p>
    {preview && <p role="status">Preview only. Documents are not uploaded.</p>}
    {!editable && !preview && <p role="status">Your reviewed document pack is preserved. Contact the agency if you need to provide another file.</p>}
    {documentTypes.map(type => <div key={type} className="recruitment-profile__document">
      <label>{homeSeekers && type === 'Other' ? 'Supporting FICA documents / proof of address' : type}<input aria-label={`Upload ${homeSeekers && type === 'Other' ? 'supporting FICA documents / proof of address' : type}`} type="file" accept={recruitmentDocumentAccept} disabled={busy || disabled || !editable} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file, type) }} /></label>
      {homeSeekers && type === 'Identity document' && <p className="recruitment-signup__note">Upload your ID or passport for FICA.</p>}
      {homeSeekers && type === 'Registration evidence' && <p className="recruitment-signup__note">Upload your FFC certificate here.</p>}
      {applicant.documentWaivers?.[type] && <p className="recruitment-signup__note">Agency exception: {applicant.documentWaivers[type]}</p>}
      {files.filter(file => file.type === type).map(file => <div key={file.path}><span>{file.name}</span><button type="button" disabled={busy || disabled} className="recruitment-signup__secondary" onClick={() => download(file)}>Download {file.name}</button></div>)}
    </div>)}
    {files.filter(file => !documentTypes.includes(file.type)).map(file => <button key={file.path} disabled={busy || disabled} type="button" className="recruitment-signup__secondary" onClick={() => download(file)}>Download {file.name}</button>)}
    {(homeSeekers ? recruitmentDocumentsComplete({ organisation_id: homeSeekersRecruitmentOrganisationId, documents_json: files, document_waivers_json: applicant.documentWaivers }) : applicant.documentsComplete) && <p role="status">Your document pack is ready for the recruitment team to review.</p>}
    {error && <p role="alert" className="recruitment-signup__error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {attempt.current && !busy && editable && <button type="button" disabled={disabled} className="recruitment-signup__submit" onClick={() => upload(attempt.current.file, attempt.current.type)}>Retry {homeSeekers && attempt.current.type === 'Other' ? 'FICA document' : attempt.current.type} upload</button>}
  </section>
}
