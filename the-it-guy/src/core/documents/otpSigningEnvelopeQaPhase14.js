import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  buildOtpSignatureInitialsManifest,
} from './otpSignatureInitials.js'
import {
  OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS,
  OTP_STAGING_SMOKE_PDF_READY_EVIDENCE,
  buildOtpStagingSmokePdfProofPhase13Audit,
} from './otpStagingSmokePdfProofPhase13.js'

export const OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION = 'otp_signing_envelope_qa_phase14_v1'
export const OTP_SIGNING_ENVELOPE_QA_READY_STATUS = 'OTP_SIGNING_ENVELOPE_QA_READY_FOR_SIGNING_DISPATCH_DRY_RUN'
export const OTP_SIGNING_ENVELOPE_QA_CONTRACT = 'otp-vnext-signing-envelope-qa-phase14-v1'

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

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
}

function pdfEvidenceByRoute(evidence = OTP_STAGING_SMOKE_PDF_READY_EVIDENCE) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function signerEmail(role = '') {
  return `${normalizeKey(role).replace(/_/g, '.')}@staging-signing.example.test`
}

function buildEnvelopeFields({ roles = [], pageCount = 1, packetId = '', versionId = '', organisationId = '' } = {}) {
  const fields = []
  roles.forEach((role, roleIndex) => {
    const x = 72 + roleIndex * 18
    const signaturePage = Math.max(1, Number(pageCount) || 1)
    fields.push({
      packetId,
      packetVersionId: versionId,
      organisationId,
      signerRole: role.role,
      signerEmail: signerEmail(role.role),
      fieldType: 'signature',
      placeholderKey: role.signatureKey,
      pageNumber: signaturePage,
      xPosition: x,
      yPosition: 160 + roleIndex * 34,
      width: 168,
      height: 42,
      required: true,
    })
    fields.push({
      packetId,
      packetVersionId: versionId,
      organisationId,
      signerRole: role.role,
      signerEmail: signerEmail(role.role),
      fieldType: 'date',
      placeholderKey: 'signed_date',
      pageNumber: signaturePage,
      xPosition: x + 186,
      yPosition: 160 + roleIndex * 34,
      width: 96,
      height: 22,
      required: true,
    })
    for (let pageNumber = 1; pageNumber <= Number(pageCount || 1); pageNumber += 1) {
      fields.push({
        packetId,
        packetVersionId: versionId,
        organisationId,
        signerRole: role.role,
        signerEmail: signerEmail(role.role),
        fieldType: 'initial',
        placeholderKey: role.initialsKey,
        pageNumber,
        xPosition: 48 + roleIndex * 52,
        yPosition: 38,
        width: 36,
        height: 18,
        required: true,
        repeat: 'every_page',
      })
    }
  })
  return fields
}

function buildEnvelopeEvidenceForRoute(pdfEvidence = {}) {
  const routeKey = normalizeKey(pdfEvidence.routeKey)
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeKey })
  const organisationId = normalizeText(pdfEvidence.canaryOrganisationId)
  const packetId = normalizeText(pdfEvidence.packetId)
  const versionId = normalizeText(pdfEvidence.versionId)
  const pageCount = numberValue(pdfEvidence.pageCount)
  const signers = manifest.roles.map((role) => ({
    packetId,
    packetVersionId: versionId,
    organisationId,
    signerRole: role.role,
    signerName: role.label,
    signerEmail: signerEmail(role.role),
    signingOrder: role.order,
    status: 'pending',
    required: role.required,
  }))

  return Object.freeze({
    routeKey,
    environment: normalizeText(pdfEvidence.environment),
    projectRef: normalizeText(pdfEvidence.projectRef),
    canaryOrganisationId: organisationId,
    packetId,
    versionId,
    renderedSha256: normalizeText(pdfEvidence.renderedSha256),
    pageCount,
    envelopeId: `${packetId}-envelope`,
    envelopeStatus: 'prepared',
    dispatchStatus: 'not_dispatched',
    exactVersionBound: true,
    signerLinksCreated: false,
    providerEnvelopeCreated: false,
    fieldLayoutSource: 'native_pdf_signature_layout',
    initialsPolicy: 'every_page',
    datePolicy: 'per_signer_signature_date',
    signers: Object.freeze(signers),
    fields: Object.freeze(buildEnvelopeFields({
      roles: manifest.roles,
      pageCount,
      packetId,
      versionId,
      organisationId,
    })),
    forbiddenRoles: Object.freeze(routeKey === 'new_development'
      ? ['seller']
      : ['developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']),
  })
}

export const OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE = Object.freeze(
  OTP_STAGING_SMOKE_PDF_READY_EVIDENCE.map(buildEnvelopeEvidenceForRoute),
)

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((row) => [normalizeKey(row.routeKey), row]))
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function fieldGeometryValid(field = {}) {
  return ['pageNumber', 'xPosition', 'yPosition', 'width', 'height'].every((key) => {
    const value = numberValue(field[key])
    return key === 'pageNumber'
      ? Number.isInteger(value) && value >= 1
      : value > 0
  })
}

