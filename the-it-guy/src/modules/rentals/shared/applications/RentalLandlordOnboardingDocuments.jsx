import { useState } from 'react'
import { CheckCircle2, Clock3, FileText, Home, UserRound, XCircle } from 'lucide-react'
import RentalDocumentUploadControl from '../../../../components/rentals/RentalDocumentUploadControl.jsx'
import LeadDocumentWorkspace from '../../../../components/documents/LeadDocumentWorkspace.jsx'
import Modal from '../../../../components/ui/Modal.jsx'
import { getDocumentUploadPolicy } from '../../../../lib/documentUploadPolicy.js'
import {
  rentalLandlordRequirementPurpose,
  rentalLandlordRequirementSubject,
  rentalLandlordRequirementTitle,
  rentalLandlordRequirementReason,
} from '../../../../services/rentals/rentalLandlordOnboardingModel.js'

const policy = getDocumentUploadPolicy({ surface: 'rental_landlord' })
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#315b7a] disabled:cursor-not-allowed disabled:opacity-50'
const categoryDefinitions = [
  { key: 'landlord-fica', label: 'FICA', description: 'Landlord identity, address, company, trust and authority checks.', Icon: UserRound, iconClass: 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' },
  { key: 'landlord-property', label: 'Property Documents', description: 'Ownership, scheme rules, rental proceeds and management records.', Icon: Home, iconClass: 'border-[#d7e6f5] bg-[#eef5fb] text-[#1f4f78]' },
  { key: 'landlord-rental', label: 'Rental', description: 'Rental mandates and prescribed property disclosures.', Icon: FileText, iconClass: 'border-[#f2dfbf] bg-[#fff8ea] text-[#8a5b16]' },
]

function statusFor(row) {
  if (!row.document) return { state: 'pending', label: 'Not uploaded', pillClass: 'border-[#dfe6ee] bg-[#f4f6f8] text-[#607387]' }
  if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) return { state: 'pending', label: 'Expired', pillClass: 'border-[#efd9ae] bg-[#fff8ea] text-[#8a5b16]' }
  if (row.state === 'accepted') return { state: 'complete', label: 'Accepted', pillClass: 'border-[#cce8d6] bg-[#ecfaf1] text-[#1f7d44]' }
  if (row.state === 'rejected') return { state: 'pending', label: 'Changes requested', pillClass: 'border-[#efcbc8] bg-[#fff7f6] text-[#963d35]' }
  return { state: 'review', label: 'Awaiting review', signedAwaitingReview: row.document.completed_signed === true, pillClass: 'border-[#d2e2f3] bg-[#eef6ff] text-[#2f628d]' }
}

