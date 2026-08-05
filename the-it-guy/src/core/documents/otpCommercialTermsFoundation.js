import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'

export const OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION = 'otp_commercial_terms_phase1_v1'
export const OTP_COMMERCIAL_TERMS_RECORD_CONTRACT = 'otp_commercial_terms_record_phase1_v1'

export const OTP_COMMISSION_VARIATION_STATUSES = Object.freeze([
  'not_required',
  'pending_approval',
  'approved',
  'rejected',
])

export const OTP_COMMISSION_LOCK_STATES = Object.freeze([
  'ready_to_lock',
  'blocked_pending_approval',
  'blocked_rejected_variation',
])

export const OTP_COST_AMOUNT_STATUSES = Object.freeze([
  'known',
  'estimated',
  'pending',
  'not_applicable',
])

export const OTP_COST_OBLIGATION_CATEGORIES = Object.freeze([
  'transfer_costs',
  'bond_costs',
  'transfer_duty',
  'municipal_rates',
  'levies',
  'hoa',
  'utilities',
  'development_charges',
  'occupation_charges',
  'compliance',
  'other',
])

export const MATTER_ATTORNEY_COST_QUOTE_STATUSES = Object.freeze([
  'pending_upload',
  'uploaded',
  'buyer_viewed',
  'buyer_queried',
  'revised',
  'acknowledged',
  'superseded',
])

