import {
  OTP_COST_AMOUNT_STATUSES,
  buildOtpBuyerCostObligationSchedule,
  buildOtpCommissionVariationRecord,
  buildMatterAttorneyCostQuoteState,
  buildTransactionCommissionLockDecision,
  normalizeOtpCostObligationItem,
} from './otpCommercialTermsFoundation.js'
import {
  OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS,
  buildOtpCommercialTermsPersistencePhase24Audit,
} from './otpCommercialTermsPersistencePhase24.js'
import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'

export const OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION = 'otp_commercial_terms_review_phase25_v1'
export const OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS = 'OTP_COMMERCIAL_TERMS_REVIEW_READY_FOR_PHASE26_RUNTIME_WIRING'
export const OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT = 'otp-vnext-commercial-terms-review-phase25-v1'

export const OTP_COMMERCIAL_TERMS_REVIEW_STATUSES = Object.freeze([
  'OTP_REVIEW_READY_FOR_GENERATION',
  'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL',
  'OTP_REVIEW_BLOCKED_REJECTED_COMMERCIAL_APPROVAL',
  'OTP_REVIEW_BLOCKED_INVALID_ROUTE',
  'OTP_REVIEW_BLOCKED_MATTER_QUOTE_SCOPE',
])

export const OTP_COMMERCIAL_TERMS_REVIEW_ROUTES = Object.freeze([
  Object.freeze({
    key: 'resale_existing_property',
    label: 'Resale OTP Review',
    screenKey: 'otp_review_resale_existing_property',
    costSourceScopes: Object.freeze([
      'seller_onboarding',
      'rates_account',
      'levy_statement',
      'hoa_levy_statement',
      'transfer_attorney_assignment',
      'transaction_offer_terms',
      'manual',
    ]),
    expectedCostKeys: Object.freeze([
      'buyer_transfer_cost_quote',
      'buyer_transfer_duty',
      'municipal_rates_estimate',
      'scheme_levy_estimate',
    ]),
    prohibitedCostKeys: Object.freeze([
      'development_levy_estimate',
      'utility_connection_charges',
    ]),
  }),
  Object.freeze({
    key: 'new_development',
    label: 'New-Development OTP Review',
    screenKey: 'otp_review_new_development',
    costSourceScopes: Object.freeze([
      'development_unit_setup',
      'developer_sale_schedule',
      'transfer_attorney_assignment',
      'transaction_offer_terms',
      'manual',
    ]),
    expectedCostKeys: Object.freeze([
      'buyer_transfer_cost_quote',
      'buyer_transfer_duty',
      'development_levy_estimate',
      'utility_connection_charges',
    ]),
    prohibitedCostKeys: Object.freeze([
      'municipal_rates_estimate',
      'scheme_levy_estimate',
    ]),
  }),
])

