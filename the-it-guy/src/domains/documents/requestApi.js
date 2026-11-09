// documents owns these operations and their existing recovery behavior.
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeStakeholderStatus } from '../developments/participantReadApi.js'
import { fetchTransactionRowById } from '../transactions/workspaceReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { loadTransactionDocumentRequestsByIds, normalizeDocumentRequestRow, normalizeAdditionalDocumentRequestRequestedFrom, mapRequestedFromToAssignedRole, normalizeAdditionalDocumentRequestPriority, normalizeRequestRoleScope, normalizeDocumentRequestStatusValue } from './requirementReadModel.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { isAttorneyDocumentActor, requestAttorneyDocuments, reviewAttorneyDocumentRequest } from '../../services/documents/attorneyDocumentPersistence.js'
import { resolveDefaultDocumentRequestVisibility } from '../../core/documents/documentRequestContainerModel.js'
import { TRANSACTION_ROLE_LABELS } from '../../core/transactions/roleConfig'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { linkChecklistItemToDocumentRequest as linkChecklistItemToDocumentRequestService } from '../../services/transactionOperationalChecklistService'
import { processWorkflowEvidenceIfPossible, fetchNotificationTargetsByRole } from '../bond/financeRead.js'
import { createTransactionNotificationIfPossible } from '../transactions/participantInfrastructure.js'
import { resolveClientAppBaseUrl } from '../onboarding/deliveryApi.js'
import { normalizeMatterFinancialDocumentType, normalizeMatterFinancialAudienceRole, normalizeMatterFinancialCurrencyCode, buildMatterFinancialDocumentRequestViewModel, insertMatterFinancialAccountEventIfPossible, fetchMatterFinancialAccountForMutation } from '../finance/accountsApi.js'
import { getOrCreateClientPortalLinkRecord } from '../clientPortal/accessApi.js'
import { reviewCanonicalDocumentRequirement } from './workspaceApi.js'

function mapAdditionalPriorityToRequestPriority(priority = '') {
  const normalized = normalizeAdditionalDocumentRequestPriority(priority, 'normal')
  return normalized === 'urgent' ? 'required' : 'important'
}

function resolveWorkflowEvidenceKeyFromDocumentRequest(request = {}) {
  const explicitCandidates = [
    request.evidenceKey,
    request.evidence_key,
    request.documentType,
    request.document_type,
    request.category,
    request.title,
  ]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)

  for (const candidate of explicitCandidates) {
    if (
      [
        'supporting_docs_complete',
        'supporting_documents_complete',
        'required_documents_complete',
        'signed_otp',
        'proof_of_funds',
        'registration_confirmation',
      ].includes(candidate)
    ) {
      return candidate
    }
  }

  const requestType = String(request.requestType || request.request_type || '')
    .trim()
    .toLowerCase()
  const assignedRole = String(request.assignedToRole || request.assigned_to_role || '')
    .trim()
    .toLowerCase()
  if (requestType !== 'additional_document_request' && ['buyer', 'seller', 'client', 'developer', 'agency', 'introducing_agent'].includes(assignedRole)) {
    return 'supporting_docs_complete'
  }

  return null
}

export function resolveAdditionalDocumentRequestAudience(requestedFrom = '') {
  const normalized = normalizeAdditionalDocumentRequestRequestedFrom(requestedFrom, 'buyer')
  return {
    forBuyer: normalized === 'buyer' || normalized === 'buyer_and_seller',
    forSeller: normalized === 'seller' || normalized === 'buyer_and_seller',
  }
}

const ADDITIONAL_DOCUMENT_REQUESTER_ROLES = new Set([
  'developer',
  'agent',
  'attorney',
  'bond_originator',
  'internal_admin',
])

