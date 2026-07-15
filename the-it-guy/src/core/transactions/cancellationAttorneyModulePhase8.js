import { CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES } from './cancellationAttorneyModulePhase2.js'
import {
  buildCancellationPackWorkspace,
  buildCancellationPackWorkspaceAuditEvent,
  validateCancellationPackWorkspace,
} from './cancellationAttorneyModulePhase3.js'
import {
  buildCancellationDocumentSigningWorkspace,
  validateCancellationDocumentSigningWorkspace,
} from './cancellationAttorneyModulePhase7.js'

export const CANCELLATION_ATTORNEY_PHASE8_VERSION = 'cancellation_attorney_module_phase8_lodgement_registration_evidence_packet_v1'
export const CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID = 'cancellation_lodgement_registration_evidence_not_packet_bound'

export const CANCELLATION_LODGEMENT_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const CANCELLATION_LODGEMENT_PACKET_STATUSES = Object.freeze({
  blocked: 'blocked',
  readyToLodge: 'ready_to_lodge',
  lodged: 'lodged',
  registered: 'registered',
})

export const CANCELLATION_LODGEMENT_EVIDENCE_SOURCE_TYPES = Object.freeze({
  existingLenderPortal: 'existing_lender_portal',
  existingLenderEmail: 'existing_lender_email',
  transferAttorneyConfirmation: 'transfer_attorney_confirmation',
  bondAttorneyConfirmation: 'bond_attorney_confirmation',
  cancellationAttorneyUpload: 'cancellation_attorney_upload',
  deedsOfficeNotice: 'deeds_office_notice',
  externalRegistry: 'external_registry',
  manualUpload: 'manual_upload',
  systemGenerated: 'system_generated',
  stageOnly: 'stage_only',
})

export const CANCELLATION_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS = Object.freeze({
  simultaneousLodgementReadiness: 'simultaneous_lodgement_readiness_evidence',
  lodgementEvidence: 'lodgement_evidence',
  cancellationRegistrationEvidence: 'cancellation_registration_evidence',
})

export const CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY = Object.freeze({
  packetBoundEvidenceOnly: true,
  manualEvidenceAllowed: true,
  requiresPhase7DocumentSigningWorkspace: true,
  requiresVerifiedCanonicalFacts: true,
  requiresExternalOrUploadedEvidence: true,
  requiresSimultaneousLodgementEvidence: true,
  requiresLodgementEvidence: true,
  requiresRegistrationEvidence: true,
  marksRegistrationFromStageOnly: false,
  synthesizesLodgementOutcome: false,
  synthesizesRegistrationOutcome: false,
  submitsToBankPortal: false,
  integratesWithExistingLenderPortal: false,
  integratesWithDeedsOffice: false,
  generatesLegalInstrument: false,
  reconcilesSettlement: false,
  writesExternalSystem: false,
  mutatesMatter: false,
})

const ES = CANCELLATION_LODGEMENT_EVIDENCE_STATUSES
const PS = CANCELLATION_LODGEMENT_PACKET_STATUSES
const ST = CANCELLATION_LODGEMENT_EVIDENCE_SOURCE_TYPES
const RK = CANCELLATION_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS

const EVIDENCE_STATUS_SET = new Set(Object.values(ES))
const BLOCKED_SOURCE_TYPES = new Set([ST.systemGenerated, ST.stageOnly])
const ALLOWED_SOURCE_TYPES = new Set(Object.values(ST).filter((sourceType) => !BLOCKED_SOURCE_TYPES.has(sourceType)))

