// clientPortal owns these operations and their existing recovery behavior.
import { isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { requireClientPortalTokenClient } from './appointmentRead.js'

function normalizeAttorneyUpdateAudience(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
  if (normalized === 'purchaser') return 'buyer'
  if (normalized === 'vendor') return 'seller'
  if (['buyer', 'seller'].includes(normalized)) return normalized
  return ''
}

function normalizeAttorneyUpdateRecipients(recipients = []) {
  const source = Array.isArray(recipients) ? recipients : [recipients]
  const normalized = new Set()
  for (const recipient of source) {
    const audience = normalizeAttorneyUpdateAudience(recipient)
    if (audience) normalized.add(audience)
    const value = String(recipient || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
    if (['client', 'clients', 'both', 'shared', 'buyer_and_seller', 'seller_and_buyer'].includes(value)) {
      normalized.add('buyer')
      normalized.add('seller')
    }
  }
  return normalized.size ? [...normalized] : ['buyer', 'seller']
}

function attorneyLaneLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('bond')) return 'Bond attorney'
  if (normalized.includes('cancellation')) return 'Cancellation attorney'
  return 'Transfer attorney'
}

function mapAttorneyLaneUpdateForClient(row = {}, subprocessById = {}) {
  const recipients = normalizeAttorneyUpdateRecipients(row.client_recipients || row.metadata?.clientRecipients || [])
  const stage = subprocessById[row.subprocess_id]?.current_stage || row.metadata?.stageLabel || row.metadata?.stage || ''
  const laneKey = String(row.lane_key || row.attorney_role || 'transfer').trim().toLowerCase()
  return {
    id: row.id || null,
    transactionId: row.transaction_id || null,
    source: 'attorney_lane_update',
    type: 'attorney_lane_update',
    visibility: 'client_visible',
    laneKey,
    laneLabel: attorneyLaneLabel(laneKey || row.attorney_role),
    attorneyRole: row.attorney_role || null,
    updateType: row.update_type || null,
    title: row.metadata?.updateTypeLabel || row.metadata?.title || 'Legal update',
    message: row.message || '',
    commentBody: row.message || '',
    createdAt: row.created_at || null,
    timestamp: row.created_at || null,
    stage,
    clientRecipients: recipients,
    audience: recipients.length === 1 ? recipients[0] : 'buyer_and_seller',
    actor: 'Legal team',
    actorRole: 'Attorney',
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      title: row.metadata?.updateTypeLabel || row.metadata?.title || 'Legal update',
      description: row.message || 'Your legal team shared a progress update.',
      laneKey,
      laneLabel: attorneyLaneLabel(laneKey || row.attorney_role),
      stage,
      audience: recipients.length === 1 ? recipients[0] : 'buyer_and_seller',
      clientRecipients: recipients,
      visibility: 'client_visible',
      displayType: 'update',
      topic: 'legal',
    },
  }
}

export async function fetchClientVisibleAttorneyLaneUpdates(client, transactionId, viewerRole = 'buyer', options = {}) {
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedViewerRole = normalizeAttorneyUpdateAudience(viewerRole) || (String(viewerRole || '').toLowerCase() === 'client' ? 'buyer' : '')
  if (!normalizedTransactionId || !normalizedViewerRole) return []

  let query = await client
    .from('transaction_attorney_lane_updates')
    .select('id, transaction_id, subprocess_id, lane_key, attorney_role, update_type, visibility, message, created_by, created_at, metadata, related_document_id, related_signing_packet_id, client_recipients')
    .eq('transaction_id', normalizedTransactionId)
    .eq('visibility', 'client_visible')
    .neq('update_type', 'transfer_journey_progress')
    .order('created_at', { ascending: false })
    .limit(options.limit || 20)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'metadata') ||
      isMissingColumnError(query.error, 'related_document_id') ||
      isMissingColumnError(query.error, 'related_signing_packet_id') ||
      isMissingColumnError(query.error, 'client_recipients'))
  ) {
    query = await client
      .from('transaction_attorney_lane_updates')
      .select('id, transaction_id, subprocess_id, lane_key, attorney_role, update_type, visibility, message, created_by, created_at')
      .eq('transaction_id', normalizedTransactionId)
      .eq('visibility', 'client_visible')
      .neq('update_type', 'transfer_journey_progress')
      .order('created_at', { ascending: false })
      .limit(options.limit || 20)
  }

  if (query.error) {
    if (isMissingSchemaError(query.error) || isPermissionDeniedError(query.error)) return []
    throw query.error
  }

  const rows = (query.data || []).filter((row) =>
    normalizeAttorneyUpdateRecipients(row.client_recipients || row.metadata?.clientRecipients || []).includes(normalizedViewerRole),
  )
  if (!rows.length) return []

  const subprocessIds = [...new Set(rows.map((row) => row.subprocess_id).filter(Boolean))]
  let subprocessById = {}
  if (subprocessIds.length) {
    const subprocessQuery = await client
      .from('transaction_subprocesses')
      .select('id, current_stage, process_type, attorney_role')
      .in('id', subprocessIds)
    if (!subprocessQuery.error) {
      subprocessById = Object.fromEntries((subprocessQuery.data || []).map((row) => [row.id, row]))
    } else if (!isMissingSchemaError(subprocessQuery.error) && !isPermissionDeniedError(subprocessQuery.error)) {
      throw subprocessQuery.error
    }
  }

  return rows.map((row) => mapAttorneyLaneUpdateForClient(row, subprocessById))
}

export async function fetchClientPortalOriginatorFinanceByToken(token) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const { data, error } = await client.rpc('bridge_read_buyer_originator_finance', {
    p_transaction_id: link.transaction_id,
  })
  if (error) throw error
  if (!data || data.source !== 'bond_originator') throw new Error('Originator finance is unavailable.')
  return data
}

export async function resolveClientPortalLinkByToken(client, token) {
  const { data, error } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  if (!data) {
    throw new Error('Client portal link is invalid or inactive.')
  }

  return data
}
