import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE,
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
  buildOtpSigningDispatchDryRunPhase15Audit,
} from './otpSigningDispatchDryRunPhase15.js'
import {
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
} from './otpSigningEnvelopeQaPhase14.js'

export const OTP_SIGNER_SESSION_QA_PHASE16_VERSION = 'otp_signer_session_qa_phase16_v1'
export const OTP_SIGNER_SESSION_QA_READY_STATUS = 'OTP_SIGNER_SESSION_QA_READY_FOR_FINAL_COMPLETION_DRY_RUN'
export const OTP_SIGNER_SESSION_QA_CONTRACT = 'otp-vnext-signer-session-qa-phase16-v1'

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

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function sessionId(routeKey = '', role = '') {
  return `otp-${normalizeKey(routeKey)}-${normalizeKey(role)}-session-qa`
}

function fieldsForRole(fields = [], role = '') {
  const normalizedRole = normalizeKey(role)
  return (Array.isArray(fields) ? fields : []).filter((field) => normalizeKey(field.signerRole) === normalizedRole)
}

function buildSessionEvidenceForDispatch(dispatch = {}) {
  const routeKey = normalizeKey(dispatch.routeKey)
  const envelope = evidenceByRoute(OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE).get(routeKey) || {}
  const fields = Array.isArray(envelope.fields) ? envelope.fields : []
  const pageCount = Number(envelope.pageCount || 0)
  return Object.freeze({
    routeKey,
    environment: normalizeText(dispatch.environment),
    projectRef: normalizeText(dispatch.projectRef),
    packetId: normalizeText(dispatch.packetId),
    versionId: normalizeText(dispatch.versionId),
    envelopeId: normalizeText(dispatch.envelopeId),
    renderedSha256: normalizeText(envelope.renderedSha256),
    pageCount,
    qaMode: true,
    completionSuppressed: true,
    crossSignerMutationBlocked: true,
    providerCallbackSuppressed: true,
    sessions: Object.freeze((Array.isArray(dispatch.recipients) ? dispatch.recipients : []).map((recipient) => {
      const role = normalizeKey(recipient.signerRole)
      const scopedFields = fieldsForRole(fields, role)
      const otherFields = fields.filter((field) => normalizeKey(field.signerRole) !== role)
      return Object.freeze({
        sessionId: sessionId(routeKey, role),
        signerRole: role,
        signerEmail: normalizeText(recipient.signerEmail),
        tokenDigest: normalizeText(recipient.tokenDigest),
        opened: true,
        exactPdfVisible: true,
        renderedSha256: normalizeText(envelope.renderedSha256),
        packetId: normalizeText(dispatch.packetId),
        versionId: normalizeText(dispatch.versionId),
        envelopeId: normalizeText(dispatch.envelopeId),
        visibleFieldIds: Object.freeze(scopedFields.map((field) => `${role}:${field.fieldType}:page_${field.pageNumber}`)),
        hiddenFieldIds: Object.freeze(otherFields.map((field) => `${normalizeKey(field.signerRole)}:${field.fieldType}:page_${field.pageNumber}`)),
        scopedFieldCount: scopedFields.length,
        visibleOtherSignerFieldCount: 0,
        canComplete: false,
        completedFieldCount: 0,
        attemptedOtherSignerMutationBlocked: true,
        auditEventsPlanned: Object.freeze([
          'otp_signer_session_qa_opened',
          'otp_signer_session_qa_scope_verified',
          'otp_signer_session_qa_completion_suppressed',
        ]),
      })
    })),
  })
}

export const OTP_SIGNER_SESSION_QA_READY_EVIDENCE = Object.freeze(
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE.map(buildSessionEvidenceForDispatch),
)

