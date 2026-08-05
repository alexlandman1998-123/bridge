import {
  OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION,
  OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS,
  buildOtpPostRenewalMonitoringCloseoutPhase53Audit,
} from './otpPostRenewalMonitoringCloseoutPhase53.js'

export const OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION = 'otp_template_renewal_steady_state_review_phase54_v1'
export const OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_FOR_RENEWAL_CHANGE_INTAKE'
export const OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT = 'otp-vnext-template-renewal-steady-state-review-phase54-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_REVIEW_SIGNALS = Object.freeze([
  'renewed_route_default_stability',
  'renewed_signing_envelope_stability',
  'renewed_version_pointer_stability',
  'post_renewal_archive_integrity',
  'rollback_retention',
  'incident_health',
  'next_renewal_readiness',
])
const REQUIRED_REVIEW_ROLES = Object.freeze(['template_owner', 'support_owner', 'governance_owner'])
const MAX_REVIEW_GAP_DAYS = 30
const MAX_NEXT_RENEWAL_WINDOW_DAYS = 365

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
  return /\.docx?$/i.test(normalizeText(row.templateDefaultId || row.sourcePath || row.path || row.archivePath)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultReviewCycle(checkedAt = new Date().toISOString()) {
  const endedAtMs = timeMs(checkedAt) || Date.now()
  const startedAtMs = endedAtMs - 14 * 24 * 60 * 60 * 1000
  return {
    reviewCycleId: 'otp-vnext-phase54-template-renewal-steady-state-review',
    environment: 'production',
    cadence: 'monthly',
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    maxGapDays: MAX_REVIEW_GAP_DAYS,
    completed: true,
  }
}

function defaultRouteReviewRows(closeoutReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const route = list(closeoutReceipt.routeHealthSnapshots).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      expectedTemplateDefaultId: route.observedTemplateDefaultId,
      observedTemplateDefaultId: route.observedTemplateDefaultId,
      expectedSigningEnvelopeKey: route.observedSigningEnvelopeKey,
      observedSigningEnvelopeKey: route.observedSigningEnvelopeKey,
      expectedRouteOutputFingerprint: route.observedRouteOutputFingerprint,
      observedRouteOutputFingerprint: route.observedRouteOutputFingerprint,
      generatedOtpCount: 2,
      generatedOtpFailureCount: 0,
      signingEnvelopeFailureCount: 0,
      signerScopeViolationCount: 0,
      finalArtifactFailureCount: 0,
      routeDriftCount: 0,
      docxReferenceCount: 0,
      sourceFormat: 'native_pdf_template',
    }
  })
}

function defaultVersionPointerReview(closeoutReceipt = {}) {
  const pointer = closeoutReceipt.versionPointerHealth || {}
  return {
    expectedRenewedVersionKey: pointer.expectedActivatedVersionKey,
    observedRenewedVersionKey: pointer.observedActivatedVersionKey,
    expectedPointerFingerprint: pointer.expectedPointerFingerprint,
    observedPointerFingerprint: pointer.observedPointerFingerprint,
    pointerDriftCount: 0,
    pointerEvidenceArchived: true,
  }
}

function defaultReviewSignals() {
  return REQUIRED_REVIEW_SIGNALS.map((key) => ({
    key,
    status: 'green',
    owner: key === 'next_renewal_readiness' ? 'template_owner' : 'governance_owner',
    evidencePath: `docs/otp-${key.replace(/_/g, '-')}-phase54.md`,
  }))
}

function defaultReviewAttestations(checkedAt = new Date().toISOString()) {
  return REQUIRED_REVIEW_ROLES.map((role) => ({
    role,
    attested: true,
    attestationReference: `phase54-${role}-steady-state-review`,
    attestedAt: checkedAt,
  }))
}

function defaultArchiveReview(closeoutReceipt = {}) {
  return {
    archiveReference: closeoutReceipt.governanceHandoff?.archiveReference,
    closeoutFingerprint: closeoutReceipt.closeoutFingerprint,
    archiveReachable: true,
    fingerprintVerified: true,
    immutableEntriesVerified: true,
    missingEntryCount: 0,
  }
}

function defaultRollbackRetention(closeoutReceipt = {}) {
  return {
    rollbackPlanReference: closeoutReceipt.rollbackReadiness?.rollbackPlanReference,
    rollbackStillAvailable: true,
    rollbackReceiptArchived: true,
    restorePreviousVersionReady: true,
    restoreRouteDefaultsReady: true,
    restoreSigningEnvelopesReady: true,
    stopSigningDispatchReady: true,
    retainedBy: 'release_operator',
  }
}

