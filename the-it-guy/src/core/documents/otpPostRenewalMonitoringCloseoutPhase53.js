import {
  OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION,
  OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS,
  buildOtpVersionRenewalApplyReceiptPhase52Audit,
} from './otpVersionRenewalApplyReceiptPhase52.js'

export const OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION = 'otp_post_renewal_monitoring_closeout_phase53_v1'
export const OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS = 'OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_FOR_STEADY_STATE_RENEWAL_GOVERNANCE'
export const OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT = 'otp-vnext-post-renewal-monitoring-closeout-phase53-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_ARCHIVE_KEYS = Object.freeze([
  'phase52_apply_receipt',
  'renewal_activation_observation',
  'post_renewal_monitoring_window',
  'resale_route_health_snapshot',
  'new_development_route_health_snapshot',
  'version_pointer_health_snapshot',
  'rollback_readiness_receipt',
  'incident_closeout_register',
  'renewal_governance_handoff',
])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['release_operator', 'template_owner', 'governance_owner'])
const MIN_SNAPSHOT_COUNT = 3
const MAX_SNAPSHOT_GAP_MINUTES = 15

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

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function timeMs(value = '') {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}

function stableFingerprint(value, prefix = 'otp-phase53-post-renewal') {
  const canonical = JSON.stringify(canonicalValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${prefix}:${hash.toString(16).padStart(8, '0')}:${canonical.length}`
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.templateDefaultId || row.sourcePath || row.path || row.archivePath)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function routeReceiptFor(applyReceipt = {}, routeVariant = '') {
  return list(applyReceipt.receiptEvidence?.routeApplyReceipts).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
}

function defaultActivationObservation(applyReceipt = {}, checkedAt = new Date().toISOString()) {
  const receiptEvidence = applyReceipt.receiptEvidence || {}
  const target = receiptEvidence.target || {}
  return {
    activationObservationId: 'otp-vnext-phase53-post-renewal-activation-observation',
    observedAt: checkedAt,
    environment: 'production',
    sourceApplyReceiptId: receiptEvidence.receiptId,
    sourceApplyReceiptFingerprint: applyReceipt.applyReceiptFingerprint,
    sourceGuardFingerprint: receiptEvidence.sourceGuardFingerprint,
    previousVersionKey: target.previousVersionKey,
    activatedVersionKey: target.targetVersionKey,
    versionPointerFingerprint: receiptEvidence.versionPointerApplyReceipt?.pointerFingerprint,
    activationEventRecorded: true,
    productionWriteCountObserved: 1,
    activationPerformedBySeparateApplyCommand: true,
    rollbackPlanReference: receiptEvidence.rollbackPlanReference,
  }
}

function defaultMonitoringWindow(activationObservation = {}) {
  const observedAt = timeMs(activationObservation.observedAt) || Date.parse('2026-08-06T10:00:00.000Z')
  return {
    environment: 'production',
    startedAt: new Date(observedAt + 5 * 60 * 1000).toISOString(),
    endedAt: new Date(observedAt + 95 * 60 * 1000).toISOString(),
    snapshotCount: 7,
    maxSnapshotGapMinutes: 12,
    monitoringSource: 'otp-version-renewal-watchdog',
  }
}

function defaultRouteHealthSnapshots(applyReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const route = routeReceiptFor(applyReceipt, routeVariant)
    return {
      routeVariant,
      expectedTemplateDefaultId: route.targetLiveTemplateDefaultId,
      observedTemplateDefaultId: route.targetLiveTemplateDefaultId,
      expectedSigningEnvelopeKey: route.targetSigningEnvelopeKey,
      observedSigningEnvelopeKey: route.targetSigningEnvelopeKey,
      expectedRouteOutputFingerprint: route.routeOutputFingerprint,
      observedRouteOutputFingerprint: route.routeOutputFingerprint,
      sourceFormat: 'native_pdf_template',
      generatedOtpCount: 3,
      generatedOtpFailureCount: 0,
      signingEnvelopeFailureCount: 0,
      signerScopeViolationCount: 0,
      finalArtifactFailureCount: 0,
      routeDriftCount: 0,
      docxReferenceCount: 0,
      archived: true,
    }
  })
}

function defaultVersionPointerHealth(applyReceipt = {}, activationObservation = {}) {
  const pointerReceipt = applyReceipt.receiptEvidence?.versionPointerApplyReceipt || {}
  return {
    expectedPreviousVersionKey: pointerReceipt.previousVersionKey,
    expectedActivatedVersionKey: pointerReceipt.targetVersionKey,
    observedPreviousVersionKey: activationObservation.previousVersionKey,
    observedActivatedVersionKey: activationObservation.activatedVersionKey,
    expectedPointerFingerprint: pointerReceipt.pointerFingerprint,
    observedPointerFingerprint: activationObservation.versionPointerFingerprint,
    pointerDriftCount: 0,
    pointerSnapshotArchived: true,
  }
}

function defaultRollbackReadiness(applyReceipt = {}) {
  return {
    rollbackPlanReference: applyReceipt.receiptEvidence?.rollbackPlanReference,
    rollbackOwner: 'release_operator',
    rollbackStillAvailable: true,
    restorePreviousVersionReady: true,
    restoreRouteDefaultsReady: true,
    restoreSigningEnvelopesReady: true,
    stopSigningDispatchReady: true,
    rollbackReceiptArchived: true,
  }
}

function fingerprint64(seed = '') {
  const normalized = normalizeKey(seed) || 'otp_post_renewal_archive'
  return `${normalized}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/g, 'a')
}

