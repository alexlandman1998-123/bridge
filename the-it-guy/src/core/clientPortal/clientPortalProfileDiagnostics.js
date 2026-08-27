import { resolveClientPortalProfile } from './clientPortalProfile.js'

export const CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
})

export const CLIENT_PORTAL_DIAGNOSTIC_CODES = Object.freeze({
  MISSING_PROFILE: 'missing_profile',
  MISSING_ORIGIN_FIELDS: 'missing_origin_fields',
  PRIVATE_PROPERTY_WITH_DEVELOPMENT_ROUTE: 'private_property_with_development_route',
  DEVELOPER_SALE_WITHOUT_DEVELOPMENT_CONTEXT: 'developer_sale_without_development_context',
  EXTERNAL_AGENCY_WITHOUT_AGENCY_REFERENCE: 'external_agency_without_agency_reference',
  DIRECT_DEVELOPER_WITH_AGENCY_REFERENCE: 'direct_developer_with_agency_reference',
  DEVELOPMENT_MODULE_VISIBLE_FOR_RESALE: 'development_module_visible_for_resale',
  SELLER_PORTAL_DEVELOPMENT_MODULE_VISIBLE: 'seller_portal_development_module_visible',
  SUPPRESSED_DEVELOPMENT_SETTING: 'suppressed_development_setting',
  DISABLED_SECTION_ACTION_LEAK: 'disabled_section_action_leak',
  DISABLED_SECTION_ACTIVITY_LEAK: 'disabled_section_activity_leak',
  BLOCKING_ACTION_ROUTE_FALLBACK: 'blocking_action_route_fallback',
})

const DEVELOPMENT_SECTION_KEYS = Object.freeze(['handover', 'snags', 'alterations', 'review'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\s-]+/g, '_')
}

function hasValue(...values) {
  return values.some((value) => normalizeText(value))
}

function hasTruthySetting(settings = {}, ...keys) {
  return keys.some((key) => {
    const value = settings?.[key]
    if (value === true || value === 1) return true
    const normalized = normalizeKey(value)
    return normalized === 'true' || normalized === '1' || normalized === 'enabled'
  })
}

function normalizeRoute(route = '') {
  const normalized = normalizeKey(route)
  if (!normalized || normalized === 'home') return 'overview'
  if (normalized.includes('/')) return normalizeRoute(normalized.split('/').pop())
  if (normalized === 'bondapplication') return 'bond_application'
  return normalized
}

function createDiagnostic({
  code,
  severity = CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
  title,
  message,
  field = '',
  metadata = {},
}) {
  return Object.freeze({
    code,
    severity,
    title,
    message,
    field,
    metadata: Object.freeze(metadata || {}),
  })
}

function getSourceAgencyReference(transaction = {}, sourceContext = {}, lead = {}) {
  return normalizeText(
    transaction?.source_agency_org_id ||
      transaction?.sourceAgencyOrgId ||
      transaction?.source_agency_organisation_id ||
      transaction?.sourceAgencyOrganisationId ||
      transaction?.agency_organisation_id ||
      transaction?.agencyOrganisationId ||
      sourceContext?.source_agency_org_id ||
      sourceContext?.sourceAgencyOrgId ||
      lead?.source_agency_org_id ||
      lead?.sourceAgencyOrgId,
  )
}

function getRouteLeaks(items = [], enabledSections = {}, routeAccessor) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const route = normalizeRoute(routeAccessor(item))
      return {
        item,
        route,
      }
    })
    .filter(({ route }) => route && Object.prototype.hasOwnProperty.call(enabledSections, route))
    .filter(({ route }) => enabledSections[route] === false)
}

