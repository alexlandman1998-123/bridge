import {
  TRANSACTION_SALE_ROUTES,
  normalizeTransactionSaleRoute,
  resolveTransactionSaleProfile,
} from './transactionSaleProfile.js'

export const TRANSACTION_SALE_ROUTE_AUDIT_VERSION = 'transaction_sale_route_phase7_audit_v1'

export const TRANSACTION_SALE_ROUTE_AUDIT_CODES = Object.freeze({
  SALE_ROUTE_MISSING: 'sale_route_missing',
  ROUTE_AGENCY_SIGNAL_CONFLICT: 'route_agency_signal_conflict',
  ROUTE_ASSIGNMENT_SIGNAL_CONFLICT: 'route_assignment_signal_conflict',
  AGENCY_ATTRIBUTION_MISSING: 'agency_attribution_missing',
  AGENCY_DOCUMENTS_MISSING: 'agency_documents_missing',
  AGENCY_DOCUMENTS_ON_NON_EXTERNAL_SALE: 'agency_documents_on_non_external_sale',
  SELLER_DOCUMENTS_ON_DEVELOPER_SALE: 'seller_documents_on_developer_sale',
  DEVELOPER_DOCUMENTS_ON_PRIVATE_SALE: 'developer_documents_on_private_sale',
  AGENCY_HANDOVER_ACTION_MISSING: 'agency_handover_action_missing',
  AGENCY_HANDOVER_ACTION_ON_NON_EXTERNAL_SALE: 'agency_handover_action_on_non_external_sale',
  DEVELOPER_DOCUMENT_ACTION_ON_PRIVATE_SALE: 'developer_document_action_on_private_sale',
})

const AUDIT_SEVERITY = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
})

