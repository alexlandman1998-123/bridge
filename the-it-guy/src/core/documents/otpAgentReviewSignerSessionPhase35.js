import {
  assertCanonicalSigningSession,
  buildCanonicalSigningSession,
} from './signingSessionContract.js'
import { buildOtpSignatureInitialsManifest } from './otpSignatureInitials.js'
import {
  OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT,
  OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION,
  OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS,
  buildOtpAgentReviewDispatchGuardDecision,
} from './otpAgentReviewDispatchGuardPhase34.js'
import {
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
  OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
} from './otpAgentReviewSigningEnvelopeAlignmentPhase33.js'

export const OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION = 'otp_agent_review_signer_session_phase35_v1'
export const OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS = 'OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION'
export const OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT = 'otp-vnext-agent-review-signer-session-phase35-v1'

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function fieldRole(field = {}) {
  return normalizeKey(field.signerRole || field.signer_role)
}

function fieldType(field = {}) {
  return normalizeKey(field.type || field.fieldType || field.field_type)
}

function fieldPage(field = {}) {
  const page = Number(field.pageNumber ?? field.page_number)
  return Number.isFinite(page) ? Math.max(1, Math.round(page)) : 1
}

function fieldId(role = '', type = '', page = 1) {
  return `${normalizeKey(role)}:${normalizeKey(type)}:page_${fieldPage({ pageNumber: page })}`
}

function buildFieldsForRole(routeVariant = 'resale_existing_property', signerRole = 'seller', pageCount = 3) {
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeVariant })
  const role = manifest.roles.find((item) => normalizeKey(item.role) === normalizeKey(signerRole)) || manifest.roles[0]
  if (!role) return []
  return [
    { id: fieldId(role.role, 'signature', pageCount), signerRole: role.role, type: 'signature', pageNumber: pageCount, required: true, status: 'pending' },
    { id: fieldId(role.role, 'date', pageCount), signerRole: role.role, type: 'date', pageNumber: pageCount, required: true, status: 'pending' },
    ...Array.from({ length: pageCount }, (_, index) => ({
      id: fieldId(role.role, 'initial', index + 1),
      signerRole: role.role,
      type: 'initial',
      pageNumber: index + 1,
      required: true,
      status: 'pending',
    })),
  ]
}

function buildSampleAlignment(routeVariant = 'resale_existing_property', checkedAt = new Date().toISOString()) {
  const signerRoles = routeVariant === 'new_development'
    ? ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']
    : ['purchaser_1', 'seller']
  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_PHASE33_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_CONTRACT,
    canPrepareSigningEnvelope: true,
    blockerCodes: Object.freeze([]),
    routeVariant,
    routeLabel: routeVariant === 'new_development' ? 'New development OTP' : 'Existing / resale property OTP',
    expectedSignerRoles: Object.freeze(signerRoles),
    signerRoles: Object.freeze(signerRoles),
    reviewRecordFingerprint: `phase35-review-${normalizeKey(routeVariant)}-${checkedAt}`,
    termsFingerprint: `phase35-terms-${normalizeKey(routeVariant)}-${checkedAt}`,
  })
}

