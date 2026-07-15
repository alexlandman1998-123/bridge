import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_FINANCIAL_LINE_CLASSES as LC,
  CONVEYANCER_FINANCIAL_LINE_STATUSES as LS,
  CONVEYANCER_FINANCIAL_LINE_TYPES as LT,
  CONVEYANCER_FINANCIAL_MODEL_STATUSES,
  parseConveyancerMoneyToMinor,
  validateConveyancerFinancialModel,
} from '../../core/transactions/conveyancerFinancialModel.js'

export const CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION = 'conveyancer_financial_reconciliation_v1'

export const CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES = Object.freeze({
  pendingReview: 'pending_review',
  reconciliationRecommended: 'reconciliation_recommended',
  changesRequested: 'changes_requested',
  reconciled: 'reconciled',
  rejected: 'rejected',
})

export const CONVEYANCER_FINANCIAL_RECONCILIATION_COMMANDS = Object.freeze({
  recommend: 'recommend_reconciliation',
  requestCorrection: 'request_correction',
  approve: 'approve_reconciliation',
  reject: 'reject_reconciliation',
})

export const CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES = Object.freeze({
  view: 'view',
  prepare: 'prepare',
  review: 'review',
  approve: 'approve',
})

export const CONVEYANCER_FINANCIAL_RECONCILIATION_ENTRY_KINDS = Object.freeze({
  cash: 'cash',
  instrument: 'instrument',
})

export const CONVEYANCER_FINANCIAL_RECONCILIATION_DIRECTIONS = Object.freeze({
  inflow: 'inflow',
  outflow: 'outflow',
})

export const CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS = Object.freeze([
  Object.freeze({ key: 'source_model', label: 'The exact approved D5 model is bound.' }),
  Object.freeze({ key: 'statement_integrity', label: 'Cash evidence reconciles opening to closing balance.' }),
  Object.freeze({ key: 'funding_coverage', label: 'Every funding target is fully evidenced.' }),
  Object.freeze({ key: 'cost_coverage', label: 'Buyer-cost collection and disbursement targets are fully evidenced.' }),
  Object.freeze({ key: 'seller_position', label: 'Seller proceeds, deductions and credits are fully evidenced.' }),
  Object.freeze({ key: 'entry_allocation', label: 'Every actual entry is allocated exactly once in value.' }),
  Object.freeze({ key: 'direction_and_mode', label: 'Allocations use the expected cash/instrument mode and direction.' }),
  Object.freeze({ key: 'evidence_provenance', label: 'Statement, entry and allocation provenance is complete.' }),
])

const STATUS = CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES
const COMMAND = CONVEYANCER_FINANCIAL_RECONCILIATION_COMMANDS
const CAP = CONVEYANCER_FINANCIAL_RECONCILIATION_CAPABILITIES
const KIND = CONVEYANCER_FINANCIAL_RECONCILIATION_ENTRY_KINDS
const DIRECTION = CONVEYANCER_FINANCIAL_RECONCILIATION_DIRECTIONS
const STATUSES = new Set(Object.values(STATUS))
const COMMANDS = new Set(Object.values(COMMAND))
const KINDS = new Set(Object.values(KIND))
const DIRECTIONS = new Set(Object.values(DIRECTION))
const TERMINAL = new Set([STATUS.changesRequested, STATUS.reconciled, STATUS.rejected])
const ENTRY_SOURCE_TYPES = new Set(['trust_statement', 'bank_statement', 'payment_confirmation', 'receipt', 'guarantee', 'bank_confirmation'])

export const CONVEYANCER_FINANCIAL_RECONCILIATION_ROLE_CAPABILITIES = Object.freeze({
  [R.secretary]: Object.freeze([CAP.view]),
  [R.accounts]: Object.freeze([CAP.view, CAP.prepare]),
  [R.conveyancer]: Object.freeze(Object.values(CAP)),
  [R.transferAttorney]: Object.freeze(Object.values(CAP)),
  [R.bondAttorney]: Object.freeze(Object.values(CAP)),
  [R.cancellationAttorney]: Object.freeze(Object.values(CAP)),
  [R.firmManager]: Object.freeze(Object.values(CAP)),
  [R.system]: Object.freeze([CAP.view]),
  [R.client]: Object.freeze([]),
  [R.externalParty]: Object.freeze([]),
})

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '') }
function iso(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null }
function sha(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function unique(values = []) { return [...new Set(values.filter(Boolean))] }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) }
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
function money(input = {}, minorKey = 'amountMinor', amountKey = 'amount') {
  const direct = input[minorKey] ?? input[minorKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
  if (direct !== undefined && direct !== null && direct !== '') {
    const parsed = Number(direct)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
  }
  return parseConveyancerMoneyToMinor(input[amountKey] ?? input[amountKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)])
}
function fail(code, errors = []) { return deepFreeze({ ok: false, duplicate: false, code, errors: unique(errors), reconciliation: null, event: null }) }