const REQUIREMENTS = Object.freeze([
  Object.freeze({
    key: RK.simultaneousLodgementReadiness,
    label: 'Simultaneous lodgement readiness evidence',
    factKeys: Object.freeze(['guarantee_acceptance_status', 'signed_cancellation_document_status']),
    evidenceDocumentKey: 'cancellation_lodgement_readiness_checklist',
    sourceCategory: 'linked_attorney_handoff',
    preferredSourceTypes: Object.freeze([
      ST.transferAttorneyConfirmation,
      ST.bondAttorneyConfirmation,
      ST.cancellationAttorneyUpload,
      ST.manualUpload,
    ]),
    blocksLodgement: true,
  }),
  Object.freeze({
    key: RK.lodgementEvidence,
    label: 'Cancellation lodgement evidence',
    factKeys: Object.freeze(['lodgement_reference', 'lodgement_date']),
    evidenceDocumentKey: 'lodgement_reference',
    sourceCategory: 'lodgement',
    preferredSourceTypes: Object.freeze([
      ST.cancellationAttorneyUpload,
      ST.manualUpload,
      ST.transferAttorneyConfirmation,
      ST.bondAttorneyConfirmation,
    ]),
    blocksLodgement: false,
  }),
  Object.freeze({
    key: RK.cancellationRegistrationEvidence,
    label: 'Cancellation registration/discharge evidence',
    factKeys: Object.freeze(['cancellation_registration_reference', 'cancellation_registration_date']),
    evidenceDocumentKey: 'cancellation_registration_evidence',
    sourceCategory: 'external_registry',
    preferredSourceTypes: Object.freeze([
      ST.deedsOfficeNotice,
      ST.externalRegistry,
      ST.existingLenderPortal,
      ST.existingLenderEmail,
      ST.cancellationAttorneyUpload,
      ST.manualUpload,
    ]),
    blocksLodgement: false,
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

function normalizeEvidenceStatus(value = '', fallback = ES.missing) {
  const normalized = key(value)
  if (['approved', 'accepted', 'reviewed', 'confirmed'].includes(normalized)) return ES.verified
  if (['attached', 'uploaded', 'received', 'supplied'].includes(normalized)) return ES.provided
  if (['declined'].includes(normalized)) return ES.rejected
  return EVIDENCE_STATUS_SET.has(normalized) ? normalized : fallback
}

function normalizeSourceType(value = '') {
  const normalized = key(value)
  if (['existing_lender', 'lender_portal', 'bank_portal', 'portal'].includes(normalized)) return ST.existingLenderPortal
  if (['email', 'lender_email', 'bank_email', 'bank_mail'].includes(normalized)) return ST.existingLenderEmail
  if (['transfer_attorney', 'transfer_handoff', 'transfer_confirmation'].includes(normalized)) return ST.transferAttorneyConfirmation
  if (['bond_attorney', 'bond_handoff', 'bond_confirmation'].includes(normalized)) return ST.bondAttorneyConfirmation
  if (['attorney_upload', 'cancellation_attorney', 'cancellation_upload'].includes(normalized)) return ST.cancellationAttorneyUpload
  if (['deeds', 'deeds_office', 'deeds_notice', 'registry_notice'].includes(normalized)) return ST.deedsOfficeNotice
  if (['registry', 'external_registry'].includes(normalized)) return ST.externalRegistry
  if (['manual', 'manual_upload', 'file_upload', 'upload'].includes(normalized)) return ST.manualUpload
  if (['stage', 'stage_only', 'workflow_stage'].includes(normalized)) return ST.stageOnly
  if (['system', 'system_generated', 'generated'].includes(normalized)) return ST.systemGenerated
  return normalized || ST.cancellationAttorneyUpload
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  const requirementKey = key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key || source.documentKey || source.document_key)
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `cancellation-lodgement-evidence-${index + 1}`,
    requirementKey,
    status: normalizeEvidenceStatus(source.status || source.evidenceStatus || source.evidence_status, text(source.referenceId || source.reference_id || source.documentId || source.document_id) ? ES.provided : ES.missing),
    sourceType: normalizeSourceType(source.sourceType || source.source_type || source.source || source.channel),
    referenceId: text(source.referenceId || source.reference_id || source.documentId || source.document_id || source.fileId || source.file_id) || null,
    externalReference: text(source.externalReference || source.external_reference || source.reference || source.ref) || null,
    capturedAt: source.capturedAt || source.captured_at || null,
    verifiedAt: source.verifiedAt || source.verified_at || source.reviewedAt || source.reviewed_at || null,
    verifiedBy: actorSummary(source.verifiedBy || source.verified_by || {}),
    issuedAt: source.issuedAt || source.issued_at || null,
    expiresAt: source.expiresAt || source.expires_at || null,
    reason: text(source.reason || source.waiverReason || source.waiver_reason) || null,
  })
}

function findEvidenceForRequirement(evidenceItems, requirement) {
  return evidenceItems.find((item) => item.requirementKey === requirement.key || item.requirementKey === requirement.evidenceDocumentKey) || null
}

function factStatus(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.status || CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.missing
}

function factValue(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.value ?? null
}

function factFingerprint(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.fingerprint || null
}

function resolvedDate(value) {
  return validDate(value) ? new Date(value) : null
}

function compareDateOnly(left, right) {
  const leftDate = resolvedDate(left)
  const rightDate = resolvedDate(right)
  if (!leftDate || !rightDate) return null
  const leftUtc = Date.UTC(leftDate.getUTCFullYear(), leftDate.getUTCMonth(), leftDate.getUTCDate())
  const rightUtc = Date.UTC(rightDate.getUTCFullYear(), rightDate.getUTCMonth(), rightDate.getUTCDate())
  return leftUtc - rightUtc
}

function figuresValidityErrors(workspace, asOf) {
  const errors = []
  const figuresExpiryDate = factValue(workspace, 'cancellation_figures_expiry_date')
  const lodgementDate = factValue(workspace, 'lodgement_date')
  const comparisonDate = validDate(lodgementDate) ? lodgementDate : asOf
  if (validDate(figuresExpiryDate) && validDate(comparisonDate) && compareDateOnly(figuresExpiryDate, comparisonDate) < 0) {
    errors.push(`figures_expired_before_lodgement:${new Date(figuresExpiryDate).toISOString().slice(0, 10)}`)
  }
  return errors
}

function buildRequirementRecord({ requirement, evidenceItem, workspace, asOf }) {
  const factStatuses = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factStatus(workspace, factKey) }), {})
  const factFingerprints = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factFingerprint(workspace, factKey) }), {})
  const evidenceStatus = evidenceItem?.status || ES.missing
  const errors = []

  requirement.factKeys.forEach((factKey) => {
    if (factStatus(workspace, factKey) !== CANCELLATION_ATTORNEY_PHASE2_FACT_STATUSES.verified) errors.push(`canonical_fact_not_verified:${factKey}`)
  })

  if (!evidenceItem) errors.push('packet_evidence_missing')
  if (evidenceItem && evidenceStatus !== ES.verified) errors.push(`packet_evidence_not_verified:${evidenceStatus}`)
  if (evidenceItem && !evidenceItem.referenceId) errors.push('packet_evidence_reference_required')
  if (evidenceItem && !validDate(evidenceItem.capturedAt)) errors.push('packet_evidence_captured_at_required')
  if (evidenceItem && !validDate(evidenceItem.verifiedAt)) errors.push('packet_evidence_verified_at_required')
  if (evidenceItem && !evidenceItem.verifiedBy.userId) errors.push('packet_evidence_verifier_required')
  if (evidenceItem && BLOCKED_SOURCE_TYPES.has(evidenceItem.sourceType)) errors.push(`packet_evidence_source_forbidden:${evidenceItem.sourceType}`)
  if (evidenceItem && !ALLOWED_SOURCE_TYPES.has(evidenceItem.sourceType)) errors.push(`packet_evidence_source_unknown:${evidenceItem.sourceType}`)
  if (evidenceItem && !requirement.preferredSourceTypes.includes(evidenceItem.sourceType)) errors.push(`packet_evidence_source_unexpected:${evidenceItem.sourceType}`)

  const now = validDate(asOf) ? new Date(asOf) : new Date()
  if (requirement.key === RK.simultaneousLodgementReadiness || requirement.key === RK.lodgementEvidence) {
    errors.push(...figuresValidityErrors(workspace, asOf))
  }
  if (requirement.key === RK.lodgementEvidence) {
    const lodgementDate = factValue(workspace, 'lodgement_date')
    if (!validDate(lodgementDate)) errors.push('lodgement_date_invalid')
    else if (new Date(lodgementDate) > now) errors.push('lodgement_date_future')
  }
  if (requirement.key === RK.cancellationRegistrationEvidence) {
    const registrationDate = factValue(workspace, 'cancellation_registration_date')
    const lodgementDate = factValue(workspace, 'lodgement_date')
    if (!validDate(registrationDate)) errors.push('registration_date_invalid')
    else if (new Date(registrationDate) > now) errors.push('registration_date_future')
    if (validDate(registrationDate) && validDate(lodgementDate) && compareDateOnly(registrationDate, lodgementDate) < 0) errors.push('registration_before_lodgement')
  }

  return Object.freeze({
    requirementKey: requirement.key,
    label: requirement.label,
    sourceCategory: requirement.sourceCategory,
    blocksLodgement: requirement.blocksLodgement,
    factKeys: requirement.factKeys,
    factStatuses: Object.freeze(factStatuses),
    factFingerprints: Object.freeze(factFingerprints),
    evidence: evidenceItem ? Object.freeze({
      evidenceId: evidenceItem.evidenceId,
      status: evidenceItem.status,
      sourceType: evidenceItem.sourceType,
      referenceId: evidenceItem.referenceId,
      externalReference: evidenceItem.externalReference,
      capturedAt: evidenceItem.capturedAt,
      verifiedAt: evidenceItem.verifiedAt,
      verifiedBy: evidenceItem.verifiedBy,
      issuedAt: evidenceItem.issuedAt,
      expiresAt: evidenceItem.expiresAt,
    }) : null,
    satisfied: errors.length === 0,
    errors: Object.freeze(unique(errors)),
  })
}

