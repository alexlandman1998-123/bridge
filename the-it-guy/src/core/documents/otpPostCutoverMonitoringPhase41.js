import {
  OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION,
  OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS,
  buildOtpControlledProductionCutoverReceipt,
} from './otpControlledProductionCutoverPhase40.js'

export const OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION = 'otp_post_cutover_monitoring_phase41_v1'
export const OTP_POST_CUTOVER_MONITORING_READY_STATUS = 'OTP_POST_CUTOVER_MONITORING_READY_FOR_STABILISATION_SIGNOFF'
export const OTP_POST_CUTOVER_MONITORING_CONTRACT = 'otp-vnext-post-cutover-monitoring-phase41-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const MAX_SNAPSHOT_GAP_MINUTES = 15
const MIN_SNAPSHOT_COUNT = 2

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.templateDefaultId || row.template_default_id || row.sourcePath || row.source_path)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function routeRow(rows = [], routeVariant = '') {
  const route = normalizeKey(routeVariant)
  return list(rows).find((row) => normalizeKey(row.routeVariant || row.route_variant) === route) || null
}

function routeSnapshotFor(cutoverReceipt = {}, routeVariant = '') {
  const template = routeRow(cutoverReceipt.templateDefaultUpdates, routeVariant) || {}
  const envelope = routeRow(cutoverReceipt.routeEnvelopeUpdates, routeVariant) || {}
  return {
    routeVariant,
    expectedTemplateDefaultId: template.templateDefaultId,
    observedTemplateDefaultId: template.templateDefaultId,
    expectedSigningEnvelopeKey: envelope.signingEnvelopeKey,
    observedSigningEnvelopeKey: envelope.signingEnvelopeKey,
    sourceFormat: template.sourceFormat || 'native_pdf_template',
    generatedOtpCount: 2,
    generatedOtpFailureCount: 0,
    signingDispatchFailureCount: 0,
    signerScopeViolationCount: 0,
    finalArtifactProofFailureCount: 0,
    routeDriftCount: 0,
    docxReferenceCount: 0,
    finalArtifactProofRoutePresent: true,
  }
}

function defaultRouteSnapshots(cutoverReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => routeSnapshotFor(cutoverReceipt, routeVariant))
}

function defaultMonitoringWindow(cutoverReceipt = {}) {
  const cutoverAt = timeMs(cutoverReceipt.checkedAt) || Date.parse('2026-08-06T01:00:00.000Z')
  const startedAt = new Date(cutoverAt + 5 * 60 * 1000).toISOString()
  const endedAt = new Date(cutoverAt + 65 * 60 * 1000).toISOString()
  return {
    environment: 'production',
    startedAt,
    endedAt,
    snapshotCount: 6,
    maxSnapshotGapMinutes: 10,
    monitoringSource: 'otp-production-watchdog',
  }
}

function defaultRollbackWatch() {
  return {
    armed: true,
    rollbackOwner: 'release_operator',
    rollbackPlanReady: true,
    stopDispatchReady: true,
    restoreDefaultsReady: true,
    disableFlagsReady: true,
    rollbackPlanReference: 'phase40-controlled-cutover-rollback-plan',
  }
}

function defaultIncidentSignals() {
  return {
    criticalCount: 0,
    warningCount: 0,
    generationFailureCount: 0,
    signingFailureCount: 0,
    signerScopeViolationCount: 0,
    finalArtifactFailureCount: 0,
    routeDriftCount: 0,
    docxReferenceCount: 0,
  }
}

