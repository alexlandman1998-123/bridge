import {
  validateTemplateTokensAgainstRegistry,
} from './mergeFieldRegistry.js'
import {
  listOtpLegalContentTemplateSections,
} from './otpLegalContentTemplates.js'
import {
  buildOtpSignatureInitialsManifest,
} from './otpSignatureInitials.js'
import {
  buildOtpStructuredTermsManifest,
} from './otpStructuredTerms.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'
import {
  buildOtpBrandedShellManifest,
} from './otpTemplateBrandedShell.js'
import {
  scanOtpContentSections,
} from './otpContentScanner.js'

export const OTP_CONTENT_SCANNER_PHASE9_VERSION = 'otp_content_scanner_phase9_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function extractTextTokens(value = '') {
  return [...String(value || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)]
    .map((match) => normalizeKey(match[1]))
    .filter(Boolean)
}

function sectionTokens(sections = []) {
  return unique(sections.flatMap((section) => [
    ...(section.placeholder_keys || []),
    ...extractTextTokens(section.legal_text),
  ].map(normalizeKey)))
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

function buildShellSurfaceSections(shellManifest = {}) {
  return (shellManifest.slots || []).map((slot) => ({
    section_key: `shell_${slot.key}`,
    section_label: slot.label,
    section_type: slot.slotType,
    placeholder_keys: slot.placeholderKeys || [],
    legal_text: `${slot.label}\n${slot.fallbackText || ''}`,
    metadata_json: {
      shell_slot: true,
      region: slot.region,
      slot_type: slot.slotType,
    },
  }))
}

function buildRouteScan(variant) {
  const legalSections = listOtpLegalContentTemplateSections({ variant: variant.key })
  const shellManifest = buildOtpBrandedShellManifest({ variant: variant.key })
  const structuredTerms = buildOtpStructuredTermsManifest({ variant: variant.key })
  const signatures = buildOtpSignatureInitialsManifest({ variant: variant.key })
  const shellSections = buildShellSurfaceSections(shellManifest)
  const legalScan = scanOtpContentSections(legalSections, { routeKey: variant.key })
  const shellScan = scanOtpContentSections([...legalSections, ...shellSections], { routeKey: variant.key })
  const legalTokenSet = new Set(sectionTokens(legalSections))
  const shellTokenSet = new Set(shellManifest.placeholderKeys || [])
  const structuredTokenSet = new Set(structuredTerms.fieldKeys || [])
  const signatureTokenSet = new Set(signatures.placeholderKeys || [])
  const allContentTokens = unique([
    ...legalTokenSet,
    ...shellTokenSet,
    ...structuredTokenSet,
    ...signatureTokenSet,
  ])
  const registryValidation = validateTemplateTokensAgainstRegistry({
    packetType: 'otp',
    tokens: allContentTokens,
  })
  const structuredTokensMissingFromLegal = structuredTerms.fieldKeys.filter((fieldKey) => !legalTokenSet.has(fieldKey))
  const signatureTokensInLegalBody = signatures.placeholderKeys.filter((fieldKey) => legalTokenSet.has(fieldKey))
  const shellTokensNotCanonical = (shellManifest.placeholderKeys || []).filter((fieldKey) => registryValidation.unknown.includes(fieldKey))
  const docxReferenceRisks = legalSections
    .filter((section) => /\bdocx\b|\bword document\b|\.doc\b/i.test(`${section.section_label}\n${section.legal_text}`))
    .map((section) => section.section_key)
  const resaleForbidden = ['seller_signature', 'seller_initials', 'resale_occupation_rent', 'mandatory_disclosure_annexure', 'fixtures_included', 'fixtures_excluded']
  const developmentForbidden = ['developer_signature', 'developer_initials', 'contractor_signature', 'contractor_initials', 'agent_signature', 'agent_initials', 'vat_inclusive_purchase_price', 'development_compliance_certificate_schedule']
  const routeForbiddenTokens = variant.key === 'new_development'
    ? resaleForbidden.filter((fieldKey) => allContentTokens.includes(fieldKey))
    : developmentForbidden.filter((fieldKey) => allContentTokens.includes(fieldKey))

  return {
    variant: variant.key,
    label: variant.label,
    legalSectionCount: legalSections.length,
    shellSectionCount: shellSections.length,
    legalScan,
    shellScan,
    structuredTerms,
    signatures,
    allContentTokens,
    structuredTokensMissingFromLegal,
    signatureTokensInLegalBody,
    shellTokensNotCanonical,
    routeForbiddenTokens,
    docxReferenceRisks,
    registryValidation,
  }
}

export function buildOtpContentScannerPhase9Audit({ checkedAt = new Date().toISOString() } = {}) {
  const routeScans = OTP_DOCUMENT_VARIANTS.map(buildRouteScan)
  const checks = []
  const legalScanBlockers = routeScans.flatMap((route) => route.legalScan.blockers.map((issue) => ({ ...issue, variant: route.variant })))
  const shellScanBlockers = routeScans.flatMap((route) => route.shellScan.blockers.map((issue) => ({ ...issue, variant: route.variant })))
  const registryGaps = routeScans.flatMap((route) => route.registryValidation.unknown.map((key) => ({ variant: route.variant, key })))
  const structuredTokenGaps = routeScans.flatMap((route) => route.structuredTokensMissingFromLegal.map((key) => ({ variant: route.variant, key })))
  const signatureBodyRisks = routeScans.flatMap((route) => route.signatureTokensInLegalBody.map((key) => ({ variant: route.variant, key })))
  const shellCanonicalGaps = routeScans.flatMap((route) => route.shellTokensNotCanonical.map((key) => ({ variant: route.variant, key })))
  const routeForbiddenTokenGaps = routeScans.flatMap((route) => route.routeForbiddenTokens.map((key) => ({ variant: route.variant, key })))
  const docxReferenceRisks = routeScans.flatMap((route) => route.docxReferenceRisks.map((sectionKey) => ({ variant: route.variant, sectionKey })))
  const resale = routeScans.find((route) => route.variant === 'resale_existing_property')
  const development = routeScans.find((route) => route.variant === 'new_development')

  addCheck(checks, routeScans.length === 2, 'PHASE9_CONTENT_SCANNER_BOTH_ROUTES_PRESENT', 'Phase 9 content scanner covers resale and new-development routes.')
  addCheck(checks, legalScanBlockers.length === 0, 'PHASE9_LEGAL_CONTENT_ROUTE_SCAN_PASSES', legalScanBlockers.length ? `Legal scan blockers: ${legalScanBlockers.map((issue) => `${issue.variant}:${issue.code}`).join(', ')}` : 'Legal content passes the route-aware scanner.')
  addCheck(checks, shellScanBlockers.length === 0, 'PHASE9_FULL_CONTENT_SURFACE_SCAN_PASSES', shellScanBlockers.length ? `Full-surface blockers: ${shellScanBlockers.map((issue) => `${issue.variant}:${issue.code}`).join(', ')}` : 'Legal sections plus shell sections pass the route-aware scanner.')
  addCheck(checks, registryGaps.length === 0, 'PHASE9_ALL_SCANNED_TOKENS_CANONICAL', registryGaps.length ? `Unknown tokens: ${registryGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'All legal, shell, structured-term and signing tokens are canonical OTP fields.')
  addCheck(checks, structuredTokenGaps.length === 0, 'PHASE9_STRUCTURED_TERMS_RENDER_IN_LEGAL_CONTENT', structuredTokenGaps.length ? `Structured terms missing from legal content: ${structuredTokenGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Every structured term field renders through route legal content.')
  addCheck(checks, signatureBodyRisks.length === 0, 'PHASE9_SIGNATURE_FIELDS_STAY_IN_SIGNING_PLAN', signatureBodyRisks.length ? `Signature fields in legal body: ${signatureBodyRisks.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Signature and initials fields stay in the signing plan, not legal body rows.')
  addCheck(checks, shellCanonicalGaps.length === 0, 'PHASE9_SHELL_TOKENS_SCANNED_AND_CANONICAL', shellCanonicalGaps.length ? `Shell token gaps: ${shellCanonicalGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Branded shell tokens are included in the scanner and canonical.')
  addCheck(checks, routeForbiddenTokenGaps.length === 0, 'PHASE9_FORBIDDEN_ROUTE_TOKENS_BLOCKED', routeForbiddenTokenGaps.length ? `Forbidden route tokens: ${routeForbiddenTokenGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Resale and new-development content tokens remain route separated.')
  addCheck(checks, docxReferenceRisks.length === 0, 'PHASE9_NO_DOCX_REFERENCE_IN_CONTENT', docxReferenceRisks.length ? `DOCX references: ${docxReferenceRisks.map((risk) => `${risk.variant}:${risk.sectionKey}`).join(', ')}` : 'Client-facing OTP content does not refer to DOCX/Word artifacts.')
  addCheck(checks, Boolean(resale?.shellScan.presentSignalGroupKeys.includes('resale_disclosure_fixtures')) && Boolean(development?.shellScan.presentSignalGroupKeys.includes('development_body_corporate')), 'PHASE9_ROUTE_SIGNAL_COVERAGE_COMPLETE', 'Scanner detects required resale and new-development signal families.')

  const blockers = checks.filter((check) => !check.pass)

  return {
    version: OTP_CONTENT_SCANNER_PHASE9_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_CONTENT_SCANNER_PHASE9_REMEDIATION_REQUIRED' : 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING',
    summary: {
      routeCount: routeScans.length,
      legalSectionCount: routeScans.reduce((sum, route) => sum + route.legalSectionCount, 0),
      shellSectionCount: routeScans.reduce((sum, route) => sum + route.shellSectionCount, 0),
      scannedTokenCount: unique(routeScans.flatMap((route) => route.allContentTokens)).length,
      blockerCount: blockers.length,
    },
    checks,
    routeScans,
    blockers,
    legalScanBlockers,
    shellScanBlockers,
    registryGaps,
    structuredTokenGaps,
    signatureBodyRisks,
    shellCanonicalGaps,
    routeForbiddenTokenGaps,
    docxReferenceRisks,
  }
}

export function formatOtpContentScannerPhase9AuditMarkdown(report = buildOtpContentScannerPhase9Audit()) {
  return [
    '# OTP Template vNext Phase 9 Content Scanner',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Legal sections scanned', report.summary.legalSectionCount],
        ['Shell sections scanned', report.summary.shellSectionCount],
        ['Unique scanned tokens', report.summary.scannedTokenCount],
        ['Blockers', report.summary.blockerCount],
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
    '## Route Scans',
    '',
    table(
      ['Route', 'Legal Scan', 'Full Surface Scan', 'Signals', 'Tokens'],
      report.routeScans.map((route) => [
        route.label,
        route.legalScan.isValidForPublish ? 'pass' : 'blocked',
        route.shellScan.isValidForPublish ? 'pass' : 'blocked',
        route.shellScan.presentSignalGroupKeys.join(', '),
        route.allContentTokens.length,
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 9 scans the OTP content surface against route rules, structured terms, signature plans and shell tokens. It does not render sample PDFs, dispatch signing, approve counsel wording, or replace visual PDF QA.',
    '',
  ].join('\n')
}
