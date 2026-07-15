import { CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES } from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'
import {
  buildCancellationFiguresRegister,
  validateCancellationFiguresRegister,
} from './cancellationAttorneyModulePhase5.js'
import {
  buildCancellationLodgementEvidencePacket,
  validateCancellationLodgementEvidencePacket,
} from './cancellationAttorneyModulePhase8.js'

export const CANCELLATION_ATTORNEY_PHASE9_VERSION = 'cancellation_attorney_module_phase9_settlement_closeout_packet_v1'
export const CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID = 'settlement_closeout_packet_missing'

export const CANCELLATION_SETTLEMENT_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const CANCELLATION_SETTLEMENT_PACKET_STATUSES = Object.freeze({
  blocked: 'blocked',
  settlementProofReceived: 'settlement_proof_received',
  reconciled: 'reconciled',
  closed: 'closed',
})

export const CANCELLATION_SETTLEMENT_EVIDENCE_SOURCE_TYPES = Object.freeze({
  proofOfPaymentUpload: 'proof_of_payment_upload',
  trustAccountStatement: 'trust_account_statement',
  existingLenderPortal: 'existing_lender_portal',
  existingLenderEmail: 'existing_lender_email',
  bankConfirmation: 'bank_confirmation',
  transferAttorneyConfirmation: 'transfer_attorney_confirmation',
  cancellationAttorneyUpload: 'cancellation_attorney_upload',
  manualUpload: 'manual_upload',
  systemGenerated: 'system_generated',
  stageOnly: 'stage_only',
})

export const CANCELLATION_SETTLEMENT_REQUIREMENT_KEYS = Object.freeze({
  settlementPaymentEvidence: 'settlement_payment_evidence',
  lenderSettlementConfirmation: 'lender_settlement_confirmation',
  closeoutReviewEvidence: 'closeout_review_evidence',
})

export const CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY = Object.freeze({
  packetBoundEvidenceOnly: true,
  requiresPhase8LodgementRegistrationPacket: true,
  requiresFiguresRegisterReady: true,
  requiresVerifiedCanonicalFacts: true,
  requiresSettlementPaymentEvidence: true,
  requiresLenderSettlementConfirmation: true,
  requiresCloseoutReviewEvidence: true,
  reconcilesSettlementToFigures: true,
  reconcilesSettlementToRegistration: true,
  blocksUnresolvedExceptions: true,
  marksCloseoutFromStageOnly: false,
  executesSettlementPayment: false,
  requestsExternalSettlementAutomatically: false,
  synthesizesPaymentConfirmation: false,
  synthesizesLenderDischarge: false,
  submitsToBankPortal: false,
  integratesWithExistingLenderPortal: false,
  integratesWithDeedsOffice: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

const ES = CANCELLATION_SETTLEMENT_EVIDENCE_STATUSES
const PS = CANCELLATION_SETTLEMENT_PACKET_STATUSES
const ST = CANCELLATION_SETTLEMENT_EVIDENCE_SOURCE_TYPES
const RK = CANCELLATION_SETTLEMENT_REQUIREMENT_KEYS
const FACT_STATUSES = CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES

const EVIDENCE_STATUS_SET = new Set(Object.values(ES))
const BLOCKED_SOURCE_TYPES = new Set([ST.systemGenerated, ST.stageOnly])
const ALLOWED_SOURCE_TYPES = new Set(Object.values(ST).filter((sourceType) => !BLOCKED_SOURCE_TYPES.has(sourceType)))
const CLOSED_STATUS_VALUES = new Set(['complete', 'completed', 'closed', 'closeout_complete', 'settlement_closed', 'ready_to_close'])

const REQUIREMENTS = Object.freeze([
  Object.freeze({
    key: RK.settlementPaymentEvidence,
    label: 'Settlement payment proof',
    factKeys: Object.freeze(['settlement_amount', 'settlement_payment_reference']),
    evidenceDocumentKey: 'proof_of_settlement',
    sourceCategory: 'payment',
    preferredSourceTypes: Object.freeze([
      ST.proofOfPaymentUpload,
      ST.trustAccountStatement,
      ST.bankConfirmation,
      ST.cancellationAttorneyUpload,
      ST.manualUpload,
    ]),
    requiresAmount: true,
    requiresPaymentReference: true,
  }),
  Object.freeze({
    key: RK.lenderSettlementConfirmation,
    label: 'Existing-lender settlement confirmation',
    factKeys: Object.freeze(['settlement_payment_reference', 'cancellation_registration_reference']),
    evidenceDocumentKey: 'lender_settlement_confirmation',
    sourceCategory: 'existing_lender',
    preferredSourceTypes: Object.freeze([
      ST.existingLenderPortal,
      ST.existingLenderEmail,
      ST.bankConfirmation,
      ST.manualUpload,
    ]),
    requiresPaymentReference: true,
  }),
  Object.freeze({
    key: RK.closeoutReviewEvidence,
    label: 'Cancellation close-out review',
    factKeys: Object.freeze(['closeout_status', 'cancellation_registration_reference', 'cancellation_registration_date']),
    evidenceDocumentKey: 'settlement_closeout_report',
    sourceCategory: 'firm_review',
    preferredSourceTypes: Object.freeze([
      ST.cancellationAttorneyUpload,
      ST.manualUpload,
    ]),
    requiresCloseoutComplete: true,
  }),
])

const REQUIREMENT_BY_KEY = REQUIREMENTS.reduce((result, requirement) => ({ ...result, [requirement.key]: requirement }), {})

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

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.evidence)) return value.evidence
    if (Array.isArray(value.items)) return value.items
    return Object.entries(value).map(([itemKey, itemValue]) => {
      if (itemValue && typeof itemValue === 'object' && !Array.isArray(itemValue)) return { requirementKey: itemKey, ...itemValue }
      return { requirementKey: itemKey, referenceId: itemValue }
    })
  }
  return []
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function amountMatches(left, right) {
  const leftAmount = numberOrNull(left)
  const rightAmount = numberOrNull(right)
  if (leftAmount === null || rightAmount === null) return false
  return Math.abs(leftAmount - rightAmount) < 0.01
}