function buildPacketFingerprint(records) {
  return hash(records.map((record) => ({
    requirementKey: record.requirementKey,
    factFingerprints: record.factFingerprints,
    evidence: record.evidence ? {
      status: record.evidence.status,
      sourceType: record.evidence.sourceType,
      referenceId: record.evidence.referenceId,
      externalReference: record.evidence.externalReference,
      capturedAt: record.evidence.capturedAt,
      verifiedAt: record.evidence.verifiedAt,
    } : null,
  })))
}

function deriveStatus({ phase7Ready, records }) {
  if (!phase7Ready || records.some((record) => !record.satisfied)) return PS.blocked
  const lodged = records.find((record) => record.requirementKey === RK.lodgementEvidence)?.satisfied === true
  const registered = records.find((record) => record.requirementKey === RK.cancellationRegistrationEvidence)?.satisfied === true
  if (registered) return PS.registered
  if (lodged) return PS.lodged
  return PS.readyToLodge
}

function buildMetrics(records = []) {
  return Object.freeze({
    requirementCount: records.length,
    satisfiedCount: records.filter((record) => record.satisfied).length,
    missingEvidenceCount: records.filter((record) => record.errors.includes('packet_evidence_missing')).length,
    unverifiedEvidenceCount: records.filter((record) => record.errors.some((error) => error.startsWith('packet_evidence_not_verified'))).length,
    rejectedEvidenceCount: records.filter((record) => record.evidence?.status === ES.rejected).length,
    stageOnlyEvidenceCount: records.filter((record) => record.errors.some((error) => error.includes(ST.stageOnly))).length,
    systemGeneratedEvidenceCount: records.filter((record) => record.errors.some((error) => error.includes(ST.systemGenerated))).length,
    canonicalFactGapCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.startsWith('canonical_fact_not_verified')).length, 0),
    figuresExpiredCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.startsWith('figures_expired_before_lodgement')).length, 0),
    futureDateCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error === 'lodgement_date_future' || error === 'registration_date_future').length, 0),
  })
}

