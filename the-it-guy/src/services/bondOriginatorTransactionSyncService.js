import { requireClient } from './attorneyFirmServiceShared.js'
import { getBondOriginatorTransactionSyncReadModel } from './transactionSyncReadModelService.js'

function text(value) {
  return String(value || '').trim()
}

export async function recordBondOriginatorProgressAndSync({
  exportPackageId,
  eventType = 'originator_update',
  status = 'in_progress',
  title,
  summary,
  internalNote = null,
  visibleToBuyer = true,
  visibleToAgent = true,
  visibleToOriginator = true,
  progressCategory = 'operational_update',
  idempotencyKey,
  client: providedClient = null,
} = {}) {
  if (!text(exportPackageId)) throw new Error('Bond originator export package is required.')
  if (!text(title) || !text(summary)) throw new Error('Progress title and summary are required.')
  if (text(idempotencyKey).length < 16) throw new Error('A stable progress idempotency key is required.')
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_record_bond_originator_progress_and_sync_phase3', {
    p_export_package_id: text(exportPackageId),
    p_event_type: text(eventType) || 'originator_update',
    p_status: text(status) || 'in_progress',
    p_title: text(title),
    p_summary: text(summary),
    p_idempotency_key: text(idempotencyKey),
    p_internal_note: text(internalNote) || null,
    p_visible_to_buyer: visibleToBuyer !== false,
    p_visible_to_agent: visibleToAgent !== false,
    p_visible_to_originator: visibleToOriginator !== false,
    p_progress_category: text(progressCategory) || 'operational_update',
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function getBondOriginatorProgressWorkspace(exportPackageId, { client: providedClient = null } = {}) {
  if (!text(exportPackageId)) return null
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_originator_progress_workspace_view', {
    p_export_package_id: text(exportPackageId),
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function getClientBondOriginatorProgress({ client: providedClient = null } = {}) {
  const client = providedClient || requireClient()
  const result = await client.rpc('bridge_client_portal_bond_originator_progress_view')
  if (result.error) throw result.error
  return result.data || null
}

export function getBondOriginatorCanonicalTransactionWorkspace(transactionId, options = {}) {
  return getBondOriginatorTransactionSyncReadModel(transactionId, options)
}
