import {
  getAttorneyOperationalState,
  getAttorneyTransferStage,
  stageLabelFromAttorneyKey,
} from './attorneySelectors'

export const ATTORNEY_OPERATIONAL_STAGE_SEQUENCE = [
  { key: 'instruction_received', label: 'Instruction Received' },
  { key: 'fica_onboarding', label: 'FICA / Onboarding' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'signing', label: 'Signing' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration_preparation', label: 'Registration Preparation' },
  { key: 'registered', label: 'Registered' },
]

export const DOCUMENT_REQUEST_PRIORITY_VALUES = ['required', 'important', 'optional']
export const DOCUMENT_REQUEST_STATUS_VALUES = ['requested', 'uploaded', 'reviewed', 'rejected', 'completed']
export const CHECKLIST_ITEM_STATUS_VALUES = ['pending', 'in_progress', 'completed', 'blocked', 'waived']

const CLIENT_WAITING_ROLES = new Set(['buyer', 'seller', 'client'])
const ATTORNEY_WAITING_ROLES = new Set(['attorney'])
const ROLE_LABELS = {
  buyer: 'Buyer',
  seller: 'Seller',
  client: 'Client',
  attorney: 'Attorney',
  bank: 'Bank',
  developer: 'Developer',
  agent: 'Agent',
  bond_originator: 'Bond Originator',
  internal_admin: 'Internal Team',
}

const REQUEST_OPEN_STATUSES = new Set(['requested', 'uploaded', 'reviewed', 'rejected'])
const REQUEST_DONE_STATUSES = new Set(['completed'])
const CHECKLIST_PENDING_STATUSES = new Set(['pending', 'in_progress', 'blocked'])
const CHECKLIST_DONE_STATUSES = new Set(['completed', 'waived'])

const PRIORITY_RANK = {
  required: 3,
  important: 2,
  optional: 1,
}

const CHECKLIST_TEMPLATE_BY_STAGE = {
  instruction_received: [
    {
      key: 'buyer-captured',
      label: 'Buyer captured',
      description: 'Core buyer details are captured for this file.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'seller-captured',
      label: 'Seller captured',
      description: 'Seller details are present where applicable.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'property-linked',
      label: 'Property / Unit linked',
      description: 'Matter is linked to a property or unit.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'attorney-assigned',
      label: 'Attorney assigned',
      description: 'Attorney ownership is assigned to this matter.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'instruction-basis-available',
      label: 'Source instruction / OTP available',
      description: 'Instruction basis or OTP source file is available.',
      priority: 'required',
      ownerRole: 'attorney',
    },
  ],
  fica_onboarding: [
    {
      key: 'buyer-id-received',
      label: 'Buyer ID received',
      description: 'Buyer identity document is uploaded.',
      priority: 'required',
      ownerRole: 'buyer',
      autoRuleKey: 'buyer_id_uploaded',
      isAutoManaged: true,
    },
    {
      key: 'buyer-proof-address-received',
      label: 'Buyer proof of address received',
      description: 'Valid proof of address received from buyer.',
      priority: 'required',
      ownerRole: 'buyer',
      autoRuleKey: 'buyer_proof_address_uploaded',
      isAutoManaged: true,
    },
    {
      key: 'seller-identity-docs-received',
      label: 'Seller identity docs received',
      description: 'Seller identity and compliance docs received when required.',
      priority: 'required',
      ownerRole: 'seller',
    },
    {
      key: 'stakeholder-contacts-complete',
      label: 'Stakeholder contact details complete',
      description: 'Stakeholder contact records are complete enough to proceed.',
      priority: 'important',
      ownerRole: 'attorney',
    },
    {
      key: 'compliance-forms-uploaded',
      label: 'Required compliance forms uploaded',
      description: 'Core compliance forms are uploaded and usable.',
      priority: 'required',
      ownerRole: 'attorney',
    },
  ],
  drafting: [
    {
      key: 'instruction-verified',
      label: 'Instruction basis verified',
      description: 'Instruction source and scope verified.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'draft-docs-prepared',
      label: 'Draft transfer documents prepared',
      description: 'Draft transfer pack is prepared for signing.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'upstream-docs-present',
      label: 'Required upstream docs present',
      description: 'Upstream documents needed for drafting are available.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'matter-details-reviewed',
      label: 'Matter details reviewed',
      description: 'Matter details reviewed before issuing signing pack.',
      priority: 'important',
      ownerRole: 'attorney',
    },
  ],
  signing: [
    {
      key: 'signing-pack-uploaded',
      label: 'Signing pack generated / uploaded',
      description: 'Signing pack is generated and uploaded.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'required-signatories-identified',
      label: 'Required signatories identified',
      description: 'All required signatories captured for the matter.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'signed-docs-received',
      label: 'Signed docs received',
      description: 'Signed documents have been received.',
      priority: 'required',
      ownerRole: 'buyer',
    },
  ],
  guarantees: [
    {
      key: 'guarantees-requested',
      label: 'Guarantees requested / expected',
      description: 'Guarantees have been requested where required.',
      priority: 'important',
      ownerRole: 'attorney',
    },
    {
      key: 'guarantees-received',
      label: 'Guarantee documents received',
      description: 'Guarantee documents are received from bank/originator.',
      priority: 'required',
      ownerRole: 'bank',
    },
    {
      key: 'guarantees-reviewed',
      label: 'Guarantees reviewed',
      description: 'Guarantees reviewed and confirmed usable.',
      priority: 'important',
      ownerRole: 'attorney',
    },
  ],
  clearances: [
    {
      key: 'clearance-figures-obtained',
      label: 'Clearance request made / figures obtained',
      description: 'Clearance figures requested and obtained.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'clearance-docs-uploaded',
      label: 'Required clearance docs uploaded',
      description: 'Clearance documents uploaded to file.',
      priority: 'required',
      ownerRole: 'attorney',
    },
  ],
  lodgement: [
    {
      key: 'lodgement-pack-prepared',
      label: 'Lodgement pack prepared',
      description: 'Lodgement pack is prepared and ready.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'prior-stage-blockers-resolved',
      label: 'Prior-stage blockers resolved',
      description: 'No blockers remain from prior stages.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'matter-ready-to-lodge',
      label: 'Matter marked ready to lodge / lodged',
      description: 'Matter has been marked for lodgement progression.',
      priority: 'required',
      ownerRole: 'attorney',
    },
  ],
  registration_preparation: [
    {
      key: 'lodgement-complete',
      label: 'Lodgement complete',
      description: 'Matter has progressed through lodgement.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'final-pre-reg-docs-ready',
      label: 'Final pre-registration docs in place',
      description: 'Final pre-registration documents are present.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'registration-prep-confirmed',
      label: 'Registration prep confirmed',
      description: 'Registration prep confirmation has been recorded.',
      priority: 'important',
      ownerRole: 'attorney',
    },
  ],
  registered: [
    {
      key: 'registration-confirmed',
      label: 'Registration confirmed',
      description: 'Registration completion has been confirmed.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'registration-date-recorded',
      label: 'Registration date recorded',
      description: 'Registration date is captured.',
      priority: 'required',
      ownerRole: 'attorney',
    },
    {
      key: 'registration-proof-uploaded',
      label: 'Final registration proof uploaded',
      description: 'Registration proof document uploaded.',
      priority: 'important',
      ownerRole: 'attorney',
    },
  ],
}

function normalizeDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getDaysSince(value) {
  const date = normalizeDateValue(value)
  if (!date) return 0
  const delta = Date.now() - date.getTime()
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.floor(delta / (1000 * 60 * 60 * 24))
}

function normalizeRole(value, fallback = 'attorney') {
  const normalized = toLower(value)
  if (!normalized) return fallback
  if (normalized === 'bond' || normalized === 'bondoriginator') return 'bond_originator'
  if (normalized === 'internal') return 'internal_admin'
  return normalized
}

export function normalizeDocumentRequestPriority(value) {
  const normalized = toLower(value)
  return DOCUMENT_REQUEST_PRIORITY_VALUES.includes(normalized) ? normalized : 'required'
}

export function normalizeDocumentRequestStatus(value) {
  const normalized = toLower(value)
  return DOCUMENT_REQUEST_STATUS_VALUES.includes(normalized) ? normalized : 'requested'
}

export function normalizeChecklistItemStatus(value) {
  const normalized = toLower(value)
  return CHECKLIST_ITEM_STATUS_VALUES.includes(normalized) ? normalized : 'pending'
}

export function mapLegacyAttorneyStageToOperationalStage(legacyStage, signalText = '') {
  const normalizedStage = toLower(legacyStage)
  const signal = String(signalText || '').toLowerCase()

  if (normalizedStage === 'registered') return 'registered'
  if (normalizedStage === 'lodged_at_deeds_office' || /lodged|deeds office/.test(signal)) return 'lodgement'
  if (normalizedStage === 'ready_for_lodgement') return 'registration_preparation'
  if (normalizedStage === 'documents_pending') return 'fica_onboarding'
  if (normalizedStage === 'instruction_received') return 'instruction_received'

  if (normalizedStage === 'preparation_in_progress') {
    if (/clearance|municipal|levy|duty/.test(signal)) return 'clearances'
    if (/guarantee|bond approved|bank/.test(signal)) return 'guarantees'
    if (/sign|signature/.test(signal)) return 'signing'
    return 'drafting'
  }

  return 'instruction_received'
}

export function resolveAttorneyOperationalStageKey(row = {}) {
  const explicit = toLower(row?.transaction?.attorney_stage || row?.transaction?.attorneyStage)
  if (ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.some((item) => item.key === explicit)) {
    return explicit
  }

  const legacyStage = getAttorneyTransferStage(row)
  const signal = `${row?.transaction?.next_action || ''} ${row?.transaction?.comment || ''}`
  return mapLegacyAttorneyStageToOperationalStage(legacyStage, signal)
}

export function getAttorneyOperationalStageLabel(stageKey) {
  return ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.find((item) => item.key === stageKey)?.label || 'Instruction Received'
}

export function getAttorneyOperationalStageIndex(stageKey) {
  const index = ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.findIndex((item) => item.key === stageKey)
  return index < 0 ? 0 : index
}

export function getDefaultChecklistTemplateForStage(stageKey) {
  return CHECKLIST_TEMPLATE_BY_STAGE[stageKey] || []
}

export function buildDefaultChecklistItemsForStage({ transactionId, stageKey }) {
  const template = getDefaultChecklistTemplateForStage(stageKey)
  return template.map((item, index) => ({
    transactionId: transactionId || null,
    stage: stageKey,
    label: item.label,
    description: item.description || null,
    status: 'pending',
    priority: item.priority || 'required',
    ownerRole: item.ownerRole || 'attorney',
    ownerUserId: null,
    linkedDocumentRequestId: null,
    linkedDocumentId: null,
    autoRuleKey: item.autoRuleKey || null,
    isAutoManaged: Boolean(item.isAutoManaged),
    completedBy: null,
    completedAt: null,
    overriddenBy: null,
    overrideReason: null,
    sortOrder: index,
  }))
}

function normalizeDocumentRequestEntry(row = {}) {
  const status = normalizeDocumentRequestStatus(row.status || row.request_status)
  const priority = normalizeDocumentRequestPriority(row.priority)
  return {
    id: row.id || null,
    transactionId: row.transactionId || row.transaction_id || null,
    category: row.category || 'General',
    documentType: row.documentType || row.document_type || null,
    title: row.title || row.document_label || row.documentType || row.document_type || 'Document Request',
    description: row.description || null,
    priority,
    dueDate: row.dueDate || row.due_date || null,
    assignedToRole: normalizeRole(row.assignedToRole || row.assigned_to_role, 'client'),
    assignedToUserId: row.assignedToUserId || row.assigned_to_user_id || null,
    requestGroupId: row.requestGroupId || row.request_group_id || null,
    stage: row.stage || row.stage_key || null,
    status,
    requiresReview:
      row.requiresReview === true ||
      row.requires_review === true ||
      (row.requiresReview !== false && row.requires_review !== false),
    requestedDocumentId: row.requestedDocumentId || row.requested_document_id || null,
    createdBy: row.createdBy || row.created_by || null,
    createdByRole: normalizeRole(row.createdByRole || row.created_by_role, 'attorney'),
    completedAt: row.completedAt || row.completed_at || null,
    rejectedReason: row.rejectedReason || row.rejected_reason || null,
    resendCount: Number(row.resendCount ?? row.resend_count ?? 0) || 0,
    lastResentAt: row.lastResentAt || row.last_resent_at || null,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  }
}

function normalizeChecklistEntry(row = {}) {
  return {
    id: row.id || null,
    transactionId: row.transactionId || row.transaction_id || null,
    stage: toLower(row.stage || row.stage_key || ''),
    label: row.label || 'Checklist item',
    description: row.description || null,
    status: normalizeChecklistItemStatus(row.status),
    priority: normalizeDocumentRequestPriority(row.priority),
    ownerRole: normalizeRole(row.ownerRole || row.owner_role, 'attorney'),
    ownerUserId: row.ownerUserId || row.owner_user_id || null,
    linkedDocumentRequestId: row.linkedDocumentRequestId || row.linked_document_request_id || null,
    linkedDocumentId: row.linkedDocumentId || row.linked_document_id || null,
    autoRuleKey: row.autoRuleKey || row.auto_rule_key || null,
    isAutoManaged: row.isAutoManaged === true || row.is_auto_managed === true,
    completedBy: row.completedBy || row.completed_by || null,
    completedAt: row.completedAt || row.completed_at || null,
    overriddenBy: row.overriddenBy || row.overridden_by || null,
    overrideReason: row.overrideReason || row.override_reason || null,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) || 0,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  }
}

