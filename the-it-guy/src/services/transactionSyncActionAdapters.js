import {
  buildTransactionSyncIdempotencyKey,
  commitTransactionSyncCommand,
} from './transactionSyncCommandService.js'

const PROFESSIONAL_AUDIENCE = Object.freeze([
  'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney',
])

const ACTION_ADAPTERS = {
  BUYER_TRANSACTION_PROFILE_UPDATED: ['buyer', 'transaction_participants', 'professional_shared', ['buyer', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  BUYER_ONBOARDING_COMPLETED: ['buyer', 'transaction_onboarding', 'client_visible', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney']],
  BUYER_DOCUMENT_UPLOADED: ['buyer', 'documents', 'professional_shared', ['buyer', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  BUYER_OTP_SIGNED: ['buyer', 'document_packets', 'client_visible', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney']],
  SELLER_TRANSACTION_PROFILE_UPDATED: ['seller', 'transaction_participants', 'professional_shared', ['seller', 'agent', 'transfer_attorney', 'cancellation_attorney']],
  SELLER_ONBOARDING_COMPLETED: ['seller', 'transaction_onboarding', 'client_visible', ['buyer', 'seller', 'agent', 'transfer_attorney', 'cancellation_attorney']],
  SELLER_DOCUMENT_UPLOADED: ['seller', 'documents', 'professional_shared', ['seller', 'agent', 'transfer_attorney', 'cancellation_attorney']],
  AGENT_TRANSACTION_UPDATED: ['agent', 'transactions', 'professional_shared', ['buyer', 'seller', ...PROFESSIONAL_AUDIENCE]],
  AGENT_ROLEPLAYER_ASSIGNED: ['agent', 'transaction_participants', 'client_visible', ['buyer', 'seller', ...PROFESSIONAL_AUDIENCE]],
  AGENT_CLIENT_UPDATE_PUBLISHED: ['agent', 'transaction_events', 'client_visible', ['buyer', 'seller', 'agent']],
  AGENT_OVERRIDE_APPLIED: ['agent', 'transaction_workflow_events', 'internal', ['agent', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  ORIGINATOR_PROGRESS_UPDATED: ['bond_originator', 'transaction_bond_originator_progress_events', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  ORIGINATOR_DOCUMENT_REQUESTED: ['bond_originator', 'transaction_bond_originator_document_requests', 'client_visible', ['buyer', 'agent', 'bond_originator']],
  ORIGINATOR_BANK_APPLICATION_SUBMITTED: ['bond_originator', 'transaction_bond_applications', 'client_visible', ['buyer', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  ORIGINATOR_BANK_OUTCOME_RECORDED: ['bond_originator', 'transaction_bond_bank_outcomes', 'professional_shared', ['buyer', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  ORIGINATOR_OFFER_PUBLISHED: ['bond_originator', 'transaction_bond_originator_bank_offer_captures', 'client_visible', ['buyer', 'agent', 'bond_originator']],
  ORIGINATOR_GRANT_RECORDED: ['bond_originator', 'transaction_bond_originator_grant_captures', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  TRANSFER_ATTORNEY_STAGE_UPDATED: ['transfer_attorney', 'transaction_subprocesses', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  TRANSFER_ATTORNEY_COMMENT_ADDED: ['transfer_attorney', 'transaction_attorney_lane_updates', 'internal', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  TRANSFER_ATTORNEY_DOCUMENT_REVIEWED: ['transfer_attorney', 'documents', 'professional_shared', ['buyer', 'seller', 'agent', 'transfer_attorney']],
  TRANSFER_ATTORNEY_LODGEMENT_CONFIRMED: ['transfer_attorney', 'transaction_subprocess_steps', 'client_visible', ['buyer', 'seller', ...PROFESSIONAL_AUDIENCE]],
  BOND_ATTORNEY_STAGE_UPDATED: ['bond_attorney', 'transaction_subprocesses', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney']],
  BOND_ATTORNEY_GUARANTEE_UPDATED: ['bond_attorney', 'transaction_subprocess_steps', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  BOND_ATTORNEY_COMMENT_ADDED: ['bond_attorney', 'transaction_attorney_lane_updates', 'internal', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  CANCELLATION_ATTORNEY_STAGE_UPDATED: ['cancellation_attorney', 'transaction_subprocesses', 'professional_shared', ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  CANCELLATION_ATTORNEY_GUARANTEE_UPDATED: ['cancellation_attorney', 'transaction_subprocess_steps', 'professional_shared', ['seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  CANCELLATION_ATTORNEY_COMMENT_ADDED: ['cancellation_attorney', 'transaction_attorney_lane_updates', 'internal', ['seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
  TRANSFER_REGISTRATION_CONFIRMED: ['transfer_attorney', 'transaction_subprocess_steps', 'client_visible', ['buyer', 'seller', ...PROFESSIONAL_AUDIENCE]],
  SYSTEM_EVIDENCE_RECONCILED: ['system', 'transaction_workflow_evidence', 'internal', ['agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney']],
}
for (const adapter of Object.values(ACTION_ADAPTERS)) {
  Object.freeze(adapter[3])
  Object.freeze(adapter)
}
export const TRANSACTION_SYNC_PHASE3_ACTION_ADAPTERS = Object.freeze(ACTION_ADAPTERS)

function text(value) {
  return String(value || '').trim()
}

export function getTransactionSyncActionAdapter(actionKey) {
  const normalizedActionKey = text(actionKey).toUpperCase()
  const row = TRANSACTION_SYNC_PHASE3_ACTION_ADAPTERS[normalizedActionKey]
  if (!row) return null
  return {
    actionKey: normalizedActionKey,
    ownerRole: row[0],
    sourceTable: row[1],
    defaultVisibility: row[2],
    audiences: [...row[3]],
  }
}

export function getTransactionSyncPhase3Coverage() {
  return Object.keys(TRANSACTION_SYNC_PHASE3_ACTION_ADAPTERS).sort()
}

export async function commitTransactionModuleAction({
  actionKey,
  transactionId,
  sourceRecordId,
  revision = '',
  idempotencyKey = '',
  visibility = null,
  audience = null,
  professionalTitle,
  professionalDescription,
  clientTitle = null,
  clientDescription = null,
  eventData = {},
  client = null,
  optionalUntilMigrated = false,
} = {}) {
  const adapter = getTransactionSyncActionAdapter(actionKey)
  if (!adapter) throw new Error(`Unknown Phase 3 transaction action: ${text(actionKey) || 'empty'}.`)
  const stableKey = text(idempotencyKey) || buildTransactionSyncIdempotencyKey({
    transactionId,
    actionKey: adapter.actionKey,
    sourceRecordId,
    revision,
  })
  return commitTransactionSyncCommand({
    client,
    transactionId,
    actionKey: adapter.actionKey,
    idempotencyKey: stableKey,
    sourceTable: adapter.sourceTable,
    sourceRecordId,
    visibility: visibility || adapter.defaultVisibility,
    audience: Array.isArray(audience) ? audience : adapter.audiences,
    professionalTitle,
    professionalDescription,
    clientTitle,
    clientDescription,
    eventData,
    optionalUntilMigrated,
  })
}
