import {
  MATTER_PLAN_OWNER_ROLES as R,
  normalizeMatterPlanOwnerRole,
} from '../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_FINANCIAL_LINE_CLASSES as LC,
  CONVEYANCER_FINANCIAL_LINE_STATUSES as LS,
  CONVEYANCER_FINANCIAL_MODEL_STATUSES,
  validateConveyancerFinancialModel,
} from '../../core/transactions/conveyancerFinancialModel.js'
import { buildConveyancerGovernedContentHash } from './conveyancerCorrespondenceGenerator.js'
import {
  CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES,
  validateConveyancerFinancialReconciliation,
} from './conveyancerFinancialReconciliation.js'

export const CONVEYANCER_FINAL_ACCOUNT_VERSION = 'conveyancer_final_account_v1'

export const CONVEYANCER_FINAL_ACCOUNT_STATUSES = Object.freeze({
  pendingReview: 'pending_review',
  approvalRecommended: 'approval_recommended',
  changesRequested: 'changes_requested',
  approved: 'approved',
  rejected: 'rejected',
})

export const CONVEYANCER_FINAL_ACCOUNT_COMMANDS = Object.freeze({
  recommend: 'recommend_approval',
  requestCorrection: 'request_correction',
  approve: 'approve_final_account',
  reject: 'reject_final_account',
})

export const CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES = Object.freeze({
  view: 'view',
  prepare: 'prepare',
  review: 'review',
  approve: 'approve',
})

export const CONVEYANCER_FINAL_ACCOUNT_CONTROLS = Object.freeze([
  Object.freeze({ key: 'financial_model', label: 'The approved D5 financial model is bound.' }),
  Object.freeze({ key: 'reconciliation', label: 'The exact D6 reconciliation is legally approved.' }),
  Object.freeze({ key: 'buyer_account', label: 'Buyer obligations, credits, funding and refunds are complete.' }),
  Object.freeze({ key: 'seller_account', label: 'Seller consideration, deductions, credits and proceeds are complete.' }),
  Object.freeze({ key: 'zero_balance', label: 'Every final account closes to zero.' }),
  Object.freeze({ key: 'line_provenance', label: 'Every line retains its D5 or D6 source identity.' }),
  Object.freeze({ key: 'template_governance', label: 'The final-account presentation template is governed.' }),
  Object.freeze({ key: 'artifact_integrity', label: 'The renderer packet content hash is intact.' }),
])

const STATUS = CONVEYANCER_FINAL_ACCOUNT_STATUSES
const COMMAND = CONVEYANCER_FINAL_ACCOUNT_COMMANDS
const CAP = CONVEYANCER_FINAL_ACCOUNT_CAPABILITIES
const STATUSES = new Set(Object.values(STATUS))
const COMMANDS = new Set(Object.values(COMMAND))
const TERMINAL = new Set([STATUS.changesRequested, STATUS.approved, STATUS.rejected])
const PARTY_ROLES = new Set(['buyer', 'seller'])

export const CONVEYANCER_FINAL_ACCOUNT_ROLE_CAPABILITIES = Object.freeze({
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
function governedFingerprint(value) { return /^fnv1a_[a-f0-9]{8}$/i.test(text(value)) }
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
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}
function actor(input = {}) { return { role: normalizeMatterPlanOwnerRole(input.role), userId: text(input.userId || input.user_id) || null } }
function fail(code, errors = []) { return deepFreeze({ ok: false, duplicate: false, code, errors: unique(errors), finalAccount: null, event: null }) }

export function getConveyancerFinalAccountCapabilities(role) { return CONVEYANCER_FINAL_ACCOUNT_ROLE_CAPABILITIES[normalizeMatterPlanOwnerRole(role)] || Object.freeze([]) }
export function canConveyancerFinalAccountActor(role, capability) { return getConveyancerFinalAccountCapabilities(role).includes(key(capability)) }

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
  return Boolean(value.userId && canConveyancerFinalAccountActor(value.role, capability) && laneAuthorised(value.role, lane, includeAccounts))
}

function modelBinding(model) {
  return { financialModelId: model.financialModelId, revision: model.revision, fingerprint: model.fingerprint, planId: model.planId, planVersion: model.planVersion, transactionId: model.transactionId, organisationId: model.organisationId, lane: model.lane, currency: model.currency }
}

