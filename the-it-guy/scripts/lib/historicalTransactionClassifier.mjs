export const HISTORICAL_TRANSACTION_CLASSIFIER_VERSION = 'historical_transaction_classifier_v1'

const ATTORNEY_ROLE_TYPES = new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const BOND_FINANCE_TYPES = new Set(['bond', 'hybrid', 'bond_and_cash', 'cash_and_bond'])
const TERMINAL_ASSIGNMENT_STATUSES = new Set(['removed', 'declined', 'rejected', 'inactive', 'suspended'])
const NON_PRODUCTION_EMAIL_DOMAINS = new Set([
  'demo.bridgefinance.co.za',
  'example.com',
  'example.net',
  'example.org',
  'example.test',
  'invalid',
  'localhost',
])
const FIXTURE_TEXT_PATTERN = /(?:^|[^a-z0-9])(demo|fixture|seed|test transaction|acceptance)(?:[^a-z0-9]|$)|full[-_ ]?e2e|bond[-_ ]?runtime/i
const FIXTURE_SOURCE_PATTERN = /demo|fixture|seed|acceptance|test[_ -]?data|synthetic/i

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function hasJsonContent(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return text(value) !== '' && text(value) !== '{}'
}

function emailDomain(value) {
  const normalized = lower(value)
  const separator = normalized.lastIndexOf('@')
  return separator >= 0 ? normalized.slice(separator + 1) : ''
}

function isNonProductionEmail(value) {
  const domain = emailDomain(value)
  return Boolean(domain && (NON_PRODUCTION_EMAIL_DOMAINS.has(domain) || domain.endsWith('.test')))
}

function isActiveAssignment(row = {}) {
  return !TERMINAL_ASSIGNMENT_STATUSES.has(lower(row.assignment_status || row.status)) && !row.removed_at
}

function evidence(code, source, detail = null, strength = 'strong') {
  return { code, source, strength, ...(detail ? { detail } : {}) }
}

function addExplicitDemoEvidence(items, source, row) {
  if (!row) return
  if (row.is_demo_data === true) items.push(evidence(`${source}_explicit_demo`, source, null, 'definitive'))
  if (hasJsonContent(row.demo_metadata)) items.push(evidence(`${source}_demo_metadata`, source, null, 'definitive'))
}

function collectNonProductionEmailEvidence(items, source, value) {
  if (!isNonProductionEmail(value)) return
  items.push(evidence(`${source}_nonproduction_email`, source, emailDomain(value), 'strong'))
}

function collectFixtureTextEvidence(items, source, value) {
  const normalized = text(value)
  if (!normalized || !FIXTURE_TEXT_PATTERN.test(normalized)) return
  items.push(evidence(`${source}_fixture_marker`, source, null, 'strong'))
}

export function findHistoricalHandoverIssues({
  transaction = {},
  rolePlayers = [],
  attorneyAssignments = [],
  bondApplications = [],
} = {}) {
  const activeRolePlayers = rolePlayers.filter(isActiveAssignment)
  const attorneyRolePlayers = activeRolePlayers.filter((row) => ATTORNEY_ROLE_TYPES.has(lower(row.role_type)))
  const bondRolePlayers = activeRolePlayers.filter((row) => lower(row.role_type) === 'bond_originator')
  const hasAttorneyAssignment = attorneyAssignments.some(isActiveAssignment)
  const hasBondApplication = bondApplications.some(isActiveAssignment)
  const bondFinance = BOND_FINANCE_TYPES.has(lower(transaction.finance_type))
  const issues = []

  if (attorneyRolePlayers.length && !hasAttorneyAssignment) {
    issues.push({
      code: 'missing_canonical_attorney_assignment',
      rolePlayerCount: attorneyRolePlayers.length,
      roleTypes: [...new Set(attorneyRolePlayers.map((row) => lower(row.role_type)).filter(Boolean))].sort(),
    })
  }
  if (bondFinance && bondRolePlayers.length && !hasBondApplication) {
    issues.push({
      code: 'missing_canonical_bond_application',
      rolePlayerCount: bondRolePlayers.length,
      roleTypes: ['bond_originator'],
    })
  }

  return issues
}