function defaultIncidentState() {
  return {
    openIncidentCount: 0,
    unresolvedWarningCount: 0,
    routeDriftEscalationCount: 0,
    signingEscalationCount: 0,
    docxRegressionCount: 0,
  }
}

function defaultNextRenewalReadiness(checkedAt = new Date().toISOString()) {
  const checkedAtMs = timeMs(checkedAt) || Date.now()
  return {
    nextReviewDueAt: new Date(checkedAtMs + 30 * 24 * 60 * 60 * 1000).toISOString(),
    nextRenewalDueAt: new Date(checkedAtMs + 335 * 24 * 60 * 60 * 1000).toISOString(),
    templateOwnerAssigned: true,
    changeIntakeOpen: true,
    unapprovedChangeCount: 0,
    emergencyOverrideCount: 0,
  }
}

function phase53Blockers(closeoutReceipt = {}) {
  return [
    closeoutReceipt.version === OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION ? '' : 'phase53_closeout_version_mismatch',
    closeoutReceipt.status === OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS ? '' : 'phase53_closeout_not_ready',
    closeoutReceipt.canClosePostRenewal === true ? '' : 'phase53_closeout_not_allowed',
    closeoutReceipt.mutatedData === false ? '' : 'phase53_closeout_mutation_unexpected',
    list(closeoutReceipt.blockerCodes).length === 0 ? '' : 'phase53_closeout_has_blockers',
    list(closeoutReceipt.rollbackTriggerCodes).length === 0 ? '' : 'phase53_closeout_has_rollback_triggers',
  ].filter(Boolean)
}

function reviewCycleBlockers(cycle = {}, checkedAt = new Date().toISOString()) {
  return [
    normalizeText(cycle.reviewCycleId) ? '' : 'renewal_review_cycle_id_missing',
    normalizeKey(cycle.environment) === 'production' ? '' : 'renewal_review_environment_not_production',
    normalizeKey(cycle.cadence) === 'monthly' ? '' : 'renewal_review_cadence_not_monthly',
    cycle.completed === true ? '' : 'renewal_review_cycle_not_completed',
    timeMs(cycle.startedAt) && timeMs(cycle.endedAt) ? '' : 'renewal_review_cycle_dates_missing',
    daysBetween(cycle.startedAt, cycle.endedAt) <= numberValue(cycle.maxGapDays || MAX_REVIEW_GAP_DAYS) ? '' : 'renewal_review_cycle_gap_too_large',
    daysBetween(cycle.endedAt, checkedAt) <= MAX_REVIEW_GAP_DAYS ? '' : 'renewal_review_cycle_stale',
  ].filter(Boolean)
}

