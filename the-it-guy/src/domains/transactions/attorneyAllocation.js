// transactions owns these operations and their existing recovery behavior.
import { normalizeNullableUuid, normalizeNullableText, isMissingColumnError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'

export function resolvePurchasePrice({ setup = {}, formData = {}, transaction = null } = {}) {
  const candidates = [
    setup?.salesPrice,
    formData?.purchase_price,
    transaction?.purchase_price,
    transaction?.sales_price,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeOptionalNumber(candidate)
    if (normalized !== null) {
      return normalized
    }
  }

  return null
}

export async function resolveDevelopmentOrganisationId(client, developmentId) {
  const normalizedDevelopmentId = normalizeNullableUuid(developmentId)
  if (!normalizedDevelopmentId) return null

  const query = await client
    .from('developments')
    .select('id, organisation_id')
    .eq('id', normalizedDevelopmentId)
    .maybeSingle()

  if (query.error) {
    if (isMissingSchemaError(query.error) || isMissingColumnError(query.error, 'organisation_id')) {
      return null
    }
    throw query.error
  }

  return normalizeNullableUuid(query.data?.organisation_id)
}

export async function findOrCreateBuyer(client, { name, phone, email, organisationId = null }) {
  const normalizedName = name.trim()
  const normalizedPhone = phone?.trim() || null
  const normalizedEmail = email?.trim().toLowerCase() || null
  const normalizedOrganisationId = normalizeNullableUuid(organisationId)

  let existing = null

  if (normalizedEmail) {
    let query = client
      .from('buyers')
      .select('id, name, phone, email')
      .ilike('email', normalizedEmail)
      .order('id', { ascending: true })
      .limit(1)
    if (normalizedOrganisationId) {
      query = query.eq('organisation_id', normalizedOrganisationId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      throw error
    }

    existing = data
  }

  if (!existing && normalizedPhone) {
    let query = client
      .from('buyers')
      .select('id, name, phone, email')
      .eq('phone', normalizedPhone)
      .order('id', { ascending: true })
      .limit(1)
    if (normalizedOrganisationId) {
      query = query.eq('organisation_id', normalizedOrganisationId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      throw error
    }

    existing = data
  }

  if (!existing) {
    const insertPayload = {
      name: normalizedName,
      phone: normalizedPhone,
      email: normalizedEmail,
    }
    if (normalizedOrganisationId) {
      insertPayload.organisation_id = normalizedOrganisationId
    }

    const { data, error } = await client
      .from('buyers')
      .insert(insertPayload)
      .select('id, name, phone, email')
      .single()

    if (error) {
      throw error
    }

    return data
  }

  const shouldUpdate =
    existing.name !== normalizedName ||
    (!!normalizedPhone && existing.phone !== normalizedPhone) ||
    (!!normalizedEmail && existing.email?.toLowerCase() !== normalizedEmail)

  if (!shouldUpdate) {
    return existing
  }

  const { data, error } = await client
    .from('buyers')
    .update({
      name: normalizedName,
      phone: normalizedPhone || existing.phone || null,
      email: normalizedEmail || existing.email || null,
    })
    .eq('id', existing.id)
    .select('id, name, phone, email')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const FIRM_FIRST_ATTORNEY_ROLE_TYPES = new Set([
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
])

export function isFirmFirstAttorneyAllocation(selection = {}) {
  const roleType = selection?.roleType || selection?.role_type
  const snapshot = selection?.snapshot || selection?.snapshot_json || {}
  return FIRM_FIRST_ATTORNEY_ROLE_TYPES.has(roleType) &&
    (selection?.firmFirstAllocation === true || snapshot?.firmFirstAllocation === true)
}

export async function persistTransactionCommissionSnapshotIfPossible(
  client,
  { transactionId, commissionSnapshot = null, setup = {} } = {},
) {
  if (!transactionId || !commissionSnapshot || typeof commissionSnapshot !== 'object') {
    return null
  }

  const looksLikeUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
  const organisationId = normalizeNullableText(commissionSnapshot.organisationId)
  if (!organisationId || !looksLikeUuid(organisationId)) {
    return null
  }
  const assignedAgentUserId = normalizeNullableText(setup.assignedAgentUserId)
  const salePrice =
    normalizeOptionalNumber(commissionSnapshot.salePrice) ??
    normalizeOptionalNumber(setup.salesPrice) ??
    normalizeOptionalNumber(setup.purchasePrice)
  const payload = {
    organisation_id: organisationId,
    transaction_id: transactionId,
    assigned_agent_id: looksLikeUuid(assignedAgentUserId) ? assignedAgentUserId : null,
    assigned_agent_email: normalizeNullableText(setup.assignedAgentEmail)?.toLowerCase() || null,
    commission_structure_id: normalizeNullableText(commissionSnapshot.commissionStructureId),
    commission_structure_name_snapshot: normalizeNullableText(commissionSnapshot.commissionStructureName),
    sale_price: salePrice,
    gross_commission_percentage: normalizeOptionalNumber(commissionSnapshot.grossCommissionPercentage),
    gross_commission_amount: normalizeOptionalNumber(commissionSnapshot.grossCommissionAmount),
    agent_split_percentage_snapshot: normalizeOptionalNumber(commissionSnapshot.agentSplitPercentage),
    agency_split_percentage_snapshot: normalizeOptionalNumber(commissionSnapshot.agencySplitPercentage),
    agent_commission_amount: normalizeOptionalNumber(commissionSnapshot.agentCommissionAmount),
    agency_commission_amount: normalizeOptionalNumber(commissionSnapshot.agencyCommissionAmount),
    status: normalizeNullableText(commissionSnapshot.status) || 'projected',
    updated_at: new Date().toISOString(),
  }

  // The canonical command checks the transaction, organisation and assigned
  // actor. Direct table writes are intentionally restricted to administrators.
  const rpcPayload = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key !== 'updated_at')
      .map(([key, value]) => [`p_${key}`, value]),
  )
  const result = await client.rpc('bridge_upsert_transaction_commission_snapshot', rpcPayload)
  if (result.error) throw result.error
  return payload

}

export async function persistCommissionSnapshotToTransactionRowIfPossible(
  client,
  { transactionId, commissionSnapshot = null } = {},
) {
  if (!transactionId || !commissionSnapshot || typeof commissionSnapshot !== 'object') {
    return null
  }

  const payload = {
    gross_commission_percentage: normalizeOptionalNumber(commissionSnapshot.grossCommissionPercentage),
    gross_commission_amount: normalizeOptionalNumber(commissionSnapshot.grossCommissionAmount),
    agent_split_percentage_snapshot: normalizeOptionalNumber(commissionSnapshot.agentSplitPercentage),
    agency_split_percentage_snapshot: normalizeOptionalNumber(commissionSnapshot.agencySplitPercentage),
    agent_commission_amount: normalizeOptionalNumber(commissionSnapshot.agentCommissionAmount),
    agency_commission_amount: normalizeOptionalNumber(commissionSnapshot.agencyCommissionAmount),
    updated_at: new Date().toISOString(),
  }

  let updateResult = await client.from('transactions').update(payload).eq('id', transactionId).select('id').single()

  if (!updateResult.error) {
    return payload
  }

  if (
    !isMissingColumnError(updateResult.error, 'gross_commission_percentage') &&
    !isMissingColumnError(updateResult.error, 'gross_commission_amount') &&
    !isMissingColumnError(updateResult.error, 'agent_split_percentage_snapshot') &&
    !isMissingColumnError(updateResult.error, 'agency_split_percentage_snapshot') &&
    !isMissingColumnError(updateResult.error, 'agent_commission_amount') &&
    !isMissingColumnError(updateResult.error, 'agency_commission_amount')
  ) {
    throw updateResult.error
  }

  const fallbackPayload = {
    gross_commission_amount: normalizeOptionalNumber(commissionSnapshot.grossCommissionAmount),
    agent_commission_amount: normalizeOptionalNumber(commissionSnapshot.agentCommissionAmount),
    agency_commission_amount: normalizeOptionalNumber(commissionSnapshot.agencyCommissionAmount),
    updated_at: new Date().toISOString(),
  }

  updateResult = await client.from('transactions').update(fallbackPayload).eq('id', transactionId).select('id').single()

  if (
    updateResult.error &&
    !isMissingColumnError(updateResult.error, 'gross_commission_amount') &&
    !isMissingColumnError(updateResult.error, 'agent_commission_amount') &&
    !isMissingColumnError(updateResult.error, 'agency_commission_amount')
  ) {
    throw updateResult.error
  }

  return fallbackPayload
}
