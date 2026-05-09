export function normalizeDocumentStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (
    [
      'required',
      'requested',
      'uploaded',
      'under_review',
      'rejected',
      'approved',
      'completed',
      'not_applicable',
      'cancelled',
    ].includes(normalized)
  ) {
    return normalized
  }
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'accepted') return 'approved'
  if (normalized === 'missing') return 'required'
  if (!normalized) return 'required'
  return normalized
}

export function getDocumentStatusLabel(status = '') {
  const normalized = normalizeDocumentStatus(status)
  const labels = {
    required: 'Required',
    requested: 'Requested',
    uploaded: 'Uploaded',
    under_review: 'Under Review',
    rejected: 'Rejected',
    approved: 'Approved',
    completed: 'Completed',
    not_applicable: 'Not Applicable',
    cancelled: 'Cancelled',
  }
  return labels[normalized] || String(status || 'Unknown')
}

export function getDocumentStatusTone(status = '') {
  const normalized = normalizeDocumentStatus(status)
  if (normalized === 'rejected') {
    return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  }
  if (normalized === 'required' || normalized === 'requested') {
    return 'border-[#f1ddd0] bg-[#fff8f3] text-[#a15b31]'
  }
  if (normalized === 'uploaded' || normalized === 'under_review') {
    return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
  }
  if (normalized === 'approved' || normalized === 'completed') {
    return 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
  }
  if (normalized === 'cancelled' || normalized === 'not_applicable') {
    return 'border-[#dde7f1] bg-[#f8fbff] text-[#6b7d93]'
  }
  return 'border-[#dde7f1] bg-[#f8fbff] text-[#64748b]'
}

