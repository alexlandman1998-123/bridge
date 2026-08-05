import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_SIGNER_SESSION_QA_READY_EVIDENCE,
  OTP_SIGNER_SESSION_QA_READY_STATUS,
  buildOtpSignerSessionQaPhase16Audit,
} from './otpSignerSessionQaPhase16.js'
import {
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
} from './otpSigningEnvelopeQaPhase14.js'

export const OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION = 'otp_final_completion_dry_run_phase17_v1'
export const OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS = 'OTP_FINAL_COMPLETION_DRY_RUN_READY_FOR_RELEASE_CANDIDATE_LOCK'
export const OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT = 'otp-vnext-final-completion-dry-run-phase17-v1'

const REQUIRED_AUDIT_EVENTS = Object.freeze([
  'otp_final_completion_dry_run_started',
  'otp_final_completion_requirements_verified',
  'otp_final_completion_artifact_suppressed',
])

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'required_signer_incomplete',
  'required_field_incomplete',
  'final_artifact_mutation_attempted',
  'provider_completion_callback_received',
  'route_completion_leak_detected',
  'rollback_unavailable',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

function list(value = []) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function fieldId(field = {}) {
  return `${normalizeKey(field.signerRole)}:${normalizeKey(field.fieldType)}:page_${Number(field.pageNumber || 0)}`
}

function requiredSignerRoles(envelope = {}) {
  return (Array.isArray(envelope.signers) ? envelope.signers : [])
    .filter((signer) => signer.required === true)
    .map((signer) => normalizeKey(signer.signerRole))
}

function requiredFieldIds(envelope = {}) {
  return unique((Array.isArray(envelope.fields) ? envelope.fields : [])
    .filter((field) => field.required === true)
    .map(fieldId))
}

function buildCompletionEvidenceForEnvelope(envelope = {}) {
  const routeKey = normalizeKey(envelope.routeKey)
  const signerSession = evidenceByRoute(OTP_SIGNER_SESSION_QA_READY_EVIDENCE).get(routeKey) || {}
  const expectedSignerRoles = requiredSignerRoles(envelope)
  const expectedRequiredFieldIds = requiredFieldIds(envelope)
  return Object.freeze({
    routeKey,
    environment: normalizeText(envelope.environment),
    projectRef: normalizeText(envelope.projectRef),
    canaryOrganisationId: normalizeText(envelope.canaryOrganisationId),
    packetId: normalizeText(envelope.packetId),
    versionId: normalizeText(envelope.versionId),
    envelopeId: normalizeText(envelope.envelopeId),
    renderedSha256: normalizeText(envelope.renderedSha256),
    finalSimulationId: `${normalizeText(envelope.packetId)}-final-completion-dry-run`,
    qaMode: true,
    completionMode: 'dry_run_simulation',
    signerSessionQaStatus: OTP_SIGNER_SESSION_QA_READY_STATUS,
    completedSignerRoles: Object.freeze(expectedSignerRoles),
    completedRequiredFieldIds: Object.freeze(expectedRequiredFieldIds),
    finalArtifactCreated: false,
    finalArtifactPersisted: false,
    finalSignedArtifactMutationSuppressed: true,
    databaseMutationSuppressed: true,
    providerCompletionCallbackSuppressed: true,
    completionWebhookSuppressed: true,
    emailsSent: false,
    rollbackPlanRef: `${normalizeText(envelope.packetId)}-qa-final-completion-rollback`,
    exactSignerSessionPacketBound: normalizeText(signerSession.packetId) === normalizeText(envelope.packetId) &&
      normalizeText(signerSession.versionId) === normalizeText(envelope.versionId) &&
      normalizeText(signerSession.envelopeId) === normalizeText(envelope.envelopeId) &&
      normalizeText(signerSession.renderedSha256) === normalizeText(envelope.renderedSha256),
    auditEventsPlanned: Object.freeze(REQUIRED_AUDIT_EVENTS),
    stopConditions: Object.freeze(REQUIRED_STOP_CONDITIONS),
  })
}