function normalizeEvidenceStatus(value = '', fallback = ES.missing) {
  const normalized = key(value)
  if (['approved', 'accepted', 'reviewed', 'confirmed', 'paid', 'cleared'].includes(normalized)) return ES.verified
  if (['attached', 'uploaded', 'received', 'supplied'].includes(normalized)) return ES.provided
  if (['declined'].includes(normalized)) return ES.rejected
  return EVIDENCE_STATUS_SET.has(normalized) ? normalized : fallback
}

function normalizeSourceType(value = '') {
  const normalized = key(value)
  if (['proof', 'proof_of_payment', 'payment_proof', 'pop'].includes(normalized)) return ST.proofOfPaymentUpload
  if (['trust', 'trust_statement', 'trust_account'].includes(normalized)) return ST.trustAccountStatement
  if (['existing_lender', 'lender_portal', 'bank_portal', 'portal'].includes(normalized)) return ST.existingLenderPortal
  if (['email', 'lender_email', 'bank_email', 'bank_mail'].includes(normalized)) return ST.existingLenderEmail
  if (['bank', 'bank_confirmation', 'payment_confirmation'].includes(normalized)) return ST.bankConfirmation
  if (['transfer_attorney', 'transfer_handoff', 'transfer_confirmation'].includes(normalized)) return ST.transferAttorneyConfirmation
  if (['attorney_upload', 'cancellation_attorney', 'cancellation_upload'].includes(normalized)) return ST.cancellationAttorneyUpload
  if (['manual', 'manual_upload', 'file_upload', 'upload'].includes(normalized)) return ST.manualUpload
  if (['stage', 'stage_only', 'workflow_stage'].includes(normalized)) return ST.stageOnly
  if (['system', 'system_generated', 'generated'].includes(normalized)) return ST.systemGenerated
  return normalized || ST.cancellationAttorneyUpload
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  const requirementKey = key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key || source.documentKey || source.document_key)
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `cancellation-settlement-evidence-${index + 1}`,
    requirementKey,
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? ES.provided : ES.missing),
    sourceType: normalizeSourceType(source.sourceType || source.source_type || source.source || source.channel),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    externalReference: text(source.externalReference || source.external_reference || source.reference || source.ref) || null,
    paymentReference: text(source.paymentReference || source.payment_reference || source.paymentRef || source.payment_ref) || null,
    registrationReference: text(source.registrationReference || source.registration_reference || source.cancellationRegistrationReference || source.cancellation_registration_reference) || null,
    amount: numberOrNull(source.amount ?? source.paymentAmount ?? source.payment_amount ?? source.settlementAmount ?? source.settlement_amount),
    paidAt: source.paidAt || source.paid_at || source.paymentDate || source.payment_date || source.issuedAt || source.issued_at || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    verifiedAt: source.verifiedAt || source.verified_at || source.reviewedAt || source.reviewed_at || null,
    verifiedBy: actorSummary(source.verifiedBy || source.verified_by || {}),
    unresolvedExceptionCount: Math.max(0, Number(source.unresolvedExceptionCount ?? source.unresolved_exception_count ?? source.exceptionCount ?? source.exception_count ?? 0) || 0),
    reason: text(source.reason || source.waiverReason || source.waiver_reason) || null,
  })
}

