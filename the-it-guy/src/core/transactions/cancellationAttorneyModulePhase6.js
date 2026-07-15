import { CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES } from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'
import { buildCancellationFiguresRegister } from './cancellationAttorneyModulePhase5.js'

export const CANCELLATION_ATTORNEY_PHASE6_VERSION = 'cancellation_attorney_module_phase6_guarantee_workspace_v1'
export const CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID = 'guarantee_coordination_workspace_missing'

export const CANCELLATION_GUARANTEE_STATUSES = Object.freeze({
  requested: 'requested',
  received: 'received',
  underReview: 'under_review',
  accepted: 'accepted',
  variance: 'variance',
  rejected: 'rejected',
  superseded: 'superseded',
})

export const CANCELLATION_GUARANTEE_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const CANCELLATION_GUARANTEE_INSTRUMENT_TYPES = Object.freeze({
  bankGuarantee: 'bank_guarantee',
  cashUndertaking: 'cash_undertaking',
  other: 'other',
})

export const CANCELLATION_GUARANTEE_OWNER_ROLES = Object.freeze({
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  secretary: 'secretary',
  bank: 'bank',
  unassigned: 'unassigned',
})

export const CANCELLATION_GUARANTEE_MATCH_STATES = Object.freeze({
  matched: 'matched',
  attention: 'attention',
  blocked: 'blocked',
})

export const CANCELLATION_GUARANTEE_WORKSPACE_STATUSES = Object.freeze({
  blocked: 'blocked',
  waiting: 'waiting',
  review: 'review',
  ready: 'ready',
})