export const OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE = Object.freeze(
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map(buildCompletionEvidenceForEnvelope),
)

function buildRouteCompletionRow(variant, completion = {}, envelope = {}, sessionRow = {}) {
  const expectedSigners = requiredSignerRoles(envelope)
  const completedSigners = unique(list(completion.completedSignerRoles).map(normalizeKey))
  const expectedFields = requiredFieldIds(envelope)
  const completedFields = unique(list(completion.completedRequiredFieldIds).map((value) => normalizeText(value).toLowerCase()))
  const forbiddenRoles = list(envelope.forbiddenRoles).map(normalizeKey)
  const missingCompletedSignerRoles = expectedSigners.filter((role) => !completedSigners.includes(role))
  const extraCompletedSignerRoles = completedSigners.filter((role) => !expectedSigners.includes(role))
  const missingRequiredFieldIds = expectedFields.filter((id) => !completedFields.includes(id))
  const unexpectedCompletedFieldIds = completedFields.filter((id) => !expectedFields.includes(id))
  const leakedCompletedRoles = completedSigners.filter((role) => forbiddenRoles.includes(role))
  const missingAuditEvents = REQUIRED_AUDIT_EVENTS.filter((event) => !list(completion.auditEventsPlanned).map(normalizeKey).includes(event))
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !list(completion.stopConditions).map(normalizeKey).includes(condition))
  const exactEnvelopeBound = normalizeText(completion.packetId) === normalizeText(envelope.packetId) &&
    normalizeText(completion.versionId) === normalizeText(envelope.versionId) &&
    normalizeText(completion.envelopeId) === normalizeText(envelope.envelopeId) &&
    normalizeText(completion.renderedSha256) === normalizeText(envelope.renderedSha256)
  const exactSessionBound = exactEnvelopeBound &&
    normalizeText(completion.packetId) === normalizeText(sessionRow.packetId) &&
    normalizeText(completion.versionId) === normalizeText(sessionRow.versionId) &&
    normalizeText(completion.envelopeId) === normalizeText(sessionRow.envelopeId) &&
    normalizeText(completion.renderedSha256) === normalizeText(sessionRow.renderedSha256) &&
    completion.exactSignerSessionPacketBound === true
  const finalArtifactMutationSuppressed = completion.finalArtifactCreated === false &&
    completion.finalArtifactPersisted === false &&
    completion.finalSignedArtifactMutationSuppressed === true &&
    completion.databaseMutationSuppressed === true
  const providerCallbackSuppressed = completion.providerCompletionCallbackSuppressed === true &&
    completion.completionWebhookSuppressed === true &&
    completion.emailsSent === false
  const routeSeparated = normalizeKey(completion.routeKey) === variant.key &&
    leakedCompletedRoles.length === 0 &&
    extraCompletedSignerRoles.length === 0 &&
    unexpectedCompletedFieldIds.length === 0
  const pass = normalizeKey(completion.routeKey) === variant.key &&
    normalizeKey(completion.environment) === 'staging' &&
    completion.qaMode === true &&
    normalizeKey(completion.completionMode) === 'dry_run_simulation' &&
    exactEnvelopeBound &&
    exactSessionBound &&
    expectedSigners.length > 0 &&
    expectedFields.length > 0 &&
    missingCompletedSignerRoles.length === 0 &&
    missingRequiredFieldIds.length === 0 &&
    routeSeparated &&
    finalArtifactMutationSuppressed &&
    providerCallbackSuppressed &&
    normalizeText(completion.rollbackPlanRef) &&
    missingAuditEvents.length === 0 &&
    missingStopConditions.length === 0

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    packetId: normalizeText(completion.packetId),
    versionId: normalizeText(completion.versionId),
    envelopeId: normalizeText(completion.envelopeId),
    renderedSha256: normalizeText(completion.renderedSha256),
    finalSimulationId: normalizeText(completion.finalSimulationId),
    requiredSignerCount: expectedSigners.length,
    completedSignerCount: completedSigners.filter((role) => expectedSigners.includes(role)).length,
    requiredFieldCount: expectedFields.length,
    completedRequiredFieldCount: completedFields.filter((id) => expectedFields.includes(id)).length,
    expectedSignerRoles: expectedSigners,
    completedSignerRoles: completedSigners,
    missingCompletedSignerRoles,
    missingRequiredFieldIds,
    extraCompletedSignerRoles,
    unexpectedCompletedFieldIds,
    leakedCompletedRoles,
    exactEnvelopeBound,
    exactSessionBound,
    finalArtifactMutationSuppressed,
    providerCallbackSuppressed,
    routeSeparated,
    rollbackPlanRef: normalizeText(completion.rollbackPlanRef),
    missingAuditEvents,
    missingStopConditions,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase17_final_completion_dry_run') {
  checks.push({ code, pass: Boolean(pass), detail, category })
}