function findEvidenceForRequirement(evidenceItems, requirement) {
  return evidenceItems.find((item) => item.requirementKey === requirement.key || item.requirementKey === requirement.evidenceDocumentKey) || null
}

function factStatus(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.status || FACT_STATUSES.missing
}

function factValue(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.value ?? null
}

function factFingerprint(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.fingerprint || null
}

function firstUsableReference(...values) {
  return values.map(text).find(Boolean) || null
}

function compareReference(left, right) {
  if (!text(left) || !text(right)) return false
  return key(left) === key(right)
}

function activeFigure(figuresRegister = {}) {
  return figuresRegister.activeFigure || (figuresRegister.figures || []).find((figure) => figure.validityState === 'ready') || figuresRegister.figures?.[0] || null
}

function expectedSettlementAmount(figuresRegister = {}) {
  const figure = activeFigure(figuresRegister)
  return figure?.projectedSettlementAmount ?? figure?.amount ?? null
}

function compareDateOnly(left, right) {
  if (!validDate(left) || !validDate(right)) return null
  const leftDate = new Date(left)
  const rightDate = new Date(right)
  const leftUtc = Date.UTC(leftDate.getUTCFullYear(), leftDate.getUTCMonth(), leftDate.getUTCDate())
  const rightUtc = Date.UTC(rightDate.getUTCFullYear(), rightDate.getUTCMonth(), rightDate.getUTCDate())
  return leftUtc - rightUtc
}

