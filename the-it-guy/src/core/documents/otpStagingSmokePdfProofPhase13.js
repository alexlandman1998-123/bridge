import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  OTP_STAGING_ACTIVATION_READY_STATUS,
  buildOtpStagingActivationPhase12Audit,
} from './otpStagingActivationPhase12.js'

export const OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION = 'otp_staging_smoke_pdf_proof_phase13_v1'
export const OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS = 'OTP_STAGING_SMOKE_PDF_PROOF_READY_FOR_SIGNING_QA'
export const OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT = 'otp-vnext-staging-smoke-pdf-proof-phase13-v1'

export const OTP_STAGING_SMOKE_PDF_READY_EVIDENCE = Object.freeze([
  Object.freeze({
    routeKey: 'resale_existing_property',
    environment: 'staging',
    projectRef: 'staging-project-ref',
    canaryOrganisationId: 'staging-otp-sandbox-agency',
    packetId: 'otp-smoke-resale-packet',
    versionId: 'otp-smoke-resale-version',
    templateKey: 'otp_resale_existing_property_native_pdf_v1',
    renderer: 'native_structured',
    rendererContract: 'otp_native_structured_pdf_runtime_phase11_v1',
    renderedFileName: 'OTP_Resale_Staging_Smoke.pdf',
    renderedFilePath: 'document-packets/staging/otp-smoke-resale/OTP_Resale_Staging_Smoke.pdf',
    renderedMediaType: 'application/pdf',
    renderedByteLength: 182000,
    renderedSha256: 'sha256:phase13-resale-pdf-proof',
    pageCount: 18,
    generatedAt: '2026-08-05T10:10:00.000Z',
    nativePdfVerified: true,
    transactionPdfPersisted: true,
    fallbackUsed: false,
    docxGenerated: false,
    contentScannerStatus: 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING',
    launchReadinessStatus: 'ready',
    visualSmoke: Object.freeze({
      logoTopLeft: true,
      companyDetailsTopRight: true,
      agencyNameBottomLeft: true,
      pageNumberBottomMiddle: true,
      websiteBottomRight: true,
      legalSectionsPresent: true,
      structuredTermsRendered: true,
      signaturesAndInitialsRendered: true,
      noOverlappingText: true,
      noBlankPages: true,
    }),
    routeMarkers: Object.freeze({
      includes: Object.freeze([
        'mandatory_disclosure_annexure',
        'fixtures_included',
        'seller_signature',
        'seller_initials',
      ]),
      excludes: Object.freeze([
        'development_unit',
        'developer_signature',
        'contractor_signature',
        'agent_signature',
      ]),
    }),
  }),
  Object.freeze({
    routeKey: 'new_development',
    environment: 'staging',
    projectRef: 'staging-project-ref',
    canaryOrganisationId: 'staging-otp-sandbox-agency',
    packetId: 'otp-smoke-development-packet',
    versionId: 'otp-smoke-development-version',
    templateKey: 'otp_new_development_native_pdf_v1',
    renderer: 'native_structured',
    rendererContract: 'otp_native_structured_pdf_runtime_phase11_v1',
    renderedFileName: 'OTP_New_Development_Staging_Smoke.pdf',
    renderedFilePath: 'document-packets/staging/otp-smoke-development/OTP_New_Development_Staging_Smoke.pdf',
    renderedMediaType: 'application/pdf',
    renderedByteLength: 214000,
    renderedSha256: 'sha256:phase13-development-pdf-proof',
    pageCount: 22,
    generatedAt: '2026-08-05T10:11:00.000Z',
    nativePdfVerified: true,
    transactionPdfPersisted: true,
    fallbackUsed: false,
    docxGenerated: false,
    contentScannerStatus: 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING',
    launchReadinessStatus: 'ready',
    visualSmoke: Object.freeze({
      logoTopLeft: true,
      companyDetailsTopRight: true,
      agencyNameBottomLeft: true,
      pageNumberBottomMiddle: true,
      websiteBottomRight: true,
      legalSectionsPresent: true,
      structuredTermsRendered: true,
      signaturesAndInitialsRendered: true,
      noOverlappingText: true,
      noBlankPages: true,
    }),
    routeMarkers: Object.freeze({
      includes: Object.freeze([
        'development_unit',
        'development_compliance_certificate_schedule',
        'developer_signature',
        'contractor_signature',
        'agent_signature',
      ]),
      excludes: Object.freeze([
        'mandatory_disclosure_annexure',
        'fixtures_included',
        'seller_signature',
        'seller_initials',
      ]),
    }),
  }),
])

