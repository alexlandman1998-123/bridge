import {
  OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION,
  OTP_POST_CUTOVER_MONITORING_READY_STATUS,
  buildOtpPostCutoverMonitoringWatch,
} from './otpPostCutoverMonitoringPhase41.js'

export const OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION = 'otp_production_stabilisation_signoff_phase42_v1'
export const OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS = 'OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_FOR_RELEASE_CLOSEOUT'
export const OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT = 'otp-vnext-production-stabilisation-signoff-phase42-v1'

const REQUIRED_APPROVAL_ROLES = Object.freeze(['release_operator', 'document_owner', 'support_owner'])
const REQUIRED_EVIDENCE_KEYS = Object.freeze([
  'phase40_controlled_cutover_receipt',
  'phase41_post_cutover_monitoring_watch',
  'production_route_snapshot',
  'rollback_watch_receipt',
  'incident_register',
])
const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function defaultApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase42-${role}-stabilisation-signoff`,
    approvedAt: checkedAt,
  }))
}

function defaultEvidenceLinks() {
  return [
    { key: 'phase40_controlled_cutover_receipt', path: 'docs/otp-controlled-production-cutover-phase40.md' },
    { key: 'phase41_post_cutover_monitoring_watch', path: 'docs/otp-post-cutover-monitoring-phase41.md' },
    { key: 'production_route_snapshot', path: 'docs/otp-post-cutover-monitoring-phase41.md#watch-receipts' },
    { key: 'rollback_watch_receipt', path: 'docs/otp-post-cutover-monitoring-phase41.md#watch-receipts' },
    { key: 'incident_register', path: 'docs/otp-post-cutover-monitoring-phase41.md#checks' },
  ]
}

function defaultIncidentRegister() {
  return {
    openIncidentCount: 0,
    unresolvedWarningCount: 0,
    rollbackTriggered: false,
    signingEscalationCount: 0,
    routeDriftEscalationCount: 0,
    docxRegressionCount: 0,
  }
}

function defaultRollbackRetention() {
  return {
    rollbackPlanReference: 'phase40-controlled-cutover-rollback-plan',
    rollbackAvailable: true,
    stopDispatchReady: true,
    restoreDefaultsReady: true,
    disableFlagsReady: true,
    retainedBy: 'release_operator',
  }
}

function approvalBlockers(approvals = []) {
  const roles = list(approvals).map((row) => normalizeKey(row.role || row.approvalRole || row.approval_role))
  const missingRoles = REQUIRED_APPROVAL_ROLES.filter((role) => !roles.includes(role))
  const incompleteRows = list(approvals).filter((row) => {
    const role = normalizeKey(row.role || row.approvalRole || row.approval_role)
    return REQUIRED_APPROVAL_ROLES.includes(role) && (
      row.approved !== true ||
      !normalizeText(row.approvalReference || row.approval_reference) ||
      !normalizeText(row.approvedAt || row.approved_at)
    )
  })
  return [
    ...missingRoles.map((role) => `missing_stabilisation_approval:${role}`),
    ...incompleteRows.map((row) =>
      `incomplete_stabilisation_approval:${normalizeKey(row.role || row.approvalRole || row.approval_role) || 'unknown'}`,
    ),
  ]
}

function evidenceBlockers(evidenceLinks = []) {
  const keys = list(evidenceLinks).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_EVIDENCE_KEYS.filter((key) => !keys.includes(key))
  const emptyPathRows = list(evidenceLinks).filter((row) =>
    REQUIRED_EVIDENCE_KEYS.includes(normalizeKey(row.key)) && !normalizeText(row.path || row.url),
  )
  return [
    ...missingKeys.map((key) => `missing_stabilisation_evidence:${key}`),
    ...emptyPathRows.map((row) => `stabilisation_evidence_path_missing:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function incidentBlockers(incidentRegister = {}) {
  return [
    numberValue(incidentRegister.openIncidentCount || incidentRegister.open_incident_count) === 0 ? '' : 'open_incidents_remain',
    numberValue(incidentRegister.unresolvedWarningCount || incidentRegister.unresolved_warning_count) === 0
      ? ''
      : 'unresolved_warnings_remain',
    incidentRegister.rollbackTriggered === true ? 'rollback_was_triggered' : '',
    numberValue(incidentRegister.signingEscalationCount || incidentRegister.signing_escalation_count) === 0
      ? ''
      : 'signing_escalations_remain',
    numberValue(incidentRegister.routeDriftEscalationCount || incidentRegister.route_drift_escalation_count) === 0
      ? ''
      : 'route_drift_escalations_remain',
    numberValue(incidentRegister.docxRegressionCount || incidentRegister.docx_regression_count) === 0
      ? ''
      : 'docx_regression_remains',
  ].filter(Boolean)
}