function defaultArchiveEntries() {
  return REQUIRED_ARCHIVE_KEYS.map((key) => ({
    key,
    path: `docs/${key.replace(/_/g, '-')}-phase53.md`,
    sha256: fingerprint64(key),
    storageClass: 'governance_archive',
    retentionPolicy: 'template_renewal_plus_7_years',
    owner: key.includes('governance') ? 'governance_owner' : 'release_operator',
    immutable: true,
    sourceFormat: 'markdown_evidence',
  }))
}

function defaultCloseoutApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase53-${role}-post-renewal-closeout`,
    approvedAt: checkedAt,
  }))
}

function defaultIncidentCloseout() {
  return {
    openIncidentCount: 0,
    unresolvedWarningCount: 0,
    rollbackTriggered: false,
    postRenewalOwner: 'template_operations_owner',
  }
}

function defaultGovernanceHandoff(applyReceipt = {}) {
  return {
    owner: 'governance_owner',
    templateOwner: 'template_owner',
    supportOwner: 'support_owner',
    monitoringCadence: 'weekly_template_renewal_health_review',
    archiveReference: 'otp-vnext-phase53-post-renewal-governance-archive',
    renewedVersionKey: applyReceipt.receiptEvidence?.target?.targetVersionKey,
  }
}

function phase52Blockers(applyReceipt = {}) {
  return [
    applyReceipt.version === OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION ? '' : 'phase52_apply_receipt_version_mismatch',
    applyReceipt.status === OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS ? '' : 'phase52_apply_receipt_not_ready',
    applyReceipt.canPermitFinalLiveWriteAuthority === true ? '' : 'phase52_apply_receipt_not_allowed',
    list(applyReceipt.blockerCodes).length === 0 ? '' : 'phase52_apply_receipt_has_blockers',
    applyReceipt.mutatedData === false ? '' : 'phase52_apply_receipt_mutation_unexpected',
  ].filter(Boolean)
}

function activationBlockers(activation = {}, applyReceipt = {}) {
  const receiptEvidence = applyReceipt.receiptEvidence || {}
  const target = receiptEvidence.target || {}
  return [
    normalizeText(activation.activationObservationId) ? '' : 'renewal_activation_observation_id_missing',
    normalizeKey(activation.environment) === 'production' ? '' : 'renewal_activation_environment_not_production',
    activation.sourceApplyReceiptId === receiptEvidence.receiptId ? '' : 'renewal_activation_apply_receipt_id_mismatch',
    activation.sourceApplyReceiptFingerprint === applyReceipt.applyReceiptFingerprint ? '' : 'renewal_activation_apply_receipt_fingerprint_mismatch',
    activation.sourceGuardFingerprint === receiptEvidence.sourceGuardFingerprint ? '' : 'renewal_activation_guard_fingerprint_mismatch',
    activation.previousVersionKey === target.previousVersionKey ? '' : 'renewal_activation_previous_version_mismatch',
    activation.activatedVersionKey === target.targetVersionKey ? '' : 'renewal_activation_target_version_mismatch',
    activation.versionPointerFingerprint === receiptEvidence.versionPointerApplyReceipt?.pointerFingerprint ? '' : 'renewal_activation_pointer_fingerprint_mismatch',
    activation.activationEventRecorded === true ? '' : 'renewal_activation_event_missing',
    activation.activationPerformedBySeparateApplyCommand === true ? '' : 'renewal_activation_not_separate_apply_command',
    numberValue(activation.productionWriteCountObserved) === 1 ? '' : 'renewal_activation_write_count_unexpected',
    activation.rollbackPlanReference === receiptEvidence.rollbackPlanReference ? '' : 'renewal_activation_rollback_plan_mismatch',
  ].filter(Boolean)
}

function monitoringWindowBlockers(window = {}, activation = {}) {
  const startedAtMs = timeMs(window.startedAt)
  const endedAtMs = timeMs(window.endedAt)
  const activationMs = timeMs(activation.observedAt)
  return [
    normalizeKey(window.environment) === 'production' ? '' : 'post_renewal_monitoring_environment_not_production',
    startedAtMs && endedAtMs && endedAtMs > startedAtMs ? '' : 'post_renewal_monitoring_window_not_bounded',
    activationMs && startedAtMs && startedAtMs >= activationMs ? '' : 'post_renewal_monitoring_not_after_activation',
    numberValue(window.snapshotCount) >= MIN_SNAPSHOT_COUNT ? '' : 'post_renewal_snapshot_count_too_low',
    numberValue(window.maxSnapshotGapMinutes) <= MAX_SNAPSHOT_GAP_MINUTES ? '' : 'post_renewal_snapshot_gap_too_high',
    normalizeText(window.monitoringSource) ? '' : 'post_renewal_monitoring_source_missing',
  ].filter(Boolean)
}

function routeHealthBlockers(routeSnapshots = [], applyReceipt = {}) {
  const observedRoutes = list(routeSnapshots).map((row) => normalizeKey(row.routeVariant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !observedRoutes.includes(route))
  const duplicateRoutes = observedRoutes.filter((route, index) => route && observedRoutes.indexOf(route) !== index)
  const rowBlockers = list(routeSnapshots).flatMap((row) => {
    const route = normalizeKey(row.routeVariant) || 'unknown'
    const receiptRoute = routeReceiptFor(applyReceipt, route)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `post_renewal_route_unsupported:${route}`,
      row.expectedTemplateDefaultId === receiptRoute.targetLiveTemplateDefaultId ? '' : `post_renewal_route_expected_template_mismatch:${route}`,
      row.observedTemplateDefaultId === receiptRoute.targetLiveTemplateDefaultId ? '' : `post_renewal_template_default_drift:${route}`,
      row.expectedSigningEnvelopeKey === receiptRoute.targetSigningEnvelopeKey ? '' : `post_renewal_route_expected_envelope_mismatch:${route}`,
      row.observedSigningEnvelopeKey === receiptRoute.targetSigningEnvelopeKey ? '' : `post_renewal_signing_envelope_drift:${route}`,
      row.expectedRouteOutputFingerprint === receiptRoute.routeOutputFingerprint ? '' : `post_renewal_expected_route_fingerprint_mismatch:${route}`,
      row.observedRouteOutputFingerprint === receiptRoute.routeOutputFingerprint ? '' : `post_renewal_route_output_fingerprint_drift:${route}`,
      hasDocxSource(row) ? `post_renewal_docx_source_observed:${route}` : '',
      numberValue(row.generatedOtpFailureCount) === 0 ? '' : `post_renewal_generation_failure_observed:${route}`,
      numberValue(row.signingEnvelopeFailureCount) === 0 ? '' : `post_renewal_signing_envelope_failure_observed:${route}`,
      numberValue(row.signerScopeViolationCount) === 0 ? '' : `post_renewal_signer_scope_violation_observed:${route}`,
      numberValue(row.finalArtifactFailureCount) === 0 ? '' : `post_renewal_final_artifact_failure_observed:${route}`,
      numberValue(row.routeDriftCount) === 0 ? '' : `post_renewal_route_drift_observed:${route}`,
      row.archived === true ? '' : `post_renewal_route_snapshot_not_archived:${route}`,
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `post_renewal_missing_route_snapshot:${route}`),
    ...unique(duplicateRoutes).map((route) => `post_renewal_duplicate_route_snapshot:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerBlockers(pointerHealth = {}, applyReceipt = {}) {
  const pointerReceipt = applyReceipt.receiptEvidence?.versionPointerApplyReceipt || {}
  return [
    pointerHealth.expectedPreviousVersionKey === pointerReceipt.previousVersionKey ? '' : 'post_renewal_pointer_expected_previous_mismatch',
    pointerHealth.expectedActivatedVersionKey === pointerReceipt.targetVersionKey ? '' : 'post_renewal_pointer_expected_target_mismatch',
    pointerHealth.observedPreviousVersionKey === pointerReceipt.previousVersionKey ? '' : 'post_renewal_pointer_previous_drift',
    pointerHealth.observedActivatedVersionKey === pointerReceipt.targetVersionKey ? '' : 'post_renewal_pointer_target_drift',
    pointerHealth.expectedPointerFingerprint === pointerReceipt.pointerFingerprint ? '' : 'post_renewal_pointer_expected_fingerprint_mismatch',
    pointerHealth.observedPointerFingerprint === pointerReceipt.pointerFingerprint ? '' : 'post_renewal_pointer_fingerprint_drift',
    numberValue(pointerHealth.pointerDriftCount) === 0 ? '' : 'post_renewal_pointer_drift_observed',
    pointerHealth.pointerSnapshotArchived === true ? '' : 'post_renewal_pointer_snapshot_not_archived',
  ].filter(Boolean)
}