const MATTER_ATTORNEY_COST_QUOTE_TRANSITIONS = Object.freeze({
  pending_upload: Object.freeze(['uploaded']),
  uploaded: Object.freeze(['buyer_viewed', 'buyer_queried', 'revised', 'acknowledged', 'superseded']),
  buyer_viewed: Object.freeze(['buyer_queried', 'revised', 'acknowledged', 'superseded']),
  buyer_queried: Object.freeze(['revised', 'acknowledged', 'superseded']),
  revised: Object.freeze(['buyer_viewed', 'buyer_queried', 'acknowledged', 'superseded']),
  acknowledged: Object.freeze(['superseded']),
  superseded: Object.freeze([]),
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function normalizeMoneyRecord(source = {}) {
  if (!source || typeof source !== 'object') return Object.freeze({ basis: '', percentage: null, amount: null, vatIncluded: null, source: '' })
  return Object.freeze({
    basis: normalizeKey(source.basis || source.type || source.commissionType),
    percentage: normalizeNumber(firstValue(source.percentage, source.rate, source.commissionPercentage)),
    amount: normalizeNumber(firstValue(source.amount, source.commissionAmount, source.grossCommissionAmount)),
    vatIncluded: source.vatIncluded === undefined ? null : Boolean(source.vatIncluded),
    source: normalizeText(source.source || source.sourceKey),
  })
}

function moneyRecordsDiffer(left = {}, right = {}) {
  return (
    normalizeKey(left.basis) !== normalizeKey(right.basis) ||
    normalizeNumber(left.percentage) !== normalizeNumber(right.percentage) ||
    normalizeNumber(left.amount) !== normalizeNumber(right.amount) ||
    (left.vatIncluded === null ? null : Boolean(left.vatIncluded)) !== (right.vatIncluded === null ? null : Boolean(right.vatIncluded))
  )
}

export function buildOtpCommissionVariationRecord({
  transactionId = '',
  routeVariant = 'resale_existing_property',
  mandateCommission = {},
  proposedOtpCommission = {},
  approval = {},
  requestedBy = '',
  requestedAt = '',
  reason = '',
} = {}) {
  const documentVariant = normalizeOtpDocumentVariant(routeVariant)
  const mandateSnapshot = normalizeMoneyRecord({ ...mandateCommission, source: mandateCommission.source || 'mandate' })
  const proposedSnapshot = normalizeMoneyRecord({ ...proposedOtpCommission, source: proposedOtpCommission.source || 'otp_offer_terms' })
  const hasProposal = Boolean(proposedSnapshot.basis || proposedSnapshot.percentage !== null || proposedSnapshot.amount !== null)
  const variationRequired = hasProposal && moneyRecordsDiffer(mandateSnapshot, proposedSnapshot)
  const approvalStatus = variationRequired
    ? OTP_COMMISSION_VARIATION_STATUSES.includes(approval.status) ? approval.status : 'pending_approval'
    : 'not_required'
  const finalOtpCommission = approvalStatus === 'approved'
    ? proposedSnapshot
    : approvalStatus === 'not_required'
      ? (hasProposal ? proposedSnapshot : mandateSnapshot)
      : null
  const lockState = approvalStatus === 'pending_approval'
    ? 'blocked_pending_approval'
    : approvalStatus === 'rejected'
      ? 'blocked_rejected_variation'
      : 'ready_to_lock'

  const auditEvents = [
    Object.freeze({
      type: variationRequired ? 'otp_commission_variation_requested' : 'otp_commission_variation_not_required',
      actorId: normalizeText(requestedBy || approval.requestedBy),
      occurredAt: normalizeText(requestedAt || approval.requestedAt),
      reason: normalizeText(reason || approval.reason),
    }),
  ]
  if (approvalStatus === 'approved') {
    auditEvents.push(Object.freeze({
      type: 'otp_commission_variation_approved',
      actorId: normalizeText(approval.approverId || approval.approvedBy),
      occurredAt: normalizeText(approval.approvedAt),
      reason: normalizeText(approval.reason),
    }))
  }
  if (approvalStatus === 'rejected') {
    auditEvents.push(Object.freeze({
      type: 'otp_commission_variation_rejected',
      actorId: normalizeText(approval.rejectedBy || approval.approverId),
      occurredAt: normalizeText(approval.rejectedAt),
      reason: normalizeText(approval.rejectionReason || approval.reason),
    }))
  }

  return Object.freeze({
    contract: OTP_COMMERCIAL_TERMS_RECORD_CONTRACT,
    version: OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
    transactionId: normalizeText(transactionId),
    routeVariant: documentVariant,
    mandateCommissionSnapshot: mandateSnapshot,
    proposedOtpCommission: hasProposal ? proposedSnapshot : null,
    approval: Object.freeze({
      status: approvalStatus,
      approverId: normalizeText(approval.approverId || approval.approvedBy || approval.rejectedBy),
      approvalReference: normalizeText(approval.approvalReference || approval.reference),
      approvedAt: normalizeText(approval.approvedAt),
      rejectedAt: normalizeText(approval.rejectedAt),
      reason: normalizeText(reason || approval.reason || approval.rejectionReason),
    }),
    variationRequired,
    finalOtpCommission,
    lockState,
    blocksTransactionCommissionLock: lockState !== 'ready_to_lock',
    preservesMandateCommission: true,
    auditEvents: Object.freeze(auditEvents),
  })
}

export function buildTransactionCommissionLockDecision(record = {}) {
  const normalized = record.contract === OTP_COMMERCIAL_TERMS_RECORD_CONTRACT
    ? record
    : buildOtpCommissionVariationRecord(record)
  return Object.freeze({
    canLock: normalized.lockState === 'ready_to_lock',
    lockState: normalized.lockState,
    approvalStatus: normalized.approval.status,
    finalOtpCommission: normalized.finalOtpCommission,
    mandateCommissionSnapshot: normalized.mandateCommissionSnapshot,
    preservesMandateCommission: normalized.preservesMandateCommission === true,
    blockerCodes: normalized.lockState === 'ready_to_lock'
      ? Object.freeze([])
      : Object.freeze([normalized.lockState === 'blocked_pending_approval' ? 'otp_commission_variation_pending_approval' : 'otp_commission_variation_rejected']),
  })
}

function normalizeCostStatus(value = '', amount = null) {
  const status = normalizeKey(value)
  if (OTP_COST_AMOUNT_STATUSES.includes(status)) return status
  if (amount !== null) return 'known'
  return 'pending'
}

export function normalizeOtpCostObligationItem(item = {}) {
  const amount = normalizeNumber(item.amount)
  const amountStatus = normalizeCostStatus(item.amountStatus || item.status, amount)
  const category = OTP_COST_OBLIGATION_CATEGORIES.includes(normalizeKey(item.category)) ? normalizeKey(item.category) : 'other'
  const payerRole = normalizeKey(item.payerRole || item.payer || 'buyer') || 'buyer'
  const includeInOtp = item.includeInOtp === undefined ? payerRole === 'buyer' && amountStatus !== 'not_applicable' : Boolean(item.includeInOtp)

  return Object.freeze({
    key: normalizeKey(item.key || item.label || category),
    category,
    label: normalizeText(item.label || item.title || category.replace(/_/g, ' ')),
    amount,
    amountStatus,
    payerRole,
    payeeRole: normalizeKey(item.payeeRole || item.payee || ''),
    payeeName: normalizeText(item.payeeName),
    dueEvent: normalizeKey(item.dueEvent || item.due_event || 'on_demand'),
    source: normalizeKey(item.source || 'manual'),
    includeInOtp,
    routeVariants: Object.freeze(unique((item.routeVariants || item.variants || ['resale_existing_property', 'new_development']).map(normalizeOtpDocumentVariant))),
    documentKeys: Object.freeze(unique((item.documentKeys || item.documents || []).map(normalizeKey))),
    notes: normalizeText(item.notes),
  })
}

function pushCost(items, item) {
  const normalized = normalizeOtpCostObligationItem(item)
  if (!normalized.key) return
  items.push(normalized)
}

export function buildOtpBuyerCostObligationSchedule({
  transactionId = '',
  routeVariant = 'resale_existing_property',
  sellerFacts = {},
  developmentUnit = {},
  manualItems = [],
} = {}) {
  const documentVariant = normalizeOtpDocumentVariant(routeVariant)
  const property = sellerFacts.property || sellerFacts || {}
  const scheme = property.scheme || {}
  const estate = property.estate || {}
  const items = []

  pushCost(items, {
    key: 'buyer_transfer_cost_quote',
    category: 'transfer_costs',
    label: 'Buyer transfer-cost quote or invoice',
    amountStatus: 'pending',
    payerRole: 'buyer',
    payeeRole: 'transfer_attorney',
    dueEvent: 'on_conveyancer_demand',
    source: 'transfer_attorney_assignment',
    includeInOtp: true,
    documentKeys: ['buyer_transfer_cost_invoice'],
  })
  pushCost(items, {
    key: 'buyer_transfer_duty',
    category: 'transfer_duty',
    label: 'Transfer duty or VAT treatment',
    amountStatus: 'pending',
    payerRole: 'buyer',
    payeeRole: 'sars_or_seller',
    dueEvent: 'before_lodgement',
    source: 'transaction_offer_terms',
    includeInOtp: true,
  })

  if (documentVariant === 'resale_existing_property') {
    pushCost(items, {
      key: 'municipal_rates_estimate',
      category: 'municipal_rates',
      label: 'Municipal rates and taxes',
      amount: firstValue(property.rates_taxes, sellerFacts.ratesTaxes),
      amountStatus: property.rates_taxes || sellerFacts.ratesTaxes ? 'estimated' : 'pending',
      payerRole: 'seller_until_transfer_buyer_after_occupation_or_transfer',
      payeeRole: 'municipality',
      dueEvent: 'apportioned_on_occupation_or_transfer',
      source: 'seller_onboarding',
      includeInOtp: true,
      documentKeys: ['rates_account'],
    })
    pushCost(items, {
      key: 'scheme_levy_estimate',
      category: property.estate_or_hoa ? 'hoa' : 'levies',
      label: property.estate_or_hoa ? 'HOA levy estimate' : 'Body corporate levy estimate',
      amount: firstValue(scheme.levies, property.levies, sellerFacts.levies),
      amountStatus: property.levies_not_applicable ? 'not_applicable' : (scheme.levies || property.levies || sellerFacts.levies ? 'estimated' : 'pending'),
      payerRole: 'seller_until_transfer_buyer_after_occupation_or_transfer',
      payeeRole: property.estate_or_hoa ? 'hoa' : 'body_corporate',
      payeeName: property.estate_or_hoa ? estate.name : scheme.body_corporate_name,
      dueEvent: 'apportioned_on_occupation_or_transfer',
      source: 'seller_onboarding',
      includeInOtp: !property.levies_not_applicable,
      documentKeys: property.estate_or_hoa ? ['hoa_levy_statement'] : ['levy_statement'],
    })
  }

  if (documentVariant === 'new_development') {
    pushCost(items, {
      key: 'development_levy_estimate',
      category: 'levies',
      label: 'Development levy estimate',
      amount: firstValue(developmentUnit.levyEstimate, developmentUnit.levy_estimate),
      amountStatus: firstValue(developmentUnit.levyEstimate, developmentUnit.levy_estimate) ? 'estimated' : 'pending',
      payerRole: 'buyer',
      payeeRole: 'body_corporate',
      dueEvent: 'from_registration_or_project_schedule',
      source: 'development_unit_setup',
      includeInOtp: true,
    })
    pushCost(items, {
      key: 'utility_connection_charges',
      category: 'development_charges',
      label: 'Utility connection charges',
      amount: firstValue(developmentUnit.utilityConnectionCharges, developmentUnit.utility_connection_charges),
      amountStatus: firstValue(developmentUnit.utilityConnectionCharges, developmentUnit.utility_connection_charges) ? 'estimated' : 'pending',
      payerRole: 'buyer',
      payeeRole: 'developer_or_utility_provider',
      dueEvent: 'project_schedule_or_on_demand',
      source: 'development_unit_setup',
      includeInOtp: true,
    })
  }

  for (const item of manualItems) pushCost(items, item)

  const routeItems = items.filter((item) => item.routeVariants.includes(documentVariant))
  const buyerVisibleItems = routeItems.filter((item) => item.includeInOtp)
  const pendingItems = buyerVisibleItems.filter((item) => item.amountStatus === 'pending')

  return Object.freeze({
    contract: OTP_COMMERCIAL_TERMS_RECORD_CONTRACT,
    version: OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
    transactionId: normalizeText(transactionId),
    routeVariant: documentVariant,
    items: Object.freeze(routeItems),
    buyerVisibleItems: Object.freeze(buyerVisibleItems),
    pendingItems: Object.freeze(pendingItems),
    summary: Object.freeze({
      itemCount: routeItems.length,
      buyerVisibleCount: buyerVisibleItems.length,
      pendingCount: pendingItems.length,
      estimatedCount: buyerVisibleItems.filter((item) => item.amountStatus === 'estimated').length,
      knownCount: buyerVisibleItems.filter((item) => item.amountStatus === 'known').length,
      categories: Object.freeze(unique(buyerVisibleItems.map((item) => item.category)).sort()),
    }),
    renderingBoundary: 'otp_cost_schedule_known_estimated_pending_only',
    mutatedSourceFacts: false,
  })
}

export function canTransitionMatterAttorneyCostQuote(fromStatus = '', toStatus = '') {
  const from = normalizeKey(fromStatus || 'pending_upload')
  const to = normalizeKey(toStatus)
  return Boolean(MATTER_ATTORNEY_COST_QUOTE_TRANSITIONS[from]?.includes(to))
}

export function buildMatterAttorneyCostQuoteState({
  transactionId = '',
  transactionAttorneyAssignmentId = '',
  routeVariant = 'resale_existing_property',
  status = 'pending_upload',
  document = {},
  buyerQueries = [],
  revisions = [],
  leadQuoteId = '',
  updatedAt = '',
} = {}) {
  const normalizedStatus = MATTER_ATTORNEY_COST_QUOTE_STATUSES.includes(normalizeKey(status)) ? normalizeKey(status) : 'pending_upload'
  const transactionScoped = Boolean(normalizeText(transactionId) && normalizeText(transactionAttorneyAssignmentId))
  const queryCount = Array.isArray(buyerQueries) ? buyerQueries.length : 0
  const revisionCount = Array.isArray(revisions) ? revisions.length : 0
  const documentKey = normalizeKey(document.documentDefinitionKey || document.key || 'buyer_transfer_cost_invoice')

  return Object.freeze({
    contract: OTP_COMMERCIAL_TERMS_RECORD_CONTRACT,
    version: OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
    transactionId: normalizeText(transactionId),
    transactionAttorneyAssignmentId: normalizeText(transactionAttorneyAssignmentId),
    routeVariant: normalizeOtpDocumentVariant(routeVariant),
    status: normalizedStatus,
    document: Object.freeze({
      documentDefinitionKey: documentKey,
      fileUrl: normalizeText(document.fileUrl),
      uploadedBy: normalizeText(document.uploadedBy),
      uploadedAt: normalizeText(document.uploadedAt),
      amount: normalizeNumber(document.amount),
    }),
    buyerQueryCount: queryCount,
    revisionCount,
    transactionScoped,
    separatedFromAttorneyLeadQuote: true,
    attorneyLeadQuoteId: normalizeText(leadQuoteId),
    clientPortalVisible: ['uploaded', 'buyer_viewed', 'buyer_queried', 'revised', 'acknowledged'].includes(normalizedStatus),
    buyerCanQuery: ['uploaded', 'buyer_viewed', 'revised'].includes(normalizedStatus),
    canAcknowledge: ['uploaded', 'buyer_viewed', 'revised'].includes(normalizedStatus),
    updatedAt: normalizeText(updatedAt),
    blockers: Object.freeze(transactionScoped ? [] : ['matter_attorney_cost_quote_requires_transaction_and_assignment']),
  })
}

export function buildOtpCommercialTermsFoundationAudit({ checkedAt = new Date().toISOString() } = {}) {
  const resaleCosts = buildOtpBuyerCostObligationSchedule({
    routeVariant: 'resale_existing_property',
    sellerFacts: {
      property: {
        rates_taxes: 1650,
        levies: 2150,
        scheme: { body_corporate_name: 'Pine Avenue Body Corporate', levies: 2150 },
      },
    },
  })
  const developmentCosts = buildOtpBuyerCostObligationSchedule({
    routeVariant: 'new_development',
    developmentUnit: { levyEstimate: 2100, utilityConnectionCharges: 15000 },
  })
  const pendingVariation = buildOtpCommissionVariationRecord({
    mandateCommission: { basis: 'percentage', percentage: 5 },
    proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
    reason: 'OTP negotiation',
  })
  const approvedVariation = buildOtpCommissionVariationRecord({
    mandateCommission: { basis: 'percentage', percentage: 5 },
    proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
    approval: { status: 'approved', approverId: 'principal-user', approvedAt: checkedAt, approvalReference: 'APPROVED-OTP-COMM' },
  })
  const matterQuote = buildMatterAttorneyCostQuoteState({
    transactionId: 'tx-demo',
    transactionAttorneyAssignmentId: 'assignment-demo',
    status: 'uploaded',
    document: { documentDefinitionKey: 'buyer_transfer_cost_invoice', fileUrl: '/documents/transfer-costs.pdf' },
  })

  const checks = [
    {
      code: 'PHASE1_COMMISSION_VARIATION_DOES_NOT_OVERWRITE_MANDATE',
      pass: pendingVariation.preservesMandateCommission === true && pendingVariation.mandateCommissionSnapshot.percentage === 5,
      detail: 'Mandate commission remains a snapshot while OTP proposal is a separate approval record.',
    },
    {
      code: 'PHASE1_PENDING_COMMISSION_VARIATION_BLOCKS_LOCK',
      pass: buildTransactionCommissionLockDecision(pendingVariation).canLock === false,
      detail: 'Transaction commission lock is blocked until a negotiated OTP commission is approved or rejected.',
    },
    {
      code: 'PHASE1_APPROVED_COMMISSION_VARIATION_CAN_LOCK',
      pass: buildTransactionCommissionLockDecision(approvedVariation).canLock === true && approvedVariation.finalOtpCommission.percentage === 4.5,
      detail: 'Approved OTP commission can become the transaction commission basis without mutating the mandate.',
    },
    {
      code: 'PHASE1_RESALE_COST_OBLIGATIONS_NOT_DEVELOPMENT_ONLY',
      pass: resaleCosts.buyerVisibleItems.some((item) => item.key === 'scheme_levy_estimate') && resaleCosts.buyerVisibleItems.some((item) => item.key === 'municipal_rates_estimate'),
      detail: 'Seller onboarding rates, levies, HOA/body-corporate facts normalize into resale OTP buyer-cost records.',
    },
    {
      code: 'PHASE1_DEVELOPMENT_COST_OBLIGATIONS_STAY_ROUTE_SCOPED',
      pass: developmentCosts.buyerVisibleItems.some((item) => item.key === 'development_levy_estimate') && !developmentCosts.buyerVisibleItems.some((item) => item.key === 'scheme_levy_estimate'),
      detail: 'New-development cost records remain separate from resale seller-onboarding cost records.',
    },
    {
      code: 'PHASE1_MATTER_ATTORNEY_QUOTE_IS_TRANSACTION_SCOPED',
      pass: matterQuote.transactionScoped === true && matterQuote.separatedFromAttorneyLeadQuote === true,
      detail: 'Attorney cost quote state requires transaction_id and transaction_attorney_assignment_id, not attorney lead quote scope.',
    },
    {
      code: 'PHASE1_MATTER_ATTORNEY_QUOTE_STATUSES_MATCH_FLOW',
      pass: MATTER_ATTORNEY_COST_QUOTE_STATUSES.includes('buyer_queried') && canTransitionMatterAttorneyCostQuote('buyer_queried', 'revised'),
      detail: 'Matter quote statuses support upload, buyer view/query, revision, acknowledgement and superseding.',
    },
  ]
  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
    recordContract: OTP_COMMERCIAL_TERMS_RECORD_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_COMMERCIAL_TERMS_FOUNDATION_REMEDIATION_REQUIRED' : 'OTP_COMMERCIAL_TERMS_FOUNDATION_READY',
    mutatedData: false,
    summary: Object.freeze({
      routeCount: OTP_DOCUMENT_VARIANTS.length,
      resaleCostItemCount: resaleCosts.summary.itemCount,
      developmentCostItemCount: developmentCosts.summary.itemCount,
      commissionVariationStatuses: OTP_COMMISSION_VARIATION_STATUSES.length,
      matterAttorneyQuoteStatuses: MATTER_ATTORNEY_COST_QUOTE_STATUSES.length,
      blockerCount: blockers.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    evidence: Object.freeze({
      resaleCosts: cloneJson(resaleCosts),
      developmentCosts: cloneJson(developmentCosts),
      pendingVariation: cloneJson(pendingVariation),
      approvedVariation: cloneJson(approvedVariation),
      matterQuote: cloneJson(matterQuote),
    }),
  })
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpCommercialTermsFoundationMarkdown(report = buildOtpCommercialTermsFoundationAudit()) {
  return [
    '# OTP Commercial Terms Phase 1 Foundation',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Record contract: ${report.recordContract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Resale cost items', report.summary.resaleCostItemCount],
        ['New-development cost items', report.summary.developmentCostItemCount],
        ['Commission variation statuses', report.summary.commissionVariationStatuses],
        ['Matter attorney quote statuses', report.summary.matterAttorneyQuoteStatuses],
        ['Blockers', report.summary.blockerCount],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 1 creates the canonical commercial-term contract for OTP commission variation, buyer/scheme cost obligations and matter-level attorney cost quote state. It does not send attorney quotes, mutate mandate commission, publish client portal documents, or change production route defaults.',
    '',
  ].join('\n')
}