function normalizeIssueOverrideEntry(row = {}) {
  return {
    id: row.id || null,
    transactionId: row.transactionId || row.transaction_id || null,
    issueType: toLower(row.issueType || row.issue_type),
    overriddenBy: row.overriddenBy || row.overridden_by || null,
    overrideReason: row.overrideReason || row.override_reason || null,
    resolveBy: row.resolveBy || row.resolve_by || null,
    isActive: row.isActive === true || row.is_active === true || row.isActive === undefined || row.is_active === undefined,
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  }
}

export function getDocumentRequestsForRow(row = {}) {
  const source = Array.isArray(row?.documentRequests) ? row.documentRequests : Array.isArray(row?.document_requests) ? row.document_requests : []
  return source.map((item) => normalizeDocumentRequestEntry(item))
}

export function getChecklistItemsForRow(row = {}) {
  const source = Array.isArray(row?.stageChecklistItems)
    ? row.stageChecklistItems
    : Array.isArray(row?.transactionChecklistItems)
      ? row.transactionChecklistItems
      : Array.isArray(row?.transaction_checklist_items)
        ? row.transaction_checklist_items
        : []
  return source.map((item) => normalizeChecklistEntry(item))
}

export function getIssueOverridesForRow(row = {}) {
  const source = Array.isArray(row?.issueOverrides)
    ? row.issueOverrides
    : Array.isArray(row?.transactionIssueOverrides)
      ? row.transactionIssueOverrides
      : Array.isArray(row?.transaction_issue_overrides)
        ? row.transaction_issue_overrides
        : []
  return source.map((item) => normalizeIssueOverrideEntry(item))
}

