import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Download,
  FileSignature,
  FileText,
  Home,
  Landmark,
  ShieldCheck,
} from 'lucide-react'
import { normalizeDocumentStatus } from '../../../lib/clientPortalDocumentStatus'
import ClientDocumentUploadButton from './ClientDocumentUploadButton'

function formatDocumentDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStatusPresentation(status = '') {
  const normalized = normalizeDocumentStatus(status)
  if (normalized === 'rejected') {
    return {
      label: 'Rejected',
      classes: 'border-[#f3c2c2] bg-[#fff1f1] text-[#b42318]',
    }
  }
  if (normalized === 'required' || normalized === 'requested') {
    return {
      label: 'Outstanding',
      classes: 'border-[#f4c7c3] bg-[#fff3f1] text-[#c24138]',
    }
  }
  if (normalized === 'uploaded') {
    return {
      label: 'Uploaded',
      classes: 'border-[#cfe0f4] bg-[#eff6ff] text-[#1d5fa7]',
    }
  }
  if (normalized === 'under_review') {
    return {
      label: 'Under Review',
      classes: 'border-[#f1d5a5] bg-[#fff7e8] text-[#b66a11]',
    }
  }
  if (normalized === 'approved' || normalized === 'completed') {
    return {
      label: 'Approved',
      classes: 'border-[#cfe8d8] bg-[#eefbf3] text-[#1f7a46]',
    }
  }
  return {
    label: 'Outstanding',
    classes: 'border-[#dbe5ef] bg-[#f8fbff] text-[#52657b]',
  }
}

function getCategoryPresentation(categoryKey = '') {
  const normalized = String(categoryKey || '').trim().toLowerCase()
  if (normalized === 'sales') {
    return {
      label: 'Sales',
      icon: FileSignature,
      chipClasses: 'border-[#d8e0f1] bg-[#f8faff] text-[#48607e]',
      tileClasses: 'border-[#d8e0f1] bg-[#f8faff] text-[#48607e]',
    }
  }
  if (normalized === 'finance') {
    return {
      label: 'Finance',
      icon: Landmark,
      chipClasses: 'border-[#d7eadf] bg-[#f3fbf6] text-[#256c49]',
      tileClasses: 'border-[#d7eadf] bg-[#f3fbf6] text-[#256c49]',
    }
  }
  if (normalized === 'fica') {
    return {
      label: 'FICA',
      icon: ShieldCheck,
      chipClasses: 'border-[#d7e2f1] bg-[#f6f9fd] text-[#38536f]',
      tileClasses: 'border-[#d8e7f5] bg-[#f4f8fc] text-[#43617f]',
    }
  }
  if (normalized === 'mandate') {
    return {
      label: 'Mandate',
      icon: FileSignature,
      chipClasses: 'border-[#d8e0f1] bg-[#f8faff] text-[#48607e]',
      tileClasses: 'border-[#d8e0f1] bg-[#f8faff] text-[#48607e]',
    }
  }
  if (normalized === 'transfer') {
    return {
      label: 'Transfer',
      icon: Landmark,
      chipClasses: 'border-[#dde4ef] bg-[#f8fbff] text-[#4c6078]',
      tileClasses: 'border-[#dde4ef] bg-[#f8fbff] text-[#4c6078]',
    }
  }
  if (normalized === 'additional') {
    return {
      label: 'Additional Request',
      icon: Bell,
      chipClasses: 'border-[#e2ddf6] bg-[#faf8ff] text-[#5f558c]',
      tileClasses: 'border-[#e2ddf6] bg-[#faf8ff] text-[#5f558c]',
    }
  }
  return {
    label: 'Property',
    icon: Home,
    chipClasses: 'border-[#dce5ef] bg-[#f8fbff] text-[#475f79]',
    tileClasses: 'border-[#dce5ef] bg-[#f8fbff] text-[#475f79]',
  }
}

function getUploadStateLabel(item = {}, normalizedStatus = '') {
  const uploadedAt = formatDocumentDate(item?.linkedDocument?.created_at || item?.linkedDocument?.uploaded_at || item?.linkedDocument?.uploadedAt)
  if (normalizedStatus === 'approved' || normalizedStatus === 'completed') {
    return uploadedAt ? `Uploaded ${uploadedAt}` : 'Reviewed and accepted'
  }
  if (normalizedStatus === 'under_review') {
    return uploadedAt ? `Uploaded ${uploadedAt}` : 'Uploaded and in review'
  }
  if (normalizedStatus === 'uploaded') {
    return uploadedAt ? `Uploaded ${uploadedAt}` : 'Uploaded'
  }
  if (normalizedStatus === 'rejected') {
    return uploadedAt ? `Uploaded ${uploadedAt}` : 'Uploaded'
  }
  return item?.hasUploadedDocument && uploadedAt ? `Uploaded ${uploadedAt}` : 'Not uploaded'
}

function getSupportingLine(item = {}, normalizedStatus = '') {
  if (item?.message) return item.message
  if (normalizedStatus === 'rejected' && item?.rejectionReason) {
    return `Reason: ${item.rejectionReason}`
  }
  if (normalizedStatus === 'approved' || normalizedStatus === 'completed') {
    return item?.metaLine || 'Reviewed by your transaction team'
  }
  if (normalizedStatus === 'under_review') {
    return item?.metaLine || 'Your upload is currently being reviewed.'
  }
  if (normalizedStatus === 'uploaded') {
    return item?.metaLine || 'Your upload has been received and is waiting for review.'
  }
  if (normalizedStatus === 'rejected') {
    return item?.metaLine || 'Please upload a corrected or clearer file to continue.'
  }
  return item?.metaLine || 'Required before your transaction can move forward.'
}