function buildRequirementRecord({ requirement, evidenceItem, workspace, figuresRegister }) {
  const factStatuses = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factStatus(workspace, factKey) }), {})
  const factFingerprints = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factFingerprint(workspace, factKey) }), {})
  const evidenceStatus = evidenceItem?.status || ES.missing
  const settlementAmount = factValue(workspace, 'settlement_amount')
  const paymentReference = text(factValue(workspace, 'settlement_payment_reference'))
  const registrationReference = text(factValue(workspace, 'cancellation_registration_reference'))
  const registrationDate = factValue(workspace, 'cancellation_registration_date')
  const figure = activeFigure(figuresRegister)
  const expectedAmount = expectedSettlementAmount(figuresRegister)
  const evidencePaymentReference = firstUsableReference(evidenceItem?.paymentReference, evidenceItem?.externalReference)
  const errors = []

  requirement.factKeys.forEach((factKey) => {
    if (factStatus(workspace, factKey) !== FACT_STATUSES.verified) errors.push(`canonical_fact_not_verified:${factKey}`)
  })

  if (!evidenceItem) errors.push('settlement_evidence_missing')
  if (evidenceItem && evidenceStatus !== ES.verified) errors.push(`settlement_evidence_not_verified:${evidenceStatus}`)
  if (evidenceItem && !evidenceItem.referenceId) errors.push('settlement_evidence_reference_required')
  if (evidenceItem && !validDate(evidenceItem.capturedAt)) errors.push('settlement_evidence_captured_at_required')
  if (evidenceItem && !validDate(evidenceItem.verifiedAt)) errors.push('settlement_evidence_verified_at_required')
  if (evidenceItem && !evidenceItem.verifiedBy.userId) errors.push('settlement_evidence_verifier_required')
  if (evidenceItem && BLOCKED_SOURCE_TYPES.has(evidenceItem.sourceType)) errors.push(`settlement_evidence_source_forbidden:${evidenceItem.sourceType}`)
  if (evidenceItem && !ALLOWED_SOURCE_TYPES.has(evidenceItem.sourceType)) errors.push(`settlement_evidence_source_unknown:${evidenceItem.sourceType}`)
  if (evidenceItem && !requirement.preferredSourceTypes.includes(evidenceItem.sourceType)) errors.push(`settlement_evidence_source_unexpected:${evidenceItem.sourceType}`)

  if (requirement.key === RK.settlementPaymentEvidence && evidenceItem) {
    if (evidenceItem.amount === null) errors.push('settlement_proof_amount_required')
    else if (!amountMatches(evidenceItem.amount, settlementAmount)) errors.push('settlement_proof_amount_mismatch_fact')
    if (expectedAmount !== null && !amountMatches(settlementAmount, expectedAmount)) errors.push('settlement_amount_mismatch_figures')
    if (!evidencePaymentReference) errors.push('settlement_payment_reference_required')
    else if (paymentReference && !compareReference(evidencePaymentReference, paymentReference)) errors.push('settlement_payment_reference_mismatch')
    if (!validDate(evidenceItem.paidAt)) errors.push('settlement_payment_date_required')
    if (validDate(evidenceItem.paidAt) && validDate(registrationDate) && compareDateOnly(evidenceItem.paidAt, registrationDate) < 0) errors.push('settlement_before_registration')
    if (validDate(evidenceItem.paidAt) && validDate(figure?.expiryDate) && compareDateOnly(figure.expiryDate, evidenceItem.paidAt) < 0) errors.push('figures_expired_before_settlement')
  }

  if (requirement.key === RK.lenderSettlementConfirmation && evidenceItem) {
    if (!evidencePaymentReference) errors.push('lender_confirmation_payment_reference_required')
    else if (paymentReference && !compareReference(evidencePaymentReference, paymentReference)) errors.push('lender_confirmation_payment_reference_mismatch')
    if (evidenceItem.registrationReference && registrationReference && !compareReference(evidenceItem.registrationReference, registrationReference)) errors.push('lender_confirmation_registration_reference_mismatch')
  }

  if (requirement.key === RK.closeoutReviewEvidence) {
    if (!CLOSED_STATUS_VALUES.has(key(factValue(workspace, 'closeout_status')))) errors.push('closeout_status_not_complete')
    if (evidenceItem?.unresolvedExceptionCount > 0) errors.push('unresolved_closeout_exceptions')
  }

  return Object.freeze({
    requirementKey: requirement.key,
    label: requirement.label,
    sourceCategory: requirement.sourceCategory,
    factKeys: requirement.factKeys,
    factStatuses: Object.freeze(factStatuses),
    factFingerprints: Object.freeze(factFingerprints),
    evidence: evidenceItem ? Object.freeze({
      evidenceId: evidenceItem.evidenceId,
      status: evidenceItem.status,
      sourceType: evidenceItem.sourceType,
      referenceId: evidenceItem.referenceId,
      externalReference: evidenceItem.externalReference,
      paymentReference: evidenceItem.paymentReference,
      registrationReference: evidenceItem.registrationReference,
      paidAt: evidenceItem.paidAt,
      capturedAt: evidenceItem.capturedAt,
      verifiedAt: evidenceItem.verifiedAt,
      verifiedBy: evidenceItem.verifiedBy,
      unresolvedExceptionCount: evidenceItem.unresolvedExceptionCount,
    }) : null,
    figuresBinding: Object.freeze({
      figureId: figure?.figureId || null,
      sourceReference: figure?.sourceReference || null,
      expiryDate: figure?.expiryDate || null,
      expectedSettlementAmountFingerprint: expectedAmount === null ? null : hash({ amount: expectedAmount }),
    }),
    satisfied: errors.length === 0,
    errors: Object.freeze(unique(errors)),
  })
}

function buildPacketFingerprint(records) {
  return hash(records.map((record) => ({
    requirementKey: record.requirementKey,
    factFingerprints: record.factFingerprints,
    figuresBinding: record.figuresBinding,
    evidence: record.evidence ? {
      status: record.evidence.status,
      sourceType: record.evidence.sourceType,
      referenceId: record.evidence.referenceId,
      externalReference: record.evidence.externalReference,
      paymentReference: record.evidence.paymentReference,
      registrationReference: record.evidence.registrationReference,
      paidAt: record.evidence.paidAt,
      verifiedAt: record.evidence.verifiedAt,
    } : null,
  })))
}