export const CANCELLATION_GUARANTEE_CONTROL_BOUNDARY = Object.freeze({
  structuredWorkspaceOnly: true,
  requiredFactKeys: Object.freeze([
    'guarantee_required_amount',
    'guarantee_beneficiary_and_wording',
    'guarantee_reference',
    'guarantee_acceptance_status',
  ]),
  requiresVerifiedCanonicalFacts: true,
  requiresFiguresRegisterReady: true,
  requiresGuaranteeEvidence: true,
  requiresAmountMatch: true,
  requiresBeneficiaryAndWordingMatch: true,
  requiresCancellationAttorneyDecision: true,
  mayCreateOperationalNextActions: true,
  mayRecordEvidenceLinks: true,
  issuesGuarantee: false,
  acceptsGuaranteeAutomatically: false,
  routesGuaranteeExternally: false,
  submitsToBankPortal: false,
  generatesLegalInstrument: false,
  reconcilesSettlement: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

const GS = CANCELLATION_GUARANTEE_STATUSES
const ES = CANCELLATION_GUARANTEE_EVIDENCE_STATUSES
const IT = CANCELLATION_GUARANTEE_INSTRUMENT_TYPES
const OR = CANCELLATION_GUARANTEE_OWNER_ROLES
const MS = CANCELLATION_GUARANTEE_MATCH_STATES
const WS = CANCELLATION_GUARANTEE_WORKSPACE_STATUSES
const FACT_STATUSES = CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES

const STATUS_SET = new Set(Object.values(GS))
const EVIDENCE_STATUS_SET = new Set(Object.values(ES))
const INSTRUMENT_TYPE_SET = new Set(Object.values(IT))
const OWNER_ROLE_SET = new Set(Object.values(OR))

const STATUS_ALIASES = Object.freeze({
  pending: GS.requested,
  requested_from_transfer: GS.requested,
  uploaded: GS.received,
  supplied: GS.received,
  provided: GS.received,
  review: GS.underReview,
  checked: GS.underReview,
  approved: GS.accepted,
  complete: GS.accepted,
  mismatch: GS.variance,
  changes_requested: GS.variance,
  declined: GS.rejected,
})

const OWNER_ALIASES = Object.freeze({
  transfer: OR.transferAttorney,
  conveyancer: OR.cancellationAttorney,
  cancellation: OR.cancellationAttorney,
  attorney: OR.cancellationAttorney,
  bond: OR.bondAttorney,
  lender: OR.bank,
  assistant: OR.secretary,
  conveyancing_secretary: OR.secretary,
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
  if (['true', 'yes', 'y', '1', 'accepted', 'verified', 'matched'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'rejected', 'mismatch'].includes(normalized)) return false
  return fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.guarantees)) return value.guarantees
    if (Array.isArray(value.items)) return value.items
    if (Array.isArray(value.instruments)) return value.instruments
    if ('amount' in value || 'guaranteeAmount' in value || 'guarantee_amount' in value || 'reference' in value) return [value]
  }
  return []
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

function normalizeStatus(value = '', fallback = GS.requested) {
  const normalized = key(value)
  const status = STATUS_ALIASES[normalized] || normalized
  return STATUS_SET.has(status) ? status : fallback
}

function normalizeEvidenceStatus(value = '', fallback = ES.missing) {
  const normalized = key(value)
  if (['attached', 'uploaded', 'received', 'supplied'].includes(normalized)) return ES.provided
  if (['approved', 'accepted', 'reviewed'].includes(normalized)) return ES.verified
  if (['declined'].includes(normalized)) return ES.rejected
  return EVIDENCE_STATUS_SET.has(normalized) ? normalized : fallback
}

function normalizeInstrumentType(value = '') {
  const normalized = key(value)
  if (normalized.includes('cash') || normalized.includes('undertaking')) return IT.cashUndertaking
  if (normalized.includes('bank') || normalized.includes('guarantee')) return IT.bankGuarantee
  return INSTRUMENT_TYPE_SET.has(normalized) ? normalized : IT.bankGuarantee
}

function normalizeOwnerRole(value = '') {
  const normalized = key(value)
  const role = OWNER_ALIASES[normalized] || normalized
  return OWNER_ROLE_SET.has(role) ? role : OR.unassigned
}

function factValue(facts, factKey) {
  return facts?.[factKey]?.value ?? null
}

function factSourceId(facts, keys = []) {
  for (const factKey of keys) {
    const sourceId = facts?.[factKey]?.source?.sourceId
    if (sourceId) return sourceId
  }
  return null
}

function factCapturedAt(facts, keys = []) {
  for (const factKey of keys) {
    const capturedAt = facts?.[factKey]?.source?.capturedAt
    if (capturedAt) return capturedAt
  }
  return null
}

function factsVerified(facts, keys = []) {
  return keys.every((factKey) => facts?.[factKey]?.status === FACT_STATUSES.verified)
}

function stringifyComparable(value) {
  if (Array.isArray(value)) return value.map(stringifyComparable).join('|')
  if (value && typeof value === 'object') return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${stringifyComparable(v)}`).join('|')
  return key(value)
}

function deriveCanonicalGuaranteeSource(facts = {}) {
  const amount = factValue(facts, 'guarantee_required_amount')
  const source = {
    guaranteeId: 'canonical-cancellation-guarantee',
    reference: factValue(facts, 'guarantee_reference'),
    amount,
    beneficiaryAndWording: factValue(facts, 'guarantee_beneficiary_and_wording'),
    acceptanceStatus: factValue(facts, 'guarantee_acceptance_status'),
    sourceReference: factSourceId(facts, ['guarantee_reference', 'guarantee_required_amount']) || 'canonical_phase2',
    receivedAt: factCapturedAt(facts, ['guarantee_reference', 'guarantee_required_amount']),
    evidence: [{ requirementKey: 'guarantee_document', status: 'verified', referenceId: factSourceId(facts, ['guarantee_reference']) || 'canonical-guarantee-evidence' }],
  }
  const hasAny = Object.values(source).some((value) => value !== null && value !== undefined && text(value) !== '')
  if (!hasAny) return []
  source.status = factsVerified(facts, ['guarantee_required_amount', 'guarantee_beneficiary_and_wording', 'guarantee_reference', 'guarantee_acceptance_status'])
    ? normalizeStatus(source.acceptanceStatus, GS.received)
    : GS.received
  return [source]
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `cancellation-guarantee-evidence-${index + 1}`,
    requirementKey: key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key),
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? ES.provided : ES.missing),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    artifactHash: text(source.artifactHash || source.artifact_hash || source.documentHash || source.document_hash || source.contentHash || source.content_hash) || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    verifiedAt: source.verifiedAt || source.verified_at || source.reviewedAt || source.reviewed_at || null,
    reason: text(source.reason || source.rejectionReason || source.rejection_reason) || null,
  })
}

function normalizeEvidenceItems(items) {
  return Object.freeze(asArray(items).map(normalizeEvidenceItem))
}

function evidenceSatisfies(evidence) {
  if (!evidence) return false
  if (evidence.status === ES.waived) return Boolean(evidence.reason)
  return evidence.status === ES.verified
}

function evidenceContract(evidenceItems = []) {
  const required = Object.freeze([
    Object.freeze({ key: 'guarantee_document', label: 'Guarantee document evidence', required: true, requiresVerification: true }),
    Object.freeze({ key: 'wording_review', label: 'Beneficiary and wording review evidence', required: true, requiresVerification: true }),
    Object.freeze({ key: 'cancellation_acceptance_decision', label: 'Cancellation attorney acceptance decision', required: true, requiresVerification: true }),
  ])
  const gaps = required.filter((requirement) => !evidenceItems.some((evidence) => evidence.requirementKey === requirement.key && evidenceSatisfies(evidence)))
  const rejected = required.filter((requirement) => evidenceItems.some((evidence) => evidence.requirementKey === requirement.key && evidence.status === ES.rejected))
  return Object.freeze({
    required,
    provided: evidenceItems,
    evidenceSatisfied: gaps.length === 0 && rejected.length === 0,
    evidenceGaps: Object.freeze(gaps.map((requirement) => requirement.key)),
    rejectedEvidenceKeys: Object.freeze(rejected.map((requirement) => requirement.key)),
  })
}

function blocker({ id, severity = 'medium', category = 'readiness', detail = '' }) {
  return Object.freeze({ id, severity, category, detail })
}

function amountMatch({ amount, requiredAmount }) {
  if (amount === null || requiredAmount === null) return { varianceAmount: null, state: 'missing' }
  const variance = Number((amount - requiredAmount).toFixed(2))
  if (Math.abs(variance) < 0.01) return { varianceAmount: 0, state: 'matched' }
  if (variance < 0) return { varianceAmount: variance, state: 'under_guaranteed' }
  return { varianceAmount: variance, state: 'over_guaranteed' }
}

function wordingMatches(actual, expected) {
  if (actual === null || actual === undefined || expected === null || expected === undefined) return null
  return stringifyComparable(actual) === stringifyComparable(expected)
}

function expiryValid(expiresAt, requiredExpiryDate) {
  if (!expiresAt || !requiredExpiryDate) return null
  const guaranteeExpiry = endOfDate(expiresAt)
  const figuresExpiry = endOfDate(requiredExpiryDate)
  if (!guaranteeExpiry || !figuresExpiry) return false
  return guaranteeExpiry.getTime() >= figuresExpiry.getTime()
}

function normalizeGuarantee(input = {}, index = 0, { facts = {}, figuresRegister = null } = {}) {
  const source = input && typeof input === 'object' ? input : { reference: input }
  const activeFigure = figuresRegister?.activeFigure || null
  const requiredAmount = numberOrNull(source.requiredAmount ?? source.required_amount ?? activeFigure?.guaranteeRequiredAmount ?? factValue(facts, 'guarantee_required_amount'))
  const amount = numberOrNull(source.amount ?? source.guaranteeAmount ?? source.guarantee_amount ?? requiredAmount)
  const expectedWording = source.expectedBeneficiaryAndWording ?? source.expected_beneficiary_and_wording ?? activeFigure?.guaranteeBeneficiaryAndWording ?? factValue(facts, 'guarantee_beneficiary_and_wording')
  const actualWording = source.beneficiaryAndWording ?? source.beneficiary_and_wording ?? expectedWording
  const match = amountMatch({ amount, requiredAmount })
  const beneficiaryAndWordingMatched = wordingMatches(actualWording, expectedWording)
  const expiresAt = isoDateOnly(source.expiresAt || source.expires_at)
  const validThroughFiguresExpiry = expiryValid(expiresAt, activeFigure?.expiryDate)
  const status = normalizeStatus(source.status || source.guaranteeStatus || source.guarantee_status || source.acceptanceStatus || source.acceptance_status || factValue(facts, 'guarantee_acceptance_status'), GS.received)
  const evidenceItems = normalizeEvidenceItems(source.evidence || source.evidenceItems || source.evidence_items)
  const contract = evidenceContract(evidenceItems)
  const guarantee = {
    guaranteeId: text(source.guaranteeId || source.guarantee_id || source.id) || hash({ index, reference: source.reference, amount, requiredAmount }),
    reference: text(source.reference || source.guaranteeReference || source.guarantee_reference || factValue(facts, 'guarantee_reference')) || null,
    sourceReference: text(source.sourceReference || source.source_reference || source.documentReferenceId || source.document_reference_id) || factSourceId(facts, ['guarantee_reference']) || null,
    instrumentType: normalizeInstrumentType(source.instrumentType || source.instrument_type || source.type),
    ownerRole: normalizeOwnerRole(source.ownerRole || source.owner_role || source.owner || source.issuerRole || source.issuer_role || OR.transferAttorney),
    issuerFirmId: text(source.issuerFirmId || source.issuer_firm_id) || null,
    status,
    amount,
    requiredAmount,
    varianceAmount: match.varianceAmount,
    varianceState: match.state,
    beneficiaryAndWording: actualWording,
    expectedBeneficiaryAndWording: expectedWording,
    beneficiaryAndWordingMatched,
    acceptanceStatus: status,
    acceptanceReviewed: bool(source.acceptanceReviewed ?? source.acceptance_reviewed, status === GS.accepted),
    expiresAt,
    validThroughFiguresExpiry,
    receivedAt: source.receivedAt || source.received_at || source.issuedAt || source.issued_at || factCapturedAt(facts, ['guarantee_reference']) || null,
    evidenceContract: contract,
    blockers: Object.freeze([]),
    matchState: MS.matched,
  }
  guarantee.blockers = buildGuaranteeBlockers(guarantee, { figuresRegister })
  guarantee.matchState = matchState(guarantee.blockers)
  return Object.freeze(guarantee)
}

function buildGuaranteeBlockers(guarantee, { figuresRegister = null } = {}) {
  const blockers = []
  if (figuresRegister?.readyForPhase6 !== true) blockers.push(blocker({ id: 'figures_register_not_ready', severity: 'critical', category: 'figures' }))
  if (!guarantee.reference) blockers.push(blocker({ id: 'guarantee_reference_required', severity: 'critical', category: 'structure' }))
  if (guarantee.amount === null) blockers.push(blocker({ id: 'guarantee_amount_required', severity: 'critical', category: 'structure' }))
  if (guarantee.requiredAmount === null) blockers.push(blocker({ id: 'guarantee_required_amount_missing', severity: 'critical', category: 'figures' }))
  if (guarantee.varianceState === 'under_guaranteed') blockers.push(blocker({ id: 'guarantee_amount_below_required', severity: 'critical', category: 'amount', detail: String(guarantee.varianceAmount ?? '') }))
  if (guarantee.varianceState === 'over_guaranteed') blockers.push(blocker({ id: 'guarantee_amount_above_required', severity: 'medium', category: 'amount', detail: String(guarantee.varianceAmount ?? '') }))
  if (guarantee.beneficiaryAndWordingMatched === false) blockers.push(blocker({ id: 'guarantee_beneficiary_or_wording_mismatch', severity: 'critical', category: 'wording' }))
  if (guarantee.beneficiaryAndWordingMatched === null) blockers.push(blocker({ id: 'guarantee_beneficiary_and_wording_required', severity: 'critical', category: 'wording' }))
  if (guarantee.validThroughFiguresExpiry === false) blockers.push(blocker({ id: 'guarantee_expires_before_figures', severity: 'high', category: 'expiry' }))
  if (guarantee.status === GS.rejected) blockers.push(blocker({ id: 'guarantee_rejected', severity: 'critical', category: 'decision' }))
  if (guarantee.status === GS.variance) blockers.push(blocker({ id: 'guarantee_variance_requires_resolution', severity: 'high', category: 'decision' }))
  if (guarantee.status !== GS.accepted) blockers.push(blocker({ id: 'cancellation_attorney_acceptance_required', severity: 'high', category: 'decision' }))
  if (guarantee.acceptanceReviewed !== true) blockers.push(blocker({ id: 'guarantee_acceptance_review_required', severity: 'high', category: 'decision' }))
  guarantee.evidenceContract.rejectedEvidenceKeys.forEach((item) => blockers.push(blocker({ id: `guarantee_evidence_rejected:${item}`, severity: 'high', category: 'evidence' })))
  guarantee.evidenceContract.evidenceGaps.forEach((item) => blockers.push(blocker({ id: `guarantee_evidence_missing:${item}`, severity: 'high', category: 'evidence' })))
  return Object.freeze(blockers)
}

function matchState(blockers = []) {
  if (blockers.some((item) => item.severity === 'critical')) return MS.blocked
  if (blockers.length) return MS.attention
  return MS.matched
}

function guaranteeSort(left, right) {
  const stateRank = { [MS.blocked]: 0, [MS.attention]: 1, [MS.matched]: 2 }
  return (stateRank[left.matchState] ?? 9) - (stateRank[right.matchState] ?? 9) ||
    text(left.reference || '').localeCompare(text(right.reference || '')) ||
    left.guaranteeId.localeCompare(right.guaranteeId)
}

function buildMetrics(guarantees = []) {
  return Object.freeze({
    guaranteeCount: guarantees.length,
    matchedGuaranteeCount: guarantees.filter((item) => item.matchState === MS.matched).length,
    attentionGuaranteeCount: guarantees.filter((item) => item.matchState === MS.attention).length,
    blockedGuaranteeCount: guarantees.filter((item) => item.matchState === MS.blocked).length,
    acceptedGuaranteeCount: guarantees.filter((item) => item.status === GS.accepted).length,
    evidenceGapCount: guarantees.reduce((sum, item) => sum + item.evidenceContract.evidenceGaps.length, 0),
    rejectedEvidenceCount: guarantees.reduce((sum, item) => sum + item.evidenceContract.rejectedEvidenceKeys.length, 0),
    amountMismatchCount: guarantees.filter((item) => ['under_guaranteed', 'over_guaranteed'].includes(item.varianceState)).length,
    underGuaranteedCount: guarantees.filter((item) => item.varianceState === 'under_guaranteed').length,
    wordingMismatchCount: guarantees.filter((item) => item.beneficiaryAndWordingMatched === false).length,
    acceptancePendingCount: guarantees.filter((item) => item.status !== GS.accepted || item.acceptanceReviewed !== true).length,
    expiryRiskCount: guarantees.filter((item) => item.validThroughFiguresExpiry === false).length,
    missingReferenceCount: guarantees.filter((item) => !item.reference).length,
  })
}

function buildGuaranteeFingerprint(guarantees = []) {
  return hash(guarantees.map((item) => ({
    guaranteeId: item.guaranteeId,
    reference: item.reference,
    sourceReference: item.sourceReference,
    status: item.status,
    amount: item.amount,
    requiredAmount: item.requiredAmount,
    varianceState: item.varianceState,
    beneficiaryAndWordingMatched: item.beneficiaryAndWordingMatched,
    expiresAt: item.expiresAt,
    evidence: item.evidenceContract.provided.map((evidence) => ({
      requirementKey: evidence.requirementKey,
      status: evidence.status,
      referenceId: evidence.referenceId,
      artifactHash: evidence.artifactHash,
      verifiedAt: evidence.verifiedAt,
    })),
  })))
}

function buildNextAction(guarantee) {
  if (guarantee.matchState === MS.matched) return null
  const first = guarantee.blockers[0]?.id || null
  let actionLabel = 'Review cancellation guarantee'
  if (first === 'figures_register_not_ready') actionLabel = 'Clear cancellation figures before guarantee acceptance'
  else if (first === 'guarantee_reference_required' || first === 'guarantee_amount_required') actionLabel = 'Capture guarantee details'
  else if (first === 'guarantee_amount_below_required') actionLabel = 'Request corrected guarantee amount'
  else if (first === 'guarantee_beneficiary_or_wording_mismatch') actionLabel = 'Request guarantee wording correction'
  else if (first === 'guarantee_expires_before_figures') actionLabel = 'Request extended guarantee validity'
  else if (first?.startsWith('guarantee_evidence_missing')) actionLabel = 'Attach and verify guarantee evidence'
  else if (first === 'cancellation_attorney_acceptance_required' || first === 'guarantee_acceptance_review_required') actionLabel = 'Record cancellation attorney guarantee decision'

  return Object.freeze({
    guaranteeId: guarantee.guaranteeId,
    reference: guarantee.reference,
    ownerRole: guarantee.ownerRole,
    priority: guarantee.matchState === MS.blocked ? 'critical' : 'high',
    actionLabel,
    reason: first,
    blockerIds: Object.freeze(guarantee.blockers.map((item) => item.id)),
  })
}

function buildScheduleModel({ workspace }) {
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE6_VERSION,
    workspaceId: workspace.workspaceId,
    transactionId: workspace.transactionId,
    generatedAt: workspace.generatedAt,
    guaranteeFingerprint: workspace.guaranteeFingerprint,
    rows: Object.freeze(workspace.guarantees.map((guarantee) => Object.freeze({
      guaranteeId: guarantee.guaranteeId,
      reference: guarantee.reference,
      ownerRole: guarantee.ownerRole,
      status: guarantee.status,
      amount: guarantee.amount,
      requiredAmount: guarantee.requiredAmount,
      varianceState: guarantee.varianceState,
      beneficiaryAndWordingMatched: guarantee.beneficiaryAndWordingMatched,
      validThroughFiguresExpiry: guarantee.validThroughFiguresExpiry,
      evidenceSatisfied: guarantee.evidenceContract.evidenceSatisfied,
      matchState: guarantee.matchState,
      nextAction: buildNextAction(guarantee)?.actionLabel || 'No action required',
    }))),
  })
}

function buildAuditEvent({ packWorkspace, guaranteeWorkspace, actor, commandId, occurredAt }) {
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace: packWorkspace,
    eventType: 'cancellation_guarantee_workspace_structured',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE6_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    guaranteeFingerprint: guaranteeWorkspace.guaranteeFingerprint,
    guaranteeMetrics: guaranteeWorkspace.metrics,
    figuresGateReady: guaranteeWorkspace.figuresGate.ready,
    readyForPhase7: guaranteeWorkspace.readyForPhase7,
  })
}

export function validateCancellationGuaranteeWorkspace(workspace = {}) {
  const errors = []
  const warnings = []
  if (workspace.version !== CANCELLATION_ATTORNEY_PHASE6_VERSION) errors.push('guarantee_workspace_version_invalid')
  if (workspace.packWorkspaceValidation && workspace.packWorkspaceValidation.valid !== true) errors.push(...workspace.packWorkspaceValidation.errors.map((error) => `workspace:${error}`))
  if (workspace.figuresGate?.ready !== true) errors.push('figures_gate_not_ready')

  const requiredFacts = CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.requiredFactKeys || []
  requiredFacts.forEach((factKey) => {
    if (workspace.factStatuses?.[factKey] !== FACT_STATUSES.verified) errors.push(`${factKey}_fact_not_verified`)
  })
  if (!Array.isArray(workspace.guarantees) || !workspace.guarantees.length) errors.push('cancellation_guarantee_required')

  const guaranteeIds = (workspace.guarantees || []).map((item) => item.guaranteeId)
  if (new Set(guaranteeIds).size !== guaranteeIds.length) errors.push('duplicate_cancellation_guarantee_id')

  ;(workspace.guarantees || []).forEach((guarantee) => {
    if (!guarantee.guaranteeId) errors.push('guarantee_id_required')
    if (!STATUS_SET.has(guarantee.status)) errors.push(`guarantee_status_invalid:${guarantee.guaranteeId || 'unknown'}`)
    if (!INSTRUMENT_TYPE_SET.has(guarantee.instrumentType)) errors.push(`guarantee_instrument_type_invalid:${guarantee.guaranteeId || 'unknown'}`)
    if (!OWNER_ROLE_SET.has(guarantee.ownerRole)) errors.push(`guarantee_owner_role_invalid:${guarantee.guaranteeId || 'unknown'}`)
    if (!guarantee.reference) errors.push(`guarantee_reference_required:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.amount === null) errors.push(`guarantee_amount_required:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.requiredAmount === null) errors.push(`guarantee_required_amount_missing:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.beneficiaryAndWordingMatched !== true) warnings.push(`guarantee_beneficiary_wording_not_matched:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.varianceState === 'under_guaranteed') warnings.push(`guarantee_amount_below_required:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.validThroughFiguresExpiry === false) warnings.push(`guarantee_expires_before_figures:${guarantee.guaranteeId || 'unknown'}`)
    if (guarantee.status !== GS.accepted) warnings.push(`guarantee_acceptance_required:${guarantee.guaranteeId || 'unknown'}`)
    guarantee.evidenceContract?.evidenceGaps?.forEach((gap) => warnings.push(`guarantee_evidence_gap:${guarantee.guaranteeId}:${gap}`))
    guarantee.evidenceContract?.rejectedEvidenceKeys?.forEach((gap) => errors.push(`guarantee_evidence_rejected:${guarantee.guaranteeId}:${gap}`))
  })

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

