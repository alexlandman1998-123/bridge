import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from './conveyancerMatterPlanContract.js'

export const CONVEYANCER_FINANCIAL_MODEL_VERSION = 'conveyancer_financial_model_v1'

export const CONVEYANCER_FINANCIAL_MODEL_STATUSES = Object.freeze({
  draft: 'draft',
  reviewRequired: 'review_required',
  ready: 'ready',
  blocked: 'blocked',
})

export const CONVEYANCER_FINANCIAL_LINE_CLASSES = Object.freeze({
  funding: 'funding',
  buyerCharge: 'buyer_charge',
  sellerDeduction: 'seller_deduction',
  buyerCredit: 'buyer_credit',
  sellerCredit: 'seller_credit',
})

export const CONVEYANCER_FINANCIAL_LINE_TYPES = Object.freeze({
  deposit: 'deposit',
  cashContribution: 'cash_contribution',
  bondProceeds: 'bond_proceeds',
  guarantee: 'guarantee',
  professionalFee: 'professional_fee',
  transferDuty: 'transfer_duty',
  vat: 'vat',
  deedsOfficeFee: 'deeds_office_fee',
  disbursement: 'disbursement',
  ratesClearance: 'rates_clearance',
  levyClearance: 'levy_clearance',
  homeownersAssociation: 'homeowners_association',
  commission: 'commission',
  bondSettlement: 'bond_settlement',
  apportionment: 'apportionment',
  interest: 'interest',
  refund: 'refund',
  adjustment: 'adjustment',
  other: 'other',
})

export const CONVEYANCER_FINANCIAL_LINE_STATUSES = Object.freeze({
  estimated: 'estimated',
  quoted: 'quoted',
  confirmed: 'confirmed',
  received: 'received',
  paid: 'paid',
  reversed: 'reversed',
})

export const CONVEYANCER_FINANCIAL_PARTY_ROLES = Object.freeze({
  buyer: 'buyer',
  seller: 'seller',
  trustAccount: 'trust_account',
  bank: 'bank',
  sars: 'sars',
  municipality: 'municipality',
  bodyCorporate: 'body_corporate',
  homeownersAssociation: 'homeowners_association',
  estateAgent: 'estate_agent',
  attorney: 'attorney',
  thirdParty: 'third_party',
})

export const CONVEYANCER_FINANCIAL_SOURCE_TYPES = Object.freeze({
  signedAgreement: 'signed_agreement',
  amendment: 'amendment',
  quote: 'quote',
  statutoryAssessment: 'statutory_assessment',
  invoice: 'invoice',
  bankConfirmation: 'bank_confirmation',
  guarantee: 'guarantee',
  receipt: 'receipt',
  calculation: 'calculation',
  manual: 'manual',
})

export const CONVEYANCER_FINANCIAL_TAX_TREATMENTS = Object.freeze({
  transferDuty: 'transfer_duty',
  vatInclusive: 'vat_inclusive',
  vatExclusive: 'vat_exclusive',
  zeroRated: 'zero_rated',
  exempt: 'exempt',
  unknown: 'unknown',
})

export const CONVEYANCER_FINANCIAL_CAPABILITIES = Object.freeze({
  view: 'view',
  capture: 'capture',
  approve: 'approve',
})

const S = CONVEYANCER_FINANCIAL_MODEL_STATUSES
const L = CONVEYANCER_FINANCIAL_LINE_CLASSES
const LS = CONVEYANCER_FINANCIAL_LINE_STATUSES
const CAP = CONVEYANCER_FINANCIAL_CAPABILITIES