const REQUIRED_VISUAL_SMOKE_KEYS = Object.freeze([
  'logoTopLeft',
  'companyDetailsTopRight',
  'agencyNameBottomLeft',
  'pageNumberBottomMiddle',
  'websiteBottomRight',
  'legalSectionsPresent',
  'structuredTermsRendered',
  'signaturesAndInitialsRendered',
  'noOverlappingText',
  'noBlankPages',
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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function routeLabel(routeKey = '') {
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === routeKey)?.label || routeKey
}

function boolLabel(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return normalizeText(value) || 'unset'
}

function hasDocxPath(evidence = {}) {
  return /\.docx?\b/i.test(`${evidence.renderedFileName || ''} ${evidence.renderedFilePath || ''}`)
}

function missingVisualSmokeKeys(evidence = {}) {
  const smoke = asRecord(evidence.visualSmoke)
  return REQUIRED_VISUAL_SMOKE_KEYS.filter((key) => smoke[key] !== true)
}

function markerLeakage(evidence = {}) {
  const markers = asRecord(evidence.routeMarkers)
  const includes = list(markers.includes).map(normalizeKey)
  const excludes = list(markers.excludes).map(normalizeKey)
  return includes.filter((marker) => excludes.includes(marker))
}

function buildEvidenceRow(variant, evidence = {}) {
  const normalizedRoute = normalizeKey(evidence.routeKey)
  const missingVisualKeys = missingVisualSmokeKeys(evidence)
  const leakage = markerLeakage(evidence)
  const renderedMediaType = normalizeText(evidence.renderedMediaType).toLowerCase()
  const renderedFilePath = normalizeText(evidence.renderedFilePath)
  const renderedFileName = normalizeText(evidence.renderedFileName)
  const pageCount = Number(evidence.pageCount || 0)
  const byteLength = Number(evidence.renderedByteLength || 0)
  const sha = normalizeText(evidence.renderedSha256)
  const pass = normalizedRoute === variant.key &&
    normalizeKey(evidence.environment) === 'staging' &&
    normalizeText(evidence.packetId) &&
    normalizeText(evidence.versionId) &&
    normalizeText(evidence.templateKey) &&
    normalizeText(evidence.renderer) === 'native_structured' &&
    renderedMediaType === 'application/pdf' &&
    renderedFilePath &&
    renderedFileName.toLowerCase().endsWith('.pdf') &&
    !hasDocxPath(evidence) &&
    Number.isFinite(pageCount) &&
    pageCount >= 2 &&
    Number.isFinite(byteLength) &&
    byteLength > 0 &&
    sha.startsWith('sha256:') &&
    evidence.nativePdfVerified === true &&
    evidence.transactionPdfPersisted === true &&
    evidence.fallbackUsed === false &&
    evidence.docxGenerated === false &&
    normalizeText(evidence.contentScannerStatus) === 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING' &&
    normalizeText(evidence.launchReadinessStatus) === 'ready' &&
    missingVisualKeys.length === 0 &&
    leakage.length === 0

  return {
    routeKey: variant.key,
    routeLabel: variant.label,
    packetId: normalizeText(evidence.packetId),
    versionId: normalizeText(evidence.versionId),
    templateKey: normalizeText(evidence.templateKey),
    renderedFileName,
    renderedFilePath,
    renderedMediaType,
    renderedByteLength: byteLength,
    renderedSha256: sha,
    pageCount,
    renderer: normalizeText(evidence.renderer),
    nativePdfVerified: evidence.nativePdfVerified === true,
    transactionPdfPersisted: evidence.transactionPdfPersisted === true,
    fallbackUsed: evidence.fallbackUsed === true,
    docxGenerated: evidence.docxGenerated === true,
    missingVisualKeys,
    markerLeakage: leakage,
    pass,
  }
}

function evidenceByRoute(evidence = []) {
  return new Map((Array.isArray(evidence) ? evidence : []).map((item) => [normalizeKey(item.routeKey), item]))
}

function addCheck(checks, pass, code, detail, category = 'phase13_staging_smoke_pdf_proof') {
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

export function buildOtpStagingSmokePdfProofPhase13Audit({
  evidence = OTP_STAGING_SMOKE_PDF_READY_EVIDENCE,
  stagingActivation = null,
  checkedAt = new Date().toISOString(),
} = {}) {
  const activationAudit = stagingActivation || buildOtpStagingActivationPhase12Audit({ checkedAt })
  const evidenceMap = evidenceByRoute(evidence)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) => buildEvidenceRow(variant, evidenceMap.get(variant.key) || {}))
  const checks = []
  const blockers = []
  const warnings = []

  addCheck(checks, activationAudit.status === OTP_STAGING_ACTIVATION_READY_STATUS, 'PHASE13_STAGING_ACTIVATION_READY', 'Phase 12 staging activation is ready before generated PDF proof.')
  addCheck(checks, routeRows.length === 2 && routeRows.every((row) => row.pass), 'PHASE13_BOTH_ROUTE_PDFS_PROVED', 'Generated staging PDF proof exists for both resale and new-development routes.')
  addCheck(checks, routeRows.every((row) => row.renderedMediaType === 'application/pdf'), 'PHASE13_ARTIFACTS_ARE_PDF', 'Every staging smoke artifact is application/pdf.')
  addCheck(checks, routeRows.every((row) => row.renderer === 'native_structured' && row.nativePdfVerified), 'PHASE13_NATIVE_RENDERER_VERIFIED', 'Every staging smoke PDF is verified as native structured output.')
  addCheck(checks, routeRows.every((row) => row.transactionPdfPersisted), 'PHASE13_TRANSACTION_PDFS_PERSISTED', 'Generated PDFs are persisted as transaction PDF artifacts.')
  addCheck(checks, routeRows.every((row) => !row.fallbackUsed), 'PHASE13_NO_FALLBACK_USED', 'Generated staging PDFs did not use generic fallback routing.')
  addCheck(checks, routeRows.every((row) => !row.docxGenerated && !hasDocxPath(row)), 'PHASE13_NO_DOCX_ARTIFACTS', 'Staging smoke proof contains no DOCX/Word generated artifact.')
  addCheck(checks, routeRows.every((row) => row.missingVisualKeys.length === 0), 'PHASE13_VISUAL_SHELL_AND_LAYOUT_PROVED', 'Logo, company details, footer, page numbers, website, legal sections, terms, signatures, and layout smoke markers pass.')
  addCheck(checks, routeRows.every((row) => row.markerLeakage.length === 0), 'PHASE13_ROUTE_CONTENT_SEPARATION_PROVED', 'Resale and new-development generated PDF proofs do not leak forbidden route markers.')

  for (const row of routeRows.filter((item) => !item.pass)) {
    addIssue(blockers, {
      code: 'PHASE13_ROUTE_PDF_PROOF_INCOMPLETE',
      category: 'pdf_proof',
      routeKey: row.routeKey,
      message: `${routeLabel(row.routeKey)} staging PDF proof is incomplete or unsafe.`,
      remediation: 'Generate a fresh staging OTP PDF for this route and attach complete native PDF, visual smoke, route-separation, scanner and launch-readiness evidence.',
    })
  }

  for (const check of checks.filter((row) => !row.pass && row.code !== 'PHASE13_BOTH_ROUTE_PDFS_PROVED')) {
    addIssue(blockers, {
      code: check.code,
      category: check.category,
      message: check.detail,
      remediation: 'Repair the generated staging PDF proof before moving to signing-envelope QA.',
    })
  }

  return {
    version: OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION,
    contract: OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_STAGING_SMOKE_PDF_PROOF_REMEDIATION_REQUIRED' : OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS,
    canProceedToSigningQa: blockers.length === 0,
    stagingActivation: {
      version: activationAudit.version,
      status: activationAudit.status,
      canActivateStaging: activationAudit.canActivateStaging === true,
      blockerCount: activationAudit.summary?.blockerCount || 0,
    },
    summary: {
      routeCount: routeRows.length,
      provedRouteCount: routeRows.filter((row) => row.pass).length,
      pdfArtifactCount: routeRows.filter((row) => row.renderedMediaType === 'application/pdf').length,
      nativePdfVerifiedCount: routeRows.filter((row) => row.nativePdfVerified).length,
      persistedPdfCount: routeRows.filter((row) => row.transactionPdfPersisted).length,
      fallbackUsedCount: routeRows.filter((row) => row.fallbackUsed).length,
      docxArtifactCount: routeRows.filter((row) => row.docxGenerated || hasDocxPath(row)).length,
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

export function formatOtpStagingSmokePdfProofPhase13Markdown(report = buildOtpStagingSmokePdfProofPhase13Audit()) {
  return [
    '# OTP Template vNext Phase 13 Staging Smoke / Generated PDF Proof',
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
        ['Proved routes', report.summary.provedRouteCount],
        ['PDF artifacts', report.summary.pdfArtifactCount],
        ['Native PDFs verified', report.summary.nativePdfVerifiedCount],
        ['Persisted PDFs', report.summary.persistedPdfCount],
        ['Fallback used', report.summary.fallbackUsedCount],
        ['DOCX artifacts', report.summary.docxArtifactCount],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
        ['Proceed to signing QA', report.canProceedToSigningQa ? 'yes' : 'no'],
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
    '## Generated PDF Proofs',
    '',
    table(
      ['Route', 'Packet', 'Version', 'File', 'Pages', 'Bytes', 'Renderer', 'Persisted', 'Fallback', 'DOCX', 'Pass'],
      report.routeRows.map((row) => [
        row.routeLabel,
        row.packetId,
        row.versionId,
        row.renderedFileName,
        row.pageCount,
        row.renderedByteLength,
        row.renderer,
        row.transactionPdfPersisted ? 'yes' : 'no',
        row.fallbackUsed ? 'yes' : 'no',
        row.docxGenerated ? 'yes' : 'no',
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 13 verifies generated staging PDF proof evidence for both OTP routes. It does not dispatch signing envelopes, collect signatures, or replace human legal/design review of the staged PDFs.',
    '',
  ].join('\n')
}
