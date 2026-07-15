import {
  BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS,
  buildBondLodgementEvidencePacket,
  validateBondLodgementEvidencePacket,
} from './bondAttorneyModulePhase8.js'
import { buildBondPackWorkspaceAuditEvent } from './bondAttorneyModulePhase3.js'

export const BOND_ATTORNEY_PHASE9_VERSION = 'bond_attorney_module_phase9_inbound_signal_reconciliation_v1'
export const BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID = 'bank_and_deeds_integrations_absent'

export const BOND_INBOUND_SIGNAL_SOURCE_TYPES = Object.freeze({
  bankPortalApi: 'bank_portal_api',
  bankSecureEmail: 'bank_secure_email',
  bankWebhook: 'bank_webhook',
  deedsOfficeFeed: 'deeds_office_feed',
  externalRegistry: 'external_registry',
  trustedMiddleware: 'trusted_middleware',
  manualBackfill: 'manual_backfill',
  unknown: 'unknown',
})

export const BOND_INBOUND_SIGNAL_TYPES = Object.freeze({
  bankApprovalToLodge: 'bank_approval_to_lodge',
  guaranteeIssued: 'guarantee_issued',
  guaranteeUpdated: 'guarantee_updated',
  lodgementConfirmed: 'lodgement_confirmed',
  registrationConfirmed: 'registration_confirmed',
  deedsRejection: 'deeds_rejection',
})

export const BOND_INBOUND_SIGNAL_RECONCILIATION_OUTCOMES = Object.freeze({
  matched: 'matched',
  conflict: 'conflict',
  reviewRequired: 'review_required',
  stale: 'stale',
  untrusted: 'untrusted',
  duplicate: 'duplicate',
  unsupported: 'unsupported',
  orphaned: 'orphaned',
})

export const BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY = Object.freeze({
  manualEvidenceRemainsPrimary: true,
  inboundSignalsOptional: true,
  reconcilesOnly: true,
  requiresPhase8PacketReadiness: true,
  trustedSourceRequired: true,
  signatureVerificationRequired: true,
  duplicateSignalsIgnored: true,
  conflictsBlockRelease: true,
  autoOverwriteManualEvidence: false,
  synthesizesBankApproval: false,
  synthesizesDeedsOutcome: false,
  submitsToBankPortal: false,
  mutatesRegistryOutcome: false,
  writesExternalSystem: false,
})

const ST = BOND_INBOUND_SIGNAL_SOURCE_TYPES
const T = BOND_INBOUND_SIGNAL_TYPES
const O = BOND_INBOUND_SIGNAL_RECONCILIATION_OUTCOMES
const RK = BOND_LODGEMENT_EVIDENCE_REQUIREMENT_KEYS

const TRUSTED_SOURCE_TYPES = new Set([
  ST.bankPortalApi,
  ST.bankSecureEmail,
  ST.bankWebhook,
  ST.deedsOfficeFeed,
  ST.externalRegistry,
  ST.trustedMiddleware,
])

const SOURCE_TYPE_VALUES = new Set(Object.values(ST))

const TYPE_TO_REQUIREMENT = Object.freeze({
  [T.bankApprovalToLodge]: RK.bankApprovalToLodge,
  [T.guaranteeIssued]: RK.guaranteeEvidence,
  [T.guaranteeUpdated]: RK.guaranteeEvidence,
  [T.lodgementConfirmed]: RK.lodgementEvidence,
  [T.registrationConfirmed]: RK.deedsRegistrationEvidence,
  [T.deedsRejection]: RK.deedsRegistrationEvidence,
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

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    if (Array.isArray(value.signals)) return value.signals
    if (Array.isArray(value.items)) return value.items
    return Object.values(value)
  }
  return []
}

function actorSummary(actor = {}) {
  return Object.freeze({
    role: key(actor.role || actor.actorRole || actor.actor_role) || 'system',
    userId: text(actor.userId || actor.user_id) || null,
  })
}