function isOpenRequest(request) {
  return REQUEST_OPEN_STATUSES.has(normalizeDocumentRequestStatus(request?.status))
}

function isCompletedRequest(request) {
  return REQUEST_DONE_STATUSES.has(normalizeDocumentRequestStatus(request?.status))
}

function getRequestPriorityScore(request) {
  return PRIORITY_RANK[normalizeDocumentRequestPriority(request?.priority)] || 1
}

function getChecklistPriorityScore(item) {
  return PRIORITY_RANK[normalizeDocumentRequestPriority(item?.priority)] || 1
}

function getChecklistIsBlocking(item) {
  const normalizedPriority = normalizeDocumentRequestPriority(item?.priority)
  if (normalizedPriority !== 'required') {
    return false
  }
  return CHECKLIST_PENDING_STATUSES.has(normalizeChecklistItemStatus(item?.status))
}

export function summarizeDocumentRequestsForRow(row = {}, nowValue = new Date()) {
  const requests = getDocumentRequestsForRow(row)
  const now = normalizeDateValue(nowValue) || new Date()

  const summary = {
    total: requests.length,
    openCount: 0,
    completedCount: 0,
    uploadedCount: 0,
    reviewedCount: 0,
    rejectedCount: 0,
    overdueCount: 0,
    requiredOpenCount: 0,
    awaitingAttorneyReviewCount: 0,
    waitingOnByRole: {},
    openRequests: [],
  }

  for (const request of requests) {
    const status = normalizeDocumentRequestStatus(request.status)
    const priority = normalizeDocumentRequestPriority(request.priority)
    const dueDate = normalizeDateValue(request.dueDate)

    if (isOpenRequest(request)) {
      summary.openCount += 1
      summary.openRequests.push(request)

      const role = normalizeRole(request.assignedToRole, 'client')
      summary.waitingOnByRole[role] = (summary.waitingOnByRole[role] || 0) + 1

      if (priority === 'required') {
        summary.requiredOpenCount += 1
      }

      if (request.requiresReview && ['uploaded', 'reviewed'].includes(status) && role === 'attorney') {
        summary.awaitingAttorneyReviewCount += 1
      }

      if (dueDate && dueDate.getTime() < now.getTime()) {
        summary.overdueCount += 1
      }
    }

    if (isCompletedRequest(request)) {
      summary.completedCount += 1
    }
    if (status === 'uploaded') summary.uploadedCount += 1
    if (status === 'reviewed') summary.reviewedCount += 1
    if (status === 'rejected') summary.rejectedCount += 1
  }

  summary.openRequests.sort((left, right) => {
    const priorityDelta = getRequestPriorityScore(right) - getRequestPriorityScore(left)
    if (priorityDelta !== 0) return priorityDelta
    const leftDue = normalizeDateValue(left.dueDate)?.getTime() || Number.POSITIVE_INFINITY
    const rightDue = normalizeDateValue(right.dueDate)?.getTime() || Number.POSITIVE_INFINITY
    return leftDue - rightDue
  })

  return summary
}