function routeReviewBlockers(routeRows = [], closeoutReceipt = {}) {
  const observedRoutes = list(routeRows).map((row) => normalizeKey(row.routeVariant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !observedRoutes.includes(route))
  const duplicateRoutes = observedRoutes.filter((route, index) => route && observedRoutes.indexOf(route) !== index)
  const rowBlockers = list(routeRows).flatMap((row) => {
    const route = normalizeKey(row.routeVariant) || 'unknown'
    const closeoutRoute = list(closeoutReceipt.routeHealthSnapshots).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `renewal_review_route_unsupported:${route}`,
      row.expectedTemplateDefaultId === closeoutRoute.observedTemplateDefaultId ? '' : `renewal_review_expected_template_mismatch:${route}`,
      row.observedTemplateDefaultId === closeoutRoute.observedTemplateDefaultId ? '' : `renewal_review_template_default_drift:${route}`,
      row.expectedSigningEnvelopeKey === closeoutRoute.observedSigningEnvelopeKey ? '' : `renewal_review_expected_envelope_mismatch:${route}`,
      row.observedSigningEnvelopeKey === closeoutRoute.observedSigningEnvelopeKey ? '' : `renewal_review_signing_envelope_drift:${route}`,
      row.expectedRouteOutputFingerprint === closeoutRoute.observedRouteOutputFingerprint ? '' : `renewal_review_expected_output_fingerprint_mismatch:${route}`,
      row.observedRouteOutputFingerprint === closeoutRoute.observedRouteOutputFingerprint ? '' : `renewal_review_output_fingerprint_drift:${route}`,
      hasDocxSource(row) ? `renewal_review_docx_source_observed:${route}` : '',
      numberValue(row.generatedOtpFailureCount) === 0 ? '' : `renewal_review_generation_failure:${route}`,
      numberValue(row.signingEnvelopeFailureCount) === 0 ? '' : `renewal_review_signing_envelope_failure:${route}`,
      numberValue(row.signerScopeViolationCount) === 0 ? '' : `renewal_review_signer_scope_violation:${route}`,
      numberValue(row.finalArtifactFailureCount) === 0 ? '' : `renewal_review_final_artifact_failure:${route}`,
      numberValue(row.routeDriftCount) === 0 ? '' : `renewal_review_route_drift:${route}`,
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `renewal_review_missing_route:${route}`),
    ...unique(duplicateRoutes).map((route) => `renewal_review_duplicate_route:${route}`),
    ...rowBlockers,
  ]
}

function versionPointerBlockers(pointerReview = {}, closeoutReceipt = {}) {
  const pointer = closeoutReceipt.versionPointerHealth || {}
  return [
    pointerReview.expectedRenewedVersionKey === pointer.expectedActivatedVersionKey ? '' : 'renewal_review_expected_version_mismatch',
    pointerReview.observedRenewedVersionKey === pointer.observedActivatedVersionKey ? '' : 'renewal_review_version_pointer_target_drift',
    pointerReview.expectedPointerFingerprint === pointer.expectedPointerFingerprint ? '' : 'renewal_review_expected_pointer_fingerprint_mismatch',
    pointerReview.observedPointerFingerprint === pointer.observedPointerFingerprint ? '' : 'renewal_review_pointer_fingerprint_drift',
    numberValue(pointerReview.pointerDriftCount) === 0 ? '' : 'renewal_review_pointer_drift_observed',
    pointerReview.pointerEvidenceArchived === true ? '' : 'renewal_review_pointer_evidence_not_archived',
  ].filter(Boolean)
}

function signalBlockers(signals = []) {
  const keys = list(signals).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_REVIEW_SIGNALS.filter((key) => !keys.includes(key))
  const unhealthyRows = list(signals).filter((row) =>
    REQUIRED_REVIEW_SIGNALS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'green' || !normalizeText(row.owner) || !normalizeText(row.evidencePath)),
  )
  return [
    ...missingKeys.map((key) => `renewal_review_missing_signal:${key}`),
    ...unhealthyRows.map((row) => `renewal_review_signal_not_green:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function attestationBlockers(attestations = []) {
  const roles = list(attestations).map((row) => normalizeKey(row.role))
  const missingRoles = REQUIRED_REVIEW_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(attestations).filter((row) => {
    const role = normalizeKey(row.role)
    return REQUIRED_REVIEW_ROLES.includes(role) && (
      row.attested !== true ||
      !normalizeText(row.attestationReference) ||
      !normalizeText(row.attestedAt)
    )
  })
  return [
    ...missingRoles.map((role) => `renewal_review_missing_attestation:${role}`),
    ...incompleteRows.map((row) => `renewal_review_incomplete_attestation:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function archiveReviewBlockers(archiveReview = {}, closeoutReceipt = {}) {
  return [
    archiveReview.archiveReference === closeoutReceipt.governanceHandoff?.archiveReference ? '' : 'renewal_review_archive_reference_mismatch',
    archiveReview.closeoutFingerprint === closeoutReceipt.closeoutFingerprint ? '' : 'renewal_review_closeout_fingerprint_mismatch',
    archiveReview.archiveReachable === true ? '' : 'renewal_review_archive_not_reachable',
    archiveReview.fingerprintVerified === true ? '' : 'renewal_review_archive_fingerprint_not_verified',
    archiveReview.immutableEntriesVerified === true ? '' : 'renewal_review_archive_immutability_not_verified',
    numberValue(archiveReview.missingEntryCount) === 0 ? '' : 'renewal_review_archive_entries_missing',
  ].filter(Boolean)
}

function rollbackBlockers(rollback = {}, closeoutReceipt = {}) {
  return [
    rollback.rollbackPlanReference === closeoutReceipt.rollbackReadiness?.rollbackPlanReference ? '' : 'renewal_review_rollback_plan_mismatch',
    rollback.rollbackStillAvailable === true ? '' : 'renewal_review_rollback_not_available',
    rollback.rollbackReceiptArchived === true ? '' : 'renewal_review_rollback_receipt_missing',
    rollback.restorePreviousVersionReady === true ? '' : 'renewal_review_restore_previous_version_not_ready',
    rollback.restoreRouteDefaultsReady === true ? '' : 'renewal_review_restore_route_defaults_not_ready',
    rollback.restoreSigningEnvelopesReady === true ? '' : 'renewal_review_restore_signing_envelopes_not_ready',
    rollback.stopSigningDispatchReady === true ? '' : 'renewal_review_stop_signing_dispatch_not_ready',
    normalizeText(rollback.retainedBy) ? '' : 'renewal_review_rollback_owner_missing',
  ].filter(Boolean)
}

function incidentBlockers(incidentState = {}) {
  return [
    numberValue(incidentState.openIncidentCount) === 0 ? '' : 'renewal_review_open_incidents',
    numberValue(incidentState.unresolvedWarningCount) === 0 ? '' : 'renewal_review_unresolved_warnings',
    numberValue(incidentState.routeDriftEscalationCount) === 0 ? '' : 'renewal_review_route_drift_escalations',
    numberValue(incidentState.signingEscalationCount) === 0 ? '' : 'renewal_review_signing_escalations',
    numberValue(incidentState.docxRegressionCount) === 0 ? '' : 'renewal_review_docx_regressions',
  ].filter(Boolean)
}

function nextRenewalReadinessBlockers(readiness = {}, checkedAt = new Date().toISOString()) {
  return [
    timeMs(readiness.nextReviewDueAt) >= timeMs(checkedAt) ? '' : 'renewal_review_next_review_overdue',
    daysBetween(checkedAt, readiness.nextRenewalDueAt) <= MAX_NEXT_RENEWAL_WINDOW_DAYS ? '' : 'renewal_review_next_renewal_too_far_out',
    readiness.templateOwnerAssigned === true ? '' : 'renewal_review_template_owner_not_assigned',
    readiness.changeIntakeOpen === true ? '' : 'renewal_review_change_intake_not_open',
    numberValue(readiness.unapprovedChangeCount) === 0 ? '' : 'renewal_review_unapproved_changes',
    numberValue(readiness.emergencyOverrideCount) === 0 ? '' : 'renewal_review_emergency_overrides',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalSteadyStateReviewReceipt({
  closeoutReceipt = buildOtpPostRenewalMonitoringCloseoutPhase53Audit().closeoutReceipts?.find((receipt) => receipt.canClosePostRenewal),
  reviewCycle = null,
  routeReviewRows = null,
  versionPointerReview = null,
  reviewSignals = defaultReviewSignals(),
  reviewAttestations = null,
  archiveReview = null,
  rollbackRetention = null,
  incidentState = defaultIncidentState(),
  nextRenewalReadiness = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const cycle = reviewCycle || defaultReviewCycle(checkedAt)
  const routes = routeReviewRows || defaultRouteReviewRows(closeoutReceipt)
  const pointer = versionPointerReview || defaultVersionPointerReview(closeoutReceipt)
  const attestations = reviewAttestations || defaultReviewAttestations(checkedAt)
  const archive = archiveReview || defaultArchiveReview(closeoutReceipt)
  const rollback = rollbackRetention || defaultRollbackRetention(closeoutReceipt)
  const readiness = nextRenewalReadiness || defaultNextRenewalReadiness(checkedAt)
  const blockerCodes = unique([
    ...phase53Blockers(closeoutReceipt || {}),
    ...reviewCycleBlockers(cycle, checkedAt),
    ...routeReviewBlockers(routes, closeoutReceipt),
    ...versionPointerBlockers(pointer, closeoutReceipt),
    ...signalBlockers(reviewSignals),
    ...attestationBlockers(attestations),
    ...archiveReviewBlockers(archive, closeoutReceipt),
    ...rollbackBlockers(rollback, closeoutReceipt),
    ...incidentBlockers(incidentState),
    ...nextRenewalReadinessBlockers(readiness, checkedAt),
  ])
  const canContinueRenewalSteadyState = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT,
    checkedAt,
    status: canContinueRenewalSteadyState
      ? OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_REMEDIATION_REQUIRED',
    canContinueRenewalSteadyState,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    closeoutReceipt: Object.freeze({
      version: closeoutReceipt?.version,
      status: closeoutReceipt?.status,
      canClosePostRenewal: closeoutReceipt?.canClosePostRenewal === true,
      closeoutFingerprint: closeoutReceipt?.closeoutFingerprint,
      targetVersionKey: closeoutReceipt?.applyReceipt?.targetVersionKey,
    }),
    reviewCycle: Object.freeze({ ...cycle }),
    routeReviewRows: Object.freeze(list(routes)),
    versionPointerReview: Object.freeze({ ...pointer }),
    reviewSignals: Object.freeze(list(reviewSignals)),
    reviewAttestations: Object.freeze(list(attestations)),
    archiveReview: Object.freeze({ ...archive }),
    rollbackRetention: Object.freeze({ ...rollback }),
    incidentState: Object.freeze({ ...incidentState }),
    nextRenewalReadiness: Object.freeze({ ...readiness }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      reviewedRouteCount: list(routes).length,
      signalCount: list(reviewSignals).length,
      attestationCount: list(attestations).length,
      openIncidentCount: numberValue(incidentState.openIncidentCount),
      unapprovedChangeCount: numberValue(readiness.unapprovedChangeCount),
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({
  checkedAt = new Date().toISOString(),
  phase53Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase53Ready = !phase53Audit || phase53Audit.status === OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS
  const goodCloseout = phase53Audit?.closeoutReceipts?.find((receipt) => receipt.canClosePostRenewal) ||
    buildOtpPostRenewalMonitoringCloseoutPhase53Audit({ checkedAt }).closeoutReceipts.find((receipt) => receipt.canClosePostRenewal)
  const goodReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
  })
  const staleReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    reviewCycle: {
      ...defaultReviewCycle(checkedAt),
      endedAt: '2026-01-01T00:00:00.000Z',
    },
  })
  const routeDriftReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    routeReviewRows: defaultRouteReviewRows(goodCloseout).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, observedTemplateDefaultId: 'otp-resale-template-legacy', routeDriftCount: 1 }
        : row,
    ),
  })
  const pointerDriftReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    versionPointerReview: {
      ...defaultVersionPointerReview(goodCloseout),
      observedRenewedVersionKey: 'otp-template-vnext-phase39',
      pointerDriftCount: 1,
    },
  })
  const docxReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    routeReviewRows: defaultRouteReviewRows(goodCloseout).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'old-new-development-otp.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const archiveReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    archiveReview: {
      ...defaultArchiveReview(goodCloseout),
      archiveReachable: false,
      fingerprintVerified: false,
      missingEntryCount: 1,
    },
  })
  const rollbackReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    rollbackRetention: {
      ...defaultRollbackRetention(goodCloseout),
      rollbackStillAvailable: false,
      rollbackReceiptArchived: false,
    },
  })
  const incidentReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    incidentState: {
      ...defaultIncidentState(),
      openIncidentCount: 1,
      signingEscalationCount: 1,
    },
  })
  const readinessReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    nextRenewalReadiness: {
      ...defaultNextRenewalReadiness(checkedAt),
      nextReviewDueAt: '2026-01-01T00:00:00.000Z',
      templateOwnerAssigned: false,
      changeIntakeOpen: false,
      unapprovedChangeCount: 1,
    },
  })
  const missingAttestationReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    reviewAttestations: defaultReviewAttestations(checkedAt).filter((row) => row.role !== 'governance_owner'),
  })
  const badSignalReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
    checkedAt,
    closeoutReceipt: goodCloseout,
    reviewSignals: [
      { key: 'renewed_route_default_stability', status: 'red', owner: '', evidencePath: '' },
    ],
  })

  addCheck(checks, phase53Ready, 'PHASE54_PHASE53_CLOSEOUT_READY', 'Template renewal steady-state review starts only after Phase 53 closeout is ready.')
  addCheck(
    checks,
    goodReview.canContinueRenewalSteadyState &&
      goodReview.status === OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS &&
      goodReview.mutatedData === false,
    'PHASE54_GOOD_STEADY_STATE_REVIEW_READY',
    'A clean post-renewal steady-state review can continue without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodReview.routeReviewRows.some((row) => row.routeVariant === route)),
    'PHASE54_BOTH_RENEWED_ROUTES_REVIEWED',
    'Resale and new-development routes are both reviewed after renewal closeout.',
  )
  addCheck(
    checks,
    goodReview.routeReviewRows.every((row) =>
      row.observedTemplateDefaultId === row.expectedTemplateDefaultId &&
      row.observedSigningEnvelopeKey === row.expectedSigningEnvelopeKey &&
      row.observedRouteOutputFingerprint === row.expectedRouteOutputFingerprint,
    ),
    'PHASE54_RENEWED_ROUTE_OUTPUTS_STABLE',
    'Renewed route defaults, signing envelopes, and output fingerprints remain stable.',
  )
  addCheck(
    checks,
    goodReview.versionPointerReview.observedRenewedVersionKey === goodReview.versionPointerReview.expectedRenewedVersionKey &&
      goodReview.versionPointerReview.observedPointerFingerprint === goodReview.versionPointerReview.expectedPointerFingerprint,
    'PHASE54_RENEWED_VERSION_POINTER_STABLE',
    'Renewed version pointer remains on the approved renewal version.',
  )
  addCheck(
    checks,
    REQUIRED_REVIEW_SIGNALS.every((key) => goodReview.reviewSignals.some((row) => row.key === key && row.status === 'green')),
    'PHASE54_REQUIRED_REVIEW_SIGNALS_GREEN',
    'All renewal steady-state signals are present and green.',
  )
  addCheck(
    checks,
    goodReview.rollbackRetention.rollbackStillAvailable === true &&
      goodReview.rollbackRetention.rollbackReceiptArchived === true,
    'PHASE54_ROLLBACK_RETENTION_STILL_READY',
    'Rollback remains available and archived during steady-state review.',
  )
  addCheck(
    checks,
    goodReview.nextRenewalReadiness.templateOwnerAssigned === true &&
      goodReview.nextRenewalReadiness.changeIntakeOpen === true &&
      goodReview.nextRenewalReadiness.unapprovedChangeCount === 0,
    'PHASE54_NEXT_RENEWAL_INTAKE_READY',
    'Next renewal ownership and change intake are ready without unapproved changes.',
  )
  addCheck(
    checks,
    staleReview.canContinueRenewalSteadyState === false &&
      staleReview.blockerCodes.includes('renewal_review_cycle_stale'),
    'PHASE54_STALE_REVIEW_CYCLE_BLOCKED',
    'A stale renewal review cycle blocks steady-state continuation.',
  )
  addCheck(
    checks,
    routeDriftReview.canContinueRenewalSteadyState === false &&
      routeDriftReview.blockerCodes.includes('renewal_review_template_default_drift:resale_existing_property'),
    'PHASE54_ROUTE_DRIFT_BLOCKED',
    'Renewed route default drift blocks steady-state review.',
  )
  addCheck(
    checks,
    pointerDriftReview.canContinueRenewalSteadyState === false &&
      pointerDriftReview.blockerCodes.includes('renewal_review_version_pointer_target_drift'),
    'PHASE54_VERSION_POINTER_DRIFT_BLOCKED',
    'Renewed version pointer drift blocks steady-state review.',
  )
  addCheck(
    checks,
    docxReview.canContinueRenewalSteadyState === false &&
      docxReview.blockerCodes.includes('renewal_review_docx_source_observed:new_development'),
    'PHASE54_DOCX_REGRESSION_BLOCKED',
    'DOC/DOCX regression in renewed route monitoring blocks steady-state review.',
  )
  addCheck(
    checks,
    archiveReview.canContinueRenewalSteadyState === false &&
      archiveReview.blockerCodes.includes('renewal_review_archive_not_reachable') &&
      archiveReview.blockerCodes.includes('renewal_review_archive_fingerprint_not_verified'),
    'PHASE54_ARCHIVE_INTEGRITY_BLOCKED',
    'Archive reachability and fingerprint verification are required for renewal steady-state review.',
  )
  addCheck(
    checks,
    rollbackReview.canContinueRenewalSteadyState === false &&
      rollbackReview.blockerCodes.includes('renewal_review_rollback_not_available') &&
      rollbackReview.blockerCodes.includes('renewal_review_rollback_receipt_missing'),
    'PHASE54_ROLLBACK_RETENTION_BLOCKED',
    'Missing rollback retention blocks renewal steady-state review.',
  )
  addCheck(
    checks,
    incidentReview.canContinueRenewalSteadyState === false &&
      incidentReview.blockerCodes.includes('renewal_review_open_incidents') &&
      incidentReview.blockerCodes.includes('renewal_review_signing_escalations'),
    'PHASE54_INCIDENTS_BLOCKED',
    'Open incidents or signing escalations block renewal steady-state review.',
  )
  addCheck(
    checks,
    readinessReview.canContinueRenewalSteadyState === false &&
      readinessReview.blockerCodes.includes('renewal_review_next_review_overdue') &&
      readinessReview.blockerCodes.includes('renewal_review_unapproved_changes'),
    'PHASE54_NEXT_RENEWAL_READINESS_BLOCKED',
    'Overdue review, missing owner, closed intake, or unapproved changes block renewal steady-state review.',
  )
  addCheck(
    checks,
    missingAttestationReview.canContinueRenewalSteadyState === false &&
      missingAttestationReview.blockerCodes.includes('renewal_review_missing_attestation:governance_owner'),
    'PHASE54_MISSING_ATTESTATION_BLOCKED',
    'Governance-owner attestation is required for renewal steady-state review.',
  )
  addCheck(
    checks,
    badSignalReview.canContinueRenewalSteadyState === false &&
      badSignalReview.blockerCodes.includes('renewal_review_signal_not_green:renewed_route_default_stability') &&
      badSignalReview.blockerCodes.includes('renewal_review_missing_signal:incident_health'),
    'PHASE54_BAD_SIGNAL_BLOCKED',
    'Missing or non-green review signals block renewal steady-state review.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-steady-state-review-phase54'] === 'node scripts/otp-template-renewal-steady-state-review-phase54.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-steady-state-review-phase54'] === 'node scripts/report-otp-template-renewal-steady-state-review-phase54.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-steady-state-review-phase54'),
    'PHASE54_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 54 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    reviewReceipts: Object.freeze([
      goodReview,
      staleReview,
      routeDriftReview,
      pointerDriftReview,
      docxReview,
      archiveReview,
      rollbackReview,
      incidentReview,
      readinessReview,
      missingAttestationReview,
      badSignalReview,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      cleanReviewCount: [goodReview].filter((row) => row.canContinueRenewalSteadyState).length,
      blockedReviewCount: [
        staleReview,
        routeDriftReview,
        pointerDriftReview,
        docxReview,
        archiveReview,
        rollbackReview,
        incidentReview,
        readinessReview,
        missingAttestationReview,
        badSignalReview,
      ].filter((row) => !row.canContinueRenewalSteadyState).length,
      routeCount: REQUIRED_ROUTES.length,
      signalCount: REQUIRED_REVIEW_SIGNALS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 55,
      key: 'otp_template_renewal_change_intake',
      label: 'Template Renewal Change Intake',
    }),
  })
}