function normalizeSourceType(value = '') {
  const normalized = key(value)
  if (['bank_portal', 'bank_api', 'lender_portal'].includes(normalized)) return ST.bankPortalApi
  if (['bank_email', 'secure_email', 'lender_email'].includes(normalized)) return ST.bankSecureEmail
  if (['webhook', 'bank_event'].includes(normalized)) return ST.bankWebhook
  if (['deeds', 'deeds_office', 'deeds_feed', 'registry_feed'].includes(normalized)) return ST.deedsOfficeFeed
  if (['registry', 'external_registry'].includes(normalized)) return ST.externalRegistry
  if (['middleware', 'trusted_middleware'].includes(normalized)) return ST.trustedMiddleware
  if (['manual', 'manual_backfill'].includes(normalized)) return ST.manualBackfill
  return SOURCE_TYPE_VALUES.has(normalized) ? normalized : ST.unknown
}

function normalizeSignalType(input = {}) {
  const normalized = key(input.signalType || input.signal_type || input.type || input.eventType || input.event_type || input.kind)
  if (['atl', 'approval_to_lodge', 'bank_atl', 'bank_approval'].includes(normalized)) return T.bankApprovalToLodge
  if (['guarantee', 'guarantee_issued'].includes(normalized)) return T.guaranteeIssued
  if (['guarantee_update', 'guarantee_updated'].includes(normalized)) return T.guaranteeUpdated
  if (['lodged', 'lodgement', 'lodgement_reference'].includes(normalized)) return T.lodgementConfirmed
  if (['registered', 'registration', 'deeds_registration'].includes(normalized)) return T.registrationConfirmed
  if (['rejected', 'deeds_rejected', 'lodgement_rejected'].includes(normalized)) return T.deedsRejection
  return normalized
}

function normalizeSignal(input = {}, index = 0) {
  const signalType = normalizeSignalType(input)
  const sourceType = normalizeSourceType(input.sourceType || input.source_type || input.source || input.channel)
  const receivedAt = input.receivedAt || input.received_at || input.capturedAt || input.captured_at || null
  const eventAt = input.eventAt || input.event_at || input.occurredAt || input.occurred_at || receivedAt
  const referenceValue = text(
    input.referenceValue ||
      input.reference_value ||
      input.externalReference ||
      input.external_reference ||
      input.reference ||
      input.ref ||
      input.approvalToLodgeReference ||
      input.approval_to_lodge_reference ||
      input.lodgementReference ||
      input.lodgement_reference ||
      input.registrationReference ||
      input.registration_reference ||
      input.guaranteeReference ||
      input.guarantee_reference,
  )
  const registrationDate = input.registrationDate || input.registration_date || input.registeredAt || input.registered_at || null
  const sourceEventId = text(input.sourceEventId || input.source_event_id || input.eventId || input.event_id || input.id)
  return Object.freeze({
    signalId: text(input.signalId || input.signal_id) || hash({ sourceEventId, signalType, sourceType, referenceValue, index }),
    sourceEventId,
    sourceType,
    signalType,
    requirementKey: TYPE_TO_REQUIREMENT[signalType] || null,
    referenceValue: referenceValue || null,
    registrationDate: validDate(registrationDate) ? new Date(registrationDate).toISOString().slice(0, 10) : null,
    titleDeedReference: text(input.titleDeedReference || input.title_deed_reference || input.deedsReference || input.deeds_reference) || null,
    receivedAt: validDate(receivedAt) ? new Date(receivedAt).toISOString() : null,
    eventAt: validDate(eventAt) ? new Date(eventAt).toISOString() : null,
    signatureVerified: input.signatureVerified === true || input.signature_verified === true || input.verified === true,
    trusted: input.trusted === true || TRUSTED_SOURCE_TYPES.has(sourceType),
    payloadFingerprint: hash({
      sourceEventId,
      sourceType,
      signalType,
      referenceValue,
      registrationDate: validDate(registrationDate) ? new Date(registrationDate).toISOString().slice(0, 10) : null,
      titleDeedReference: text(input.titleDeedReference || input.title_deed_reference || input.deedsReference || input.deeds_reference) || null,
    }),
  })
}

function packetRecord(packet, requirementKey) {
  return (packet.records || []).find((record) => record.requirementKey === requirementKey) || null
}

function recordReference(record) {
  return text(record?.evidence?.externalReference || record?.evidence?.referenceId)
}

function recordVerifiedAt(record) {
  return validDate(record?.evidence?.verifiedAt) ? new Date(record.evidence.verifiedAt) : null
}