export function buildOtpAgentReviewSignerSession({
  dispatchGuard = null,
  signerRole = '',
  signerStatus = 'sent',
  fields = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const role = normalizeKey(signerRole || dispatchGuard?.targetSignerRole)
  const routeVariant = normalizeKey(dispatchGuard?.routeVariant) || 'resale_existing_property'
  const pageCount = routeVariant === 'new_development' ? 4 : 3
  const scopedFields = Array.isArray(fields) ? fields : buildFieldsForRole(routeVariant, role, pageCount)
  const packetId = normalizeText(dispatchGuard?.packetId) || `otp-phase35-${routeVariant}-packet`
  const versionId = normalizeText(dispatchGuard?.packetVersionId) || `otp-phase35-${routeVariant}-version`
  const renderedSha256 = `sha256:phase35-${routeVariant}-${versionId}`
  return buildCanonicalSigningSession({
    sessionId: `otp-phase35-${routeVariant}-${role}-session`,
    document: {
      id: packetId,
      packetId,
      type: 'otp',
      title: 'Offer to Purchase',
      organisationId: 'otp-phase35-org',
    },
    version: {
      id: versionId,
      number: 1,
      status: 'generated',
      documentId: `doc-${versionId}`,
      fileName: `${versionId}.pdf`,
      pdfPath: `otp/${versionId}.pdf`,
      pdfUrl: `https://documents.example.test/${versionId}.pdf`,
      pdfSha256: renderedSha256,
    },
    signer: {
      id: `signer-${role}`,
      name: role.replace(/_/g, ' '),
      email: `${role}@phase35.test`,
      role,
      order: 1,
      status: signerStatus,
      expiresAt: checkedAt,
    },
    fields: scopedFields,
    session: {
      id: `otp-phase35-${routeVariant}-${role}-session`,
      status: signerStatus,
      expiresAt: checkedAt,
    },
    binding: {
      versionId,
      documentId: `doc-${versionId}`,
      pdfSha256: renderedSha256,
      bindingKey: `${packetId}:${versionId}:otp/${versionId}.pdf`,
      exactVersionBound: true,
      certified: true,
    },
    presentation: {
      previewHtml: '<main>Offer to Purchase</main>',
      sectionManifest: [{ key: 'otp', label: 'Offer to Purchase', required: true }],
    },
  })
}

export function buildOtpAgentReviewSignerSessionAlignment({
  dispatchGuard = null,
  signerSession = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  let canonical = null
  const canonicalIssues = []
  try {
    canonical = assertCanonicalSigningSession(signerSession || {})
  } catch (error) {
    canonical = buildCanonicalSigningSession(signerSession || {})
    canonicalIssues.push(...list(error?.issues), error?.code || 'invalid_canonical_signing_session')
  }

  const targetRole = normalizeKey(dispatchGuard?.targetSignerRole)
  const sessionRole = normalizeKey(canonical?.signer?.role)
  const allowedRoles = list(dispatchGuard?.allowedSignerRoles).map(normalizeKey)
  const fields = list(canonical?.fields)
  const otherSignerFields = fields.filter((field) => fieldRole(field) !== sessionRole)
  const requiredFields = fields.filter((field) => field.required !== false)
  const blockerCodes = [
    dispatchGuard ? '' : 'missing_phase34_dispatch_guard',
    dispatchGuard?.contract === OTP_AGENT_REVIEW_DISPATCH_GUARD_CONTRACT ? '' : 'phase34_guard_contract_mismatch',
    dispatchGuard?.version === OTP_AGENT_REVIEW_DISPATCH_GUARD_PHASE34_VERSION ? '' : 'phase34_guard_version_mismatch',
    dispatchGuard?.status === OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS ? '' : 'phase34_guard_status_not_ready',
    dispatchGuard?.canCreateSigningDispatch === true ? '' : 'phase34_guard_not_dispatchable',
    sessionRole ? '' : 'missing_session_signer_role',
    targetRole && sessionRole === targetRole ? '' : `session_signer_role_mismatch:${sessionRole || 'missing'}:${targetRole || 'missing'}`,
    allowedRoles.includes(sessionRole) ? '' : `session_role_not_allowed_for_route:${sessionRole || 'missing'}`,
    normalizeKey(canonical?.document?.type) === 'otp' ? '' : 'session_document_type_not_otp',
    normalizeText(canonical?.document?.packetId) === normalizeText(dispatchGuard?.packetId) ? '' : 'session_packet_binding_mismatch',
    normalizeText(canonical?.version?.id) === normalizeText(dispatchGuard?.packetVersionId) ? '' : 'session_version_binding_mismatch',
    canonical?.binding?.exactVersionBound === true ? '' : 'session_not_exact_version_bound',
    canonical?.binding?.certified === true ? '' : 'session_binding_not_certified',
    requiredFields.length ? '' : 'session_required_fields_missing',
    requiredFields.some((field) => fieldType(field) === 'signature') ? '' : 'session_signature_field_missing',
    requiredFields.some((field) => fieldType(field) === 'initial') ? '' : 'session_initial_fields_missing',
    otherSignerFields.length ? `other_signer_fields_visible:${otherSignerFields.map((field) => fieldRole(field)).join(',')}` : '',
    ...canonicalIssues.map((issue) => `canonical_session_issue:${normalizeKey(issue)}`),
  ].filter(Boolean)

  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT,
    checkedAt,
    canOpenRoleScopedSession: blockerCodes.length === 0,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    routeVariant: normalizeKey(dispatchGuard?.routeVariant),
    routeLabel: normalizeText(dispatchGuard?.routeLabel),
    packetId: normalizeText(canonical?.document?.packetId),
    packetVersionId: normalizeText(canonical?.version?.id),
    targetSignerRole: targetRole,
    sessionSignerRole: sessionRole,
    fieldCount: fields.length,
    requiredFieldCount: requiredFields.length,
    otherSignerFieldCount: otherSignerFields.length,
    exactVersionBound: canonical?.binding?.exactVersionBound === true,
    certifiedBinding: canonical?.binding?.certified === true,
    dispatchGuardReceiptFingerprint: normalizeText(dispatchGuard?.receiptFingerprint),
    reviewRecordFingerprint: normalizeText(dispatchGuard?.reviewRecordFingerprint),
    termsFingerprint: normalizeText(dispatchGuard?.termsFingerprint),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function sampleGuard(routeVariant = 'resale_existing_property', targetSignerRole = 'seller', checkedAt = new Date().toISOString()) {
  return buildOtpAgentReviewDispatchGuardDecision({
    alignment: buildSampleAlignment(routeVariant, checkedAt),
    targetSignerRole,
    packetId: `otp-phase35-${normalizeKey(routeVariant)}-packet`,
    packetVersionId: `otp-phase35-${normalizeKey(routeVariant)}-version`,
    checkedAt,
  })
}

export function buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt = new Date().toISOString(),
  phase34Audit = null,
  signerPortalSource = '',
  externalSigningApiSource = '',
  signingSessionContractSource = '',
  packageJson = {},
} = {}) {
  const checks = []
  const phase34Ready = !phase34Audit || phase34Audit.status === OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_STATUS
  const resaleGuard = sampleGuard('resale_existing_property', 'seller', checkedAt)
  const developmentGuard = sampleGuard('new_development', 'developer_authorised_signatory', checkedAt)
  const resaleSession = buildOtpAgentReviewSignerSession({ dispatchGuard: resaleGuard, checkedAt })
  const developmentSession = buildOtpAgentReviewSignerSession({ dispatchGuard: developmentGuard, checkedAt })
  const resaleAlignment = buildOtpAgentReviewSignerSessionAlignment({
    dispatchGuard: resaleGuard,
    signerSession: resaleSession,
    checkedAt,
  })
  const developmentAlignment = buildOtpAgentReviewSignerSessionAlignment({
    dispatchGuard: developmentGuard,
    signerSession: developmentSession,
    checkedAt,
  })
  const roleLeakAlignment = buildOtpAgentReviewSignerSessionAlignment({
    dispatchGuard: resaleGuard,
    signerSession: buildOtpAgentReviewSignerSession({
      dispatchGuard: resaleGuard,
      signerRole: 'developer_authorised_signatory',
      checkedAt,
    }),
    checkedAt,
  })
  const versionMismatchAlignment = buildOtpAgentReviewSignerSessionAlignment({
    dispatchGuard: resaleGuard,
    signerSession: {
      ...resaleSession,
      version: {
        ...resaleSession.version,
        id: 'wrong-version',
      },
      binding: {
        ...resaleSession.binding,
        versionId: 'wrong-version',
        bindingKey: 'wrong-version-binding',
      },
    },
    checkedAt,
  })
  const crossSignerFieldAlignment = buildOtpAgentReviewSignerSessionAlignment({
    dispatchGuard: resaleGuard,
    signerSession: buildOtpAgentReviewSignerSession({
      dispatchGuard: resaleGuard,
      fields: [
        ...buildFieldsForRole('resale_existing_property', 'seller', 3),
        ...buildFieldsForRole('resale_existing_property', 'purchaser_1', 3).slice(0, 1),
      ],
      checkedAt,
    }),
    checkedAt,
  })

  addCheck(checks, phase34Ready, 'PHASE35_PHASE34_DISPATCH_GUARD_READY', 'Signer-session alignment starts only after the Phase 34 dispatch guard is ready.')
  addCheck(
    checks,
    resaleAlignment.canOpenRoleScopedSession && developmentAlignment.canOpenRoleScopedSession,
    'PHASE35_BOTH_ROUTES_OPEN_ROLE_SCOPED_SESSIONS',
    'Resale and new-development guarded OTP dispatches open signer sessions scoped to their target signer role.',
  )
  addCheck(
    checks,
    [resaleAlignment, developmentAlignment].every((row) =>
      row.exactVersionBound &&
      row.certifiedBinding &&
      row.packetId &&
      row.packetVersionId,
    ),
    'PHASE35_EXACT_REVIEWED_VERSION_BOUND',
    'Each signer session is bound to the exact generated OTP packet version from the guarded dispatch.',
  )
  addCheck(
    checks,
    [resaleAlignment, developmentAlignment].every((row) =>
      row.otherSignerFieldCount === 0 && row.requiredFieldCount > 0 && row.fieldCount === row.requiredFieldCount,
    ),
    'PHASE35_ONLY_OWN_FIELDS_VISIBLE',
    'Signer sessions expose only the active signer role fields.',
  )
  addCheck(
    checks,
    roleLeakAlignment.canOpenRoleScopedSession === false &&
      roleLeakAlignment.blockerCodes.some((code) => code.includes('session_signer_role_mismatch')) &&
      roleLeakAlignment.blockerCodes.some((code) => code.includes('session_role_not_allowed_for_route')),
    'PHASE35_ROUTE_ROLE_LEAK_SESSION_BLOCKED',
    'A resale guarded dispatch cannot open as a new-development signer role.',
  )
  addCheck(
    checks,
    versionMismatchAlignment.canOpenRoleScopedSession === false &&
      versionMismatchAlignment.blockerCodes.includes('session_version_binding_mismatch'),
    'PHASE35_VERSION_MISMATCH_BLOCKED',
    'A signer session pointing at a different OTP version is blocked.',
  )
  addCheck(
    checks,
    crossSignerFieldAlignment.canOpenRoleScopedSession === false &&
      crossSignerFieldAlignment.blockerCodes.some((code) => code.startsWith('other_signer_fields_visible')),
    'PHASE35_CROSS_SIGNER_FIELD_VISIBILITY_BLOCKED',
    'A signer session carrying another signer role field is blocked.',
  )
  addCheck(
    checks,
    signerPortalSource.includes('resolveExternalSignerSession') &&
      signerPortalSource.includes('const fields = useMemo(() => (Array.isArray(session?.fields) ? session.fields : [])') &&
      signerPortalSource.includes('FIELD_SCOPE_DENIED') &&
      externalSigningApiSource.includes('assertCanonicalSigningSession') &&
      signingSessionContractSource.includes('exactVersionBound') &&
      signingSessionContractSource.includes('SIGNING_SESSION_CONTRACT'),
    'PHASE35_SIGNER_PORTAL_CONTRACT_WIRED',
    'SignerPortal consumes canonical signer sessions, scoped fields and field-scope denial handling.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-agent-review-signer-session-phase35'] === 'node scripts/otp-agent-review-signer-session-phase35.test.mjs' &&
      packageJson.scripts?.['report:otp-agent-review-signer-session-phase35'] === 'node scripts/report-otp-agent-review-signer-session-phase35.mjs',
    'PHASE35_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 35 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_AGENT_REVIEW_SIGNER_SESSION_PHASE35_VERSION,
    contract: OTP_AGENT_REVIEW_SIGNER_SESSION_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_AGENT_REVIEW_SIGNER_SESSION_REMEDIATION_REQUIRED' : OTP_AGENT_REVIEW_SIGNER_SESSION_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    sessionRows: Object.freeze([
      resaleAlignment,
      developmentAlignment,
      roleLeakAlignment,
      versionMismatchAlignment,
      crossSignerFieldAlignment,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      openedRouteCount: [resaleAlignment, developmentAlignment].filter((row) => row.canOpenRoleScopedSession).length,
      blockedUnsafeSessionCount: [roleLeakAlignment, versionMismatchAlignment, crossSignerFieldAlignment].filter((row) => !row.canOpenRoleScopedSession).length,
      visibleOtherSignerFieldCount: [resaleAlignment, developmentAlignment].reduce((sum, row) => sum + row.otherSignerFieldCount, 0),
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 36,
      key: 'otp_agent_review_completion_guard_runtime_alignment',
      label: 'OTP Agent Review Completion Guard Runtime Alignment',
    }),
  })
}

export function formatOtpAgentReviewSignerSessionPhase35Markdown(report = buildOtpAgentReviewSignerSessionPhase35Audit()) {
  return [
    '# OTP Generator Phase 35 Agent Review Signer Session Runtime Alignment',
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
        ['Aligned signer-session routes', report.summary.openedRouteCount],
        ['Unsafe signer sessions blocked', report.summary.blockedUnsafeSessionCount],
        ['Other signer fields visible in allowed sessions', report.summary.visibleOtherSignerFieldCount],
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
    '## Session Decisions',
    '',
    table(
      ['Route', 'Target Role', 'Session Role', 'Version', 'Fields', 'Other Fields', 'Allowed', 'Blockers'],
      report.sessionRows.map((row) => [
        row.routeLabel || row.routeVariant || 'unresolved',
        row.targetSignerRole || 'none',
        row.sessionSignerRole || 'none',
        row.packetVersionId || 'none',
        row.fieldCount,
        row.otherSignerFieldCount,
        row.canOpenRoleScopedSession ? 'yes' : 'no',
        row.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 35 proves signer-session alignment for guarded OTP dispatches. It does not apply signatures, complete fields, submit signer sessions, create final signed artifacts, email signers, or mutate production templates.',
    '',
  ].join('\n')
}