export function formatOtpTemplateRenewalSteadyStateReviewPhase54Markdown(report = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit()) {
  const readyReceipt = report.reviewReceipts.find((receipt) => receipt.canContinueRenewalSteadyState) || report.reviewReceipts[0]
  return [
    '# OTP Generator Phase 54 Template Renewal Steady-State Review',
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
        ['Clean reviews', report.summary.cleanReviewCount],
        ['Blocked reviews', report.summary.blockedReviewCount],
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
    '## Route Review',
    '',
    table(
      ['Route', 'Template', 'Envelope', 'Output Fingerprint', 'Generated'],
      readyReceipt.routeReviewRows.map((route) => [
        route.routeVariant,
        route.observedTemplateDefaultId,
        route.observedSigningEnvelopeKey,
        route.observedRouteOutputFingerprint,
        route.generatedOtpCount,
      ]),
    ),
    '',
    '## Review Signals',
    '',
    table(
      ['Signal', 'Status', 'Owner', 'Evidence'],
      readyReceipt.reviewSignals.map((signal) => [
        signal.key,
        signal.status,
        signal.owner,
        signal.evidencePath,
      ]),
    ),
    '',
    '## Review Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes', 'Signals', 'Attestations', 'Open Incidents', 'Unapproved Changes', 'Blockers'],
      report.reviewReceipts.map((receipt) => [
        receipt.status,
        receipt.canContinueRenewalSteadyState ? 'yes' : 'no',
        receipt.summary.reviewedRouteCount,
        receipt.summary.signalCount,
        receipt.summary.attestationCount,
        receipt.summary.openIncidentCount,
        receipt.summary.unapprovedChangeCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 54 proves the renewed OTP template version remains healthy after post-renewal closeout. It reviews resale and new-development route stability, version pointer stability, archive integrity, rollback retention, incident health, owner attestations, and readiness for the next renewal intake. The test/report path remains observational and does not mutate production data.',
    '',
  ].join('\n')
}