function normalizeText(value = '') {
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getRouteManifest(routeVariant = '') {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  return OTP_COMMERCIAL_TERMS_REVIEW_ROUTES.find((route) => route.key === routeKey) || null
}

function formatMoneyRecord(record = {}) {
  if (!record) return 'Not set'
  const basis = normalizeKey(record.basis || record.type || record.commissionType)
  const percentage = normalizeNumber(firstValue(record.percentage, record.rate, record.commissionPercentage))
  const amount = normalizeNumber(firstValue(record.amount, record.commissionAmount, record.grossCommissionAmount))
  if (percentage !== null) return `${percentage}%${basis ? ` ${basis.replace(/_/g, ' ')}` : ''}`.trim()
  if (amount !== null) return `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
  return 'Not set'
}

function normalizePersistedCommissionVariation(record = {}, routeVariant = 'resale_existing_property') {
  if (!record || typeof record !== 'object' || Object.keys(record).length === 0) return null
  if (record.lockState && record.approval && record.mandateCommissionSnapshot) return record

  const mandateCommission = firstValue(record.mandateCommissionSnapshot, record.mandate_commission_snapshot, record.mandateCommission) || {}
  const proposedOtpCommission = firstValue(record.proposedOtpCommission, record.proposed_otp_commission, record.otpCommission) || {}
  const approvalStatus = normalizeKey(firstValue(record.approvalStatus, record.approval_status, record.approval?.status))
  const approvalReference = firstValue(record.approvalReference, record.approval_reference, record.approval?.approvalReference)
  const approvedBy = firstValue(record.approvedBy, record.approved_by, record.approval?.approverId)
  const approvedAt = firstValue(record.approvedAt, record.approved_at, record.approval?.approvedAt)
  const rejectedAt = firstValue(record.rejectedAt, record.rejected_at, record.approval?.rejectedAt)
  const reason = firstValue(record.reason, record.approval_reason, record.approval?.reason)

  return buildOtpCommissionVariationRecord({
    transactionId: firstValue(record.transactionId, record.transaction_id),
    routeVariant: firstValue(record.routeVariant, record.route_variant, routeVariant),
    mandateCommission,
    proposedOtpCommission,
    approval: {
      status: approvalStatus,
      approvalReference,
      approvedBy,
      approvedAt,
      rejectedAt,
      reason,
    },
    reason,
  })
}

function buildCommissionSection(commissionVariation = {}, routeVariant = 'resale_existing_property') {
  const normalized = normalizePersistedCommissionVariation(commissionVariation, routeVariant)
  if (!normalized) {
    return Object.freeze({
      key: 'commission_approval',
      label: 'Commission approval',
      status: 'missing',
      statusLabel: 'Not recorded',
      visibleBeforeGeneration: true,
      blocksGeneration: true,
      blockerCode: 'otp_commission_variation_missing',
      preservesMandateCommission: true,
      mandateCommission: 'Not set',
      proposedOtpCommission: 'Not set',
      finalOtpCommission: 'Not set',
      approvalReference: '',
      actions: Object.freeze(['record_commission_terms']),
    })
  }

  const decision = buildTransactionCommissionLockDecision(normalized)
  const status = decision.approvalStatus
  const blocksGeneration = decision.canLock !== true
  return Object.freeze({
    key: 'commission_approval',
    label: 'Commission approval',
    status,
    statusLabel: status.replace(/_/g, ' '),
    visibleBeforeGeneration: true,
    blocksGeneration,
    blockerCode: blocksGeneration ? decision.blockerCodes[0] : '',
    lockState: decision.lockState,
    preservesMandateCommission: decision.preservesMandateCommission === true,
    mandateCommission: formatMoneyRecord(decision.mandateCommissionSnapshot),
    proposedOtpCommission: normalized.proposedOtpCommission ? formatMoneyRecord(normalized.proposedOtpCommission) : 'No variation',
    finalOtpCommission: decision.finalOtpCommission ? formatMoneyRecord(decision.finalOtpCommission) : 'Waiting for approval',
    approvalReference: normalizeText(normalized.approval?.approvalReference),
    approverId: normalizeText(normalized.approval?.approverId),
    reason: normalizeText(normalized.approval?.reason),
    actions: Object.freeze(blocksGeneration
      ? ['request_commission_approval', 'edit_commission_variation']
      : ['review_locked_commission']),
  })
}

function normalizePersistedCostItem(item = {}, routeVariant = 'resale_existing_property') {
  const payload = item.itemPayload || item.item_payload || item.payload || item
  const normalized = normalizeOtpCostObligationItem({
    ...payload,
    key: firstValue(item.itemKey, item.item_key, payload.key, item.key),
    category: firstValue(item.category, payload.category),
    label: firstValue(item.label, payload.label, payload.title),
    amount: firstValue(item.amount, payload.amount),
    amountStatus: firstValue(item.amountStatus, item.amount_status, payload.amountStatus, payload.status),
    payerRole: firstValue(item.payerRole, item.payer_role, payload.payerRole, payload.payer),
    payeeRole: firstValue(item.payeeRole, item.payee_role, payload.payeeRole, payload.payee),
    payeeName: firstValue(item.payeeName, item.payee_name, payload.payeeName),
    dueEvent: firstValue(item.dueEvent, item.due_event, payload.dueEvent, payload.due_event),
    source: firstValue(item.source, item.source_scope, payload.source),
    includeInOtp: firstValue(item.includeInOtp, item.include_in_otp, payload.includeInOtp),
    routeVariants: [firstValue(item.routeVariant, item.route_variant, routeVariant)],
    documentKeys: firstValue(item.documentKeys, item.document_keys, payload.documentKeys, payload.documents) || [],
    notes: firstValue(item.notes, payload.notes),
  })
  return Object.freeze({
    ...normalized,
    id: normalizeText(firstValue(item.id, payload.id)),
    visibleStatus: OTP_COST_AMOUNT_STATUSES.includes(normalized.amountStatus) ? normalized.amountStatus : 'pending',
  })
}

function buildCostSections({
  routeVariant = 'resale_existing_property',
  costObligationItems = [],
  sellerFacts = {},
  developmentUnit = {},
} = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const generatedFallback = buildOtpBuyerCostObligationSchedule({
    routeVariant: routeKey,
    sellerFacts,
    developmentUnit,
  })
  const sourceItems = Array.isArray(costObligationItems) && costObligationItems.length
    ? costObligationItems
    : generatedFallback.buyerVisibleItems
  const routeItems = sourceItems
    .map((item) => normalizePersistedCostItem(item, routeKey))
    .filter((item) => item.routeVariants.includes(routeKey))
    .filter((item) => item.includeInOtp)

  const byStatus = OTP_COST_AMOUNT_STATUSES.reduce((acc, status) => {
    acc[status] = routeItems.filter((item) => item.visibleStatus === status)
    return acc
  }, {})

  return Object.freeze({
    key: 'buyer_cost_obligations',
    label: 'Buyer cost obligations',
    visibleBeforeGeneration: true,
    items: Object.freeze(routeItems),
    known: Object.freeze(byStatus.known),
    estimated: Object.freeze(byStatus.estimated),
    pending: Object.freeze(byStatus.pending),
    notApplicable: Object.freeze(byStatus.not_applicable),
    statusCounts: Object.freeze({
      known: byStatus.known.length,
      estimated: byStatus.estimated.length,
      pending: byStatus.pending.length,
      notApplicable: byStatus.not_applicable.length,
    }),
    warnings: Object.freeze(byStatus.pending.map((item) => `pending_cost_obligation:${item.key}`)),
    actions: Object.freeze([
      'edit_cost_obligation',
      'mark_cost_not_applicable',
      'request_matter_attorney_quote',
    ]),
  })
}

function normalizeMatterQuoteState(state = {}, routeVariant = 'resale_existing_property') {
  if (!state || typeof state !== 'object' || Object.keys(state).length === 0) {
    return buildMatterAttorneyCostQuoteState({ routeVariant, status: 'pending_upload' })
  }
  if (state.separatedFromAttorneyLeadQuote !== undefined && state.transactionScoped !== undefined) return state

  const sourceScope = normalizeKey(firstValue(state.sourceScope, state.source_scope, 'transaction_matter'))
  return buildMatterAttorneyCostQuoteState({
    transactionId: firstValue(state.transactionId, state.transaction_id),
    transactionAttorneyAssignmentId: firstValue(
      state.transactionAttorneyAssignmentId,
      state.transaction_attorney_assignment_id,
    ),
    routeVariant: firstValue(state.routeVariant, state.route_variant, routeVariant),
    status: firstValue(state.status, state.quoteStatus, state.quote_status),
    document: {
      documentDefinitionKey: firstValue(state.documentDefinitionKey, state.document_definition_key, state.document?.documentDefinitionKey),
      fileUrl: firstValue(state.fileUrl, state.file_url, state.document?.fileUrl),
      amount: firstValue(state.amount, state.document?.amount),
      uploadedAt: firstValue(state.uploadedAt, state.uploaded_at, state.document?.uploadedAt),
      uploadedBy: firstValue(state.uploadedBy, state.uploaded_by, state.document?.uploadedBy),
    },
    leadQuoteId: sourceScope === 'transaction_matter' ? '' : firstValue(state.attorneyLeadQuoteId, state.attorney_lead_quote_id),
    updatedAt: firstValue(state.updatedAt, state.updated_at),
  })
}

function buildMatterAttorneyQuoteSection(state = {}, routeVariant = 'resale_existing_property') {
  const normalized = normalizeMatterQuoteState(state, routeVariant)
  const sourceScope = normalizeKey(firstValue(state.sourceScope, state.source_scope, 'transaction_matter'))
  const separated = normalized.separatedFromAttorneyLeadQuote === true && !normalized.attorneyLeadQuoteId && sourceScope === 'transaction_matter'
  const blocksGeneration = Boolean(state.attorneyLeadQuoteId || state.attorney_lead_quote_id || sourceScope !== 'transaction_matter')

  return Object.freeze({
    key: 'matter_attorney_cost_quote',
    label: 'Matter attorney cost quote',
    status: normalized.status,
    statusLabel: normalized.status.replace(/_/g, ' '),
    visibleBeforeGeneration: true,
    transactionScoped: normalized.transactionScoped === true,
    separatedFromAttorneyLeadQuote: separated,
    blocksGeneration,
    blockerCode: blocksGeneration ? 'matter_attorney_quote_scope_not_transaction_matter' : '',
    transactionAttorneyAssignmentId: normalizeText(normalized.transactionAttorneyAssignmentId),
    documentDefinitionKey: normalized.document?.documentDefinitionKey || 'buyer_transfer_cost_invoice',
    documentAmount: normalized.document?.amount ?? null,
    clientPortalVisible: normalized.clientPortalVisible === true,
    warnings: Object.freeze(normalized.blockers || []),
    actions: Object.freeze(['open_matter_quote', 'request_matter_quote_revision', 'acknowledge_matter_quote']),
  })
}

function resolveReviewStatus({ routeManifest = null, commissionSection = {}, matterQuoteSection = {} } = {}) {
  if (!routeManifest) return 'OTP_REVIEW_BLOCKED_INVALID_ROUTE'
  if (matterQuoteSection.blocksGeneration) return 'OTP_REVIEW_BLOCKED_MATTER_QUOTE_SCOPE'
  if (commissionSection.lockState === 'blocked_rejected_variation') return 'OTP_REVIEW_BLOCKED_REJECTED_COMMERCIAL_APPROVAL'
  if (commissionSection.blocksGeneration) return 'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL'
  return 'OTP_REVIEW_READY_FOR_GENERATION'
}

export function buildOtpCommercialTermsReviewModel({
  transactionId = '',
  routeVariant = 'resale_existing_property',
  commissionVariation = {},
  costObligationItems = [],
  matterAttorneyQuoteState = {},
  sellerFacts = {},
  developmentUnit = {},
  readiness = {},
  reviewedAt = new Date().toISOString(),
} = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const routeManifest = getRouteManifest(routeKey)
  const commissionSection = buildCommissionSection(commissionVariation, routeKey)
  const costSection = buildCostSections({
    routeVariant: routeKey,
    costObligationItems,
    sellerFacts,
    developmentUnit,
  })
  const matterQuoteSection = buildMatterAttorneyQuoteSection(matterAttorneyQuoteState, routeKey)
  const status = resolveReviewStatus({ routeManifest, commissionSection, matterQuoteSection })
  const generationBlockers = [
    routeManifest ? '' : 'otp_review_invalid_route',
    commissionSection.blocksGeneration ? commissionSection.blockerCode : '',
    matterQuoteSection.blocksGeneration ? matterQuoteSection.blockerCode : '',
  ].filter(Boolean)
  const warningCodes = unique([
    ...costSection.warnings,
    ...matterQuoteSection.warnings,
    readiness.has_pending_costs ? 'phase24_readiness_has_pending_costs' : '',
  ])

  return Object.freeze({
    version: OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION,
    contract: OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT,
    reviewedAt,
    transactionId: normalizeText(transactionId || commissionVariation.transactionId || commissionVariation.transaction_id),
    routeVariant: routeKey,
    routeLabel: routeManifest?.label || 'Unknown OTP Review',
    screenKey: routeManifest?.screenKey || 'otp_review_unknown',
    status,
    canGenerateOtp: status === 'OTP_REVIEW_READY_FOR_GENERATION',
    generationBlockers: Object.freeze(generationBlockers),
    warningCodes: Object.freeze(warningCodes),
    sections: Object.freeze({
      commissionApproval: commissionSection,
      buyerCostObligations: costSection,
      matterAttorneyQuote: matterQuoteSection,
    }),
    routeManifest: routeManifest ? Object.freeze(cloneJson(routeManifest)) : null,
    routeSeparation: Object.freeze({
      separateScreen: Boolean(routeManifest?.screenKey),
      expectedCostKeysPresent: routeManifest ? routeManifest.expectedCostKeys.every((key) => costSection.items.some((item) => item.key === key)) : false,
      prohibitedCostKeysAbsent: routeManifest ? routeManifest.prohibitedCostKeys.every((key) => !costSection.items.some((item) => item.key === key)) : false,
      sourceScopes: Object.freeze(unique(costSection.items.map((item) => item.source))),
    }),
    source: Object.freeze({
      persistenceReadinessStatus: readiness.status || readiness.readiness_status || '',
      mutatedData: false,
    }),
  })
}

function buildSampleReviewModels(checkedAt = new Date().toISOString()) {
  const pendingResaleCommission = buildOtpCommissionVariationRecord({
    transactionId: 'tx-resale-review',
    routeVariant: 'resale_existing_property',
    mandateCommission: { basis: 'percentage', percentage: 5 },
    proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
    reason: 'Negotiated in OTP',
  })
  const approvedResaleCommission = buildOtpCommissionVariationRecord({
    transactionId: 'tx-resale-review',
    routeVariant: 'resale_existing_property',
    mandateCommission: { basis: 'percentage', percentage: 5 },
    proposedOtpCommission: { basis: 'percentage', percentage: 4.5 },
    approval: { status: 'approved', approvalReference: 'OTP-COMM-APPROVED-001', approverId: 'principal-user', approvedAt: checkedAt },
  })
  const approvedDevelopmentCommission = buildOtpCommissionVariationRecord({
    transactionId: 'tx-development-review',
    routeVariant: 'new_development',
    mandateCommission: { basis: 'percentage', percentage: 5 },
    proposedOtpCommission: { basis: 'percentage', percentage: 5 },
  })

  return Object.freeze({
    resaleBlocked: buildOtpCommercialTermsReviewModel({
      transactionId: 'tx-resale-review',
      routeVariant: 'resale_existing_property',
      reviewedAt: checkedAt,
      commissionVariation: pendingResaleCommission,
      sellerFacts: {
        property: {
          rates_taxes: 1850,
          levies: 2250,
          scheme: { body_corporate_name: 'Pine Avenue Body Corporate', levies: 2250 },
        },
      },
      matterAttorneyQuoteState: {
        transactionId: 'tx-resale-review',
        transactionAttorneyAssignmentId: 'assignment-resale',
        routeVariant: 'resale_existing_property',
        quoteStatus: 'uploaded',
        documentDefinitionKey: 'buyer_transfer_cost_invoice',
        amount: 47850,
      },
      readiness: { has_pending_costs: true },
    }),
    resaleReady: buildOtpCommercialTermsReviewModel({
      transactionId: 'tx-resale-review',
      routeVariant: 'resale_existing_property',
      reviewedAt: checkedAt,
      commissionVariation: approvedResaleCommission,
      sellerFacts: {
        property: {
          rates_taxes: 1850,
          levies: 2250,
          scheme: { body_corporate_name: 'Pine Avenue Body Corporate', levies: 2250 },
        },
      },
      matterAttorneyQuoteState: {
        transactionId: 'tx-resale-review',
        transactionAttorneyAssignmentId: 'assignment-resale',
        routeVariant: 'resale_existing_property',
        quoteStatus: 'uploaded',
        documentDefinitionKey: 'buyer_transfer_cost_invoice',
        amount: 47850,
      },
    }),
    developmentReady: buildOtpCommercialTermsReviewModel({
      transactionId: 'tx-development-review',
      routeVariant: 'new_development',
      reviewedAt: checkedAt,
      commissionVariation: approvedDevelopmentCommission,
      developmentUnit: { levyEstimate: 2100, utilityConnectionCharges: 15000 },
      matterAttorneyQuoteState: {
        transactionId: 'tx-development-review',
        transactionAttorneyAssignmentId: 'assignment-development',
        routeVariant: 'new_development',
        quoteStatus: 'pending_upload',
      },
    }),
  })
}

function includesAll(source = '', tokens = []) {
  return tokens.every((token) => source.includes(token))
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt = new Date().toISOString(),
  phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({ checkedAt }),
  reviewComponentSource = '',
} = {}) {
  const checks = []
  const samples = buildSampleReviewModels(checkedAt)

  addCheck(
    checks,
    phase24Audit.status === OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS,
    'PHASE25_PHASE24_PERSISTENCE_READY',
    'Phase 25 starts only after commercial terms persistence is verified.',
  )
  addCheck(
    checks,
    samples.resaleBlocked.sections.commissionApproval.visibleBeforeGeneration === true &&
      samples.resaleBlocked.sections.commissionApproval.status === 'pending_approval' &&
      samples.resaleBlocked.status === 'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL',
    'PHASE25_COMMISSION_APPROVAL_VISIBLE_AND_BLOCKING',
    'Negotiated commission approval status is visible before generation and blocks until approval.',
  )
  addCheck(
    checks,
    samples.resaleReady.sections.commissionApproval.preservesMandateCommission === true &&
      samples.resaleReady.sections.commissionApproval.mandateCommission.includes('5%') &&
      samples.resaleReady.sections.commissionApproval.finalOtpCommission.includes('4.5%'),
    'PHASE25_MANDATE_COMMISSION_REMAINS_SEPARATE',
    'The review shows mandate and OTP commission separately instead of overwriting the mandate commission.',
  )
  addCheck(
    checks,
    samples.resaleReady.sections.buyerCostObligations.statusCounts.estimated >= 2 &&
      samples.resaleReady.sections.buyerCostObligations.statusCounts.pending >= 2 &&
      samples.resaleReady.sections.buyerCostObligations.items.every((item) => ['known', 'estimated', 'pending', 'not_applicable'].includes(item.visibleStatus)),
    'PHASE25_COST_OBLIGATION_STATUSES_VISIBLE',
    'Buyer cost obligations are grouped into known, estimated, pending and not-applicable states for review.',
  )
  addCheck(
    checks,
    samples.resaleReady.routeManifest.screenKey !== samples.developmentReady.routeManifest.screenKey &&
      samples.resaleReady.routeSeparation.prohibitedCostKeysAbsent === true &&
      samples.developmentReady.routeSeparation.prohibitedCostKeysAbsent === true,
    'PHASE25_RESALE_AND_DEVELOPMENT_REVIEW_SCREENS_SEPARATE',
    'Resale and new-development review models use separate screen keys and prevent cross-route cost leakage.',
  )
  addCheck(
    checks,
    samples.resaleReady.sections.matterAttorneyQuote.transactionScoped === true &&
      samples.resaleReady.sections.matterAttorneyQuote.separatedFromAttorneyLeadQuote === true &&
      samples.resaleReady.sections.matterAttorneyQuote.blockerCode === '',
    'PHASE25_MATTER_ATTORNEY_QUOTE_TRANSACTION_SCOPED',
    'Matter attorney quote review is scoped to transaction attorney assignment and excludes lead quote scope.',
  )
  addCheck(
    checks,
    includesAll(reviewComponentSource, [
      'OtpCommercialTermsReviewPanel',
      'commissionApproval',
      'buyerCostObligations',
      'matterAttorneyQuote',
      'known',
      'estimated',
      'pending',
      'routeVariant',
      'aria-label',
    ]),
    'PHASE25_REVIEW_PANEL_COMPONENT_PRESENT',
    'A reusable OTP commercial terms review panel can render route, commission, costs and matter quote sections.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_COMMERCIAL_TERMS_REVIEW_PHASE25_VERSION,
    contract: OTP_COMMERCIAL_TERMS_REVIEW_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_COMMERCIAL_TERMS_REVIEW_REMEDIATION_REQUIRED' : OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 26,
      key: 'runtime_data_wiring',
      label: 'Runtime Data Wiring',
    }),
    summary: Object.freeze({
      routeCount: OTP_DOCUMENT_VARIANTS.length,
      reviewRouteCount: OTP_COMMERCIAL_TERMS_REVIEW_ROUTES.length,
      blockerCount: blockers.length,
      resaleWarningCount: samples.resaleBlocked.warningCodes.length,
      developmentWarningCount: samples.developmentReady.warningCodes.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    routes: OTP_COMMERCIAL_TERMS_REVIEW_ROUTES,
    evidence: Object.freeze({
      phase24: Object.freeze({
        version: phase24Audit.version,
        status: phase24Audit.status,
        blockerCount: phase24Audit.summary?.blockerCount ?? phase24Audit.blockers?.length ?? 0,
      }),
      samples: cloneJson(samples),
    }),
  })
}

export function formatOtpCommercialTermsReviewPhase25Markdown(report = buildOtpCommercialTermsReviewPhase25Audit()) {
  return [
    '# OTP Generator Phase 25 Review UI',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['OTP routes', report.summary.routeCount],
        ['Review routes', report.summary.reviewRouteCount],
        ['Blockers', report.summary.blockerCount],
        ['Resale sample warnings', report.summary.resaleWarningCount],
        ['New-development sample warnings', report.summary.developmentWarningCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
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
    '## Review Routes',
    '',
    table(
      ['Route', 'Screen', 'Expected cost keys', 'Prohibited cost keys'],
      report.routes.map((route) => [
        route.key,
        route.screenKey,
        route.expectedCostKeys.join(', '),
        route.prohibitedCostKeys.join(', '),
      ]),
    ),
    '',
    '## Runtime Boundary',
    '',
    'Phase 25 builds the pre-generation review model and reusable UI panel only. It does not wire live runtime generation inputs, mutate commission records, dispatch signing envelopes, publish attorney quote documents, or activate production defaults. Phase 26 is the runtime data wiring phase.',
    '',
  ].join('\n')
}