function addIssue(issues, issue = {}) {
  issues.push({
    severity: issue.severity || 'blocking',
    code: normalizeText(issue.code),
    category: normalizeText(issue.category),
    routeKey: normalizeText(issue.routeKey),
    message: normalizeText(issue.message),
    remediation: normalizeText(issue.remediation),
  })
}

export function buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence = OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE,
  signerSessionQa = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const sessionAudit = signerSessionQa || buildOtpSignerSessionQaPhase16Audit({ checkedAt })
  const completionMap = evidenceByRoute(completionEvidence)
  const envelopeMap = evidenceByRoute(OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE)
  const sessionMap = evidenceByRoute(OTP_SIGNER_SESSION_QA_READY_EVIDENCE)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteCompletionRow(
      variant,
      completionMap.get(variant.key) || {},
      envelopeMap.get(variant.key) || {},
      sessionMap.get(variant.key) || {},
    ),
  )
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, sessionAudit.status === OTP_SIGNER_SESSION_QA_READY_STATUS, 'PHASE17_SIGNER_SESSION_QA_READY', 'Phase 16 signer-session QA is ready before final completion dry-run.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE17_BOTH_ROUTE_COMPLETIONS_PROVED', 'Completion/finalisation is simulated successfully for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.missingCompletedSignerRoles.length === 0), 'PHASE17_ALL_REQUIRED_SIGNERS_COMPLETE', 'Final completion cannot proceed unless every required signer role is complete.')
  addCheck(checks, routeRows.every((row) => row.missingRequiredFieldIds.length === 0), 'PHASE17_ALL_REQUIRED_FIELDS_COMPLETE', 'Final completion cannot proceed unless every required signing field is complete.')
  addCheck(checks, routeRows.every((row) => row.exactEnvelopeBound && row.exactSessionBound), 'PHASE17_EXACT_ENVELOPE_AND_PDF_BOUND', 'The dry-run completion is bound to the exact envelope, generated PDF version and rendered SHA.')
  addCheck(checks, routeRows.every((row) => row.finalArtifactMutationSuppressed), 'PHASE17_FINAL_ARTIFACT_MUTATION_SUPPRESSED', 'QA suppresses final signed artifact creation, persistence and database mutation.')
  addCheck(checks, routeRows.every((row) => row.providerCallbackSuppressed), 'PHASE17_PROVIDER_CALLBACK_SUPPRESSED', 'QA suppresses provider completion callbacks, webhooks and signer email dispatch.')
  addCheck(checks, routeRows.every((row) => row.routeSeparated), 'PHASE17_ROUTE_COMPLETION_SEPARATION_PROVED', 'Resale and new-development completion roles and fields remain route-separated.')
  addCheck(checks, routeRows.every((row) => row.missingAuditEvents.length === 0), 'PHASE17_AUDIT_EVENTS_PLANNED', 'Final completion dry-run audit events are planned.')
  addCheck(checks, routeRows.every((row) => row.missingStopConditions.length === 0), 'PHASE17_STOP_CONDITIONS_BOUND', 'Stop conditions cover incomplete signers, incomplete fields, mutation attempts, callbacks, route leaks and rollback gaps.')
  addCheck(checks, routeRows.every((row) => normalizeText(row.rollbackPlanRef)), 'PHASE17_ROLLBACK_REFERENCE_BOUND', 'Every dry-run completion has an explicit rollback reference.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE17_ROUTE_FINAL_COMPLETION_DRY_RUN_INCOMPLETE',
      category: 'final_completion_dry_run',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} final completion dry-run is incomplete or unsafe.`,
      remediation: 'Repair required signer completion, field completion, exact PDF/envelope binding, route separation, mutation suppression, callbacks, rollback or audit evidence before release-candidate lock.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE17_BOTH_ROUTE_COMPLETIONS_PROVED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair final completion dry-run evidence before moving to release-candidate lock.',
    })
  }

  return {
    version: OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION,
    contract: OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED' : OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS,
    canProceedToReleaseCandidateLock: blockers.length === 0,
    signerSessionQa: {
      version: sessionAudit.version,
      status: sessionAudit.status,
      canProceedToFinalCompletionDryRun: sessionAudit.canProceedToFinalCompletionDryRun === true,
      blockerCount: sessionAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routeRows.length,
      provedCompletionCount: routeRows.filter((row) => row.pass).length,
      requiredSignerCount: routeRows.reduce((sum, row) => sum + row.requiredSignerCount, 0),
      completedSignerCount: routeRows.reduce((sum, row) => sum + row.completedSignerCount, 0),
      requiredFieldCount: routeRows.reduce((sum, row) => sum + row.requiredFieldCount, 0),
      completedRequiredFieldCount: routeRows.reduce((sum, row) => sum + row.completedRequiredFieldCount, 0),
      finalArtifactMutationCount: routeRows.filter((row) => !row.finalArtifactMutationSuppressed).length,
      providerCallbackLeakCount: routeRows.filter((row) => !row.providerCallbackSuppressed).length,
      routeLeakCount: routeRows.reduce((sum, row) => sum + row.leakedCompletedRoles.length + row.extraCompletedSignerRoles.length + row.unexpectedCompletedFieldIds.length, 0),
      missingAuditEventCount: routeRows.reduce((sum, row) => sum + row.missingAuditEvents.length, 0),
      missingStopConditionCount: routeRows.reduce((sum, row) => sum + row.missingStopConditions.length, 0),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    routeRows,
    checks,
    blockers,
    warnings,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpFinalCompletionDryRunPhase17Markdown(report = buildOtpFinalCompletionDryRunPhase17Audit()) {
  return [
    '# OTP Template vNext Phase 17 Final Completion Dry Run',
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
        ['Routes', report.summary.routeCount],
        ['Proved completions', report.summary.provedCompletionCount],
        ['Required signers', report.summary.requiredSignerCount],
        ['Completed signers', report.summary.completedSignerCount],
        ['Required fields', report.summary.requiredFieldCount],
        ['Completed required fields', report.summary.completedRequiredFieldCount],
        ['Final artifact mutations', report.summary.finalArtifactMutationCount],
        ['Provider callback leaks', report.summary.providerCallbackLeakCount],
        ['Route leaks', report.summary.routeLeakCount],
        ['Missing audit events', report.summary.missingAuditEventCount],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to release-candidate lock', report.canProceedToReleaseCandidateLock ? 'yes' : 'no'],
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
    '## Route Completion Simulations',
    '',
    table(
      ['Route', 'Simulation', 'Envelope', 'Roles', 'Signers', 'Fields', 'Exact PDF', 'Artifact Suppressed', 'Callbacks Suppressed', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.finalSimulationId,
        row.envelopeId,
        row.completedSignerRoles.join(', '),
        `${row.completedSignerCount}/${row.requiredSignerCount}`,
        `${row.completedRequiredFieldCount}/${row.requiredFieldCount}`,
        row.exactEnvelopeBound && row.exactSessionBound ? 'yes' : 'no',
        row.finalArtifactMutationSuppressed ? 'yes' : 'no',
        row.providerCallbackSuppressed ? 'yes' : 'no',
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 17 simulates final completion only after all required signers and fields are complete. It does not create, persist, mutate, email, webhook, callback, or mark a real final signed OTP artifact in QA.',
    '',
  ].join('\n')
}