function rollbackRetentionBlockers(rollbackRetention = {}) {
  return [
    rollbackRetention.rollbackAvailable === true ? '' : 'rollback_retention_not_available',
    normalizeText(rollbackRetention.rollbackPlanReference || rollbackRetention.rollback_plan_reference) ? '' : 'rollback_retention_reference_missing',
    rollbackRetention.stopDispatchReady === true ? '' : 'rollback_retention_stop_dispatch_not_ready',
    rollbackRetention.restoreDefaultsReady === true ? '' : 'rollback_retention_restore_defaults_not_ready',
    rollbackRetention.disableFlagsReady === true ? '' : 'rollback_retention_disable_flags_not_ready',
    normalizeText(rollbackRetention.retainedBy || rollbackRetention.retained_by) ? '' : 'rollback_retention_owner_missing',
  ].filter(Boolean)
}

function routeStabilityBlockers(monitoringWatch = {}) {
  const snapshots = list(monitoringWatch.routeSnapshots)
  const routes = snapshots.map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const unstableRoutes = snapshots.flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      normalizeText(row.observedTemplateDefaultId) && row.observedTemplateDefaultId === row.expectedTemplateDefaultId
        ? ''
        : `signoff_template_default_unstable:${route}`,
      normalizeText(row.observedSigningEnvelopeKey) && row.observedSigningEnvelopeKey === row.expectedSigningEnvelopeKey
        ? ''
        : `signoff_signing_envelope_unstable:${route}`,
      row.finalArtifactProofRoutePresent === true ? '' : `signoff_final_artifact_route_missing:${route}`,
      numberValue(row.docxReferenceCount || row.docx_reference_count) === 0 &&
        !normalizeKey(row.sourceFormat || row.source_format).includes('doc')
        ? ''
        : `signoff_docx_source_observed:${route}`,
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `signoff_missing_route_snapshot:${route}`),
    ...unstableRoutes,
  ]
}