function compareReferences(signal, record) {
  const expected = recordReference(record)
  if (!signal.referenceValue) return Object.freeze({ matched: false, reason: 'signal_reference_missing' })
  if (!expected) return Object.freeze({ matched: false, reason: 'packet_reference_missing' })
  return Object.freeze({
    matched: key(signal.referenceValue) === key(expected),
    reason: key(signal.referenceValue) === key(expected) ? 'reference_matched' : 'reference_mismatch',
  })
}

function reconcileSignal(signal, packet, duplicate = false) {
  const issues = []
  if (duplicate) {
    return Object.freeze({
      signal,
      requirementKey: signal.requirementKey,
      outcome: O.duplicate,
      blocking: false,
      issues: Object.freeze(['duplicate_signal_ignored']),
    })
  }
  if (!signal.requirementKey) {
    return Object.freeze({
      signal,
      requirementKey: null,
      outcome: O.unsupported,
      blocking: true,
      issues: Object.freeze(['unsupported_signal_type']),
    })
  }
  if (!signal.trusted || !TRUSTED_SOURCE_TYPES.has(signal.sourceType)) issues.push('signal_source_not_trusted')
  if (!signal.signatureVerified) issues.push('signal_signature_not_verified')
  if (!signal.sourceEventId) issues.push('signal_source_event_id_required')
  if (!signal.receivedAt || !signal.eventAt) issues.push('signal_timestamp_required')
  if (issues.length) {
    return Object.freeze({
      signal,
      requirementKey: signal.requirementKey,
      outcome: O.untrusted,
      blocking: true,
      issues: Object.freeze(issues),
    })
  }
  const record = packetRecord(packet, signal.requirementKey)
  if (!record?.satisfied) {
    return Object.freeze({
      signal,
      requirementKey: signal.requirementKey,
      outcome: O.orphaned,
      blocking: true,
      issues: Object.freeze(['packet_requirement_not_satisfied']),
    })
  }

  const verifiedAt = recordVerifiedAt(record)
  if (verifiedAt && validDate(signal.eventAt) && new Date(signal.eventAt) < verifiedAt) {
    return Object.freeze({
      signal,
      requirementKey: signal.requirementKey,
      outcome: O.stale,
      blocking: false,
      issues: Object.freeze(['signal_older_than_verified_packet_evidence']),
    })
  }

  if (signal.signalType === T.deedsRejection) {
    return Object.freeze({
      signal,
      requirementKey: signal.requirementKey,
      outcome: O.conflict,
      blocking: true,
      issues: Object.freeze(['deeds_rejection_conflicts_with_registered_packet']),
    })
  }

  if ([RK.bankApprovalToLodge, RK.guaranteeEvidence, RK.lodgementEvidence].includes(signal.requirementKey)) {
    const reference = compareReferences(signal, record)
    if (!reference.matched) {
      return Object.freeze({
        signal,
        requirementKey: signal.requirementKey,
        outcome: reference.reason === 'signal_reference_missing' ? O.reviewRequired : O.conflict,
        blocking: true,
        issues: Object.freeze([reference.reason]),
      })
    }
  }

  if (signal.requirementKey === RK.deedsRegistrationEvidence && signal.signalType === T.registrationConfirmed) {
    const reference = compareReferences(signal, record)
    if (!reference.matched) {
      return Object.freeze({
        signal,
        requirementKey: signal.requirementKey,
        outcome: reference.reason === 'signal_reference_missing' ? O.reviewRequired : O.conflict,
        blocking: true,
        issues: Object.freeze([reference.reason]),
      })
    }
    const packetRegistrationDate = (packet.records || [])
      .find((recordItem) => recordItem.requirementKey === RK.deedsRegistrationEvidence)
      ?.evidence?.verifiedAt
    if (!signal.registrationDate) {
      return Object.freeze({
        signal,
        requirementKey: signal.requirementKey,
        outcome: O.reviewRequired,
        blocking: true,
        issues: Object.freeze(['registration_signal_date_required']),
      })
    }
    if (packetRegistrationDate && new Date(signal.registrationDate) > new Date(packetRegistrationDate)) {
      return Object.freeze({
        signal,
        requirementKey: signal.requirementKey,
        outcome: O.reviewRequired,
        blocking: true,
        issues: Object.freeze(['registration_signal_after_packet_verification']),
      })
    }
  }

  return Object.freeze({
    signal,
    requirementKey: signal.requirementKey,
    outcome: O.matched,
    blocking: false,
    issues: Object.freeze([]),
  })
}

