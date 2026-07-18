import { useState } from 'react'
import { CheckCircle2, Clock3, Loader2, Send, XCircle } from 'lucide-react'

function SellerDocumentReviewActions({
  item = {},
  busyAction = '',
  onReview = null,
  onReminder = null,
}) {
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const document = item?.linkedDocument || item?.upload || null
  const documentId = String(document?.id || '').trim()
  const requirementId = String(item?.requirementId || item?.requirement_id || item?.id || '').trim()
  const status = String(item?.status || '').trim().toLowerCase()
  const canReview = Boolean(documentId && ['uploaded', 'under_review'].includes(status) && typeof onReview === 'function')
  const canRemind = Boolean(item?.actionRequired && requirementId && typeof onReminder === 'function')
  const actionKey = (action) => `${item?.key || item?.id}:${action}`
  const isBusy = Boolean(busyAction)

  const submitRejection = async () => {
    if (rejectionReason.trim().length < 5) return
    const completed = await onReview?.({ item, document, action: 'reject', reason: rejectionReason.trim() })
    if (completed !== false) {
      setRejecting(false)
      setRejectionReason('')
    }
  }

  if (!canReview && !canRemind) return null

  return (
    <div className="mt-4 border-t border-[#e2eaf3] pt-4">
      {rejecting ? (
        <div className="rounded-[14px] border border-[#f1d0cd] bg-[#fff8f7] p-3">
          <label htmlFor={`seller-document-rejection-${item?.key || item?.id}`} className="text-xs font-semibold text-[#7f312b]">
            Why must the seller replace this file?
          </label>
          <textarea
            id={`seller-document-rejection-${item?.key || item?.id}`}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            rows={3}
            disabled={isBusy}
            placeholder="For example: The statement is older than three months or the account number is cropped."
            className="mt-2 w-full resize-y rounded-[10px] border border-[#e2b8b4] bg-white px-3 py-2 text-sm text-[#243d56] outline-none focus:border-[#bd665e] focus:ring-2 focus:ring-[#f7dedb] disabled:opacity-60"
          />
          <p className="mt-1 text-[0.72rem] text-[#8d5752]">This reason is shown to the seller and recorded in the audit trail.</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={isBusy}
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-3 text-xs font-semibold text-[#52657b] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitRejection()}
              disabled={isBusy || rejectionReason.trim().length < 5}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#a43d35] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === actionKey('reject') ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Reject and request replacement
            </button>
          </div>
        </div>
      ) : (
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
          {canReview && status === 'uploaded' ? (
            <button
              type="button"
              onClick={() => void onReview?.({ item, document, action: 'start_review', reason: '' })}
              disabled={isBusy}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#d6e3f0] bg-[#f7fbff] px-3 text-xs font-semibold text-[#315b7d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === actionKey('start_review') ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}
              Start review
            </button>
          ) : null}
          {canReview ? (
            <>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#efcbc8] bg-[#fff8f7] px-3 text-xs font-semibold text-[#9a4038] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle size={14} />
                Reject
              </button>
              <button
                type="button"
                onClick={() => void onReview?.({ item, document, action: 'approve', reason: '' })}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#1f7a46] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === actionKey('approve') ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Approve
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default SellerDocumentReviewActions