function reconciliationBinding(value) {
  return { reconciliationId: value.reconciliationId, runtimeRevision: value.runtimeRevision, fingerprint: value.fingerprint, bindingFingerprint: value.bindingFingerprint, financialModelId: value.financialModel.financialModelId, financialModelRevision: value.financialModel.financialModelRevision, financialModelFingerprint: value.financialModel.financialModelFingerprint, statementId: value.statement.statementId, approvedAt: value.decision.decidedAt, approvedBy: value.decision.decidedBy }
}

function line(accountRole, accountLineId, sourceType, sourceId, description, debitMinor, creditMinor) {
  return { accountLineId, accountRole, sourceType, sourceId, description, debitMinor, creditMinor }
}

function targetAmount(reconciliation, predicate) {
  return (reconciliation.targetResults || []).filter(predicate).reduce((total, item) => total + item.allocatedMinor, 0)
}

function account(accountRole, partyReferenceHash, lines, currency) {
  const totalDebitMinor = lines.reduce((total, item) => total + item.debitMinor, 0)
  const totalCreditMinor = lines.reduce((total, item) => total + item.creditMinor, 0)
  return { accountId: `final_account:${accountRole}`, accountRole, partyReferenceHash, currency, lines, totalDebitMinor, totalCreditMinor, balanceMinor: totalDebitMinor - totalCreditMinor }
}

export function buildConveyancerFinalAccountProjection({ financialModel: model = {}, reconciliation = {}, parties = {} } = {}) {
  const active = (model.lines || []).filter((item) => item.status !== LS.reversed)
  const buyerLines = [line('buyer', 'buyer:purchase_price', 'd5_consideration', 'consideration:purchase_price', 'Purchase consideration', model.summary.purchasePriceMinor, 0)]
  const sellerLines = [line('seller', 'seller:purchase_price', 'd5_consideration', 'consideration:purchase_price', 'Purchase consideration', 0, model.summary.purchasePriceMinor)]
  for (const item of active) {
    if (item.lineClass === LC.buyerCharge) buyerLines.push(line('buyer', `buyer:charge:${item.lineId}`, 'd5_line', item.lineId, item.label, item.amountMinor, 0))
    if (item.lineClass === LC.buyerCredit) buyerLines.push(line('buyer', `buyer:credit:${item.lineId}`, 'd5_line', item.lineId, item.label, 0, item.amountMinor))
    if (item.lineClass === LC.sellerDeduction) sellerLines.push(line('seller', `seller:deduction:${item.lineId}`, 'd5_line', item.lineId, item.label, item.amountMinor, 0))
    if (item.lineClass === LC.sellerCredit) sellerLines.push(line('seller', `seller:credit:${item.lineId}`, 'd5_line', item.lineId, item.label, 0, item.amountMinor))
  }
  for (const target of reconciliation.targetResults || []) {
    if (target.targetType === 'funding') buyerLines.push(line('buyer', `buyer:funding:${target.targetId}`, 'd6_target', target.targetId, 'Purchase funding reconciled', 0, target.allocatedMinor))
    if (target.targetType === 'buyer_cost_collection') buyerLines.push(line('buyer', `buyer:collection:${target.targetId}`, 'd6_target', target.targetId, 'Cost funding received', 0, target.allocatedMinor))
    if (target.targetType === 'buyer_credit') buyerLines.push(line('buyer', `buyer:refund:${target.targetId}`, 'd6_target', target.targetId, 'Credit paid to buyer', target.allocatedMinor, 0))
    if (target.targetType === 'seller_base_proceeds') sellerLines.push(line('seller', `seller:proceeds:${target.targetId}`, 'd6_target', target.targetId, 'Net base proceeds paid', target.allocatedMinor, 0))
    if (target.targetType === 'seller_credit') sellerLines.push(line('seller', `seller:credit_payment:${target.targetId}`, 'd6_target', target.targetId, 'Seller credit paid', target.allocatedMinor, 0))
  }
  const accounts = [
    account('buyer', text(parties.buyerPartyReferenceHash || parties.buyer_party_reference_hash).toLowerCase(), buyerLines, model.currency),
    account('seller', text(parties.sellerPartyReferenceHash || parties.seller_party_reference_hash).toLowerCase(), sellerLines, model.currency),
  ]
  return deepFreeze({ accounts, summary: { accountCount: accounts.length, lineCount: accounts.reduce((total, item) => total + item.lines.length, 0), buyerBalanceMinor: accounts[0].balanceMinor, sellerBalanceMinor: accounts[1].balanceMinor, allAccountsBalanced: accounts.every((item) => item.balanceMinor === 0), reconciledFundingMinor: targetAmount(reconciliation, (item) => item.targetType === 'funding'), reconciledSellerPayoutMinor: targetAmount(reconciliation, (item) => ['seller_base_proceeds', 'seller_credit'].includes(item.targetType)) } })
}