const DEVELOPER_ROUTES = Object.freeze([
  'internal_developer_sale',
  'developer_assigned_sale',
  'external_agency_sale',
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

function compactUnique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function getTransactionId(transaction = {}, fallback = '') {
  return normalizeText(
    firstValue(
      transaction.id,
      transaction.transactionId,
      transaction.transaction_id,
      transaction.uuid,
      fallback,
    ),
  )
}

function getRowTransactionId(row = {}) {
  return normalizeText(firstValue(row.transactionId, row.transaction_id, row.matterId, row.matter_id))
}

function getRowsForTransaction(source, transaction, transactionId, attachedKeys = []) {
  for (const key of attachedKeys) {
    if (Array.isArray(transaction?.[key])) {
      return { loaded: true, rows: transaction[key] }
    }
  }

  if (source instanceof Map && source.has(transactionId)) {
    return { loaded: true, rows: asArray(source.get(transactionId)) }
  }

  if (
    source &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    Object.prototype.hasOwnProperty.call(source, transactionId)
  ) {
    return { loaded: true, rows: asArray(source[transactionId]) }
  }

  if (Array.isArray(source)) {
    const rows = source.filter((row) => getRowTransactionId(row) === transactionId)
    return { loaded: rows.length > 0, rows }
  }

  return { loaded: false, rows: [] }
}

function hasAgencyAttribution(transaction = {}) {
  return Boolean(firstValue(
    transaction.sourceAgencyOrgId,
    transaction.source_agency_org_id,
    transaction.sourceAgencyOrganisationId,
    transaction.source_agency_organisation_id,
    transaction.agencyOrganisationId,
    transaction.agency_organisation_id,
    transaction.sourceAgencyName,
    transaction.source_agency_name,
    transaction.introducingAgencyName,
    transaction.introducing_agency_name,
  ))
}

function hasAgencySignal(transaction = {}) {
  return (
    hasAgencyAttribution(transaction) ||
    normalizeKey(firstValue(transaction.leadOwner, transaction.lead_owner)) === 'agency' ||
    normalizeKey(firstValue(transaction.ownershipModel, transaction.ownership_model)) === 'agency_introduced' ||
    normalizeKey(firstValue(transaction.saleChannel, transaction.sale_channel)) === 'agency_introduced'
  )
}

function hasDeveloperAssignedSignal(transaction = {}) {
  return (
    normalizeKey(firstValue(transaction.ownershipModel, transaction.ownership_model)) === 'developer_assigned' ||
    normalizeKey(firstValue(transaction.saleChannel, transaction.sale_channel)) === 'developer_assigned' ||
    Boolean(firstValue(
      transaction.assignedAgentId,
      transaction.assigned_agent_id,
      transaction.assignedAgent,
      transaction.assigned_agent,
      transaction.assignedAgentEmail,
      transaction.assigned_agent_email,
      transaction.sourceAgentUserId,
      transaction.source_agent_user_id,
    ))
  )
}

function readPersistedSaleRoute(transaction = {}) {
  return normalizeTransactionSaleRoute(firstValue(transaction.saleRoute, transaction.sale_route), '')
}

function getDocumentTokens(document = {}) {
  return [
    document.key,
    document.documentKey,
    document.document_key,
    document.requirementKey,
    document.requirement_key,
    document.category,
    document.group,
    document.groupKey,
    document.group_key,
    document.visibleSection,
    document.visible_section,
    document.requiredFromRole,
    document.required_from_role,
    document.expectedFromRole,
    document.expected_from_role,
    document.assignedRole,
    document.assigned_role,
    document.assignedToRole,
    document.assigned_to_role,
    document.requestedFrom,
    document.requested_from,
    document.partyRole,
    document.party_role,
  ].map(normalizeKey)
}

function isAgencyDocument(document = {}) {
  const tokens = getDocumentTokens(document)
  return tokens.some((token) => (
    token === 'agency' ||
    token === 'introducing_agent' ||
    token === 'agency_documents' ||
    token.includes('agency') ||
    token.includes('introducing_agent')
  ))
}

function isSellerDocument(document = {}) {
  const tokens = getDocumentTokens(document)
  return tokens.some((token) => (
    token === 'seller' ||
    token === 'seller_documents' ||
    token.startsWith('seller_')
  ))
}

function isDeveloperDocument(document = {}) {
  const tokens = getDocumentTokens(document)
  return tokens.some((token) => (
    token === 'developer' ||
    token === 'developer_documents' ||
    token === 'development_documents' ||
    token.startsWith('developer_') ||
    token.startsWith('development_')
  ))
}

function getActionKey(action = {}) {
  return normalizeKey(firstValue(action.actionKey, action.action_key, action.key, action.id, action.type))
}

function hasAction(actions = [], expectedKey = '') {
  const normalizedExpected = normalizeKey(expectedKey)
  return actions.some((action) => getActionKey(action) === normalizedExpected)
}

function makeIssue({
  transactionId,
  code,
  severity = AUDIT_SEVERITY.WARNING,
  message,
  persistedRoute = '',
  resolvedRoute = '',
  details = {},
}) {
  return Object.freeze({
    transactionId,
    code,
    severity,
    message,
    persistedRoute,
    resolvedRoute,
    details: Object.freeze(details),
  })
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1
}

function auditTransaction({
  transaction,
  transactionId,
  documentsLoaded,
  documents,
  actionsLoaded,
  actions,
}) {
  const saleProfile = resolveTransactionSaleProfile({ transaction })
  const persistedRoute = readPersistedSaleRoute(transaction)
  const resolvedRoute = saleProfile.saleRoute
  const issues = []
  const agencySignal = hasAgencySignal(transaction)
  const developerAssignedSignal = hasDeveloperAssignedSignal(transaction)
  const agencyDocuments = documents.filter(isAgencyDocument)
  const sellerDocuments = documents.filter(isSellerDocument)
  const developerDocuments = documents.filter(isDeveloperDocument)
  const isDeveloperRoute = DEVELOPER_ROUTES.includes(resolvedRoute)

  if (!persistedRoute) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.SALE_ROUTE_MISSING,
      severity: AUDIT_SEVERITY.INFO,
      message: 'Transaction can be resolved, but does not yet persist sale_route.',
      resolvedRoute,
    }))
  }

  if (persistedRoute && persistedRoute !== 'external_agency_sale' && agencySignal) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.ROUTE_AGENCY_SIGNAL_CONFLICT,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'Transaction has agency-introduced fields but is not persisted as an external agency sale.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  if (persistedRoute === 'internal_developer_sale' && developerAssignedSignal) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.ROUTE_ASSIGNMENT_SIGNAL_CONFLICT,
      severity: AUDIT_SEVERITY.WARNING,
      message: 'Transaction is persisted as internal developer sale but has assigned-agent signals.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  if (resolvedRoute === 'external_agency_sale' && !hasAgencyAttribution(transaction)) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_ATTRIBUTION_MISSING,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'External agency sale is missing source agency attribution.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  if (documentsLoaded && resolvedRoute === 'external_agency_sale' && agencyDocuments.length === 0) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_DOCUMENTS_MISSING,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'External agency sale has no agency handover document requirements loaded.',
      persistedRoute,
      resolvedRoute,
      details: { documentCount: documents.length },
    }))
  }

  if (documentsLoaded && resolvedRoute !== 'external_agency_sale' && agencyDocuments.length > 0) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_DOCUMENTS_ON_NON_EXTERNAL_SALE,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'Agency document requirements are present on a non-external-agency sale.',
      persistedRoute,
      resolvedRoute,
      details: { agencyDocumentCount: agencyDocuments.length },
    }))
  }

  if (documentsLoaded && isDeveloperRoute && sellerDocuments.length > 0) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.SELLER_DOCUMENTS_ON_DEVELOPER_SALE,
      severity: AUDIT_SEVERITY.WARNING,
      message: 'Developer sale still has seller-labelled document requirements.',
      persistedRoute,
      resolvedRoute,
      details: { sellerDocumentCount: sellerDocuments.length },
    }))
  }

  if (documentsLoaded && resolvedRoute === 'private_property_sale' && developerDocuments.length > 0) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.DEVELOPER_DOCUMENTS_ON_PRIVATE_SALE,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'Private property sale has developer document requirements loaded.',
      persistedRoute,
      resolvedRoute,
      details: { developerDocumentCount: developerDocuments.length },
    }))
  }

  if (actionsLoaded && resolvedRoute === 'external_agency_sale' && !hasAction(actions, 'REQUEST_AGENCY_HANDOVER')) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_HANDOVER_ACTION_MISSING,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'External agency sale is missing the agency handover next action.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  if (actionsLoaded && resolvedRoute !== 'external_agency_sale' && hasAction(actions, 'REQUEST_AGENCY_HANDOVER')) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.AGENCY_HANDOVER_ACTION_ON_NON_EXTERNAL_SALE,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'Agency handover action is available on a non-external-agency sale.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  if (actionsLoaded && resolvedRoute === 'private_property_sale' && hasAction(actions, 'REQUEST_DEVELOPER_DOCUMENTS')) {
    issues.push(makeIssue({
      transactionId,
      code: TRANSACTION_SALE_ROUTE_AUDIT_CODES.DEVELOPER_DOCUMENT_ACTION_ON_PRIVATE_SALE,
      severity: AUDIT_SEVERITY.ERROR,
      message: 'Developer document action is available on a private property sale.',
      persistedRoute,
      resolvedRoute,
    }))
  }

  return Object.freeze({
    transactionId,
    persistedRoute,
    resolvedRoute,
    saleChannel: saleProfile.saleChannel,
    transactionType: saleProfile.transactionType,
    status: issues.some((issue) => issue.severity === AUDIT_SEVERITY.ERROR)
      ? 'blocked'
      : issues.length
        ? 'attention'
        : 'clear',
    issues: Object.freeze(issues),
  })
}

