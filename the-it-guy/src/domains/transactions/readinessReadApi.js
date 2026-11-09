// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { normalizeChecklistItemStatus, ATTORNEY_OPERATIONAL_STAGE_SEQUENCE, resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { normalizePurchaserType, getPurchaserTypeLabel } from '../../lib/purchaserPersonas'
import { normalizeNullableUuid, isMissingColumnError, isMissingSchemaError, isMissingTableError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeDocumentRequestPriorityValue, normalizeRequestRoleScope, normalizeDocumentRequestStatusValue, fetchTransactionRequiredDocumentsByTransactionIds, fetchDocumentRequirements, loadTransactionDocumentRequestsByIds, buildRequiredChecklistFromRows, buildDocumentChecklist } from '../documents/requirementReadModel.js'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { DEFAULT_DOCUMENT_REQUIREMENTS } from '../../core/documents/documentRequirementRules'

export const ONBOARDING_STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Reviewed', 'Approved']

export const TRANSACTION_ISSUE_TYPES = [
  'missing_required_documents',
  'stage_blocked',
  'no_activity_warning',
  'no_activity_risk',
  'document_rejected',
  'waiting_on_client',
  'waiting_on_attorney',
  'waiting_on_bank',
  'guarantees_missing',
  'clearance_missing',
  'overdue_requests',
]

export function normalizeChecklistItemStatusValue(value) {
  return normalizeChecklistItemStatus(value)
}

export function normalizeAttorneyStageValue(value, fallback = 'instruction_received') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (ATTORNEY_OPERATIONAL_STAGE_SEQUENCE.some((item) => item.key === normalized)) {
    return normalized
  }
  return fallback
}

export function normalizeIssueTypeValue(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return TRANSACTION_ISSUE_TYPES.includes(normalized) ? normalized : 'stage_blocked'
}