export function classifyHistoricalTransaction({
  transaction = {},
  buyer = null,
  organisation = null,
  listing = null,
  development = null,
  unit = null,
  rolePlayers = [],
  attorneyAssignments = [],
  bondApplications = [],
} = {}) {
  const seedEvidence = []
  const realEvidence = []

  addExplicitDemoEvidence(seedEvidence, 'transaction', transaction)
  addExplicitDemoEvidence(seedEvidence, 'buyer', buyer)
  addExplicitDemoEvidence(seedEvidence, 'organisation', organisation)
  addExplicitDemoEvidence(seedEvidence, 'listing', listing)
  for (const rolePlayer of rolePlayers) addExplicitDemoEvidence(seedEvidence, 'roleplayer', rolePlayer)

  for (const [source, value] of [
    ['buyer', buyer?.email],
    ['transaction_assigned_agent', transaction.assigned_agent_email],
    ['transaction_assigned_attorney', transaction.assigned_attorney_email],
    ['transaction_assigned_bond_originator', transaction.assigned_bond_originator_email],
    ['transaction_seller', transaction.seller_email],
    ['organisation', organisation?.company_email || organisation?.email],
  ]) {
    collectNonProductionEmailEvidence(seedEvidence, source, value)
  }
  for (const rolePlayer of rolePlayers) {
    collectNonProductionEmailEvidence(seedEvidence, `roleplayer_${lower(rolePlayer.role_type) || 'unknown'}`, rolePlayer.email_address)
    if (FIXTURE_SOURCE_PATTERN.test(text(rolePlayer.selection_source))) {
      seedEvidence.push(evidence('roleplayer_fixture_source', 'roleplayer', lower(rolePlayer.selection_source), 'strong'))
    }
  }

  for (const [source, value] of [
    ['transaction_reference', transaction.transaction_reference],
    ['platform_reference', transaction.platform_reference],
    ['matter_number', transaction.matter_number],
    ['transaction_next_action', transaction.next_action],
    ['transaction_comment', transaction.comment],
    ['transaction_notes', transaction.notes],
    ['transaction_client_name', transaction.client_name],
    ['transaction_buyer_name', transaction.buyer_name || transaction.purchaser_name],
    ['transaction_development_name', transaction.development_name],
    ['transaction_unit_number', transaction.unit_number],
    ['transaction_listing_title', transaction.listing_title],
    ['transaction_property_title', transaction.property_title],
    ['buyer_name', buyer?.name],
    ['organisation_name', organisation?.name || organisation?.display_name],
    ['listing_reference', listing?.listing_reference],
    ['listing_title', listing?.title],
    ['development_name', development?.name],
    ['development_code', development?.code],
    ['unit_number', unit?.unit_number],
    ['unit_label', unit?.unit_label],
    ['unit_notes', unit?.notes],
  ]) {
    collectFixtureTextEvidence(seedEvidence, source, value)
  }
  for (const [source, value] of [
    ['transaction_origin_source', transaction.transaction_origin_source],
    ['listing_source', listing?.listing_source],
  ]) {
    if (FIXTURE_SOURCE_PATTERN.test(text(value))) {
      seedEvidence.push(evidence(`${source}_fixture_source`, source, lower(value), 'strong'))
    }
  }

  const organisationStatus = lower(organisation?.status)
  if (organisation?.id && organisation?.is_demo_data !== true && !['inactive', 'disabled', 'deleted'].includes(organisationStatus)) {
    realEvidence.push(evidence('linked_live_organisation', 'organisation', null, 'strong'))
  }
  if (transaction.created_by) realEvidence.push(evidence('authenticated_creator_present', 'transaction', null, 'strong'))
  if (buyer?.email && !isNonProductionEmail(buyer.email)) {
    realEvidence.push(evidence('buyer_production_email_domain', 'buyer', emailDomain(buyer.email), 'strong'))
  }
  if (transaction.development_id && development?.id && transaction.unit_id && unit?.id) {
    realEvidence.push(evidence('linked_development_inventory', 'transaction', null, 'supporting'))
  }
  if (transaction.listing_id && listing?.id && listing?.is_demo_data !== true) {
    realEvidence.push(evidence('linked_private_listing', 'transaction', null, 'supporting'))
  }
  if (['agent', 'developer', 'developer_portal', 'agent_wizard'].includes(lower(transaction.transaction_origin_source))) {
    realEvidence.push(evidence('live_creation_origin', 'transaction', lower(transaction.transaction_origin_source), 'supporting'))
  }

  const issues = findHistoricalHandoverIssues({
    transaction,
    rolePlayers,
    attorneyAssignments,
    bondApplications,
  })
  const definitiveSeed = seedEvidence.some((item) => item.strength === 'definitive')
  const strongSeedCount = seedEvidence.filter((item) => item.strength === 'strong').length
  const strongRealCount = realEvidence.filter((item) => item.strength === 'strong').length

  let classification = 'ambiguous'
  let confidence = 'low'
  let proposedAction = 'manual_review_no_change'
  if (definitiveSeed || strongSeedCount > 0) {
    classification = 'seed'
    confidence = definitiveSeed || strongSeedCount >= 2 ? 'high' : 'medium'
    proposedAction = 'quarantine_then_review_delete'
  } else if (strongRealCount >= 2) {
    classification = 'real'
    confidence = strongRealCount >= 3 ? 'high' : 'medium'
    proposedAction = issues.length ? 'backfill_canonical_handover' : 'no_repair_required'
  }

  return {
    classifierVersion: HISTORICAL_TRANSACTION_CLASSIFIER_VERSION,
    transactionId: text(transaction.id) || null,
    classification,
    confidence,
    proposedAction,
    issues,
    evidence: {
      seed: seedEvidence,
      real: realEvidence,
    },
    scope: {
      active: transaction.is_active !== false,
      transactionType: text(transaction.transaction_type) || null,
      financeType: text(transaction.finance_type) || null,
      organisationId: text(transaction.organisation_id) || null,
      developmentId: text(transaction.development_id) || null,
      unitId: text(transaction.unit_id) || null,
      buyerId: text(transaction.buyer_id) || null,
      listingId: text(transaction.listing_id) || null,
      createdAt: text(transaction.created_at) || null,
    },
  }
}

export function summarizeHistoricalClassifications(rows = []) {
  const summary = {
    total: rows.length,
    classification: { real: 0, seed: 0, ambiguous: 0 },
    confidence: { high: 0, medium: 0, low: 0 },
    proposedAction: {},
    issueCounts: {},
  }
  for (const row of rows) {
    summary.classification[row.classification] = (summary.classification[row.classification] || 0) + 1
    summary.confidence[row.confidence] = (summary.confidence[row.confidence] || 0) + 1
    summary.proposedAction[row.proposedAction] = (summary.proposedAction[row.proposedAction] || 0) + 1
    for (const issue of row.issues || []) {
      summary.issueCounts[issue.code] = (summary.issueCounts[issue.code] || 0) + 1
    }
  }
  return summary
}

export const __historicalTransactionClassifierTestUtils = Object.freeze({
  emailDomain,
  isActiveAssignment,
  isNonProductionEmail,
})