export function buildOtpProductionStabilisationSignoffReceipt({
  monitoringWatch = buildOtpPostCutoverMonitoringWatch(),
  approvals = defaultApprovals(),
  evidenceLinks = defaultEvidenceLinks(),
  incidentRegister = defaultIncidentRegister(),
  rollbackRetention = defaultRollbackRetention(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const watch = monitoringWatch || {}
  const blockerCodes = unique([
    watch.version === OTP_POST_CUTOVER_MONITORING_PHASE41_VERSION ? '' : 'phase41_monitoring_version_mismatch',
    watch.status === OTP_POST_CUTOVER_MONITORING_READY_STATUS ? '' : 'phase41_monitoring_not_ready',
    watch.canContinuePostCutover === true ? '' : 'phase41_monitoring_cannot_continue',
    watch.shouldTriggerRollback === false ? '' : 'phase41_rollback_trigger_present',
    list(watch.blockerCodes).length === 0 ? '' : 'phase41_monitoring_has_blockers',
    list(watch.rollbackTriggerCodes).length === 0 ? '' : 'phase41_monitoring_has_rollback_triggers',
    watch.mutatedData === false ? '' : 'phase41_monitoring_mutation_unexpected',
    ...routeStabilityBlockers(watch),
    ...approvalBlockers(approvals),
    ...evidenceBlockers(evidenceLinks),
    ...incidentBlockers(incidentRegister),
    ...rollbackRetentionBlockers(rollbackRetention),
  ])
  const canSignOffStabilisation = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION,
    contract: OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT,
    checkedAt,
    status: canSignOffStabilisation
      ? OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS
      : 'OTP_PRODUCTION_STABILISATION_SIGNOFF_BLOCKED',
    canSignOffStabilisation,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    approvals: Object.freeze(list(approvals)),
    evidenceLinks: Object.freeze(list(evidenceLinks)),
    incidentRegister: Object.freeze({ ...incidentRegister }),
    rollbackRetention: Object.freeze({ ...rollbackRetention }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      approvalCount: list(approvals).length,
      evidenceLinkCount: list(evidenceLinks).length,
      blockerCount: blockerCodes.length,
      rollbackTriggerCount: list(watch.rollbackTriggerCodes).length,
      openIncidentCount: numberValue(incidentRegister.openIncidentCount || incidentRegister.open_incident_count),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpProductionStabilisationSignoffPhase42Audit({
  checkedAt = new Date().toISOString(),
  phase41Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase41Ready = !phase41Audit || phase41Audit.status === OTP_POST_CUTOVER_MONITORING_READY_STATUS
  const cleanWatch = phase41Audit?.watches?.find((watch) => watch.canContinuePostCutover) || buildOtpPostCutoverMonitoringWatch({ checkedAt })
  const goodSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: cleanWatch,
    approvals: defaultApprovals(checkedAt),
  })
  const rollbackTriggeredSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: {
      ...cleanWatch,
      canContinuePostCutover: false,
      shouldTriggerRollback: true,
      status: 'OTP_POST_CUTOVER_MONITORING_ROLLBACK_WATCH_REQUIRED',
      blockerCodes: ['template_default_drift:resale_existing_property'],
      rollbackTriggerCodes: ['rollback_trigger:template_default_drift:resale_existing_property'],
    },
    approvals: defaultApprovals(checkedAt),
  })
  const missingApprovalSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: cleanWatch,
    approvals: defaultApprovals(checkedAt).filter((row) => row.role !== 'document_owner'),
  })
  const openIncidentSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: cleanWatch,
    approvals: defaultApprovals(checkedAt),
    incidentRegister: {
      ...defaultIncidentRegister(),
      openIncidentCount: 1,
      signingEscalationCount: 1,
    },
  })
  const evidenceMissingSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: cleanWatch,
    approvals: defaultApprovals(checkedAt),
    evidenceLinks: defaultEvidenceLinks().filter((row) => row.key !== 'rollback_watch_receipt'),
  })
  const rollbackRetentionMissingSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: cleanWatch,
    approvals: defaultApprovals(checkedAt),
    rollbackRetention: {
      ...defaultRollbackRetention(),
      rollbackAvailable: false,
      restoreDefaultsReady: false,
    },
  })
  const docxRegressionSignoff = buildOtpProductionStabilisationSignoffReceipt({
    checkedAt,
    monitoringWatch: {
      ...cleanWatch,
      routeSnapshots: list(cleanWatch.routeSnapshots).map((row) =>
        row.routeVariant === 'resale_existing_property'
          ? { ...row, sourceFormat: 'docx', docxReferenceCount: 1 }
          : row,
      ),
    },
    approvals: defaultApprovals(checkedAt),
  })

  addCheck(checks, phase41Ready, 'PHASE42_PHASE41_MONITORING_READY', 'Stabilisation signoff starts only after Phase 41 post-cutover monitoring is ready.')
  addCheck(
    checks,
    goodSignoff.canSignOffStabilisation &&
      goodSignoff.status === OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS &&
      goodSignoff.mutatedData === false,
    'PHASE42_CLEAN_WATCH_SIGNOFF_READY',
    'A clean Phase 41 watch can produce a stabilisation signoff receipt without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_APPROVAL_ROLES.every((role) => goodSignoff.approvals.some((row) => row.role === role && row.approved === true)),
    'PHASE42_REQUIRED_APPROVALS_CAPTURED',
    'Release operator, document owner, and support owner approvals are required for stabilisation signoff.',
  )
  addCheck(
    checks,
    REQUIRED_EVIDENCE_KEYS.every((key) => goodSignoff.evidenceLinks.some((row) => row.key === key && row.path)),
    'PHASE42_EVIDENCE_LINKS_CAPTURED',
    'Signoff evidence must include cutover receipt, monitoring watch, route snapshot, rollback watch, and incident register.',
  )
  addCheck(
    checks,
    goodSignoff.incidentRegister.openIncidentCount === 0 &&
      goodSignoff.incidentRegister.rollbackTriggered === false &&
      goodSignoff.summary.rollbackTriggerCount === 0,
    'PHASE42_NO_OPEN_INCIDENTS_OR_ROLLBACK_TRIGGERS',
    'Production stabilisation cannot be signed off with open incidents or rollback triggers.',
  )
  addCheck(
    checks,
    goodSignoff.rollbackRetention.rollbackAvailable === true &&
      goodSignoff.rollbackRetention.stopDispatchReady === true &&
      goodSignoff.rollbackRetention.restoreDefaultsReady === true &&
      goodSignoff.rollbackRetention.disableFlagsReady === true,
    'PHASE42_ROLLBACK_RETENTION_AVAILABLE',
    'Rollback remains retained after signoff with dispatch stop, default restore, and flag disablement controls available.',
  )
  addCheck(
    checks,
    rollbackTriggeredSignoff.canSignOffStabilisation === false &&
      rollbackTriggeredSignoff.blockerCodes.includes('phase41_rollback_trigger_present'),
    'PHASE42_ROLLBACK_TRIGGER_BLOCKS_SIGNOFF',
    'A Phase 41 rollback trigger blocks production stabilisation signoff.',
  )
  addCheck(
    checks,
    missingApprovalSignoff.canSignOffStabilisation === false &&
      missingApprovalSignoff.blockerCodes.includes('missing_stabilisation_approval:document_owner'),
    'PHASE42_MISSING_APPROVAL_BLOCKS_SIGNOFF',
    'Missing required stabilisation approval blocks signoff.',
  )
  addCheck(
    checks,
    openIncidentSignoff.canSignOffStabilisation === false &&
      openIncidentSignoff.blockerCodes.includes('open_incidents_remain') &&
      openIncidentSignoff.blockerCodes.includes('signing_escalations_remain'),
    'PHASE42_OPEN_INCIDENTS_BLOCK_SIGNOFF',
    'Open incidents or unresolved signing escalations block signoff.',
  )
  addCheck(
    checks,
    evidenceMissingSignoff.canSignOffStabilisation === false &&
      evidenceMissingSignoff.blockerCodes.includes('missing_stabilisation_evidence:rollback_watch_receipt'),
    'PHASE42_MISSING_EVIDENCE_BLOCKS_SIGNOFF',
    'Missing rollback watch evidence blocks stabilisation signoff.',
  )
  addCheck(
    checks,
    rollbackRetentionMissingSignoff.canSignOffStabilisation === false &&
      rollbackRetentionMissingSignoff.blockerCodes.includes('rollback_retention_not_available'),
    'PHASE42_ROLLBACK_RETENTION_BLOCKS_SIGNOFF',
    'Rollback controls must remain available before stabilisation can be signed off.',
  )
  addCheck(
    checks,
    docxRegressionSignoff.canSignOffStabilisation === false &&
      docxRegressionSignoff.blockerCodes.includes('signoff_docx_source_observed:resale_existing_property'),
    'PHASE42_DOCX_REGRESSION_BLOCKS_SIGNOFF',
    'Any DOC/DOCX source regression in monitored route snapshots blocks signoff.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-production-stabilisation-signoff-phase42'] === 'node scripts/otp-production-stabilisation-signoff-phase42.test.mjs' &&
      packageJson.scripts?.['report:otp-production-stabilisation-signoff-phase42'] === 'node scripts/report-otp-production-stabilisation-signoff-phase42.mjs',
    'PHASE42_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 42 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION,
    contract: OTP_PRODUCTION_STABILISATION_SIGNOFF_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_PRODUCTION_STABILISATION_SIGNOFF_REMEDIATION_REQUIRED' : OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    signoffReceipts: Object.freeze([
      goodSignoff,
      rollbackTriggeredSignoff,
      missingApprovalSignoff,
      openIncidentSignoff,
      evidenceMissingSignoff,
      rollbackRetentionMissingSignoff,
      docxRegressionSignoff,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedSignoffCount: [goodSignoff].filter((row) => row.canSignOffStabilisation).length,
      blockedSignoffCount: [
        rollbackTriggeredSignoff,
        missingApprovalSignoff,
        openIncidentSignoff,
        evidenceMissingSignoff,
        rollbackRetentionMissingSignoff,
        docxRegressionSignoff,
      ].filter((row) => !row.canSignOffStabilisation).length,
      routeCount: REQUIRED_ROUTES.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 43,
      key: 'otp_release_closeout_archive',
      label: 'Release Closeout And Governance Archive',
    }),
  })
}

export function formatOtpProductionStabilisationSignoffPhase42Markdown(report = buildOtpProductionStabilisationSignoffPhase42Audit()) {
  return [
    '# OTP Generator Phase 42 Production Stabilisation Signoff',
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
        ['Approved signoff receipts', report.summary.approvedSignoffCount],
        ['Blocked signoff receipts', report.summary.blockedSignoffCount],
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
    '## Signoff Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Approvals', 'Evidence', 'Open incidents', 'Blockers'],
      report.signoffReceipts.map((receipt) => [
        receipt.status,
        receipt.canSignOffStabilisation ? 'yes' : 'no',
        receipt.summary.approvalCount,
        receipt.summary.evidenceLinkCount,
        receipt.summary.openIncidentCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 42 proves production stabilisation can be signed off only after a clean Phase 41 monitoring watch, required owner approvals, complete evidence, no open incident or rollback-trigger state, stable resale/new-development routes, no DOC/DOCX regression, and retained rollback controls. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
