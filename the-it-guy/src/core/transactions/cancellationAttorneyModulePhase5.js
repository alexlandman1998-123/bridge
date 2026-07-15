import { CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES } from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'

export const CANCELLATION_ATTORNEY_PHASE5_VERSION = 'cancellation_attorney_module_phase5_figures_register_v1'
export const CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID = 'cancellation_figures_register_missing'

export const CANCELLATION_FIGURES_STATUSES = Object.freeze({
  requested: 'requested',
  received: 'received',
  verified: 'verified',
  expired: 'expired',
  disputed: 'disputed',
  superseded: 'superseded',
})

export const CANCELLATION_FIGURES_EXPIRY_STATES = Object.freeze({
  missing: 'missing',
  invalid: 'invalid',
  expired: 'expired',
  expiresToday: 'expires_today',
  expiringSoon: 'expiring_soon',
  valid: 'valid',
})

export const CANCELLATION_FIGURES_RISK_STATES = Object.freeze({
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  unknown: 'unknown',
})

export const CANCELLATION_FIGURES_VALIDITY_STATES = Object.freeze({
  ready: 'ready',
  attention: 'attention',
  blocked: 'blocked',
})

export const CANCELLATION_FIGURES_CONTROL_BOUNDARY = Object.freeze({
  structuredRegisterOnly: true,
  requiredFactKeys: Object.freeze([
    'cancellation_figures_amount',
    'cancellation_figures_expiry_date',
    'daily_interest_amount',
    'penalty_notice_risk',
  ]),
  requiresVerifiedCanonicalFacts: true,
  requiresAmount: true,
  requiresExpiryDate: true,
  requiresDailyInterest: true,
  checksPenaltyNoticeRisk: true,
  checksSettlementDateAgainstExpiry: true,
  checksGuaranteeAmountAgainstFigures: true,
  mayCreateOperationalNextActions: true,
  mayRecordEvidenceLinks: true,
  requestsExternalFiguresAutomatically: false,
  issuesCancellationFigures: false,
  acceptsGuaranteeAutomatically: false,
  reconcilesSettlement: false,
  executesSettlementPayment: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

const S = CANCELLATION_FIGURES_STATUSES
const X = CANCELLATION_FIGURES_EXPIRY_STATES
const R = CANCELLATION_FIGURES_RISK_STATES
const V = CANCELLATION_FIGURES_VALIDITY_STATES
const FACT_STATUSES = CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES

const STATUS_SET = new Set(Object.values(CANCELLATION_FIGURES_STATUSES))

const STATUS_ALIASES = Object.freeze({
  pending: S.requested,
  requested_from_lender: S.requested,
  issued: S.received,
  uploaded: S.received,
  provided: S.received,
  approved: S.verified,
  checked: S.verified,
  complete: S.verified,
  stale: S.expired,
  lapsed: S.expired,
  rejected: S.disputed,
  conflict: S.disputed,
})

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/[^a-z0-9_:]+/g, '').replace(/^_+|_+$/g, '')
}

function validDate(value) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, itemKey) => {
      result[itemKey] = stable(value[itemKey])
      return result
    }, {})
  }
  return value
}

function hash(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(stable(value))
  let result = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return `fnv1a_${(result >>> 0).toString(16).padStart(8, '0')}`
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = key(value)
  if (['true', 'yes', 'y', '1', 'reviewed', 'resolved'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'unreviewed', 'unresolved'].includes(normalized)) return false
  return fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.figures)) return value.figures
    if (Array.isArray(value.items)) return value.items
    if (Array.isArray(value.entries)) return value.entries
    if ('amount' in value || 'cancellation_figures_amount' in value || 'expiryDate' in value || 'expiry_date' in value) return [value]
  }
  return text(value) ? [{ amount: value }] : []
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isoDateOnly(value) {
  if (!validDate(value)) return null
  return new Date(value).toISOString().slice(0, 10)
}

function endOfDate(value) {
  if (!validDate(value)) return null
  const date = new Date(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text(value))) date.setUTCHours(23, 59, 59, 999)
  return date
}

function daysBetween(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate)) return null
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
}

function daysUntil(expiryDate, asOf) {
  const expiry = endOfDate(expiryDate)
  const now = validDate(asOf) ? new Date(asOf) : new Date()
  if (!expiry) return null
  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000)
}

