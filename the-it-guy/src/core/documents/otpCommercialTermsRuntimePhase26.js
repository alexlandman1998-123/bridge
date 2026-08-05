import {
  buildOtpBuyerCostObligationSchedule,
  buildOtpCommissionVariationRecord,
  buildMatterAttorneyCostQuoteState,
  buildTransactionCommissionLockDecision,
} from './otpCommercialTermsFoundation.js'
import {
  OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS,
  buildOtpCommercialTermsReviewModel,
  buildOtpCommercialTermsReviewPhase25Audit,
} from './otpCommercialTermsReviewPhase25.js'
import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'

export const OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION = 'otp_commercial_terms_runtime_phase26_v1'
export const OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS = 'OTP_COMMERCIAL_TERMS_RUNTIME_READY_FOR_PHASE27_GENERATED_PDF_PROOF'
export const OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT = 'otp-vnext-commercial-terms-runtime-phase26-v1'

export const OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS = Object.freeze([
  'loadOtpCommercialTermsRuntimeRecords',
  'buildOtpCommercialTermsRuntimeInputForTransaction',
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function objectValue(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function cloneJson(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

function latestRouteRow(rows = [], routeVariant = '') {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  return list(rows)
    .filter((row) => normalizeOtpDocumentVariant(row.routeVariant || row.route_variant) === routeKey)
    .filter((row) => row.is_current !== false && normalizeKey(row.status || 'active') !== 'cancelled')
    .sort((left, right) => normalizeText(right.updated_at || right.updatedAt || right.created_at || right.createdAt).localeCompare(normalizeText(left.updated_at || left.updatedAt || left.created_at || left.createdAt)))[0] || null
}

function routeRows(rows = [], routeVariant = '') {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  return list(rows)
    .filter((row) => normalizeOtpDocumentVariant(row.routeVariant || row.route_variant) === routeKey)
    .filter((row) => normalizeKey(row.status || 'active') !== 'cancelled')
}

function resolveRouteVariant({ routeVariant = '', transaction = {}, listing = {} } = {}) {
  return normalizeOtpDocumentVariant(firstValue(
    routeVariant,
    transaction.otpDocumentVariant,
    transaction.otp_document_variant,
    transaction.documentVariant,
    transaction.document_variant,
    transaction.routeVariant,
    transaction.route_variant,
    transaction.saleType,
    transaction.sale_type,
    listing.otpDocumentVariant,
    listing.otp_document_variant,
    listing.listingType,
    listing.listing_type,
  )) || 'resale_existing_property'
}

function readFormData(sellerOnboarding = {}, listing = {}) {
  return objectValue(
    sellerOnboarding.formData,
    sellerOnboarding.form_data,
    sellerOnboarding.canonicalFacts,
    sellerOnboarding.canonical_facts,
    listing.sellerOnboarding,
    listing.seller_onboarding,
  )
}

export function deriveOtpRuntimeSellerFacts({ sellerOnboarding = {}, listing = {}, transaction = {} } = {}) {
  const formData = readFormData(sellerOnboarding, listing)
  const property = objectValue(formData.property, formData.propertyDetails, formData.property_details, listing.property, transaction.property)
  const scheme = objectValue(property.scheme, formData.scheme, formData.bodyCorporate, formData.body_corporate)
  const estate = objectValue(property.estate, formData.estate, formData.hoa)
  const ratesTaxes = firstValue(
    property.rates_taxes,
    property.ratesTaxes,
    formData.rates_taxes,
    formData.ratesTaxes,
    formData.monthlyRates,
    listing.rates_taxes,
    transaction.rates_taxes,
  )
  const levies = firstValue(
    scheme.levies,
    property.levies,
    formData.levies,
    formData.monthlyLevies,
    listing.levies,
    transaction.levies,
  )

  return Object.freeze({
    source: 'seller_onboarding',
    property: Object.freeze({
      rates_taxes: normalizeNumber(ratesTaxes),
      levies: normalizeNumber(levies),
      estate_or_hoa: Boolean(firstValue(property.estate_or_hoa, property.estateOrHoa, estate.name, formData.hoaName, formData.hoa_name)),
      levies_not_applicable: Boolean(firstValue(property.levies_not_applicable, formData.leviesNotApplicable)),
      scheme: Object.freeze({
        body_corporate_name: normalizeText(firstValue(scheme.body_corporate_name, scheme.bodyCorporateName, formData.bodyCorporateName)),
        levies: normalizeNumber(levies),
      }),
      estate: Object.freeze({
        name: normalizeText(firstValue(estate.name, formData.hoaName, formData.hoa_name)),
      }),
    }),
    sourceKeys: Object.freeze(['seller_onboarding', 'rates_account', 'levy_statement', 'hoa_levy_statement']),
  })
}

export function deriveOtpRuntimeDevelopmentUnit({ developmentUnit = {}, transaction = {}, listing = {} } = {}) {
  const source = objectValue(
    developmentUnit,
    transaction.developmentUnit,
    transaction.development_unit,
    transaction.development,
    transaction.offerTerms,
    transaction.offer_terms,
    listing.developmentUnit,
    listing.development_unit,
  )
  return Object.freeze({
    source: 'development_unit_setup',
    levyEstimate: normalizeNumber(firstValue(
      source.levyEstimate,
      source.levy_estimate,
      source.monthlyLevy,
      source.monthly_levy,
      transaction.development_levy_estimate,
    )),
    utilityConnectionCharges: normalizeNumber(firstValue(
      source.utilityConnectionCharges,
      source.utility_connection_charges,
      source.connectionCharges,
      source.connection_charges,
      transaction.utility_connection_charges,
    )),
    developmentRatesEstimate: normalizeNumber(firstValue(
      source.developmentRatesEstimate,
      source.development_rates_estimate,
      source.ratesEstimate,
      source.rates_estimate,
      transaction.development_rates_estimate,
    )),
    sourceKeys: Object.freeze(['development_unit_setup', 'developer_sale_schedule']),
  })
}

function deriveCommissionFromRuntime({ transaction = {}, listing = {}, routeVariant = '' } = {}) {
  const listingCommission = objectValue(listing.commission, listing.mandateCommission, listing.mandate_commission)
  const transactionCommission = objectValue(transaction.commission, transaction.offerCommission, transaction.offer_commission)
  const purchasePrice = normalizeNumber(firstValue(transaction.purchasePrice, transaction.purchase_price, transaction.offerAmount, transaction.offer_amount))
  const mandatePercentage = normalizeNumber(firstValue(
    listingCommission.percentage,
    listingCommission.rate,
    listingCommission.commission_percentage,
    transaction.mandateCommissionPercentage,
    transaction.mandate_commission_percentage,
  ))
  const proposedPercentage = normalizeNumber(firstValue(
    transactionCommission.percentage,
    transactionCommission.rate,
    transactionCommission.commission_percentage,
    transaction.grossCommissionPercentage,
    transaction.gross_commission_percentage,
    mandatePercentage,
  ))
  const proposedAmount = normalizeNumber(firstValue(
    transactionCommission.amount,
    transactionCommission.commission_amount,
    transaction.grossCommissionAmount,
    transaction.gross_commission_amount,
    proposedPercentage !== null && purchasePrice !== null ? Number(((purchasePrice * proposedPercentage) / 100).toFixed(2)) : null,
  ))

  return buildOtpCommissionVariationRecord({
    transactionId: transaction.id || transaction.transaction_id,
    routeVariant,
    mandateCommission: {
      basis: 'percentage',
      percentage: mandatePercentage,
      amount: normalizeNumber(firstValue(listingCommission.amount, listingCommission.commission_amount)),
      source: 'mandate',
    },
    proposedOtpCommission: {
      basis: proposedPercentage !== null ? 'percentage' : 'amount',
      percentage: proposedPercentage,
      amount: proposedAmount,
      source: 'transaction_offer_terms',
    },
    approval: {
      status: proposedPercentage === mandatePercentage ? 'not_required' : normalizeKey(transaction.commissionApprovalStatus || transaction.commission_approval_status),
      approvalReference: firstValue(transaction.commissionApprovalReference, transaction.commission_approval_reference),
    },
    reason: 'runtime_data_wiring',
  })
}

function normalizePersistedCommission(row = {}, routeVariant = '') {
  if (!row) return null
  return buildOtpCommissionVariationRecord({
    transactionId: firstValue(row.transaction_id, row.transactionId),
    routeVariant: firstValue(row.route_variant, row.routeVariant, routeVariant),
    mandateCommission: objectValue(row.mandate_commission_snapshot, row.mandateCommissionSnapshot),
    proposedOtpCommission: objectValue(row.proposed_otp_commission, row.proposedOtpCommission),
    approval: {
      status: firstValue(row.approval_status, row.approvalStatus),
      approvalReference: firstValue(row.approval_reference, row.approvalReference),
      approvedBy: firstValue(row.approved_by, row.approvedBy),
      approvedAt: firstValue(row.approved_at, row.approvedAt),
      rejectedAt: firstValue(row.rejected_at, row.rejectedAt),
      reason: firstValue(row.approval_reason, row.reason),
    },
    reason: firstValue(row.approval_reason, row.reason),
  })
}

function mergeCostObligations({ routeVariant = '', sellerFacts = {}, developmentUnit = {}, costObligationRows = [] } = {}) {
  const routeKey = normalizeOtpDocumentVariant(routeVariant)
  const derived = buildOtpBuyerCostObligationSchedule({
    routeVariant: routeKey,
    sellerFacts,
    developmentUnit,
  }).buyerVisibleItems.map((item) => ({ ...item, route_variant: routeKey }))
  const persisted = routeRows(costObligationRows, routeKey).filter((row) => row.include_in_otp !== false && row.includeInOtp !== false)
  const byKey = new Map()

  for (const item of derived) byKey.set(normalizeKey(item.item_key || item.key), item)
  for (const item of persisted) byKey.set(normalizeKey(item.item_key || item.key), item)

  return Object.freeze([...byKey.values()].filter((item) => normalizeOtpDocumentVariant(item.route_variant || item.routeVariant || routeKey) === routeKey))
}

function selectTransferAttorneyAssignment(assignments = []) {
  return list(assignments).find((assignment) => (
    normalizeKey(assignment.attorneyRole || assignment.attorney_role) === 'transfer_attorney' &&
    !['removed', 'cancelled'].includes(normalizeKey(assignment.assignmentStatus || assignment.assignment_status || assignment.status))
  )) || null
}

function buildMatterQuoteRuntimeState({ transaction = {}, routeVariant = '', matterAttorneyQuoteRows = [], attorneyAssignments = [] } = {}) {
  const assignment = selectTransferAttorneyAssignment(attorneyAssignments)
  const row = routeRows(matterAttorneyQuoteRows, routeVariant).find((item) => (
    !assignment ||
    normalizeText(item.transaction_attorney_assignment_id || item.transactionAttorneyAssignmentId) === normalizeText(assignment.id)
  )) || null

  if (row) return row

  return buildMatterAttorneyCostQuoteState({
    transactionId: transaction.id || transaction.transaction_id,
    transactionAttorneyAssignmentId: assignment?.id || '',
    routeVariant,
    status: 'pending_upload',
  })
}

function moneyText(record = {}) {
  if (!record) return ''
  if (record.percentage !== null && record.percentage !== undefined) return `${record.percentage}%`
  if (record.amount !== null && record.amount !== undefined) return `R ${Number(record.amount).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
  return ''
}

function costItemText(item = {}) {
  const label = normalizeText(item.label || item.item_label || item.item_key || item.key)
  const status = normalizeText(item.amount_status || item.amountStatus || item.visibleStatus || 'pending').replace(/_/g, ' ')
  const amount = normalizeNumber(item.amount)
  return [label, status, amount !== null ? `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : ''].filter(Boolean).join(' - ')
}

function buildGeneratorCommercialTerms({ reviewModel = {}, commissionVariation = {}, costObligationItems = [], matterAttorneyQuoteState = {}, attorneyAssignment = null } = {}) {
  const lockDecision = buildTransactionCommissionLockDecision(commissionVariation)
  const buyerVisibleItems = reviewModel.sections?.buyerCostObligations?.items || costObligationItems
  const pendingItems = buyerVisibleItems.filter((item) => normalizeKey(item.amountStatus || item.amount_status || item.visibleStatus) === 'pending')
  const finalCommission = lockDecision.finalOtpCommission || null

  return Object.freeze({
    commission: Object.freeze({
      mandateCommissionSnapshot: lockDecision.mandateCommissionSnapshot,
      proposedOtpCommission: commissionVariation.proposedOtpCommission || commissionVariation.proposed_otp_commission || null,
      finalOtpCommission: finalCommission,
      approval: commissionVariation.approval || {
        status: commissionVariation.approval_status,
        approvalReference: commissionVariation.approval_reference,
      },
      lockDecision,
      canFinalizeTransactionCommission: lockDecision.canLock === true,
    }),
    costObligations: Object.freeze({
      buyerVisibleItems: Object.freeze(buyerVisibleItems),
      pendingItems: Object.freeze(pendingItems),
    }),
    matterAttorneyCostQuote: Object.freeze({
      status: matterAttorneyQuoteState.status || matterAttorneyQuoteState.quote_status || 'pending_upload',
      transactionAttorneyAssignmentId: matterAttorneyQuoteState.transactionAttorneyAssignmentId || matterAttorneyQuoteState.transaction_attorney_assignment_id || attorneyAssignment?.id || '',
      documentDefinitionKey: matterAttorneyQuoteState.documentDefinitionKey || matterAttorneyQuoteState.document_definition_key || matterAttorneyQuoteState.document?.documentDefinitionKey || 'buyer_transfer_cost_invoice',
      amount: matterAttorneyQuoteState.amount ?? matterAttorneyQuoteState.document?.amount ?? null,
      attorneyFirmId: matterAttorneyQuoteState.attorney_firm_id || matterAttorneyQuoteState.attorneyFirmId || attorneyAssignment?.attorneyFirmId || attorneyAssignment?.attorney_firm_id || '',
      sourceScope: matterAttorneyQuoteState.source_scope || matterAttorneyQuoteState.sourceScope || 'transaction_matter',
    }),
    mergeFields: Object.freeze({
      gross_commission_amount: finalCommission?.amount ?? null,
      mandate_commission_snapshot: moneyText(lockDecision.mandateCommissionSnapshot),
      otp_commission_proposal: moneyText(commissionVariation.proposedOtpCommission || commissionVariation.proposed_otp_commission),
      otp_commission_variation_status: lockDecision.approvalStatus,
      otp_commission_approval_reference: commissionVariation.approval?.approvalReference || commissionVariation.approval_reference || '',
      otp_buyer_cost_obligations: buyerVisibleItems.map(costItemText).join('; '),
      otp_pending_cost_obligations: pendingItems.map(costItemText).join('; '),
      matter_attorney_cost_quote_status: matterAttorneyQuoteState.status || matterAttorneyQuoteState.quote_status || 'pending_upload',
      transfer_attorney_company_name: attorneyAssignment?.firmName || attorneyAssignment?.attorney_firm_name || attorneyAssignment?.firm?.name || '',
      transfer_attorney_contact_person: attorneyAssignment?.attorneyName || attorneyAssignment?.primaryAttorneyName || attorneyAssignment?.primary_attorney_name || '',
      transfer_attorney_email: attorneyAssignment?.attorneyEmail || attorneyAssignment?.primaryAttorneyEmail || attorneyAssignment?.primary_attorney_email || '',
      transfer_attorney_phone: attorneyAssignment?.attorneyPhone || attorneyAssignment?.primaryAttorneyPhone || attorneyAssignment?.primary_attorney_phone || '',
    }),
  })
}

export function buildOtpCommercialTermsRuntimeInput({
  transaction = {},
  listing = {},
  sellerOnboarding = {},
  developmentUnit = {},
  commissionVariationRows = [],
  costObligationRows = [],
  matterAttorneyQuoteRows = [],
  attorneyAssignments = [],
  readinessRows = [],
  routeVariant = '',
  wiredAt = new Date().toISOString(),
} = {}) {
  const routeKey = resolveRouteVariant({ routeVariant, transaction, listing })
  const sellerFacts = routeKey === 'resale_existing_property'
    ? deriveOtpRuntimeSellerFacts({ sellerOnboarding, listing, transaction })
    : {}
  const normalizedDevelopmentUnit = routeKey === 'new_development'
    ? deriveOtpRuntimeDevelopmentUnit({ developmentUnit, transaction, listing })
    : {}
  const commissionRow = normalizePersistedCommission(latestRouteRow(commissionVariationRows, routeKey), routeKey)
  const commissionVariation = commissionRow || deriveCommissionFromRuntime({ transaction, listing, routeVariant: routeKey })
  const costObligationItems = mergeCostObligations({
    routeVariant: routeKey,
    sellerFacts,
    developmentUnit: normalizedDevelopmentUnit,
    costObligationRows,
  })
  const attorneyAssignment = selectTransferAttorneyAssignment(attorneyAssignments)
  const matterAttorneyQuoteState = buildMatterQuoteRuntimeState({
    transaction,
    routeVariant: routeKey,
    matterAttorneyQuoteRows,
    attorneyAssignments,
  })
  const readiness = latestRouteRow(readinessRows, routeKey) || {}
  const reviewInput = Object.freeze({
    transactionId: transaction.id || transaction.transaction_id,
    routeVariant: routeKey,
    commissionVariation,
    costObligationItems,
    matterAttorneyQuoteState,
    sellerFacts,
    developmentUnit: normalizedDevelopmentUnit,
    readiness,
    reviewedAt: wiredAt,
  })
  const reviewModel = buildOtpCommercialTermsReviewModel(reviewInput)
  const commercialTerms = buildGeneratorCommercialTerms({
    reviewModel,
    commissionVariation,
    costObligationItems,
    matterAttorneyQuoteState,
    attorneyAssignment,
  })

  return Object.freeze({
    version: OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION,
    contract: OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT,
    wiredAt,
    transactionId: normalizeText(transaction.id || transaction.transaction_id),
    routeVariant: routeKey,
    reviewInput,
    reviewModel,
    commercialTerms,
    generatorInput: Object.freeze({
      commercialTerms,
      routeVariant: routeKey,
      otpDocumentVariant: routeKey,
      mergeFields: commercialTerms.mergeFields,
    }),
    gates: Object.freeze({
      canGenerateOtp: reviewModel.canGenerateOtp === true,
      canFinalizeTransactionCommission: commercialTerms.commission.canFinalizeTransactionCommission === true,
      generationBlockers: reviewModel.generationBlockers,
      warnings: reviewModel.warningCodes,
    }),
    routeSeparation: Object.freeze({
      resaleSellerFactsIncluded: routeKey === 'resale_existing_property' && reviewModel.sections.buyerCostObligations.items.some((item) => ['municipal_rates_estimate', 'scheme_levy_estimate'].includes(item.key)),
      developmentFactsIncluded: routeKey === 'new_development' && reviewModel.sections.buyerCostObligations.items.some((item) => ['development_levy_estimate', 'utility_connection_charges'].includes(item.key)),
      prohibitedCostKeysAbsent: reviewModel.routeSeparation.prohibitedCostKeysAbsent === true,
      attorneyLeadQuotesExcluded: matterAttorneyQuoteState.source_scope !== 'attorney_lead_quote' && matterAttorneyQuoteState.sourceScope !== 'attorney_lead_quote',
    }),
    mutatedData: false,
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

function buildSamples(checkedAt = new Date().toISOString()) {
  const resale = buildOtpCommercialTermsRuntimeInput({
    wiredAt: checkedAt,
    transaction: {
      id: 'tx-runtime-resale',
      purchase_price: 2850000,
      gross_commission_percentage: 4.5,
    },
    listing: {
      commission: { commission_percentage: 5 },
    },
    sellerOnboarding: {
      form_data: {
        property: {
          ratesTaxes: 1950,
          levies: 2400,
          scheme: { bodyCorporateName: 'Phase 26 Body Corporate' },
        },
      },
    },
    commissionVariationRows: [{
      transaction_id: 'tx-runtime-resale',
      route_variant: 'resale_existing_property',
      mandate_commission_snapshot: { basis: 'percentage', percentage: 5 },
      proposed_otp_commission: { basis: 'percentage', percentage: 4.5, amount: 128250 },
      approval_status: 'approved',
      approval_reference: 'OTP-P26-COMM-APPROVED',
      updated_at: checkedAt,
    }],
    attorneyAssignments: [{
      id: 'assignment-runtime-resale',
      attorneyRole: 'transfer_attorney',
      assignmentStatus: 'active',
      attorneyFirmId: 'firm-runtime-resale',
      firmName: 'Runtime Transfer Attorneys',
    }],
    matterAttorneyQuoteRows: [{
      transaction_id: 'tx-runtime-resale',
      transaction_attorney_assignment_id: 'assignment-runtime-resale',
      route_variant: 'resale_existing_property',
      quote_status: 'uploaded',
      source_scope: 'transaction_matter',
      amount: 42000,
      updated_at: checkedAt,
    }],
  })
  const development = buildOtpCommercialTermsRuntimeInput({
    wiredAt: checkedAt,
    transaction: {
      id: 'tx-runtime-development',
      otp_document_variant: 'new_development',
      purchase_price: 3150000,
      gross_commission_percentage: 5,
    },
    listing: {
      commission: { commission_percentage: 5 },
    },
    developmentUnit: {
      levyEstimate: 2200,
      utilityConnectionCharges: 14500,
    },
    attorneyAssignments: [{
      id: 'assignment-runtime-development',
      attorneyRole: 'transfer_attorney',
      assignmentStatus: 'active',
    }],
  })
  const blockedCommission = buildOtpCommercialTermsRuntimeInput({
    wiredAt: checkedAt,
    transaction: {
      id: 'tx-runtime-blocked',
      purchase_price: 2850000,
      gross_commission_percentage: 4.25,
    },
    listing: { commission: { commission_percentage: 5 } },
    sellerOnboarding: { form_data: { property: { ratesTaxes: 1800, levies: 2100 } } },
  })
  return Object.freeze({ resale, development, blockedCommission })
}

export function buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt = new Date().toISOString(),
  phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({ checkedAt }),
  serviceSource = '',
} = {}) {
  const checks = []
  const samples = buildSamples(checkedAt)

  addCheck(
    checks,
    phase25Audit.status === OTP_COMMERCIAL_TERMS_REVIEW_READY_STATUS,
    'PHASE26_PHASE25_REVIEW_READY',
    'Phase 26 starts only after the pre-generation commercial review model is verified.',
  )
  addCheck(
    checks,
    samples.resale.routeSeparation.resaleSellerFactsIncluded === true &&
      samples.resale.routeSeparation.prohibitedCostKeysAbsent === true &&
      samples.resale.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Municipal rates and taxes'),
    'PHASE26_RESALE_SELLER_FACTS_FLOW_TO_GENERATOR_INPUT',
    'Seller rates, levies and scheme facts flow into resale OTP commercial generator input.',
  )
  addCheck(
    checks,
    samples.development.routeSeparation.developmentFactsIncluded === true &&
      samples.development.routeSeparation.prohibitedCostKeysAbsent === true &&
      samples.development.generatorInput.mergeFields.otp_buyer_cost_obligations.includes('Utility connection charges'),
    'PHASE26_DEVELOPMENT_COSTS_FLOW_TO_GENERATOR_INPUT',
    'Development levy and utility charges flow into new-development OTP input without resale seller-cost leakage.',
  )
  addCheck(
    checks,
    samples.resale.gates.canFinalizeTransactionCommission === true &&
      samples.blockedCommission.gates.canFinalizeTransactionCommission === false &&
      samples.blockedCommission.reviewModel.status === 'OTP_REVIEW_BLOCKED_PENDING_COMMERCIAL_APPROVAL',
    'PHASE26_COMMISSION_LOCK_DECISION_GATES_FINALISATION',
    'Commission finalisation is allowed only when the OTP commission variation review is approved or not required.',
  )
  addCheck(
    checks,
    samples.resale.commercialTerms.matterAttorneyCostQuote.transactionAttorneyAssignmentId === 'assignment-runtime-resale' &&
      samples.resale.routeSeparation.attorneyLeadQuotesExcluded === true,
    'PHASE26_MATTER_ATTORNEY_ASSIGNMENT_QUOTE_WIRED',
    'Matter attorney quote status is wired from transaction assignment scope, with attorney lead quotes excluded.',
  )
  addCheck(
    checks,
    includesAll(serviceSource, OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS) &&
      includesAll(serviceSource, [
        'otp_commission_variations',
        'otp_cost_obligation_items',
        'matter_attorney_cost_quote_states',
        'transaction_attorney_assignments',
        'private_listing_seller_onboarding',
        'buildOtpCommercialTermsRuntimeInput',
      ]),
    'PHASE26_RUNTIME_SERVICE_PRESENT',
    'Service wrapper can load transaction, seller onboarding, commercial persistence and attorney assignment records.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_COMMERCIAL_TERMS_RUNTIME_PHASE26_VERSION,
    contract: OTP_COMMERCIAL_TERMS_RUNTIME_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_COMMERCIAL_TERMS_RUNTIME_REMEDIATION_REQUIRED' : OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 27,
      key: 'generated_pdf_proof',
      label: 'Generated PDF Proof',
    }),
    summary: Object.freeze({
      routeCount: OTP_DOCUMENT_VARIANTS.length,
      serviceOperationCount: OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS.length,
      blockerCount: blockers.length,
      resaleCanGenerate: samples.resale.gates.canGenerateOtp,
      developmentCanGenerate: samples.development.gates.canGenerateOtp,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    serviceOperations: OTP_COMMERCIAL_TERMS_RUNTIME_SERVICE_OPERATIONS,
    evidence: Object.freeze({
      phase25: Object.freeze({
        version: phase25Audit.version,
        status: phase25Audit.status,
        blockerCount: phase25Audit.summary?.blockerCount ?? phase25Audit.blockers?.length ?? 0,
      }),
      samples: cloneJson(samples),
    }),
  })
}

export function formatOtpCommercialTermsRuntimePhase26Markdown(report = buildOtpCommercialTermsRuntimePhase26Audit()) {
  return [
    '# OTP Generator Phase 26 Runtime Data Wiring',
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
        ['Service operations', report.summary.serviceOperationCount],
        ['Blockers', report.summary.blockerCount],
        ['Resale can generate', report.summary.resaleCanGenerate ? 'yes' : 'no'],
        ['New-development can generate', report.summary.developmentCanGenerate ? 'yes' : 'no'],
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
    '## Runtime Boundary',
    '',
    'Phase 26 wires runtime records into the OTP commercial review and generator input shape. It does not generate or visually inspect PDFs, mutate transaction commission, publish attorney quote documents, send signing envelopes, or activate production defaults. Phase 27 is the generated PDF proof phase.',
    '',
  ].join('\n')
}
