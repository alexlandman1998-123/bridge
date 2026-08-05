import {
  OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION,
  OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS,
  buildOtpReleaseCloseoutArchiveReceipt,
} from './otpReleaseCloseoutArchivePhase43.js'

export const OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION = 'otp_steady_state_governance_monitoring_phase44_v1'
export const OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS = 'OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_FOR_CHANGE_CONTROL'
export const OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT = 'otp-vnext-steady-state-governance-monitoring-phase44-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_MONITORING_SIGNALS = Object.freeze([
  'route_default_stability',
  'signing_envelope_stability',
  'legal_approval_validity',
  'archive_integrity',
  'incident_health',
  'rollback_retention',
])
const REQUIRED_REVIEW_ROLES = Object.freeze(['document_owner', 'support_owner', 'governance_owner'])
const MAX_MONITORING_GAP_DAYS = 7
const LEGAL_REVIEW_WINDOW_DAYS = 365

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

function daysBetween(start = '', end = '') {
  const startMs = timeMs(start)
  const endMs = timeMs(end)
  if (!startMs || !endMs || endMs < startMs) return Number.POSITIVE_INFINITY
  return (endMs - startMs) / (24 * 60 * 60 * 1000)
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
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.templateDefaultId || row.template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultMonitoringCycle(checkedAt = new Date().toISOString()) {
  const endMs = timeMs(checkedAt) || Date.now()
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000
  return {
    cycleKey: 'otp-vnext-weekly-governance-cycle',
    environment: 'production',
    cadence: 'weekly',
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    maxGapDays: 7,
    completed: true,
  }
}

function defaultRouteSnapshots() {
  return [
    {
      routeVariant: 'resale_existing_property',
      expectedTemplateDefaultId: 'otp-resale-template-vnext-phase39',
      observedTemplateDefaultId: 'otp-resale-template-vnext-phase39',
      expectedSigningEnvelopeKey: 'otp-resale-envelope-vnext',
      observedSigningEnvelopeKey: 'otp-resale-envelope-vnext',
      generatedOtpCount: 3,
      signingDispatchFailureCount: 0,
      finalArtifactFailureCount: 0,
      routeDriftCount: 0,
      docxReferenceCount: 0,
      sourceFormat: 'native_pdf_template',
    },
    {
      routeVariant: 'new_development',
      expectedTemplateDefaultId: 'otp-new-development-template-vnext-phase39',
      observedTemplateDefaultId: 'otp-new-development-template-vnext-phase39',
      expectedSigningEnvelopeKey: 'otp-new-development-envelope-vnext',
      observedSigningEnvelopeKey: 'otp-new-development-envelope-vnext',
      generatedOtpCount: 3,
      signingDispatchFailureCount: 0,
      finalArtifactFailureCount: 0,
      routeDriftCount: 0,
      docxReferenceCount: 0,
      sourceFormat: 'native_pdf_template',
    },
  ]
}

function defaultMonitoringSignals() {
  return REQUIRED_MONITORING_SIGNALS.map((key) => ({
    key,
    status: 'green',
    owner: key === 'legal_approval_validity' ? 'document_owner' : 'governance_owner',
    evidencePath: `docs/otp-${key.replace(/_/g, '-')}-steady-state.md`,
  }))
}

function defaultReviewAttestations(checkedAt = new Date().toISOString()) {
  return REQUIRED_REVIEW_ROLES.map((role) => ({
    role,
    attested: true,
    attestationReference: `phase44-${role}-steady-state-review`,
    attestedAt: checkedAt,
  }))
}

function defaultLegalReview(checkedAt = new Date().toISOString()) {
  const checkedAtMs = timeMs(checkedAt) || Date.now()
  return {
    attorneyApprovalStatus: 'approved',
    approvalReference: 'phase42-attorney-approval-summary',
    lastReviewedAt: new Date(checkedAtMs - 30 * 24 * 60 * 60 * 1000).toISOString(),
    reviewValidUntil: new Date(checkedAtMs + 335 * 24 * 60 * 60 * 1000).toISOString(),
    unresolvedLegalHoldCount: 0,
    changeRequestRequired: false,
  }
}

function defaultArchiveIntegrity() {
  return {
    archiveReference: 'otp-vnext-phase43-governance-archive',
    archiveReachable: true,
    fingerprintVerified: true,
    immutableEntriesVerified: true,
    missingEntryCount: 0,
  }
}

function defaultIncidentState() {
  return {
    openIncidentCount: 0,
    unresolvedWarningCount: 0,
    signingEscalationCount: 0,
    routeDriftEscalationCount: 0,
    docxRegressionCount: 0,
  }
}

function defaultRollbackRetention() {
  return {
    rollbackPlanReference: 'phase40-controlled-cutover-rollback-plan',
    rollbackAvailable: true,
    rollbackReceiptArchived: true,
    restoreDefaultsReady: true,
    disableFlagsReady: true,
    stopDispatchReady: true,
    retainedBy: 'release_operator',
  }
}

function defaultChangeControlQueue() {
  return {
    openChangeRequestCount: 0,
    unapprovedTemplateEditCount: 0,
    emergencyOverrideCount: 0,
    intakeOwner: 'document_owner',
  }
}

function monitoringCycleBlockers(cycle = {}, checkedAt = new Date().toISOString()) {
  return [
    normalizeKey(cycle.environment) === 'production' ? '' : 'governance_cycle_environment_not_production',
    normalizeText(cycle.cycleKey || cycle.cycle_key) ? '' : 'governance_cycle_key_missing',
    normalizeKey(cycle.cadence) === 'weekly' ? '' : 'governance_cycle_cadence_not_weekly',
    cycle.completed === true ? '' : 'governance_cycle_not_completed',
    timeMs(cycle.startedAt || cycle.started_at) && timeMs(cycle.endedAt || cycle.ended_at) ? '' : 'governance_cycle_dates_missing',
    daysBetween(cycle.startedAt || cycle.started_at, cycle.endedAt || cycle.ended_at) <= numberValue(cycle.maxGapDays || cycle.max_gap_days || MAX_MONITORING_GAP_DAYS)
      ? ''
      : 'governance_cycle_gap_too_large',
    daysBetween(cycle.endedAt || cycle.ended_at, checkedAt) <= MAX_MONITORING_GAP_DAYS ? '' : 'governance_cycle_stale',
  ].filter(Boolean)
}

function routeSnapshotBlockers(routeSnapshots = []) {
  const routes = list(routeSnapshots).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const routeBlockers = list(routeSnapshots).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      normalizeText(row.expectedTemplateDefaultId || row.expected_template_default_id) &&
        normalizeText(row.observedTemplateDefaultId || row.observed_template_default_id) === normalizeText(row.expectedTemplateDefaultId || row.expected_template_default_id)
        ? ''
        : `steady_state_template_default_drift:${route}`,
      normalizeText(row.expectedSigningEnvelopeKey || row.expected_signing_envelope_key) &&
        normalizeText(row.observedSigningEnvelopeKey || row.observed_signing_envelope_key) === normalizeText(row.expectedSigningEnvelopeKey || row.expected_signing_envelope_key)
        ? ''
        : `steady_state_signing_envelope_drift:${route}`,
      numberValue(row.signingDispatchFailureCount || row.signing_dispatch_failure_count) === 0
        ? ''
        : `steady_state_signing_failure:${route}`,
      numberValue(row.finalArtifactFailureCount || row.final_artifact_failure_count) === 0
        ? ''
        : `steady_state_final_artifact_failure:${route}`,
      numberValue(row.routeDriftCount || row.route_drift_count) === 0 ? '' : `steady_state_route_drift:${route}`,
      hasDocxSource(row) ? `steady_state_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `steady_state_missing_route:${route}`),
    ...routeBlockers,
  ]
}

function signalBlockers(signals = []) {
  const keys = list(signals).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_MONITORING_SIGNALS.filter((key) => !keys.includes(key))
  const unhealthyRows = list(signals).filter((row) =>
    REQUIRED_MONITORING_SIGNALS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'green' || !normalizeText(row.owner) || !normalizeText(row.evidencePath || row.evidence_path)),
  )
  return [
    ...missingKeys.map((key) => `missing_monitoring_signal:${key}`),
    ...unhealthyRows.map((row) => `monitoring_signal_not_green:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function reviewAttestationBlockers(attestations = []) {
  const roles = list(attestations).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_REVIEW_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(attestations).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_REVIEW_ROLES.includes(role) && (
      row.attested !== true ||
      !normalizeText(row.attestationReference || row.attestation_reference) ||
      !normalizeText(row.attestedAt || row.attested_at)
    )
  })
  return [
    ...missingRoles.map((role) => `missing_governance_attestation:${role}`),
    ...incompleteRows.map((row) => `incomplete_governance_attestation:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function legalReviewBlockers(legalReview = {}, checkedAt = new Date().toISOString()) {
  return [
    normalizeKey(legalReview.attorneyApprovalStatus || legalReview.attorney_approval_status) === 'approved'
      ? ''
      : 'steady_state_legal_approval_not_approved',
    normalizeText(legalReview.approvalReference || legalReview.approval_reference) ? '' : 'steady_state_legal_approval_reference_missing',
    daysBetween(legalReview.lastReviewedAt || legalReview.last_reviewed_at, checkedAt) <= LEGAL_REVIEW_WINDOW_DAYS
      ? ''
      : 'steady_state_legal_review_expired',
    timeMs(legalReview.reviewValidUntil || legalReview.review_valid_until) >= timeMs(checkedAt)
      ? ''
      : 'steady_state_legal_review_valid_until_expired',
    numberValue(legalReview.unresolvedLegalHoldCount || legalReview.unresolved_legal_hold_count) === 0
      ? ''
      : 'steady_state_unresolved_legal_holds',
    legalReview.changeRequestRequired === true ? 'steady_state_legal_change_request_required' : '',
  ].filter(Boolean)
}

function archiveIntegrityBlockers(archiveIntegrity = {}) {
  return [
    normalizeText(archiveIntegrity.archiveReference || archiveIntegrity.archive_reference) ? '' : 'steady_state_archive_reference_missing',
    archiveIntegrity.archiveReachable === true ? '' : 'steady_state_archive_not_reachable',
    archiveIntegrity.fingerprintVerified === true ? '' : 'steady_state_archive_fingerprint_not_verified',
    archiveIntegrity.immutableEntriesVerified === true ? '' : 'steady_state_archive_immutability_not_verified',
    numberValue(archiveIntegrity.missingEntryCount || archiveIntegrity.missing_entry_count) === 0 ? '' : 'steady_state_archive_entries_missing',
  ].filter(Boolean)
}

function incidentBlockers(incidentState = {}) {
  return [
    numberValue(incidentState.openIncidentCount || incidentState.open_incident_count) === 0 ? '' : 'steady_state_open_incidents',
    numberValue(incidentState.unresolvedWarningCount || incidentState.unresolved_warning_count) === 0 ? '' : 'steady_state_unresolved_warnings',
    numberValue(incidentState.signingEscalationCount || incidentState.signing_escalation_count) === 0 ? '' : 'steady_state_signing_escalations',
    numberValue(incidentState.routeDriftEscalationCount || incidentState.route_drift_escalation_count) === 0 ? '' : 'steady_state_route_drift_escalations',
    numberValue(incidentState.docxRegressionCount || incidentState.docx_regression_count) === 0 ? '' : 'steady_state_docx_regressions',
  ].filter(Boolean)
}

function rollbackRetentionBlockers(rollbackRetention = {}) {
  return [
    rollbackRetention.rollbackAvailable === true ? '' : 'steady_state_rollback_not_available',
    rollbackRetention.rollbackReceiptArchived === true ? '' : 'steady_state_rollback_receipt_missing',
    normalizeText(rollbackRetention.rollbackPlanReference || rollbackRetention.rollback_plan_reference) ? '' : 'steady_state_rollback_reference_missing',
    rollbackRetention.restoreDefaultsReady === true ? '' : 'steady_state_rollback_restore_defaults_not_ready',
    rollbackRetention.disableFlagsReady === true ? '' : 'steady_state_rollback_disable_flags_not_ready',
    rollbackRetention.stopDispatchReady === true ? '' : 'steady_state_rollback_stop_dispatch_not_ready',
    normalizeText(rollbackRetention.retainedBy || rollbackRetention.retained_by) ? '' : 'steady_state_rollback_owner_missing',
  ].filter(Boolean)
}

function changeControlBlockers(changeControlQueue = {}) {
  return [
    numberValue(changeControlQueue.openChangeRequestCount || changeControlQueue.open_change_request_count) === 0 ? '' : 'steady_state_open_change_requests',
    numberValue(changeControlQueue.unapprovedTemplateEditCount || changeControlQueue.unapproved_template_edit_count) === 0 ? '' : 'steady_state_unapproved_template_edits',
    numberValue(changeControlQueue.emergencyOverrideCount || changeControlQueue.emergency_override_count) === 0 ? '' : 'steady_state_emergency_overrides',
    normalizeText(changeControlQueue.intakeOwner || changeControlQueue.intake_owner) ? '' : 'steady_state_change_control_owner_missing',
  ].filter(Boolean)
}

export function buildOtpSteadyStateGovernanceMonitoringReceipt({
  closeoutArchive = buildOtpReleaseCloseoutArchiveReceipt(),
  monitoringCycle = defaultMonitoringCycle(),
  routeSnapshots = defaultRouteSnapshots(),
  monitoringSignals = defaultMonitoringSignals(),
  reviewAttestations = defaultReviewAttestations(),
  legalReview = defaultLegalReview(),
  archiveIntegrity = defaultArchiveIntegrity(),
  incidentState = defaultIncidentState(),
  rollbackRetention = defaultRollbackRetention(),
  changeControlQueue = defaultChangeControlQueue(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const archive = closeoutArchive || {}
  const blockerCodes = unique([
    archive.version === OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION ? '' : 'phase43_archive_version_mismatch',
    archive.status === OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS ? '' : 'phase43_archive_not_ready',
    archive.canArchiveReleaseCloseout === true ? '' : 'phase43_archive_not_allowed',
    list(archive.blockerCodes).length === 0 ? '' : 'phase43_archive_has_blockers',
    archive.mutatedData === false ? '' : 'phase43_archive_mutation_unexpected',
    ...monitoringCycleBlockers(monitoringCycle, checkedAt),
    ...routeSnapshotBlockers(routeSnapshots),
    ...signalBlockers(monitoringSignals),
    ...reviewAttestationBlockers(reviewAttestations),
    ...legalReviewBlockers(legalReview, checkedAt),
    ...archiveIntegrityBlockers(archiveIntegrity),
    ...incidentBlockers(incidentState),
    ...rollbackRetentionBlockers(rollbackRetention),
    ...changeControlBlockers(changeControlQueue),
  ])
  const canContinueSteadyStateGovernance = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION,
    contract: OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT,
    checkedAt,
    status: canContinueSteadyStateGovernance
      ? OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS
      : 'OTP_STEADY_STATE_GOVERNANCE_MONITORING_REMEDIATION_REQUIRED',
    canContinueSteadyStateGovernance,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    monitoringCycle: Object.freeze({ ...monitoringCycle }),
    routeSnapshots: Object.freeze(list(routeSnapshots)),
    monitoringSignals: Object.freeze(list(monitoringSignals)),
    reviewAttestations: Object.freeze(list(reviewAttestations)),
    legalReview: Object.freeze({ ...legalReview }),
    archiveIntegrity: Object.freeze({ ...archiveIntegrity }),
    incidentState: Object.freeze({ ...incidentState }),
    rollbackRetention: Object.freeze({ ...rollbackRetention }),
    changeControlQueue: Object.freeze({ ...changeControlQueue }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      signalCount: list(monitoringSignals).length,
      attestationCount: list(reviewAttestations).length,
      blockerCount: blockerCodes.length,
      openIncidentCount: numberValue(incidentState.openIncidentCount || incidentState.open_incident_count),
      openChangeRequestCount: numberValue(changeControlQueue.openChangeRequestCount || changeControlQueue.open_change_request_count),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpSteadyStateGovernanceMonitoringPhase44Audit({
  checkedAt = new Date().toISOString(),
  phase43Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase43Ready = !phase43Audit || phase43Audit.status === OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS
  const goodArchive = phase43Audit?.archiveReceipts?.find((receipt) => receipt.canArchiveReleaseCloseout) ||
    buildOtpReleaseCloseoutArchiveReceipt({ checkedAt })
  const goodMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
  })
  const staleCycleMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: {
      ...defaultMonitoringCycle(checkedAt),
      endedAt: '2026-01-01T00:00:00.000Z',
      maxGapDays: 7,
    },
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
  })
  const routeDriftMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    routeSnapshots: defaultRouteSnapshots().map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, observedTemplateDefaultId: 'otp-resale-template-legacy', routeDriftCount: 1 }
        : row,
    ),
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
  })
  const docxMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    routeSnapshots: defaultRouteSnapshots().map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, sourceFormat: 'docx', docxReferenceCount: 1, path: 'old-new-development-otp.docx' }
        : row,
    ),
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
  })
  const legalExpiredMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: {
      ...defaultLegalReview(checkedAt),
      attorneyApprovalStatus: 'pending',
      lastReviewedAt: '2024-01-01T00:00:00.000Z',
      reviewValidUntil: '2025-01-01T00:00:00.000Z',
      unresolvedLegalHoldCount: 1,
    },
  })
  const archiveIntegrityMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
    archiveIntegrity: {
      ...defaultArchiveIntegrity(),
      archiveReachable: false,
      fingerprintVerified: false,
      missingEntryCount: 1,
    },
  })
  const incidentMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
    incidentState: {
      ...defaultIncidentState(),
      openIncidentCount: 1,
      signingEscalationCount: 1,
    },
  })
  const rollbackMissingMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
    rollbackRetention: {
      ...defaultRollbackRetention(),
      rollbackAvailable: false,
      rollbackReceiptArchived: false,
    },
  })
  const changeControlMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt),
    legalReview: defaultLegalReview(checkedAt),
    changeControlQueue: {
      ...defaultChangeControlQueue(),
      openChangeRequestCount: 1,
      unapprovedTemplateEditCount: 1,
    },
  })
  const attestationMissingMonitoring = buildOtpSteadyStateGovernanceMonitoringReceipt({
    checkedAt,
    closeoutArchive: goodArchive,
    monitoringCycle: defaultMonitoringCycle(checkedAt),
    reviewAttestations: defaultReviewAttestations(checkedAt).filter((row) => row.role !== 'governance_owner'),
    legalReview: defaultLegalReview(checkedAt),
  })

  addCheck(checks, phase43Ready, 'PHASE44_PHASE43_ARCHIVE_READY', 'Steady-state governance monitoring starts only after Phase 43 archive closeout is ready.')
  addCheck(
    checks,
    goodMonitoring.canContinueSteadyStateGovernance &&
      goodMonitoring.status === OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS &&
      goodMonitoring.mutatedData === false,
    'PHASE44_GOOD_MONITORING_READY',
    'A clean governance cycle can continue steady-state OTP operations without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_MONITORING_SIGNALS.every((key) => goodMonitoring.monitoringSignals.some((row) => row.key === key && row.status === 'green')),
    'PHASE44_REQUIRED_SIGNALS_GREEN',
    'Route stability, legal validity, archive integrity, incident health, and rollback retention signals must be green.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodMonitoring.routeSnapshots.some((row) => row.routeVariant === route)),
    'PHASE44_BOTH_ROUTES_MONITORED',
    'Resale and new-development routes must both remain under steady-state monitoring.',
  )
  addCheck(
    checks,
    REQUIRED_REVIEW_ROLES.every((role) => goodMonitoring.reviewAttestations.some((row) => row.role === role && row.attested === true)),
    'PHASE44_REVIEW_ATTESTATIONS_CAPTURED',
    'Document, support, and governance owners must attest the steady-state review cycle.',
  )
  addCheck(
    checks,
    staleCycleMonitoring.canContinueSteadyStateGovernance === false &&
      staleCycleMonitoring.blockerCodes.includes('governance_cycle_stale'),
    'PHASE44_STALE_CYCLE_BLOCKED',
    'A stale or missed governance cycle blocks steady-state continuation.',
  )
  addCheck(
    checks,
    routeDriftMonitoring.canContinueSteadyStateGovernance === false &&
      routeDriftMonitoring.blockerCodes.includes('steady_state_template_default_drift:resale_existing_property') &&
      routeDriftMonitoring.blockerCodes.includes('steady_state_route_drift:resale_existing_property'),
    'PHASE44_ROUTE_DRIFT_BLOCKED',
    'Route template drift blocks steady-state governance continuation.',
  )
  addCheck(
    checks,
    docxMonitoring.canContinueSteadyStateGovernance === false &&
      docxMonitoring.blockerCodes.includes('steady_state_docx_source_observed:new_development'),
    'PHASE44_DOCX_REGRESSION_BLOCKED',
    'Any DOC/DOCX source reappearing in steady-state route monitoring blocks continuation.',
  )
  addCheck(
    checks,
    legalExpiredMonitoring.canContinueSteadyStateGovernance === false &&
      legalExpiredMonitoring.blockerCodes.includes('steady_state_legal_approval_not_approved') &&
      legalExpiredMonitoring.blockerCodes.includes('steady_state_legal_review_expired'),
    'PHASE44_LEGAL_REVIEW_EXPIRY_BLOCKED',
    'Expired or unapproved legal review blocks steady-state continuation.',
  )
  addCheck(
    checks,
    archiveIntegrityMonitoring.canContinueSteadyStateGovernance === false &&
      archiveIntegrityMonitoring.blockerCodes.includes('steady_state_archive_not_reachable') &&
      archiveIntegrityMonitoring.blockerCodes.includes('steady_state_archive_fingerprint_not_verified'),
    'PHASE44_ARCHIVE_INTEGRITY_BLOCKED',
    'Unreachable or unfingerprinted governance archive evidence blocks continuation.',
  )
  addCheck(
    checks,
    incidentMonitoring.canContinueSteadyStateGovernance === false &&
      incidentMonitoring.blockerCodes.includes('steady_state_open_incidents') &&
      incidentMonitoring.blockerCodes.includes('steady_state_signing_escalations'),
    'PHASE44_INCIDENTS_BLOCKED',
    'Open incidents or signing escalations block steady-state continuation.',
  )
  addCheck(
    checks,
    rollbackMissingMonitoring.canContinueSteadyStateGovernance === false &&
      rollbackMissingMonitoring.blockerCodes.includes('steady_state_rollback_not_available') &&
      rollbackMissingMonitoring.blockerCodes.includes('steady_state_rollback_receipt_missing'),
    'PHASE44_ROLLBACK_RETENTION_BLOCKED',
    'Rollback retention must remain available and archived in steady state.',
  )
  addCheck(
    checks,
    changeControlMonitoring.canContinueSteadyStateGovernance === false &&
      changeControlMonitoring.blockerCodes.includes('steady_state_open_change_requests') &&
      changeControlMonitoring.blockerCodes.includes('steady_state_unapproved_template_edits'),
    'PHASE44_CHANGE_CONTROL_QUEUE_BLOCKED',
    'Open change requests or unapproved template edits block clean steady-state continuation.',
  )
  addCheck(
    checks,
    attestationMissingMonitoring.canContinueSteadyStateGovernance === false &&
      attestationMissingMonitoring.blockerCodes.includes('missing_governance_attestation:governance_owner'),
    'PHASE44_MISSING_ATTESTATION_BLOCKED',
    'Missing governance-owner attestation blocks the steady-state monitoring receipt.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-steady-state-governance-monitoring-phase44'] === 'node scripts/otp-steady-state-governance-monitoring-phase44.test.mjs' &&
      packageJson.scripts?.['report:otp-steady-state-governance-monitoring-phase44'] === 'node scripts/report-otp-steady-state-governance-monitoring-phase44.mjs',
    'PHASE44_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 44 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_STEADY_STATE_GOVERNANCE_MONITORING_PHASE44_VERSION,
    contract: OTP_STEADY_STATE_GOVERNANCE_MONITORING_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_STEADY_STATE_GOVERNANCE_MONITORING_REMEDIATION_REQUIRED' : OTP_STEADY_STATE_GOVERNANCE_MONITORING_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    monitoringReceipts: Object.freeze([
      goodMonitoring,
      staleCycleMonitoring,
      routeDriftMonitoring,
      docxMonitoring,
      legalExpiredMonitoring,
      archiveIntegrityMonitoring,
      incidentMonitoring,
      rollbackMissingMonitoring,
      changeControlMonitoring,
      attestationMissingMonitoring,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      cleanMonitoringCount: [goodMonitoring].filter((row) => row.canContinueSteadyStateGovernance).length,
      blockedMonitoringCount: [
        staleCycleMonitoring,
        routeDriftMonitoring,
        docxMonitoring,
        legalExpiredMonitoring,
        archiveIntegrityMonitoring,
        incidentMonitoring,
        rollbackMissingMonitoring,
        changeControlMonitoring,
        attestationMissingMonitoring,
      ].filter((row) => !row.canContinueSteadyStateGovernance).length,
      routeCount: REQUIRED_ROUTES.length,
      signalCount: REQUIRED_MONITORING_SIGNALS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 45,
      key: 'otp_template_change_control_and_version_renewal',
      label: 'Template Change Control And Version Renewal',
    }),
  })
}

export function formatOtpSteadyStateGovernanceMonitoringPhase44Markdown(report = buildOtpSteadyStateGovernanceMonitoringPhase44Audit()) {
  return [
    '# OTP Generator Phase 44 Steady-State Governance Monitoring',
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
        ['Clean monitoring receipts', report.summary.cleanMonitoringCount],
        ['Blocked monitoring receipts', report.summary.blockedMonitoringCount],
        ['Routes', report.summary.routeCount],
        ['Signals', report.summary.signalCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
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
    '## Monitoring Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes', 'Signals', 'Attestations', 'Open incidents', 'Open changes', 'Blockers'],
      report.monitoringReceipts.map((receipt) => [
        receipt.status,
        receipt.canContinueSteadyStateGovernance ? 'yes' : 'no',
        receipt.summary.routeCount,
        receipt.summary.signalCount,
        receipt.summary.attestationCount,
        receipt.summary.openIncidentCount,
        receipt.summary.openChangeRequestCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 44 proves steady-state OTP governance can continue only while the Phase 43 archive remains valid, the weekly production governance cycle is current, resale and new-development route defaults stay stable, monitoring signals remain green, owner attestations are captured, legal approval remains valid, archive evidence is reachable and fingerprinted, incidents are clean, rollback retention is available, and change control has no unapproved edits. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