function buildNextAction(record) {
  if (!record || record.satisfied) return null
  const firstError = record.errors[0] || 'packet_evidence_incomplete'
  let actionLabel = `Attach ${record.label}`
  if (firstError.startsWith('canonical_fact_not_verified')) actionLabel = 'Verify cancellation lodgement fact'
  else if (firstError === 'packet_evidence_missing') actionLabel = `Attach ${record.label}`
  else if (firstError.startsWith('packet_evidence_not_verified')) actionLabel = `Verify ${record.label}`
  else if (firstError === 'packet_evidence_reference_required') actionLabel = 'Link cancellation evidence artifact'
  else if (firstError.startsWith('packet_evidence_source_forbidden')) actionLabel = 'Replace stage-only/system evidence with real evidence'
  else if (firstError.startsWith('figures_expired_before_lodgement')) actionLabel = 'Refresh cancellation figures before lodgement'
  else if (firstError === 'lodgement_date_future') actionLabel = 'Correct cancellation lodgement evidence date'
  else if (firstError === 'registration_date_future') actionLabel = 'Correct cancellation registration evidence date'
  else if (firstError === 'registration_before_lodgement') actionLabel = 'Correct cancellation lodgement/registration dates'
  return Object.freeze({
    requirementKey: record.requirementKey,
    priority: record.blocksLodgement || record.requirementKey === RK.cancellationRegistrationEvidence ? 'high' : 'normal',
    actionLabel,
    reason: firstError,
  })
}