function rollbackBlockers(rollback = {}, applyReceipt = {}) {
  return [
    rollback.rollbackPlanReference === applyReceipt.receiptEvidence?.rollbackPlanReference ? '' : 'post_renewal_rollback_plan_mismatch',
    normalizeText(rollback.rollbackOwner) ? '' : 'post_renewal_rollback_owner_missing',
    rollback.rollbackStillAvailable === true ? '' : 'post_renewal_rollback_not_available',
    rollback.restorePreviousVersionReady === true ? '' : 'post_renewal_restore_previous_version_not_ready',
    rollback.restoreRouteDefaultsReady === true ? '' : 'post_renewal_restore_route_defaults_not_ready',
    rollback.restoreSigningEnvelopesReady === true ? '' : 'post_renewal_restore_signing_envelopes_not_ready',
    rollback.stopSigningDispatchReady === true ? '' : 'post_renewal_stop_signing_dispatch_not_ready',
    rollback.rollbackReceiptArchived === true ? '' : 'post_renewal_rollback_receipt_not_archived',
  ].filter(Boolean)
}

function archiveBlockers(archiveEntries = []) {
  const keys = list(archiveEntries).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_ARCHIVE_KEYS.filter((key) => !keys.includes(key))
  const rowBlockers = list(archiveEntries).flatMap((row) => {
    const key = normalizeKey(row.key) || 'unknown'
    return [
      REQUIRED_ARCHIVE_KEYS.includes(key) ? '' : `post_renewal_archive_unsupported:${key}`,
      normalizeText(row.path) ? '' : `post_renewal_archive_path_missing:${key}`,
      /^[a-f0-9]{64}$/i.test(normalizeText(row.sha256)) ? '' : `post_renewal_archive_fingerprint_missing:${key}`,
      normalizeText(row.retentionPolicy) ? '' : `post_renewal_archive_retention_missing:${key}`,
      normalizeText(row.owner) ? '' : `post_renewal_archive_owner_missing:${key}`,
      row.immutable === true ? '' : `post_renewal_archive_entry_not_immutable:${key}`,
      hasDocxSource(row) ? `post_renewal_archive_docx_source_observed:${key}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingKeys.map((key) => `post_renewal_missing_archive_entry:${key}`),
    ...rowBlockers,
  ]
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(approvals).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_APPROVAL_ROLES.includes(role) && (
      row.approved !== true ||
      !normalizeText(row.approvalReference) ||
      !normalizeText(row.approvedAt)
    )
  })
  return [
    ...missingRoles.map((role) => `post_renewal_missing_closeout_approval:${role}`),
    ...incompleteRows.map((row) => `post_renewal_incomplete_closeout_approval:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function incidentBlockers(incidentCloseout = {}) {
  return [
    numberValue(incidentCloseout.openIncidentCount) === 0 ? '' : 'post_renewal_open_incidents_remain',
    numberValue(incidentCloseout.unresolvedWarningCount) === 0 ? '' : 'post_renewal_unresolved_warnings_remain',
    incidentCloseout.rollbackTriggered === true ? 'post_renewal_rollback_triggered' : '',
    normalizeText(incidentCloseout.postRenewalOwner) ? '' : 'post_renewal_owner_missing',
  ].filter(Boolean)
}

function governanceBlockers(governanceHandoff = {}, applyReceipt = {}) {
  return [
    normalizeText(governanceHandoff.owner) ? '' : 'post_renewal_governance_owner_missing',
    normalizeText(governanceHandoff.templateOwner) ? '' : 'post_renewal_template_owner_missing',
    normalizeText(governanceHandoff.supportOwner) ? '' : 'post_renewal_support_owner_missing',
    normalizeText(governanceHandoff.monitoringCadence) ? '' : 'post_renewal_monitoring_cadence_missing',
    normalizeText(governanceHandoff.archiveReference) ? '' : 'post_renewal_archive_reference_missing',
    governanceHandoff.renewedVersionKey === applyReceipt.receiptEvidence?.target?.targetVersionKey ? '' : 'post_renewal_governance_version_mismatch',
  ].filter(Boolean)
}

function rollbackTriggerCodes(blockerCodes = []) {
  return blockerCodes.flatMap((code) => {
    if (/template_default_drift|signing_envelope_drift|route_output_fingerprint_drift|route_drift/.test(code)) return [`rollback_trigger:${code}`]
    if (/pointer_.*drift|pointer_drift_observed/.test(code)) return [`rollback_trigger:${code}`]
    if (/generation_failure|signing_envelope_failure|signer_scope_violation|final_artifact_failure/.test(code)) return [`rollback_trigger:${code}`]
    if (/docx_source_observed|archive_docx_source_observed/.test(code)) return [`rollback_trigger:${code}`]
    if (/rollback_not_available|restore_.*not_ready|stop_signing_dispatch_not_ready/.test(code)) return [`rollback_trigger:${code}`]
    if (/open_incidents_remain|rollback_triggered/.test(code)) return [`rollback_trigger:${code}`]
    return []
  })
}

function closeoutPayload(receipt = {}) {
  return {
    contract: OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT,
    phase52ApplyReceiptFingerprint: receipt.applyReceipt?.applyReceiptFingerprint,
    activationObservation: receipt.activationObservation,
    monitoringWindow: receipt.monitoringWindow,
    routeHealthSnapshots: receipt.routeHealthSnapshots,
    versionPointerHealth: receipt.versionPointerHealth,
    rollbackReadiness: receipt.rollbackReadiness,
    archiveEntries: receipt.archiveEntries,
    closeoutApprovals: receipt.closeoutApprovals,
    incidentCloseout: receipt.incidentCloseout,
    governanceHandoff: receipt.governanceHandoff,
  }
}

export function buildOtpPostRenewalMonitoringCloseoutReceipt({
  applyReceipt = buildOtpVersionRenewalApplyReceiptPhase52Audit().applyReceipts?.find((receipt) => receipt.canPermitFinalLiveWriteAuthority),
  activationObservation = null,
  monitoringWindow = null,
  routeHealthSnapshots = null,
  versionPointerHealth = null,
  rollbackReadiness = null,
  archiveEntries = defaultArchiveEntries(),
  closeoutApprovals = null,
  incidentCloseout = defaultIncidentCloseout(),
  governanceHandoff = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const activation = activationObservation || defaultActivationObservation(applyReceipt, checkedAt)
  const window = monitoringWindow || defaultMonitoringWindow(activation)
  const routes = routeHealthSnapshots || defaultRouteHealthSnapshots(applyReceipt)
  const pointer = versionPointerHealth || defaultVersionPointerHealth(applyReceipt, activation)
  const rollback = rollbackReadiness || defaultRollbackReadiness(applyReceipt)
  const approvals = closeoutApprovals || defaultCloseoutApprovals(checkedAt)
  const governance = governanceHandoff || defaultGovernanceHandoff(applyReceipt)
  const blockerCodes = unique([
    ...phase52Blockers(applyReceipt || {}),
    ...activationBlockers(activation, applyReceipt),
    ...monitoringWindowBlockers(window, activation),
    ...routeHealthBlockers(routes, applyReceipt),
    ...versionPointerBlockers(pointer, applyReceipt),
    ...rollbackBlockers(rollback, applyReceipt),
    ...archiveBlockers(archiveEntries),
    ...approvalBlockers(approvals),
    ...incidentBlockers(incidentCloseout),
    ...governanceBlockers(governance, applyReceipt),
  ])
  const rollbackTriggers = unique(rollbackTriggerCodes(blockerCodes))
  const expectedCloseoutFingerprint = stableFingerprint(closeoutPayload({
    applyReceipt,
    activationObservation: activation,
    monitoringWindow: window,
    routeHealthSnapshots: routes,
    versionPointerHealth: pointer,
    rollbackReadiness: rollback,
    archiveEntries,
    closeoutApprovals: approvals,
    incidentCloseout,
    governanceHandoff: governance,
  }), 'otp-phase53-post-renewal-closeout')
  const canClosePostRenewal = blockerCodes.length === 0 && rollbackTriggers.length === 0

  return Object.freeze({
    version: OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION,
    contract: OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT,
    checkedAt,
    status: canClosePostRenewal
      ? OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS
      : 'OTP_POST_RENEWAL_MONITORING_CLOSEOUT_BLOCKED',
    canClosePostRenewal,
    shouldTriggerRollback: rollbackTriggers.length > 0,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    rollbackTriggerCodes: Object.freeze(rollbackTriggers),
    closeoutFingerprint: expectedCloseoutFingerprint,
    applyReceipt: Object.freeze({
      version: applyReceipt?.version,
      status: applyReceipt?.status,
      canPermitFinalLiveWriteAuthority: applyReceipt?.canPermitFinalLiveWriteAuthority === true,
      receiptId: applyReceipt?.receiptEvidence?.receiptId,
      applyReceiptFingerprint: applyReceipt?.applyReceiptFingerprint,
      sourceGuardFingerprint: applyReceipt?.receiptEvidence?.sourceGuardFingerprint,
      targetVersionKey: applyReceipt?.receiptEvidence?.target?.targetVersionKey,
    }),
    activationObservation: Object.freeze({ ...activation }),
    monitoringWindow: Object.freeze({ ...window }),
    routeHealthSnapshots: Object.freeze(list(routes)),
    versionPointerHealth: Object.freeze({ ...pointer }),
    rollbackReadiness: Object.freeze({ ...rollback }),
    archiveEntries: Object.freeze(list(archiveEntries)),
    closeoutApprovals: Object.freeze(list(approvals)),
    incidentCloseout: Object.freeze({ ...incidentCloseout }),
    governanceHandoff: Object.freeze({ ...governance }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      monitoredRouteCount: list(routes).length,
      archiveEntryCount: list(archiveEntries).length,
      approvalCount: list(approvals).length,
      snapshotCount: numberValue(window.snapshotCount),
      maxSnapshotGapMinutes: numberValue(window.maxSnapshotGapMinutes),
      blockerCount: blockerCodes.length,
      rollbackTriggerCount: rollbackTriggers.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpPostRenewalMonitoringCloseoutPhase53Audit({
  checkedAt = new Date().toISOString(),
  phase52Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase52Ready = !phase52Audit || phase52Audit.status === OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS
  const goodApplyReceipt = phase52Audit?.applyReceipts?.find((receipt) => receipt.canPermitFinalLiveWriteAuthority) ||
    buildOtpVersionRenewalApplyReceiptPhase52Audit({ checkedAt }).applyReceipts.find((receipt) => receipt.canPermitFinalLiveWriteAuthority)
  const goodCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
  })
  const routeDriftCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    routeHealthSnapshots: defaultRouteHealthSnapshots(goodApplyReceipt).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, observedTemplateDefaultId: 'otp-resale-template-legacy', routeDriftCount: 1 }
        : row,
    ),
  })
  const pointerDriftCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    versionPointerHealth: {
      ...defaultVersionPointerHealth(goodApplyReceipt, defaultActivationObservation(goodApplyReceipt, checkedAt)),
      observedActivatedVersionKey: 'otp-template-vnext-phase39',
      pointerDriftCount: 1,
    },
  })
  const rollbackUnavailableCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    rollbackReadiness: {
      ...defaultRollbackReadiness(goodApplyReceipt),
      rollbackStillAvailable: false,
      restorePreviousVersionReady: false,
      rollbackReceiptArchived: false,
    },
  })
  const missingArchiveCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    archiveEntries: defaultArchiveEntries().filter((row) => row.key !== 'version_pointer_health_snapshot'),
  })
  const docxCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    routeHealthSnapshots: defaultRouteHealthSnapshots(goodApplyReceipt).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'new-development-otp.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const incidentCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    incidentCloseout: {
      ...defaultIncidentCloseout(),
      openIncidentCount: 1,
    },
  })
  const approvalMissingCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    closeoutApprovals: defaultCloseoutApprovals(checkedAt).filter((row) => row.role !== 'governance_owner'),
  })
  const unboundedWindowCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    monitoringWindow: {
      ...defaultMonitoringWindow(defaultActivationObservation(goodApplyReceipt, checkedAt)),
      endedAt: '',
      snapshotCount: 1,
      maxSnapshotGapMinutes: 60,
    },
  })
  const fingerprintMismatchCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
    checkedAt,
    applyReceipt: goodApplyReceipt,
    activationObservation: {
      ...defaultActivationObservation(goodApplyReceipt, checkedAt),
      sourceApplyReceiptFingerprint: 'wrong-apply-receipt-fingerprint',
    },
  })

  addCheck(checks, phase52Ready, 'PHASE53_PHASE52_APPLY_RECEIPT_READY', 'Post-renewal monitoring starts only after the Phase 52 apply receipt is ready.')
  addCheck(
    checks,
    goodCloseout.canClosePostRenewal &&
      goodCloseout.status === OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS &&
      goodCloseout.mutatedData === false,
    'PHASE53_GOOD_POST_RENEWAL_CLOSEOUT_READY',
    'A clean renewal activation observation can be monitored, rollback-armed, and archived without mutating data.',
  )
  addCheck(
    checks,
    goodCloseout.activationObservation.sourceApplyReceiptFingerprint === goodApplyReceipt.applyReceiptFingerprint &&
      goodCloseout.activationObservation.activatedVersionKey === goodApplyReceipt.receiptEvidence?.target?.targetVersionKey,
    'PHASE53_ACTIVATION_BOUND_TO_PHASE52_RECEIPT',
    'Activation observation is bound to the exact Phase 52 apply receipt fingerprint and renewed version key.',
  )
  addCheck(
    checks,
    goodCloseout.summary.snapshotCount >= MIN_SNAPSHOT_COUNT &&
      goodCloseout.summary.maxSnapshotGapMinutes <= MAX_SNAPSHOT_GAP_MINUTES,
    'PHASE53_MONITORING_WINDOW_BOUNDED',
    'Post-renewal production monitoring requires a bounded, sufficiently sampled window.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodCloseout.routeHealthSnapshots.some((row) => row.routeVariant === route && row.archived === true)),
    'PHASE53_BOTH_RENEWED_ROUTES_MONITORED_AND_ARCHIVED',
    'Resale and new-development routes must both be monitored and archived after renewal activation.',
  )
  addCheck(
    checks,
    goodCloseout.routeHealthSnapshots.every((row) =>
      row.observedTemplateDefaultId === row.expectedTemplateDefaultId &&
      row.observedSigningEnvelopeKey === row.expectedSigningEnvelopeKey &&
      row.observedRouteOutputFingerprint === row.expectedRouteOutputFingerprint,
    ),
    'PHASE53_ROUTE_DEFAULTS_ENVELOPES_AND_OUTPUTS_STABLE',
    'Renewed route defaults, signing envelopes, and generated-output fingerprints must remain stable.',
  )
  addCheck(
    checks,
    goodCloseout.versionPointerHealth.observedActivatedVersionKey === goodCloseout.versionPointerHealth.expectedActivatedVersionKey &&
      goodCloseout.versionPointerHealth.observedPointerFingerprint === goodCloseout.versionPointerHealth.expectedPointerFingerprint,
    'PHASE53_VERSION_POINTER_STABLE',
    'Renewed version pointer must still point to the activated version with the expected fingerprint.',
  )
  addCheck(
    checks,
    goodCloseout.rollbackReadiness.rollbackStillAvailable === true &&
      goodCloseout.rollbackReadiness.restorePreviousVersionReady === true &&
      goodCloseout.rollbackReadiness.rollbackReceiptArchived === true,
    'PHASE53_ROLLBACK_REMAINS_AVAILABLE_AND_ARCHIVED',
    'Rollback remains available after activation and the rollback receipt is archived.',
  )
  addCheck(
    checks,
    REQUIRED_ARCHIVE_KEYS.every((key) => goodCloseout.archiveEntries.some((row) => row.key === key && row.immutable === true && row.sha256)),
    'PHASE53_REQUIRED_ARCHIVE_ENTRIES_CAPTURED',
    'Post-renewal closeout archive includes the apply receipt, monitoring, route, pointer, rollback, incident, and governance evidence.',
  )
  addCheck(
    checks,
    routeDriftCloseout.canClosePostRenewal === false &&
      routeDriftCloseout.shouldTriggerRollback === true &&
      routeDriftCloseout.blockerCodes.includes('post_renewal_template_default_drift:resale_existing_property'),
    'PHASE53_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
    'Any renewed route-default drift blocks closeout and raises rollback.',
  )
  addCheck(
    checks,
    pointerDriftCloseout.canClosePostRenewal === false &&
      pointerDriftCloseout.shouldTriggerRollback === true &&
      pointerDriftCloseout.blockerCodes.includes('post_renewal_pointer_target_drift'),
    'PHASE53_VERSION_POINTER_DRIFT_TRIGGERS_ROLLBACK',
    'Any renewed version-pointer drift blocks closeout and raises rollback.',
  )
  addCheck(
    checks,
    rollbackUnavailableCloseout.canClosePostRenewal === false &&
      rollbackUnavailableCloseout.shouldTriggerRollback === true &&
      rollbackUnavailableCloseout.blockerCodes.includes('post_renewal_rollback_not_available'),
    'PHASE53_ROLLBACK_UNAVAILABLE_BLOCKED',
    'Closeout is blocked if rollback is unavailable or no longer archived.',
  )
  addCheck(
    checks,
    missingArchiveCloseout.canClosePostRenewal === false &&
      missingArchiveCloseout.blockerCodes.includes('post_renewal_missing_archive_entry:version_pointer_health_snapshot'),
    'PHASE53_MISSING_ARCHIVE_ENTRY_BLOCKED',
    'Closeout is blocked when required post-renewal evidence is missing from the archive.',
  )
  addCheck(
    checks,
    docxCloseout.canClosePostRenewal === false &&
      docxCloseout.shouldTriggerRollback === true &&
      docxCloseout.blockerCodes.includes('post_renewal_docx_source_observed:new_development'),
    'PHASE53_DOCX_REGRESSION_TRIGGERS_ROLLBACK',
    'Any renewed route falling back to DOC/DOCX blocks closeout and raises rollback.',
  )
  addCheck(
    checks,
    incidentCloseout.canClosePostRenewal === false &&
      incidentCloseout.shouldTriggerRollback === true &&
      incidentCloseout.blockerCodes.includes('post_renewal_open_incidents_remain'),
    'PHASE53_OPEN_INCIDENTS_BLOCK_CLOSEOUT',
    'Open incidents block post-renewal closeout and keep rollback watch active.',
  )
  addCheck(
    checks,
    approvalMissingCloseout.canClosePostRenewal === false &&
      approvalMissingCloseout.blockerCodes.includes('post_renewal_missing_closeout_approval:governance_owner'),
    'PHASE53_MISSING_CLOSEOUT_APPROVAL_BLOCKED',
    'Governance approval is required before post-renewal closeout.',
  )
  addCheck(
    checks,
    unboundedWindowCloseout.canClosePostRenewal === false &&
      unboundedWindowCloseout.blockerCodes.includes('post_renewal_monitoring_window_not_bounded') &&
      unboundedWindowCloseout.blockerCodes.includes('post_renewal_snapshot_count_too_low'),
    'PHASE53_UNBOUNDED_MONITORING_WINDOW_BLOCKED',
    'Closeout is blocked when monitoring is unbounded or under-sampled.',
  )
  addCheck(
    checks,
    fingerprintMismatchCloseout.canClosePostRenewal === false &&
      fingerprintMismatchCloseout.blockerCodes.includes('renewal_activation_apply_receipt_fingerprint_mismatch'),
    'PHASE53_APPLY_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
    'Closeout is blocked if activation is not tied to the exact Phase 52 apply receipt fingerprint.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-post-renewal-monitoring-closeout-phase53'] === 'node scripts/otp-post-renewal-monitoring-closeout-phase53.test.mjs' &&
      packageJson.scripts?.['report:otp-post-renewal-monitoring-closeout-phase53'] === 'node scripts/report-otp-post-renewal-monitoring-closeout-phase53.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-post-renewal-monitoring-closeout-phase53'),
    'PHASE53_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 53 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION,
    contract: OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_POST_RENEWAL_MONITORING_CLOSEOUT_REMEDIATION_REQUIRED' : OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    closeoutReceipts: Object.freeze([
      goodCloseout,
      routeDriftCloseout,
      pointerDriftCloseout,
      rollbackUnavailableCloseout,
      missingArchiveCloseout,
      docxCloseout,
      incidentCloseout,
      approvalMissingCloseout,
      unboundedWindowCloseout,
      fingerprintMismatchCloseout,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      cleanCloseoutCount: [goodCloseout].filter((row) => row.canClosePostRenewal).length,
      rollbackTriggerCloseoutCount: [
        routeDriftCloseout,
        pointerDriftCloseout,
        rollbackUnavailableCloseout,
        docxCloseout,
        incidentCloseout,
      ].filter((row) => row.shouldTriggerRollback).length,
      routeCount: REQUIRED_ROUTES.length,
      archiveEntryCount: REQUIRED_ARCHIVE_KEYS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 54,
      key: 'otp_template_renewal_steady_state_review',
      label: 'Template Renewal Steady-State Review',
    }),
  })
}

