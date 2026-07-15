import { BOND_ATTORNEY_PHASE2_FACT_STATUSES } from './bondAttorneyModulePhase2.js'
import {
  buildBondPackWorkspace,
  buildBondPackWorkspaceAuditEvent,
  validateBondPackWorkspace,
} from './bondAttorneyModulePhase3.js'
import { buildBondLegalTemplateGate } from './bondAttorneyModulePhase7.js'

export const BOND_ATTORNEY_PHASE8_VERSION = 'bond_attorney_module_phase8_lodgement_registration_evidence_v1'
export const BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID = 'lodgement_registration_evidence_not_packet_bound'

export const BOND_LODGEMENT_EVIDENCE_STATUSES = Object.freeze({
  missing: 'missing',
  requested: 'requested',
  provided: 'provided',
  verified: 'verified',
  rejected: 'rejected',
  waived: 'waived',
})

export const BOND_LODGEMENT_PACKET_STATUSES = Object.freeze({
  blocked: 'blocked',
  readyToLodge: 'ready_to_lodge',
  lodged: 'lodged',
  registered: 'registered',
})

export const BOND_LODGEMENT_EVIDENCE_SOURCE_TYPES = Object.freeze({
  bankPortalUpload: 'bank_portal_upload',
  bankEmail: 'bank_email',
  transferAttorneyConfirmation: 'transfer_attorney_confirmation',
  attorneyUpload: 'attorney_upload',
  deedsOfficeNotice: 'deeds_office_notice',
  externalRegistry: 'external_registry',
  manualUpload: 'manual_upload',
  systemGenerated: 'system_generated',
  stageOnly: 'stage_only',
})

export const BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS = Object.freeze({
  bankApprovalToLodge: 'bank_approval_to_lodge',
  guaranteeEvidence: 'guarantee_evidence',
  lodgementEvidence: 'lodgement_evidence',
  deedsRegistrationEvidence: 'deeds_registration_evidence',
})

export const BOND_LODGEMENT_REGISTRATION_BOUNDARY = Object.freeze({
  packetBoundEvidenceOnly: true,
  manualEvidenceAllowed: true,
  requiresPhase7TemplateGate: true,
  requiresVerifiedCanonicalFacts: true,
  requiresExternalOrUploadedEvidence: true,
  requiresBankApprovalEvidence: true,
  requiresGuaranteeEvidence: true,
  requiresLodgementEvidence: true,
  requiresRegistrationEvidence: true,
  synthesizesBankApproval: false,
  synthesizesDeedsOutcome: false,
  submitsToBankPortal: false,
  integratesWithDeedsOffice: false,
  generatesLegalInstrument: false,
  mutatesRegistryOutcome: false,
})

const ES = BOND_LODGEMENT_EVIDENCE_STATUSES
const PS = BOND_LODGEMENT_PACKET_STATUSES
const ST = BOND_LODGEMENT_EVIDENCE_SOURCE_TYPES
const RK = BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS

const EVIDENCE_STATUS_SET = new Set(Object.values(ES))
const BLOCKED_SOURCE_TYPES = new Set([ST.systemGenerated, ST.stageOnly])
const ALLOWED_SOURCE_TYPES = new Set(Object.values(ST).filter((sourceType) => !BLOCKED_SOURCE_TYPES.has(sourceType)))

