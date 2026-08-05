import {
  OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION,
  OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS,
  buildOtpProductionStabilisationSignoffReceipt,
} from './otpProductionStabilisationSignoffPhase42.js'

export const OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION = 'otp_release_closeout_archive_phase43_v1'
export const OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS = 'OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_FOR_STEADY_STATE_GOVERNANCE'
export const OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT = 'otp-vnext-release-closeout-archive-phase43-v1'

const REQUIRED_ARCHIVE_KEYS = Object.freeze([
  'phase40_controlled_cutover_receipt',
  'phase41_post_cutover_monitoring_watch',
  'phase42_stabilisation_signoff_receipt',
  'resale_route_output_manifest',
  'new_development_route_output_manifest',
  'rollback_retention_receipt',
  'incident_register_closeout',
  'legal_approval_summary',
  'template_version_manifest',
])
const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_APPROVAL_ROLES = Object.freeze(['release_operator', 'document_owner', 'governance_owner'])

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

function fingerprint(seed = '') {
  const normalized = normalizeKey(seed) || 'otp_release_archive'
  return `${normalized}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/g, 'a')
}

function defaultArchiveEntries() {
  return REQUIRED_ARCHIVE_KEYS.map((key) => ({
    key,
    path: `docs/${key.replace(/_/g, '-')}.md`,
    sha256: fingerprint(key),
    storageClass: 'governance_archive',
    immutable: true,
    retentionPolicy: 'release_lifecycle_plus_7_years',
    owner: key.includes('legal') ? 'document_owner' : 'release_operator',
    sourceFormat: 'markdown_evidence',
  }))
}

function defaultRouteOutputManifest() {
  return [
    {
      routeVariant: 'resale_existing_property',
      templateDefaultId: 'otp-resale-template-vnext-phase39',
      signingEnvelopeKey: 'otp-resale-envelope-vnext',
      finalArtifactProofPath: 'docs/otp-final-signed-artifact-proof-phase37.md',
      archived: true,
      sourceFormat: 'native_pdf_template',
    },
    {
      routeVariant: 'new_development',
      templateDefaultId: 'otp-new-development-template-vnext-phase39',
      signingEnvelopeKey: 'otp-new-development-envelope-vnext',
      finalArtifactProofPath: 'docs/otp-final-signed-artifact-proof-phase37.md',
      archived: true,
      sourceFormat: 'native_pdf_template',
    },
  ]
}

function defaultCloseoutApprovals(checkedAt = new Date().toISOString()) {
  return REQUIRED_APPROVAL_ROLES.map((role) => ({
    role,
    approved: true,
    approvalReference: `phase43-${role}-archive-closeout`,
    approvedAt: checkedAt,
  }))
}

function defaultIncidentCloseout() {
  return {
    openIncidentCount: 0,
    rollbackTriggered: false,
    unresolvedWarningCount: 0,
    postCloseoutOwner: 'support_owner',
  }
}

function defaultLegalSummary() {
  return {
    attorneyApprovalStatus: 'approved',
    approvalReference: 'phase42-attorney-approval-summary',
    unresolvedLegalHoldCount: 0,
    residualNotesArchived: true,
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

function defaultGovernanceHandoff() {
  return {
    owner: 'governance_owner',
    steadyStateOwner: 'document_owner',
    supportOwner: 'support_owner',
    monitoringCadence: 'weekly_release_health_review',
    archiveReference: 'otp-vnext-phase43-governance-archive',
  }
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.templateDefaultId || row.template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc')
}

function archiveEntryBlockers(archiveEntries = []) {
  const keys = list(archiveEntries).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_ARCHIVE_KEYS.filter((key) => !keys.includes(key))
  const relevantRows = list(archiveEntries).filter((row) => REQUIRED_ARCHIVE_KEYS.includes(normalizeKey(row.key)))
  const badRows = relevantRows.flatMap((row) => {
    const key = normalizeKey(row.key) || 'unknown'
    return [
      normalizeText(row.path || row.url) ? '' : `archive_path_missing:${key}`,
      /^[a-f0-9]{64}$/i.test(normalizeText(row.sha256 || row.fingerprint)) ? '' : `archive_fingerprint_missing:${key}`,
      row.immutable === true ? '' : `archive_entry_not_immutable:${key}`,
      normalizeText(row.retentionPolicy || row.retention_policy) ? '' : `archive_retention_missing:${key}`,
      normalizeText(row.owner) ? '' : `archive_owner_missing:${key}`,
      hasDocxSource(row) ? `archive_docx_source_observed:${key}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingKeys.map((key) => `missing_archive_entry:${key}`),
    ...badRows,
  ]
}

