export const STORED_TRANSACTION_TYPES = Object.freeze(['developer_sale', 'private_property'])
export const ROUTING_DEVELOPMENT_TRANSACTION_TYPE = 'development_sale'
export const DEVELOPER_SALE_CHANNELS = Object.freeze([
  'developer_direct',
  'developer_assigned',
  'agency_introduced',
])
export const SELLER_PARTY_TYPES = Object.freeze(['developer', 'private_seller'])
export const TRANSACTION_SALE_ROUTES = Object.freeze([
  'internal_developer_sale',
  'developer_assigned_sale',
  'external_agency_sale',
  'private_property_sale',
])

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

export function normalizeTransactionSaleRoute(value, fallback = 'private_property_sale') {
  const normalized = normalizeKey(value)
  const fallbackKey = normalizeKey(fallback)
  const hasFallback = normalizeText(fallback) !== ''
  const normalizedFallback = TRANSACTION_SALE_ROUTES.includes(fallbackKey) ? fallbackKey : ''

  if (!normalized) return normalizedFallback || (hasFallback ? 'private_property_sale' : '')
  if (['internal_developer_sale', 'developer_direct_sale', 'developer_direct', 'internal_developer'].includes(normalized)) {
    return 'internal_developer_sale'
  }
  if (['developer_assigned_sale', 'developer_assigned', 'assigned_developer_sale', 'agent_led_developer_sale'].includes(normalized)) {
    return 'developer_assigned_sale'
  }
  if (['external_agency_sale', 'agency_introduced_sale', 'agency_introduced', 'agency_sale', 'external_agent_sale'].includes(normalized)) {
    return 'external_agency_sale'
  }
  if (['private_property_sale', 'private_property', 'private_sale', 'resale', 'seller_owned_sale'].includes(normalized)) {
    return 'private_property_sale'
  }
  return normalizedFallback || (hasFallback ? 'private_property_sale' : '')
}

export function getTransactionSaleRouteBadge(value = '') {
  const saleRoute = normalizeTransactionSaleRoute(value)
  const labels = {
    internal_developer_sale: 'Internal Developer Sale',
    developer_assigned_sale: 'Developer Assigned Sale',
    external_agency_sale: 'External Agency Sale',
    private_property_sale: 'Private Property Sale',
  }
  const tones = {
    internal_developer_sale: 'emerald',
    developer_assigned_sale: 'blue',
    external_agency_sale: 'amber',
    private_property_sale: 'slate',
  }

  return Object.freeze({
    saleRoute,
    label: labels[saleRoute] || labels.private_property_sale,
    tone: tones[saleRoute] || tones.private_property_sale,
  })
}