export function buildTransactionSaleRouteAudit({
  transactions = [],
  requiredDocumentsByTransactionId = {},
  availableActionsByTransactionId = {},
} = {}) {
  const routeCounts = Object.fromEntries(TRANSACTION_SALE_ROUTES.map((route) => [route, 0]))
  const issueCounts = {}
  const items = asArray(transactions).map((transaction, index) => {
    const transactionId = getTransactionId(transaction, `transaction_${index + 1}`)
    const documentRows = getRowsForTransaction(
      requiredDocumentsByTransactionId,
      transaction,
      transactionId,
      ['requiredDocuments', 'required_documents', 'requiredDocumentChecklist', 'documentRequirements'],
    )
    const actionRows = getRowsForTransaction(
      availableActionsByTransactionId,
      transaction,
      transactionId,
      ['availableActions', 'available_actions', 'nextActions'],
    )
    const item = auditTransaction({
      transaction,
      transactionId,
      documentsLoaded: documentRows.loaded,
      documents: documentRows.rows,
      actionsLoaded: actionRows.loaded,
      actions: actionRows.rows,
    })

    incrementCount(routeCounts, item.resolvedRoute)
    item.issues.forEach((issue) => incrementCount(issueCounts, issue.code))
    return item
  })
  const issues = items.flatMap((item) => item.issues)
  const blockingIssues = issues.filter((issue) => issue.severity === AUDIT_SEVERITY.ERROR)
  const warningIssues = issues.filter((issue) => issue.severity === AUDIT_SEVERITY.WARNING)
  const informationalIssues = issues.filter((issue) => issue.severity === AUDIT_SEVERITY.INFO)

  return Object.freeze({
    version: TRANSACTION_SALE_ROUTE_AUDIT_VERSION,
    total: items.length,
    healthy: blockingIssues.length === 0,
    routeCounts: Object.freeze(routeCounts),
    issueCounts: Object.freeze(issueCounts),
    issueSummary: Object.freeze({
      blocking: blockingIssues.length,
      warning: warningIssues.length,
      info: informationalIssues.length,
    }),
    transactions: Object.freeze(items),
    issues: Object.freeze(issues),
    issueCodes: Object.freeze(compactUnique(issues.map((issue) => issue.code))),
  })
}