const REQUIREMENTS = Object.freeze([
  Object.freeze({
    key: RK.bankApprovalToLodge,
    label: 'Bank approval to lodge',
    factKeys: Object.freeze(['approval_to_lodge_reference']),
    evidenceDocumentKey: 'bank_approval_to_lodge',
    sourceCategory: 'bank_controlled',
    preferredSourceTypes: Object.freeze([ST.bankPortalUpload, ST.bankEmail, ST.attorneyUpload, ST.manualUpload]),
    blocksLodgement: true,
  }),
  Object.freeze({
    key: RK.guaranteeEvidence,
    label: 'Guarantee values and expiry evidence',
    factKeys: Object.freeze(['guarantee_values_and_expiry']),
    evidenceDocumentKey: 'guarantee_values_and_expiry',
    sourceCategory: 'transfer_handoff',
    preferredSourceTypes: Object.freeze([ST.transferAttorneyConfirmation, ST.attorneyUpload, ST.manualUpload]),
    blocksLodgement: true,
  }),
  Object.freeze({
    key: RK.lodgementEvidence,
    label: 'Lodgement evidence',
    factKeys: Object.freeze(['lodgement_reference']),
    evidenceDocumentKey: 'lodgement_reference',
    sourceCategory: 'lodgement',
    preferredSourceTypes: Object.freeze([ST.attorneyUpload, ST.manualUpload]),
    blocksLodgement: false,
  }),
  Object.freeze({
    key: RK.deedsRegistrationEvidence,
    label: 'Registration evidence and Deeds Office outcome',
    factKeys: Object.freeze(['registration_date', 'title_deed_or_deeds_office_reference']),
    evidenceDocumentKey: 'deeds_registration_evidence',
    sourceCategory: 'external_registry',
    preferredSourceTypes: Object.freeze([ST.deedsOfficeNotice, ST.externalRegistry, ST.attorneyUpload, ST.manualUpload]),
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
  if (['bank_portal', 'portal', 'bank_upload'].includes(normalized)) return ST.bankPortalUpload
  if (['email', 'bank_mail', 'lender_email'].includes(normalized)) return ST.bankEmail
  if (['transfer_attorney', 'transfer_handoff', 'transfer_confirmation'].includes(normalized)) return ST.transferAttorneyConfirmation
  if (['deeds', 'deeds_office', 'deeds_notice', 'registry_notice'].includes(normalized)) return ST.deedsOfficeNotice
  if (['registry', 'external_registry'].includes(normalized)) return ST.externalRegistry
  if (['manual', 'manual_upload', 'file_upload', 'upload'].includes(normalized)) return ST.manualUpload
  if (['stage', 'stage_only', 'workflow_stage'].includes(normalized)) return ST.stageOnly
  if (['system', 'system_generated', 'generated'].includes(normalized)) return ST.systemGenerated
  return normalized || ST.attorneyUpload
}

function normalizeEvidenceItem(input = {}, index = 0) {
  const source = input && typeof input === 'object' ? input : { referenceId: input }
  const requirementKey = key(source.requirementKey || source.requirement_key || source.key || source.evidenceKey || source.evidence_key || source.documentKey || source.document_key)
  return Object.freeze({
    evidenceId: text(source.evidenceId || source.evidence_id || source.id) || `bond-lodgement-evidence-${index + 1}`,
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
  return workspace.canonicalData?.factsByKey?.[factKey]?.status || BOND_ATTORNEY_PHASE2_FACT_STATUSES.missing
}

function factValue(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.value ?? null
}

function factFingerprint(workspace, factKey) {
  return workspace.canonicalData?.factsByKey?.[factKey]?.fingerprint || null
}

function flattenGuaranteeDates(value) {
  if (Array.isArray(value)) return value.flatMap(flattenGuaranteeDates)
  if (value && typeof value === 'object') {
    return [
      value.expiresAt,
      value.expires_at,
      value.expiry,
      value.expiryDate,
      value.expiry_date,
      ...Object.values(value).flatMap((nested) => (nested && typeof nested === 'object' ? flattenGuaranteeDates(nested) : [])),
    ].filter(Boolean)
  }
  return []
}

function guaranteeExpiryErrors(value, asOf) {
  const now = validDate(asOf) ? new Date(asOf) : new Date()
  return flattenGuaranteeDates(value)
    .filter((date) => validDate(date) && new Date(date) <= now)
    .map((date) => `guarantee_expired:${new Date(date).toISOString().slice(0, 10)}`)
}

function buildRequirementRecord({ requirement, evidenceItem, workspace, asOf }) {
  const factStatuses = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factStatus(workspace, factKey) }), {})
  const factFingerprints = requirement.factKeys.reduce((result, factKey) => ({ ...result, [factKey]: factFingerprint(workspace, factKey) }), {})
  const evidenceStatus = evidenceItem?.status || ES.missing
  const errors = []
  requirement.factKeys.forEach((factKey) => {
    if (factStatus(workspace, factKey) !== BOND_ATTORNEY_PHASE2_FACT_STATUSES.verified) errors.push(`canonical_fact_not_verified:${factKey}`)
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
  if (requirement.key === RK.guaranteeEvidence) errors.push(...guaranteeExpiryErrors(factValue(workspace, 'guarantee_values_and_expiry'), asOf))
  if (requirement.key === RK.deedsRegistrationEvidence) {
    const registrationDate = factValue(workspace, 'registration_date')
    if (!validDate(registrationDate)) errors.push('registration_date_invalid')
    else if (new Date(registrationDate) > (validDate(asOf) ? new Date(asOf) : new Date())) errors.push('registration_date_future')
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
  const registered = records.find((record) => record.requirementKey === RK.deedsRegistrationEvidence)?.satisfied === true
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
    guaranteeExpiredCount: records.reduce((sum, record) => sum + record.errors.filter((error) => error.startsWith('guarantee_expired')).length, 0),
  })
}

function buildNextAction(record) {
  if (!record || record.satisfied) return null
  const firstError = record.errors[0] || 'packet_evidence_incomplete'
  let actionLabel = `Attach ${record.label}`
  if (firstError.startsWith('canonical_fact_not_verified')) actionLabel = 'Verify canonical lodgement fact'
  else if (firstError === 'packet_evidence_missing') actionLabel = `Attach ${record.label}`
  else if (firstError.startsWith('packet_evidence_not_verified')) actionLabel = `Verify ${record.label}`
  else if (firstError === 'packet_evidence_reference_required') actionLabel = 'Link evidence artifact'
  else if (firstError.startsWith('packet_evidence_source_forbidden')) actionLabel = 'Replace stage-only/system evidence with real evidence'
  else if (firstError.startsWith('guarantee_expired')) actionLabel = 'Renew guarantee evidence'
  else if (firstError === 'registration_date_future') actionLabel = 'Correct registration evidence date'
  return Object.freeze({
    requirementKey: record.requirementKey,
    priority: record.requirementKey === RK.bankApprovalToLodge || record.requirementKey === RK.deedsRegistrationEvidence ? 'high' : 'normal',
    actionLabel,
    reason: firstError,
  })
}

export function listBondLodgementEvidenceRequirementKeys() {
  return Object.freeze(REQUIREMENTS.map((requirement) => requirement.key))
}

export function buildBondLodgementEvidenceNextActions(packet = {}) {
  const phase7Action = packet.phase7Gate?.ready !== true
    ? [Object.freeze({
        requirementKey: null,
        priority: 'high',
        actionLabel: 'Clear Phase 7 governed-template gate',
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

export function validateBondLodgementEvidencePacket(packet = {}) {
  const errors = []
  const warnings = []
  if (packet.version !== BOND_ATTORNEY_PHASE8_VERSION) errors.push('lodgement_packet_version_invalid')
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
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

function buildAuditEvent({ workspace, packet, actor, commandId, occurredAt }) {
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_lodgement_registration_evidence_packet_bound',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE8_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    packetStatus: packet.status,
    packetFingerprint: packet.packetFingerprint,
    evidenceMetrics: packet.metrics,
    readyForPhase9: packet.readyForPhase9,
    records: packet.records.map((record) => Object.freeze({
      requirementKey: record.requirementKey,
      satisfied: record.satisfied,
      factFingerprints: record.factFingerprints,
      evidenceStatus: record.evidence?.status || ES.missing,
      sourceType: record.evidence?.sourceType || null,
      referenceId: record.evidence?.referenceId || null,
      verifiedAt: record.evidence?.verifiedAt || null,
    })),
  })
}

export function buildBondLodgementEvidencePacket({
  workspace = null,
  transaction = {},
  lane = {},
  evidence = {},
  legalTemplateGate = null,
  templates = {},
  signers = null,
  conditionRegister = null,
  signingWorkspace = null,
  packetEvidence = [],
  actor = {},
  commandId = 'bond-lodgement-evidence-packet',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const effectiveWorkspace = workspace || buildBondPackWorkspace({ transaction, lane, evidence, generatedAt })
  const workspaceValidation = validateBondPackWorkspace(effectiveWorkspace)
  const effectiveGate = legalTemplateGate || buildBondLegalTemplateGate({
    workspace: effectiveWorkspace,
    signingWorkspace,
    conditionRegister,
    signers,
    templates,
    actor,
    commandId: `${commandId}-phase7-gate`,
    generatedAt,
    asOf,
  })
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
    version: BOND_ATTORNEY_PHASE8_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    workspaceId: effectiveWorkspace.workspaceId,
    transactionId: effectiveWorkspace.transactionId,
    laneKey: 'bond',
    generatedAt,
    asOf,
    status: deriveStatus({ phase7Ready: effectiveGate.readyForPhase8 === true, records }),
    workspaceValidation,
    phase7Gate: Object.freeze({
      ready: effectiveGate.readyForPhase8 === true,
      status: effectiveGate.status || null,
      templateControlledCount: effectiveGate.templateControlledCount || 0,
      readyTemplateCount: effectiveGate.readyTemplateCount || 0,
      blockedTemplateCount: effectiveGate.blockedTemplateCount || 0,
    }),
    records,
    metrics,
    packetFingerprint,
    controls: BOND_LODGEMENT_REGISTRATION_BOUNDARY,
    readyForPhase9: false,
  })
  const validation = validateBondLodgementEvidencePacket(shell)
  const readyForPhase9 = validation.valid &&
    metrics.requirementCount === REQUIREMENTS.length &&
    metrics.satisfiedCount === REQUIREMENTS.length &&
    shell.status === PS.registered &&
    BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesBankApproval === false &&
    BOND_LODGEMENT_REGISTRATION_BOUNDARY.synthesizesDeedsOutcome === false
  const packet = Object.freeze({
    ...shell,
    validation,
    readyForPhase9,
  })
  return Object.freeze({
    ...packet,
    nextActions: buildBondLodgementEvidenceNextActions(packet),
    auditEvent: buildAuditEvent({ workspace: effectiveWorkspace, packet: { ...packet, readyForPhase9 }, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildBondAttorneyPhase8BaselineReport(input = {}) {
  const packet = buildBondLodgementEvidencePacket(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE8_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE8_RELEASE_BLOCKER_ID,
    status: packet.status,
    requirementCount: packet.metrics.requirementCount,
    satisfiedCount: packet.metrics.satisfiedCount,
    missingEvidenceCount: packet.metrics.missingEvidenceCount,
    canonicalFactGapCount: packet.metrics.canonicalFactGapCount,
    guaranteeExpiredCount: packet.metrics.guaranteeExpiredCount,
    validation: packet.validation,
    nextActionCount: packet.nextActions.length,
    controls: packet.controls,
    readyForPhase9: packet.readyForPhase9,
  })
}