export function getConveyancerFinancialReconciliationCapabilities(role) {
  return CONVEYANCER_FINANCIAL_RECONCILIATION_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([])
}

export function canConveyancerFinancialReconciliationActor(role, capability) {
  return getConveyancerFinancialReconciliationCapabilities(role).includes(key(capability))
}

function laneAuthorised(role, lane, includeAccounts = true) {
  const normalized = normalizeMatterPlanOwnerRole(role)
  if (normalized === R.firmManager) return true
  if (includeAccounts && normalized === R.accounts) return ['transfer', 'bond', 'cancellation'].includes(lane)
  if (lane === 'transfer') return [R.conveyancer, R.transferAttorney].includes(normalized)
  if (lane === 'bond') return normalized === R.bondAttorney
  if (lane === 'cancellation') return normalized === R.cancellationAttorney
  return false
}

function authorised(input, capability, lane, includeAccounts = true) {
  const value = actor(input)
  return Boolean(value.userId && canConveyancerFinancialReconciliationActor(value.role, capability) && laneAuthorised(value.role, lane, includeAccounts))
}

function modelBinding(model) {
  return {
    financialModelId: model.financialModelId,
    financialModelRevision: model.revision,
    financialModelFingerprint: model.fingerprint,
    planId: model.planId,
    planVersion: model.planVersion,
    transactionId: model.transactionId,
    organisationId: model.organisationId,
    lane: model.lane,
    currency: model.currency,
    purchasePriceMinor: model.summary.purchasePriceMinor,
    buyerTotalExposureMinor: model.summary.buyerTotalExposureMinor,
    sellerNetProceedsMinor: model.summary.sellerNetProceedsMinor,
    approvedAt: model.approval.approvedAt,
    approvedBy: model.approval.approvedBy,
  }
}

function instrumentFunding(line) {
  return [LT.guarantee, LT.bondProceeds].includes(line.lineType) && line.status === LS.confirmed && ['guarantee', 'bank_confirmation'].includes(line.source.type)
}

export function buildConveyancerFinancialReconciliationTargets(model = {}) {
  const targets = []
  const add = (targetId, targetType, sourceLineId, direction, entryKind, amountMinor, partyRole) => {
    if (Number.isSafeInteger(amountMinor) && amountMinor > 0) targets.push({ targetId, targetType, sourceLineId, direction, entryKind, amountMinor, partyRole })
  }
  const active = (model.lines || []).filter((line) => line.status !== LS.reversed)
  for (const line of active) {
    if (line.lineClass === LC.funding) add(`line:${line.lineId}`, 'funding', line.lineId, DIRECTION.inflow, instrumentFunding(line) ? KIND.instrument : KIND.cash, line.amountMinor, line.liableParty)
    if (line.lineClass === LC.buyerCharge) {
      add(`line:${line.lineId}:collection`, 'buyer_cost_collection', line.lineId, DIRECTION.inflow, KIND.cash, line.amountMinor, line.liableParty)
      add(`line:${line.lineId}:disbursement`, 'buyer_cost_disbursement', line.lineId, DIRECTION.outflow, KIND.cash, line.amountMinor, line.recipientParty)
    }
    if (line.lineClass === LC.sellerDeduction) add(`line:${line.lineId}`, 'seller_deduction', line.lineId, DIRECTION.outflow, KIND.cash, line.amountMinor, line.recipientParty)
    if (line.lineClass === LC.buyerCredit) add(`line:${line.lineId}`, 'buyer_credit', line.lineId, DIRECTION.outflow, KIND.cash, line.amountMinor, line.recipientParty)
    if (line.lineClass === LC.sellerCredit) add(`line:${line.lineId}`, 'seller_credit', line.lineId, DIRECTION.outflow, KIND.cash, line.amountMinor, line.recipientParty)
  }
  const baseSellerProceeds = model.summary.purchasePriceMinor - model.summary.sellerDeductionsMinor
  add('position:seller_base_proceeds', 'seller_base_proceeds', null, DIRECTION.outflow, KIND.cash, baseSellerProceeds, 'seller')
  return deepFreeze(targets.sort((left, right) => left.targetId.localeCompare(right.targetId)))
}