function routeHealthBlockers(snapshot = {}) {
  const routeVariant = normalizeKey(snapshot.routeVariant || snapshot.route_variant) || 'unknown'
  const observedTemplate = normalizeText(snapshot.observedTemplateDefaultId || snapshot.observed_template_default_id)
  const expectedTemplate = normalizeText(snapshot.expectedTemplateDefaultId || snapshot.expected_template_default_id)
  const observedEnvelope = normalizeText(snapshot.observedSigningEnvelopeKey || snapshot.observed_signing_envelope_key)
  const expectedEnvelope = normalizeText(snapshot.expectedSigningEnvelopeKey || snapshot.expected_signing_envelope_key)
  return [
    expectedTemplate && observedTemplate === expectedTemplate ? '' : `template_default_drift:${routeVariant}`,
    expectedEnvelope && observedEnvelope === expectedEnvelope ? '' : `signing_envelope_drift:${routeVariant}`,
    snapshot.finalArtifactProofRoutePresent === true ? '' : `final_artifact_route_missing:${routeVariant}`,
    hasDocxSource(snapshot) ? `docx_source_observed:${routeVariant}` : '',
    numberValue(snapshot.generatedOtpFailureCount || snapshot.generated_otp_failure_count) === 0
      ? ''
      : `generation_failure_observed:${routeVariant}`,
    numberValue(snapshot.signingDispatchFailureCount || snapshot.signing_dispatch_failure_count) === 0
      ? ''
      : `signing_dispatch_failure_observed:${routeVariant}`,
    numberValue(snapshot.signerScopeViolationCount || snapshot.signer_scope_violation_count) === 0
      ? ''
      : `signer_scope_violation_observed:${routeVariant}`,
    numberValue(snapshot.finalArtifactProofFailureCount || snapshot.final_artifact_proof_failure_count) === 0
      ? ''
      : `final_artifact_proof_failure_observed:${routeVariant}`,
    numberValue(snapshot.routeDriftCount || snapshot.route_drift_count) === 0 ? '' : `route_drift_observed:${routeVariant}`,
  ].filter(Boolean)
}