function reconcileSignals(signals, packet) {
  const seen = new Set()
  return Object.freeze(signals.map((signal) => {
    const duplicateKey = `${signal.sourceType}:${signal.sourceEventId || signal.payloadFingerprint}`
    const duplicate = seen.has(duplicateKey)
    seen.add(duplicateKey)
    return reconcileSignal(signal, packet, duplicate)
  }))
}

function buildMetrics(results = []) {
  const count = (outcome) => results.filter((result) => result.outcome === outcome).length
  return Object.freeze({
    signalCount: results.length,
    matchedCount: count(O.matched),
    conflictCount: count(O.conflict),
    reviewRequiredCount: count(O.reviewRequired),
    staleCount: count(O.stale),
    untrustedCount: count(O.untrusted),
    duplicateCount: count(O.duplicate),
    unsupportedCount: count(O.unsupported),
    orphanedCount: count(O.orphaned),
    blockingCount: results.filter((result) => result.blocking).length,
  })
}

function buildReconciliationFingerprint(results = []) {
  return hash(results.map((result) => ({
    signalId: result.signal.signalId,
    sourceEventId: result.signal.sourceEventId,
    sourceType: result.signal.sourceType,
    signalType: result.signal.signalType,
    requirementKey: result.requirementKey,
    payloadFingerprint: result.signal.payloadFingerprint,
    outcome: result.outcome,
    issues: result.issues,
  })))
}

export function buildBondInboundSignalNextActions(register = {}) {
  const packetAction = register.phase8Packet?.ready !== true
    ? [Object.freeze({
        signalId: null,
        priority: 'high',
        actionLabel: 'Complete Phase 8 manual evidence packet',
        reason: 'phase8_packet_not_ready',
      })]
    : []
  const signalActions = (register.results || [])
    .filter((result) => result.blocking || result.outcome === O.stale)
    .map((result) => {
      let actionLabel = 'Review inbound signal'
      if (result.outcome === O.conflict) actionLabel = 'Resolve inbound signal conflict'
      if (result.outcome === O.untrusted) actionLabel = 'Verify inbound signal source'
      if (result.outcome === O.unsupported) actionLabel = 'Map or ignore unsupported inbound signal'
      if (result.outcome === O.orphaned) actionLabel = 'Attach missing manual evidence before reconciling signal'
      if (result.outcome === O.stale) actionLabel = 'Review stale inbound signal'
      return Object.freeze({
        signalId: result.signal.signalId,
        requirementKey: result.requirementKey,
        priority: result.blocking ? 'high' : 'normal',
        actionLabel,
        reason: result.issues[0] || result.outcome,
      })
    })
  return Object.freeze([...packetAction, ...signalActions].sort((left, right) => {
    const priorityRank = { high: 0, normal: 1 }
    return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9) ||
      text(left.requirementKey || '').localeCompare(text(right.requirementKey || '')) ||
      text(left.signalId || '').localeCompare(text(right.signalId || ''))
  }))
}

export function validateBondInboundSignalRegister(register = {}) {
  const errors = []
  const warnings = []
  if (register.version !== BOND_ATTORNEY_PHASE9_VERSION) errors.push('inbound_signal_register_version_invalid')
  if (register.phase8Packet?.ready !== true) errors.push('phase8_packet_not_ready')
  if (register.phase8PacketValidation && register.phase8PacketValidation.valid !== true) errors.push(...register.phase8PacketValidation.errors.map((error) => `phase8:${error}`))
  if (register.controls?.manualEvidenceRemainsPrimary !== true) errors.push('manual_evidence_primary_control_required')
  if (register.controls?.autoOverwriteManualEvidence !== false) errors.push('auto_overwrite_manual_evidence_forbidden')
  if (register.controls?.writesExternalSystem !== false) errors.push('external_writes_forbidden')
  ;(register.results || []).forEach((result) => {
    if (result.outcome === O.duplicate || result.outcome === O.stale) warnings.push(`${result.signal.signalId}:${result.outcome}`)
    if (result.blocking) errors.push(...result.issues.map((issue) => `${result.signal.signalId}:${issue}`))
  })
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(unique(errors)),
    warnings: Object.freeze(unique(warnings)),
  })
}