function normalizeStatement(input = {}) {
  return {
    statementId: text(input.statementId || input.statement_id),
    accountReferenceHash: text(input.accountReferenceHash || input.account_reference_hash).toLowerCase(),
    periodStart: iso(input.periodStart || input.period_start),
    periodEnd: iso(input.periodEnd || input.period_end),
    openingBalanceMinor: money(input, 'openingBalanceMinor', 'openingBalance'),
    closingBalanceMinor: money(input, 'closingBalanceMinor', 'closingBalance'),
    evidenceHash: text(input.evidenceHash || input.evidence_hash).toLowerCase(),
    capturedAt: iso(input.capturedAt || input.captured_at),
    capturedBy: actor(input.capturedBy || input.captured_by),
  }
}

function normalizeEntry(input = {}) {
  return {
    entryId: text(input.entryId || input.entry_id),
    entryKind: key(input.entryKind || input.entry_kind),
    direction: key(input.direction),
    amountMinor: money(input),
    occurredAt: iso(input.occurredAt || input.occurred_at),
    sourceType: key(input.sourceType || input.source_type),
    sourceReferenceHash: text(input.sourceReferenceHash || input.source_reference_hash).toLowerCase(),
    evidenceHash: text(input.evidenceHash || input.evidence_hash).toLowerCase(),
  }
}

function normalizeAllocation(input = {}) {
  return {
    allocationId: text(input.allocationId || input.allocation_id),
    entryId: text(input.entryId || input.entry_id),
    targetId: text(input.targetId || input.target_id),
    amountMinor: money(input),
    evidenceReferenceId: text(input.evidenceReferenceId || input.evidence_reference_id),
  }
}

function evaluate(targets, statement, entries, allocations) {
  const entryById = new Map(entries.map((entry) => [entry.entryId, entry]))
  const targetById = new Map(targets.map((target) => [target.targetId, target]))
  const targetResults = targets.map((target) => {
    const matches = allocations.filter((allocation) => allocation.targetId === target.targetId)
    const allocatedMinor = matches.reduce((total, item) => total + (item.amountMinor || 0), 0)
    const compatible = matches.every((item) => {
      const entry = entryById.get(item.entryId)
      return entry && entry.direction === target.direction && entry.entryKind === target.entryKind
    })
    return { ...target, allocatedMinor, varianceMinor: allocatedMinor - target.amountMinor, compatible, allocationCount: matches.length }
  })
  const entryResults = entries.map((entry) => {
    const matches = allocations.filter((allocation) => allocation.entryId === entry.entryId)
    const allocatedMinor = matches.reduce((total, item) => total + (item.amountMinor || 0), 0)
    return { entryId: entry.entryId, amountMinor: entry.amountMinor, allocatedMinor, varianceMinor: allocatedMinor - entry.amountMinor, allocationCount: matches.length }
  })
  const cashEntries = entries.filter((entry) => entry.entryKind === KIND.cash)
  const cashInflowsMinor = cashEntries.filter((entry) => entry.direction === DIRECTION.inflow).reduce((total, entry) => total + entry.amountMinor, 0)
  const cashOutflowsMinor = cashEntries.filter((entry) => entry.direction === DIRECTION.outflow).reduce((total, entry) => total + entry.amountMinor, 0)
  const calculatedClosingBalanceMinor = statement.openingBalanceMinor + cashInflowsMinor - cashOutflowsMinor
  const statementVarianceMinor = calculatedClosingBalanceMinor - statement.closingBalanceMinor
  const unknownAllocations = allocations.filter((item) => !entryById.has(item.entryId) || !targetById.has(item.targetId)).map((item) => item.allocationId)
  const checks = [
    { key: 'source_model', passed: true, detail: 'Approved D5 fingerprint bound.' },
    { key: 'statement_integrity', passed: statementVarianceMinor === 0, detail: `Statement variance: ${statementVarianceMinor} minor units.` },
    { key: 'funding_coverage', passed: targetResults.filter((item) => item.targetType === 'funding').every((item) => item.varianceMinor === 0), detail: 'Funding targets compared.' },
    { key: 'cost_coverage', passed: targetResults.filter((item) => item.targetType.startsWith('buyer_cost') || item.targetType === 'buyer_credit').every((item) => item.varianceMinor === 0), detail: 'Buyer cost, collection and credit targets compared.' },
    { key: 'seller_position', passed: targetResults.filter((item) => item.targetType.startsWith('seller_')).every((item) => item.varianceMinor === 0), detail: 'Seller targets compared.' },
    { key: 'entry_allocation', passed: !unknownAllocations.length && entryResults.every((item) => item.varianceMinor === 0) && targetResults.every((item) => item.varianceMinor === 0), detail: 'Entry and target allocations compared.' },
    { key: 'direction_and_mode', passed: targetResults.every((item) => item.compatible), detail: 'Entry direction and kind compared.' },
    { key: 'evidence_provenance', passed: true, detail: 'Structurally valid evidence supplied.' },
  ].map((item) => ({ ...item, status: item.passed ? 'passed' : 'failed' }))
  const findings = checks.filter((item) => item.status === 'failed').map((item) => ({ findingId: `finding:${item.key}`, checkKey: item.key, severity: ['statement_integrity', 'entry_allocation', 'direction_and_mode'].includes(item.key) ? 'critical' : 'major', detail: item.detail }))
  return { targetResults, entryResults, statementVarianceMinor, cashInflowsMinor, cashOutflowsMinor, checks, findings }
}