function expiryState(expiryDate, asOf) {
  if (!text(expiryDate)) return X.missing
  const expiry = endOfDate(expiryDate)
  const now = validDate(asOf) ? new Date(asOf) : new Date()
  if (!expiry) return X.invalid
  if (expiry.getTime() < now.getTime()) return X.expired
  const days = daysUntil(expiryDate, asOf)
  if (days === null) return X.invalid
  if (days <= 0) return X.expiresToday
  if (days <= 5) return X.expiringSoon
  return X.valid
}

function normalizeStatus(value = '', fallback = S.requested) {
  const normalized = key(value)
  const status = STATUS_ALIASES[normalized] || normalized
  return STATUS_SET.has(status) ? status : fallback
}

function normalizeRisk(value = {}) {
  const source = value && typeof value === 'object' ? value : { status: value }
  const normalized = key(source.status || source.risk || source.level || source.value || source.label || value)
  if (!normalized) return R.unknown
  if (['none', 'no', 'no_risk', 'clear', 'not_applicable', 'waived'].includes(normalized)) return R.none
  if (['low', 'minor'].includes(normalized)) return R.low
  if (['medium', 'moderate', 'monitor'].includes(normalized)) return R.medium
  if (['high', 'at_risk', 'penalty', 'penalty_risk', 'notice_risk', 'blocking'].includes(normalized)) return R.high
  return R.unknown
}

function factValue(facts, keyName) {
  return facts?.[keyName]?.value ?? null
}

function factSourceId(facts, keys = []) {
  for (const keyName of keys) {
    const sourceId = facts?.[keyName]?.source?.sourceId
    if (sourceId) return sourceId
  }
  return null
}

function factCapturedAt(facts, keys = []) {
  for (const keyName of keys) {
    const capturedAt = facts?.[keyName]?.source?.capturedAt
    if (capturedAt) return capturedAt
  }
  return null
}

function factsVerified(facts, keys = []) {
  return keys.every((keyName) => facts?.[keyName]?.status === FACT_STATUSES.verified)
}

function deriveCanonicalFigureSource(facts = {}) {
  const source = {
    figureId: 'canonical-cancellation-figures',
    amount: factValue(facts, 'cancellation_figures_amount'),
    expiryDate: factValue(facts, 'cancellation_figures_expiry_date'),
    dailyInterestAmount: factValue(facts, 'daily_interest_amount'),
    penaltyNoticeRisk: factValue(facts, 'penalty_notice_risk'),
    guaranteeRequiredAmount: factValue(facts, 'guarantee_required_amount'),
    guaranteeBeneficiaryAndWording: factValue(facts, 'guarantee_beneficiary_and_wording'),
    sourceReference: factSourceId(facts, ['cancellation_figures_amount', 'cancellation_figures_expiry_date', 'daily_interest_amount']) || 'canonical_phase2',
    receivedAt: factCapturedAt(facts, ['cancellation_figures_amount', 'cancellation_figures_expiry_date', 'daily_interest_amount']),
  }
  const hasAny = Object.values(source).some((value) => value !== null && value !== undefined && text(value) !== '')
  if (!hasAny) return []
  source.status = factsVerified(facts, ['cancellation_figures_amount', 'cancellation_figures_expiry_date', 'daily_interest_amount', 'penalty_notice_risk'])
    ? S.verified
    : S.received
  return [source]
}

function blocker({ id, severity = 'medium', category = 'readiness', detail = '' }) {
  return Object.freeze({ id, severity, category, detail })
}

function buildFigureBlockers(figure) {
  const blockers = []
  if (figure.amount === null) blockers.push(blocker({ id: 'figures_amount_required', severity: 'critical', category: 'structure' }))
  if (!figure.expiryDate) blockers.push(blocker({ id: 'figures_expiry_date_required', severity: 'critical', category: 'structure' }))
  if (figure.expiryState === X.invalid) blockers.push(blocker({ id: 'figures_expiry_date_invalid', severity: 'critical', category: 'structure' }))
  if (figure.expiryState === X.expired) blockers.push(blocker({ id: 'figures_expired', severity: 'critical', category: 'validity' }))
  if (figure.dailyInterestAmount === null) blockers.push(blocker({ id: 'daily_interest_required', severity: 'critical', category: 'structure' }))
  if (figure.status === S.disputed) blockers.push(blocker({ id: 'figures_disputed', severity: 'high', category: 'review' }))
  if (figure.settlementDate && figure.validForSettlement === false) blockers.push(blocker({ id: 'settlement_after_figures_expiry', severity: 'critical', category: 'validity', detail: figure.settlementDate }))
  if (figure.penaltyRiskState === R.high && figure.penaltyReviewed !== true) blockers.push(blocker({ id: 'penalty_notice_risk_requires_review', severity: 'high', category: 'review' }))
  if (figure.guaranteeVarianceState === 'under_guaranteed') blockers.push(blocker({ id: 'guarantee_amount_below_figures', severity: 'high', category: 'guarantee', detail: String(figure.guaranteeVarianceAmount ?? '') }))
  if (figure.expiryState === X.expiringSoon) blockers.push(blocker({ id: 'figures_expiring_soon', severity: 'medium', category: 'validity' }))
  return Object.freeze(blockers)
}