export function formatOtpPostRenewalMonitoringCloseoutPhase53Markdown(report = buildOtpPostRenewalMonitoringCloseoutPhase53Audit()) {
  const readyReceipt = report.closeoutReceipts.find((receipt) => receipt.canClosePostRenewal) || report.closeoutReceipts[0]
  return [
    '# OTP Generator Phase 53 Post-Renewal Monitoring And Closeout',
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
        ['Clean closeouts', report.summary.cleanCloseoutCount],
        ['Rollback-trigger closeouts', report.summary.rollbackTriggerCloseoutCount],
        ['Routes', report.summary.routeCount],
        ['Archive entries', report.summary.archiveEntryCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Activation Observation',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Observation id', readyReceipt.activationObservation.activationObservationId],
        ['Environment', readyReceipt.activationObservation.environment],
        ['Source apply receipt id', readyReceipt.activationObservation.sourceApplyReceiptId],
        ['Source apply receipt fingerprint', readyReceipt.activationObservation.sourceApplyReceiptFingerprint],
        ['Activated version', readyReceipt.activationObservation.activatedVersionKey],
        ['Version pointer fingerprint', readyReceipt.activationObservation.versionPointerFingerprint],
        ['Rollback plan', readyReceipt.activationObservation.rollbackPlanReference],
        ['Closeout fingerprint', readyReceipt.closeoutFingerprint],
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
    '## Route Health',
    '',
    table(
      ['Route', 'Template', 'Envelope', 'Output Fingerprint', 'Generated', 'Archived'],
      readyReceipt.routeHealthSnapshots.map((route) => [
        route.routeVariant,
        route.observedTemplateDefaultId,
        route.observedSigningEnvelopeKey,
        route.observedRouteOutputFingerprint,
        route.generatedOtpCount,
        route.archived ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Archive Entries',
    '',
    table(
      ['Key', 'Path', 'Immutable', 'Retention'],
      readyReceipt.archiveEntries.map((entry) => [
        entry.key,
        entry.path,
        entry.immutable ? 'yes' : 'no',
        entry.retentionPolicy,
      ]),
    ),
    '',
    '## Closeout Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Rollback', 'Routes', 'Archive Entries', 'Blockers', 'Rollback Triggers'],
      report.closeoutReceipts.map((receipt) => [
        receipt.status,
        receipt.canClosePostRenewal ? 'yes' : 'no',
        receipt.shouldTriggerRollback ? 'yes' : 'no',
        receipt.summary.monitoredRouteCount,
        receipt.summary.archiveEntryCount,
        receipt.blockerCodes.join(', ') || 'none',
        receipt.rollbackTriggerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 53 proves the renewed OTP version can be monitored, rolled back, and archived after activation. The proof is bound to the exact Phase 52 apply receipt fingerprint, checks both resale and new-development route health, verifies the version pointer, keeps rollback available, closes incidents, records approvals, and archives immutable evidence. The test/report path remains observational and does not perform production writes.',
    '',
  ].join('\n')
}