function deriveStatus({ phase8Ready, figuresReady, records }) {
  if (!phase8Ready || !figuresReady || records.some((record) => !record.satisfied)) return PS.blocked
  const settlementProofReady = records.find((record) => record.requirementKey === RK.settlementPaymentEvidence)?.satisfied === true
  const lenderReady = records.find((record) => record.requirementKey === RK.lenderSettlementConfirmation)?.satisfied === true
  const closeoutReady = records.find((record) => record.requirementKey === RK.closeoutReviewEvidence)?.satisfied === true
  if (settlementProofReady && lenderReady && closeoutReady) return PS.closed
  if (settlementProofReady && lenderReady) return PS.reconciled
  if (settlementProofReady) return PS.settlementProofReceived
  return PS.blocked
}

function buildMetrics(records = []) {
  return Object.freeze({
    requirementCount: records.length,
    satisfiedCount: records.filter((record) => record.satisfied).length,
    missingEvidenceCount: records.filter((record) => record.errors.includes('settlement_evidence_missing')).length,
    unverifiedEvidenceCount: records.filter((record) => record.errors.some((error) => error.startsWith('settlement_evidence_not_verified'))).length,
    rejectedEvidenceCount: records.filter((record) => record.evidence?.status === ES.rejected).length,
    stageOnlyEvidenceCount: records.filter((record) => record.errors.some((error) => error.includes(ST.stageOnly))).length,
    systemGeneratedEvidenceCount: records.filter((record) => record.errors.some((error) => error.includes(ST.systemGenerated))).length,
    canonicalFactGapCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.startsWith('canonical_fact_not_verified')).length, 0),
    amountMismatchCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.includes('amount_mismatch')).length, 0),
    referenceMismatchCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.includes('reference_mismatch')).length, 0),
    figuresExpiredCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error === 'figures_expired_before_settlement').length, 0),
    unresolvedExceptionCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error === 'unresolved_closeout_exceptions').length, 0),
  })
}

function buildNextAction(record) {
  if (!record || record.satisfied) return null
  const firstError = record.errors[0] || 'settlement_closeout_incomplete'
  let actionLabel = `Attach ${record.label}`
  if (firstError.startsWith('canonical_fact_not_verified')) actionLabel = 'Verify settlement close-out fact'
  else if (firstError === 'settlement_evidence_missing') actionLabel = `Attach ${record.label}`
  else if (firstError.startsWith('settlement_evidence_not_verified')) actionLabel = `Verify ${record.label}`
  else if (firstError === 'settlement_evidence_reference_required') actionLabel = 'Link settlement evidence artifact'
  else if (firstError.startsWith('settlement_evidence_source_forbidden')) actionLabel = 'Replace stage-only/system settlement evidence'
  else if (firstError.includes('amount_mismatch')) actionLabel = 'Reconcile settlement amount to cancellation figures'
  else if (firstError.includes('payment_reference') || firstError.includes('registration_reference')) actionLabel = 'Resolve settlement reference mismatch'
  else if (firstError === 'settlement_payment_date_required') actionLabel = 'Capture settlement payment date'
  else if (firstError === 'settlement_before_registration') actionLabel = 'Review settlement timing against registration'
  else if (firstError === 'figures_expired_before_settlement') actionLabel = 'Request updated cancellation settlement confirmation'
  else if (firstError === 'closeout_status_not_complete') actionLabel = 'Complete cancellation close-out review'
  else if (firstError === 'unresolved_closeout_exceptions') actionLabel = 'Clear close-out exceptions'
  return Object.freeze({
    requirementKey: record.requirementKey,
    priority: ['settlement_evidence_missing', 'settlement_proof_amount_mismatch_fact', 'settlement_amount_mismatch_figures', 'unresolved_closeout_exceptions'].includes(firstError) ? 'critical' : 'high',
    actionLabel,
    reason: firstError,
  })
}

export function listCancellationSettlementRequirementKeys() {
  return Object.freeze(REQUIREMENTS.map((requirement) => requirement.key))
}