function validityState(blockers = []) {
  if (blockers.some((item) => item.severity === 'critical')) return V.blocked
  if (blockers.some((item) => ['high', 'medium'].includes(item.severity))) return V.attention
  return V.ready
}

function guaranteeVariance({ amount, guaranteeRequiredAmount }) {
  if (amount === null || guaranteeRequiredAmount === null) return { amount: null, state: 'missing' }
  const variance = Number((guaranteeRequiredAmount - amount).toFixed(2))
  if (Math.abs(variance) < 0.01) return { amount: 0, state: 'matched' }
  if (variance < 0) return { amount: variance, state: 'under_guaranteed' }
  return { amount: variance, state: 'over_guaranteed' }
}

function normalizeFigure(input = {}, index = 0, { facts = {}, asOf = new Date().toISOString(), settlementDate = '' } = {}) {
  const source = input && typeof input === 'object' ? input : { amount: input }
  const amount = numberOrNull(source.amount ?? source.cancellationFiguresAmount ?? source.cancellation_figures_amount ?? source.value)
  const expiryDate = isoDateOnly(source.expiryDate || source.expiry_date || source.cancellationFiguresExpiryDate || source.cancellation_figures_expiry_date)
  const dailyInterestAmount = numberOrNull(source.dailyInterestAmount ?? source.daily_interest_amount ?? source.dailyInterest)
  const guaranteeRequiredAmount = numberOrNull(source.guaranteeRequiredAmount ?? source.guarantee_required_amount ?? factValue(facts, 'guarantee_required_amount'))
  const receivedAt = source.receivedAt || source.received_at || source.capturedAt || source.captured_at || factCapturedAt(facts, ['cancellation_figures_amount']) || null
  const effectiveSettlementDate = isoDateOnly(source.settlementDate || source.settlement_date || settlementDate)
  const daysToSettlement = effectiveSettlementDate ? daysBetween(asOf, effectiveSettlementDate) : null
  const projectedAdditionalInterest = dailyInterestAmount !== null && daysToSettlement !== null ? Number((dailyInterestAmount * Math.max(0, daysToSettlement)).toFixed(2)) : null
  const projectedSettlementAmount = amount !== null && projectedAdditionalInterest !== null ? Number((amount + projectedAdditionalInterest).toFixed(2)) : null
  const variance = guaranteeVariance({ amount, guaranteeRequiredAmount })
  const expiry = expiryState(expiryDate, asOf)
  const expiryEnd = endOfDate(expiryDate)
  const settlementEnd = endOfDate(effectiveSettlementDate)
  const validForSettlement = settlementEnd && expiryEnd ? settlementEnd.getTime() <= expiryEnd.getTime() : null
  const figure = {
    figureId: text(source.figureId || source.figure_id || source.id) || hash({ index, amount, expiryDate, receivedAt, sourceReference: source.sourceReference || source.source_reference }),
    lender: text(source.lender || source.bank || factValue(facts, 'cancellation_bank')) || null,
    accountNumber: text(source.accountNumber || source.account_number || factValue(facts, 'cancellation_bond_account_number')) || null,
    sourceReference: text(source.sourceReference || source.source_reference || source.reference || source.referenceId || source.reference_id) || factSourceId(facts, ['cancellation_figures_amount']) || null,
    status: normalizeStatus(source.status || source.figureStatus || source.figure_status, source.status ? S.requested : S.verified),
    amount,
    expiryDate,
    dailyInterestAmount,
    penaltyNoticeRisk: source.penaltyNoticeRisk ?? source.penalty_notice_risk ?? factValue(facts, 'penalty_notice_risk'),
    penaltyRiskState: normalizeRisk(source.penaltyNoticeRisk ?? source.penalty_notice_risk ?? factValue(facts, 'penalty_notice_risk')),
    penaltyReviewed: bool(source.penaltyReviewed ?? source.penalty_reviewed ?? source.penaltyNoticeReviewed ?? source.penalty_notice_reviewed, false),
    guaranteeRequiredAmount,
    guaranteeBeneficiaryAndWording: source.guaranteeBeneficiaryAndWording ?? source.guarantee_beneficiary_and_wording ?? factValue(facts, 'guarantee_beneficiary_and_wording'),
    guaranteeVarianceAmount: variance.amount,
    guaranteeVarianceState: variance.state,
    receivedAt,
    expiryState: expiry,
    daysUntilExpiry: daysUntil(expiryDate, asOf),
    settlementDate: effectiveSettlementDate,
    validForSettlement,
    daysToSettlement,
    projectedAdditionalInterest,
    projectedSettlementAmount,
    blockers: Object.freeze([]),
    validityState: V.ready,
  }
  figure.blockers = buildFigureBlockers(figure)
  figure.validityState = validityState(figure.blockers)
  return Object.freeze(figure)
}

