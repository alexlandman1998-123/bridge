const SATISFIED_STATUSES = new Set(['approved', 'completed', 'verified', 'signed'])
const RECEIVED_STATUSES = new Set(['uploaded', 'under_review', 'reviewed', 'received', 'submitted'])
const ACTION_STATUSES = new Set(['required', 'requested', 'missing', 'rejected', 'expired'])
const EXCLUDED_STATUSES = new Set(['cancelled', 'not_applicable', 'not_required'])

const STAGE_CONFIG = [
  { key: 'mandate_ready', label: 'Before mandate', rank: 10 },
  { key: 'listing_ready', label: 'Before listing', rank: 20 },
  { key: 'otp_ready', label: 'Before accepting an offer', rank: 30 },
  { key: 'attorney_instruction_ready', label: 'Transfer handoff', rank: 40 },
  { key: 'lodgement_ready', label: 'Before lodgement', rank: 50 },
]

function text(value = '') {
  return String(value || '').trim()
}

export function normalizeSellerDocumentExperienceKey(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function normalizeSellerDocumentExperienceStatus(value = '') {
  const normalized = normalizeSellerDocumentExperienceKey(value)
  if (!normalized) return 'required'
  if (normalized === 'accepted') return 'approved'
  if (normalized === 'complete') return 'completed'
  if (normalized === 'reviewed') return 'under_review'
  if (normalized === 'received' || normalized === 'submitted') return 'uploaded'
  if (normalized === 'missing') return 'required'
  return normalized
}

function values(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function firstDate(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    const date = new Date(candidate)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function requirementIdentity(requirement = {}) {
  return text(requirement.requirementId || requirement.requirement_id || requirement.id)
}

function requirementKey(requirement = {}) {
  return normalizeSellerDocumentExperienceKey(
    requirement.key || requirement.requirementKey || requirement.requirement_key || requirement.documentType || requirement.document_type,
  )
}

function documentMatchesRequirement(document = {}, requirement = {}) {
  const requiredId = requirementIdentity(requirement)
  const documentRequirementId = text(document.requirementId || document.requirement_id)
  if (requiredId && documentRequirementId) return requiredId === documentRequirementId

  const requiredKey = requirementKey(requirement)
  const documentKey = normalizeSellerDocumentExperienceKey(
    document.requirementKey || document.requirement_key || document.documentType || document.document_type,
  )
  return Boolean(requiredKey && documentKey && requiredKey === documentKey)
}

function linkedDocumentFor(requirement = {}, documents = []) {
  const originalDocument = requirement.original?.document && typeof requirement.original.document === 'object'
    ? requirement.original.document
    : null
  const embedded = requirement.linkedDocument || requirement.linked_document || requirement.uploadedDocument || requirement.uploaded_document || requirement.upload || originalDocument
  if (embedded && typeof embedded === 'object') return originalDocument ? { ...originalDocument, ...embedded } : embedded
  return documents.find((document) => documentMatchesRequirement(document, requirement)) || null
}

function getStage(requirement = {}) {
  const requestedStages = values(
    requirement.requestStages || requirement.request_stages || requirement.requestStage || requirement.request_stage,
  ).map(normalizeSellerDocumentExperienceKey)
  const matched = STAGE_CONFIG.find((stage) => requestedStages.includes(stage.key))
  if (matched) return matched

  const context = normalizeSellerDocumentExperienceKey(requirement.contextType || requirement.context_type || requirement.scope)
  if (context === 'transaction') return STAGE_CONFIG[3]
  return STAGE_CONFIG[1]
}

function statusBucket(status = '') {
  if (SATISFIED_STATUSES.has(status)) return 'approved'
  if (RECEIVED_STATUSES.has(status)) return 'received'
  if (status === 'rejected') return 'rejected'
  if (EXCLUDED_STATUSES.has(status)) return 'excluded'
  return 'outstanding'
}

function statusLabel(status = '') {
  const labels = {
    required: 'Upload required',
    requested: 'Upload requested',
    expired: 'Updated document required',
    rejected: 'Correction required',
    uploaded: 'Received — awaiting review',
    under_review: 'Under review',
    approved: 'Approved',
    completed: 'Approved',
    verified: 'Verified',
    signed: 'Signed and accepted',
  }
  return labels[status] || 'Upload required'
}

function handoffFor(requirement = {}, document = {}, bucket = '') {
  const promotionStatus = normalizeSellerDocumentExperienceKey(
    document?.promotionStatus || document?.promotion_status || requirement.promotionStatus || requirement.promotion_status,
  )
  const promotedDocumentId = text(
    document?.promotedDocumentId || document?.promoted_document_id || document?.sharedDocumentId || document?.shared_document_id ||
      requirement.promotedDocumentId || requirement.promoted_document_id,
  )
  const transactionId = text(document?.transactionId || document?.transaction_id || requirement.transactionId || requirement.transaction_id)
  const promotionError = text(document?.promotionError || document?.promotion_error || requirement.promotionError || requirement.promotion_error)
  const applicable = Boolean(promotionStatus || promotedDocumentId || transactionId)
  if (!applicable) return { applicable: false, status: 'not_started', label: 'Starts when a transaction is created' }
  if (promotionError || ['failed', 'blocked', 'error'].includes(promotionStatus)) {
    return { applicable: true, status: 'blocked', label: 'Handoff needs attention', error: promotionError }
  }
  if (promotedDocumentId || ['promoted', 'completed', 'ready'].includes(promotionStatus)) {
    return { applicable: true, status: 'ready', label: 'Available to the transfer team' }
  }
  if (bucket === 'approved') return { applicable: true, status: 'pending', label: 'Approved — transfer copy pending' }
  return { applicable: true, status: 'waiting', label: 'Waiting for approval' }
}

function sellerMessage({ bucket, overdue, rejectionReason, dueDate }) {
  if (bucket === 'rejected') return rejectionReason ? `Please correct this: ${rejectionReason}` : 'Please upload a corrected or clearer document.'
  if (overdue) return `This was due ${dueDate.toLocaleDateString('en-ZA')}. Please upload it now.`
  if (bucket === 'outstanding') return dueDate ? `Please upload by ${dueDate.toLocaleDateString('en-ZA')}.` : 'Please upload this document.'
  if (bucket === 'received') return 'We have your file. Your transaction team still needs to approve it.'
  if (bucket === 'approved') return 'Reviewed and accepted. No further action is needed.'
  return ''
}

function agentMessage({ bucket, overdue, rejectionReason, handoff }) {
  if (bucket === 'rejected') return rejectionReason ? `Seller correction required: ${rejectionReason}` : 'Seller re-upload required.'
  if (overdue) return 'Seller follow-up is overdue.'
  if (bucket === 'outstanding') return 'Awaiting seller upload.'
  if (bucket === 'received') return 'Review and approve or reject the submitted file.'
  if (handoff.status === 'blocked') return handoff.error || 'Transaction handoff needs repair.'
  if (handoff.status === 'pending') return 'Approved source is waiting for transaction promotion.'
  return 'Assurance complete.'
}

function buildItem(requirement = {}, documents = [], now = new Date(), audience = 'seller') {
  const document = linkedDocumentFor(requirement, documents)
  const requirementStatus = normalizeSellerDocumentExperienceStatus(
    requirement.status || requirement.requiredDocumentStatus || requirement.required_document_status,
  )
  const documentStatus = document
    ? normalizeSellerDocumentExperienceStatus(document.status || document.document_status || 'uploaded')
    : ''
  const status = ['rejected', 'approved', 'completed', 'verified', 'signed'].includes(requirementStatus)
    ? requirementStatus
    : documentStatus || requirementStatus
  const bucket = statusBucket(status)
  const dueDate = firstDate(requirement.dueDate, requirement.due_date, requirement.requestDueAt, requirement.request_due_at)
  const overdue = Boolean(dueDate && dueDate.getTime() < now.getTime() && ['outstanding', 'rejected'].includes(bucket))
  const stage = getStage(requirement)
  const rejectionReason = text(
    requirement.rejectionReason || requirement.rejection_reason || document?.rejectionReason || document?.rejection_reason || document?.rejected_reason,
  )
  const handoff = handoffFor(requirement, document, bucket)
  const required = requirement.required !== false && requirement.is_required !== false
  const applicable = requirement.applicable !== false && !EXCLUDED_STATUSES.has(status)
  const messageInput = { bucket, overdue, rejectionReason, dueDate, handoff }

  return {
    ...requirement,
    id: text(requirement.id || requirement.requirementId || requirement.requirement_id) || `seller_document_${requirementKey(requirement)}`,
    key: requirementKey(requirement),
    title: text(requirement.title || requirement.label || requirement.requirementName || requirement.requirement_name) || 'Seller document',
    description: text(requirement.description || requirement.requirementDescription || requirement.requirement_description),
    status,
    statusBucket: bucket,
    statusLabel: statusLabel(status),
    required,
    applicable,
    dueDate: dueDate?.toISOString() || '',
    overdue,
    rejectionReason,
    stageKey: stage.key,
    stageLabel: stage.label,
    stageRank: stage.rank,
    linkedDocument: document,
    hasUploadedDocument: Boolean(document || requirement.hasUpload || requirement.hasUploadedDocument || requirement.uploaded),
    actionRequired: required && applicable && ['outstanding', 'rejected'].includes(bucket),
    reviewRequired: required && applicable && bucket === 'received',
    satisfied: required && applicable && bucket === 'approved',
    message: audience === 'agent' ? agentMessage(messageInput) : sellerMessage(messageInput),
    handoff,
  }
}

export function buildSellerDocumentExperienceModel({
  requirements = [],
  documents = [],
  audience = 'seller',
  now = new Date(),
} = {}) {
  const resolvedNow = now instanceof Date ? now : new Date(now)
  const items = (Array.isArray(requirements) ? requirements : [])
    .map((requirement) => buildItem(requirement, Array.isArray(documents) ? documents : [], resolvedNow, audience))
    .filter((item) => item.required && item.applicable)
    .sort((left, right) => left.stageRank - right.stageRank || left.title.localeCompare(right.title))
  const counts = items.reduce((summary, item) => {
    summary[item.statusBucket] = (summary[item.statusBucket] || 0) + 1
    if (item.overdue) summary.overdue += 1
    if (item.handoff.status === 'blocked') summary.handoffBlocked += 1
    if (item.handoff.status === 'pending') summary.handoffPending += 1
    if (item.handoff.status === 'ready') summary.handoffReady += 1
    return summary
  }, { outstanding: 0, received: 0, approved: 0, rejected: 0, overdue: 0, handoffBlocked: 0, handoffPending: 0, handoffReady: 0 })
  const total = items.length
  const approved = counts.approved
  const received = counts.received
  const actionRequired = counts.outstanding + counts.rejected
  const stages = STAGE_CONFIG.map((stage) => {
    const stageItems = items.filter((item) => item.stageKey === stage.key)
    return {
      ...stage,
      items: stageItems,
      total: stageItems.length,
      approved: stageItems.filter((item) => item.satisfied).length,
      actionRequired: stageItems.filter((item) => item.actionRequired).length,
      reviewRequired: stageItems.filter((item) => item.reviewRequired).length,
    }
  }).filter((stage) => stage.total > 0)
  const ready = total > 0 && approved === total
  const nextItem = items.find((item) => item.actionRequired) || items.find((item) => item.reviewRequired) || items.find((item) => item.handoff.status === 'blocked') || null

  return {
    version: 'seller_document_experience_p1_7_v1',
    audience,
    items,
    stages,
    summary: {
      total,
      approved,
      received,
      actionRequired,
      rejected: counts.rejected,
      overdue: counts.overdue,
      assurancePercent: total ? Math.round((approved / total) * 100) : 0,
      collectionPercent: total ? Math.round(((approved + received) / total) * 100) : 0,
      ready,
      reviewRequired: received,
      handoffBlocked: counts.handoffBlocked,
      handoffPending: counts.handoffPending,
      handoffReady: counts.handoffReady,
    },
    actionItems: items.filter((item) => item.actionRequired),
    reviewItems: items.filter((item) => item.reviewRequired),
    nextAction: nextItem
      ? { id: nextItem.id, title: nextItem.title, message: nextItem.message, stageLabel: nextItem.stageLabel }
      : ready
        ? { id: '', title: 'Documents approved', message: 'All applicable seller documents have been reviewed and accepted.', stageLabel: '' }
        : { id: '', title: 'No requirements generated', message: 'Complete seller onboarding to generate the document checklist.', stageLabel: '' },
  }
}

export { SATISFIED_STATUSES, RECEIVED_STATUSES, ACTION_STATUSES, STAGE_CONFIG }