export function summarizeChecklistForRow(row = {}, { stageKey = null } = {}) {
  const currentStage = stageKey || resolveAttorneyOperationalStageKey(row)
  const items = getChecklistItemsForRow(row).filter((item) => !item.stage || item.stage === currentStage)

  const summary = {
    stageKey: currentStage,
    total: items.length,
    pendingCount: 0,
    completedCount: 0,
    blockedCount: 0,
    waivedCount: 0,
    requiredPendingCount: 0,
    importantPendingCount: 0,
    optionalPendingCount: 0,
    requiredPendingItems: [],
    items,
  }

  for (const item of items) {
    const status = normalizeChecklistItemStatus(item.status)
    const priority = normalizeDocumentRequestPriority(item.priority)

    if (CHECKLIST_PENDING_STATUSES.has(status)) {
      summary.pendingCount += 1
      if (priority === 'required') {
        summary.requiredPendingCount += 1
        summary.requiredPendingItems.push(item)
      } else if (priority === 'important') {
        summary.importantPendingCount += 1
      } else {
        summary.optionalPendingCount += 1
      }
    }
    if (CHECKLIST_DONE_STATUSES.has(status) && status !== 'waived') {
      summary.completedCount += 1
    }
    if (status === 'blocked') {
      summary.blockedCount += 1
    }
    if (status === 'waived') {
      summary.waivedCount += 1
    }
  }

  summary.requiredPendingItems.sort((left, right) => {
    const leftSort = Number(left.sortOrder || 0)
    const rightSort = Number(right.sortOrder || 0)
    return leftSort - rightSort
  })

  return summary
}