function figureSort(left, right) {
  const validityRank = { [V.blocked]: 0, [V.attention]: 1, [V.ready]: 2 }
  return (validityRank[left.validityState] ?? 9) - (validityRank[right.validityState] ?? 9) ||
    text(left.expiryDate || '9999-12-31').localeCompare(text(right.expiryDate || '9999-12-31')) ||
    left.figureId.localeCompare(right.figureId)
}

function buildNextAction(figure) {
  if (figure.validityState === V.ready) return null
  const firstBlocker = figure.blockers[0]?.id || null
  let actionLabel = 'Review cancellation figures'
  if (figure.amount === null || !figure.expiryDate || figure.dailyInterestAmount === null) actionLabel = 'Capture verified cancellation figures'
  else if (['figures_expired', 'settlement_after_figures_expiry'].includes(firstBlocker)) actionLabel = 'Request updated cancellation figures'
  else if (firstBlocker === 'penalty_notice_risk_requires_review') actionLabel = 'Review penalty or notice risk'
  else if (firstBlocker === 'guarantee_amount_below_figures') actionLabel = 'Align guarantee amount to cancellation figures'
  else if (firstBlocker === 'figures_expiring_soon') actionLabel = 'Monitor figures expiry'

  return Object.freeze({
    figureId: figure.figureId,
    sourceReference: figure.sourceReference,
    lender: figure.lender,
    expiryDate: figure.expiryDate,
    expiryState: figure.expiryState,
    validityState: figure.validityState,
    priority: figure.validityState === V.blocked ? 'critical' : 'high',
    actionLabel,
    reason: firstBlocker,
    blockerIds: Object.freeze(figure.blockers.map((item) => item.id)),
  })
}

function buildMetrics(figures = []) {
  return Object.freeze({
    figureCount: figures.length,
    verifiedFigureCount: figures.filter((figure) => figure.status === S.verified).length,
    readyFigureCount: figures.filter((figure) => figure.validityState === V.ready).length,
    attentionFigureCount: figures.filter((figure) => figure.validityState === V.attention).length,
    blockedFigureCount: figures.filter((figure) => figure.validityState === V.blocked).length,
    expiredFigureCount: figures.filter((figure) => figure.expiryState === X.expired).length,
    expiryRiskCount: figures.filter((figure) => [X.expired, X.expiresToday, X.expiringSoon].includes(figure.expiryState)).length,
    settlementAfterExpiryCount: figures.filter((figure) => figure.validForSettlement === false).length,
    highPenaltyRiskCount: figures.filter((figure) => figure.penaltyRiskState === R.high && figure.penaltyReviewed !== true).length,
    guaranteeVarianceCount: figures.filter((figure) => figure.guaranteeVarianceState === 'under_guaranteed').length,
    missingAmountCount: figures.filter((figure) => figure.amount === null).length,
    missingExpiryDateCount: figures.filter((figure) => !figure.expiryDate).length,
    missingDailyInterestCount: figures.filter((figure) => figure.dailyInterestAmount === null).length,
    blockerCount: figures.reduce((sum, figure) => sum + figure.blockers.length, 0),
  })
}