function buildRouteQaRow(variant, evidence = {}, pdfEvidence = {}) {
  const routeKey = variant.key
  const manifest = buildOtpSignatureInitialsManifest({ variant: routeKey })
  const signers = Array.isArray(evidence.signers) ? evidence.signers : []
  const fields = Array.isArray(evidence.fields) ? evidence.fields : []
  const signerRoles = unique(signers.map((signer) => normalizeKey(signer.signerRole)))
  const expectedRoles = manifest.roles.map((role) => role.role)
  const missingSignerRoles = expectedRoles.filter((role) => !signerRoles.includes(role))
  const forbiddenRolesPresent = list(evidence.forbiddenRoles).filter((role) => signerRoles.includes(normalizeKey(role)))
  const pageCount = numberValue(evidence.pageCount || pdfEvidence.pageCount)
  const exactVersionBound = evidence.exactVersionBound === true &&
    normalizeText(evidence.packetId) === normalizeText(pdfEvidence.packetId) &&
    normalizeText(evidence.versionId) === normalizeText(pdfEvidence.versionId) &&
    normalizeText(evidence.renderedSha256) === normalizeText(pdfEvidence.renderedSha256)
  const missingSignatureRoles = expectedRoles.filter((role) => !fields.some((field) =>
    normalizeKey(field.signerRole) === role &&
    normalizeKey(field.fieldType) === 'signature' &&
    field.required === true &&
    normalizeText(field.packetVersionId) === normalizeText(evidence.versionId) &&
    fieldGeometryValid(field),
  ))
  const missingDateRoles = expectedRoles.filter((role) => !fields.some((field) =>
    normalizeKey(field.signerRole) === role &&
    normalizeKey(field.fieldType) === 'date' &&
    field.required === true &&
    normalizeText(field.packetVersionId) === normalizeText(evidence.versionId) &&
    fieldGeometryValid(field),
  ))
  const initialsGaps = []
  for (const role of expectedRoles) {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const found = fields.some((field) =>
        normalizeKey(field.signerRole) === role &&
        normalizeKey(field.fieldType) === 'initial' &&
        numberValue(field.pageNumber) === pageNumber &&
        normalizeText(field.packetVersionId) === normalizeText(evidence.versionId) &&
        fieldGeometryValid(field),
      )
      if (!found) initialsGaps.push(`${role}:page_${pageNumber}`)
    }
  }
  const invalidGeometryCount = fields.filter((field) => !fieldGeometryValid(field)).length
  const fieldRoleLeaks = fields
    .map((field) => normalizeKey(field.signerRole))
    .filter((role) => list(evidence.forbiddenRoles).map(normalizeKey).includes(role))
  const expectedFieldCount = expectedRoles.length * (pageCount + 2)
  const pass = normalizeKey(evidence.routeKey) === routeKey &&
    normalizeKey(evidence.environment) === 'staging' &&
    normalizeText(evidence.envelopeId) &&
    normalizeKey(evidence.envelopeStatus) === 'prepared' &&
    normalizeKey(evidence.dispatchStatus) === 'not_dispatched' &&
    evidence.signerLinksCreated === false &&
    evidence.providerEnvelopeCreated === false &&
    normalizeKey(evidence.fieldLayoutSource) === 'native_pdf_signature_layout' &&
    normalizeKey(evidence.initialsPolicy) === 'every_page' &&
    normalizeKey(evidence.datePolicy) === 'per_signer_signature_date' &&
    exactVersionBound &&
    missingSignerRoles.length === 0 &&
    forbiddenRolesPresent.length === 0 &&
    missingSignatureRoles.length === 0 &&
    missingDateRoles.length === 0 &&
    initialsGaps.length === 0 &&
    invalidGeometryCount === 0 &&
    fieldRoleLeaks.length === 0 &&
    fields.length >= expectedFieldCount

  return {
    routeKey,
    routeLabel: variant.label,
    envelopeId: normalizeText(evidence.envelopeId),
    packetId: normalizeText(evidence.packetId),
    versionId: normalizeText(evidence.versionId),
    pageCount,
    signerCount: signers.length,
    fieldCount: fields.length,
    expectedSignerRoles: expectedRoles,
    signerRoles,
    missingSignerRoles,
    forbiddenRolesPresent,
    missingSignatureRoles,
    missingDateRoles,
    initialsGaps,
    invalidGeometryCount,
    fieldRoleLeaks: unique(fieldRoleLeaks),
    exactVersionBound,
    notDispatched: normalizeKey(evidence.dispatchStatus) === 'not_dispatched' &&
      evidence.signerLinksCreated === false &&
      evidence.providerEnvelopeCreated === false,
    pass,
  }
}

