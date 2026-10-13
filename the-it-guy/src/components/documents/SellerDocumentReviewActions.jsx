import { useRef, useState } from 'react'
import { CheckCircle2, Clock3, Loader2, Send, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog.jsx'

function SellerDocumentReviewActions({
  item = {},
  busyAction = '',
  onReview = null,
  onReminder = null,
  compact = false,
  requireSignedCopyCheck = false,
  requireSignedEvidenceCheck = false,
  signingRequest = null,
  reviewLabel = 'Start review',
  acceptLabel = 'Approve',
}) {
  const [rejecting, setRejecting] = useState(false)
  const [confirmingSignedCopy, setConfirmingSignedCopy] = useState(false)
  const [signedCopyChecked, setSignedCopyChecked] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const reviewTrigger = useRef(null)
  const document = item?.linkedDocument || item?.upload || null
  const documentId = String(document?.id || '').trim()
  const requirementId = String(item?.requirementId || item?.requirement_id || item?.id || '').trim()
  const status = String(item?.status || '').trim().toLowerCase()
  const lifecycleStatus = String(item?.lifecycleStatus || item?.lifecycle_status || '').trim().toLowerCase()
  const isMandate = [item?.key, item?.requirementKey, item?.requirement_key, document?.document_type, document?.documentType].includes('signed_mandate')
  const hasExactRequirement = Boolean(document?.requirement_id || document?.requirementId)
  const onlineSigned = signingRequest?.status === 'signed'
  const canReview = Boolean((onlineSigned || documentId && hasExactRequirement && ['uploaded', 'under_review'].includes(status)) && typeof onReview === 'function')
  const requestFields = signingRequest ? { signingRequest } : {}
  const canRemind = Boolean(
    item?.actionRequired &&
    requirementId &&
    (['requested', 'rejected', 'expired', 'correction_requested'].includes(status) || ['awaiting_seller', 'action_required'].includes(lifecycleStatus)) &&
    typeof onReminder === 'function',
  )
  const actionKey = (action) => `${item?.key || item?.id}:${action}`
  const isBusy = Boolean(busyAction)
  const dialogOpen = confirmingSignedCopy || rejecting
  const documentLabel = item?.label || item?.title || document?.document_name || signingRequest?.document_label || 'Signed document'
  const closeDialog = () => {
    if (isBusy) return
    setConfirmingSignedCopy(false)
    setSignedCopyChecked(false)
    setRejecting(false)
  }

  const submitRejection = async () => {
    if (rejectionReason.trim().length < 5) return
    const completed = await onReview?.({ item, document, ...requestFields, action: 'reject', reason: rejectionReason.trim() })
    if (completed !== false) {
      setRejecting(false)
      setRejectionReason('')
    }
  }

  const submitApproval = async () => {
    if ((requireSignedCopyCheck || requireSignedEvidenceCheck) && !signedCopyChecked) return
    const reason = requireSignedCopyCheck
      ? isMandate
        ? 'Reviewed the uploaded signed mandate against the current signing copy and checked every required signature.'
        : 'Reviewed the uploaded signed file against the current signing copy and checked every required signature.'
      : requireSignedEvidenceCheck ? 'Reviewed the existing signed document and checked every required signature.' : ''
    const completed = await onReview?.({ item, document, ...requestFields, action: 'approve', reason })
    if (completed !== false) {
      setConfirmingSignedCopy(false)
      setSignedCopyChecked(false)
    }
  }

  if (!onlineSigned && documentId && !hasExactRequirement && ['uploaded', 'under_review'].includes(status)) {
    return <p role="status" className="mt-3 text-xs text-[#8a5b16]">This file needs an exact checklist link before review. Confirm the seller details and refresh the checklist; then upload it against the correct requirement.</p>
  }
  if (!canReview && !canRemind) return null

  return (
    <div data-document-review-actions data-document-review-dialog-open={dialogOpen ? 'true' : undefined} className={compact ? 'min-w-0 shrink-0 max-w-full [&_button]:whitespace-nowrap' : 'mt-4 border-t border-[#e2eaf3] pt-4'}>
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog() }}>
        <DialogContent showClose={false} overlayClassName="z-[80] bg-[#102033]/30 backdrop-blur-[2px]" className="z-[90] max-h-[calc(100dvh-2rem)] max-w-[480px] overflow-y-auto rounded-2xl border-[#dbe6f2] bg-white p-5 text-[#20364c] shadow-xl sm:p-6 md:p-6" data-document-review-actions onCloseAutoFocus={event => { event.preventDefault(); reviewTrigger.current?.focus() }}>
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${rejecting ? 'bg-[#fff0ed] text-[#a43d35]' : 'bg-[#eaf6ee] text-[#1f7a46]'}`}>
              {rejecting ? <XCircle size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-6 text-[#20364c]">{rejecting ? 'Request a replacement' : `${acceptLabel === 'Accept' ? 'Accept' : 'Approve'} signed document`}</DialogTitle>
              <p className="mt-0.5 break-words text-sm text-[#607387]">{documentLabel}</p>
            </div>
          </div>
          <DialogDescription className="mt-4 text-sm leading-6 text-[#607387]">{rejecting ? 'Explain what needs to change. The seller will see this reason.' : 'Confirm you have checked the signed copy before accepting it.'}</DialogDescription>
          {confirmingSignedCopy ? <>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#dce8e1] bg-[#f5faf7] p-3.5 text-sm leading-6 text-[#315b45]">
              <input type="checkbox" checked={signedCopyChecked} onChange={(event) => setSignedCopyChecked(event.target.checked)} disabled={isBusy} className="mt-1 h-4 w-4 shrink-0 accent-[#1f7a46]" />
              <span>{onlineSigned ? 'I reviewed this signed document and checked every required signature.' : !requireSignedCopyCheck
                ? 'I checked this existing signed document and every required signature.'
                : isMandate
                ? 'I compared the uploaded mandate with the reviewed signing copy and checked every required signature.'
                : 'I compared the uploaded file with the reviewed signing copy and checked that every required seller has signed.'}</span>
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#edf2f7] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeDialog} disabled={isBusy} className="min-h-10 rounded-lg border border-[#dbe6f2] bg-white px-4 text-sm font-semibold text-[#52657b] disabled:opacity-60">Cancel</button>
              <button type="button" onClick={() => void submitApproval()} disabled={isBusy || !signedCopyChecked} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#1f7a46] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busyAction === actionKey('approve') ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {acceptLabel === 'Accept' ? 'Accept signed copy' : 'Approve signed copy'}
              </button>
            </div>
          </> : <div className="mt-4">
            <label htmlFor={`seller-document-rejection-${item?.key || item?.id}`} className="text-sm font-semibold text-[#20364c]">
              Why must the seller replace this file?
            </label>
            <textarea
              id={`seller-document-rejection-${item?.key || item?.id}`}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={3}
              maxLength={1000}
              disabled={isBusy}
              placeholder="For example: The statement is older than three months or the account number is cropped."
              className="mt-2 w-full resize-y rounded-[10px] border border-[#e2b8b4] bg-white px-3 py-2 text-sm text-[#243d56] outline-none focus:border-[#bd665e] focus:ring-2 focus:ring-[#f7dedb] disabled:opacity-60"
            />
            <p className="mt-1 text-[0.72rem] text-[#8d5752]">This reason is shown to the seller and recorded in the audit trail.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#edf2f7] pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDialog}
                disabled={isBusy}
                className="min-h-10 rounded-lg border border-[#dbe6f2] bg-white px-4 text-sm font-semibold text-[#52657b] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRejection()}
                disabled={isBusy || rejectionReason.trim().length < 5}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#a43d35] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction === actionKey('reject') ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject and request replacement
              </button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap justify-end gap-2">
        {canRemind ? (
          <button
            type="button"
            onClick={() => void onReminder?.({ item, requirementId })}
            disabled={isBusy}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e5d2ad] bg-[#fffaf0] px-3 text-xs font-semibold text-[#8a5b16] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === actionKey('remind') ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send reminder
          </button>
        ) : null}
        {canReview && (onlineSigned || status === 'uploaded' || reviewLabel === 'Review') ? (
          <button
            type="button"
            onClick={() => void onReview?.({ item, document, ...requestFields, action: 'start_review', reason: '' })}
            disabled={isBusy}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#d6e3f0] bg-[#f7fbff] px-3 text-xs font-semibold text-[#315b7d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === actionKey('start_review') ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}
            {reviewLabel}
          </button>
        ) : null}
        {canReview ? (
          <>
            <button
              type="button"
              onClick={event => { reviewTrigger.current = event.currentTarget; setRejecting(true) }}
              disabled={isBusy}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#efcbc8] bg-[#fff8f7] px-3 text-xs font-semibold text-[#9a4038] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle size={14} />
              Reject
            </button>
            <button
              type="button"
              onClick={event => { reviewTrigger.current = event.currentTarget; if (requireSignedCopyCheck || requireSignedEvidenceCheck) setConfirmingSignedCopy(true); else void submitApproval() }}
              disabled={isBusy}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#1f7a46] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === actionKey('approve') ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {acceptLabel}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default SellerDocumentReviewActions