function buildFiguresFingerprint(figures = []) {
  return hash(figures.map((figure) => ({
    figureId: figure.figureId,
    sourceReference: figure.sourceReference,
    status: figure.status,
    amount: figure.amount,
    expiryDate: figure.expiryDate,
    dailyInterestAmount: figure.dailyInterestAmount,
    penaltyRiskState: figure.penaltyRiskState,
    penaltyReviewed: figure.penaltyReviewed,
    guaranteeRequiredAmount: figure.guaranteeRequiredAmount,
    settlementDate: figure.settlementDate,
    validityState: figure.validityState,
  })))
}

function buildScheduleModel({ register }) {
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE5_VERSION,
    workspaceId: register.workspaceId,
    transactionId: register.transactionId,
    generatedAt: register.generatedAt,
    figuresFingerprint: register.figuresFingerprint,
    rows: Object.freeze(register.figures.map((figure) => Object.freeze({
      figureId: figure.figureId,
      sourceReference: figure.sourceReference,
      lender: figure.lender,
      accountNumber: figure.accountNumber,
      amount: figure.amount,
      expiryDate: figure.expiryDate,
      expiryState: figure.expiryState,
      dailyInterestAmount: figure.dailyInterestAmount,
      settlementDate: figure.settlementDate,
      validForSettlement: figure.validForSettlement,
      projectedSettlementAmount: figure.projectedSettlementAmount,
      penaltyRiskState: figure.penaltyRiskState,
      guaranteeRequiredAmount: figure.guaranteeRequiredAmount,
      guaranteeVarianceState: figure.guaranteeVarianceState,
      validityState: figure.validityState,
      nextAction: buildNextAction(figure)?.actionLabel || 'No action required',
    }))),
  })
}

function buildAuditEvent({ workspace, register, actor, commandId, occurredAt }) {
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace,
    eventType: 'cancellation_figures_register_structured',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE5_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    figuresFingerprint: register.figuresFingerprint,
    figureMetrics: register.metrics,
    readyForPhase6: register.readyForPhase6,
  })
}