function normalizeTemplate(input = {}) {
  return { templateKey: key(input.templateKey || input.template_key), templateVersionId: text(input.templateVersionId || input.template_version_id), templateFingerprint: text(input.templateFingerprint || input.template_fingerprint), contentHash: text(input.contentHash || input.content_hash).toLowerCase(), outputFormat: key(input.outputFormat || input.output_format), locale: text(input.locale || 'en-ZA') }
}

function artifactSnapshot(value = {}) { return stable({ version: value.version, finalAccountId: value.finalAccountId, financialModel: value.financialModel, reconciliation: value.reconciliation, template: value.template, accounts: value.accounts, summary: value.summary, generatedAt: value.generatedAt }) }
export function buildConveyancerFinalAccountContentHash(value = {}) { return buildConveyancerGovernedContentHash(JSON.stringify(artifactSnapshot(value))) }

function sourceSnapshot(value = {}) { return stable({ ...artifactSnapshot(value), contentHash: value.contentHash, preparedAt: value.preparedAt, preparedBy: value.preparedBy, startCommandId: value.startCommandId }) }
export function buildConveyancerFinalAccountBindingFingerprint(value = {}) { return fnv(sourceSnapshot(value)) }
function runtimeSnapshot(value = {}) { return stable({ status: value.status, recommendation: value.recommendation, decision: value.decision, runtimeRevision: value.runtimeRevision, updatedAt: value.updatedAt, lastEventId: value.lastEventId }) }
function auditRuntimeSnapshot(value = {}) { return stable({ status: value.status, recommendation: value.recommendation ? { recommendedAt: value.recommendation.recommendedAt, recommendedBy: value.recommendation.recommendedBy, controls: value.recommendation.controls } : null, decision: value.decision ? { type: value.decision.type, reasonCode: value.decision.reasonCode || null, decidedAt: value.decision.decidedAt, decidedBy: value.decision.decidedBy } : null, runtimeRevision: value.runtimeRevision, updatedAt: value.updatedAt, lastEventId: value.lastEventId }) }
export function buildConveyancerFinalAccountFingerprint(value = {}) { return fnv({ bindingFingerprint: value.bindingFingerprint, runtime: runtimeSnapshot(value) }) }

function recommendationValid(value) {
  const expected = CONVEYANCER_FINAL_ACCOUNT_CONTROLS.map((item) => item.key).sort()
  const actual = Object.keys(value.recommendation?.controls || {}).sort()
  return Boolean(value.recommendation?.summary && value.recommendation?.recommendedAt && authorised(value.recommendation?.recommendedBy, CAP.prepare, value.financialModel?.lane) && JSON.stringify(expected) === JSON.stringify(actual) && Object.values(value.recommendation.controls).every((item) => item === true))
}

