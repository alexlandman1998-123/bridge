export const STORED_TRANSACTION_TYPES = Object.freeze(['developer_sale', 'private_property'])
export const ROUTING_DEVELOPMENT_TRANSACTION_TYPE = 'development_sale'
export const DEVELOPER_SALE_CHANNELS = Object.freeze([
  'developer_direct',
  'developer_assigned',
  'agency_introduced',
])
export const SELLER_PARTY_TYPES = Object.freeze(['developer', 'private_seller'])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && normalizeText(value)) return value
  }
  return ''
}

export function normalizeStoredTransactionType(value, fallback = 'developer_sale') {
  const normalized = normalizeKey(value)
  const fallbackKey = normalizeKey(fallback)
  const hasFallback = normalizeText(fallback) !== ''
  const normalizedFallback = STORED_TRANSACTION_TYPES.includes(fallbackKey) ? fallbackKey : ''

  if (!normalized) return normalizedFallback || (hasFallback ? 'developer_sale' : '')
  if (['development', 'development_sale', 'new_development', 'off_plan', 'developer', 'developer_sale'].includes(normalized)) {
    return 'developer_sale'
  }
  if (['private', 'private_sale', 'private_property', 'seller_owned', 'resale', 'sale'].includes(normalized)) {
    return 'private_property'
  }
  return normalizedFallback || (hasFallback ? 'developer_sale' : '')
}

export function isDeveloperSaleTransactionType(value) {
  return normalizeStoredTransactionType(value, 'private_property') === 'developer_sale'
}

export function normalizeRoutingTransactionType(value, context = {}) {
  const storedType = normalizeStoredTransactionType(value, '')
  if (
    storedType === 'developer_sale' ||
    context?.development_id ||
    context?.developmentId ||
    context?.development?.id ||
    context?.unit?.development_id ||
    context?.unit?.developmentId ||
    context?.unit?.development?.id
  ) {
    return ROUTING_DEVELOPMENT_TRANSACTION_TYPE
  }
  if (storedType === 'private_property') return 'private_sale'
  const normalized = normalizeKey(value)
  if (normalized === 'commercial' || normalized === 'commercial_transaction' || normalized === 'commercial_sale') {
    return 'commercial'
  }
  return normalized || 'unknown'
}

export function normalizeDeveloperSaleChannel(value, context = {}) {
  const normalized = normalizeKey(value)
  if (DEVELOPER_SALE_CHANNELS.includes(normalized)) return normalized

  const ownershipModel = normalizeKey(firstValue(
    context.ownershipModel,
    context.ownership_model,
    context.sourceContext?.ownershipModel,
    context.sourceContext?.ownership_model,
    context.lead?.ownershipModel,
    context.lead?.ownership_model,
  ))
  const leadOwner = normalizeKey(firstValue(
    context.leadOwner,
    context.lead_owner,
    context.sourceContext?.leadOwner,
    context.sourceContext?.lead_owner,
    context.lead?.leadOwner,
    context.lead?.lead_owner,
  ))
  const sellingModel = normalizeKey(firstValue(
    context.sellingModel,
    context.selling_model,
    context.sourceContext?.sellingModel,
    context.sourceContext?.selling_model,
    context.lead?.sellingModel,
    context.lead?.selling_model,
  ))
  const hasAgencySource = Boolean(firstValue(
    context.sourceAgencyOrgId,
    context.source_agency_org_id,
    context.sourceContext?.sourceAgencyOrgId,
    context.sourceContext?.source_agency_org_id,
    context.lead?.sourceAgencyOrgId,
    context.lead?.source_agency_org_id,
  ))
  const hasAssignedAgent = Boolean(firstValue(
    context.assignedAgentId,
    context.assigned_agent_id,
    context.assignedAgent,
    context.assigned_agent,
    context.sourceContext?.assignedAgentId,
    context.sourceContext?.assigned_agent_id,
    context.setup?.assignedAgentId,
    context.setup?.assigned_agent_id,
    context.transaction?.assignedAgentId,
    context.transaction?.assigned_agent_id,
    context.transaction?.assignedAgent,
    context.transaction?.assigned_agent,
    context.transaction?.assignedAgentEmail,
    context.transaction?.assigned_agent_email,
    context.lead?.assignedAgentId,
    context.lead?.assigned_agent_id,
  ))

  if (ownershipModel === 'agency_introduced' || leadOwner === 'agency' || hasAgencySource) {
    return 'agency_introduced'
  }
  if (ownershipModel === 'developer_assigned' || sellingModel === 'agent_led' || hasAssignedAgent) {
    return 'developer_assigned'
  }
  return 'developer_direct'
}

export function resolveTransactionSaleProfile({
  transaction = {},
  setup = {},
  sourceContext = {},
  lead = {},
  unit = {},
} = {}) {
  const explicitType = firstValue(
    transaction.transaction_type,
    transaction.transactionType,
    transaction.type,
    setup.transactionType,
    setup.transaction_type,
    sourceContext.transactionType,
    sourceContext.transaction_type,
  )
  const explicitSellerPartyType = normalizeKey(firstValue(
    transaction.seller_party_type,
    transaction.sellerPartyType,
    setup.sellerPartyType,
    setup.seller_party_type,
    sourceContext.sellerPartyType,
    sourceContext.seller_party_type,
  ))
  const hasDevelopmentContext = Boolean(
    transaction.development_id ||
      transaction.developmentId ||
      transaction.development?.id ||
      setup.developmentId ||
      setup.development_id ||
      sourceContext.developmentId ||
      sourceContext.development_id ||
      unit.development_id ||
      unit.developmentId ||
      unit.development?.id,
  )
  const explicitStoredType = normalizeStoredTransactionType(explicitType, '')
  const hasDeveloperSellerParty = explicitSellerPartyType === 'developer'
  const transactionType = explicitStoredType === 'private_property'
    ? 'private_property'
    : hasDevelopmentContext || hasDeveloperSellerParty
      ? 'developer_sale'
      : explicitStoredType || normalizeStoredTransactionType(explicitType, 'private_property')
  const isDeveloperSale = transactionType === 'developer_sale'
  const saleChannel = isDeveloperSale
    ? normalizeDeveloperSaleChannel(firstValue(
      transaction.sale_channel,
      transaction.saleChannel,
      setup.saleChannel,
      setup.sale_channel,
      sourceContext.saleChannel,
      sourceContext.sale_channel,
    ), { transaction, setup, sourceContext, lead })
    : null
  const sellerPartyType = isDeveloperSale ? 'developer' : 'private_seller'

  return Object.freeze({
    transactionType,
    routingTransactionType: normalizeRoutingTransactionType(transactionType, {
      ...transaction,
      unit,
    }),
    saleChannel,
    sellerPartyType,
    isDeveloperSale,
    isPrivateProperty: !isDeveloperSale,
    isDeveloperDirectSale: saleChannel === 'developer_direct',
    isDeveloperAssignedSale: saleChannel === 'developer_assigned',
    isAgencyIntroducedSale: saleChannel === 'agency_introduced',
  })
}