function buildAdditionalDocumentRequestEmailCopy({ actorRole, request, transaction = {}, portalLink = '' } = {}) {
  const actorLabel =
    TRANSACTION_ROLE_LABELS[normalizeRoleType(actorRole)] ||
    String(actorRole || 'Arch9 team')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase())
  const documentTitle = normalizeTextValue(request?.title || request?.document_type || 'Additional document')
  const reference = normalizeTextValue(transaction?.transaction_reference || transaction?.matter_number)
  const propertyLabel = [
    transaction?.property_address_line_1,
    transaction?.property_description,
    transaction?.suburb,
    transaction?.city,
  ]
    .map(normalizeTextValue)
    .filter(Boolean)
    .join(', ')
  const dueDate = normalizeOptionalDate(request?.due_date || request?.dueDate)
  const lines = [
    `${actorLabel} requested ${documentTitle} for your application${reference ? ` (${reference})` : ''}.`,
    propertyLabel ? `Property: ${propertyLabel}.` : '',
    dueDate ? `Due date: ${dueDate}.` : '',
    portalLink
      ? 'Please open your Arch9 portal to upload the document.'
      : 'Please upload the requested document in your Arch9 portal.',
  ].filter(Boolean)

  return {
    subject: `Document requested: ${documentTitle}`,
    title: 'Document requested',
    message: lines.join(' '),
    metadata: {
      documentTitle,
      requestId: request?.id || null,
      requestType: request?.request_type || request?.requestType || 'additional_document_request',
      requestedFrom: request?.requested_from || request?.requestedFrom || null,
      requestedBy: actorLabel,
      priority: request?.priority || null,
      dueDate,
      transactionReference: reference || null,
      propertyLabel: propertyLabel || null,
      portalLink: portalLink || null,
    },
  }
}

