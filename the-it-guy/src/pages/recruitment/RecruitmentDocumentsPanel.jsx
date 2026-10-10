import { useId, useRef, useState } from 'react'
import { BadgeCheck, Check, Download, FileText, Files, GraduationCap, IdCard, MapPin, Paperclip, Upload } from 'lucide-react'
import { homeSeekersRecruitmentOrganisationId, recruitmentDocumentAccept, recruitmentDocumentError, recruitmentDocumentPack, recruitmentDocumentPresentation, recruitmentDocumentTypes } from './recruitmentDocumentsModel'
import { documentReviewLabel } from './recruitmentReviewModel'

const icons = { CV: FileText, 'Identity document': IdCard, Qualifications: GraduationCap, 'Registration evidence': BadgeCheck, Other: MapPin }
const date = value => value ? new Date(value).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : ''

export default function RecruitmentDocumentsPanel({ lead, organisationId, isNew, busy, dirty, onUpload, onDownload }) {
  const helpId = useId()
  const [error, setError] = useState('')
  const [uploadingType, setUploadingType] = useState('')
  const inFlight = useRef(false)
  const homeSeekers = (lead.organisation_id || organisationId) === homeSeekersRecruitmentOrganisationId
  const files = (lead.documents_json || []).filter(file => typeof file.path === 'string' && file.path.trim())
  const pack = recruitmentDocumentPack({ ...lead, organisation_id: lead.organisation_id || organisationId })
  if (!pack.some(item => item.type === 'Other')) pack.push({ type: 'Other', files: files.filter(file => file.type === 'Other'), reason: '', optional: true })
  const added = pack.filter(item => item.files.length).length
  const locked = isNew || busy || dirty || !!lead.approved_at || !!uploadingType

  async function upload(file, type) {
    if (locked || inFlight.current) return
    const invalid = recruitmentDocumentError(file)
    setError(invalid)
    if (invalid) return
    inFlight.current = true
    setUploadingType(type)
    try { await onUpload(file, type) }
    catch (failure) { setError(failure.message || 'The document could not be uploaded. Please try again.') }
    finally { inFlight.current = false; setUploadingType('') }
  }

  function savedFile(file) {
    return <div key={file.path} className="recruitment-documents__file">
      <FileText size={17} aria-hidden="true" />
      <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold text-[#20364c]">{file.name}</p><p className="mt-1 text-xs text-[#60758b]">{[date(file.uploadedAt), documentReviewLabel(lead, file.path)].filter(Boolean).join(' · ')}</p></div>
      <button type="button" className="recruitment-documents__download" aria-label={`Download ${file.name} (${recruitmentDocumentPresentation(file.type, homeSeekers).title})`} disabled={busy || !!uploadingType} onClick={() => onDownload(file)}><Download size={16} aria-hidden="true" /><span>Download</span></button>
    </div>
  }

  return <section aria-label="Application documents">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><span className="recruitment-documents__icon"><Files size={23} aria-hidden="true" /></span><div><h2 className="text-xl font-semibold text-[#142132]">Documents</h2><p className="mt-1 text-sm text-[#60758b]">The applicant’s document pack, organised as it appears in their portal.</p><p id={helpId} className="mt-2 text-xs text-[#60758b]">PDF, JPG or PNG · up to 10 MB per file</p></div></div>
      <span className="recruitment-documents__count"><Check size={14} aria-hidden="true" />{added} of {pack.length} categories uploaded</span>
    </header>
    {isNew && <p className="recruitment-documents__notice mt-5">Save the agent lead before uploading documents.</p>}
    {lead.approved_at && <p className="recruitment-documents__notice mt-5">The approved document pack is preserved. Contracts are in Overview; final joining evidence is in the onboarding document pack below.</p>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-[#f2cccc] bg-[#fff5f4] p-4 text-sm text-[#9f3028]">{error}</p>}
    <div className="mt-6 space-y-3">{pack.map(item => {
      const { title, hint } = recruitmentDocumentPresentation(item.type, homeSeekers)
      const Icon = icons[item.type] || Paperclip
      const exception = !item.files.length && item.reason.trim().length >= 5
      return <article key={item.type} aria-label={title} className="recruitment-documents__row">
        <div className="flex min-w-0 items-start gap-3"><span className="recruitment-documents__icon"><Icon size={21} aria-hidden="true" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#20364c]">{title}</h3><span className={`recruitment-documents__state${item.files.length || exception ? ' recruitment-documents__state--saved' : ''}`}>{item.files.length ? <><Check size={12} aria-hidden="true" />Uploaded</> : exception ? 'Exception noted' : item.optional ? 'Optional' : 'To add'}</span></div><p className="mt-1 text-xs leading-5 text-[#60758b]">{hint}</p></div></div>
        <div className="min-w-0 space-y-2">{item.files.length ? item.files.map(savedFile) : <p className="recruitment-documents__empty">{exception ? item.reason : 'No file uploaded yet'}</p>}</div>
        <label className="recruitment-documents__upload"><Upload size={16} aria-hidden="true" />{uploadingType === item.type ? 'Uploading…' : item.files.length ? 'Add another' : 'Upload'}<input type="file" aria-label={`Upload ${title}`} aria-describedby={helpId} accept={recruitmentDocumentAccept} disabled={locked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file, item.type) }} /></label>
        {item.files.length > 0 && item.reason && <p className="recruitment-documents__exception">Recorded exception: {item.reason}</p>}
      </article>
    })}</div>
    {files.some(file => !recruitmentDocumentTypes.includes(file.type)) && <div className="mt-6"><h3 className="mb-3 text-sm font-semibold text-[#20364c]">Other saved documents</h3><div className="space-y-2">{files.filter(file => !recruitmentDocumentTypes.includes(file.type)).map(savedFile)}</div></div>}
  </section>
}