export function buildCancellationGuaranteeNextActions(workspace = {}) {
  const figureAction = workspace.figuresGate?.ready === false
    ? [Object.freeze({
        guaranteeId: null,
        reference: null,
        ownerRole: OR.cancellationAttorney,
        priority: 'critical',
        actionLabel: 'Clear cancellation figures before guarantee acceptance',
        reason: 'figures_gate_not_ready',
        blockerIds: Object.freeze(['figures_gate_not_ready']),
      })]
    : []
  const guaranteeActions = (workspace.guarantees || []).map(buildNextAction).filter(Boolean)
  return Object.freeze([...figureAction, ...guaranteeActions].sort((left, right) => {
    const priorityRank = { critical: 0, high: 1, normal: 2 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.reference || '').localeCompare(text(right.reference || '')) ||
      text(left.guaranteeId || '').localeCompare(text(right.guaranteeId || ''))
  }))
}

export function buildCancellationGuaranteeScheduleModel(workspace = {}) {
  return buildScheduleModel({ workspace })
}

export function buildCancellationGuaranteeWorkspace({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  figuresRegister = null,
  guarantees = null,
  actor = {},
  commandId = 'cancellation-guarantee-workspace',
  generatedAt = new Date().toISOString(),
} = {}) {
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ transaction, lane, evidence, generatedAt })
  const packWorkspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  const effectiveFiguresRegister = figuresRegister || buildCancellationFiguresRegister({
    workspace: effectiveWorkspace,
    transaction,
    lane,
    evidence,
    actor,
    commandId: `${commandId}-figures-gate`,
    generatedAt,
  })
  const facts = effectiveWorkspace.canonicalData?.factsByKey || {}
  const sourceGuarantees = guarantees === null || guarantees === undefined ? deriveCanonicalGuaranteeSource(facts) : asArray(guarantees)
  const normalizedGuarantees = Object.freeze(sourceGuarantees
    .map((guarantee, index) => normalizeGuarantee(guarantee, index, { facts, figuresRegister: effectiveFiguresRegister }))
    .sort(guaranteeSort))
  const metrics = buildMetrics(normalizedGuarantees)
  const guaranteeFingerprint = buildGuaranteeFingerprint(normalizedGuarantees)
  const factStatuses = Object.freeze(Object.fromEntries((CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.requiredFactKeys || []).map((factKey) => [factKey, facts?.[factKey]?.status || FACT_STATUSES.missing])))
  const factFingerprints = Object.freeze(Object.fromEntries((CANCELLATION_GUARANTEE_CONTROL_BOUNDARY.requiredFactKeys || []).map((factKey) => [factKey, facts?.[factKey]?.fingerprint || null])))
  const status = effectiveFiguresRegister.readyForPhase6 !== true
    ? WS.blocked
    : metrics.blockedGuaranteeCount > 0
      ? WS.blocked
      : metrics.attentionGuaranteeCount > 0
        ? WS.review
        : metrics.matchedGuaranteeCount > 0
          ? WS.ready
          : WS.waiting
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE6_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt,
    status,
    figuresGate: Object.freeze({
      ready: effectiveFiguresRegister.readyForPhase6 === true,
      figuresFingerprint: effectiveFiguresRegister.figuresFingerprint || null,
      validation: effectiveFiguresRegister.validation || null,
      blockedFigureCount: effectiveFiguresRegister.metrics?.blockedFigureCount ?? null,
      attentionFigureCount: effectiveFiguresRegister.metrics?.attentionFigureCount ?? null,
      activeFigureId: effectiveFiguresRegister.activeFigure?.figureId || null,
    }),
    factStatuses,
    factFingerprints,
    packWorkspaceValidation,
    guarantees: normalizedGuarantees,
    activeGuarantee: normalizedGuarantees.find((item) => ![GS.superseded, GS.rejected].includes(item.status)) || normalizedGuarantees[0] || null,
    metrics,
    guaranteeFingerprint,
    controls: CANCELLATION_GUARANTEE_CONTROL_BOUNDARY,
    readyForPhase7: false,
  })
  const validation = validateCancellationGuaranteeWorkspace(shell)
  const nextActions = buildCancellationGuaranteeNextActions(shell)
  const readyForPhase7 = validation.valid &&
    effectiveFiguresRegister.readyForPhase6 === true &&
    metrics.guaranteeCount > 0 &&
    metrics.matchedGuaranteeCount > 0 &&
    metrics.blockedGuaranteeCount === 0 &&
    metrics.attentionGuaranteeCount === 0 &&
    metrics.evidenceGapCount === 0 &&
    metrics.rejectedEvidenceCount === 0 &&
    metrics.underGuaranteedCount === 0 &&
    metrics.wordingMismatchCount === 0 &&
    metrics.acceptancePendingCount === 0 &&
    metrics.expiryRiskCount === 0
  const guaranteeWorkspace = Object.freeze({
    ...shell,
    validation,
    nextActions,
    scheduleModel: buildScheduleModel({ workspace: { ...shell, nextActions } }),
    readyForPhase7,
  })
  return Object.freeze({
    ...guaranteeWorkspace,
    auditEvent: buildAuditEvent({ packWorkspace: effectiveWorkspace, guaranteeWorkspace, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildCancellationAttorneyPhase6BaselineReport(input = {}) {
  const workspace = buildCancellationGuaranteeWorkspace(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE6_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE6_RELEASE_BLOCKER_ID,
    status: workspace.status,
    guaranteeCount: workspace.metrics.guaranteeCount,
    matchedGuaranteeCount: workspace.metrics.matchedGuaranteeCount,
    blockedGuaranteeCount: workspace.metrics.blockedGuaranteeCount,
    attentionGuaranteeCount: workspace.metrics.attentionGuaranteeCount,
    evidenceGapCount: workspace.metrics.evidenceGapCount,
    amountMismatchCount: workspace.metrics.amountMismatchCount,
    wordingMismatchCount: workspace.metrics.wordingMismatchCount,
    acceptancePendingCount: workspace.metrics.acceptancePendingCount,
    expiryRiskCount: workspace.metrics.expiryRiskCount,
    validation: workspace.validation,
    nextActionCount: workspace.nextActions.length,
    controls: workspace.controls,
    readyForPhase7: workspace.readyForPhase7,
  })
}