async function fetchTransactionDocumentRequestEmailContext(client, transactionId) {
  if (!transactionId) return { transaction: null, buyer: null, portalLink: null }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, buyer_id, development_id, unit_id, matter_number, transaction_reference, property_address_line_1, property_description, suburb, city, seller_name, seller_email',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'matter_number') ||
      isMissingColumnError(transactionQuery.error, 'transaction_reference') ||
      isMissingColumnError(transactionQuery.error, 'property_address_line_1') ||
      isMissingColumnError(transactionQuery.error, 'property_description') ||
      isMissingColumnError(transactionQuery.error, 'seller_name') ||
      isMissingColumnError(transactionQuery.error, 'seller_email'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, development_id, unit_id')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data || null
  let buyer = null

  if (transaction?.buyer_id) {
    const buyerQuery = await client
      .from('buyers')
      .select('id, name, email')
      .eq('id', transaction.buyer_id)
      .maybeSingle()

    if (!buyerQuery.error) {
      buyer = buyerQuery.data || null
    } else if (!isMissingTableError(buyerQuery.error, 'buyers') && !isPermissionDeniedError(buyerQuery.error)) {
      throw buyerQuery.error
    }
  }

  let portalLink = null
  if (transaction?.id && transaction?.buyer_id) {
    portalLink = await getOrCreateClientPortalLinkRecord(client, {
      developmentId: transaction.development_id,
      unitId: transaction.unit_id,
      transactionId: transaction.id,
      buyerId: transaction.buyer_id || null,
    }).catch(() => null)
  }

  return { transaction, buyer, portalLink }
}

async function sendAdditionalDocumentRequestEmails(client, { transactionId, actorRole, requests = [] } = {}) {
  if (!transactionId || !requests.length) return []

  const context = await fetchTransactionDocumentRequestEmailContext(client, transactionId).catch((contextError) => {
    console.warn('[document-requests] Unable to resolve email context', contextError)
    return { transaction: null, buyer: null, portalLink: null }
  })
  const transaction = context.transaction || {}
  const buyerEmail = normalizeTextValue(
    context.buyer?.email || transaction?.buyer_email || transaction?.buyerEmail || '',
  ).toLowerCase()
  const sellerEmail = normalizeTextValue(transaction?.seller_email || transaction?.sellerEmail || '').toLowerCase()
  const portalToken = normalizeTextValue(context.portalLink?.token || '')
  const portalPath = portalToken ? `/client/${portalToken}` : ''
  const appBaseUrl = resolveClientAppBaseUrl()
  const portalUrl = portalPath ? (appBaseUrl ? `${appBaseUrl}${portalPath}` : portalPath) : ''
  const results = []

  for (const request of requests) {
    const audience = resolveAdditionalDocumentRequestAudience(
      request?.requested_from || request?.requestedFrom || 'buyer',
    )
    const recipients = []
    if (audience.forBuyer && buyerEmail) {
      recipients.push({
        email: buyerEmail,
        name: normalizeTextValue(context.buyer?.name || transaction?.buyer_name || transaction?.buyerName || 'Buyer'),
      })
    }
    if (audience.forSeller && sellerEmail) {
      recipients.push({
        email: sellerEmail,
        name: normalizeTextValue(transaction?.seller_name || transaction?.sellerName || 'Seller'),
      })
    }

    for (const recipient of recipients) {
      const copy = buildAdditionalDocumentRequestEmailCopy({
        actorRole,
        request,
        transaction,
        portalLink: portalUrl,
      })
      const { data, error } = await invokeEdgeFunction('send-email', {
        client,
        body: {
          type: 'additional_document_request',
          transactionId,
          to: recipient.email,
          recipientName: recipient.name,
          subject: copy.subject,
          title: copy.title,
          message: copy.message,
          metadata: copy.metadata,
        },
      }).catch((emailError) => ({ data: null, error: emailError }))

      if (error || data?.error || data?.ok === false) {
        console.warn('[document-requests] Unable to send document request email', error || data?.error || data?.message)
        results.push({
          email: recipient.email,
          sent: false,
          error: error || data?.error || data?.message || 'not_sent',
        })
      } else {
        results.push({ email: recipient.email, sent: true })
      }
    }
  }

  return results
}

async function canUserRequestAdditionalDocumentsForTransaction(client, { transactionId, actor = null } = {}) {
  const userId = actor?.userId || null
  const role = normalizeRoleType(actor?.role || null)
  if (!transactionId || !userId || !ADDITIONAL_DOCUMENT_REQUESTER_ROLES.has(role)) {
    return false
  }

  const participantQuery = await client
    .from('transaction_participants')
    .select('id, user_id, role_type, status, removed_at')
    .eq('transaction_id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!participantQuery.error) {
    const participant = participantQuery.data || null
    if (
      participant &&
      normalizeStakeholderStatus(participant?.status, participant?.removed_at ? 'removed' : 'active') === 'active'
    ) {
      return true
    }
  } else if (
    !isMissingTableError(participantQuery.error, 'transaction_participants') &&
    !isMissingSchemaError(participantQuery.error) &&
    !isPermissionDeniedError(participantQuery.error)
  ) {
    throw participantQuery.error
  }

  const transaction = await fetchTransactionRowById(client, transactionId)
  if (!transaction) {
    return false
  }

  const mappedOwnerIds = [
    transaction?.owner_user_id || null,
    transaction?.assigned_agent_id || null,
    transaction?.assigned_attorney_id || null,
    transaction?.assigned_bond_originator_id || null,
  ].filter(Boolean)

  if (mappedOwnerIds.includes(userId)) {
    return true
  }

  return role === 'internal_admin'
}

export async function fetchTransactionDocumentRequests(transactionId) {
  const client = requireClient()
  if (!transactionId) return []
  const result = await loadTransactionDocumentRequestsByIds(client, [transactionId])
  return result[transactionId] || []
}

async function notifySavedAttorneyDocumentRequests(client, { transactionId, actorRole, requests }) {
  const notifications = async () => {
    for (const request of requests) {
      const roleTarget = normalizeRequestRoleScope(request.assigned_to_role, 'client')
      const targets = await fetchNotificationTargetsByRole(client, {
        transactionId, roleTypes: roleTarget === 'client' ? ['buyer', 'seller', 'client'] : [roleTarget],
      })
      await Promise.all(targets.map(target => createTransactionNotificationIfPossible(client, {
        transactionId, userId: target.userId, roleType: target.roleType || roleTarget,
        notificationType: 'additional_document_requested', title: 'Additional document requested',
        message: `${TRANSACTION_ROLE_LABELS[actorRole] || actorRole} requested ${request.title} for this transaction.`,
        eventType: 'TransactionUpdated',
        eventData: { source: 'additional_document_requested', requestId: request.id, documentName: request.title,
          requestedFrom: request.requested_from, visibility: request.visibility_scope, priority: request.priority, dueDate: request.due_date },
        dedupeKey: `additional-doc-request:${request.id}:${target.userId}`,
      })))
    }
  }
  const results = await Promise.allSettled([
    sendAdditionalDocumentRequestEmails(client, { transactionId, actorRole, requests }), notifications(),
  ])
  if (results.some(result => result.status === 'rejected')) {
    console.warn('[document-requests] Saved request notification could not be delivered')
  }
}

export async function createTransactionDocumentRequests({
  transactionId,
  requests = [],
  requestGroupLabel = null,
  requestGroupDescription = null,
  createdByRole = null,
  commandId = null,
} = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }
  if (!Array.isArray(requests) || !requests.length) {
    throw new Error('At least one document request is required.')
  }

  const actor = await resolveActiveProfileContext(client)
  const normalizedActorRole = normalizeRoleType(createdByRole || actor.role || 'attorney')
  const canRequestAdditionalDocuments = await canUserRequestAdditionalDocumentsForTransaction(client, {
    transactionId,
    actor: {
      userId: actor.userId || null,
      role: normalizedActorRole,
    },
  })

  if (!canRequestAdditionalDocuments) {
    throw new Error('You do not have permission to request additional documents for this transaction.')
  }
  const createdAt = new Date().toISOString()
  let groupId = null

  if (!isAttorneyDocumentActor(actor.role) && (requests.length > 1 || requestGroupLabel)) {
    const groupPayload = {
      transaction_id: transactionId,
      title: normalizeTextValue(requestGroupLabel || 'Document Request Pack'),
      description: normalizeNullableText(requestGroupDescription),
      created_by: actor.userId || null,
      created_by_role: normalizedActorRole,
      created_at: createdAt,
      updated_at: createdAt,
    }

    let groupInsert = await client.from('document_request_groups').insert(groupPayload).select('id').single()

    if (
      groupInsert.error &&
      (isMissingColumnError(groupInsert.error, 'created_by') ||
        isMissingColumnError(groupInsert.error, 'created_by_role') ||
        isMissingColumnError(groupInsert.error, 'description') ||
        isMissingColumnError(groupInsert.error, 'updated_at'))
    ) {
      groupInsert = await client
        .from('document_request_groups')
        .insert({
          transaction_id: transactionId,
          title: groupPayload.title,
          created_at: createdAt,
        })
        .select('id')
        .single()
    }

    if (groupInsert.error) {
      if (!isMissingTableError(groupInsert.error, 'document_request_groups')) {
        throw groupInsert.error
      }
    } else {
      groupId = groupInsert.data?.id || null
    }
  }

  const insertRows = requests.map((request, index) => {
    const requestedFrom = normalizeAdditionalDocumentRequestRequestedFrom(
      request.requestedFrom || request.requested_from || request.assignedToRole || request.assigned_to_role,
      'buyer',
    )
    return {
      request_type: String(request.requestType || request.request_type || 'additional_document_request')
        .trim()
        .toLowerCase(),
      transaction_id: transactionId,
      category: normalizeTextValue(request.category || 'Additional Requests'),
      document_type: normalizeTextValue(
        request.documentType || request.document_type || request.title || `Document ${index + 1}`,
      ),
      title: normalizeTextValue(
        request.title || request.documentType || request.document_type || `Document ${index + 1}`,
      ),
      description: normalizeNullableText(request.description || request.notes),
      notes: normalizeNullableText(request.notes || request.description),
      priority: mapAdditionalPriorityToRequestPriority(request.priority),
      due_date: normalizeOptionalDate(request.dueDate || request.due_date),
      requested_from: requestedFrom,
      assigned_to_role: mapRequestedFromToAssignedRole(requestedFrom),
      visibility_scope: resolveDefaultDocumentRequestVisibility(
        requestedFrom,
        request.visibility || request.visibility_scope,
      ),
      assigned_to_user_id: request.assignedToUserId || request.assigned_to_user_id || null,
      request_group_id: groupId,
      canonical_requirement_instance_id: request.canonicalRequirementInstanceId || request.canonical_requirement_instance_id || null,
      status: normalizeDocumentRequestStatusValue(request.status || 'requested'),
      requires_review: request.requiresReview !== false && request.requires_review !== false,
      created_by: actor.userId || null,
      created_by_role: normalizedActorRole,
      resend_count: 0,
      created_at: createdAt,
      updated_at: createdAt,
    }
  })

  if (isAttorneyDocumentActor(actor.role)) {
    const savedRequests = await requestAttorneyDocuments(client, {
      transactionId, requests: insertRows, commandId,
      groupTitle: requestGroupLabel, groupDescription: requestGroupDescription,
    })
    // Requests, canonical projections and activity have committed together.
    // Notification delivery is independent of the saved request receipt.
    void notifySavedAttorneyDocumentRequests(client, { transactionId, actorRole: normalizedActorRole, requests: savedRequests })
      .catch(() => console.warn('[document-requests] Saved request notification could not be delivered'))
    return savedRequests.map(normalizeDocumentRequestRow)
  }

  let insert = await client
    .from('document_requests')
    .insert(insertRows)
    .select(
      'id, transaction_id, category, document_type, title, description, notes, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, canonical_requirement_instance_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, created_at, updated_at',
    )

  if (
    !insertRows.some((row) => row.canonical_requirement_instance_id) &&
    insert.error &&
    (isMissingColumnError(insert.error, 'assigned_to_user_id') ||
      isMissingColumnError(insert.error, 'request_group_id') ||
      isMissingColumnError(insert.error, 'requires_review') ||
      isMissingColumnError(insert.error, 'requested_document_id') ||
      isMissingColumnError(insert.error, 'created_by') ||
      isMissingColumnError(insert.error, 'created_by_role') ||
      isMissingColumnError(insert.error, 'resend_count') ||
      isMissingColumnError(insert.error, 'last_resent_at') ||
      isMissingColumnError(insert.error, 'requested_from') ||
      isMissingColumnError(insert.error, 'visibility_scope') ||
      isMissingColumnError(insert.error, 'request_type') ||
      isMissingColumnError(insert.error, 'notes') ||
      isMissingColumnError(insert.error, 'updated_at'))
  ) {
    insert = await client
      .from('document_requests')
      .insert(
        insertRows.map((row) => ({
          transaction_id: row.transaction_id,
          category: row.category,
          document_type: row.document_type,
          title: row.title,
          description: row.description,
          priority: row.priority,
          due_date: row.due_date,
          assigned_to_role: row.assigned_to_role,
          status: row.status,
          created_at: row.created_at,
        })),
      )
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at',
      )
  }

  if (insert.error) {
    if (isMissingTableError(insert.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw insert.error
  }

  const normalizedCreatedRequests = (insert.data || []).map((row) => normalizeDocumentRequestRow(row))
  const firstRequest = normalizedCreatedRequests[0] || insertRows[0] || {}
  const firstRequestTitle =
    firstRequest.title || firstRequest.document_type || firstRequest.documentType || 'Additional document'

  await logTransactionEventIfPossible(client, {
    transactionId,
    eventType: 'TransactionUpdated',
    createdBy: actor.userId || null,
    createdByRole: normalizedActorRole,
    eventData: {
      source: 'additional_document_requested',
      title: firstRequestTitle,
      message: `${TRANSACTION_ROLE_LABELS[normalizedActorRole] || normalizedActorRole} requested ${firstRequestTitle}.`,
      requestedFrom:
        firstRequest.requestedFrom || firstRequest.requested_from || insertRows[0]?.requested_from || 'buyer',
      visibility:
        firstRequest.visibility || firstRequest.visibility_scope || insertRows[0]?.visibility_scope || 'client_visible',
      count: insertRows.length,
      requestGroupId: groupId,
      requestType: 'additional_document_request',
      requests: insertRows.map((row) => ({
        document_name: row.title,
        requested_from: row.requested_from,
        visibility: row.visibility_scope,
        priority: row.priority,
        due_date: row.due_date,
      })),
    },
  })

  await sendAdditionalDocumentRequestEmails(client, {
    transactionId,
    actorRole: normalizedActorRole,
    requests: normalizedCreatedRequests.length ? normalizedCreatedRequests : insertRows,
  }).catch((emailError) => {
    console.warn('[document-requests] Document request email notification failed', emailError)
  })

  for (const createdRequest of insertRows) {
    const roleTarget = normalizeRequestRoleScope(createdRequest.assigned_to_role, 'client')
    const notificationTargets = await fetchNotificationTargetsByRole(client, {
      transactionId,
      roleTypes: roleTarget === 'client' ? ['buyer', 'seller', 'client'] : [roleTarget],
    })

    for (const target of notificationTargets) {
      await createTransactionNotificationIfPossible(client, {
        transactionId,
        userId: target.userId,
        roleType: target.roleType || roleTarget,
        notificationType: 'additional_document_requested',
        title: 'Additional document requested',
        message: `${TRANSACTION_ROLE_LABELS[normalizedActorRole] || normalizedActorRole} requested ${createdRequest.title || 'an additional document'} for this transaction.`,
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'additional_document_requested',
          documentName: createdRequest.title || 'Additional document',
          requestedFrom: createdRequest.requested_from,
          visibility: createdRequest.visibility_scope,
          priority: createdRequest.priority,
          dueDate: createdRequest.due_date,
        },
        dedupeKey: `additional-doc-request:${transactionId}:${createdAt}:${target.userId}:${createdRequest.title}`,
      })
    }
  }

  return normalizedCreatedRequests
}

