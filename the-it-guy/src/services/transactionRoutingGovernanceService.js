import {
  TRANSACTION_ROUTING_PROFILE_VERSION,
  resolveTransactionRoutingProfile,
} from './transactionRoutingProfileService.js'

const PROFILE_COMPARISON_FIELDS = [
  'version',
  'financeType',
  'transactionType',
  'propertyTenure',
  'buyerEntityType',
  'sellerEntityType',
  'sellerHasExistingBond',
  'cancellationRequired',
  'vatTreatment',
  'workflowTemplateKey',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function compactUnique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function sortedArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))].sort()
}

function comparableProfile(profile = {}) {
  const comparable = {}
  for (const field of PROFILE_COMPARISON_FIELDS) {
    comparable[field] = profile[field] ?? null
  }
  comparable.requiredWorkflowKeys = sortedArray(profile.requiredWorkflowKeys)
  comparable.requiredDocumentGroups = sortedArray(profile.requiredDocumentGroups)
  comparable.missingFields = sortedArray(profile.missingFields)
  return comparable
}

function profileMatches(left = {}, right = {}) {
  return JSON.stringify(comparableProfile(left)) === JSON.stringify(comparableProfile(right))
}

function readPersistedProfile(transaction = {}) {
  return parseJsonObject(
    transaction.routingProfile ||
      transaction.routing_profile ||
      transaction.routing_profile_json ||
      transaction.routingProfileJson,
  )
}

function buildUpdatePayload(profile = {}) {
  const financeType = profile.financeType === 'hybrid' ? 'hybrid' : profile.financeType
  return {
    finance_type: financeType && financeType !== 'unknown' ? financeType : null,
    transaction_type: profile.transactionType && profile.transactionType !== 'unknown' ? profile.transactionType : null,
    property_tenure: profile.propertyTenure && profile.propertyTenure !== 'unknown' ? profile.propertyTenure : null,
    purchaser_type: profile.buyerEntityType && profile.buyerEntityType !== 'unknown' ? profile.buyerEntityType : null,
    seller_type: profile.sellerEntityType && profile.sellerEntityType !== 'unknown' ? profile.sellerEntityType : null,
    seller_has_existing_bond: Boolean(profile.sellerHasExistingBond),
    existing_bond: Boolean(profile.sellerHasExistingBond),
    cancellation_required: Boolean(profile.cancellationRequired),
    vat_treatment: profile.vatTreatment && profile.vatTreatment !== 'unknown' ? profile.vatTreatment : null,
    routing_profile_version: profile.version || TRANSACTION_ROUTING_PROFILE_VERSION,
    routing_profile_json: profile,
  }
}

export function buildTransactionRoutingAuditItem(transaction = {}) {
  const transactionId = transaction.id || transaction.transaction_id || null
  const persistedProfile = readPersistedProfile(transaction)
  const hasPersistedProfile = Boolean(Object.keys(persistedProfile).length)
  const resolvedProfile = resolveTransactionRoutingProfile({ transaction })
  const reasonCodes = []

  if (!hasPersistedProfile) reasonCodes.push('missing_profile')
  if (hasPersistedProfile && persistedProfile.version !== TRANSACTION_ROUTING_PROFILE_VERSION) {
    reasonCodes.push('version_mismatch')
  }
  if (hasPersistedProfile && !profileMatches(persistedProfile, resolvedProfile)) {
    reasonCodes.push('profile_drift')
  }
  if (Array.isArray(resolvedProfile.missingFields) && resolvedProfile.missingFields.length) {
    reasonCodes.push('missing_facts')
  }

  const canBackfill = reasonCodes.some((code) => ['missing_profile', 'version_mismatch', 'profile_drift'].includes(code))
  const blocked = reasonCodes.includes('missing_facts')
  const status = blocked
    ? 'needs_facts'
    : canBackfill
      ? 'needs_backfill'
      : 'ready'

  return {
    transactionId,
    status,
    reasonCodes: compactUnique(reasonCodes),
    canBackfill: canBackfill && !blocked,
    missingFields: resolvedProfile.missingFields || [],
    warnings: resolvedProfile.warnings || [],
    currentProfile: hasPersistedProfile ? persistedProfile : null,
    resolvedProfile,
    updatePayload: buildUpdatePayload(resolvedProfile),
  }
}

export function buildTransactionRoutingAudit(transactions = []) {
  const items = (Array.isArray(transactions) ? transactions : []).map(buildTransactionRoutingAuditItem)
  const summary = items.reduce((accumulator, item) => {
    accumulator.total += 1
    accumulator[item.status] = (accumulator[item.status] || 0) + 1
    for (const reasonCode of item.reasonCodes) {
      accumulator.reasonCounts[reasonCode] = (accumulator.reasonCounts[reasonCode] || 0) + 1
    }
    if (item.currentProfile) accumulator.withPersistedProfile += 1
    if (item.canBackfill) accumulator.backfillable += 1
    return accumulator
  }, {
    total: 0,
    ready: 0,
    needs_backfill: 0,
    needs_facts: 0,
    withPersistedProfile: 0,
    backfillable: 0,
    reasonCounts: {},
  })

  return {
    summary,
    items,
  }
}

export function buildTransactionRoutingBackfillPlan(transactions = [], options = {}) {
  const audit = buildTransactionRoutingAudit(transactions)
  const includeNeedsFacts = options.includeNeedsFacts === true
  const operations = audit.items
    .filter((item) => item.canBackfill || (includeNeedsFacts && item.status === 'needs_facts'))
    .map((item) => ({
      transactionId: item.transactionId,
      reasonCodes: item.reasonCodes,
      missingFields: item.missingFields,
      updatePayload: item.updatePayload,
    }))

  return {
    dryRun: options.dryRun !== false,
    generatedAt: new Date().toISOString(),
    summary: {
      ...audit.summary,
      plannedUpdates: operations.length,
      destructiveOperations: 0,
    },
    operations,
    auditItems: audit.items,
  }
}

export function summarizeTransactionRoutingAudit(audit = {}) {
  const summary = audit.summary || {}
  return [
    `${summary.total || 0} transactions checked`,
    `${summary.ready || 0} ready`,
    `${summary.needs_backfill || 0} need profile backfill`,
    `${summary.needs_facts || 0} need facts`,
  ].join(' • ')
}