function buildPrimaryAction(item = {}, normalizedStatus = '', canUpload = false, canOpen = false) {
  if (normalizedStatus === 'rejected' && canUpload) return { type: 'upload', label: 'Re-upload' }
  if ((normalizedStatus === 'required' || normalizedStatus === 'requested') && canUpload) {
    return { type: 'upload', label: 'Upload' }
  }
  if (canOpen) {
    return { type: 'view', label: String(item?.openLabel || 'View').trim() || 'View' }
  }
  return null
}

function SellerDocumentRow({
  item = {},
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const uploadKey = String(item?.uploadKey || item?.id || '').trim()
  const canUpload = Boolean(uploadKey && item?.uploadSpec && typeof onUpload === 'function')
  const canOpen = Boolean(item?.linkedDocument)
  const normalizedStatus = normalizeDocumentStatus(item?.status || '')
  const status = getStatusPresentation(normalizedStatus)
  const category = getCategoryPresentation(item?.sellerCategoryKey || '')
  const Icon = item?.linkedDocument && (normalizedStatus === 'approved' || normalizedStatus === 'completed')
    ? CheckCircle2
    : normalizedStatus === 'under_review'
      ? Clock3
      : normalizedStatus === 'rejected'
        ? AlertTriangle
        : category.icon || FileText
  const openKey = String(item?.linkedDocument?.file_path || item?.linkedDocument?.id || '').trim()
  const opening = Boolean(openKey && openingDocumentPath === openKey)
  const primaryAction = buildPrimaryAction(item, normalizedStatus, canUpload, canOpen)
  const uploadStateLabel = getUploadStateLabel(item, normalizedStatus)
  const supportingLine = getSupportingLine(item, normalizedStatus)
  const whyNeeded = String(item?.education || 'This document supports compliance, legal, or finance progression.').trim()

  return (
    <article className="rounded-[22px] border border-[#dde6f0] bg-white px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)] sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3.5">
          <span className={`mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border ${category.tileClasses}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]">{item?.title || 'Document'}</h4>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.69rem] font-semibold ${status.classes}`}>
                {status.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#5f7288]">
              {item?.description || 'Supporting document required for your transaction.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.69rem] font-semibold ${category.chipClasses}`}>
                {item?.sellerCategoryLabel || category.label}
              </span>
              {item?.isCoreRequirement ? (
                <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-2.5 py-1 text-[0.69rem] font-semibold text-[#52657b]">
                  Required
                </span>
              ) : null}
              {item?.stageLabel ? (
                <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-2.5 py-1 text-[0.69rem] font-semibold text-[#52657b]">
                  {item.stageLabel}
                </span>
              ) : null}
              {item?.overdue ? (
                <span className="inline-flex items-center rounded-full border border-[#f3c2c2] bg-[#fff1f1] px-2.5 py-1 text-[0.69rem] font-semibold text-[#b42318]">
                  Overdue
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-1.5">
              <p className="text-[0.78rem] font-medium text-[#41576e]">
                <span className="font-semibold text-[#142132]">Upload state:</span> {uploadStateLabel}
              </p>
              <p className="text-[0.78rem] leading-5 text-[#70839b]">{supportingLine}</p>
              {item?.handoff?.applicable ? (
                <p className={`text-[0.78rem] leading-5 ${item.handoff.status === 'blocked' ? 'text-[#b42318]' : 'text-[#60748a]'}`}>
                  <span className="font-semibold">Transfer handoff:</span> {item.handoff.label}
                </p>
              ) : null}
            </div>
            <details className="mt-3 group">
              <summary className="cursor-pointer list-none text-[0.78rem] font-semibold text-[#2f6fa4] transition hover:text-[#214e72]">
                <span className="inline-flex items-center gap-1.5">
                  <FileText size={13} />
                  Why needed?
                </span>
              </summary>
              <div className="mt-2 rounded-[14px] border border-[#e2eaf3] bg-[#f8fbff] px-3 py-2 text-[0.78rem] leading-5 text-[#60748a]">
                {whyNeeded}
              </div>
            </details>
          </div>
        </div>

        {primaryAction ? (
          <div className="flex shrink-0 items-center lg:pl-4">
            {primaryAction.type === 'upload' ? (
              <ClientDocumentUploadButton
                uploadKey={uploadKey}
                label={primaryAction.label}
                uploadingDocumentKey={uploadingDocumentKey}
                onUpload={onUpload}
                uploadSpec={item.uploadSpec}
                className="min-h-[42px] rounded-[13px] border-[#cddbeb] bg-[#f6faff] px-4 py-2 text-sm text-[#244c6d] hover:border-[#b8ccdf] hover:bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={() => onOpenDocument?.(item.linkedDocument)}
                disabled={opening}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-[13px] border border-[#d8e3ef] bg-white px-4 py-2 text-sm font-semibold text-[#274865] transition hover:border-[#c5d4e3] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Download size={14} />
                {opening ? 'Opening...' : primaryAction.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default SellerDocumentRow