function rollbackReadinessBlockers(rollbackWatch = {}) {
  return [
    rollbackWatch.armed === true ? '' : 'rollback_watch_not_armed',
    normalizeText(rollbackWatch.rollbackOwner || rollbackWatch.rollback_owner) ? '' : 'rollback_owner_missing',
    rollbackWatch.rollbackPlanReady === true ? '' : 'rollback_plan_not_ready',
    rollbackWatch.stopDispatchReady === true ? '' : 'stop_dispatch_not_ready',
    rollbackWatch.restoreDefaultsReady === true ? '' : 'restore_defaults_not_ready',
    rollbackWatch.disableFlagsReady === true ? '' : 'disable_flags_not_ready',
    normalizeText(rollbackWatch.rollbackPlanReference || rollbackWatch.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
  ].filter(Boolean)
}

function incidentBlockers(incidentSignals = {}) {
  return [
    numberValue(incidentSignals.criticalCount || incidentSignals.critical_count) === 0 ? '' : 'critical_incident_signal_observed',
    numberValue(incidentSignals.generationFailureCount || incidentSignals.generation_failure_count) === 0
      ? ''
      : 'generation_failure_signal_observed',
    numberValue(incidentSignals.signingFailureCount || incidentSignals.signing_failure_count) === 0
      ? ''
      : 'signing_failure_signal_observed',
    numberValue(incidentSignals.signerScopeViolationCount || incidentSignals.signer_scope_violation_count) === 0
      ? ''
      : 'signer_scope_violation_signal_observed',
    numberValue(incidentSignals.finalArtifactFailureCount || incidentSignals.final_artifact_failure_count) === 0
      ? ''
      : 'final_artifact_failure_signal_observed',
    numberValue(incidentSignals.routeDriftCount || incidentSignals.route_drift_count) === 0 ? '' : 'route_drift_signal_observed',
    numberValue(incidentSignals.docxReferenceCount || incidentSignals.docx_reference_count) === 0 ? '' : 'docx_reference_signal_observed',
  ].filter(Boolean)
}

function rollbackTriggerCodes(blockerCodes = []) {
  return blockerCodes.flatMap((code) => {
    if (/docx_source_observed|docx_reference_signal/.test(code)) return [`rollback_trigger:${code}`]
    if (/template_default_drift|signing_envelope_drift|route_drift/.test(code)) return [`rollback_trigger:${code}`]
    if (/signing_dispatch_failure|signing_failure|signer_scope_violation/.test(code)) return [`rollback_trigger:${code}`]
    if (/final_artifact/.test(code)) return [`rollback_trigger:${code}`]
    if (/critical_incident_signal/.test(code)) return [`rollback_trigger:${code}`]
    if (/rollback_watch_not_armed|rollback_plan_not_ready|stop_dispatch_not_ready|restore_defaults_not_ready|disable_flags_not_ready/.test(code)) {
      return [`rollback_trigger:${code}`]
    }
    return []
  })
}

export function buildOtpPostCutoverMonitoringWatch({
  cutoverReceipt = buildOtpControlledProductionCutoverReceipt(),
  monitorWindow = null,
  routeSnapshots = null,
  rollbackWatch = defaultRollbackWatch(),
  incidentSignals = defaultIncidentSignals(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const receipt = cutoverReceipt || {}
  const window = monitorWindow || defaultMonitoringWindow(receipt)
  const snapshots = routeSnapshots || defaultRouteSnapshots(receipt)
  const observedRoutes = list(snapshots).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((routeVariant) => !observedRoutes.includes(routeVariant))
  const startedAtMs = timeMs(window.startedAt || window.started_at)
  const endedAtMs = timeMs(window.endedAt || window.ended_at)
  const cutoverAtMs = timeMs(receipt.checkedAt)
  const blockerCodes = unique([
    receipt.version === OTP_CONTROLLED_PRODUCTION_CUTOVER_PHASE40_VERSION ? '' : 'phase40_cutover_receipt_version_mismatch',
    receipt.status === OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS ? '' : 'phase40_cutover_receipt_not_ready',
    receipt.canExecuteControlledCutover === true ? '' : 'phase40_cutover_receipt_not_allowed',
    receipt.mutatedData === false ? '' : 'phase40_cutover_receipt_mutation_unexpected',
    normalizeKey(window.environment) === 'production' ? '' : 'monitoring_environment_not_production',
    startedAtMs && endedAtMs && endedAtMs > startedAtMs ? '' : 'monitoring_window_not_bounded',
    cutoverAtMs && startedAtMs && startedAtMs >= cutoverAtMs ? '' : 'monitoring_window_not_post_cutover',
    numberValue(window.snapshotCount || window.snapshot_count) >= MIN_SNAPSHOT_COUNT ? '' : 'monitoring_snapshot_count_too_low',
    numberValue(window.maxSnapshotGapMinutes || window.max_snapshot_gap_minutes) <= MAX_SNAPSHOT_GAP_MINUTES
      ? ''
      : 'monitoring_snapshot_gap_too_high',
    ...missingRoutes.map((routeVariant) => `missing_route_monitoring:${routeVariant}`),
    ...list(snapshots).flatMap(routeHealthBlockers),
    ...rollbackReadinessBlockers(rollbackWatch),
    ...incidentBlockers(incidentSignals),
  ])
  const triggers = unique(rollbackTriggerCodes(blockerCodes))
  const canContinuePostCutover = blockerCodes.length === 0 && triggers.length === 0

  return Object.freeze({
    version: OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION,
    contract: OTP_POST_CUTOVER_MONITORING_CONTRACT,
    checkedAt,
    status: canContinuePostCutover
      ? OTP_POST_CUTOVER_MONITORING_READY_STATUS
      : 'OTP_POST_CUTOVER_MONITORING_ROLLBACK_WATCH_REQUIRED',
    canContinuePostCutover,
    shouldTriggerRollback: triggers.length > 0,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    rollbackTriggerCodes: Object.freeze(triggers),
    monitorWindow: Object.freeze({ ...window }),
    routeSnapshots: Object.freeze(list(snapshots)),
    rollbackWatch: Object.freeze({ ...rollbackWatch }),
    incidentSignals: Object.freeze({ ...incidentSignals }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      monitoredRouteCount: observedRoutes.length,
      blockerCount: blockerCodes.length,
      rollbackTriggerCount: triggers.length,
      snapshotCount: numberValue(window.snapshotCount || window.snapshot_count),
      maxSnapshotGapMinutes: numberValue(window.maxSnapshotGapMinutes || window.max_snapshot_gap_minutes),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpPostCutoverMonitoringPhase41Audit({
  checkedAt = new Date().toISOString(),
  phase40Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase40Ready = !phase40Audit || phase40Audit.status === OTP_CONTROLLED_PRODUCTION_CUTOVER_READY_STATUS
  const goodCutoverReceipt = phase40Audit?.receipts?.find((receipt) => receipt.canExecuteControlledCutover) ||
    buildOtpControlledProductionCutoverReceipt({ checkedAt })
  const goodWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
  })
  const routeDriftWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
    routeSnapshots: defaultRouteSnapshots(goodCutoverReceipt).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, observedTemplateDefaultId: 'otp-resale-template-legacy', routeDriftCount: 1 }
        : row,
    ),
  })
  const signingFailureWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
    routeSnapshots: defaultRouteSnapshots(goodCutoverReceipt).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, signingDispatchFailureCount: 1, signerScopeViolationCount: 1 }
        : row,
    ),
  })
  const rollbackUnavailableWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
    rollbackWatch: {
      ...defaultRollbackWatch(),
      armed: false,
      rollbackPlanReady: false,
      stopDispatchReady: false,
    },
  })
  const docxWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
    routeSnapshots: defaultRouteSnapshots(goodCutoverReceipt).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'old-offer-to-purchase.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const unboundedWindowWatch = buildOtpPostCutoverMonitoringWatch({
    checkedAt,
    cutoverReceipt: goodCutoverReceipt,
    monitorWindow: {
      ...defaultMonitoringWindow(goodCutoverReceipt),
      endedAt: '',
      snapshotCount: 1,
      maxSnapshotGapMinutes: 45,
    },
  })

  addCheck(checks, phase40Ready, 'PHASE41_PHASE40_CUTOVER_RECEIPT_READY', 'Post-cutover watch starts only after Phase 40 controlled cutover is ready.')
  addCheck(
    checks,
    goodWatch.canContinuePostCutover &&
      goodWatch.status === OTP_POST_CUTOVER_MONITORING_READY_STATUS &&
      goodWatch.mutatedData === false,
    'PHASE41_GOOD_WATCH_CAN_CONTINUE',
    'A clean production monitoring window can continue toward stabilisation signoff without mutating data.',
  )
  addCheck(
    checks,
    goodWatch.monitorWindow.environment === 'production' &&
      goodWatch.summary.snapshotCount >= MIN_SNAPSHOT_COUNT &&
      goodWatch.summary.maxSnapshotGapMinutes <= MAX_SNAPSHOT_GAP_MINUTES,
    'PHASE41_MONITORING_WINDOW_BOUNDED',
    'The watch requires a bounded production monitoring window with frequent enough snapshots.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((routeVariant) => goodWatch.routeSnapshots.some((row) => row.routeVariant === routeVariant)),
    'PHASE41_BOTH_ROUTES_MONITORED',
    'Resale and new-development OTP routes must both have production monitoring snapshots.',
  )
  addCheck(
    checks,
    goodWatch.routeSnapshots.every((row) =>
      row.observedTemplateDefaultId === row.expectedTemplateDefaultId &&
      row.observedSigningEnvelopeKey === row.expectedSigningEnvelopeKey,
    ),
    'PHASE41_ROUTE_DEFAULTS_STABLE',
    'Observed route defaults and signing envelopes must still match the Phase 40 cutover receipt.',
  )
  addCheck(
    checks,
    goodWatch.routeSnapshots.every((row) =>
      numberValue(row.signingDispatchFailureCount) === 0 &&
      numberValue(row.signerScopeViolationCount) === 0 &&
      numberValue(row.finalArtifactProofFailureCount) === 0,
    ),
    'PHASE41_SIGNING_AND_ARTIFACT_HEALTHY',
    'Signing dispatch, signer-session scoping, and final artifact proof must remain healthy after cutover.',
  )
  addCheck(
    checks,
    goodWatch.rollbackWatch.armed === true &&
      goodWatch.rollbackWatch.rollbackPlanReady === true &&
      goodWatch.rollbackWatch.stopDispatchReady === true &&
      goodWatch.rollbackWatch.restoreDefaultsReady === true &&
      goodWatch.rollbackWatch.disableFlagsReady === true,
    'PHASE41_ROLLBACK_WATCH_ARMED',
    'Rollback watch must be armed with flag disablement, default restore, dispatch stop, and owner controls ready.',
  )
  addCheck(
    checks,
    routeDriftWatch.canContinuePostCutover === false &&
      routeDriftWatch.shouldTriggerRollback === true &&
      routeDriftWatch.blockerCodes.includes('template_default_drift:resale_existing_property'),
    'PHASE41_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
    'Any production route-default drift blocks continuation and raises a rollback trigger.',
  )
  addCheck(
    checks,
    signingFailureWatch.canContinuePostCutover === false &&
      signingFailureWatch.shouldTriggerRollback === true &&
      signingFailureWatch.blockerCodes.includes('signing_dispatch_failure_observed:new_development') &&
      signingFailureWatch.blockerCodes.includes('signer_scope_violation_observed:new_development'),
    'PHASE41_SIGNING_FAILURE_TRIGGERS_ROLLBACK',
    'Signing dispatch or signer-scope failures block continuation and raise rollback triggers.',
  )
  addCheck(
    checks,
    rollbackUnavailableWatch.canContinuePostCutover === false &&
      rollbackUnavailableWatch.shouldTriggerRollback === true &&
      rollbackUnavailableWatch.blockerCodes.includes('rollback_watch_not_armed'),
    'PHASE41_ROLLBACK_UNAVAILABLE_BLOCKED',
    'If rollback controls are unavailable, the watch blocks continuation immediately.',
  )
  addCheck(
    checks,
    docxWatch.canContinuePostCutover === false &&
      docxWatch.shouldTriggerRollback === true &&
      docxWatch.blockerCodes.includes('docx_source_observed:resale_existing_property'),
    'PHASE41_DOCX_SOURCE_TRIGGERS_ROLLBACK',
    'Any DOC/DOCX source reappearing after cutover blocks continuation and raises a rollback trigger.',
  )
  addCheck(
    checks,
    unboundedWindowWatch.canContinuePostCutover === false &&
      unboundedWindowWatch.blockerCodes.includes('monitoring_window_not_bounded') &&
      unboundedWindowWatch.blockerCodes.includes('monitoring_snapshot_count_too_low'),
    'PHASE41_UNBOUNDED_WINDOW_BLOCKED',
    'The watch blocks an unbounded or under-sampled monitoring window.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-post-cutover-monitoring-phase41'] === 'node scripts/otp-post-cutover-monitoring-phase41.test.mjs' &&
      packageJson.scripts?.['report:otp-post-cutover-monitoring-phase41'] === 'node scripts/report-otp-post-cutover-monitoring-phase41.mjs',
    'PHASE41_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 41 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION,
    contract: OTP_POST_CUTOVER_MONITORING_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_POST_CUTOVER_MONITORING_REMEDIATION_REQUIRED' : OTP_POST_CUTOVER_MONITORING_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    watches: Object.freeze([
      goodWatch,
      routeDriftWatch,
      signingFailureWatch,
      rollbackUnavailableWatch,
      docxWatch,
      unboundedWindowWatch,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      cleanWatchCount: [goodWatch].filter((row) => row.canContinuePostCutover).length,
      rollbackTriggerWatchCount: [
        routeDriftWatch,
        signingFailureWatch,
        rollbackUnavailableWatch,
        docxWatch,
      ].filter((row) => row.shouldTriggerRollback).length,
      routeCount: REQUIRED_ROUTES.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 42,
      key: 'otp_production_stabilisation_signoff',
      label: 'Production Stabilisation Signoff',
    }),
  })
}

export function formatOtpPostCutoverMonitoringPhase41Markdown(report = buildOtpPostCutoverMonitoringPhase41Audit()) {
  return [
    '# OTP Generator Phase 41 Post-Cutover Monitoring And Rollback Watch',
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
        ['Clean watches', report.summary.cleanWatchCount],
        ['Rollback-trigger watches', report.summary.rollbackTriggerWatchCount],
        ['Routes', report.summary.routeCount],
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
    '## Watch Receipts',
    '',
    table(
      ['Status', 'Continue', 'Rollback', 'Routes', 'Snapshots', 'Blockers', 'Rollback triggers'],
      report.watches.map((watch) => [
        watch.status,
        watch.canContinuePostCutover ? 'yes' : 'no',
        watch.shouldTriggerRollback ? 'yes' : 'no',
        watch.summary.monitoredRouteCount,
        watch.summary.snapshotCount,
        watch.blockerCodes.join(', ') || 'none',
        watch.rollbackTriggerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 41 proves the post-cutover watch rules: production monitoring must remain bounded, resale and new-development routes must stay separated, signing and final-artifact health must stay clean, DOC/DOCX sources must not reappear, and rollback controls must be armed. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