export function getInactivityFlagsForRow(row = {}, { warningDays = 3, riskDays = 7 } = {}) {
  const updatedAt =
    row?.transaction?.updated_at ||
    row?.transaction?.created_at ||
    row?.lastActivityAt ||
    row?.transaction?.last_meaningful_activity_at ||
    null
  const daysSinceLastActivity = getDaysSince(updatedAt)
  return {
    updatedAt,
    daysSinceLastActivity,
    isWarning: daysSinceLastActivity >= warningDays,
    isRisk: daysSinceLastActivity >= riskDays,
  }
}

function createIssue(issueType, { label, description, blocking = false, waitingOnRole = null, count = 1, metadata = {} } = {}) {
  return {
    issueType,
    label: label || issueType,
    description: description || '',
    blocking: Boolean(blocking),
    waitingOnRole: waitingOnRole ? normalizeRole(waitingOnRole) : null,
    count: Number(count || 0),
    metadata,
  }
}

function isIssueOverrideActive(override, nowValue = new Date()) {
  if (!override || !override.isActive) return false
  const now = normalizeDateValue(nowValue) || new Date()
  const resolveBy = normalizeDateValue(override.resolveBy)
  if (!resolveBy) return true
  return resolveBy.getTime() >= now.getTime()
}

export function applyIssueOverrides(issues = [], overrides = [], nowValue = new Date()) {
  const byIssueType = new Map()
  for (const override of overrides) {
    if (!override?.issueType) continue
    if (!isIssueOverrideActive(override, nowValue)) continue
    byIssueType.set(override.issueType, override)
  }

  const activeIssues = []
  const suppressedIssues = []

  for (const issue of issues) {
    const override = byIssueType.get(issue.issueType)
    if (override) {
      suppressedIssues.push({
        ...issue,
        suppressed: true,
        overrideReason: override.overrideReason || null,
        resolveBy: override.resolveBy || null,
      })
      continue
    }
    activeIssues.push(issue)
  }

  return { activeIssues, suppressedIssues }
}

export function getStageBlockersForRow(row = {}, options = {}) {
  const stageKey = options.stageKey || resolveAttorneyOperationalStageKey(row)
  const checklistSummary = summarizeChecklistForRow(row, { stageKey })
  const requestSummary = summarizeDocumentRequestsForRow(row, options.now)
  const blockers = []

  for (const item of checklistSummary.requiredPendingItems) {
    blockers.push({
      key: `checklist:${item.id || item.label}`,
      type: 'checklist_required_pending',
      label: item.label,
      description: item.description || 'Required checklist item pending.',
      ownerRole: item.ownerRole || 'attorney',
      sourceType: 'checklist',
      sourceId: item.id || null,
      priority: item.priority || 'required',
    })
  }

  for (const request of requestSummary.openRequests.filter((item) => normalizeDocumentRequestPriority(item.priority) === 'required')) {
    blockers.push({
      key: `request:${request.id || request.title}`,
      type: request.status === 'rejected' ? 'document_rejected' : 'required_document_request_open',
      label: request.title || request.documentType || 'Required document request',
      description:
        request.status === 'rejected'
          ? request.rejectedReason || 'Uploaded document was rejected and needs replacement.'
          : 'Required document request still open.',
      ownerRole: request.assignedToRole || 'client',
      sourceType: 'document_request',
      sourceId: request.id || null,
      priority: request.priority || 'required',
      dueDate: request.dueDate || null,
      status: request.status,
    })
  }

  blockers.sort((left, right) => {
    const priorityDelta = (PRIORITY_RANK[right.priority] || 0) - (PRIORITY_RANK[left.priority] || 0)
    if (priorityDelta !== 0) return priorityDelta
    const leftDue = normalizeDateValue(left.dueDate)?.getTime() || Number.POSITIVE_INFINITY
    const rightDue = normalizeDateValue(right.dueDate)?.getTime() || Number.POSITIVE_INFINITY
    return leftDue - rightDue
  })

  return {
    stageKey,
    blockers,
    hasBlockingItems: blockers.length > 0,
    checklistSummary,
    requestSummary,
  }
}

