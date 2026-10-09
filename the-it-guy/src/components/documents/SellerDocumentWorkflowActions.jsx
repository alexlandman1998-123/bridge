import React from 'react'
import { buildSellerDocumentWorkflow } from '../../core/documents/sellerDocumentWorkflow.js'

export default function SellerDocumentWorkflowActions({ item, copy, request, busy = false, onlineEnabled = true, onDownload, onSend, onUpload, onReview, onRefresh, accept = '.pdf,.png,.jpg,.jpeg,.doc,.docx' }) {
  const workflow = buildSellerDocumentWorkflow({ item, copy, request })
  const buttonClass = 'min-h-9 rounded-lg border border-[#cfdceb] bg-white px-3 py-2 text-left text-xs font-semibold text-[#315b7a] disabled:cursor-not-allowed disabled:opacity-50'
  return <div className="w-full min-w-0 space-y-2" aria-label={`${item?.label || copy?.name || 'Seller document'} workflow`}>
    <p role="status" className="text-xs font-semibold text-[#243d56]">{workflow.label}</p>
    {workflow.detail ? <p className="text-xs leading-5 text-[#607387]">{workflow.detail}</p> : null}
    <div className="flex flex-wrap gap-2">
      {copy || workflow.canPrepare ? <button type="button" className={buttonClass} disabled={busy} onClick={onDownload}>{copy ? 'Download reviewed copy' : 'Generate and download'}</button> : null}
      {workflow.canSend ? <button type="button" className={buttonClass} disabled={busy || !onlineEnabled} onClick={onSend}>{workflow.sendLabel}</button> : null}
      {workflow.canUpload && item?.canUpload !== false && item?.can_upload !== false ? <label className={`${buttonClass} ${busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        Upload existing
        <input type="file" className="sr-only" aria-label={`Upload existing ${item?.label || copy?.name || 'seller document'}`} accept={accept} disabled={busy} onChange={onUpload} />
      </label> : null}
      {workflow.canReview ? <button type="button" className={buttonClass} disabled={busy} onClick={onReview}>Review signed copy</button> : null}
      {workflow.canRefresh ? <button type="button" className={buttonClass} disabled={busy} onClick={onRefresh}>Refresh signing status</button> : null}
    </div>
    {!onlineEnabled && workflow.canSend ? <p className="text-xs text-[#607387]">Online signing is currently unavailable.</p> : null}
    {workflow.canRefresh ? <p className="text-xs text-[#607387]">Review the active signing request before switching to an uploaded copy.</p> : null}
  </div>
}
