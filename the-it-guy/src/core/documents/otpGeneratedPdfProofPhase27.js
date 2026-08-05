import {
  OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS,
  buildOtpCommercialTermsRuntimePhase26Audit,
} from './otpCommercialTermsRuntimePhase26.js'
import { OTP_DOCUMENT_VARIANTS } from './otpRouteUniverse.js'

export const OTP_GENERATED_PDF_PROOF_PHASE27_VERSION = 'otp_generated_pdf_proof_phase27_v1'
export const OTP_GENERATED_PDF_PROOF_READY_STATUS = 'OTP_GENERATED_PDF_PROOF_READY_FOR_PHASE28_MATTER_ATTORNEY_QUOTE_PORTAL_FLOW'
export const OTP_GENERATED_PDF_PROOF_CONTRACT = 'otp-vnext-generated-pdf-proof-phase27-v1'

const REQUIRED_VISUAL_MARKERS = Object.freeze([
  'ARCH9',
  'Arch9 Property Group',
  'Arch9 Realty',
  'Page 1 of',
  'www.arch9.co.za',
])

const FORBIDDEN_SCAFFOLD_MARKERS = Object.freeze([
  'Logo top left',
  'Generated PDF proof',
  'Route marker',
  'Legal Wording Proof',
])

const ROUTE_EXPECTATIONS = Object.freeze({
  resale_existing_property: Object.freeze({
    label: 'Existing / resale property OTP',
    expected: Object.freeze([
      'Existing / resale property OTP',
      'OTP-P27-COMM-APPROVED',
      'Municipal rates and taxes',
      'Body corporate levy estimate',
      'Seller',
      'Section 30',
      'Witness 1',
      'Witness 2',
    ]),
    forbidden: Object.freeze([
      'Development levy estimate',
      'Utility connection charges',
      'Developer authorised signatory',
      'Contractor authorised signatory',
    ]),
  }),
  new_development: Object.freeze({
    label: 'New development OTP',
    expected: Object.freeze([
      'New development OTP',
      'Development levy estimate',
      'Utility connection charges',
      'Developer authorised signatory',
      'Contractor authorised signatory',
      'Section 30',
      'Witness 1',
      'Witness 2',
    ]),
    forbidden: Object.freeze([
      'Municipal rates and taxes',
      'Body corporate levy estimate',
      'seller_signature',
    ]),
  }),
})

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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function markerSet(text = '') {
  return normalizeText(text).toLowerCase()
}

function includesAll(text = '', markers = []) {
  const source = markerSet(text)
  return markers.every((marker) => source.includes(normalizeText(marker).toLowerCase()))
}

function includesNone(text = '', markers = []) {
  const source = markerSet(text)
  return markers.every((marker) => !source.includes(normalizeText(marker).toLowerCase()))
}

function findRouteFile(files = [], routeKey = '') {
  return list(files).find((file) => normalizeKey(file.routeVariant || file.route_variant) === normalizeKey(routeKey)) || null
}

function validPdfFile(file = {}) {
  return Boolean(
    file &&
      normalizeText(file.path).endsWith('.pdf') &&
      normalizeText(file.fileName).endsWith('.pdf') &&
      !/\.docx?\b/i.test(`${file.path} ${file.fileName}`) &&
      normalizeText(file.renderedMediaType) === 'application/pdf' &&
      Number(file.byteLength || 0) > 10000 &&
      Number(file.pageCount || 0) >= 4 &&
      normalizeText(file.renderedSha256).startsWith('sha256:') &&
      file.docxGenerated === false &&
      file.fallbackUsed === false &&
      file.nativePdfVerified === true
  )
}

function validVisualProof(file = {}) {
  const text = file.text || ''
  const pngLengths = list(file.renderedPagePngByteLengths)
  return Number(file.firstPagePngByteLength || 0) > 10000 &&
    normalizeText(file.firstPagePngPath).endsWith('.png') &&
    list(file.renderedPagePngPaths).length === Number(file.pageCount || 0) &&
    pngLengths.length === Number(file.pageCount || 0) &&
    pngLengths.every((length) => Number(length || 0) > 10000) &&
    includesAll(text, REQUIRED_VISUAL_MARKERS) &&
    includesNone(text, FORBIDDEN_SCAFFOLD_MARKERS) &&
    list(file.pageTextLengths).every((length) => Number(length || 0) > 20)
}

function routeProofPass(file = {}, routeKey = '') {
  const expectations = ROUTE_EXPECTATIONS[routeKey] || {}
  const text = file.text || ''
  return includesAll(text, expectations.expected || []) && includesNone(text, expectations.forbidden || [])
}