export async function reviewAttorneyMatterDocumentRequest({ requestId, documentId, action, reason = '', commandId } = {}) {
  if (!requestId || !documentId) throw new Error('Choose the received document before reviewing this request.')
  if (!['approve', 'reject'].includes(action)) throw new Error('Choose approval or a correction request.')
  if (action === 'reject' && !reason.trim()) throw new Error('Explain the correction required.')
  const result = await reviewAttorneyDocumentRequest(requireClient(), { requestId, documentId, action, reason, commandId })
  return { ...normalizeDocumentRequestRow(result.request), saved: true, refreshRequired: true }
}

export async function updateTransactionDocumentRequestStatus({
  requestId,
  status,
  rejectedReason = null,
  completedAt = null,
} = {}) {
  const client = requireClient()
  if (!requestId) throw new Error('Request id is required.')

  const actor = await resolveActiveProfileContext(client)
  const existingRequestLookup = await client
    .from('document_requests')
    .select('id, transaction_id, canonical_requirement_instance_id, requested_document_id')
    .eq('id', requestId)
    .maybeSingle()

  if (existingRequestLookup.error && !isMissingTableError(existingRequestLookup.error, 'document_requests')) {
    throw existingRequestLookup.error
  }

  const existingRequest = existingRequestLookup.data || null
  if (!existingRequest?.transaction_id) {
    throw new Error('Document request not found.')
  }

  const canManageRequest = await canUserRequestAdditionalDocumentsForTransaction(client, {
    transactionId: existingRequest.transaction_id,
    actor: {
      userId: actor.userId || null,
      role: actor.role || null,
    },
  })
  if (!canManageRequest) {
    throw new Error('You do not have permission to update this additional document request.')
  }

  const normalizedStatus = normalizeDocumentRequestStatusValue(status)
  if (existingRequest.canonical_requirement_instance_id && ['completed', 'rejected'].includes(normalizedStatus)) {
    await reviewCanonicalDocumentRequirement({
      requirementInstanceId: existingRequest.canonical_requirement_instance_id,
      documentId: existingRequest.requested_document_id || null,
      action: normalizedStatus === 'completed' ? 'approve' : 'reject',
      reason: rejectedReason || '',
    })
    const refreshed = await client
      .from('document_requests')
      .select('id, transaction_id, canonical_requirement_instance_id, requested_document_id, status, rejected_reason, completed_at, updated_at')
      .eq('id', requestId)
      .single()
    if (refreshed.error) throw refreshed.error
    return normalizeDocumentRequestRow(refreshed.data)
  }
  const now = new Date().toISOString()
  const payload = {
    status: normalizedStatus,
    rejected_reason: normalizedStatus === 'rejected' ? normalizeNullableText(rejectedReason) : null,
    completed_at: normalizedStatus === 'completed' ? completedAt || now : null,
    updated_at: now,
  }

  let update = await client
    .from('document_requests')
    .update(payload)
    .eq('id', requestId)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, notes, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'rejected_reason') ||
      isMissingColumnError(update.error, 'completed_at') ||
      isMissingColumnError(update.error, 'requested_from') ||
      isMissingColumnError(update.error, 'visibility_scope') ||
      isMissingColumnError(update.error, 'request_type') ||
      isMissingColumnError(update.error, 'notes') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({
        status: normalizedStatus,
      })
      .eq('id', requestId)
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at',
      )
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'document_request_status_updated',
      requestId,
      status: normalizedStatus,
    },
  })
  const normalizedRequest = normalizeDocumentRequestRow(update.data)
  const requestEvidenceKey = resolveWorkflowEvidenceKeyFromDocumentRequest(normalizedRequest)
  if (requestEvidenceKey) {
    await processWorkflowEvidenceIfPossible(client, {
      transactionId: normalizedRequest.transactionId,
      evidenceType: 'document_request',
      evidenceId: normalizedRequest.id,
      evidenceKey: requestEvidenceKey,
      status: normalizedStatus,
      source: 'document_request_status_update',
      createdBy: actor.userId || null,
      payload: {
        requestType: normalizedRequest.requestType,
        assignedToRole: normalizedRequest.assignedToRole,
        title: normalizedRequest.title,
      },
    })
  }

  return normalizedRequest
}