export function getWaitingOnRoleForRow(row = {}, options = {}) {
  const { requestSummary, checklistSummary, blockers } = getStageBlockersForRow(row, options)

  const rankedRoles = Object.entries(requestSummary.waitingOnByRole || {})
    .map(([role, count]) => ({ role, count: Number(count || 0) }))
    .sort((left, right) => right.count - left.count)

  if (rankedRoles.length) {
    const top = rankedRoles[0]
    return {
      role: top.role,
      label: ROLE_LABELS[top.role] || top.role,
      count: top.count,
      reason:
        top.role === 'attorney'
          ? 'Document uploads are waiting for attorney review.'
          : `Open document requests are waiting on ${ROLE_LABELS[top.role] || top.role}.`,
      source: 'document_requests',
    }
  }

  const checklistRoleCounts = checklistSummary.requiredPendingItems.reduce((accumulator, item) => {
    const role = normalizeRole(item.ownerRole || 'attorney')
    accumulator[role] = (accumulator[role] || 0) + 1
    return accumulator
  }, {})
  const checklistRoles = Object.entries(checklistRoleCounts)
    .map(([role, count]) => ({ role, count: Number(count || 0) }))
    .sort((left, right) => right.count - left.count)
  if (checklistRoles.length) {
    const top = checklistRoles[0]
    return {
      role: top.role,
      label: ROLE_LABELS[top.role] || top.role,
      count: top.count,
      reason: `Required checklist items are still pending with ${ROLE_LABELS[top.role] || top.role}.`,
      source: 'checklist',
    }
  }

  const fallbackState = getAttorneyOperationalState(row)
  if (!fallbackState.documentReadiness.ready) {
    return {
      role: 'buyer',
      label: 'Buyer',
      count: fallbackState.documentReadiness.missingCount || 1,
      reason: 'Required onboarding/FICA documents are still missing.',
      source: 'legacy_document_readiness',
    }
  }
  if (!fallbackState.financeStatus.ready) {
    return {
      role: 'bank',
      label: 'Bank',
      count: 1,
      reason: 'Finance guarantees or bank outputs are still pending.',
      source: 'legacy_finance_status',
    }
  }
  if (!fallbackState.clearanceStatus.ready) {
    return {
      role: 'seller',
      label: 'Seller',
      count: 1,
      reason: 'Clearance dependencies are still pending.',
      source: 'legacy_clearance_status',
    }
  }

  const attorneyOwnedBlocker = blockers.find((item) => normalizeRole(item.ownerRole) === 'attorney')
  if (attorneyOwnedBlocker) {
    return {
      role: 'attorney',
      label: 'Attorney',
      count: 1,
      reason: attorneyOwnedBlocker.description || 'Attorney follow-up is required.',
      source: 'blocker',
    }
  }

  return null
}

export function getNeedsAttentionIssuesForRow(row = {}, options = {}) {
  const inactivity = getInactivityFlagsForRow(row, options)
  const state = getAttorneyOperationalState(row)
  const { blockers, requestSummary } = getStageBlockersForRow(row, options)
  const waitingOn = getWaitingOnRoleForRow(row, options)
  const issues = []

  if (requestSummary.requiredOpenCount > 0) {
    issues.push(
      createIssue('missing_required_documents', {
        label: 'Missing required documents',
        description: `${requestSummary.requiredOpenCount} required document request(s) still open.`,
        blocking: true,
        waitingOnRole: waitingOn?.role || 'client',
        count: requestSummary.requiredOpenCount,
      }),
    )
  }

  if (requestSummary.rejectedCount > 0) {
    issues.push(
      createIssue('document_rejected', {
        label: 'Rejected documents',
        description: `${requestSummary.rejectedCount} document request(s) were rejected and need replacement.`,
        blocking: true,
        waitingOnRole: waitingOn?.role || null,
        count: requestSummary.rejectedCount,
      }),
    )
  }

  if (blockers.length > 0) {
    issues.push(
      createIssue('stage_blocked', {
        label: 'Stage blocked',
        description: `${blockers.length} blocking item(s) are preventing stage progression.`,
        blocking: true,
        waitingOnRole: waitingOn?.role || null,
        count: blockers.length,
      }),
    )
  }

  if (requestSummary.overdueCount > 0) {
    issues.push(
      createIssue('overdue_requests', {
        label: 'Overdue requests',
        description: `${requestSummary.overdueCount} request(s) are overdue.`,
        blocking: false,
        waitingOnRole: waitingOn?.role || null,
        count: requestSummary.overdueCount,
      }),
    )
  }

  if (inactivity.isRisk) {
    issues.push(
      createIssue('no_activity_risk', {
        label: 'No activity > 7 days',
        description: `No meaningful activity recorded for ${inactivity.daysSinceLastActivity} day(s).`,
        blocking: false,
        count: inactivity.daysSinceLastActivity,
      }),
    )
  } else if (inactivity.isWarning) {
    issues.push(
      createIssue('no_activity_warning', {
        label: 'No activity > 3 days',
        description: `No meaningful activity recorded for ${inactivity.daysSinceLastActivity} day(s).`,
        blocking: false,
        count: inactivity.daysSinceLastActivity,
      }),
    )
  }

  if (waitingOn?.role && CLIENT_WAITING_ROLES.has(waitingOn.role)) {
    issues.push(
      createIssue('waiting_on_client', {
        label: 'Waiting on client',
        description: waitingOn.reason || 'Client-side input is still pending.',
        blocking: false,
        waitingOnRole: waitingOn.role,
        count: waitingOn.count || 1,
      }),
    )
  } else if (waitingOn?.role && ATTORNEY_WAITING_ROLES.has(waitingOn.role)) {
    issues.push(
      createIssue('waiting_on_attorney', {
        label: 'Waiting on attorney',
        description: waitingOn.reason || 'Attorney follow-up is required.',
        blocking: false,
        waitingOnRole: waitingOn.role,
        count: waitingOn.count || 1,
      }),
    )
  } else if (waitingOn?.role === 'bank') {
    issues.push(
      createIssue('waiting_on_bank', {
        label: 'Waiting on bank',
        description: waitingOn.reason || 'Bank output is still pending.',
        blocking: false,
        waitingOnRole: waitingOn.role,
        count: waitingOn.count || 1,
      }),
    )
  }

  if (!state.financeStatus.ready) {
    issues.push(
      createIssue('guarantees_missing', {
        label: 'Guarantees missing',
        description: 'Guarantee outputs are not yet complete.',
        blocking: false,
        waitingOnRole: 'bank',
      }),
    )
  }

  if (!state.clearanceStatus.ready) {
    issues.push(
      createIssue('clearance_missing', {
        label: 'Clearance missing',
        description: 'Clearance figures/documents remain outstanding.',
        blocking: false,
        waitingOnRole: 'seller',
      }),
    )
  }

  const deduped = []
  const seen = new Set()
  for (const issue of issues) {
    if (seen.has(issue.issueType)) continue
    seen.add(issue.issueType)
    deduped.push(issue)
  }

  const overrides = getIssueOverridesForRow(row)
  const { activeIssues, suppressedIssues } = applyIssueOverrides(deduped, overrides, options.now)

  return {
    allIssues: deduped,
    activeIssues,
    suppressedIssues,
    blockers,
    waitingOn,
    inactivity,
    requestSummary,
  }
}