export function buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt = new Date().toISOString(),
  phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({ checkedAt }),
  renderEvidence = {},
} = {}) {
  const checks = []
  const files = list(renderEvidence.files)
  const routeRows = OTP_DOCUMENT_VARIANTS.map((variant) => {
    const file = findRouteFile(files, variant.key)
    return {
      routeKey: variant.key,
      label: variant.label,
      fileName: file?.fileName || '',
      path: file?.path || '',
      firstPagePngPath: file?.firstPagePngPath || '',
      renderedPagePngCount: list(file?.renderedPagePngPaths).length,
      pageCount: Number(file?.pageCount || 0),
      byteLength: Number(file?.byteLength || 0),
      renderedSha256: file?.renderedSha256 || '',
      validPdf: validPdfFile(file),
      visualProof: validVisualProof(file),
      routeProof: routeProofPass(file, variant.key),
    }
  })

  addCheck(
    checks,
    phase26Audit.status === OTP_COMMERCIAL_TERMS_RUNTIME_READY_STATUS,
    'PHASE27_PHASE26_RUNTIME_READY',
    'Generated PDF proof starts only after Phase 26 runtime data wiring is verified.',
  )
  addCheck(
    checks,
    routeRows.length === 2 && routeRows.every((row) => row.validPdf),
    'PHASE27_BOTH_ROUTE_PDFS_GENERATED',
    'Both resale and new-development PDFs are generated as native PDF files with no DOCX artifact path.',
  )
  addCheck(
    checks,
    routeRows.every((row) => row.visualProof),
    'PHASE27_BRANDED_SHELL_VISUALLY_PROVED',
    'Rendered PDF evidence includes logo top left, company details top right, footer placement, page numbers and nonblank rendered PNGs.',
  )
  addCheck(
    checks,
    routeRows.every((row) => row.routeProof),
    'PHASE27_ROUTE_COMMERCIAL_TERMS_AND_LEGAL_MARKERS_PROVED',
    'PDF text proves route-specific commercial terms, legal section range and no resale/new-development leakage.',
  )
  addCheck(
    checks,
    includesAll(findRouteFile(files, 'resale_existing_property')?.text, ['Signature field', 'Seller', 'purchaser_1 initials']) &&
      includesAll(findRouteFile(files, 'new_development')?.text, ['Signature field', 'Developer authorised signatory', 'contractor_authorised_signatory initials', 'agent initials']),
    'PHASE27_SIGNATURES_AND_INITIALS_RENDERED',
    'Generated PDFs render route-specific signature/date blocks and initials on every page.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_GENERATED_PDF_PROOF_PHASE27_VERSION,
    contract: OTP_GENERATED_PDF_PROOF_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_GENERATED_PDF_PROOF_REMEDIATION_REQUIRED' : OTP_GENERATED_PDF_PROOF_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 28,
      key: 'matter_attorney_quote_portal_flow',
      label: 'Matter Attorney Quote Portal Flow',
    }),
    summary: Object.freeze({
      routeCount: routeRows.length,
      pdfCount: routeRows.filter((row) => row.validPdf).length,
      renderedPngCount: routeRows.reduce((sum, row) => sum + Number(row.renderedPagePngCount || 0), 0),
      blockerCount: blockers.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    routeRows: Object.freeze(routeRows),
    evidence: Object.freeze({
      phase26: Object.freeze({
        version: phase26Audit.version,
        status: phase26Audit.status,
        blockerCount: phase26Audit.summary?.blockerCount ?? phase26Audit.blockers?.length ?? 0,
      }),
      files: Object.freeze(files.map((file) => ({
        routeVariant: file.routeVariant,
        fileName: file.fileName,
        path: file.path,
        firstPagePngPath: file.firstPagePngPath,
        renderedPagePngPaths: file.renderedPagePngPaths,
        pageCount: file.pageCount,
        byteLength: file.byteLength,
        renderedSha256: file.renderedSha256,
      }))),
    }),
  })
}

export function formatOtpGeneratedPdfProofPhase27Markdown(report = buildOtpGeneratedPdfProofPhase27Audit()) {
  return [
    '# OTP Generator Phase 27 Generated PDF Proof',
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
        ['PDFs', report.summary.pdfCount],
        ['Rendered PNG proofs', report.summary.renderedPngCount],
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
    '## Generated PDFs',
    '',
    table(
      ['Route', 'PDF', 'Pages', 'Bytes', 'PNG Proof', 'SHA-256'],
      report.routeRows.map((row) => [
        row.routeKey,
        row.path,
        row.pageCount,
        row.byteLength,
        row.firstPagePngPath,
        row.renderedSha256,
      ]),
    ),
    '',
    '## Runtime Boundary',
    '',
    'Phase 27 generates local PDF proof artifacts and rendered PNG evidence only. It does not publish templates, mutate transaction commission, dispatch signing envelopes, publish attorney quote documents, or activate production defaults. Phase 28 is the matter attorney quote portal flow.',
    '',
  ].join('\n')
}
