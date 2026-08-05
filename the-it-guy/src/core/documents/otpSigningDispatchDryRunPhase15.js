import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
  OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
  buildOtpSigningEnvelopeQaPhase14Audit,
} from './otpSigningEnvelopeQaPhase14.js'

export const OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION = 'otp_signing_dispatch_dry_run_phase15_v1'
export const OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS = 'OTP_SIGNING_DISPATCH_DRY_RUN_READY_FOR_SIGNER_SESSION_QA'
export const OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT = 'otp-vnext-signing-dispatch-dry-run-phase15-v1'

const REQUIRED_STOP_CONDITIONS = Object.freeze([
  'missing_recipient_mapping',
  'secure_link_not_ready',
  'provider_envelope_created',
  'email_delivery_attempted',
  'route_signer_leak_detected',
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

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
}

function signerTokenDigest(routeKey = '', role = '') {
  return `sha256:phase15-${normalizeKey(routeKey)}-${normalizeKey(role)}-secure-link-dry-run`
}

function buildDispatchEvidenceForEnvelope(envelope = {}) {
  const routeKey = normalizeKey(envelope.routeKey)
  const signers = Array.isArray(envelope.signers) ? envelope.signers : []
  const forbiddenRoles = list(envelope.forbiddenRoles).map(normalizeKey)
  return Object.freeze({
    routeKey,
    environment: normalizeText(envelope.environment),
    projectRef: normalizeText(envelope.projectRef),
    canaryOrganisationId: normalizeText(envelope.canaryOrganisationId),
    packetId: normalizeText(envelope.packetId),
    versionId: normalizeText(envelope.versionId),
    envelopeId: normalizeText(envelope.envelopeId),
    dryRunOnly: true,
    dispatchMode: 'dry_run_prepare_only',
    emailDeliverySuppressed: true,
    providerEnvelopeSuppressed: true,
    providerEnvelopeCreated: false,
    emailsSent: false,
    signerLinksPersisted: false,
    rollbackReference: 'otp-vnext-disable-staging-signing-dispatch',
    auditEventsPlanned: Object.freeze([
      'otp_signing_dispatch_dry_run_prepared',
      'otp_signer_secure_link_dry_run_prepared',
      'otp_signing_dispatch_dry_run_suppressed_delivery',
    ]),
    stopConditions: REQUIRED_STOP_CONDITIONS,
    recipients: Object.freeze(signers.map((signer) => Object.freeze({
      signerRole: normalizeKey(signer.signerRole),
      signerName: normalizeText(signer.signerName),
      signerEmail: normalizeText(signer.signerEmail),
      signingOrder: Number(signer.signingOrder || 0),
      routeKey,
      deliveryChannel: 'email',
      recipientMapped: true,
      secureLinkReady: true,
      tokenDigest: signerTokenDigest(routeKey, signer.signerRole),
      tokenExpiryMinutes: 120,
      emailSuppressed: true,
      providerEnvelopeSuppressed: true,
      forbiddenForRoute: forbiddenRoles.includes(normalizeKey(signer.signerRole)),
    }))),
  })
}

export const OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE = Object.freeze(
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map(buildDispatchEvidenceForEnvelope),
)

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function recipientEmailValid(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function buildRouteDryRunRow(variant, evidence = {}, envelopeQaRow = {}) {
  const recipients = Array.isArray(evidence.recipients) ? evidence.recipients : []
  const envelopeRoles = Array.isArray(envelopeQaRow.signerRoles) ? envelopeQaRow.signerRoles : []
  const recipientRoles = recipients.map((recipient) => normalizeKey(recipient.signerRole))
  const missingRecipientRoles = envelopeRoles.filter((role) => !recipientRoles.includes(role))
  const extraRecipientRoles = recipientRoles.filter((role) => !envelopeRoles.includes(role))
  const invalidRecipients = recipients.filter((recipient) =>
    recipient.recipientMapped !== true ||
    !recipientEmailValid(recipient.signerEmail) ||
    Number(recipient.signingOrder || 0) < 1,
  )
  const insecureLinks = recipients.filter((recipient) =>
    recipient.secureLinkReady !== true ||
    !normalizeText(recipient.tokenDigest).startsWith('sha256:') ||
    Number(recipient.tokenExpiryMinutes || 0) < 55 ||
    Number(recipient.tokenExpiryMinutes || 0) > 10080,
  )
  const routeLeaks = recipients.filter((recipient) => recipient.forbiddenForRoute === true)
  const unsuppressedDelivery = recipients.filter((recipient) =>
    recipient.emailSuppressed !== true ||
    recipient.providerEnvelopeSuppressed !== true,
  )
  const auditEvents = list(evidence.auditEventsPlanned).map(normalizeKey)
  const stopConditions = list(evidence.stopConditions).map(normalizeKey)
  const missingAuditEvents = [
    'otp_signing_dispatch_dry_run_prepared',
    'otp_signer_secure_link_dry_run_prepared',
    'otp_signing_dispatch_dry_run_suppressed_delivery',
  ].filter((event) => !auditEvents.includes(event))
  const missingStopConditions = REQUIRED_STOP_CONDITIONS.filter((condition) => !stopConditions.includes(condition))
  const exactEnvelopeBound = normalizeText(evidence.packetId) === normalizeText(envelopeQaRow.packetId) &&
    normalizeText(evidence.versionId) === normalizeText(envelopeQaRow.versionId) &&
    normalizeText(evidence.envelopeId) === normalizeText(envelopeQaRow.envelopeId)
  const pass = normalizeKey(evidence.routeKey) === variant.key &&
    normalizeKey(evidence.environment) === 'staging' &&
    exactEnvelopeBound &&
    evidence.dryRunOnly === true &&
    normalizeKey(evidence.dispatchMode) === 'dry_run_prepare_only' &&
    evidence.emailDeliverySuppressed === true &&
    evidence.providerEnvelopeSuppressed === true &&
    evidence.providerEnvelopeCreated === false &&
    evidence.emailsSent === false &&
    evidence.signerLinksPersisted === false &&
    Boolean(normalizeText(evidence.rollbackReference)) &&
    recipients.length === envelopeRoles.length &&
    missingRecipientRoles.length === 0 &&
    extraRecipientRoles.length === 0 &&
    invalidRecipients.length === 0 &&
    insecureLinks.length === 0 &&
    routeLeaks.length === 0 &&
    unsuppressedDelivery.length === 0 &&
    missingAuditEvents.length === 0 &&
    missingStopConditions.length === 0

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    packetId: normalizeText(evidence.packetId),
    versionId: normalizeText(evidence.versionId),
    envelopeId: normalizeText(evidence.envelopeId),
    recipientCount: recipients.length,
    recipientRoles: unique(recipientRoles),
    expectedRoles: envelopeRoles,
    missingRecipientRoles,
    extraRecipientRoles,
    invalidRecipientCount: invalidRecipients.length,
    insecureLinkCount: insecureLinks.length,
    routeLeakCount: routeLeaks.length,
    unsuppressedDeliveryCount: unsuppressedDelivery.length,
    missingAuditEvents,
    missingStopConditions,
    exactEnvelopeBound,
    rollbackReference: normalizeText(evidence.rollbackReference),
    deliverySuppressed: evidence.emailDeliverySuppressed === true &&
      evidence.providerEnvelopeSuppressed === true &&
      evidence.providerEnvelopeCreated === false &&
      evidence.emailsSent === false,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase15_signing_dispatch_dry_run') {
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

export function buildOtpSigningDispatchDryRunPhase15Audit({
  dispatchEvidence = OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE,
  envelopeQa = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const envelopeAudit = envelopeQa || buildOtpSigningEnvelopeQaPhase14Audit({ checkedAt })
  const dispatchMap = evidenceByRoute(dispatchEvidence)
  const envelopeMap = evidenceByRoute(envelopeAudit.routeRows || [])
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteDryRunRow(variant, dispatchMap.get(variant.key) || {}, envelopeMap.get(variant.key) || {}),
  )
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, envelopeAudit.status === OTP_SIGNING_ENVELOPE_QA_READY_STATUS, 'PHASE15_SIGNING_ENVELOPE_QA_READY', 'Phase 14 signing envelope QA is ready before dispatch dry-run.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE15_BOTH_ROUTE_DISPATCH_DRY_RUNS_PROVED', 'Dispatch dry-run is prepared and valid for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.exactEnvelopeBound), 'PHASE15_EXACT_ENVELOPE_BOUND', 'Each dry-run is bound to the exact prepared signing envelope.')
  addCheck(checks, routeRows.every((row) => row.missingRecipientRoles.length === 0 && row.extraRecipientRoles.length === 0 && row.invalidRecipientCount === 0), 'PHASE15_RECIPIENT_MAPPING_COMPLETE', 'Every signer has one valid route-scoped recipient mapping.')
  addCheck(checks, routeRows.every((row) => row.insecureLinkCount === 0), 'PHASE15_SECURE_LINKS_READY', 'Every recipient has secure-link readiness evidence without persisting live signer links.')
  addCheck(checks, routeRows.every((row) => row.deliverySuppressed), 'PHASE15_EMAIL_AND_PROVIDER_SUPPRESSED', 'Dry-run suppresses email delivery and provider envelope creation.')
  addCheck(checks, routeRows.every((row) => row.routeLeakCount === 0), 'PHASE15_ROUTE_RECIPIENTS_SEPARATE', 'Resale and new-development recipient mappings remain route-separated.')
  addCheck(checks, routeRows.every((row) => row.missingAuditEvents.length === 0), 'PHASE15_AUDIT_EVENTS_PLANNED', 'Dry-run plans dispatch, secure-link and suppressed-delivery audit events.')
  addCheck(checks, routeRows.every((row) => row.missingStopConditions.length === 0), 'PHASE15_STOP_CONDITIONS_BOUND', 'Dry-run binds stop conditions for recipient, link, provider, email, route-leak and rollback failures.')
  addCheck(checks, routeRows.every((row) => Boolean(row.rollbackReference)), 'PHASE15_ROLLBACK_REFERENCE_BOUND', 'Dry-run carries a rollback/disable reference for staging signing dispatch.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE15_ROUTE_DISPATCH_DRY_RUN_INCOMPLETE',
      category: 'signing_dispatch',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} signing dispatch dry-run is incomplete or unsafe.`,
      remediation: 'Repair recipient mappings, secure-link readiness, suppression flags, audit events, and stop conditions before signer-session QA.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE15_BOTH_ROUTE_DISPATCH_DRY_RUNS_PROVED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair signing dispatch dry-run evidence before moving to signer-session QA.',
    })
  }

  return {
    version: OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION,
    contract: OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_SIGNING_DISPATCH_DRY_RUN_REMEDIATION_REQUIRED' : OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
    canProceedToSignerSessionQa: blockers.length === 0,
    envelopeQa: {
      version: envelopeAudit.version,
      status: envelopeAudit.status,
      canProceedToDispatchDryRun: envelopeAudit.canProceedToDispatchDryRun === true,
      blockerCount: envelopeAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routeRows.length,
      provedDryRunCount: routeRows.filter((row) => row.pass).length,
      recipientCount: routeRows.reduce((sum, row) => sum + row.recipientCount, 0),
      insecureLinkCount: routeRows.reduce((sum, row) => sum + row.insecureLinkCount, 0),
      routeLeakCount: routeRows.reduce((sum, row) => sum + row.routeLeakCount, 0),
      unsuppressedDeliveryCount: routeRows.reduce((sum, row) => sum + row.unsuppressedDeliveryCount, 0),
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

export function formatOtpSigningDispatchDryRunPhase15Markdown(report = buildOtpSigningDispatchDryRunPhase15Audit()) {
  return [
    '# OTP Template vNext Phase 15 Signing Dispatch Dry Run',
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
        ['Proved dry-runs', report.summary.provedDryRunCount],
        ['Recipients', report.summary.recipientCount],
        ['Insecure links', report.summary.insecureLinkCount],
        ['Route leaks', report.summary.routeLeakCount],
        ['Unsuppressed deliveries', report.summary.unsuppressedDeliveryCount],
        ['Missing audit events', report.summary.missingAuditEventCount],
        ['Missing stop conditions', report.summary.missingStopConditionCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to signer-session QA', report.canProceedToSignerSessionQa ? 'yes' : 'no'],
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
    '## Route Dispatch Dry Runs',
    '',
    table(
      ['Route', 'Envelope', 'Recipients', 'Roles', 'Delivery Suppressed', 'Rollback', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.envelopeId,
        row.recipientCount,
        row.recipientRoles.join(', '),
        row.deliverySuppressed ? 'yes' : 'no',
        row.rollbackReference,
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 15 verifies signing dispatch dry-run readiness only. It does not create provider envelopes, persist signer links, email signers, or collect signatures.',
    '',
  ].join('\n')
}