function sourceSnapshot(value = {}) {
  return stable({ version: value.version, reconciliationId: value.reconciliationId, financialModel: value.financialModel, statement: value.statement, entries: value.entries, allocations: value.allocations, targetResults: value.targetResults, entryResults: value.entryResults, statementVarianceMinor: value.statementVarianceMinor, cashInflowsMinor: value.cashInflowsMinor, cashOutflowsMinor: value.cashOutflowsMinor, checks: value.checks, findings: value.findings, startedAt: value.startedAt, startedBy: value.startedBy, startCommandId: value.startCommandId })
}

export function buildConveyancerFinancialReconciliationBindingFingerprint(value = {}) { return fnv(sourceSnapshot(value)) }

function runtimeSnapshot(value = {}) { return stable({ status: value.status, recommendation: value.recommendation, decision: value.decision, runtimeRevision: value.runtimeRevision, updatedAt: value.updatedAt, lastEventId: value.lastEventId }) }
function auditRuntimeSnapshot(value = {}) { return stable({ status: value.status, recommendation: value.recommendation ? { recommendedAt: value.recommendation.recommendedAt, recommendedBy: value.recommendation.recommendedBy, controls: value.recommendation.controls } : null, decision: value.decision ? { type: value.decision.type, reasonCode: value.decision.reasonCode || null, decidedAt: value.decision.decidedAt, decidedBy: value.decision.decidedBy } : null, runtimeRevision: value.runtimeRevision, updatedAt: value.updatedAt, lastEventId: value.lastEventId }) }
export function buildConveyancerFinancialReconciliationFingerprint(value = {}) { return fnv({ bindingFingerprint: value.bindingFingerprint, runtime: runtimeSnapshot(value) }) }