export async function resendTransactionDocumentRequest(requestId) {
  const client = requireClient()
  if (!requestId) throw new Error('Request id is required.')

  const actor = await resolveActiveProfileContext(client)
  const existingRequestLookup = await client
    .from('document_requests')
    .select('id, transaction_id')
    .eq('id', requestId)
    .maybeSingle()

  if (existingRequestLookup.error && !isMissingTableError(existingRequestLookup.error, 'document_requests')) {
    throw existingRequestLookup.error
  }

  const existingRequest = existingRequestLookup.data || null
  if (!existingRequest?.transaction_id) {
    throw new Error('Document request not found.')
  }

  const canManageRequest = await canUserRequestAdditionalDocumentsForTransaction(client, {
    transactionId: existingRequest.transaction_id,
    actor: {
      userId: actor.userId || null,
      role: actor.role || null,
    },
  })
  if (!canManageRequest) {
    throw new Error('You do not have permission to resend this additional document request.')
  }

  const now = new Date().toISOString()
  const existing = await client.from('document_requests').select('id, resend_count').eq('id', requestId).maybeSingle()
  if (existing.error && !isMissingTableError(existing.error, 'document_requests')) {
    throw existing.error
  }
  const nextResendCount = Number(existing.data?.resend_count || 0) + 1

  let update = await client
    .from('document_requests')
    .update({
      status: 'requested',
      last_resent_at: now,
      resend_count: nextResendCount,
      updated_at: now,
    })
    .eq('id', requestId)
    .select(
      'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, notes, created_at, updated_at',
    )
    .single()

  if (
    update.error &&
    (isMissingColumnError(update.error, 'last_resent_at') ||
      isMissingColumnError(update.error, 'resend_count') ||
      isMissingColumnError(update.error, 'requested_from') ||
      isMissingColumnError(update.error, 'visibility_scope') ||
      isMissingColumnError(update.error, 'request_type') ||
      isMissingColumnError(update.error, 'notes') ||
      isMissingColumnError(update.error, 'updated_at'))
  ) {
    update = await client
      .from('document_requests')
      .update({ status: 'requested' })
      .eq('id', requestId)
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_at',
      )
      .single()
  }

  if (update.error) {
    if (isMissingTableError(update.error, 'document_requests')) {
      throw new Error('Document request tables are not set up yet. Run sql/schema.sql and refresh.')
    }
    throw update.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: update.data?.transaction_id || null,
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'document_request_resent',
      requestId,
    },
  })

  return normalizeDocumentRequestRow(update.data)
}

