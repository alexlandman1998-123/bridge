// clientPortal owns these operations and their existing recovery behavior.
import { normalizeNullableUuid, requireClient, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { ensureDevelopmentSettings } from '../developments/configurationApi.js'
import { generateClientPortalToken } from './tokenHelpers.js'

export async function fetchClientPortalLinks(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return []
  }

  const { data, error } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      return []
    }

    throw error
  }

  return data
}

export async function getOrCreateClientPortalLink({ developmentId, unitId, transactionId, buyerId = null }) {
  const client = requireClient()

  const link = await getOrCreateClientPortalLinkRecord(client, {
    developmentId,
    unitId,
    transactionId,
    buyerId,
    requireDevelopmentSettings: true,
  })

  if (!link) {
    throw new Error('A transaction and buyer are required for buyer portal setup.')
  }

  return link
}

export async function getOrCreateClientPortalLinkRecord(
  client,
  { developmentId, unitId, transactionId, buyerId = null, requireDevelopmentSettings = false } = {},
) {
  const normalizedDevelopmentId = normalizeNullableUuid(developmentId)
  const normalizedUnitId = normalizeNullableUuid(unitId)
  const normalizedTransactionId = normalizeNullableUuid(transactionId)
  const normalizedBuyerId = normalizeNullableUuid(buyerId)

  if (!normalizedTransactionId) {
    return null
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id, transaction_type')
    .eq('id', normalizedTransactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }
  if (!transaction) {
    throw new Error('Transaction not found for buyer portal setup.')
  }

  const transactionDevelopmentId = normalizeNullableUuid(transaction.development_id)
  const transactionUnitId = normalizeNullableUuid(transaction.unit_id)
  const transactionBuyerId = normalizeNullableUuid(transaction.buyer_id)
  if (Boolean(transactionDevelopmentId) !== Boolean(transactionUnitId)) {
    throw new Error('The transaction has incomplete development context.')
  }
  if (!transactionBuyerId) {
    throw new Error('The transaction must have a buyer before buyer portal setup can complete.')
  }
  if (normalizedDevelopmentId && normalizedDevelopmentId !== transactionDevelopmentId) {
    throw new Error('The selected development does not belong to this transaction.')
  }
  if (normalizedUnitId && normalizedUnitId !== transactionUnitId) {
    throw new Error('The selected unit does not belong to this transaction.')
  }
  if (normalizedBuyerId && normalizedBuyerId !== transactionBuyerId) {
    throw new Error('The selected buyer does not belong to this transaction.')
  }

  if (transactionDevelopmentId) {
    const settings = await ensureDevelopmentSettings(client, transactionDevelopmentId)
    if (!settings.client_portal_enabled) {
      if (requireDevelopmentSettings) {
        throw new Error('Client portal is disabled for this development.')
      }
      return null
    }
  }

  const { data: existing, error: existingError } = await client
    .from('client_portal_links')
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .eq('transaction_id', normalizedTransactionId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw existingError
  }

  if (existing) {
    if (
      normalizeNullableUuid(existing.development_id) !== transactionDevelopmentId ||
      normalizeNullableUuid(existing.unit_id) !== transactionUnitId ||
      normalizeNullableUuid(existing.buyer_id) !== transactionBuyerId
    ) {
      throw new Error('The existing buyer portal link does not match its transaction.')
    }
    return existing
  }

  const { data, error } = await client
    .from('client_portal_links')
    .insert({
      development_id: transactionDevelopmentId,
      unit_id: transactionUnitId,
      transaction_id: normalizedTransactionId,
      buyer_id: transactionBuyerId,
      token: generateClientPortalToken(),
      is_active: true,
    })
    .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
    .single()

  if (error && error.code === '23505') {
    const { data: conflicted, error: conflictedError } = await client
      .from('client_portal_links')
      .select('id, development_id, unit_id, transaction_id, buyer_id, token, is_active, created_at, updated_at')
      .eq('transaction_id', normalizedTransactionId)
      .eq('is_active', true)
      .maybeSingle()

    if (conflictedError) {
      throw conflictedError
    }

    if (conflicted) {
      return conflicted
    }
  }

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  return data
}

export async function revokeClientPortalLink(linkId) {
  const client = requireClient()
  const { error } = await client.from('client_portal_links').update({ is_active: false }).eq('id', linkId)

  if (error) {
    if (isMissingTableError(error, 'client_portal_links')) {
      throw new Error('Client portal links are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }
}