export function listCancellationLodgementEvidenceRequirementKeys() {
  return Object.freeze(REQUIREMENTS.map((requirement) => requirement.key))
}

export function buildCancellationLodgementEvidenceNextActions(packet = {}) {
  const phase7Action = packet.phase7Gate?.ready !== true
    ? [Object.freeze({
        requirementKey: null,
        priority: 'high',
        actionLabel: 'Clear Phase 7 document/signing workspace',
        reason: 'phase7_gate_not_ready',
      })]
    : []
  const recordActions = (packet.records || []).map(buildNextAction).filter(Boolean)
  return Object.freeze([...phase7Action, ...recordActions].sort((left, right) => {
    const priorityRank = { high: 0, normal: 1 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.requirementKey || '').localeCompare(text(right.requirementKey || ''))
  }))
}

export function validateCancellationLodgementEvidencePacket(packet = {}) {
  const errors = []
  const warnings = []
  if (packet.version !== CANCELLATION_ATTORNEY_PHASE8_VERSION) errors.push('lodgement_packet_version_invalid')
  if (packet.workspaceValidation && packet.workspaceValidation.valid !== true) errors.push(...packet.workspaceValidation.errors.map((error) => `workspace:${error}`))
  if (packet.phase7Gate?.ready !== true) errors.push('phase7_gate_not_ready')
  if (!Array.isArray(packet.records) || packet.records.length !== REQUIREMENTS.length) errors.push('lodgement_evidence_requirements_incomplete')
  ;(packet.records || []).forEach((record) => {
    if (!REQUIREMENT_BY_KEY[record.requirementKey]) errors.push(`unknown_lodgement_requirement:${record.requirementKey}`)
    record.errors?.forEach((error) => {
      if (error.startsWith('packet_evidence_source_unexpected')) warnings.push(`${record.requirementKey}:${error}`)
      else errors.push(`${record.requirementKey}:${error}`)
    })
  })
  if (packet.controls?.marksRegistrationFromStageOnly !== false) errors.push('stage_only_registration_boundary_required')
  if (packet.controls?.synthesizesLodgementOutcome !== false) errors.push('lodgement_synthesis_boundary_required')
  if (packet.controls?.synthesizesRegistrationOutcome !== false) errors.push('registration_synthesis_boundary_required')
  if (packet.controls?.integratesWithDeedsOffice !== false) errors.push('deeds_integration_boundary_required')
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
    eventType: 'cancellation_lodgement_registration_evidence_packet_bound',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: CANCELLATION_ATTORNEY_PHASE8_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    packetStatus: packet.status,
    packetFingerprint: packet.packetFingerprint,
    evidenceMetrics: packet.metrics,
    phase7GateReady: packet.phase7Gate.ready,
    readyForPhase9: packet.readyForPhase9,
    records: packet.records.map((record) => Object.freeze({
      requirementKey: record.requirementKey,
      satisfied: record.satisfied,
      factFingerprints: record.factFingerprints,
      evidenceStatus: record.evidence?.status || ES.missing,
      sourceType: record.evidence?.sourceType || null,
      referenceId: record.evidence?.referenceId || null,
      externalReference: record.evidence?.externalReference || null,
      verifiedAt: record.evidence?.verifiedAt || null,
    })),
  })
}