export function deriveAttorneyOperationalStateForRow(row = {}, options = {}) {
  const stageKey = resolveAttorneyOperationalStageKey(row)
  const stageLabel = getAttorneyOperationalStageLabel(stageKey)
  const legacyStageKey = getAttorneyTransferStage(row)
  const legacyStageLabel = stageLabelFromAttorneyKey(legacyStageKey)
  const issueState = getNeedsAttentionIssuesForRow(row, options)
  const waitingOn = issueState.waitingOn

  const hasBlockers = issueState.activeIssues.some((item) => item.blocking)
  const hasRisk = issueState.activeIssues.some((item) => item.issueType === 'no_activity_risk' || item.issueType === 'overdue_requests')

  let stateKey = 'on_track'
  let stateLabel = 'On Track'

  if (hasBlockers) {
    stateKey = 'blocked'
    stateLabel = 'Blocked'
  } else if (waitingOn?.role && ATTORNEY_WAITING_ROLES.has(waitingOn.role)) {
    stateKey = 'waiting_on_attorney'
    stateLabel = 'Waiting on Attorney'
  } else if (waitingOn?.role && CLIENT_WAITING_ROLES.has(waitingOn.role)) {
    stateKey = 'waiting_on_client'
    stateLabel = 'Waiting on Client'
  } else if (hasRisk) {
    stateKey = 'at_risk'
    stateLabel = 'At Risk'
  }

  return {
    stageKey,
    stageLabel,
    stageIndex: getAttorneyOperationalStageIndex(stageKey),
    legacyStageKey,
    legacyStageLabel,
    stateKey,
    stateLabel,
    waitingOnRole: waitingOn?.role || null,
    waitingOnLabel: waitingOn?.label || null,
    waitingOnReason: waitingOn?.reason || null,
    blockers: issueState.blockers,
    issues: issueState.activeIssues,
    suppressedIssues: issueState.suppressedIssues,
    inactivity: issueState.inactivity,
    requestSummary: issueState.requestSummary,
    checklistSummary: summarizeChecklistForRow(row, { stageKey }),
  }
}

export function canAdvanceAttorneyStage(row = {}, targetStage = null, options = {}) {
  const currentState = deriveAttorneyOperationalStateForRow(row, options)
  const currentIndex = currentState.stageIndex
  const targetKey = targetStage || currentState.stageKey
  const targetIndex = getAttorneyOperationalStageIndex(targetKey)
  const blockers = currentState.blockers
  const warnings = currentState.issues.filter((issue) => !issue.blocking)

  return {
    canAdvance: blockers.length === 0 && targetIndex >= currentIndex,
    blockers,
    warnings,
    currentStageKey: currentState.stageKey,
    targetStageKey: targetKey,
  }
}