export async function linkChecklistItemToDocumentRequest(itemId, requestId) {
  return linkChecklistItemToDocumentRequestService(itemId, requestId)
}

const MATTER_FINANCIAL_REQUEST_STATUSES = new Set([
  'requested',
  'submitted',
  'awaiting_review',
  'accepted',
  'rejected',
  'complete',
  'cancelled',
])

function normalizeMatterFinancialRequestStatus(value, fallback = 'requested') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (MATTER_FINANCIAL_REQUEST_STATUSES.has(normalized)) return normalized
  return MATTER_FINANCIAL_REQUEST_STATUSES.has(fallback) ? fallback : 'requested'
}

export async function createMatterFinancialDocumentRequest({
  accountId,
  transactionId,
  requestType = 'proof_of_payment',
  title,
  description,
  externalReference,
  amountDue,
  dueOn,
  audienceRole,
  portalVisible = true,
} = {}) {
  const client = requireClient()
  const account = await fetchMatterFinancialAccountForMutation(client, accountId, transactionId)
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedTitle = normalizeNullableText(title)
  if (!normalizedTitle) {
    throw new Error('Add a short title for this request.')
  }

  const normalizedRequestType = normalizeMatterFinancialDocumentType(requestType)
  const normalizedAudienceRole = normalizeMatterFinancialAudienceRole(audienceRole, account.party_role || 'client')
  const payload = {
    financial_account_id: account.id,
    transaction_id: account.transaction_id,
    attorney_firm_id: account.attorney_firm_id || null,
    requested_by: actorProfile.userId || null,
    request_type: normalizedRequestType,
    request_status: 'requested',
    audience_role: normalizedAudienceRole,
    portal_visible: portalVisible !== false,
    title: normalizedTitle,
    description: normalizeNullableText(description),
    external_reference: normalizeNullableText(externalReference),
    currency_code: normalizeMatterFinancialCurrencyCode(account.currency_code),
    amount_due: normalizeOptionalNumber(amountDue),
    due_on: normalizeOptionalDate(dueOn),
    metadata_json: {
      source: 'attorney_matter_accounts_panel',
      protocol: 'finance_document_request_workflow',
    },
  }

  const { data, error } = await client
    .from('matter_financial_document_requests')
    .insert(payload)
    .select(
      'id, financial_account_id, transaction_id, attorney_firm_id, requested_by, completed_by, linked_document_id, request_type, request_status, audience_role, portal_visible, title, description, external_reference, currency_code, amount_due, due_on, requested_at, submitted_at, reviewed_at, completed_at, review_notes, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_document_requests')) {
      throw new Error(
        'Finance document requests are not set up yet. Apply the attorney accounting Phase 7 migration first.',
      )
    }
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: 'finance_document_request_created',
    eventVisibility: payload.portal_visible && normalizedAudienceRole !== 'internal' ? 'client_visible' : 'internal',
    actorProfile,
    payload: {
      requestId: data.id,
      requestType: normalizedRequestType,
      title: normalizedTitle,
      amountDue: payload.amount_due,
      dueOn: payload.due_on,
      portalVisible: payload.portal_visible,
    },
  })

  return buildMatterFinancialDocumentRequestViewModel(data)
}