export function buildCancellationLodgementEvidencePacket({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  documentSigningWorkspace = null,
  guaranteeWorkspace = null,
  figuresRegister = null,
  guarantees = null,
  templates = {},
  documents = null,
  packetEvidence = [],
  actor = {},
  commandId = 'cancellation-lodgement-evidence-packet',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveWorkspace = workspace || buildCancellationPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateCancellationPackWorkspace(effectiveWorkspace)
  const effectiveSigningWorkspace = documentSigningWorkspace || buildCancellationDocumentSigningWorkspace({
    workspace: effectiveWorkspace,
    guaranteeWorkspace,
    figuresRegister,
    guarantees,
    templates,
    documents,
    actor,
    commandId: `${commandId}-phase7-document-signing-gate`,
    generatedAt,
    asOf,
  })
  const signingValidation = validateCancellationDocumentSigningWorkspace(effectiveSigningWorkspace)
  const phase7Ready = signingValidation.valid && effectiveSigningWorkspace.readyForPhase8 === true
  const evidenceItems = Object.freeze(asArray(packetEvidence).map(normalizeEvidenceItem))
  const records = Object.freeze(REQUIREMENTS.map((requirement) => buildRequirementRecord({
    requirement,
    evidenceItem: findEvidenceForRequirement(evidenceItems, requirement),
    workspace: effectiveWorkspace,
    asOf,
  })))
  const metrics = buildMetrics(records)
  const packetFingerprint = buildPacketFingerprint(records)
  const shell = Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE8_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'cancellation',
    generatedAt,
    asOf,
    status: deriveStatus({ phase7Ready, records }),
    workspaceValidation,
    phase7Gate: Object.freeze({
      ready: phase7Ready,
      status: effectiveSigningWorkspace.status || null,
      readyDocumentCount: effectiveSigningWorkspace.metrics?.readyDocumentCount || 0,
      blockedDocumentCount: effectiveSigningWorkspace.metrics?.blockedDocumentCount || 0,
      signatureGapCount: effectiveSigningWorkspace.metrics?.signatureGapCount || 0,
      signingFingerprint: effectiveSigningWorkspace.signingFingerprint || null,
      validation: signingValidation,
    }),
    records,
    metrics,
    packetFingerprint,
    controls: CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY,
    readyForPhase9: false,
  })
  const validation = validateCancellationLodgementEvidencePacket(shell)
  const readyForPhase9 = validation.valid &&
    metrics.requirementCount === REQUIREMENTS.length &&
    metrics.satisfiedCount === REQUIREMENTS.length &&
    shell.status === PS.registered &&
    CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.marksRegistrationFromStageOnly === false &&
    CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesLodgementOutcome === false &&
    CANCELLATION_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesRegistrationOutcome === false
  const packet = Object.freeze({
    ...shell,
    validation,
    readyForPhase9,
  })
  return Object.freeze({
    ...packet,
    nextActions: buildCancellationLodgementEvidenceNextActions(packet),
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, packet: { ...packet, readyForPhase9 }, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildCancellationAttorneyPhase8BaselineReport(input = {}) {
  const packet = buildCancellationLodgementEvidencePacket(input)
  return Object.freeze({
    version: CANCELLATION_ATTORNEY_PHASE8_VERSION,
    releaseBlockerId: CANCELLATION_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    status: packet.status,
    requirementCount: packet.metrics.requirementCount,
    satisfiedCount: packet.metrics.satisfiedCount,
    missingEvidenceCount: packet.metrics.missingEvidenceCount,
    canonicalFactGapCount: packet.metrics.canonicalFactGapCount,
    figuresExpiredCount: packet.metrics.figuresExpiredCount,
    futureDateCount: packet.metrics.futureDateCount,
    validation: packet.validation,
    nextActionCount: packet.nextActions.length,
    controls: packet.controls,
    readyForPhase9: packet.readyForPhase9,
  })
}