export function normalizeOnboardingRow(row, fallbackPurchaserType = 'individual') {
  if (!row) {
    return null
  }

  const normalizedType = normalizePurchaserType(row.purchaser_type || fallbackPurchaserType)
  return {
    id: normalizeNullableUuid(row.id),
    transactionId: normalizeNullableUuid(row.transaction_id),
    token: row.token,
    status: ONBOARDING_STATUSES.includes(row.status) ? row.status : 'Not Started',
    purchaserType: normalizedType,
    purchaserTypeLabel: getPurchaserTypeLabel(normalizedType),
    submittedAt: row.submitted_at || null,
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function normalizeOnboardingFormDataRow(row) {
  if (!row) {
    return null
  }

  let formData = {}
  if (row.form_data && typeof row.form_data === 'object') {
    formData = row.form_data
  }

  return {
    id: row.id,
    transactionId: row.transaction_id,
    purchaserType: normalizePurchaserType(row.purchaser_type),
    formData,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function normalizeChecklistItemRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    stage: normalizeAttorneyStageValue(row?.stage),
    label: row?.label || 'Checklist item',
    description: row?.description || null,
    status: normalizeChecklistItemStatusValue(row?.status),
    priority: normalizeDocumentRequestPriorityValue(row?.priority),
    ownerRole:
      normalizeRoleType(row?.owner_role || null) || normalizeRequestRoleScope(row?.owner_role || null, 'attorney'),
    ownerUserId: row?.owner_user_id || null,
    linkedDocumentRequestId: row?.linked_document_request_id || null,
    linkedDocumentId: row?.linked_document_id || null,
    autoRuleKey: row?.auto_rule_key || null,
    isAutoManaged: row?.is_auto_managed === true,
    completedBy: row?.completed_by || null,
    completedAt: row?.completed_at || null,
    overriddenBy: row?.overridden_by || null,
    overrideReason: row?.override_reason || null,
    sortOrder: Number(row?.sort_order || 0) || 0,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function normalizeIssueOverrideRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    issueType: normalizeIssueTypeValue(row?.issue_type),
    overriddenBy: row?.overridden_by || null,
    overrideReason: row?.override_reason || null,
    resolveBy: row?.resolve_by || null,
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function summarizeDocumentRequests(rows = []) {
  const summary = {
    total: rows.length,
    openCount: 0,
    completedCount: 0,
    uploadedCount: 0,
    reviewedCount: 0,
    rejectedCount: 0,
    overdueCount: 0,
    requiredOpenCount: 0,
    waitingOnByRole: {},
  }

  const now = Date.now()
  for (const row of rows) {
    const status = normalizeDocumentRequestStatusValue(row?.status)
    const priority = normalizeDocumentRequestPriorityValue(row?.priority)
    const dueDate = row?.dueDate ? new Date(row.dueDate) : null
    const isOpen = ['requested', 'uploaded', 'under_review', 'reviewed', 'rejected'].includes(status)

    if (isOpen) {
      summary.openCount += 1
      const assignedRole = normalizeRequestRoleScope(row?.assignedToRole || row?.assigned_to_role || 'client')
      summary.waitingOnByRole[assignedRole] = (summary.waitingOnByRole[assignedRole] || 0) + 1
      if (priority === 'required' || priority === 'urgent') {
        summary.requiredOpenCount += 1
      }
      if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now) {
        summary.overdueCount += 1
      }
    }

    if (status === 'completed') summary.completedCount += 1
    if (status === 'uploaded') summary.uploadedCount += 1
    if (status === 'reviewed' || status === 'under_review') summary.reviewedCount += 1
    if (status === 'rejected') summary.rejectedCount += 1
  }

  return summary
}

export function summarizeChecklistItems(rows = [], { stageKey = null } = {}) {
  const scoped = stageKey ? rows.filter((item) => item.stage === stageKey) : rows
  const summary = {
    total: scoped.length,
    pendingCount: 0,
    completedCount: 0,
    blockedCount: 0,
    waivedCount: 0,
    requiredPendingCount: 0,
    importantPendingCount: 0,
    optionalPendingCount: 0,
  }

  for (const row of scoped) {
    const status = normalizeChecklistItemStatusValue(row?.status)
    const priority = normalizeDocumentRequestPriorityValue(row?.priority)
    const isPending = ['pending', 'in_progress', 'blocked'].includes(status)

    if (isPending) {
      summary.pendingCount += 1
      if (priority === 'required') summary.requiredPendingCount += 1
      if (priority === 'important') summary.importantPendingCount += 1
      if (priority === 'optional') summary.optionalPendingCount += 1
    }

    if (status === 'completed') summary.completedCount += 1
    if (status === 'blocked') summary.blockedCount += 1
    if (status === 'waived') summary.waivedCount += 1
  }

  return summary
}

export async function loadTransactionChecklistItemsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}
  if (isOptionalRelationKnownMissing('transaction_checklist_items')) return {}

  let query = await client
    .from('transaction_checklist_items')
    .select(
      'id, transaction_id, stage, label, description, status, priority, owner_role, owner_user_id, linked_document_request_id, linked_document_id, auto_rule_key, is_auto_managed, completed_by, completed_at, overridden_by, override_reason, sort_order, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'owner_user_id') ||
      isMissingColumnError(query.error, 'linked_document_request_id') ||
      isMissingColumnError(query.error, 'linked_document_id') ||
      isMissingColumnError(query.error, 'auto_rule_key') ||
      isMissingColumnError(query.error, 'is_auto_managed') ||
      isMissingColumnError(query.error, 'completed_by') ||
      isMissingColumnError(query.error, 'overridden_by') ||
      isMissingColumnError(query.error, 'override_reason'))
  ) {
    query = await client
      .from('transaction_checklist_items')
      .select(
        'id, transaction_id, stage, label, description, status, priority, owner_role, completed_at, sort_order, created_at',
      )
      .in('transaction_id', ids)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  }

  if (query.error) {
    if (rememberMissingOptionalRelation('transaction_checklist_items', query.error) || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeChecklistItemRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}

export async function loadTransactionIssueOverridesByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}
  if (isOptionalRelationKnownMissing('transaction_issue_overrides')) return {}

  let query = await client
    .from('transaction_issue_overrides')
    .select(
      'id, transaction_id, issue_type, overridden_by, override_reason, resolve_by, is_active, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'is_active') ||
      isMissingColumnError(query.error, 'override_reason') ||
      isMissingColumnError(query.error, 'resolve_by'))
  ) {
    query = await client
      .from('transaction_issue_overrides')
      .select('id, transaction_id, issue_type, overridden_by, created_at')
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (rememberMissingOptionalRelation('transaction_issue_overrides', query.error) || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeIssueOverrideRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}

export async function enrichRowsWithReadinessContext(client, rows = []) {
  if (!rows.length) {
    return []
  }

  const transactionIds = [...new Set(rows.map((row) => row?.transaction?.id).filter(Boolean))]
  if (!transactionIds.length) {
    return rows
  }

  let documents = []
  const documentsQuery = await client
    .from('documents')
    .select('id, transaction_id, name, category, created_at')
    .in('transaction_id', transactionIds)

  if (documentsQuery.error) {
    if (!isMissingTableError(documentsQuery.error, 'documents')) {
      throw documentsQuery.error
    }
  } else {
    documents = documentsQuery.data || []
  }

  const documentsByTransactionId = documents.reduce((accumulator, document) => {
    if (!accumulator[document.transaction_id]) {
      accumulator[document.transaction_id] = []
    }

    accumulator[document.transaction_id].push(document)
    return accumulator
  }, {})

  const transactionRequirementsByTransactionId = await fetchTransactionRequiredDocumentsByTransactionIds(
    client,
    transactionIds,
  )

  const requirementsByDevelopment = {}
  const uniqueDevelopmentIds = [...new Set(rows.map((row) => row?.unit?.development_id).filter(Boolean))]
  const requirementsRows = await Promise.all(
    uniqueDevelopmentIds.map(async (developmentId) => ({
      developmentId,
      requirements: await fetchDocumentRequirements(client, developmentId),
    })),
  )
  for (const item of requirementsRows) {
    requirementsByDevelopment[item.developmentId] = item.requirements
  }

  let onboardingByTransactionId = {}
  let onboardingQuery = await client
    .from('transaction_onboarding')
    .select('id, transaction_id, token, status, purchaser_type, submitted_at, is_active, created_at, updated_at')
    .in('transaction_id', transactionIds)
    .eq('is_active', true)

  if (
    onboardingQuery.error &&
    (isMissingTableError(onboardingQuery.error, 'transaction_onboarding') ||
      isMissingColumnError(onboardingQuery.error, 'is_active') ||
      isMissingColumnError(onboardingQuery.error, 'purchaser_type') ||
      isMissingColumnError(onboardingQuery.error, 'status'))
  ) {
    onboardingQuery = { data: [], error: null }
  }

  if (onboardingQuery.error) {
    throw onboardingQuery.error
  }

  onboardingByTransactionId = (onboardingQuery.data || []).reduce((accumulator, row) => {
    accumulator[row.transaction_id] = normalizeOnboardingRow(row) || null
    return accumulator
  }, {})

  let onboardingFormDataByTransactionId = {}
  const onboardingFormDataQuery = await client
    .from('onboarding_form_data')
    .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
    .in('transaction_id', transactionIds)

  if (onboardingFormDataQuery.error) {
    if (!isMissingTableError(onboardingFormDataQuery.error, 'onboarding_form_data')) {
      throw onboardingFormDataQuery.error
    }
  } else {
    onboardingFormDataByTransactionId = (onboardingFormDataQuery.data || []).reduce((accumulator, row) => {
      if (!row?.transaction_id) return accumulator
      accumulator[row.transaction_id] = normalizeOnboardingFormDataRow(row) || null
      return accumulator
    }, {})
  }

  const [documentRequestsByTransactionId, checklistItemsByTransactionId, issueOverridesByTransactionId] =
    await Promise.all([
      loadTransactionDocumentRequestsByIds(client, transactionIds),
      loadTransactionChecklistItemsByIds(client, transactionIds),
      loadTransactionIssueOverridesByIds(client, transactionIds),
    ])

  return rows.map((row) => {
    const transactionId = row?.transaction?.id || null
    if (!transactionId) {
      return row
    }

    const documentsForTransaction = documentsByTransactionId[transactionId] || []
    const transactionRequirements = transactionRequirementsByTransactionId[transactionId] || []
    const checklistResult = transactionRequirements.length
      ? buildRequiredChecklistFromRows(transactionRequirements, documentsForTransaction)
      : buildDocumentChecklist(
          requirementsByDevelopment[row?.unit?.development_id] || DEFAULT_DOCUMENT_REQUIREMENTS,
          documentsForTransaction,
        )

    const uploadedCount = Number(checklistResult.summary?.uploadedCount || 0)
    const totalRequired = Number(checklistResult.summary?.totalRequired || 0)
    const documentRequests = documentRequestsByTransactionId[transactionId] || []
    const operationalStage = resolveAttorneyOperationalStageKey(row)
    const transactionChecklistItems = checklistItemsByTransactionId[transactionId] || []
    const issueOverrides = issueOverridesByTransactionId[transactionId] || []
    const onboarding = onboardingByTransactionId[transactionId] || null
    const onboardingFormData = onboardingFormDataByTransactionId[transactionId] || null
    const buyerBondOriginatorRequest = resolveBuyerBondOriginatorRequestFromOnboardingData(onboardingFormData)
    const buyerBondOriginatorRequestSummary =
      summarizeBuyerBondOriginatorRequestForOperations(buyerBondOriginatorRequest)
    const enrichedTransaction = row.transaction
      ? {
          ...row.transaction,
          buyer_bond_originator_request: buyerBondOriginatorRequest,
          buyer_bond_originator_request_status: buyerBondOriginatorRequestSummary.status || null,
          buyer_bond_originator_request_action_required: buyerBondOriginatorRequestSummary.actionRequired,
          buyer_bond_originator_request_summary: buyerBondOriginatorRequestSummary.summary || null,
          buyerBondOriginatorRequestSummary,
        }
      : row.transaction

    return {
      ...row,
      transaction: enrichedTransaction,
      requiredDocumentChecklist: checklistResult.checklist,
      documentSummary: {
        uploadedCount,
        totalRequired,
        missingCount: Math.max(totalRequired - uploadedCount, 0),
      },
      documentRequests,
      documentRequestSummary: summarizeDocumentRequests(documentRequests),
      transactionChecklistItems,
      checklistSummary: summarizeChecklistItems(transactionChecklistItems, {
        stageKey: operationalStage,
      }),
      issueOverrides,
      onboarding,
      onboardingFormData,
      buyerBondOriginatorRequest,
      buyerBondOriginatorRequestSummary,
      buyerBondOriginatorRequestStatus: buyerBondOriginatorRequestSummary.status || '',
      buyerBondOriginatorRequestActionRequired: buyerBondOriginatorRequestSummary.actionRequired,
    }
  })
}

export function resolveBuyerBondOriginatorRequestFromOnboardingData(onboardingFormData = null) {
  const formData =
    onboardingFormData?.formData && typeof onboardingFormData.formData === 'object'
      ? onboardingFormData.formData
      : onboardingFormData?.form_data && typeof onboardingFormData.form_data === 'object'
        ? onboardingFormData.form_data
        : onboardingFormData && typeof onboardingFormData === 'object'
          ? onboardingFormData
          : {}

  return formData.buyer_bond_originator_request || formData.buyerBondOriginatorRequest || null
}

export function summarizeBuyerBondOriginatorRequestForOperations(request = null) {
  if (!request?.requested) {
    return {
      requested: false,
      status: '',
      actionRequired: false,
      label: '',
      summary: '',
      companyName: '',
      contactDetails: '',
    }
  }

  const status = normalizeTextValue(request.status).toLowerCase()
  const companyName = normalizeTextValue(
    request.companyName || request.company_name || 'buyer-appointed bond originator',
  )
  const contactDetails = normalizeTextValue(request.contactDetails || request.contact_details || request.email || '')
  const rejectedReason = normalizeTextValue(request.rejectionReason || request.rejection_reason || '')

  if (status === 'pending_approval') {
    return {
      requested: true,
      status,
      actionRequired: true,
      label: 'Buyer originator review',
      summary: `Buyer nominated ${companyName}. Agent or developer approval is required.`,
      companyName,
      contactDetails,
    }
  }

  if (status === 'approved') {
    return {
      requested: true,
      status,
      actionRequired: false,
      label: 'Buyer originator approved',
      summary: `${companyName} is approved as the buyer-appointed bond originator.`,
      companyName,
      contactDetails,
    }
  }

  if (status === 'rejected') {
    return {
      requested: true,
      status,
      actionRequired: false,
      label: 'Buyer originator rejected',
      summary: rejectedReason
        ? `Buyer-appointed originator rejected: ${rejectedReason}`
        : `${companyName} was not approved as the bond originator.`,
      companyName,
      contactDetails,
    }
  }

  if (status === 'not_allowed') {
    return {
      requested: true,
      status,
      actionRequired: false,
      label: 'Buyer originator restricted',
      summary: 'This development does not allow buyer-appointed bond originators.',
      companyName,
      contactDetails,
    }
  }

  return {
    requested: true,
    status,
    actionRequired: false,
    label: 'Buyer originator request',
    summary: `Buyer nominated ${companyName}.`,
    companyName,
    contactDetails,
  }
}