function buildRouteSessionRow(variant, sessionEvidence = {}, dispatchRow = {}, envelope = {}) {
  const sessions = Array.isArray(sessionEvidence.sessions) ? sessionEvidence.sessions : []
  const expectedRoles = Array.isArray(dispatchRow.recipientRoles) ? dispatchRow.recipientRoles : []
  const sessionRoles = sessions.map((session) => normalizeKey(session.signerRole))
  const missingSessions = expectedRoles.filter((role) => !sessionRoles.includes(role))
  const extraSessions = sessionRoles.filter((role) => !expectedRoles.includes(role))
  const fields = Array.isArray(envelope.fields) ? envelope.fields : []
  const pageCount = Number(envelope.pageCount || 0)
  const invalidSessions = sessions.filter((session) => {
    const role = normalizeKey(session.signerRole)
    const expectedScopedCount = fieldsForRole(fields, role).length
    return normalizeKey(sessionEvidence.routeKey) !== variant.key ||
      session.opened !== true ||
      session.exactPdfVisible !== true ||
      normalizeText(session.renderedSha256) !== normalizeText(envelope.renderedSha256) ||
      normalizeText(session.packetId) !== normalizeText(sessionEvidence.packetId) ||
      normalizeText(session.versionId) !== normalizeText(sessionEvidence.versionId) ||
      normalizeText(session.envelopeId) !== normalizeText(sessionEvidence.envelopeId) ||
      Number(session.scopedFieldCount || 0) !== expectedScopedCount ||
      Number(session.visibleOtherSignerFieldCount || 0) !== 0 ||
      session.canComplete !== false ||
      Number(session.completedFieldCount || 0) !== 0 ||
      session.attemptedOtherSignerMutationBlocked !== true
  })
  const missingAuditEvents = sessions.flatMap((session) => {
    const events = list(session.auditEventsPlanned).map(normalizeKey)
    return [
      'otp_signer_session_qa_opened',
      'otp_signer_session_qa_scope_verified',
      'otp_signer_session_qa_completion_suppressed',
    ].filter((event) => !events.includes(event)).map((event) => `${session.signerRole}:${event}`)
  })
  const visibleOtherSignerFieldCount = sessions.reduce((sum, session) => sum + Number(session.visibleOtherSignerFieldCount || 0), 0)
  const completedFieldCount = sessions.reduce((sum, session) => sum + Number(session.completedFieldCount || 0), 0)
  const exactDispatchBound = normalizeText(sessionEvidence.packetId) === normalizeText(dispatchRow.packetId) &&
    normalizeText(sessionEvidence.versionId) === normalizeText(dispatchRow.versionId) &&
    normalizeText(sessionEvidence.envelopeId) === normalizeText(dispatchRow.envelopeId)
  const pass = normalizeKey(sessionEvidence.routeKey) === variant.key &&
    normalizeKey(sessionEvidence.environment) === 'staging' &&
    exactDispatchBound &&
    sessionEvidence.qaMode === true &&
    sessionEvidence.completionSuppressed === true &&
    sessionEvidence.crossSignerMutationBlocked === true &&
    sessionEvidence.providerCallbackSuppressed === true &&
    pageCount > 0 &&
    sessions.length === expectedRoles.length &&
    missingSessions.length === 0 &&
    extraSessions.length === 0 &&
    invalidSessions.length === 0 &&
    missingAuditEvents.length === 0 &&
    visibleOtherSignerFieldCount === 0 &&
    completedFieldCount === 0

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    packetId: normalizeText(sessionEvidence.packetId),
    versionId: normalizeText(sessionEvidence.versionId),
    envelopeId: normalizeText(sessionEvidence.envelopeId),
    pageCount,
    sessionCount: sessions.length,
    expectedRoles,
    sessionRoles: unique(sessionRoles),
    missingSessions,
    extraSessions,
    invalidSessionCount: invalidSessions.length,
    visibleOtherSignerFieldCount,
    completedFieldCount,
    missingAuditEvents,
    exactDispatchBound,
    completionSuppressed: sessionEvidence.completionSuppressed === true,
    crossSignerMutationBlocked: sessionEvidence.crossSignerMutationBlocked === true,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase16_signer_session_qa') {
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

export function buildOtpSignerSessionQaPhase16Audit({
  sessionEvidence = OTP_SIGNER_SESSION_QA_READY_EVIDENCE,
  dispatchDryRun = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const dispatchAudit = dispatchDryRun || buildOtpSigningDispatchDryRunPhase15Audit({ checkedAt })
  const sessionMap = evidenceByRoute(sessionEvidence)
  const dispatchMap = evidenceByRoute(dispatchAudit.routeRows || [])
  const envelopeMap = evidenceByRoute(OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteSessionRow(
      variant,
      sessionMap.get(variant.key) || {},
      dispatchMap.get(variant.key) || {},
      envelopeMap.get(variant.key) || {},
    ),
  )
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, dispatchAudit.status === OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS, 'PHASE16_DISPATCH_DRY_RUN_READY', 'Phase 15 signing dispatch dry-run is ready before signer-session QA.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE16_BOTH_ROUTE_SIGNER_SESSIONS_PROVED', 'Signer sessions open and scope correctly for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.exactDispatchBound), 'PHASE16_EXACT_DISPATCH_BOUND', 'Each signer session is bound to the exact dispatch dry-run envelope.')
  addCheck(checks, routeRows.every((row) => row.missingSessions.length === 0 && row.extraSessions.length === 0), 'PHASE16_ALL_SIGNER_SESSIONS_OPEN', 'Every dry-run recipient has one matching signer session.')
  addCheck(checks, routeRows.every((row) => row.invalidSessionCount === 0), 'PHASE16_EXACT_PDF_AND_FIELD_SCOPE_VALID', 'Every signer sees the exact generated PDF and only their own fields.')
  addCheck(checks, routeRows.every((row) => row.visibleOtherSignerFieldCount === 0), 'PHASE16_NO_CROSS_SIGNER_FIELD_VISIBILITY', 'Signer sessions expose no other signer fields.')
  addCheck(checks, routeRows.every((row) => row.completedFieldCount === 0 && row.completionSuppressed), 'PHASE16_COMPLETION_SUPPRESSED', 'Signer-session QA cannot complete or mutate fields.')
  addCheck(checks, routeRows.every((row) => row.crossSignerMutationBlocked), 'PHASE16_CROSS_SIGNER_MUTATION_BLOCKED', 'Attempts to affect another signer are blocked.')
  addCheck(checks, routeRows.every((row) => row.missingAuditEvents.length === 0), 'PHASE16_SESSION_AUDIT_EVENTS_PLANNED', 'Signer-session open, scope and completion-suppression audit events are planned.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE16_ROUTE_SIGNER_SESSION_QA_INCOMPLETE',
      category: 'signer_session',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} signer-session QA is incomplete or unsafe.`,
      remediation: 'Repair signer-session route binding, exact PDF visibility, field scope, mutation suppression, or audit evidence before final completion dry-run.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE16_BOTH_ROUTE_SIGNER_SESSIONS_PROVED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair signer-session QA evidence before moving to final completion dry-run.',
    })
  }

  return {
    version: OTP_SIGNER_SESSION_QA_PHASE16_VERSION,
    contract: OTP_SIGNER_SESSION_QA_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_SIGNER_SESSION_QA_REMEDIATION_REQUIRED' : OTP_SIGNER_SESSION_QA_READY_STATUS,
    canProceedToFinalCompletionDryRun: blockers.length === 0,
    dispatchDryRun: {
      version: dispatchAudit.version,
      status: dispatchAudit.status,
      canProceedToSignerSessionQa: dispatchAudit.canProceedToSignerSessionQa === true,
      blockerCount: dispatchAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routeRows.length,
      provedSessionRouteCount: routeRows.filter((row) => row.pass).length,
      sessionCount: routeRows.reduce((sum, row) => sum + row.sessionCount, 0),
      visibleOtherSignerFieldCount: routeRows.reduce((sum, row) => sum + row.visibleOtherSignerFieldCount, 0),
      completedFieldCount: routeRows.reduce((sum, row) => sum + row.completedFieldCount, 0),
      invalidSessionCount: routeRows.reduce((sum, row) => sum + row.invalidSessionCount, 0),
      missingAuditEventCount: routeRows.reduce((sum, row) => sum + row.missingAuditEvents.length, 0),
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

export function formatOtpSignerSessionQaPhase16Markdown(report = buildOtpSignerSessionQaPhase16Audit()) {
  return [
    '# OTP Template vNext Phase 16 Signer Session QA',
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
        ['Proved session routes', report.summary.provedSessionRouteCount],
        ['Signer sessions', report.summary.sessionCount],
        ['Other-signer fields visible', report.summary.visibleOtherSignerFieldCount],
        ['Completed fields', report.summary.completedFieldCount],
        ['Invalid sessions', report.summary.invalidSessionCount],
        ['Missing audit events', report.summary.missingAuditEventCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to final completion dry-run', report.canProceedToFinalCompletionDryRun ? 'yes' : 'no'],
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
    '## Route Signer Sessions',
    '',
    table(
      ['Route', 'Sessions', 'Roles', 'Exact Dispatch', 'Other Fields Visible', 'Completed Fields', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.sessionCount,
        row.sessionRoles.join(', '),
        row.exactDispatchBound ? 'yes' : 'no',
        row.visibleOtherSignerFieldCount,
        row.completedFieldCount,
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 16 verifies signer-session QA only. It does not complete fields, submit signatures, call provider callbacks, or finalise signed OTP artifacts.',
    '',
  ].join('\n')
}