function validateFinalAccount(value = {}) {
  const errors = []
  if (value.version !== CONVEYANCER_FINAL_ACCOUNT_VERSION) errors.push('final_account_version_invalid')
  if (!value.finalAccountId || !value.financialModel?.financialModelId || !value.reconciliation?.reconciliationId) errors.push('final_account_identity_required')
  if (!STATUSES.has(value.status)) errors.push('final_account_status_invalid')
  if (!authorised(value.preparedBy, CAP.prepare, value.financialModel?.lane) || !value.preparedAt || !value.generatedAt || value.generatedAt !== value.preparedAt || !value.startCommandId || (value.reconciliation?.approvedAt && new Date(value.preparedAt) < new Date(value.reconciliation.approvedAt))) errors.push('final_account_preparation_invalid')
  if (!Number.isInteger(value.runtimeRevision) || value.runtimeRevision < 1 || !value.updatedAt || !value.lastEventId) errors.push('final_account_runtime_invalid')
  if (value.template?.templateKey !== 'final_account' || !value.template.templateVersionId || !governedFingerprint(value.template.templateFingerprint) || !sha(value.template.contentHash) || value.template.outputFormat !== 'pdf' || !value.template.locale) errors.push('final_account_template_invalid')
  if (!Array.isArray(value.accounts) || value.accounts.length !== 2 || value.accounts.some((item) => !PARTY_ROLES.has(item.accountRole) || !sha(item.partyReferenceHash) || item.currency !== value.financialModel.currency || !Array.isArray(item.lines) || !item.lines.length || !Number.isSafeInteger(item.totalDebitMinor) || !Number.isSafeInteger(item.totalCreditMinor) || !Number.isSafeInteger(item.balanceMinor))) errors.push('final_account_accounts_invalid')
  const roles = (value.accounts || []).map((item) => item.accountRole)
  if (!roles.includes('buyer') || !roles.includes('seller') || new Set(roles).size !== roles.length) errors.push('final_account_party_accounts_invalid')
  const lineIds = (value.accounts || []).flatMap((item) => item.lines.map((entry) => entry.accountLineId))
  if (lineIds.some((item, index) => !item || lineIds.indexOf(item) !== index) || (value.accounts || []).some((item) => item.lines.some((entry) => entry.accountRole !== item.accountRole || !['d5_consideration', 'd5_line', 'd6_target'].includes(entry.sourceType) || !entry.sourceId || !entry.description || !Number.isSafeInteger(entry.debitMinor) || entry.debitMinor < 0 || !Number.isSafeInteger(entry.creditMinor) || entry.creditMinor < 0 || (entry.debitMinor > 0) === (entry.creditMinor > 0)))) errors.push('final_account_lines_invalid')
  const buyerAccount = value.accounts?.find((item) => item.accountRole === 'buyer')
  const sellerAccount = value.accounts?.find((item) => item.accountRole === 'seller')
  const derivedSummary = { accountCount: value.accounts?.length || 0, lineCount: (value.accounts || []).reduce((total, item) => total + item.lines.length, 0), buyerBalanceMinor: buyerAccount?.balanceMinor, sellerBalanceMinor: sellerAccount?.balanceMinor, allAccountsBalanced: (value.accounts || []).every((item) => item.balanceMinor === 0), reconciledFundingMinor: (buyerAccount?.lines || []).filter((item) => item.accountLineId.startsWith('buyer:funding:')).reduce((total, item) => total + item.creditMinor, 0), reconciledSellerPayoutMinor: (sellerAccount?.lines || []).filter((item) => item.accountLineId.startsWith('seller:proceeds:') || item.accountLineId.startsWith('seller:credit_payment:')).reduce((total, item) => total + item.debitMinor, 0) }
  if ((value.accounts || []).some((item) => item.totalDebitMinor !== item.lines.reduce((total, entry) => total + entry.debitMinor, 0) || item.totalCreditMinor !== item.lines.reduce((total, entry) => total + entry.creditMinor, 0) || item.balanceMinor !== item.totalDebitMinor - item.totalCreditMinor) || JSON.stringify(stable(derivedSummary)) !== JSON.stringify(stable(value.summary))) errors.push('final_account_derivation_invalid')
  if (!value.summary?.allAccountsBalanced) errors.push('final_account_not_balanced')
  if (value.contentHash !== buildConveyancerFinalAccountContentHash(value)) errors.push('final_account_content_hash_invalid')
  if ([STATUS.approvalRecommended, STATUS.approved].includes(value.status) && !recommendationValid(value)) errors.push('final_account_recommendation_invalid')
  if (value.recommendation?.recommendedAt && new Date(value.recommendation.recommendedAt) < new Date(value.preparedAt)) errors.push('final_account_recommendation_chronology_invalid')
  if ([STATUS.changesRequested, STATUS.rejected, STATUS.approved].includes(value.status) && (!value.decision?.decisionReferenceId || !value.decision?.summary || !value.decision?.decidedAt || !authorised(value.decision?.decidedBy, value.status === STATUS.approved ? CAP.approve : CAP.review, value.financialModel?.lane, false))) errors.push('final_account_decision_invalid')
  if ([STATUS.changesRequested, STATUS.rejected].includes(value.status) && !value.decision?.reasonCode) errors.push('final_account_negative_decision_invalid')
  if (value.decision?.decidedAt && new Date(value.decision.decidedAt) < new Date(value.recommendation?.recommendedAt || value.preparedAt)) errors.push('final_account_decision_chronology_invalid')
  if ([STATUS.pendingReview, STATUS.approvalRecommended].includes(value.status) && value.decision) errors.push('final_account_decision_not_allowed')
  if (value.status === STATUS.approved && [value.preparedBy?.userId, value.recommendation?.recommendedBy?.userId].includes(value.decision?.decidedBy?.userId)) errors.push('independent_final_account_approval_required')
  if (value.bindingFingerprint !== buildConveyancerFinalAccountBindingFingerprint(value)) errors.push('final_account_binding_fingerprint_invalid')
  if (value.fingerprint !== buildConveyancerFinalAccountFingerprint(value)) errors.push('final_account_fingerprint_invalid')
  if (value.persistencePerformed || value.renderingPerformed || value.deliveryPerformed || value.trustPostingPerformed || value.registrationUpdated) errors.push('final_account_side_effect_boundary_violated')
  return deepFreeze({ valid: errors.length === 0, errors: unique(errors), finalAccount: value })
}

