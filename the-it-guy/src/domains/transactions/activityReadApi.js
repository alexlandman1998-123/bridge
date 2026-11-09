// Extracted read path; queries, filters, mapping and cache behaviour are preserved.
import { TRANSACTION_ROLE_LABELS } from '../../core/transactions/roleConfig'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { isMissingSchemaError, requireClient, isMissingTableError } from '../../lib/api/shared/readHelpers.js'

export const PROXY_UPDATE_CONFIRMATION_STATUSES = ['pending', 'confirmed', 'rejected', 'superseded']

export const PROXY_UPDATE_WORKFLOW_AREAS = [
  'general',
  'sales',
  'finance',
  'transfer',
  'bond',
  'cancellation',
  'documents',
  'onboarding',
  'client',
]

export const PROXY_UPDATE_TARGET_ROLE_LABELS = {
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
  attorney: 'Attorney / Conveyancer',
  bond_originator: 'Bond Originator',
  buyer: 'Buyer',
  seller: 'Seller',
  client: 'Client / Buyer',
  agent: 'Estate Agent',
  developer_contact: 'Developer Contact',
}

export const TRANSACTION_EVENT_TYPES = [
  'TransactionCreated',
  'TransactionUpdated',
  'TransactionStageChanged',
  'DocumentUploaded',
  'DocumentVisibilityChanged',
  'CommentAdded',
  'ParticipantAssigned',
  'WorkflowStepUpdated',
  'StatusLinkCreated',
  'OccupationalRentUpdated',
  'BondHybridFinanceWorkflowUpdated',
  'BondHybridFinanceApplicationUpdated',
  'BondHybridFinanceQuoteUpdated',
  'BondHybridFinanceInstructionSent',
  'transaction_created',
  'transfer_attorney_assigned',
  'bond_originator_assigned',
  'cancellation_attorney_assigned',
  'attorney_assignment_created',
  'bond_application_created',
  'AttorneyIncomingInstructionAccepted',
  'AttorneyIncomingInstructionDeclined',
  'CommercialAccessRequested',
  'CommercialAccessReviewed',
  'roleplayer_visibility_granted',
  'roleplayer_reassigned',
]

export function normalizeEventType(value) {
  return TRANSACTION_EVENT_TYPES.includes(value) ? value : 'TransactionUpdated'
}

export function normalizeTransactionEventRow(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    eventType: normalizeEventType(row?.event_type),
    eventData: row?.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    createdBy: row?.created_by || null,
    createdByRole: row?.created_by_role || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export function normalizeProxyUpdateTargetRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_')
    .replaceAll('-', '_')

  if (['conveyancer', 'attorney', 'transfer_conveyancer', 'buyer_attorney', 'seller_attorney'].includes(normalized)) {
    return 'transfer_attorney'
  }
  if (['bondoriginator', 'bond_originator', 'originator'].includes(normalized)) {
    return 'bond_originator'
  }
  if (['bond_attorney', 'bond_conveyancer'].includes(normalized)) {
    return 'bond_attorney'
  }
  if (['cancellation_attorney', 'cancellation_conveyancer'].includes(normalized)) {
    return 'cancellation_attorney'
  }
  if (['buyer', 'client'].includes(normalized)) {
    return 'buyer'
  }
  if (['seller', 'agent', 'developer_contact'].includes(normalized)) {
    return normalized
  }
  return normalized || 'transfer_attorney'
}

export function getProxyUpdateTargetRoleLabel(value) {
  const normalized = normalizeProxyUpdateTargetRole(value)
  return (
    PROXY_UPDATE_TARGET_ROLE_LABELS[normalized] ||
    TRANSACTION_ROLE_LABELS[normalized] ||
    normalized.replaceAll('_', ' ')
  )
}

export function normalizeProxyUpdateWorkflowArea(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_')
    .replaceAll('-', '_')
  return PROXY_UPDATE_WORKFLOW_AREAS.includes(normalized) ? normalized : 'general'
}

export function normalizeProxyUpdateConfirmationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return PROXY_UPDATE_CONFIRMATION_STATUSES.includes(normalized) ? normalized : 'pending'
}

export function normalizeTransactionProxyUpdateRow(row) {
  const targetRoleType = normalizeProxyUpdateTargetRole(row?.target_role_type)
  const workflowArea = normalizeProxyUpdateWorkflowArea(row?.workflow_area)
  const confirmationStatus = normalizeProxyUpdateConfirmationStatus(row?.confirmation_status)
  const createdByRole = normalizeRoleType(row?.created_by_role || 'developer')

  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    targetRoleType,
    targetRoleLabel: getProxyUpdateTargetRoleLabel(targetRoleType),
    targetParticipantId: row?.target_participant_id || null,
    workflowArea,
    workflowAreaLabel: workflowArea.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()),
    workflowStepId: row?.workflow_step_id || null,
    previousStatus: row?.previous_status || '',
    newStatus: row?.new_status || '',
    note: row?.note || '',
    evidenceDocumentId: row?.evidence_document_id || null,
    createdByUserId: row?.created_by_user_id || null,
    createdByRole,
    createdByRoleLabel: TRANSACTION_ROLE_LABELS[createdByRole] || createdByRole,
    confirmationStatus,
    confirmedByUserId: row?.confirmed_by_user_id || null,
    confirmedAt: row?.confirmed_at || null,
    rejectionReason: row?.rejection_reason || '',
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    isDemoData: Boolean(row?.is_demo_data),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export async function fetchTransactionProxyUpdatesWithClient(client, transactionId, { limit = 100 } = {}) {
  if (!transactionId) {
    return []
  }
  if (isOptionalRelationKnownMissing('transaction_proxy_updates')) return []

  const query = await client
    .from('transaction_proxy_updates')
    .select(
      'id, transaction_id, target_role_type, target_participant_id, workflow_area, workflow_step_id, previous_status, new_status, note, evidence_document_id, created_by_user_id, created_by_role, confirmation_status, confirmed_by_user_id, confirmed_at, rejection_reason, metadata, is_demo_data, created_at, updated_at',
    )
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.error) {
    if (rememberMissingOptionalRelation('transaction_proxy_updates', query.error) || isMissingSchemaError(query.error)) {
      return []
    }
    throw query.error
  }

  return (query.data || []).map((row) => normalizeTransactionProxyUpdateRow(row))
}

export async function fetchTransactionProxyUpdates(transactionId, options = {}) {
  const client = options.client || requireClient()
  return fetchTransactionProxyUpdatesWithClient(client, transactionId, {
    limit: options.limit || 100,
  })
}

export async function fetchTransactionEvents(transactionId, options = {}) {
  const { limit = 200, client: scopedClient = null } = options
  const client = scopedClient || requireClient()
  if (!transactionId) {
    return []
  }

  const query = await client
    .from('transaction_events')
    .select('id, transaction_id, event_type, event_data, created_by, created_by_role, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_events') || isMissingSchemaError(query.error)) {
      return []
    }

    throw query.error
  }

  return (query.data || []).map((row) => normalizeTransactionEventRow(row))
}