export default function RentalLandlordOnboardingDocuments({
  onboarding,
  disabled = false,
  onUpload,
  onOpen,
  onReview,
  preview = false,
  portalAction,
  additionalActions,
  actionError = '',
  initialUploadPurpose = '',
  initialUploadSubject = '',
  onUseSavedMandate,
}) {
  const requestedRequirements = (onboarding.requirements || []).filter(row => row.active && row.purpose === initialUploadPurpose && (!initialUploadSubject || row.subjectId === initialUploadSubject))
  const [uploadOpen, setUploadOpen] = useState(Boolean(initialUploadPurpose))
  const [uploadId, setUploadId] = useState(() => requestedRequirements.length === 1 ? requestedRequirements[0].id : '')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [review, setReview] = useState(null)
  const [notes, setNotes] = useState({})
  const [signed, setSigned] = useState({})
  const rows = (onboarding.requirements || []).filter((row) => row.active).map((requirement) => {
    const document = preview ? null : onboarding.documents?.find((item) => item.id === requirement.documentId)
    return {
      ...requirement,
      requirement,
      document,
      key: requirement.id,
      label: rentalLandlordRequirementPurpose(requirement),
      actionLabel: rentalLandlordRequirementTitle(requirement, onboarding.data),
      contextLabel: rentalLandlordRequirementSubject(requirement, onboarding.data),
      required: requirement.purpose === 'property_disclosure' || requirement.mode !== 'preview' && requirement.required !== false,
      requirementLabel: requirement.purpose === 'property_disclosure' ? 'Before mandate acceptance' : requirement.mode === 'preview' ? 'Suggested supporting document' : requirement.required === false ? 'Optional' : 'Required',
      fileName: document?.file_name,
      uploadedAt: document?.uploaded_at || document?.created_at,
      originalDocument: document,
      canDownload: Boolean(document && onOpen),
    }
  })
  const categories = categoryDefinitions.map((category) => {
    const items = rows.filter((row) => category.key === 'landlord-fica' ? row.scopeKey === 'identity' : category.key === 'landlord-rental' ? ['property_disclosure', 'signed_mandate'].includes(row.purpose) : row.scopeKey !== 'identity' && !['property_disclosure', 'signed_mandate'].includes(row.purpose))
    return { ...category, items, completionLabel: items.length && items.every((row) => !row.required) ? 'Supporting documents' : undefined }
  })
  const files = new Map(rows.filter((row) => row.document).map((row) => [row.document.id, row]))
  const evidenceSummary = { saved: files.size, awaitingReview: [...files.values()].filter((row) => statusFor(row).state === 'review').length }
  const uploadDisabled = disabled || preview || onboarding.status !== 'draft'
  const selectedUpload = rows.find((row) => row.id === uploadId)
  const selectedReview = rows.find((row) => row.id === review?.requirementId && row.generation === review.generation && row.document?.id === review.documentId)
  const titleFor = (row) => rentalLandlordRequirementTitle(row.requirement, onboarding.data)
  const openReview = (row, outcome = '') => setReview({ requirementId: row.id, generation: row.generation, documentId: row.document.id, outcome })
  const closeReview = () => { if (!disabled) setReview(null) }
  const uploadControl = (row) => <RentalDocumentUploadControl key={`${row.id}:${row.generation}`} title={titleFor(row)} label={row.document ? 'Upload / Replace' : 'Upload file'} disabled={uploadDisabled} className={`${buttonClass} min-h-10`} surface="rental_landlord" onUpload={async (files, onProgress) => {
    const saved = await onUpload(files[0], row.requirement, progress => {
      setUploadProgress({ ...progress, requirementKey: row.key })
      onProgress(progress)
    })
    if (saved !== false) setUploadOpen(false)
    return saved
  }} />
  async function submitReview(status) {
    if (!selectedReview || disabled) return
    const document = selectedReview.document
    const note = notes[document.id]?.trim()
    if (!note || status === 'accepted' && selectedReview.purpose === 'property_disclosure' && !signed[document.id]) return
    const saved = await onReview(document, { status, note, completedSigned: Boolean(signed[document.id]) })
    if (saved !== false) setReview(null)
  }

  return <section aria-label="Landlord document checklist">
    {preview ? <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Save the discovery answers to refresh these requirements before uploading.</p> : null}
    <LeadDocumentWorkspace
      partyType="landlord"
      partyName={onboarding.data.profile?.name || 'Landlord'}
      categories={categories}
      getStatusMeta={statusFor}
      evidenceSummary={evidenceSummary}
      uploadProgress={uploadProgress}
      additionalActions={additionalActions}
      portalAction={portalAction}
      portalActionLabel="Create secure onboarding link"
      portalActionDisabled={disabled}
      manageDocumentsAction={onUpload ? () => setUploadOpen(true) : null}
      manageDocumentsActionLabel="Upload / Request document"
      renderRowActions={(row) => row.document && onReview ? <>
        <button type="button" disabled={disabled} onClick={() => openReview(row)} className={`${buttonClass} border-[#d6e3f0] bg-[#f7fbff]`}><Clock3 size={14} />Review</button>
        <button type="button" disabled={disabled} onClick={() => openReview(row, 'rejected')} className={`${buttonClass} border-[#efcbc8] bg-[#fff8f7] text-[#9a4038]`}><XCircle size={14} />Reject</button>
        <button type="button" disabled={disabled} onClick={() => openReview(row, 'accepted')} className={`${buttonClass} border-[#cce8d6] bg-[#ecfaf1] text-[#1f7d44]`}><CheckCircle2 size={14} />Accept</button>
      </> : null}
      renderActions={(row) => <>
        {row.document && onOpen ? <button type="button" disabled={disabled} onClick={() => void onOpen(row.document)} className={buttonClass} aria-label={`Open ${row.document.file_name}`}>Open file</button> : null}
        {onUpload ? <button type="button" disabled={uploadDisabled} className={buttonClass} onClick={() => { setUploadId(row.id); setUploadOpen(true) }}>{row.document ? 'Upload / Replace' : 'Upload file'}</button> : null}
        <p className="px-3 py-2 text-xs leading-5 text-[#607387]">{rentalLandlordRequirementReason(row.requirement)}</p>
        {row.document?.review_note ? <p className="px-3 py-2 text-xs text-[#607387]">{row.document.review_note}</p> : null}
      </>}
    />
    {!rows.length ? <p className="mt-3 text-sm text-[#60758b]">Save the landlord type and properties to prepare the checklist. Exceptional landlord types need your agent’s review.</p> : null}
    <Modal open={uploadOpen} onClose={() => { if (!disabled) setUploadOpen(false) }} title="Upload / Request document" subtitle={policy.helpText}>
      {actionError ? <p aria-live="polite" className="mb-4 text-sm text-red-700">{actionError}</p> : null}
      <label className="form-field"><span>Document requirement</span><select value={uploadId} disabled={disabled} onChange={(event) => setUploadId(event.target.value)}><option value="">Choose a document</option>{rows.map((row) => <option key={row.id} value={row.id}>{titleFor(row)}</option>)}</select></label>
      {selectedUpload ? <div className="mt-4 space-y-3"><p className="text-sm text-[#607387]">{rentalLandlordRequirementReason(selectedUpload.requirement)}</p>{onUpload ? uploadControl(selectedUpload) : null}</div> : null}
      {selectedUpload?.purpose === 'signed_mandate' && selectedUpload.document && ['review', 'complete'].includes(statusFor(selectedUpload).state) && onUseSavedMandate ? <button type="button" disabled={disabled || preview} className={`${buttonClass} mt-4`} onClick={async () => {
        if (await onUseSavedMandate(selectedUpload.requirement) !== false) setUploadOpen(false)
      }}>Continue with saved mandate</button> : null}
      {uploadDisabled ? <p className="mt-3 text-sm text-[#607387]">{preview ? 'Save your changes before uploading.' : onboarding.status !== 'draft' ? 'Request corrections before replacing landlord files.' : 'A document action is in progress.'}</p> : null}
      {portalAction ? <div className="mt-5 border-t border-[#e6eef7] pt-4"><p className="mb-3 text-sm text-[#607387]">Share the secure onboarding link to request these documents from the landlord.</p><button type="button" disabled={disabled} onClick={() => { setUploadOpen(false); void portalAction() }} className={buttonClass}>Create secure onboarding link</button></div> : null}
    </Modal>
    <Modal open={Boolean(review)} onClose={closeReview} title={review?.outcome === 'accepted' ? 'Accept document' : review?.outcome === 'rejected' ? 'Reject document' : 'Review document'} subtitle={selectedReview ? titleFor(selectedReview) : 'This requirement changed. Close and refresh before reviewing.'}>
      {actionError ? <p aria-live="polite" className="mb-4 text-sm text-red-700">{actionError}</p> : null}
      {selectedReview ? <div className="space-y-4">
        <p className="break-all text-sm font-semibold text-[#20364c]">{selectedReview.document.file_name}</p>
        {onOpen ? <button type="button" disabled={disabled} onClick={() => void onOpen(selectedReview.document)} className={buttonClass}>Open file</button> : null}
        <label className="form-field"><span>Review note</span><textarea aria-label={`${titleFor(selectedReview)} review note`} rows={3} disabled={disabled} value={notes[selectedReview.document.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [selectedReview.document.id]: event.target.value }))} /></label>
        {selectedReview.purpose === 'property_disclosure' ? <label className="flex items-start gap-2 text-sm text-[#29435d]"><input type="checkbox" disabled={disabled} checked={Boolean(signed[selectedReview.document.id])} onChange={(event) => setSigned((current) => ({ ...current, [selectedReview.document.id]: event.target.checked }))} className="mt-1" />I checked the prescribed disclosure is completed and signed.</label> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#e6eef7] pt-4">
          <button type="button" disabled={disabled} className={buttonClass} onClick={closeReview}>Cancel</button>
          {['rejected', 'accepted'].filter((outcome) => !review.outcome || outcome === review.outcome).map((outcome) => <button type="button" key={outcome} disabled={disabled || !notes[selectedReview.document.id]?.trim() || outcome === 'accepted' && selectedReview.purpose === 'property_disclosure' && !signed[selectedReview.document.id]} onClick={() => void submitReview(outcome)} className={`${buttonClass} ${outcome === 'accepted' ? 'border-[#cce8d6] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#efcbc8] bg-[#fff8f7] text-[#9a4038]'}`}>{outcome === 'accepted' ? 'Accept evidence' : 'Reject evidence'}</button>)}
        </div>
      </div> : null}
    </Modal>
  </section>
}
