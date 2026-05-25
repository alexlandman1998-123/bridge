import { CheckCircle2, Clock3, FileCheck2, XCircle } from 'lucide-react'

function formatDate(value = '') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA')
}

function RequirementReviewState({ requirement = {} }) {
  const status = String(requirement.status || '').toLowerCase()
  const reviewer = requirement.reviewerRole ? requirement.reviewerRole.replace(/_/g, ' ') : ''
  const reviewedAt = formatDate(requirement.reviewed_at || requirement.reviewedAt)
  const generated = Boolean(requirement.generatedDocument)
  const uploaded = Boolean(requirement.uploadedDocument || requirement.hasLinkedDocument)

  let icon = <Clock3 size={15} />
  let title = 'Waiting for upload'
  let detail = requirement.requestedFromRole ? `Requested from ${requirement.requestedFromRole.replace(/_/g, ' ')}` : 'Upload this when available.'
  let className = 'border-[#dbe5ef] bg-[#f8fbff] text-[#52667c]'

  if (generated) {
    icon = <FileCheck2 size={15} />
    title = 'Generated document linked'
    detail = 'This signed or generated document is linked to the requirement.'
    className = 'border-[#ccebd8] bg-[#f0fbf4] text-[#1f7d44]'
  } else if (status === 'uploaded') {
    icon = <Clock3 size={15} />
    title = 'Uploaded, awaiting review'
    detail = reviewer ? `Waiting for ${reviewer} review.` : 'Waiting for review.'
    className = 'border-[#d8e6fb] bg-[#f2f7ff] text-[#245da8]'
  } else if (status === 'under_review') {
    icon = <Clock3 size={15} />
    title = 'Under review'
    detail = reviewer ? `Being reviewed by ${reviewer}.` : 'Being reviewed by the transaction team.'
    className = 'border-[#d8e6fb] bg-[#f2f7ff] text-[#245da8]'
  } else if (status === 'approved' || status === 'completed') {
    icon = <CheckCircle2 size={15} />
    title = status === 'completed' ? 'Completed' : 'Approved'
    detail = reviewedAt ? `Reviewed ${reviewedAt}.` : 'This requirement is satisfied.'
    className = 'border-[#ccebd8] bg-[#f0fbf4] text-[#1f7d44]'
  } else if (status === 'rejected') {
    icon = <XCircle size={15} />
    title = 'Rejected, replacement needed'
    detail = requirement.rejectionReason || 'Please upload a corrected replacement.'
    className = 'border-[#f5c4c4] bg-[#fff3f3] text-[#b42318]'
  } else if (status === 'waived') {
    icon = <CheckCircle2 size={15} />
    title = 'Waiver applied'
    detail = requirement.waiverReason || 'The transaction team waived this requirement.'
    className = 'border-[#e4d7f5] bg-[#f8f3ff] text-[#6c3aa1]'
  } else if (uploaded) {
    title = 'Upload linked'
    detail = 'A file is linked to this requirement.'
  }

  return (
    <div className={`mt-3 flex items-start gap-2 rounded-[14px] border px-3 py-2 text-xs leading-5 ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <strong className="block font-semibold">{title}</strong>
        <span>{detail}</span>
      </span>
    </div>
  )
}

export default RequirementReviewState