export function validateConveyancerFinalAccount(input = {}) { return validateFinalAccount(clone(input)) }

function event(value, { commandId, commandType, commandFingerprint = null, performedBy, occurredAt, before }) {
  const eventId = `final_account_event:${value.finalAccountId}:${value.runtimeRevision}:${commandId}`
  value.lastEventId = eventId
  return deepFreeze({ version: CONVEYANCER_FINAL_ACCOUNT_VERSION, eventId, eventType: commandType === 'start_final_account' ? 'final_account_prepared' : `final_account_${commandType}`, commandId, commandType, commandFingerprint, finalAccountId: value.finalAccountId, financialModelId: value.financialModel.financialModelId, reconciliationId: value.reconciliation.reconciliationId, transactionId: value.financialModel.transactionId, lane: value.financialModel.lane, contentHash: value.contentHash, accountRoles: value.accounts.map((item) => item.accountRole), lineCounts: value.accounts.map((item) => ({ accountRole: item.accountRole, lineCount: item.lines.length })), occurredAt, performedBy, before, after: auditRuntimeSnapshot(value), finalAccountRevision: value.runtimeRevision, persistencePerformed: false, renderingPerformed: false, deliveryPerformed: false, trustPostingPerformed: false, registrationUpdated: false })
}

export function startConveyancerFinalAccount({ financialModel: inputModel = {}, reconciliation: inputReconciliation = {}, parties = {}, template: inputTemplate = {}, actor: inputActor = {}, occurredAt = '', commandId = '', existingFinalAccounts = [] } = {}) {
  const preparedAt = iso(occurredAt)
  const resolvedCommandId = text(commandId)
  if (!preparedAt || !resolvedCommandId) return fail('valid_final_account_start_required')
  const modelValidation = validateConveyancerFinancialModel(inputModel)
  if (!modelValidation.valid) return fail('d5_financial_model_invalid', modelValidation.errors)
  const model = modelValidation.model
  if (model.assessment.status !== CONVEYANCER_FINANCIAL_MODEL_STATUSES.ready || !model.approval) return fail('approved_ready_d5_financial_model_required')
  const reconciliationValidation = validateConveyancerFinancialReconciliation(inputReconciliation)
  if (!reconciliationValidation.valid) return fail('d6_financial_reconciliation_invalid', reconciliationValidation.errors)
  const reconciliation = reconciliationValidation.reconciliation
  if (reconciliation.status !== CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES.reconciled) return fail('approved_d6_financial_reconciliation_required')
  if (reconciliation.financialModel.financialModelId !== model.financialModelId || reconciliation.financialModel.financialModelRevision !== model.revision || reconciliation.financialModel.financialModelFingerprint !== model.fingerprint || reconciliation.financialModel.transactionId !== model.transactionId || reconciliation.financialModel.organisationId !== model.organisationId || reconciliation.financialModel.lane !== model.lane) return fail('d5_d6_financial_binding_mismatch')
  const preparedBy = actor(inputActor)
  if (!authorised(preparedBy, CAP.prepare, model.lane)) return fail('final_account_preparation_not_authorised')
  const template = normalizeTemplate(inputTemplate)
  if (template.templateKey !== 'final_account' || !template.templateVersionId || !governedFingerprint(template.templateFingerprint) || !sha(template.contentHash) || template.outputFormat !== 'pdf' || !template.locale) return fail('governed_final_account_template_required')
  const projection = buildConveyancerFinalAccountProjection({ financialModel: model, reconciliation, parties })
  if (projection.accounts.some((item) => !sha(item.partyReferenceHash))) return fail('final_account_party_references_invalid')
  if (!projection.summary.allAccountsBalanced) return fail('final_account_projection_not_balanced')
  const finalAccountId = `final_account:${reconciliation.reconciliationId}`
  const proposed = { version: CONVEYANCER_FINAL_ACCOUNT_VERSION, finalAccountId, financialModel: modelBinding(model), reconciliation: reconciliationBinding(reconciliation), template, accounts: projection.accounts, summary: projection.summary, generatedAt: preparedAt, contentHash: null, preparedAt, preparedBy, startCommandId: resolvedCommandId }
  proposed.contentHash = buildConveyancerFinalAccountContentHash(proposed)
  const duplicate = (Array.isArray(existingFinalAccounts) ? existingFinalAccounts : []).find((item) => (item.finalAccount || item).finalAccountId === finalAccountId)
  if (duplicate) {
    const existing = duplicate.finalAccount || duplicate
    if (existing.startCommandId !== resolvedCommandId || existing.preparedBy?.userId !== preparedBy.userId || existing.bindingFingerprint !== buildConveyancerFinalAccountBindingFingerprint(proposed)) return fail('final_account_start_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], finalAccount: clone(existing), event: clone(duplicate.event || null) })
  }
  const value = { ...proposed, status: STATUS.pendingReview, recommendation: null, decision: null, bindingFingerprint: null, fingerprint: null, runtimeRevision: 1, updatedAt: preparedAt, lastEventId: null, persistencePerformed: false, renderingPerformed: false, deliveryPerformed: false, trustPostingPerformed: false, registrationUpdated: false }
  value.bindingFingerprint = buildConveyancerFinalAccountBindingFingerprint(value)
  const auditEvent = event(value, { commandId: resolvedCommandId, commandType: 'start_final_account', performedBy: preparedBy, occurredAt: preparedAt, before: { status: 'not_started', runtimeRevision: 0 } })
  value.fingerprint = buildConveyancerFinalAccountFingerprint(value)
  const validation = validateFinalAccount(value)
  if (!validation.valid) return fail('resulting_final_account_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: 'final_account_prepared', errors: [], finalAccount: value, event: auditEvent })
}

export function buildConveyancerFinalAccountCommand(value = {}, type, payload = {}) { return { commandId: `${key(type)}:${value.runtimeRevision}`, type: key(type), expectedFinalAccountId: value.finalAccountId, expectedRuntimeRevision: value.runtimeRevision, expectedFingerprint: value.fingerprint, ...payload } }
function controls(input = {}) { return Object.fromEntries(CONVEYANCER_FINAL_ACCOUNT_CONTROLS.map((item) => [item.key, input[item.key] === true])) }
function commandHash(type, command, performedBy) { const { commandId: _id, expectedFingerprint: _fingerprint, ...payload } = command; return fnv({ type, payload, performedBy }) }

function applyCommand(value, type, command, performedBy, occurredAt) {
  const lane = value.financialModel.lane
  if (type === COMMAND.recommend) {
    if (!authorised(performedBy, CAP.prepare, lane)) return 'final_account_recommendation_not_authorised'
    if (value.status !== STATUS.pendingReview) return 'final_account_not_pending_review'
    const checked = controls(command.controls)
    if (Object.values(checked).some((item) => !item)) return 'final_account_controls_incomplete'
    if (!text(command.summary)) return 'final_account_recommendation_summary_required'
    value.status = STATUS.approvalRecommended
    value.recommendation = { summary: text(command.summary), controls: checked, recommendedAt: occurredAt, recommendedBy: performedBy }
    return null
  }
  if (type === COMMAND.requestCorrection || type === COMMAND.reject) {
    if (!authorised(performedBy, CAP.review, lane, false)) return 'final_account_review_not_authorised'
    if (![STATUS.pendingReview, STATUS.approvalRecommended].includes(value.status)) return 'final_account_not_reviewable'
    const reasonCode = key(command.reasonCode || command.reason_code)
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    const summary = text(command.summary)
    if (!reasonCode || !decisionReferenceId || !summary) return 'final_account_negative_decision_required'
    value.status = type === COMMAND.reject ? STATUS.rejected : STATUS.changesRequested
    value.decision = { type, reasonCode, decisionReferenceId, summary, decidedAt: occurredAt, decidedBy: performedBy }
    return null
  }
  if (type === COMMAND.approve) {
    if (!authorised(performedBy, CAP.approve, lane, false)) return 'final_account_approval_not_authorised'
    if (value.status !== STATUS.approvalRecommended) return 'final_account_recommendation_required'
    if ([value.preparedBy.userId, value.recommendation?.recommendedBy?.userId].includes(performedBy.userId)) return 'independent_final_account_approval_required'
    const decisionReferenceId = text(command.decisionReferenceId || command.decision_reference_id)
    const summary = text(command.summary)
    if (!decisionReferenceId || !summary) return 'final_account_approval_evidence_required'
    value.status = STATUS.approved
    value.decision = { type, decisionReferenceId, summary, decidedAt: occurredAt, decidedBy: performedBy }
    return null
  }
  return 'final_account_command_unsupported'
}

export function executeConveyancerFinalAccount({ finalAccount: input = {}, command = {}, actor: inputActor = {}, occurredAt = '', existingEvents = [] } = {}) {
  const currentValidation = validateFinalAccount(clone(input))
  if (!currentValidation.valid) return fail('final_account_contract_invalid', currentValidation.errors)
  const current = currentValidation.finalAccount
  const type = key(command.type)
  const commandId = text(command.commandId || command.command_id)
  const performedBy = actor(inputActor)
  const at = iso(occurredAt)
  if (!COMMANDS.has(type) || !commandId) return fail('valid_final_account_command_required')
  if (!at || new Date(at) < new Date(current.updatedAt)) return fail('final_account_command_chronology_invalid')
  if (TERMINAL.has(current.status)) return fail('final_account_terminal')
  if (text(command.expectedFinalAccountId || command.expected_final_account_id) !== current.finalAccountId) return fail('stale_final_account_id')
  if (Number(command.expectedRuntimeRevision ?? command.expected_runtime_revision) !== current.runtimeRevision) return fail('stale_final_account_revision')
  if (text(command.expectedFingerprint || command.expected_fingerprint) !== current.fingerprint) return fail('stale_final_account_fingerprint')
  const commandFingerprint = commandHash(type, command, performedBy)
  const duplicate = (Array.isArray(existingEvents) ? existingEvents : []).find((item) => item.commandId === commandId)
  if (duplicate) {
    if (duplicate.commandFingerprint !== commandFingerprint) return fail('final_account_command_id_conflict')
    return deepFreeze({ ok: true, duplicate: true, code: 'idempotent_replay', errors: [], finalAccount: current, event: duplicate })
  }
  const value = clone(current)
  const before = auditRuntimeSnapshot(value)
  const error = applyCommand(value, type, command, performedBy, at)
  if (error) return fail(error)
  value.runtimeRevision += 1
  value.updatedAt = at
  const auditEvent = event(value, { commandId, commandType: type, commandFingerprint, performedBy, occurredAt: at, before })
  value.fingerprint = buildConveyancerFinalAccountFingerprint(value)
  const validation = validateFinalAccount(value)
  if (!validation.valid) return fail('resulting_final_account_invalid', validation.errors)
  return deepFreeze({ ok: true, duplicate: false, code: `final_account_${type}_recorded`, errors: [], finalAccount: value, event: auditEvent })
}