export function inferAttorneyWorkQueueTasksForRow(row = {}, options = {}) {
  const state = deriveAttorneyOperationalStateForRow(row, options)
  const tasks = []
  const now = Date.now()
  const transactionId = row?.transaction?.id || null

  const pushTask = (task) => {
    if (!task) return
    tasks.push({
      transactionId,
      stage: state.stageKey,
      stageLabel: state.stageLabel,
      ownerRole: task.ownerRole || 'attorney',
      startedAt: task.startedAt || row?.transaction?.updated_at || row?.transaction?.created_at || null,
      ageInDays: task.startedAt ? getDaysSince(task.startedAt) : state.inactivity.daysSinceLastActivity,
      isAssignable: task.isAssignable !== false,
      status: task.status || 'open',
      priorityScore: Number(task.priorityScore || 0),
      sourceType: task.sourceType || 'derived',
      sourceId: task.sourceId || null,
      label: task.label || 'Attorney action required',
      taskType: task.taskType || 'attorney_action',
      reason: task.reason || '',
    })
  }

  if (state.requestSummary.awaitingAttorneyReviewCount > 0) {
    pushTask({
      taskType: 'review_uploaded_documents',
      label: 'Review uploaded documents',
      reason: `${state.requestSummary.awaitingAttorneyReviewCount} uploaded request(s) are waiting for attorney review.`,
      ownerRole: 'attorney',
      sourceType: 'document_request',
      priorityScore: 95,
    })
  }

  const attorneyOwnedRequired = state.checklistSummary.requiredPendingItems.filter(
    (item) => normalizeRole(item.ownerRole) === 'attorney',
  )
  if (attorneyOwnedRequired.length > 0) {
    pushTask({
      taskType: 'complete_required_checklist',
      label: 'Complete required checklist items',
      reason: `${attorneyOwnedRequired.length} required attorney-owned checklist item(s) are still pending.`,
      ownerRole: 'attorney',
      sourceType: 'checklist',
      sourceId: attorneyOwnedRequired[0]?.id || null,
      priorityScore: 90,
    })
  }

  if (state.stageKey === 'drafting') {
    pushTask({
      taskType: 'prepare_drafting_pack',
      label: 'Prepare drafting pack',
      reason: 'Drafting stage is active and requires legal pack preparation.',
      ownerRole: 'attorney',
      priorityScore: 84,
    })
  }

  if (state.stageKey === 'signing') {
    pushTask({
      taskType: 'send_signing_pack',
      label: 'Send / progress signing pack',
      reason: 'Signing stage is active and needs attorney progression.',
      ownerRole: 'attorney',
      priorityScore: 82,
    })
  }

  if (state.stageKey === 'guarantees' && state.waitingOnRole !== 'bank') {
    pushTask({
      taskType: 'follow_up_guarantees',
      label: 'Follow up on guarantees',
      reason: 'Guarantee stage is active and needs attorney follow-through.',
      ownerRole: 'attorney',
      priorityScore: 78,
    })
  }

  if (state.stageKey === 'registration_preparation') {
    pushTask({
      taskType: 'prepare_lodgement',
      label: 'Prepare lodgement',
      reason: 'Matter is in registration preparation and ready for lodgement actions.',
      ownerRole: 'attorney',
      priorityScore: 88,
    })
  }

  if (state.issues.some((item) => item.issueType === 'document_rejected')) {
    pushTask({
      taskType: 'resolve_rejected_request',
      label: 'Resolve rejected document request',
      reason: 'At least one request has been rejected and needs attorney follow-up.',
      ownerRole: 'attorney',
      priorityScore: 86,
    })
  }

  if (state.inactivity.isRisk) {
    pushTask({
      taskType: 'stale_file_follow_up',
      label: 'Escalate stale file',
      reason: `No meaningful update for ${state.inactivity.daysSinceLastActivity} day(s).`,
      ownerRole: 'attorney',
      priorityScore: 72,
    })
  }

  return tasks
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore
      }
      const leftTime = normalizeDateValue(left.startedAt)?.getTime() || now
      const rightTime = normalizeDateValue(right.startedAt)?.getTime() || now
      return leftTime - rightTime
    })
    .filter((task, index, all) => all.findIndex((entry) => entry.taskType === task.taskType) === index)
}

export function getAttorneyWorkQueueForRows(rows = [], options = {}) {
  const queue = []
  for (const row of rows || []) {
    if (!row?.transaction?.id) continue
    const state = deriveAttorneyOperationalStateForRow(row, options)
    if (state.stageKey === 'registered') continue
    const tasks = inferAttorneyWorkQueueTasksForRow(row, options)
    if (!tasks.length) continue
    const topTask = tasks[0]
    queue.push({
      row,
      transactionId: row?.transaction?.id || null,
      stageKey: state.stageKey,
      stageLabel: state.stageLabel,
      stateKey: state.stateKey,
      waitingOnRole: state.waitingOnRole,
      task: topTask,
      tasks,
      priorityScore: topTask.priorityScore,
      updatedAt: row?.transaction?.updated_at || row?.transaction?.created_at || null,
    })
  }

  return queue.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore
    }
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
  })
}