function addCheck(checks, pass, code, detail, category = 'phase14_signing_envelope_qa') {
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

export function buildOtpSigningEnvelopeQaPhase14Audit({
  envelopeEvidence = OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
  pdfProof = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const pdfAudit = pdfProof || buildOtpStagingSmokePdfProofPhase13Audit({ checkedAt })
  const envelopeMap = evidenceByRoute(envelopeEvidence)
  const pdfMap = pdfEvidenceByRoute(OTP_STAGING_SMOKE_PDF_READY_EVIDENCE)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) =>
    buildRouteQaRow(variant, envelopeMap.get(variant.key) || {}, pdfMap.get(variant.key) || {}),
  )
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, pdfAudit.status === OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS, 'PHASE14_PDF_PROOF_READY', 'Phase 13 generated PDF proof is ready before signing envelope QA.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE14_BOTH_ROUTE_ENVELOPES_PROVED', 'Signing envelopes are prepared and valid for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.exactVersionBound), 'PHASE14_EXACT_GENERATED_VERSION_BOUND', 'Each envelope is bound to the exact generated PDF packet version and SHA.')
  addCheck(checks, routeRows.every((row) => row.missingSignerRoles.length === 0), 'PHASE14_REQUIRED_SIGNERS_PRESENT', 'Every route has all required signer roles.')
  addCheck(checks, routeRows.every((row) => row.missingSignatureRoles.length === 0), 'PHASE14_SIGNATURE_FIELDS_PRESENT', 'Every signer has a required signature field.')
  addCheck(checks, routeRows.every((row) => row.missingDateRoles.length === 0), 'PHASE14_DATE_FIELDS_PRESENT', 'Every signer has a required signing date field.')
  addCheck(checks, routeRows.every((row) => row.initialsGaps.length === 0), 'PHASE14_INITIALS_ON_EVERY_PAGE', 'Every signer has initials on every generated PDF page.')
  addCheck(checks, routeRows.every((row) => row.invalidGeometryCount === 0), 'PHASE14_FIELD_GEOMETRY_VALID', 'Every signing field has valid page and coordinate geometry.')
  addCheck(checks, routeRows.every((row) => row.forbiddenRolesPresent.length === 0 && row.fieldRoleLeaks.length === 0), 'PHASE14_ROUTE_SIGNING_ROLES_SEPARATE', 'Resale and new-development signing roles remain route-separated.')
  addCheck(checks, routeRows.every((row) => row.notDispatched), 'PHASE14_ENVELOPES_NOT_DISPATCHED', 'QA verifies prepared envelopes without sending signer links or provider envelopes.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE14_ROUTE_SIGNING_ENVELOPE_INCOMPLETE',
      category: 'signing_envelope',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} signing envelope QA is incomplete or unsafe.`,
      remediation: 'Rebuild the signing envelope from the generated PDF version and rerun QA before dispatch dry-run.',
    })
  }
  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE14_BOTH_ROUTE_ENVELOPES_PROVED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair signing envelope evidence before moving to dispatch dry-run.',
    })
  }

  return {
    version: OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION,
    contract: OTP_SIGNING_ENVELOPE_QA_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_SIGNING_ENVELOPE_QA_REMEDIATION_REQUIRED' : OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
    canProceedToDispatchDryRun: blockers.length === 0,
    pdfProof: {
      version: pdfAudit.version,
      status: pdfAudit.status,
      canProceedToSigningQa: pdfAudit.canProceedToSigningQa === true,
      blockerCount: pdfAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routeRows.length,
      provedEnvelopeCount: routeRows.filter((row) => row.pass).length,
      signerCount: routeRows.reduce((sum, row) => sum + row.signerCount, 0),
      fieldCount: routeRows.reduce((sum, row) => sum + row.fieldCount, 0),
      initialsGapCount: routeRows.reduce((sum, row) => sum + row.initialsGaps.length, 0),
      routeLeakCount: routeRows.reduce((sum, row) => sum + row.forbiddenRolesPresent.length + row.fieldRoleLeaks.length, 0),
      dispatchedEnvelopeCount: routeRows.filter((row) => !row.notDispatched).length,
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

export function formatOtpSigningEnvelopeQaPhase14Markdown(report = buildOtpSigningEnvelopeQaPhase14Audit()) {
  return [
    '# OTP Template vNext Phase 14 Signing Envelope QA',
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
        ['Proved envelopes', report.summary.provedEnvelopeCount],
        ['Signers', report.summary.signerCount],
        ['Signing fields', report.summary.fieldCount],
        ['Initials gaps', report.summary.initialsGapCount],
        ['Route leaks', report.summary.routeLeakCount],
        ['Dispatched envelopes', report.summary.dispatchedEnvelopeCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to dispatch dry-run', report.canProceedToDispatchDryRun ? 'yes' : 'no'],
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
    '## Route Envelopes',
    '',
    table(
      ['Route', 'Envelope', 'Packet', 'Version', 'Pages', 'Signers', 'Fields', 'Roles', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.envelopeId,
        row.packetId,
        row.versionId,
        row.pageCount,
        row.signerCount,
        row.fieldCount,
        row.signerRoles.join(', '),
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 14 verifies prepared signing envelopes against generated staging PDFs. It does not dispatch signing links, create provider envelopes, collect signatures, or certify final signed document completion.',
    '',
  ].join('\n')
}