function buildAuditEvent({ packet, register, actor, commandId, occurredAt }) {
  const workspace = {
    workspaceId: packet.workspaceId,
    transactionId: packet.transactionId,
    laneKey: 'bond',
    status: packet.status,
    dataFingerprint: null,
  }
  const base = buildBondPackWorkspaceAuditEvent({
    workspace,
    eventType: 'bond_inbound_signal_reconciliation_completed',
    actor,
    commandId,
    occurredAt,
  })
  return Object.freeze({
    ...base,
    version: BOND_ATTORNEY_PHASE9_VERSION,
    workspaceEventVersion: base.version,
    releaseBlockerId: BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    reconciliationFingerprint: register.reconciliationFingerprint,
    signalMetrics: register.metrics,
    readyForRelease: register.readyForRelease,
    results: register.results.map((result) => Object.freeze({
      signalId: result.signal.signalId,
      sourceEventId: result.signal.sourceEventId,
      sourceType: result.signal.sourceType,
      signalType: result.signal.signalType,
      requirementKey: result.requirementKey,
      payloadFingerprint: result.signal.payloadFingerprint,
      outcome: result.outcome,
      blocking: result.blocking,
    })),
  })
}

export function buildBondInboundSignalRegister({
  lodgementPacket = null,
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
  inboundSignals = [],
  actor = {},
  commandId = 'bond-inbound-signal-reconciliation',
  generatedAt = new Date().toISOString(),
  asOf = generatedAt,
} = {}) {
  const packet = lodgementPacket || buildBondLodgementEvidencePacket({
    workspace,
    transaction,
    lane,
    evidence,
    legalTemplateGate,
    templates,
    signers,
    conditionRegister,
    signingWorkspace,
    packetEvidence,
    actor,
    commandId: `${commandId}-phase8-packet`,
    generatedAt,
    asOf,
  })
  const phase8PacketValidation = validateBondLodgementEvidencePacket(packet)
  const normalizedSignals = Object.freeze(asArray(inboundSignals).map(normalizeSignal))
  const results = reconcileSignals(normalizedSignals, packet)
  const metrics = buildMetrics(results)
  const reconciliationFingerprint = buildReconciliationFingerprint(results)
  const shell = Object.freeze({
    version: BOND_ATTORNEY_PHASE9_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    workspaceId: packet.workspaceId,
    transactionId: packet.transactionId,
    laneKey: 'bond',
    generatedAt,
    asOf,
    phase8Packet: Object.freeze({
      ready: packet.readyForPhase9 === true,
      status: packet.status || null,
      packetFingerprint: packet.packetFingerprint || null,
      requirementCount: packet.metrics?.requirementCount || 0,
      satisfiedCount: packet.metrics?.satisfiedCount || 0,
    }),
    phase8PacketValidation,
    signals: normalizedSignals,
    results,
    metrics,
    reconciliationFingerprint,
    controls: BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY,
    readyForRelease: false,
  })
  const validation = validateBondInboundSignalRegister(shell)
  const readyForRelease = validation.valid &&
    packet.readyForPhase9 === true &&
    metrics.blockingCount === 0 &&
    BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.manualEvidenceRemainsPrimary === true &&
    BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.submitsToBankPortal === false &&
    BOND_INBOUND_SIGNAL_RECONCILIATION_BOUNDARY.mutatesRegistryOutcome === false
  const register = Object.freeze({
    ...shell,
    validation,
    readyForRelease,
  })
  return Object.freeze({
    ...register,
    nextActions: buildBondInboundSignalNextActions(register),
    auditEvent: buildAuditEvent({ packet, register: { ...register, readyForRelease }, actor, commandId, occurredAt: generatedAt }),
  })
}

export function buildBondAttorneyPhase9BaselineReport(input = {}) {
  const register = buildBondInboundSignalRegister(input)
  return Object.freeze({
    version: BOND_ATTORNEY_PHASE9_VERSION,
    releaseBlockerId: BOND_ATTORNEY_PHASE9_RELEASE_BLOCKER_ID,
    signalCount: register.metrics.signalCount,
    matchedCount: register.metrics.matchedCount,
    conflictCount: register.metrics.conflictCount,
    blockingCount: register.metrics.blockingCount,
    validation: register.validation,
    nextActionCount: register.nextActions.length,
    controls: register.controls,
    readyForRelease: register.readyForRelease,
  })
}