export const CONVEYANCER_FINANCIAL_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.view, CAP.capture]),
  [R.accounts]: Object.freeze([CAP.view, CAP.capture]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([CAP.view]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

const MODEL_STATUSES = new Set(Object.values(S))
const LINE_CLASSES = new Set(Object.values(L))
const LINE_TYPES = new Set(Object.values(CONVEYANCER_FINANCIAL_LINE_TYPES))
const LINE_STATUSES = new Set(Object.values(LS))
const PARTY_ROLES = new Set(Object.values(CONVEYANCER_FINANCIAL_PARTY_ROLES))
const SOURCE_TYPES = new Set(Object.values(CONVEYANCER_FINANCIAL_SOURCE_TYPES))
const TAX_TREATMENTS = new Set(Object.values(CONVEYANCER_FINANCIAL_TAX_TREATMENTS))
const LANES = new Set(['transfer', 'bond', 'cancellation'])
const EVIDENCED_STATUSES = new Set([LS.confirmed, LS.received, LS.paid, LS.reversed])
const SECURED_FUNDING_STATUSES = new Set([LS.confirmed, LS.received, LS.paid])
const FUNDING_TYPES = new Set([
  CONVEYANCER_FINANCIAL_LINE_TYPES.deposit,
  CONVEYANCER_FINANCIAL_LINE_TYPES.cashContribution,
  CONVEYANCER_FINANCIAL_LINE_TYPES.bondProceeds,
  CONVEYANCER_FINANCIAL_LINE_TYPES.guarantee,
])
const CONSIDERATION_SOURCE_TYPES = new Set([
  CONVEYANCER_FINANCIAL_SOURCE_TYPES.signedAgreement,
  CONVEYANCER_FINANCIAL_SOURCE_TYPES.amendment,
])

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, itemKey) => ({ ...result, [itemKey]: stable(value[itemKey]) }), {})
  return value
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}
function fnv(value) {
  const source = JSON.stringify(stable(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null } }

export function getConveyancerFinancialCapabilities(role) {
  return CONVEYANCER_FINANCIAL_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerFinancialActor(role, capability) {
  return getConveyancerFinancialCapabilities(role).includes(key(capability))
}

export function isConveyancerFinancialLaneAuthorised(role, lane, { includeOperational = true } = {}) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  const normalizedLane = key(lane)
  if (normalized === R.firmManager) return true
  if (includeOperational && [R.secretary, R.accounts].includes(normalized)) return LANES.has(normalizedLane)
  if (normalizedLane === 'transfer') return [R.conveyancer, R.transferAttorney].includes(normalized)
  if (normalizedLane === 'bond') return normalized === R.bondAttorney
  if (normalizedLane === 'cancellation') return normalized === R.cancellationAttorney
  return false
}

export function parseConveyancerMoneyToMinor(value) {
  if (typeof value === 'bigint') return value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
  const normalized = text(value).replace(/[\s,]/g, '')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null
}

export function formatConveyancerMoneyFromMinor(value, currency = 'ZAR') {
  if (!Number.isSafeInteger(value) || value < 0) return null
  const whole = Math.floor(value / 100)
  const fraction = String(value % 100).padStart(2, '0')
  return `${currency} ${whole}.${fraction}`
}

function money(input = {}, minorKey, amountKey) {
  const direct = input[minorKey] ?? input[minorKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
  if (direct !== undefined && direct !== null && direct !== '') {
    const parsed = Number(direct)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
  }
  return parseConveyancerMoneyToMinor(input[amountKey] ?? input[amountKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)])
}

function normalizeSource(input = {}) {
  return {
    type: key(input.type),
    referenceId: text(input.referenceId || input.reference_id) || null,
    evidenceHash: text(input.evidenceHash || input.evidence_hash).toLowerCase() || null,
    effectiveAt: iso(input.effectiveAt || input.effective_at),
  }
}

function normalizeLine(input = {}) {
  const amountMinor = money(input, 'amountMinor', 'amount')
  const netAmountMinor = money(input, 'netAmountMinor', 'netAmount')
  const vatAmountMinor = money(input, 'vatAmountMinor', 'vatAmount')
  return {
    lineId: text(input.lineId || input.line_id),
    lineClass: key(input.lineClass || input.line_class),
    lineType: key(input.lineType || input.line_type),
    label: text(input.label),
    liableParty: key(input.liableParty || input.liable_party),
    recipientParty: key(input.recipientParty || input.recipient_party),
    amountMinor,
    netAmountMinor,
    vatAmountMinor,
    status: key(input.status) || LS.estimated,
    dueAt: iso(input.dueAt || input.due_at),
    source: normalizeSource(input.source),
    reason: text(input.reason) || null,
    decisionReferenceId: text(input.decisionReferenceId || input.decision_reference_id) || null,
  }
}

function contribution(line) {
  if (line.status === LS.reversed) return 0
  return line.amountMinor || 0
}

function sum(lines, predicate) {
  return lines.filter(predicate).reduce((total, line) => total + contribution(line), 0)
}

function buildSummary(model) {
  const lines = model.lines
  const purchasePriceMinor = model.consideration.purchasePriceMinor || 0
  const fundingCommittedMinor = sum(lines, (line) => line.lineClass === L.funding)
  const fundingSecuredMinor = sum(lines, (line) => line.lineClass === L.funding && SECURED_FUNDING_STATUSES.has(line.status))
  const buyerChargesMinor = sum(lines, (line) => line.lineClass === L.buyerCharge)
  const buyerCreditsMinor = sum(lines, (line) => line.lineClass === L.buyerCredit)
  const sellerDeductionsMinor = sum(lines, (line) => line.lineClass === L.sellerDeduction)
  const sellerCreditsMinor = sum(lines, (line) => line.lineClass === L.sellerCredit)
  return {
    purchasePriceMinor,
    depositMinor: sum(lines, (line) => line.lineClass === L.funding && line.lineType === CONVEYANCER_FINANCIAL_LINE_TYPES.deposit),
    fundingCommittedMinor,
    fundingSecuredMinor,
    fundingCommitmentVarianceMinor: fundingCommittedMinor - purchasePriceMinor,
    fundingSecurityVarianceMinor: fundingSecuredMinor - purchasePriceMinor,
    buyerChargesMinor,
    buyerCreditsMinor,
    buyerTotalExposureMinor: purchasePriceMinor + buyerChargesMinor - buyerCreditsMinor,
    sellerDeductionsMinor,
    sellerCreditsMinor,
    sellerNetProceedsMinor: purchasePriceMinor - sellerDeductionsMinor + sellerCreditsMinor,
  }
}

function assess(model) {
  const blockers = []
  const reviewItems = []
  const summary = model.summary
  if (!model.consideration.purchasePriceMinor) blockers.push('purchase_price_required')
  if (model.consideration.taxTreatment === CONVEYANCER_FINANCIAL_TAX_TREATMENTS.unknown) reviewItems.push('tax_treatment_confirmation_required')
  if (summary.depositMinor > summary.purchasePriceMinor) blockers.push('deposit_exceeds_purchase_price')
  if (summary.fundingCommitmentVarianceMinor < 0) blockers.push('purchase_price_funding_shortfall')
  if (summary.fundingCommitmentVarianceMinor > 0) blockers.push('purchase_price_overfunded')
  if (summary.fundingSecurityVarianceMinor < 0) reviewItems.push('purchase_price_funding_not_fully_secured')
  if (summary.fundingSecurityVarianceMinor > 0) blockers.push('secured_funding_exceeds_purchase_price')
  if (summary.sellerNetProceedsMinor < 0) blockers.push('seller_net_proceeds_negative')
  if (model.lines.some((line) => [LS.estimated, LS.quoted].includes(line.status))) reviewItems.push('unconfirmed_financial_lines')
  if (!model.approval) reviewItems.push('independent_legal_approval_required')
  let status = S.ready
  if (blockers.length) status = S.blocked
  else if (reviewItems.length) status = model.lines.length ? S.reviewRequired : S.draft
  return { status, blockers: unique(blockers), reviewItems: unique(reviewItems), assessedAt: model.asOf }
}

function modelSnapshot(model = {}) {
  const { fingerprint: _fingerprint, assessment: _assessment, summary: _summary, ...snapshot } = model
  return stable(snapshot)
}

export function buildConveyancerFinancialModelFingerprint(model = {}) {
  return fnv(modelSnapshot(model))
}

function normalizedModel(input = {}, asOf) {
  const preparedBy = actor(input.preparedBy || input.prepared_by)
  const approvalInput = input.approval && typeof input.approval === 'object' ? input.approval : null
  const model = {
    modelVersion: text(input.modelVersion || input.model_version) || CONVEYANCER_FINANCIAL_MODEL_VERSION,
    financialModelId: text(input.financialModelId || input.financial_model_id),
    revision: Number(input.revision || 1),
    previousFinancialModelId: text(input.previousFinancialModelId || input.previous_financial_model_id) || null,
    previousFingerprint: text(input.previousFingerprint || input.previous_fingerprint) || null,
    changeReason: text(input.changeReason || input.change_reason) || null,
    planId: text(input.planId || input.plan_id),
    planVersion: Number(input.planVersion || input.plan_version || 1),
    transactionId: text(input.transactionId || input.transaction_id),
    organisationId: text(input.organisationId || input.organisation_id),
    lane: key(input.lane),
    currency: text(input.currency || 'ZAR').toUpperCase(),
    consideration: {
      purchasePriceMinor: money(input.consideration || {}, 'purchasePriceMinor', 'purchasePrice'),
      taxTreatment: key(input.consideration?.taxTreatment || input.consideration?.tax_treatment) || CONVEYANCER_FINANCIAL_TAX_TREATMENTS.unknown,
      source: normalizeSource(input.consideration?.source),
    },
    lines: (Array.isArray(input.lines) ? input.lines : []).map(normalizeLine).sort((left, right) => left.lineId.localeCompare(right.lineId)),
    preparedAt: iso(input.preparedAt || input.prepared_at),
    preparedBy,
    approval: approvalInput ? {
      decisionReferenceId: text(approvalInput.decisionReferenceId || approvalInput.decision_reference_id),
      summary: text(approvalInput.summary),
      approvedAt: iso(approvalInput.approvedAt || approvalInput.approved_at),
      approvedBy: actor(approvalInput.approvedBy || approvalInput.approved_by),
    } : null,
    asOf,
    persistencePerformed: input.persistencePerformed === true || input.persistence_performed === true,
    paymentPerformed: input.paymentPerformed === true || input.payment_performed === true,
    trustPostingPerformed: input.trustPostingPerformed === true || input.trust_posting_performed === true,
    statementIssued: input.statementIssued === true || input.statement_issued === true,
    registrationUpdated: input.registrationUpdated === true || input.registration_updated === true,
  }
  model.summary = buildSummary(model)
  model.assessment = assess(model)
  model.fingerprint = buildConveyancerFinancialModelFingerprint(model)
  return model
}

function authorised(value, capability, lane, includeOperational = true) {
  return Boolean(value.userId && canConveyancerFinancialActor(value.role, capability) && isConveyancerFinancialLaneAuthorised(value.role, lane, { includeOperational }))
}

export function validateConveyancerFinancialModel(input = {}, { asOf } = {}) {
  const assessedAt = iso(asOf || input.asOf || input.as_of || input.approval?.approvedAt || input.approval?.approved_at || input.preparedAt || input.prepared_at) || new Date().toISOString()
  const model = normalizedModel(input, assessedAt)
  const errors = []
  if (model.modelVersion !== CONVEYANCER_FINANCIAL_MODEL_VERSION) errors.push('financial_model_version_invalid')
  if (!model.financialModelId) errors.push('financial_model_id_required')
  if (!Number.isInteger(model.revision) || model.revision < 1) errors.push('financial_model_revision_invalid')
  if (model.revision > 1 && (!model.previousFinancialModelId || !model.previousFingerprint || !model.changeReason)) errors.push('financial_model_supersession_evidence_required')
  if (model.revision === 1 && (model.previousFinancialModelId || model.previousFingerprint)) errors.push('initial_financial_model_cannot_supersede')
  if (!model.planId || !Number.isInteger(model.planVersion) || model.planVersion < 1) errors.push('matter_plan_reference_invalid')
  if (!model.transactionId || !model.organisationId) errors.push('financial_model_matter_binding_required')
  if (!LANES.has(model.lane)) errors.push('financial_model_lane_invalid')
  if (model.currency !== 'ZAR') errors.push('financial_model_currency_not_supported')
  if (!Number.isSafeInteger(model.consideration.purchasePriceMinor) || model.consideration.purchasePriceMinor < 0) errors.push('purchase_price_invalid')
  if (!TAX_TREATMENTS.has(model.consideration.taxTreatment)) errors.push('tax_treatment_invalid')
  if (!CONSIDERATION_SOURCE_TYPES.has(model.consideration.source.type) || !model.consideration.source.referenceId || !sha(model.consideration.source.evidenceHash) || !model.consideration.source.effectiveAt) errors.push('purchase_price_source_invalid')
  if (!model.preparedAt || !authorised(model.preparedBy, CAP.capture, model.lane)) errors.push('financial_model_preparer_not_authorised')
  if (model.preparedAt && new Date(model.preparedAt) > new Date(model.asOf)) errors.push('financial_model_prepared_in_future')

  const lineIds = model.lines.map((line) => line.lineId)
  if (lineIds.some((lineId, index) => !lineId || lineIds.indexOf(lineId) !== index)) errors.push('financial_line_ids_invalid')
  for (const line of model.lines) {
    const suffix = line.lineId || 'unknown'
    if (!LINE_CLASSES.has(line.lineClass)) errors.push(`financial_line_class_invalid:${suffix}`)
    if (!LINE_TYPES.has(line.lineType)) errors.push(`financial_line_type_invalid:${suffix}`)
    if (!line.label || !PARTY_ROLES.has(line.liableParty) || !PARTY_ROLES.has(line.recipientParty) || line.liableParty === line.recipientParty) errors.push(`financial_line_parties_invalid:${suffix}`)
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) errors.push(`financial_line_amount_invalid:${suffix}`)
    if (!LINE_STATUSES.has(line.status)) errors.push(`financial_line_status_invalid:${suffix}`)
    if (!SOURCE_TYPES.has(line.source.type)) errors.push(`financial_line_source_type_invalid:${suffix}`)
    if (EVIDENCED_STATUSES.has(line.status) && (!line.source.referenceId || !sha(line.source.evidenceHash) || !line.source.effectiveAt)) errors.push(`financial_line_evidence_invalid:${suffix}`)
    if (line.source.effectiveAt && new Date(line.source.effectiveAt) > new Date(model.asOf)) errors.push(`financial_line_source_in_future:${suffix}`)
    const hasTaxSplit = line.netAmountMinor !== null || line.vatAmountMinor !== null
    if (hasTaxSplit && (!Number.isSafeInteger(line.netAmountMinor) || line.netAmountMinor < 0 || !Number.isSafeInteger(line.vatAmountMinor) || line.vatAmountMinor < 0 || line.netAmountMinor + line.vatAmountMinor !== line.amountMinor)) errors.push(`financial_line_tax_split_invalid:${suffix}`)
    if (line.lineType === CONVEYANCER_FINANCIAL_LINE_TYPES.adjustment && (!line.reason || !line.decisionReferenceId)) errors.push(`financial_adjustment_authority_required:${suffix}`)
    if (line.status === LS.reversed && (!line.reason || !line.decisionReferenceId)) errors.push(`financial_reversal_authority_required:${suffix}`)
    if (line.lineClass === L.funding && line.liableParty !== CONVEYANCER_FINANCIAL_PARTY_ROLES.buyer) errors.push(`financial_funding_must_be_for_buyer:${suffix}`)
    if (line.lineClass === L.funding && !FUNDING_TYPES.has(line.lineType)) errors.push(`financial_funding_type_invalid:${suffix}`)
    if (line.lineClass !== L.funding && FUNDING_TYPES.has(line.lineType)) errors.push(`financial_non_funding_type_invalid:${suffix}`)
    if (line.lineClass === L.buyerCharge && line.liableParty !== CONVEYANCER_FINANCIAL_PARTY_ROLES.buyer) errors.push(`financial_buyer_charge_party_invalid:${suffix}`)
    if (line.lineClass === L.sellerDeduction && line.liableParty !== CONVEYANCER_FINANCIAL_PARTY_ROLES.seller) errors.push(`financial_seller_deduction_party_invalid:${suffix}`)
    if (line.lineClass === L.buyerCredit && line.recipientParty !== CONVEYANCER_FINANCIAL_PARTY_ROLES.buyer) errors.push(`financial_buyer_credit_party_invalid:${suffix}`)
    if (line.lineClass === L.sellerCredit && line.recipientParty !== CONVEYANCER_FINANCIAL_PARTY_ROLES.seller) errors.push(`financial_seller_credit_party_invalid:${suffix}`)
  }

  if (model.approval) {
    if (!model.approval.decisionReferenceId || !model.approval.summary || !model.approval.approvedAt || !authorised(model.approval.approvedBy, CAP.approve, model.lane, false)) errors.push('financial_model_approval_invalid')
    if (model.approval.approvedBy.userId === model.preparedBy.userId) errors.push('independent_financial_approval_required')
    if (model.approval.approvedAt && (new Date(model.approval.approvedAt) < new Date(model.preparedAt) || new Date(model.approval.approvedAt) > new Date(model.asOf))) errors.push('financial_model_approval_chronology_invalid')
    if (model.assessment.blockers.length || model.assessment.reviewItems.filter((item) => item !== 'independent_legal_approval_required').length) errors.push('financial_model_not_approvable')
  }
  if (!MODEL_STATUSES.has(model.assessment.status)) errors.push('financial_model_assessment_status_invalid')
  if (Object.values(model.summary).some((value) => !Number.isSafeInteger(value))) errors.push('financial_model_summary_overflow')
  if (input.summary && JSON.stringify(stable(input.summary)) !== JSON.stringify(stable(model.summary))) errors.push('financial_model_summary_stale')
  if (input.assessment && JSON.stringify(stable(input.assessment)) !== JSON.stringify(stable(model.assessment))) errors.push('financial_model_assessment_stale')
  if (input.fingerprint && input.fingerprint !== model.fingerprint) errors.push('financial_model_fingerprint_invalid')
  if (model.persistencePerformed || model.paymentPerformed || model.trustPostingPerformed || model.statementIssued || model.registrationUpdated) errors.push('financial_model_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), model })
}

export function buildConveyancerFinancialModel(input = {}, options = {}) {
  const validation = validateConveyancerFinancialModel(input, options)
  if (!validation.valid) return deepFreeze({ ok: false, code: 'financial_model_contract_invalid', errors: validation.errors, model: validation.model })
  return deepFreeze({ ok: true, code: validation.model.assessment.status, errors: [], model: validation.model })
}

export function compareConveyancerFinancialModelRevision(previousInput = {}, nextInput = {}) {
  const previous = validateConveyancerFinancialModel(previousInput)
  const next = validateConveyancerFinancialModel(nextInput)
  const errors = [...previous.errors.map((error) => `previous:${error}`), ...next.errors.map((error) => `next:${error}`)]
  if (previous.valid && next.valid) {
    if (next.model.revision !== previous.model.revision + 1) errors.push('financial_model_revision_must_increment')
    if (next.model.previousFinancialModelId !== previous.model.financialModelId || next.model.previousFingerprint !== previous.model.fingerprint) errors.push('financial_model_supersession_binding_invalid')
    if (next.model.transactionId !== previous.model.transactionId || next.model.organisationId !== previous.model.organisationId || next.model.planId !== previous.model.planId || next.model.planVersion !== previous.model.planVersion || next.model.lane !== previous.model.lane || next.model.currency !== previous.model.currency) errors.push('financial_model_matter_binding_changed')
    if (next.model.preparedAt && previous.model.preparedAt && new Date(next.model.preparedAt) <= new Date(previous.model.preparedAt)) errors.push('financial_model_revision_chronology_invalid')
  }
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), previous: previous.model, next: next.model })
}