export async function updateMatterFinancialDocumentRequestStatus({
  requestId,
  accountId = null,
  transactionId = null,
  requestStatus,
  reviewNotes = '',
  portalVisible = null,
} = {}) {
  const client = requireClient()
  const normalizedRequestId = normalizeNullableText(requestId)
  if (!normalizedRequestId) {
    throw new Error('Choose a finance request to update.')
  }

  let requestQuery = client
    .from('matter_financial_document_requests')
    .select(
      'id, financial_account_id, transaction_id, attorney_firm_id, requested_by, completed_by, linked_document_id, request_type, request_status, audience_role, portal_visible, title, description, external_reference, currency_code, amount_due, due_on, requested_at, submitted_at, reviewed_at, completed_at, review_notes, metadata_json, created_at, updated_at',
    )
    .eq('id', normalizedRequestId)

  if (accountId) requestQuery = requestQuery.eq('financial_account_id', accountId)
  if (transactionId) requestQuery = requestQuery.eq('transaction_id', transactionId)

  const existing = await requestQuery.maybeSingle()
  if (existing.error) {
    if (isMissingTableError(existing.error, 'matter_financial_document_requests')) {
      throw new Error(
        'Finance document requests are not set up yet. Apply the attorney accounting Phase 7 migration first.',
      )
    }
    throw existing.error
  }
  if (!existing.data?.id) {
    throw new Error('The selected finance request could not be found.')
  }

  const account = await fetchMatterFinancialAccountForMutation(
    client,
    existing.data.financial_account_id,
    transactionId || existing.data.transaction_id,
  )
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedStatus = normalizeMatterFinancialRequestStatus(requestStatus, existing.data.request_status)
  const now = new Date().toISOString()
  const patch = {
    request_status: normalizedStatus,
    review_notes: normalizeNullableText(reviewNotes) ?? existing.data.review_notes ?? null,
    metadata_json: {
      ...(existing.data.metadata_json || {}),
      lastStatusChangedAt: now,
      lastStatusChangedBy: actorProfile.userId || null,
      lastStatus: normalizedStatus,
    },
  }

  if (portalVisible !== null) {
    patch.portal_visible = portalVisible === true
  }
  if (['accepted', 'rejected', 'complete'].includes(normalizedStatus)) {
    patch.reviewed_at = now
  }
  if (normalizedStatus === 'complete') {
    patch.completed_at = now
    patch.completed_by = actorProfile.userId || null
  }

  const { data, error } = await client
    .from('matter_financial_document_requests')
    .update(patch)
    .eq('id', existing.data.id)
    .select(
      'id, financial_account_id, transaction_id, attorney_firm_id, requested_by, completed_by, linked_document_id, request_type, request_status, audience_role, portal_visible, title, description, external_reference, currency_code, amount_due, due_on, requested_at, submitted_at, reviewed_at, completed_at, review_notes, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: 'finance_document_request_status_updated',
    eventVisibility: data.portal_visible && data.audience_role !== 'internal' ? 'client_visible' : 'internal',
    actorProfile,
    payload: {
      requestId: data.id,
      requestType: data.request_type,
      requestStatus: data.request_status,
      title: data.title,
      reviewNotes: data.review_notes,
    },
  })

  return buildMatterFinancialDocumentRequestViewModel(data)
}