function validateReconciliation(value = {}) {
  const errors = []
  if (value.version !== CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION) errors.push('financial_reconciliation_version_invalid')
  if (!value.reconciliationId || !value.financialModel?.financialModelId || !value.statement?.statementId) errors.push('financial_reconciliation_identity_required')
  if (!STATUSES.has(value.status)) errors.push('financial_reconciliation_status_invalid')
  if (!authorised(value.startedBy, CAP.prepare, value.financialModel?.lane)) errors.push('financial_reconciliation_starter_invalid')
  if (!value.startedAt || !value.startCommandId || !Number.isInteger(value.runtimeRevision) || value.runtimeRevision < 1 || !value.updatedAt || !value.lastEventId) errors.push('financial_reconciliation_runtime_invalid')
  const statement = value.statement || {}
  if (!statement.statementId || !sha(statement.accountReferenceHash) || !statement.periodStart || !statement.periodEnd || new Date(statement.periodEnd) < new Date(statement.periodStart) || !Number.isSafeInteger(statement.openingBalanceMinor) || !Number.isSafeInteger(statement.closingBalanceMinor) || !sha(statement.evidenceHash) || !statement.capturedAt || !authorised(statement.capturedBy, CAP.prepare, value.financialModel?.lane)) errors.push('financial_reconciliation_statement_invalid')
  const entries = Array.isArray(value.entries) ? value.entries : []
  const entryIds = entries.map((item) => item.entryId)
  const entryReferences = entries.map((item) => item.sourceReferenceHash)
  if (!entries.length || entryIds.some((item, index) => !item || entryIds.indexOf(item) !== index) || entryReferences.some((item, index) => !sha(item) || entryReferences.indexOf(item) !== index)) errors.push('financial_reconciliation_entries_invalid')
  for (const item of entries) {
    const cashSourceValid = item.entryKind !== KIND.cash || ['trust_statement', 'bank_statement', 'payment_confirmation', 'receipt'].includes(item.sourceType)
    const instrumentSourceValid = item.entryKind !== KIND.instrument || ['guarantee', 'bank_confirmation'].includes(item.sourceType)
    if (!KINDS.has(item.entryKind) || !DIRECTIONS.has(item.direction) || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !item.occurredAt || new Date(item.occurredAt) < new Date(statement.periodStart) || new Date(item.occurredAt) > new Date(statement.periodEnd) || !ENTRY_SOURCE_TYPES.has(item.sourceType) || !cashSourceValid || !instrumentSourceValid || !sha(item.evidenceHash)) errors.push(`financial_reconciliation_entry_invalid:${item.entryId || 'unknown'}`)
  }
  const allocations = Array.isArray(value.allocations) ? value.allocations : []
  const allocationIds = allocations.map((item) => item.allocationId)
  if (!allocations.length || allocationIds.some((item, index) => !item || allocationIds.indexOf(item) !== index) || allocations.some((item) => !item.entryId || !item.targetId || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !item.evidenceReferenceId)) errors.push('financial_reconciliation_allocations_invalid')
  if (!Array.isArray(value.checks) || value.checks.length !== CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS.length || value.checks.some((item) => !['passed', 'failed'].includes(item.status))) errors.push('financial_reconciliation_checks_invalid')
  if (!Array.isArray(value.findings) || value.findings.some((item) => !item.findingId || !item.checkKey || !['critical', 'major'].includes(item.severity))) errors.push('financial_reconciliation_findings_invalid')
  const recomputed = Array.isArray(value.targetResults) ? evaluate(value.targetResults.map(({ targetId, targetType, sourceLineId, direction, entryKind, amountMinor, partyRole }) => ({ targetId, targetType, sourceLineId, direction, entryKind, amountMinor, partyRole })), statement, entries, allocations) : null
  if (!recomputed || JSON.stringify(stable({ targetResults: value.targetResults, entryResults: value.entryResults, statementVarianceMinor: value.statementVarianceMinor, cashInflowsMinor: value.cashInflowsMinor, cashOutflowsMinor: value.cashOutflowsMinor, checks: value.checks, findings: value.findings })) !== JSON.stringify(stable(recomputed))) errors.push('financial_reconciliation_derivation_invalid')
  const recommendationRequired = [STATUS.reconciliationRecommended, STATUS.reconciled].includes(value.status)
  const controlKeys = Object.keys(value.recommendation?.controls || {}).sort()
  const expectedControlKeys = CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS.map((item) => item.key).sort()
  if (recommendationRequired && (!value.recommendation?.summary || !value.recommendation?.recommendedAt || !authorised(value.recommendation?.recommendedBy, CAP.prepare, value.financialModel?.lane) || JSON.stringify(controlKeys) !== JSON.stringify(expectedControlKeys) || Object.values(value.recommendation.controls).some((item) => item !== true))) errors.push('financial_reconciliation_recommendation_invalid')
  if ([STATUS.changesRequested, STATUS.rejected, STATUS.reconciled].includes(value.status) && (!value.decision?.decisionReferenceId || !value.decision?.summary || !value.decision?.decidedAt || !authorised(value.decision?.decidedBy, value.status === STATUS.reconciled ? CAP.approve : CAP.review, value.financialModel?.lane, false))) errors.push('financial_reconciliation_decision_invalid')
  if ([STATUS.changesRequested, STATUS.rejected].includes(value.status) && !value.decision?.reasonCode) errors.push('financial_reconciliation_negative_decision_invalid')
  if ([STATUS.pendingReview, STATUS.reconciliationRecommended].includes(value.status) && value.decision) errors.push('financial_reconciliation_decision_not_allowed')
  if (value.status === STATUS.reconciled && [value.startedBy?.userId, value.recommendation?.recommendedBy?.userId].includes(value.decision?.decidedBy?.userId)) errors.push('independent_financial_reconciliation_approval_required')
  if (value.bindingFingerprint !== buildConveyancerFinancialReconciliationBindingFingerprint(value)) errors.push('financial_reconciliation_binding_fingerprint_invalid')
  if (value.fingerprint !== buildConveyancerFinancialReconciliationFingerprint(value)) errors.push('financial_reconciliation_fingerprint_invalid')
  if (value.persistencePerformed || value.paymentPerformed || value.trustPostingPerformed || value.statementIssued || value.registrationUpdated) errors.push('financial_reconciliation_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), reconciliation: value })
}

export function validateConveyancerFinancialReconciliation(input = {}) { return validateReconciliation(clone(input)) }

function event(reconciliation, { commandId, commandType, commandFingerprint = null, performedBy, occurredAt, before }) {
  const eventId = `financial_reconciliation_event:${reconciliation.reconciliationId}:${reconciliation.runtimeRevision}:${commandId}`
  reconciliation.lastEventId = eventId
  return deepFreeze({ version: CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION, eventId, eventType: commandType === 'start_reconciliation' ? 'financial_reconciliation_started' : `financial_reconciliation_${commandType}`, commandId, commandType, commandFingerprint, reconciliationId: reconciliation.reconciliationId, financialModelId: reconciliation.financialModel.financialModelId, transactionId: reconciliation.financialModel.transactionId, lane: reconciliation.financialModel.lane, bindingFingerprint: reconciliation.bindingFingerprint, occurredAt, performedBy, before, after: auditRuntimeSnapshot(reconciliation), reconciliationRevision: reconciliation.runtimeRevision, persistencePerformed: false, paymentPerformed: false, trustPostingPerformed: false, statementIssued: false, registrationUpdated: false })
}

export function startConveyancerFinancialReconciliation({ financialModel: inputModel = {}, statement: inputStatement = {}, entries: inputEntries = [], allocations: inputAllocations = [], actor: inputActor = {}, occurredAt = '', commandId = '', existingReconciliations = [] } = {}) {
  const startedAt = iso(occurredAt)
  const resolvedCommandId = text(commandId)
  if (!startedAt || !resolvedCommandId) return fail('valid_financial_reconciliation_start_required')
  const modelValidation = validateConveyancerFinancialModel(inputModel)
  if (!modelValidation.valid) return fail('d5_financial_model_invalid', modelValidation.errors)
  const model = modelValidation.model
  if (model.assessment.status !== CONVEYANCER_FINANCIAL_MODEL_STATUSES.ready || !model.approval) return fail('approved_ready_d5_financial_model_required')
  const starter = actor(inputActor)
  if (!authorised(starter, CAP.prepare, model.lane)) return fail('financial_reconciliation_start_not_authorised')
  const statement = normalizeStatement(inputStatement)
  const entries = (Array.isArray(inputEntries) ? inputEntries : []).map(normalizeEntry).sort((left, right) => left.entryId.localeCompare(right.entryId))
  const allocations = (Array.isArray(inputAllocations) ? inputAllocations : []).map(normalizeAllocation).sort((left, right) => left.allocationId.localeCompare(right.allocationId))
  const structuralErrors = []
  if (!statement.statementId || !sha(statement.accountReferenceHash) || !statement.periodStart || !statement.periodEnd || new Date(statement.periodEnd) < new Date(statement.periodStart) || !Number.isSafeInteger(statement.openingBalanceMinor) || !Number.isSafeInteger(statement.closingBalanceMinor) || !sha(statement.evidenceHash) || !statement.capturedAt || new Date(statement.capturedAt) > new Date(startedAt) || !authorised(statement.capturedBy, CAP.prepare, model.lane)) structuralErrors.push('financial_reconciliation_statement_invalid')
  const entryIds = entries.map((item) => item.entryId)
  const entryReferences = entries.map((item) => item.sourceReferenceHash)
  if (!entries.length || entryIds.some((item, index) => !item || entryIds.indexOf(item) !== index) || entryReferences.some((item, index) => !sha(item) || entryReferences.indexOf(item) !== index)) structuralErrors.push('financial_reconciliation_entry_identity_invalid')
  for (const item of entries) {
    const sourceValid = item.entryKind === KIND.instrument ? ['guarantee', 'bank_confirmation'].includes(item.sourceType) : ['trust_statement', 'bank_statement', 'payment_confirmation', 'receipt'].includes(item.sourceType)
    if (!KINDS.has(item.entryKind) || !DIRECTIONS.has(item.direction) || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !item.occurredAt || new Date(item.occurredAt) < new Date(statement.periodStart) || new Date(item.occurredAt) > new Date(statement.periodEnd) || !ENTRY_SOURCE_TYPES.has(item.sourceType) || !sourceValid || !sha(item.evidenceHash)) structuralErrors.push(`financial_reconciliation_entry_invalid:${item.entryId || 'unknown'}`)
  }
  const allocationIds = allocations.map((item) => item.allocationId)
  if (!allocations.length || allocationIds.some((item, index) => !item || allocationIds.indexOf(item) !== index)) structuralErrors.push('financial_reconciliation_allocation_identity_invalid')
  for (const item of allocations) if (!item.entryId || !item.targetId || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !item.evidenceReferenceId) structuralErrors.push(`financial_reconciliation_allocation_invalid:${item.allocationId || 'unknown'}`)
  if (structuralErrors.length) return fail('financial_reconciliation_evidence_invalid', structuralErrors)
  const targets = buildConveyancerFinancialReconciliationTargets(model)
  const evaluated = evaluate(targets, statement, entries, allocations)
  const reconciliationId = `financial_reconciliation:${model.financialModelId}:r${model.revision}`
  const proposed = { version: CONVEYANCER_FINANCIAL_RECONCILIATION_VERSION, reconciliationId, financialModel: modelBinding(model), statement, entries, allocations, ...evaluated, startedAt, startedBy: starter, startCommandId: resolvedCommandId }
  const duplicate = (Array.isArray(existingReconciliations) ? existingReconciliations : []).find((item) => (item.reconciliation || item).reconciliationId === reconciliationId)
  if (duplicate) {
    const existing = duplicate.reconciliation || duplicate
    if (existing.startCommandId !== resolvedCommandId || existing.startedBy?.userId !== starter.userId || existing.bindingFingerprint !== buildConveyancerFinancialReconciliationBindingFingerprint(proposed)) return fail('financial_reconciliation_start_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], reconciliation: clone(existing), event: clone(duplicate.event || null) })
  }
  const reconciliation = { ...proposed, status: STATUS.pendingReview, recommendation: null, decision: null, bindingFingerprint: null, fingerprint: null, runtimeRevision: 1, updatedAt: startedAt, lastEventId: null, persistencePerformed: false, paymentPerformed: false, trustPostingPerformed: false, statementIssued: false, registrationUpdated: false }
  reconciliation.bindingFingerprint = buildConveyancerFinancialReconciliationBindingFingerprint(reconciliation)
  const auditEvent = event(reconciliation, { commandId: resolvedCommandId, commandType: 'start_reconciliation', performedBy: starter, occurredAt: startedAt, before: { status: 'not_started', runtimeRevision: 0 } })
  reconciliation.fingerprint = buildConveyancerFinancialReconciliationFingerprint(reconciliation)
  const validation = validateReconciliation(reconciliation)
  if (!validation.valid) return fail('resulting_financial_reconciliation_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: evaluated.findings.length ? 'financial_reconciliation_started_with_findings' : 'financial_reconciliation_started', errors: [], reconciliation, event: auditEvent })
}

export function buildConveyancerFinancialReconciliationCommand(reconciliation = {}, type, payload = {}) {
  return { commandId: `${key(type)}:${reconciliation.runtimeRevision}`, type: key(type), expectedReconciliationId: reconciliation.reconciliationId, expectedRuntimeRevision: reconciliation.runtimeRevision, expectedFingerprint: reconciliation.fingerprint, ...payload }
}

function normalizeControls(input = {}) { return Object.fromEntries(CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS.map((item) => [item.key, input[item.key] === true])) }
function commandHash(type, command, performedBy) { const { commandId: _id, expectedFingerprint: _fingerprint, ...payload } = command; return fnv({ type, payload, performedBy }) }

function applyCommand(value, type, command, performedBy, occurredAt) {
  const lane = value.financialModel.lane
  if (type === COMMAND.recommend) {
    if (!authorised(performedBy, CAP.prepare, lane)) return 'financial_reconciliation_recommendation_not_authorised'
    if (value.status !== STATUS.pendingReview) return 'financial_reconciliation_not_pending_review'
    if (value.findings.length || value.checks.some((item) => item.status !== 'passed')) return 'financial_reconciliation_findings_require_new_evidence'
    const controls = normalizeControls(command.controls)
    if (Object.values(controls).some((item) => !item)) return 'financial_reconciliation_controls_incomplete'
    if (!text(command.summary)) return 'financial_reconciliation_summary_required'
    value.status = STATUS.reconciliationRecommended
    value.recommendation = { summary: text(command.summary), controls, recommendedAt: occurredAt, recommendedBy: performedBy }
    return null
  }
  if (type === COMMAND.requestCorrection || type === COMMAND.reject) {
    if (!authorised(performedBy, CAP.review, lane, false)) return 'financial_reconciliation_review_not_authorised'
    if (![STATUS.pendingReview, STATUS.reconciliationRecommended].includes(value.status)) return 'financial_reconciliation_not_reviewable'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    const summary = text(command.summary)
    if (!reasonCode || !decisionReferenceId || !summary) return 'financial_reconciliation_negative_decision_required'
    value.status = type === COMMAND.reject ? STATUS.rejected : STATUS.changesRequested
    value.decision = { type, reasonCode, decisionReferenceId, summary, decidedAt: occurredAt, decidedBy: performedBy }
    return null
  }
  if (type === COMMAND.approve) {
    if (!authorised(performedBy, CAP.approve, lane, false)) return 'financial_reconciliation_approval_not_authorised'
    if (value.status !== STATUS.reconciliationRecommended) return 'financial_reconciliation_recommendation_required'
    if ([value.startedBy.userId, value.recommendation?.recommendedBy?.userId].includes(performedBy.userId)) return 'independent_financial_reconciliation_approval_required'
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    const summary = text(command.summary)
    if (!decisionReferenceId || !summary) return 'financial_reconciliation_approval_evidence_required'
    value.status = STATUS.reconciled
    value.decision = { type, decisionReferenceId, summary, decidedAt: occurredAt, decidedBy: performedBy }
    return null
  }
  return 'financial_reconciliation_command_unsupported'
}

export function executeConveyancerFinancialReconciliation({ reconciliation: input = {}, command = {}, actor: inputActor = {}, occurredAt = '', existingEvents = [] } = {}) {
  const currentValidation = validateReconciliation(clone(input))
  if (!currentValidation.valid) return fail('financial_reconciliation_contract_invalid', currentValidation.errors)
  const current = currentValidation.reconciliation
  const type = key(command.type)
  const commandId = text(command.commandId || command.command_id)
  const performedBy = actor(inputActor)
  const at = iso(occurredAt)
  if (!COMMANDS.has(type) || !commandId) return fail('valid_financial_reconciliation_command_required')
  if (!at || new Date(at) < new Date(current.updatedAt)) return fail('financial_reconciliation_command_chronology_invalid')
  if (TERMINAL.has(current.status)) return fail('financial_reconciliation_terminal')
  if (text(command.expectedReconciliationId || command.expected_reconciliation_id) !== current.reconciliationId) return fail('stale_financial_reconciliation_id')
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== current.runtimeRevision) return fail('stale_financial_reconciliation_revision')
  if (text(command.expectedFingerprint || command.expected_fingerprint) !== current.fingerprint) return fail('stale_financial_reconciliation_fingerprint')
  const fingerprint = commandHash(type, command, performedBy)
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => item.commandId === commandId)
  if (duplicate) {
    if (duplicate.commandFingerprint !== fingerprint) return fail('financial_reconciliation_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], reconciliation: current, event: duplicate })
  }
  const value = clone(current)
  const before = auditRuntimeSnapshot(value)
  const error = applyCommand(value, type, command, performedBy, at)
  if (error) return fail(error)
  value.runtimeRevision += 1
  value.updatedAt = at
  const auditEvent = event(value, { commandId, commandType: type, commandFingerprint: fingerprint, performedBy, occurredAt: at, before })
  value.fingerprint = buildConveyancerFinancialReconciliationFingerprint(value)
  const validation = validateReconciliation(value)
  if (!validation.valid) return fail('resulting_financial_reconciliation_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: `financial_reconciliation_${type}_recorded`, errors: [], reconciliation: value, event: auditEvent })
}
