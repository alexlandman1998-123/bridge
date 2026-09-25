const STATUS_PRESENTATION = Object.freeze({
  complete: {
    key: 'complete',
    label: 'Complete',
    classes: 'border-[#cce8d6] bg-[#ecfaf1] text-[#1f7d44]',
  },
  awaiting_seller: {
    key: 'awaiting_seller',
    label: 'Awaiting seller',
    classes: 'border-[#efd9ae] bg-[#fff8ea] text-[#8a5b16]',
  },
  ready_for_review: {
    key: 'ready_for_review',
    label: 'Ready for review',
    classes: 'border-[#d2e2f3] bg-[#eef6ff] text-[#2f628d]',
  },
  not_requested: {
    key: 'not_requested',
    label: 'Not requested',
    classes: 'border-[#dfe6ee] bg-[#f4f6f8] text-[#607387]',
  },
  action_required: {
    key: 'action_required',
    label: 'Action required',
    classes: 'border-[#efcbc8] bg-[#fff7f6] text-[#963d35]',
  },
})

function normalize(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstValue(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function firstValidDate(...values) {
  for (const value of values) {
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return ''
}

export function resolveListingSellerDocumentStatus(document = {}) {
  const lifecycle = normalize(document?.lifecycleStatus || document?.lifecycle_status)
  const status = normalize(document?.status)
  const lifecycleStatus = lifecycle === 'under_review' ? 'ready_for_review' : lifecycle
  const resolved = STATUS_PRESENTATION[lifecycleStatus] ? lifecycleStatus : (
    ['approved', 'completed', 'verified', 'signed'].includes(status)
      ? 'complete'
      : ['requested', 'sent_for_signature', 'awaiting_remaining_signatures', 'awaiting_signed_hard_copy'].includes(status)
        ? 'awaiting_seller'
        : ['uploaded', 'under_review', 'awaiting_agent_review', 'ready_to_send'].includes(status)
          ? 'ready_for_review'
          : ['rejected', 'expired', 'correction_requested'].includes(status)
            ? 'action_required'
            : 'not_requested'
  )

  return STATUS_PRESENTATION[resolved] || STATUS_PRESENTATION.not_requested
}

export function buildListingSellerDocumentsSummary(documents = []) {
  const rows = (Array.isArray(documents) ? documents : []).map((document) => ({
    document,
    status: resolveListingSellerDocumentStatus(document),
  }))
  const counts = rows.reduce((summary, row) => {
    summary[row.status.key] += 1
    return summary
  }, {
    complete: 0,
    awaiting_seller: 0,
    ready_for_review: 0,
    not_requested: 0,
    action_required: 0,
  })
  return {
    total: rows.length,
    complete: counts.complete,
    awaitingSeller: counts.awaiting_seller,
    readyForReview: counts.ready_for_review,
    notRequested: counts.not_requested,
    actionRequired: counts.action_required,
    progressPercent: rows.length ? Math.round((counts.complete / rows.length) * 100) : 0,
  }
}

export function resolveListingSellerDocumentActions(document = {}) {
  const status = resolveListingSellerDocumentStatus(document).key
  const linkedDocument = document?.linkedDocument || document?.upload || null
  const documentId = String(linkedDocument?.id || '').trim()
  const requirementId = String(document?.requirementId || document?.requirement_id || document?.id || '').trim()
  const hasFile = Boolean(document?.uploaded || document?.hasUploadedDocument || documentId)
  const canOpen = document?.canDownload !== false && Boolean(
    document?.url || document?.filePath || document?.generatedHtml ||
    (document?.packetId && document?.packetVersionId),
  )

  return {
    status,
    requirementId,
    documentId,
    canRequest: status === 'not_requested' && Boolean(requirementId),
    canRemind: ['awaiting_seller', 'action_required'].includes(status) && Boolean(requirementId) && !hasFile,
    canReview: status === 'ready_for_review' && Boolean(documentId),
    canUpload: document?.canUpload !== false,
    canOpen,
    uploadLabel: hasFile ? 'Replace' : 'Upload',
  }
}

export function resolveListingSellerDocumentActivity(document = {}) {
  const status = resolveListingSellerDocumentStatus(document).key
  const requirement = document?.original?.requirement || {}
  const linkedDocument = document?.linkedDocument || document?.upload || document?.original?.document || {}
  const requestedAt = firstValidDate(
    document?.requestedAt,
    document?.requested_at,
    requirement?.requestedAt,
    requirement?.requested_at,
    requirement?.createdAt,
    requirement?.created_at,
  )
  const remindedAt = firstValidDate(
    document?.lastReminderAt,
    document?.last_reminder_at,
    requirement?.lastReminderAt,
    requirement?.last_reminder_at,
    requirement?.reminderSentAt,
    requirement?.reminder_sent_at,
  )
  const uploadedAt = firstValidDate(
    document?.uploadedOn,
    document?.uploadedAt,
    document?.uploaded_at,
    linkedDocument?.uploadedAt,
    linkedDocument?.uploaded_at,
    linkedDocument?.createdAt,
    linkedDocument?.created_at,
  )
  const reviewedAt = firstValidDate(
    document?.reviewedAt,
    document?.reviewed_at,
    linkedDocument?.reviewedAt,
    linkedDocument?.reviewed_at,
    linkedDocument?.approvedAt,
    linkedDocument?.approved_at,
    linkedDocument?.updatedAt,
    linkedDocument?.updated_at,
  )

  if (status === 'complete') {
    return {
      nextActorLabel: 'No action needed',
      lastEventLabel: 'Approved',
      lastEventAt: reviewedAt || uploadedAt,
    }
  }
  if (status === 'ready_for_review') {
    return {
      nextActorLabel: 'Agent / compliance',
      lastEventLabel: 'Uploaded',
      lastEventAt: uploadedAt,
    }
  }
  if (status === 'awaiting_seller') {
    return {
      nextActorLabel: 'Seller',
      lastEventLabel: remindedAt ? 'Reminder sent' : 'Requested',
      lastEventAt: remindedAt || requestedAt,
    }
  }
  if (status === 'action_required') {
    return {
      nextActorLabel: 'Seller',
      lastEventLabel: firstValue(document?.rejectionReason, document?.rejection_reason, linkedDocument?.rejectionReason, linkedDocument?.rejection_reason)
        ? 'Replacement requested'
        : 'Correction required',
      lastEventAt: reviewedAt || uploadedAt || remindedAt || requestedAt,
    }
  }
  return {
    nextActorLabel: 'Agent',
    lastEventLabel: 'Not requested yet',
    lastEventAt: '',
  }
}

export { STATUS_PRESENTATION as LISTING_SELLER_DOCUMENT_STATUS_PRESENTATION }