export function buildCancellationSettlementCloseoutNextActions(packet = {}) {
  const gateActions = []
  if (packet.phase8Gate?.ready !== true) {
    gateActions.push(Object.freeze({
      requirementKey: null,
      priority: 'critical',
      actionLabel: 'Complete Phase 8 lodgement/registration evidence packet',
      reason: 'phase8_packet_not_ready',
    }))
  }
  if (packet.figuresGate?.ready !== true) {
    gateActions.push(Object.freeze({
      requirementKey: null,
      priority: 'critical',
      actionLabel: 'Clear cancellation figures register before close-out',
      reason: 'figures_register_not_ready',
    }))
  }
  const recordActions = (packet.records || []).map(buildNextAction).filter(Boolean)
  return Object.freeze([...gateActions, ...recordActions].sort((left, right) => {
    const priorityRank = { critical: 0, high: 1, normal: 2 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.requirementKey || '').localeCompare(text(right.requirementKey || ''))
  }))
}

export function validateCancellationSettlementCloseoutPacket(packet = {}) {
  const errors = []
  const warnings = []
  if (packet.version !== CANCELLATION_ATTORNEY_PHASE9_VERSION) errors.push('settlement_closeout_packet_version_invalid')
  if (packet.workspaceValidation && packet.workspaceValidation.valid !== true) errors.push(...packet.workspaceValidation.errors.map((error) => `workspace:${error}`))
  if (packet.phase8Gate?.ready !== true) errors.push('phase8_packet_not_ready')
  if (packet.figuresGate?.ready !== true) errors.push('figures_register_not_ready')
  if (!Array.isArray(packet.records) || packet.records.length !== REQUIREMENTS.length) errors.push('settlement_closeout_requirements_incomplete')
  ;(packet.records || []).forEach((record) => {
    if (!REQUIREMENT_BY_KEY[record.requirementKey]) errors.push(`unknown_settlement_requirement:${record.requirementKey}`)
    record.errors?.forEach((error) => {
      if (error.startsWith('settlement_evidence_source_unexpected')) warnings.push(`${record.requirementKey}:${error}`)
      else errors.push(`${record.requirementKey}:${error}`)
    })
  })
  if (packet.controls?.marksCloseoutFromStageOnly !== false) errors.push('stage_only_closeout_boundary_required')
  if (packet.controls?.executesSettlementPayment !== false) errors.push('settlement_execution_boundary_required')
  if (packet.controls?.synthesizesPaymentConfirmation !== false) errors.push('payment_confirmation_synthesis_boundary_required')
  if (packet.controls?.synthesizesLenderDischarge !== false) errors.push('lender_discharge_synthesis_boundary_required')
  if (packet.controls?.writesExternalSystem !== false) errors.push('external_write_boundary_required')
  if (packet.controls?.mutatesMatter !== false) errors.push('matter_mutation_boundary_required')
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

function buildAuditEvent({ workspace, packet, actor, commandId, occurredAt }) {
  const base = buildCancellationPackWorkspaceAuditEvent({
    workspace,
    eventType: 'cancellation_settlement_closeout_packet_prepared',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE9_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    packetStatus: packet.status,
    packetFingerprint: packet.packetFingerprint,
    settlementMetrics: packet.metrics,
    phase8GateReady: packet.phase8Gate.ready,
    figuresGateReady: packet.figuresGate.ready,
    readyForPhase10: packet.readyForPhase10,
    records: packet.records.map((record) => Object.freeze({
      requirementKey: record.requirementKey,
      satisfied: record.satisfied,
      factFingerprints: record.factFingerprints,
      figureId: record.figuresBinding.figureId,
      evidenceStatus: record.evidence?.status || ES.missing,
      sourceType: record.evidence?.sourceType || null,
      referenceId: record.evidence?.referenceId || null,
      externalReference: record.evidence?.externalReference || null,
      paymentReference: record.evidence?.paymentReference || null,
      verifiedAt: record.evidence?.verifiedAt || null,
    })),
  })
}

export function buildCancellationSettlementCloseoutPacket({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  lodgementPacket = null,
  figuresRegister = null,
  settlementEvidence = [],
  settlementDate = '',
  documentSigningWorkspace = null,
  guaranteeWorkspace = null,
  guarantees = null,
  templates = {},
  documents = null,
  packetEvidence = [],
  actor = {},
  commandId = 'cancellation-settlement-closeout-packet',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  const effectiveFiguresRegister = figuresRegister || buildCancellationFiguresRegister({
    workspace: effectiveWorkspace,
    settlementDate,
    actor,
    commandId: `${commandId}-figures-gate`,
    generatedAt,
    asOf,
  })
  const figuresValidation = validateCancellationFiguresRegister(effectiveFiguresRegister)
  const figuresReady = figuresValidation.valid && effectiveFiguresRegister.readyForPhase6 === true
  const effectiveLodgementPacket = lodgementPacket || buildCancellationLodgementEvidencePacket({
    workspace: effectiveWorkspace,
    figuresRegister: effectiveFiguresRegister,
    documentSigningWorkspace,
    guaranteeWorkspace,
    guarantees,
    templates,
    documents,
    packetEvidence,
    actor,
    commandId: `${commandId}-phase8-lodgement-registration-gate`,
    generatedAt,
    asOf,
  })
  const lodgementValidation = validateCancellationLodgementEvidencePacket(effectiveLodgementPacket)
  const phase8Ready = lodgementValidation.valid && effectiveLodgementPacket.readyForPhase9 === true
  const evidenceItems = Object.freeze(asArray(settlementEvidence).map(normalizeEvidenceItem))
  const records = Object.freeze(REQUIREMENTS.map((requirement) => buildRequirementRecord({
    requirement,
    evidenceItem: findEvidenceForRequirement(evidenceItems, requirement),
    workspace: effectiveWorkspace,
    figuresRegister: effectiveFiguresRegister,
  })))
  const metrics = buildMetrics(records)
  const packetFingerprint = buildPacketFingerprint(records)
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE9_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt,
    asOf,
    status: deriveStatus({ phase8Ready, figuresReady, records }),
    workspaceValidation,
    phase8Gate: Object.freeze({
      ready: phase8Ready,
      status: effectiveLodgementPacket.status || null,
      packetFingerprint: effectiveLodgementPacket.packetFingerprint || null,
      satisfiedCount: effectiveLodgementPacket.metrics?.satisfiedCount || 0,
      missingEvidenceCount: effectiveLodgementPacket.metrics?.missingEvidenceCount || 0,
      validation: lodgementValidation,
    }),
    figuresGate: Object.freeze({
      ready: figuresReady,
      figuresFingerprint: effectiveFiguresRegister.figuresFingerprint || null,
      readyFigureCount: effectiveFiguresRegister.metrics?.readyFigureCount || 0,
      blockedFigureCount: effectiveFiguresRegister.metrics?.blockedFigureCount || 0,
      expectedSettlementAmountFingerprint: expectedSettlementAmount(effectiveFiguresRegister) === null ? null : hash({ amount: expectedSettlementAmount(effectiveFiguresRegister) }),
      validation: figuresValidation,
    }),
    records,
    metrics,
    packetFingerprint,
    controls: CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY,
    readyForPhase10: false,
  })
  const validation = validateCancellationSettlementCloseoutPacket(shell)
  const readyForPhase10 = validation.valid &&
    phase8Ready &&
    figuresReady &&
    metrics.requirementCount === REQUIREMENTS.length &&
    metrics.satisfiedCount === REQUIREMENTS.length &&
    metrics.amountMismatchCount === 0 &&
    metrics.referenceMismatchCount === 0 &&
    metrics.figuresExpiredCount === 0 &&
    metrics.unresolvedExceptionCount === 0 &&
    shell.status === PS.closed &&
    CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.executesSettlementPayment === false &&
    CANCELLATION_SETTLEMENT_CLOSEOUT_BOUNDARY.synthesizesPaymentConfirmation === false
  const packet = Object.freeze({
    ...shell,
    validation,
    readyForPhase10,
  })
  return Object.freeze({
    ...packet,
    nextActions: buildCancellationSettlementCloseoutNextActions(packet),
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, packet: { ...packet, readyForPhase10 }, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildCancellationAttorneyPhase9BaselineReport(input = {}) {
  const packet = buildCancellationSettlementCloseoutPacket(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE9_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    status: packet.status,
    requirementCount: packet.metrics.requirementCount,
    satisfiedCount: packet.metrics.satisfiedCount,
    missingEvidenceCount: packet.metrics.missingEvidenceCount,
    amountMismatchCount: packet.metrics.amountMismatchCount,
    referenceMismatchCount: packet.metrics.referenceMismatchCount,
    unresolvedExceptionCount: packet.metrics.unresolvedExceptionCount,
    validation: packet.validation,
    nextActionCount: packet.nextActions.length,
    controls: packet.controls,
    readyForPhase10: packet.readyForPhase10,
  })
}