export function getTransactionSalePartyModel(value = {}) {
  const saleRoute = normalizeTransactionSaleRoute(
    typeof value === 'string'
      ? value
      : value?.saleRoute || value?.sale_route || value?.transactionSaleProfile?.saleRoute,
  )
  const isDeveloperSale = saleRoute !== 'private_property_sale'
  const isExternalAgencySale = saleRoute === 'external_agency_sale'

  return Object.freeze({
    saleRoute,
    buyer: Object.freeze({
      key: 'buyer',
      label: 'Buyer',
      pendingLabel: 'Buyer pending',
      detailsLabel: 'Buyer Details',
      documentsLabel: 'Buyer Documents',
    }),
    seller: Object.freeze({
      key: isDeveloperSale ? 'developer' : 'seller',
      label: isDeveloperSale ? 'Developer' : 'Seller',
      pendingLabel: isDeveloperSale ? 'Developer pending' : 'Seller pending',
      detailsPendingLabel: isDeveloperSale ? 'Developer details pending' : 'Seller details pending',
      detailsLabel: isDeveloperSale ? 'Developer Details' : 'Seller Details',
      documentsLabel: isDeveloperSale ? 'Developer Documents' : 'Seller Documents',
      documentsShortLabel: isDeveloperSale ? 'Developer files' : 'Seller files',
      workspaceLabel: isDeveloperSale ? 'Developer Workspace' : 'Seller Workspace',
      companyLabel: isDeveloperSale ? 'Developer' : 'Client',
    }),
    agency: Object.freeze({
      key: 'agency',
      visible: isExternalAgencySale,
      label: 'Agency / Introducing Agent',
      pendingLabel: 'Agency / introducing agent pending',
      detailsLabel: 'Agency / Introducing Agent Details',
      documentsLabel: 'Agency Documents',
      companyLabel: 'Introducing Agency',
    }),
    agent: Object.freeze({
      key: 'agent',
      label: isExternalAgencySale
        ? 'Internal Sales Agent'
        : saleRoute === 'developer_assigned_sale'
          ? 'Assigned Sales Agent'
          : 'Agent',
      pendingLabel: 'Agent pending',
    }),
  })
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
  const routeFromValue = normalizeTransactionSaleRoute(value, '')
  if (routeFromValue === 'external_agency_sale') return 'agency_introduced'
  if (routeFromValue === 'developer_assigned_sale') return 'developer_assigned'
  if (routeFromValue === 'internal_developer_sale') return 'developer_direct'

  const explicitSaleRoute = normalizeTransactionSaleRoute(firstValue(
    context.saleRoute,
    context.sale_route,
    context.sourceContext?.saleRoute,
    context.sourceContext?.sale_route,
    context.lead?.saleRoute,
    context.lead?.sale_route,
    context.setup?.saleRoute,
    context.setup?.sale_route,
    context.transaction?.saleRoute,
    context.transaction?.sale_route,
  ), '')
  if (explicitSaleRoute === 'external_agency_sale') return 'agency_introduced'
  if (explicitSaleRoute === 'developer_assigned_sale') return 'developer_assigned'
  if (explicitSaleRoute === 'internal_developer_sale') return 'developer_direct'

  const ownershipModel = normalizeKey(firstValue(
    context.ownershipModel,
    context.ownership_model,
    context.sourceContext?.ownershipModel,
    context.sourceContext?.ownership_model,
    context.transaction?.ownershipModel,
    context.transaction?.ownership_model,
    context.lead?.ownershipModel,
    context.lead?.ownership_model,
  ))
  const leadOwner = normalizeKey(firstValue(
    context.leadOwner,
    context.lead_owner,
    context.sourceContext?.leadOwner,
    context.sourceContext?.lead_owner,
    context.transaction?.leadOwner,
    context.transaction?.lead_owner,
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
    context.transaction?.sourceAgencyOrgId,
    context.transaction?.source_agency_org_id,
    context.transaction?.sourceAgencyOrganisationId,
    context.transaction?.source_agency_organisation_id,
    context.transaction?.agencyOrganisationId,
    context.transaction?.agency_organisation_id,
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

export function resolveTransactionSaleRouteFromChannel(saleChannel, transactionType = 'private_property') {
  if (normalizeStoredTransactionType(transactionType, 'private_property') !== 'developer_sale') {
    return 'private_property_sale'
  }

  const normalizedChannel = normalizeDeveloperSaleChannel(saleChannel)
  if (normalizedChannel === 'agency_introduced') return 'external_agency_sale'
  if (normalizedChannel === 'developer_assigned') return 'developer_assigned_sale'
  return 'internal_developer_sale'
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
  const explicitSaleRoute = normalizeTransactionSaleRoute(firstValue(
    transaction.sale_route,
    transaction.saleRoute,
    setup.saleRoute,
    setup.sale_route,
    sourceContext.saleRoute,
    sourceContext.sale_route,
  ), '')
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
  const hasDeveloperSaleRoute = ['internal_developer_sale', 'developer_assigned_sale', 'external_agency_sale'].includes(explicitSaleRoute)
  const transactionType = explicitStoredType === 'private_property' || explicitSaleRoute === 'private_property_sale'
    ? 'private_property'
    : hasDevelopmentContext || hasDeveloperSellerParty || hasDeveloperSaleRoute
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
  const saleRoute = isDeveloperSale
    ? resolveTransactionSaleRouteFromChannel(saleChannel, transactionType)
    : 'private_property_sale'

  return Object.freeze({
    transactionType,
    routingTransactionType: normalizeRoutingTransactionType(transactionType, {
      ...transaction,
      unit,
    }),
    saleRoute,
    saleChannel,
    sellerPartyType,
    isDeveloperSale,
    isPrivateProperty: !isDeveloperSale,
    isInternalDeveloperSale: saleRoute === 'internal_developer_sale',
    isDeveloperDirectSale: saleChannel === 'developer_direct',
    isDeveloperAssignedRoute: saleRoute === 'developer_assigned_sale',
    isDeveloperAssignedSale: saleChannel === 'developer_assigned',
    isExternalAgencySale: saleRoute === 'external_agency_sale',
    isAgencyIntroducedSale: saleChannel === 'agency_introduced',
  })
}

export function resolveTransactionSaleRoute(context = {}) {
  return resolveTransactionSaleProfile(context).saleRoute
}
