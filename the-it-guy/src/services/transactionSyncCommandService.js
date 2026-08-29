import { requireClient } from './attorneyFirmServiceShared.js'

const VISIBILITY_RANK = Object.freeze({ internal: 0, professional_shared: 1, client_visible: 2 })

function text(value) {
  return String(value || '').trim()
}

function normalizeAudience(audience = []) {
  return [...new Set((Array.isArray(audience) ? audience : []).map((value) => text(value).toLowerCase()))]
    .filter((value) => ['buyer', 'seller', 'agent', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(value))
}

export function buildTransactionSyncIdempotencyKey({ transactionId, actionKey, sourceRecordId, revision = '' } = {}) {
  const raw = ['txsync', transactionId, actionKey, sourceRecordId, revision].map(text).filter(Boolean).join(':')
  return raw.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160)
}

export function isTransactionSyncPhase2Unavailable(error) {
  const message = text(error?.message || error).toLowerCase()
  return error?.code === 'PGRST202' || /bridge_commit_transaction_sync_command_phase2|schema cache|could not find the function/.test(message)
}

export async function commitTransactionSyncCommand({
  transactionId,
  actionKey,
  idempotencyKey,
  sourceTable,
  sourceRecordId,
  visibility = null,
  audience = [],
  professionalTitle,
  professionalDescription,
  clientTitle = null,
  clientDescription = null,
  eventData = {},
  client: providedClient = null,
  optionalUntilMigrated = false,
} = {}) {
  const client = providedClient || requireClient()
  const normalizedAudience = normalizeAudience(audience)
  const normalizedVisibility = visibility ? text(visibility).toLowerCase() : null
  if (!text(transactionId)) throw new Error('Transaction id is required.')
  if (!text(actionKey)) throw new Error('Transaction sync action key is required.')
  if (!text(sourceTable) || !text(sourceRecordId)) throw new Error('Transaction sync source identity is required.')
  if (!text(idempotencyKey) || text(idempotencyKey).length < 16) throw new Error('A stable transaction sync idempotency key is required.')
  if (normalizedVisibility && !(normalizedVisibility in VISIBILITY_RANK)) throw new Error('Invalid transaction sync visibility.')
  if (!text(professionalTitle) || !text(professionalDescription)) throw new Error('Professional activity copy is required.')
  if (normalizedVisibility === 'client_visible' && (
    !text(clientTitle) || !text(clientDescription) || !normalizedAudience.some((role) => ['buyer', 'seller'].includes(role))
  )) {
    throw new Error('Client-visible transaction activity requires safe copy and an explicit buyer or seller audience.')
  }
  if (typeof client?.rpc !== 'function') {
    if (optionalUntilMigrated) return null
    throw new Error('The transaction sync command client is unavailable.')
  }

  const result = await client.rpc('bridge_commit_transaction_sync_command_phase2', {
    p_transaction_id: text(transactionId),
    p_action_key: text(actionKey).toUpperCase(),
    p_idempotency_key: text(idempotencyKey),
    p_source_table: text(sourceTable),
    p_source_record_id: text(sourceRecordId),
    p_visibility: normalizedVisibility,
    p_audience: normalizedAudience,
    p_professional_title: text(professionalTitle),
    p_professional_description: text(professionalDescription),
    p_client_title: text(clientTitle) || null,
    p_client_description: text(clientDescription) || null,
    p_event_data: eventData && typeof eventData === 'object' && !Array.isArray(eventData) ? eventData : {},
  })
  if (result.error) {
    if (optionalUntilMigrated && isTransactionSyncPhase2Unavailable(result.error)) return null
    throw result.error
  }
  return result.data || null
}