export function validateCancellationFiguresRegister(register = {}) {
  const errors = []
  const warnings = []
  if (register.version !== CANCELLATION_ATTORNEY_PHASE5_VERSION) errors.push('figures_register_version_invalid')
  if (register.workspaceValidation && register.workspaceValidation.valid !== true) errors.push(...register.workspaceValidation.errors.map((error) => `workspace:${error}`))

  const requiredFacts = CANCELLATION_FIGURES_CONTROL_BOUNDARY.requiredFactKeys || []
  requiredFacts.forEach((factKey) => {
    if (register.factStatuses?.[factKey] !== FACT_STATUSES.verified) errors.push(`${factKey}_fact_not_verified`)
  })
  if (!Array.isArray(register.figures) || !register.figures.length) errors.push('cancellation_figures_required')

  const figureIds = (register.figures || []).map((figure) => figure.figureId)
  if (new Set(figureIds).size !== figureIds.length) errors.push('duplicate_cancellation_figure_id')

  ;(register.figures || []).forEach((figure) => {
    if (!figure.figureId) errors.push('cancellation_figure_id_required')
    if (!STATUS_SET.has(figure.status)) errors.push(`cancellation_figure_status_invalid:${figure.figureId}`)
    if (figure.amount === null) errors.push(`cancellation_figures_amount_required:${figure.figureId}`)
    if (!figure.expiryDate) errors.push(`cancellation_figures_expiry_date_required:${figure.figureId}`)
    if (figure.expiryState === X.invalid) errors.push(`cancellation_figures_expiry_date_invalid:${figure.figureId}`)
    if (figure.dailyInterestAmount === null) errors.push(`daily_interest_required:${figure.figureId}`)
    if (figure.expiryState === X.expired) warnings.push(`cancellation_figures_expired:${figure.figureId}`)
    if (figure.expiryState === X.expiringSoon) warnings.push(`cancellation_figures_expiring_soon:${figure.figureId}`)
    if (figure.validForSettlement === false) warnings.push(`settlement_after_figures_expiry:${figure.figureId}`)
    if (figure.penaltyRiskState === R.high && figure.penaltyReviewed !== true) warnings.push(`penalty_notice_risk_requires_review:${figure.figureId}`)
    if (figure.guaranteeVarianceState === 'under_guaranteed') warnings.push(`guarantee_amount_below_figures:${figure.figureId}`)
  })

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

export function buildCancellationFiguresNextActions(register = {}) {
  return Object.freeze((register.figures || [])
    .map(buildNextAction)
    .filter(Boolean)
    .sort((left, right) => {
      const priorityRank = { critical: 0, high: 1, normal: 2 }
      const validityRank = { [V.blocked]: 0, [V.attention]: 1, [V.ready]: 2 }
      return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
        (validityRank[left.validityState] ?? 9) - (validityRank[right.validityState] ?? 9) ||
        text(left.expiryDate || '9999-12-31').localeCompare(text(right.expiryDate || '9999-12-31')) ||
        left.figureId.localeCompare(right.figureId)
    }))
}

export function buildCancellationFiguresScheduleModel(register = {}) {
  return buildScheduleModel({ register })
}

export function buildCancellationFiguresRegister({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  figures = null,
  settlementDate = '',
  actor = {},
  commandId = 'cancellation-figures-register',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  const facts = effectiveWorkspace.canonicalData?.factsByKey || {}
  const sourceFigures = figures === null || figures === undefined ? deriveCanonicalFigureSource(facts) : asArray(figures)
  const effectiveSettlementDate = settlementDate ||
    lane.expectedSettlementDate ||
    lane.expected_settlement_date ||
    transaction.expectedSettlementDate ||
    transaction.expected_settlement_date ||
    transaction.anticipatedRegistrationDate ||
    transaction.anticipated_registration_date ||
    ''
  const normalizedFigures = Object.freeze(sourceFigures
    .map((figure, index) => normalizeFigure(figure, index, { facts, asOf, settlementDate: effectiveSettlementDate }))
    .sort(figureSort))
  const metrics = buildMetrics(normalizedFigures)
  const figuresFingerprint = buildFiguresFingerprint(normalizedFigures)
  const factStatuses = Object.freeze(Object.fromEntries((CANCELLATION_FIGURES_CONTROL_BOUNDARY.requiredFactKeys || []).map((factKey) => [factKey, facts?.[factKey]?.status || FACT_STATUSES.missing])))
  const factFingerprints = Object.freeze(Object.fromEntries((CANCELLATION_FIGURES_CONTROL_BOUNDARY.requiredFactKeys || []).map((factKey) => [factKey, facts?.[factKey]?.fingerprint || null])))
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE5_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt,
    asOf,
    settlementDate: isoDateOnly(effectiveSettlementDate),
    factStatuses,
    factFingerprints,
    workspaceValidation,
    figures: normalizedFigures,
    activeFigure: normalizedFigures.find((figure) => ![S.superseded, S.disputed].includes(figure.status)) || normalizedFigures[0] || null,
    metrics,
    figuresFingerprint,
    controls: CANCELLATION_FIGURES_CONTROL_BOUNDARY,
    readyForPhase6: false,
  })
  const validation = validateCancellationFiguresRegister(shell)
  const nextActions = buildCancellationFiguresNextActions(shell)
  const readyForPhase6 = validation.valid &&
    metrics.figureCount > 0 &&
    metrics.readyFigureCount > 0 &&
    metrics.blockedFigureCount === 0 &&
    metrics.attentionFigureCount === 0 &&
    metrics.expiredFigureCount === 0 &&
    metrics.settlementAfterExpiryCount === 0 &&
    metrics.highPenaltyRiskCount === 0 &&
    metrics.guaranteeVarianceCount === 0 &&
    metrics.missingAmountCount === 0 &&
    metrics.missingExpiryDateCount === 0 &&
    metrics.missingDailyInterestCount === 0
  const register = Object.freeze({
    ...shell,
    validation,
    nextActions,
    scheduleModel: buildScheduleModel({ register: { ...shell, nextActions } }),
    readyForPhase6,
  })
  return Object.freeze({
    ...register,
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, register, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildCancellationAttorneyPhase5BaselineReport(input = {}) {
  const register = buildCancellationFiguresRegister(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE5_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
    figureCount: register.metrics.figureCount,
    readyFigureCount: register.metrics.readyFigureCount,
    blockedFigureCount: register.metrics.blockedFigureCount,
    attentionFigureCount: register.metrics.attentionFigureCount,
    expiryRiskCount: register.metrics.expiryRiskCount,
    highPenaltyRiskCount: register.metrics.highPenaltyRiskCount,
    guaranteeVarianceCount: register.metrics.guaranteeVarianceCount,
    nextActionCount: register.nextActions.length,
    validation: register.validation,
    controls: register.controls,
    readyForPhase6: register.readyForPhase6,
  })
}