export function buildClientPortalProfileDiagnostics({
  portalProfile = null,
  transaction = {},
  unit = {},
  settings = {},
  sourceContext = {},
  lead = {},
  workspace = 'shared',
  hasBuyingContext = true,
  hasSellingContext = false,
  nextActions = [],
  activityFeed = [],
} = {}) {
  const profile = portalProfile || resolveClientPortalProfile({
    transaction,
    unit,
    settings,
    sourceContext,
    lead,
    workspace,
    hasBuyingContext,
    hasSellingContext,
  })
  const diagnostics = []

  if (!profile) {
    return [
      createDiagnostic({
        code: CLIENT_PORTAL_DIAGNOSTIC_CODES.MISSING_PROFILE,
        severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR,
        title: 'Portal profile missing',
        message: 'The portal could not resolve a canonical profile for this client session.',
      }),
    ]
  }

  const transactionType = normalizeKey(transaction?.transaction_type || transaction?.transactionType)
  const saleRoute = normalizeKey(transaction?.sale_route || transaction?.saleRoute || profile.saleRoute)
  const sellerPartyType = normalizeKey(transaction?.seller_party_type || transaction?.sellerPartyType || profile.sellerPartyType)
  const leadOwner = normalizeKey(transaction?.lead_owner || transaction?.leadOwner || sourceContext?.leadOwner || lead?.leadOwner)
  const ownershipModel = normalizeKey(
    transaction?.ownership_model ||
      transaction?.ownershipModel ||
      sourceContext?.ownershipModel ||
      lead?.ownershipModel,
  )
  const sourceAgencyReference = getSourceAgencyReference(transaction, sourceContext, lead)
  const hasDevelopmentContext = hasValue(
    transaction?.development_id,
    transaction?.developmentId,
    transaction?.development?.id,
    unit?.development_id,
    unit?.developmentId,
    unit?.development?.id,
  )

  if (!transactionType && !saleRoute && !sellerPartyType && !leadOwner && !ownershipModel && !sourceAgencyReference) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.MISSING_ORIGIN_FIELDS,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Sale origin fields missing',
      message: 'This portal resolved without explicit sale-origin fields, so classification is relying on fallback context.',
      field: 'transaction.sale_origin',
    }))
  }

  if (transactionType === 'private_property' && ['internal_developer_sale', 'developer_assigned_sale', 'external_agency_sale'].includes(saleRoute)) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.PRIVATE_PROPERTY_WITH_DEVELOPMENT_ROUTE,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR,
      title: 'Private sale has developer route',
      message: 'The transaction is marked private-property but carries a developer sale route.',
      field: 'transaction.sale_route',
      metadata: { transactionType, saleRoute },
    }))
  }

  if (profile.isDevelopmentBuyerPortal && !hasDevelopmentContext) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.DEVELOPER_SALE_WITHOUT_DEVELOPMENT_CONTEXT,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Development portal missing development context',
      message: 'This portal resolved as a development buyer portal but no development context was found.',
      field: 'transaction.development_id',
    }))
  }

  if (profile.isAgencyIntroducedDevelopmentPortal && !sourceAgencyReference && leadOwner !== 'agency' && ownershipModel !== 'agency_introduced') {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.EXTERNAL_AGENCY_WITHOUT_AGENCY_REFERENCE,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Agency-introduced portal missing agency reference',
      message: 'This external agency sale has no introducing agency reference, lead owner, or agency-introduced ownership model.',
      field: 'transaction.source_agency_org_id',
    }))
  }

  if (
    (profile.isDeveloperBuyerPortal || profile.saleRoute === 'developer_assigned_sale') &&
    (sourceAgencyReference || leadOwner === 'agency' || ownershipModel === 'agency_introduced')
  ) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.DIRECT_DEVELOPER_WITH_AGENCY_REFERENCE,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Developer-direct portal has agency markers',
      message: 'The portal resolved as a direct or assigned developer sale but still has agency-introduced source markers.',
      field: 'transaction.source_agency_org_id',
      metadata: { leadOwner, ownershipModel, sourceAgencyReference },
    }))
  }

  for (const sectionKey of DEVELOPMENT_SECTION_KEYS) {
    if (profile.isAgencyResaleBuyerPortal && profile.enabledSections?.[sectionKey] === true) {
      diagnostics.push(createDiagnostic({
        code: CLIENT_PORTAL_DIAGNOSTIC_CODES.DEVELOPMENT_MODULE_VISIBLE_FOR_RESALE,
        severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR,
        title: 'Development module visible on resale portal',
        message: `${sectionKey} is enabled for an agency resale buyer portal.`,
        field: `enabledSections.${sectionKey}`,
      }))
    }

    if (profile.isSellerPortal && profile.enabledSections?.[sectionKey] === true) {
      diagnostics.push(createDiagnostic({
        code: CLIENT_PORTAL_DIAGNOSTIC_CODES.SELLER_PORTAL_DEVELOPMENT_MODULE_VISIBLE,
        severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR,
        title: 'Development module visible on seller portal',
        message: `${sectionKey} is enabled for a seller portal.`,
        field: `enabledSections.${sectionKey}`,
      }))
    }
  }

  const suppressedDevelopmentSettings = [
    ['snags', 'snag_reporting_enabled', 'snagReportingEnabled'],
    ['alterations', 'alteration_requests_enabled', 'alterationRequestsEnabled'],
    ['review', 'service_reviews_enabled', 'serviceReviewsEnabled'],
  ].filter(([sectionKey, snakeKey, camelKey]) =>
    profile.enabledSections?.[sectionKey] === false && hasTruthySetting(settings, snakeKey, camelKey),
  )

  for (const [sectionKey] of suppressedDevelopmentSettings) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.SUPPRESSED_DEVELOPMENT_SETTING,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.INFO,
      title: 'Development setting suppressed by portal profile',
      message: `${sectionKey} is enabled in development settings but suppressed by this portal type.`,
      field: `enabledSections.${sectionKey}`,
    }))
  }

  const actionLeaks = getRouteLeaks(nextActions, profile.enabledSections || {}, (action) =>
    action?.actionRoute || action?.to || action?.route,
  )
  for (const { item, route } of actionLeaks) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.DISABLED_SECTION_ACTION_LEAK,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR,
      title: 'Next action points to disabled section',
      message: `Next action ${item?.id || item?.type || 'unknown'} routes to disabled section ${route}.`,
      field: 'nextActions.actionRoute',
      metadata: { actionId: item?.id || '', route },
    }))
  }

  for (const action of (Array.isArray(nextActions) ? nextActions : []).filter((item) => item?.metadata?.portalRouteUnavailable === true)) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.BLOCKING_ACTION_ROUTE_FALLBACK,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Required action has no direct portal route',
      message: `Required action ${action?.metadata?.originalActionId || action?.id || 'unknown'} was redirected from disabled section ${action?.metadata?.originalActionRoute || 'unknown'} to ${action?.actionRoute || 'overview'}.`,
      field: 'nextActions.actionRoute',
      metadata: {
        actionId: action?.metadata?.originalActionId || '',
        originalRoute: action?.metadata?.originalActionRoute || '',
        fallbackRoute: action?.actionRoute || 'overview',
        escalationOwnerRole: action?.metadata?.escalationOwnerRole || 'agent',
      },
    }))
  }

  const activityLeaks = getRouteLeaks(activityFeed, profile.enabledSections || {}, (event) =>
    event?.metadata?.actionRoute || event?.metadata?.action_route || event?.actionRoute || event?.action_route,
  )
  for (const { item, route } of activityLeaks) {
    diagnostics.push(createDiagnostic({
      code: CLIENT_PORTAL_DIAGNOSTIC_CODES.DISABLED_SECTION_ACTIVITY_LEAK,
      severity: CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING,
      title: 'Activity item points to disabled section',
      message: `Activity item ${item?.id || item?.type || 'unknown'} routes to disabled section ${route}.`,
      field: 'activityFeed.metadata.actionRoute',
      metadata: { activityId: item?.id || '', route },
    }))
  }

  return Object.freeze(diagnostics)
}

export function summarizeClientPortalProfileDiagnostics(diagnostics = []) {
  const items = Array.isArray(diagnostics) ? diagnostics : []
  return Object.freeze({
    total: items.length,
    errors: items.filter((item) => item?.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR).length,
    warnings: items.filter((item) => item?.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING).length,
    info: items.filter((item) => item?.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.INFO).length,
    hasErrors: items.some((item) => item?.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.ERROR),
    hasWarnings: items.some((item) => item?.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.WARNING),
  })
}