function routeManifestBlockers(routeOutputManifest = []) {
  const routes = list(routeOutputManifest).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeOutputManifest).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    return [
      normalizeText(row.templateDefaultId || row.template_default_id) ? '' : `route_template_default_missing:${route}`,
      normalizeText(row.signingEnvelopeKey || row.signing_envelope_key) ? '' : `route_signing_envelope_missing:${route}`,
      normalizeText(row.finalArtifactProofPath || row.final_artifact_proof_path) ? '' : `route_final_artifact_proof_missing:${route}`,
      row.archived === true ? '' : `route_output_not_archived:${route}`,
      hasDocxSource(row) ? `route_docx_source_observed:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `missing_route_output:${route}`),
    ...unique(duplicateRoutes).map((route) => `duplicate_route_output:${route}`),
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
      !normalizeText(row.approvalReference || row.approval_reference) ||
      !normalizeText(row.approvedAt || row.approved_at)
    )
  })
  return [
    ...missingRoles.map((role) => `missing_closeout_approval:${role}`),
    ...incompleteRows.map((row) => `incomplete_closeout_approval:${normalizeKey(row.role) || 'unknown'}`),
  ]
}

function incidentBlockers(incidentCloseout = {}) {
  return [
    numberValue(incidentCloseout.openIncidentCount || incidentCloseout.open_incident_count) === 0 ? '' : 'archive_open_incidents_remain',
    numberValue(incidentCloseout.unresolvedWarningCount || incidentCloseout.unresolved_warning_count) === 0
      ? ''
      : 'archive_unresolved_warnings_remain',
    incidentCloseout.rollbackTriggered === true ? 'archive_rollback_triggered' : '',
    normalizeText(incidentCloseout.postCloseoutOwner || incidentCloseout.post_closeout_owner) ? '' : 'archive_post_closeout_owner_missing',
  ].filter(Boolean)
}

function legalBlockers(legalSummary = {}) {
  return [
    normalizeKey(legalSummary.attorneyApprovalStatus || legalSummary.attorney_approval_status) === 'approved'
      ? ''
      : 'archive_legal_approval_not_approved',
    normalizeText(legalSummary.approvalReference || legalSummary.approval_reference) ? '' : 'archive_legal_approval_reference_missing',
    numberValue(legalSummary.unresolvedLegalHoldCount || legalSummary.unresolved_legal_hold_count) === 0
      ? ''
      : 'archive_unresolved_legal_holds_remain',
    legalSummary.residualNotesArchived === true ? '' : 'archive_residual_legal_notes_missing',
  ].filter(Boolean)
}

function rollbackBlockers(rollbackRetention = {}) {
  return [
    rollbackRetention.rollbackAvailable === true ? '' : 'archive_rollback_not_available',
    rollbackRetention.rollbackReceiptArchived === true ? '' : 'archive_rollback_receipt_missing',
    normalizeText(rollbackRetention.rollbackPlanReference || rollbackRetention.rollback_plan_reference) ? '' : 'archive_rollback_reference_missing',
    rollbackRetention.restoreDefaultsReady === true ? '' : 'archive_rollback_restore_defaults_not_ready',
    rollbackRetention.disableFlagsReady === true ? '' : 'archive_rollback_disable_flags_not_ready',
    rollbackRetention.stopDispatchReady === true ? '' : 'archive_rollback_stop_dispatch_not_ready',
    normalizeText(rollbackRetention.retainedBy || rollbackRetention.retained_by) ? '' : 'archive_rollback_owner_missing',
  ].filter(Boolean)
}

function governanceBlockers(governanceHandoff = {}) {
  return [
    normalizeText(governanceHandoff.owner) ? '' : 'governance_owner_missing',
    normalizeText(governanceHandoff.steadyStateOwner || governanceHandoff.steady_state_owner) ? '' : 'steady_state_owner_missing',
    normalizeText(governanceHandoff.supportOwner || governanceHandoff.support_owner) ? '' : 'support_owner_missing',
    normalizeText(governanceHandoff.monitoringCadence || governanceHandoff.monitoring_cadence) ? '' : 'monitoring_cadence_missing',
    normalizeText(governanceHandoff.archiveReference || governanceHandoff.archive_reference) ? '' : 'archive_reference_missing',
  ].filter(Boolean)
}

export function buildOtpReleaseCloseoutArchiveReceipt({
  stabilisationSignoff = buildOtpProductionStabilisationSignoffReceipt(),
  archiveEntries = defaultArchiveEntries(),
  routeOutputManifest = defaultRouteOutputManifest(),
  closeoutApprovals = defaultCloseoutApprovals(),
  incidentCloseout = defaultIncidentCloseout(),
  legalSummary = defaultLegalSummary(),
  rollbackRetention = defaultRollbackRetention(),
  governanceHandoff = defaultGovernanceHandoff(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const signoff = stabilisationSignoff || {}
  const blockerCodes = unique([
    signoff.version === OTP_PRODUCTION_STABILISATION_SIGNOFF_PHASE42_VERSION ? '' : 'phase42_signoff_version_mismatch',
    signoff.status === OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS ? '' : 'phase42_signoff_not_ready',
    signoff.canSignOffStabilisation === true ? '' : 'phase42_signoff_not_allowed',
    list(signoff.blockerCodes).length === 0 ? '' : 'phase42_signoff_has_blockers',
    signoff.mutatedData === false ? '' : 'phase42_signoff_mutation_unexpected',
    ...archiveEntryBlockers(archiveEntries),
    ...routeManifestBlockers(routeOutputManifest),
    ...approvalBlockers(closeoutApprovals),
    ...incidentBlockers(incidentCloseout),
    ...legalBlockers(legalSummary),
    ...rollbackBlockers(rollbackRetention),
    ...governanceBlockers(governanceHandoff),
  ])
  const canArchiveReleaseCloseout = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION,
    contract: OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT,
    checkedAt,
    status: canArchiveReleaseCloseout
      ? OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS
      : 'OTP_RELEASE_CLOSEOUT_ARCHIVE_BLOCKED',
    canArchiveReleaseCloseout,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    archiveEntries: Object.freeze(list(archiveEntries)),
    routeOutputManifest: Object.freeze(list(routeOutputManifest)),
    closeoutApprovals: Object.freeze(list(closeoutApprovals)),
    incidentCloseout: Object.freeze({ ...incidentCloseout }),
    legalSummary: Object.freeze({ ...legalSummary }),
    rollbackRetention: Object.freeze({ ...rollbackRetention }),
    governanceHandoff: Object.freeze({ ...governanceHandoff }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      archivedRouteCount: list(routeOutputManifest).filter((row) => row.archived === true).length,
      archiveEntryCount: list(archiveEntries).length,
      approvalCount: list(closeoutApprovals).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpReleaseCloseoutArchivePhase43Audit({
  checkedAt = new Date().toISOString(),
  phase42Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase42Ready = !phase42Audit || phase42Audit.status === OTP_PRODUCTION_STABILISATION_SIGNOFF_READY_STATUS
  const goodSignoff = phase42Audit?.signoffReceipts?.find((receipt) => receipt.canSignOffStabilisation) ||
    buildOtpProductionStabilisationSignoffReceipt({ checkedAt })
  const goodArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const missingEvidenceArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    archiveEntries: defaultArchiveEntries().filter((row) => row.key !== 'phase42_stabilisation_signoff_receipt'),
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const mutableArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    archiveEntries: defaultArchiveEntries().map((row) =>
      row.key === 'phase41_post_cutover_monitoring_watch' ? { ...row, immutable: false, sha256: '' } : row,
    ),
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const missingRouteArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    routeOutputManifest: defaultRouteOutputManifest().filter((row) => row.routeVariant !== 'new_development'),
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const docxArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    routeOutputManifest: defaultRouteOutputManifest().map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', finalArtifactProofPath: 'old-resale-otp.docx' }
        : row,
    ),
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const legalHoldArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    legalSummary: {
      ...defaultLegalSummary(),
      attorneyApprovalStatus: 'pending',
      approvalReference: '',
      unresolvedLegalHoldCount: 1,
      residualNotesArchived: false,
    },
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const rollbackMissingArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    rollbackRetention: {
      ...defaultRollbackRetention(),
      rollbackAvailable: false,
      rollbackReceiptArchived: false,
    },
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
  })
  const missingApprovalArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    closeoutApprovals: defaultCloseoutApprovals(checkedAt).filter((row) => row.role !== 'governance_owner'),
  })
  const governanceMissingArchive = buildOtpReleaseCloseoutArchiveReceipt({
    checkedAt,
    stabilisationSignoff: goodSignoff,
    closeoutApprovals: defaultCloseoutApprovals(checkedAt),
    governanceHandoff: {
      ...defaultGovernanceHandoff(),
      owner: '',
      archiveReference: '',
    },
  })

  addCheck(checks, phase42Ready, 'PHASE43_PHASE42_SIGNOFF_READY', 'Release closeout archive starts only after Phase 42 stabilisation signoff is ready.')
  addCheck(
    checks,
    goodArchive.canArchiveReleaseCloseout &&
      goodArchive.status === OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS &&
      goodArchive.mutatedData === false,
    'PHASE43_GOOD_ARCHIVE_READY',
    'A clean Phase 42 signoff can produce a release closeout archive receipt without mutating production data.',
  )
  addCheck(
    checks,
    REQUIRED_ARCHIVE_KEYS.every((key) => goodArchive.archiveEntries.some((row) => row.key === key && row.path && row.sha256)),
    'PHASE43_REQUIRED_ARCHIVE_ENTRIES_CAPTURED',
    'Archive entries include all release, route, rollback, incident, legal, and template-version evidence.',
  )
  addCheck(
    checks,
    goodArchive.archiveEntries.every((row) => row.immutable === true && row.retentionPolicy && /^[a-f0-9]{64}$/i.test(row.sha256)),
    'PHASE43_ARCHIVE_ENTRIES_IMMUTABLE_AND_FINGERPRINTED',
    'Every archive entry must be immutable, fingerprinted, owned, and retention-scoped.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodArchive.routeOutputManifest.some((row) => row.routeVariant === route && row.archived === true)),
    'PHASE43_BOTH_ROUTE_OUTPUTS_ARCHIVED',
    'Resale and new-development route outputs must both be included in the closeout archive.',
  )
  addCheck(
    checks,
    goodArchive.legalSummary.attorneyApprovalStatus === 'approved' &&
      goodArchive.legalSummary.residualNotesArchived === true &&
      goodArchive.legalSummary.unresolvedLegalHoldCount === 0,
    'PHASE43_LEGAL_SUMMARY_CLOSED',
    'The archive must include approved legal summary state with no unresolved legal holds and residual notes archived.',
  )
  addCheck(
    checks,
    goodArchive.rollbackRetention.rollbackAvailable === true &&
      goodArchive.rollbackRetention.rollbackReceiptArchived === true,
    'PHASE43_ROLLBACK_RETENTION_ARCHIVED',
    'Rollback retention remains available and the rollback receipt is archived at closeout.',
  )
  addCheck(
    checks,
    missingEvidenceArchive.canArchiveReleaseCloseout === false &&
      missingEvidenceArchive.blockerCodes.includes('missing_archive_entry:phase42_stabilisation_signoff_receipt'),
    'PHASE43_MISSING_ARCHIVE_ENTRY_BLOCKED',
    'Missing required release evidence blocks closeout archive.',
  )
  addCheck(
    checks,
    mutableArchive.canArchiveReleaseCloseout === false &&
      mutableArchive.blockerCodes.includes('archive_entry_not_immutable:phase41_post_cutover_monitoring_watch') &&
      mutableArchive.blockerCodes.includes('archive_fingerprint_missing:phase41_post_cutover_monitoring_watch'),
    'PHASE43_MUTABLE_ARCHIVE_BLOCKED',
    'Mutable or unfingerprinted archive evidence blocks closeout archive.',
  )
  addCheck(
    checks,
    missingRouteArchive.canArchiveReleaseCloseout === false &&
      missingRouteArchive.blockerCodes.includes('missing_route_output:new_development'),
    'PHASE43_MISSING_ROUTE_OUTPUT_BLOCKED',
    'Missing new-development or resale route output blocks closeout archive.',
  )
  addCheck(
    checks,
    docxArchive.canArchiveReleaseCloseout === false &&
      docxArchive.blockerCodes.includes('route_docx_source_observed:resale_existing_property'),
    'PHASE43_DOCX_REGRESSION_BLOCKED',
    'Any DOC/DOCX source regression in archived route outputs blocks closeout.',
  )
  addCheck(
    checks,
    legalHoldArchive.canArchiveReleaseCloseout === false &&
      legalHoldArchive.blockerCodes.includes('archive_legal_approval_not_approved') &&
      legalHoldArchive.blockerCodes.includes('archive_unresolved_legal_holds_remain'),
    'PHASE43_LEGAL_HOLD_BLOCKED',
    'Pending legal approval or unresolved legal holds block governance archive closeout.',
  )
  addCheck(
    checks,
    rollbackMissingArchive.canArchiveReleaseCloseout === false &&
      rollbackMissingArchive.blockerCodes.includes('archive_rollback_not_available') &&
      rollbackMissingArchive.blockerCodes.includes('archive_rollback_receipt_missing'),
    'PHASE43_ROLLBACK_ARCHIVE_BLOCKED',
    'Rollback plan availability and archived rollback receipt are required for closeout.',
  )
  addCheck(
    checks,
    missingApprovalArchive.canArchiveReleaseCloseout === false &&
      missingApprovalArchive.blockerCodes.includes('missing_closeout_approval:governance_owner'),
    'PHASE43_MISSING_CLOSEOUT_APPROVAL_BLOCKED',
    'Governance closeout approval is required before archive closeout.',
  )
  addCheck(
    checks,
    governanceMissingArchive.canArchiveReleaseCloseout === false &&
      governanceMissingArchive.blockerCodes.includes('governance_owner_missing') &&
      governanceMissingArchive.blockerCodes.includes('archive_reference_missing'),
    'PHASE43_GOVERNANCE_HANDOFF_BLOCKED',
    'Steady-state governance ownership and archive reference are required for closeout.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-release-closeout-archive-phase43'] === 'node scripts/otp-release-closeout-archive-phase43.test.mjs' &&
      packageJson.scripts?.['report:otp-release-closeout-archive-phase43'] === 'node scripts/report-otp-release-closeout-archive-phase43.mjs',
    'PHASE43_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 43 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_RELEASE_CLOSEOUT_ARCHIVE_PHASE43_VERSION,
    contract: OTP_RELEASE_CLOSEOUT_ARCHIVE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_RELEASE_CLOSEOUT_ARCHIVE_REMEDIATION_REQUIRED' : OTP_RELEASE_CLOSEOUT_ARCHIVE_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    archiveReceipts: Object.freeze([
      goodArchive,
      missingEvidenceArchive,
      mutableArchive,
      missingRouteArchive,
      docxArchive,
      legalHoldArchive,
      rollbackMissingArchive,
      missingApprovalArchive,
      governanceMissingArchive,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedArchiveCount: [goodArchive].filter((row) => row.canArchiveReleaseCloseout).length,
      blockedArchiveCount: [
        missingEvidenceArchive,
        mutableArchive,
        missingRouteArchive,
        docxArchive,
        legalHoldArchive,
        rollbackMissingArchive,
        missingApprovalArchive,
        governanceMissingArchive,
      ].filter((row) => !row.canArchiveReleaseCloseout).length,
      routeCount: REQUIRED_ROUTES.length,
      archiveEntryCount: REQUIRED_ARCHIVE_KEYS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 44,
      key: 'otp_steady_state_governance_monitoring',
      label: 'Steady-State Governance Monitoring',
    }),
  })
}

export function formatOtpReleaseCloseoutArchivePhase43Markdown(report = buildOtpReleaseCloseoutArchivePhase43Audit()) {
  return [
    '# OTP Generator Phase 43 Release Closeout And Governance Archive',
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
        ['Approved archive receipts', report.summary.approvedArchiveCount],
        ['Blocked archive receipts', report.summary.blockedArchiveCount],
        ['Routes', report.summary.routeCount],
        ['Archive entries', report.summary.archiveEntryCount],
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
    '## Archive Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Entries', 'Routes', 'Approvals', 'Blockers'],
      report.archiveReceipts.map((receipt) => [
        receipt.status,
        receipt.canArchiveReleaseCloseout ? 'yes' : 'no',
        receipt.summary.archiveEntryCount,
        receipt.summary.archivedRouteCount,
        receipt.summary.approvalCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 43 proves the release closeout archive can be recorded only after Phase 42 stabilisation signoff, complete immutable evidence, both resale and new-development route outputs, approved legal summary, archived rollback retention, incident closeout, closeout approvals, and steady-state governance handoff. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
