import {
  buildMandateTemplateWordingVNext,
  listMandateTemplateWordingVNextSections,
  MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT,
} from './mandateTemplateWordingVNext.js'

export const MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION = 'mandate_template_vnext_phase5_pdf_layout_v1'

export const MANDATE_NATIVE_PDF_LAYOUT_BASELINE = Object.freeze({
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 56,
  contentTop: 691.89,
  footerSafeY: 84,
  maxWidth: 483.28,
  bodyFontSize: 9.8,
  headingFontSize: 11.2,
  lineHeight: 14.2,
  sectionGap: 14,
  paragraphGap: 5,
  detailPanelHeight: 124,
  signatureBlockHeight: 220,
  spouseSignatureBlockHeight: 360,
  signatureFieldHeight: 56,
  signaturePanelWidth: 210,
  signatureFieldWidth: 186,
})

const EXPECTED_SECTION_SEQUENCE = Object.freeze([
  'introduction_purpose',
  'parties',
  'seller_individual_capacity_pack',
  'seller_company_authority_pack',
  'seller_trust_authority_pack',
  'seller_spouse_consent_pack',
  'property_details',
  'property_full_title_pack',
  'property_sectional_title_pack',
  'mandate_terms',
  'commission_terms',
  'marketing_listing_terms',
  'special_conditions',
  'general_terms',
  'popia_fica',
  'signature_pages',
])

const REQUIRED_NATIVE_PDF_RENDERER_MARKERS = Object.freeze([
  'function shouldRenderNativePdfSectionBody',
  'nativePdfLayout.suppress_section_body === true',
  'render_mode).toLowerCase() === "signature_zone_only"',
  'layoutContract: "arch9-mandate-branded-signature-layout-v1"',
  'plannedSigningFields',
  'const signatureBlockHeight = hasSpouseSigner ? 360 : 220',
])

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

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sectionContent(section = {}) {
  return String(section.legal_text ?? section.legalText ?? section.content ?? '')
}

function sectionMetadata(section = {}) {
  return object(section.metadata_json || section.metadataJson || section.metadata)
}

function sectionPdfLayout(section = {}) {
  const metadata = sectionMetadata(section)
  return object(metadata.native_pdf_layout || metadata.nativePdfLayout || metadata.pdf_layout || metadata.pdfLayout)
}

function isSignatureZone(section = {}) {
  return normalizeKey(section.section_type || section.sectionType || section.type) === 'signature_zone' ||
    normalizeKey(section.section_key || section.sectionKey || section.key) === 'signature_pages'
}

function sectionSuppressesBody(section = {}) {
  const layout = sectionPdfLayout(section)
  return layout.suppress_section_body === true ||
    layout.render_body === false ||
    (isSignatureZone(section) && normalizeKey(layout.render_mode) === 'signature_zone_only')
}

function hasCondition(section = {}) {
  return Object.keys(object(section.condition_json || section.conditionJson || section.condition)).length > 0
}

function isOptionalBlankSafe(section = {}) {
  const metadata = sectionMetadata(section)
  if (section.is_required === true || section.required === true) return true
  return Boolean(
    hasCondition(section) ||
      metadata.hide_when_empty ||
      metadata.hideWhenEmpty ||
      metadata.blank_safe ||
      metadata.blankSafe,
  )
}

function lineWrapCount(line = '', maxChars = 86) {
  const length = normalizeText(line).length
  if (!length) return 0
  return Math.max(1, Math.ceil(length / maxChars))
}

export function estimateMandatePdfSectionLayout(section = {}, options = {}) {
  const baseline = options.baseline || MANDATE_NATIVE_PDF_LAYOUT_BASELINE
  const content = sectionContent(section)
  const bodySuppressed = sectionSuppressesBody(section)
  const nonEmptyLines = content.split(/\r?\n/).map((line) => normalizeText(line)).filter(Boolean)
  const wrappedBodyLines = bodySuppressed
    ? 0
    : nonEmptyLines.reduce((sum, line) => sum + lineWrapCount(line), 0)
  const paragraphCount = bodySuppressed ? 0 : content.split(/\n{2,}/).map((part) => normalizeText(part)).filter(Boolean).length
  const headingHeight = bodySuppressed ? 0 : baseline.headingFontSize + baseline.lineHeight + baseline.paragraphGap
  const bodyHeight = wrappedBodyLines * baseline.lineHeight
  const paragraphGaps = Math.max(0, paragraphCount - 1) * baseline.paragraphGap
  const sectionHeight = bodySuppressed ? 0 : Math.ceil(headingHeight + bodyHeight + paragraphGaps + baseline.sectionGap)

  return {
    sectionKey: normalizeKey(section.section_key || section.sectionKey || section.key),
    sectionLabel: normalizeText(section.section_label || section.sectionLabel || section.label),
    sortOrder: Number(section.sort_order ?? section.sortOrder ?? 0),
    sectionType: normalizeKey(section.section_type || section.sectionType || section.type),
    required: section.is_required === undefined ? Boolean(section.required) : Boolean(section.is_required),
    conditional: hasCondition(section),
    bodySuppressed,
    blankSafe: isOptionalBlankSafe(section),
    lineCount: nonEmptyLines.length,
    wrappedBodyLines,
    estimatedHeight: sectionHeight,
    nativePdfLayout: sectionPdfLayout(section),
  }
}

function scenarioIncluded(section = {}, scenario = {}) {
  const key = normalizeKey(section.section_key || section.sectionKey || section.key)
  if (key === 'signature_pages') return false
  if (section.is_required === true || section.required === true) return true
  const included = new Set((scenario.includeSectionKeys || []).map(normalizeKey))
  return included.has(key)
}

function estimateScenarioPages(sectionLayouts = [], scenario = {}, baseline = MANDATE_NATIVE_PDF_LAYOUT_BASELINE) {
  let pageCount = 1
  let remaining = baseline.contentTop - baseline.footerSafeY
  const consumedSections = []
  const includedLayouts = sectionLayouts.filter((layout) => scenarioIncluded({
    section_key: layout.sectionKey,
    is_required: layout.required,
  }, scenario))

  remaining -= baseline.detailPanelHeight
  if (remaining < 0) {
    pageCount += 1
    remaining = baseline.contentTop - baseline.footerSafeY - baseline.detailPanelHeight
  }

  for (const layout of includedLayouts) {
    if (layout.estimatedHeight <= 0) continue
    if (layout.estimatedHeight > remaining) {
      pageCount += 1
      remaining = baseline.contentTop - baseline.footerSafeY
    }
    remaining -= layout.estimatedHeight
    consumedSections.push(layout.sectionKey)
  }

  const signatureHeight = scenario.hasSpouseSigner ? baseline.spouseSignatureBlockHeight : baseline.signatureBlockHeight
  if (signatureHeight > remaining) {
    pageCount += 1
    remaining = baseline.contentTop - baseline.footerSafeY
  }
  remaining -= signatureHeight

  return {
    key: scenario.key,
    label: scenario.label,
    pageCount,
    consumedSections,
    hasSpouseSigner: Boolean(scenario.hasSpouseSigner),
    signatureBlockHeight: signatureHeight,
    remainingContentHeight: Math.max(0, Math.round(remaining)),
  }
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function buildChecks({ sections = [], sectionLayouts = [], scenarioEstimates = [], rendererSource = '' } = {}) {
  const checks = []
  const sequence = sections.map((section) => normalizeKey(section.section_key || section.sectionKey || section.key))
  const labels = sections.map((section) => normalizeText(section.section_label || section.sectionLabel || section.label))
  const headings = sections.map((section) => normalizeText(sectionContent(section).split(/\r?\n/).find((line) => normalizeText(line)) || ''))
  const signatureSections = sectionLayouts.filter((layout) => layout.sectionKey === 'signature_pages' || layout.sectionType === 'signature_zone')
  const signatureLayout = signatureSections[0]?.nativePdfLayout || {}
  const optionalUnsafe = sectionLayouts.filter((layout) => !layout.required && !layout.blankSafe)
  const markerMisses = REQUIRED_NATIVE_PDF_RENDERER_MARKERS.filter((marker) => !rendererSource.includes(marker))

  addCheck(checks, JSON.stringify(sequence) === JSON.stringify(EXPECTED_SECTION_SEQUENCE), 'PHASE5_SECTION_SEQUENCE_PRESERVED', 'vNext keeps the mandate section sequence and conditional-pack banding stable.')
  addCheck(checks, signatureSections.length === 1, 'PHASE5_SINGLE_SIGNATURE_ZONE', 'Exactly one signature section remains in the template manifest.')
  addCheck(checks, sequence[sequence.length - 1] === 'signature_pages', 'PHASE5_SIGNATURE_ZONE_LAST', 'Signature section remains the final section.')
  addCheck(checks, signatureLayout.suppress_section_body === true && normalizeKey(signatureLayout.render_mode) === 'signature_zone_only', 'PHASE5_SIGNATURE_BODY_SUPPRESSED', 'Native PDF signature body is suppressed so only authoritative signature panels render.')
  addCheck(checks, signatureLayout.signature_layout_contract === 'arch9-mandate-branded-signature-layout-v1', 'PHASE5_SIGNATURE_LAYOUT_CONTRACT_BOUND', 'vNext signature section is bound to the existing authoritative native PDF signature layout contract.')
  addCheck(checks, labels.every((label) => !/\b(pack|packet)\b/i.test(label)) && headings.every((heading) => !/\b(pack|packet)\b/i.test(heading)), 'PHASE5_CLIENT_HEADINGS_CLEAN', 'Client-facing labels and rendered headings avoid Pack/Packet wording.')
  addCheck(checks, optionalUnsafe.length === 0, 'PHASE5_OPTIONAL_SECTIONS_BLANK_SAFE', 'Every optional vNext section has a visibility condition or hide-when-empty metadata.')
  addCheck(checks, sectionLayouts.every((layout) => layout.nativePdfLayout.contract === MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT), 'PHASE5_LAYOUT_CONTRACT_ON_EVERY_SECTION', 'Every vNext section carries the Phase 5 native PDF layout contract.')
  addCheck(checks, scenarioEstimates.every((estimate) => estimate.pageCount <= 6), 'PHASE5_ESTIMATED_PAGE_BUDGET', 'Estimated rich mandate scenarios remain within a six-page native PDF budget before annexures.')
  addCheck(checks, markerMisses.length === 0, 'PHASE5_RENDERER_METADATA_GUARD_PRESENT', markerMisses.length ? `Renderer source is missing: ${markerMisses.join(', ')}` : 'Renderer honors explicit metadata for signature-zone body suppression.')

  return checks
}

export function buildMandateTemplatePdfLayoutVNextReport({
  sections = listMandateTemplateWordingVNextSections(),
  rendererSource = '',
  generatedAt = new Date().toISOString(),
} = {}) {
  const wording = buildMandateTemplateWordingVNext({ existingSections: sections, generatedAt })
  const resolvedSections = Array.isArray(sections) && sections.length ? sections : wording.sections
  const sectionLayouts = resolvedSections.map((section) => estimateMandatePdfSectionLayout(section))
  const scenarioEstimates = [
    estimateScenarioPages(sectionLayouts, {
      key: 'default_clean',
      label: 'Default mandate, no optional data',
      includeSectionKeys: [],
    }),
    estimateScenarioPages(sectionLayouts, {
      key: 'company_sectional_rich',
      label: 'Company sectional title with optional terms',
      includeSectionKeys: ['seller_company_authority_pack', 'property_sectional_title_pack', 'marketing_listing_terms', 'special_conditions'],
    }),
    estimateScenarioPages(sectionLayouts, {
      key: 'individual_spouse_full_title',
      label: 'Individual spouse consent full title',
      includeSectionKeys: ['seller_individual_capacity_pack', 'seller_spouse_consent_pack', 'property_full_title_pack', 'marketing_listing_terms'],
      hasSpouseSigner: true,
    }),
  ]
  const checks = buildChecks({
    sections: resolvedSections,
    sectionLayouts,
    scenarioEstimates,
    rendererSource,
  })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION,
    generatedAt,
    mutatedData: false,
    baseline: MANDATE_NATIVE_PDF_LAYOUT_BASELINE,
    wordingVersion: wording.version,
    layoutContract: MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT,
    summary: {
      status: blockers.length ? 'PDF_LAYOUT_REVIEW_REQUIRED' : 'PDF_LAYOUT_PRESERVED_AND_REFINED',
      sectionCount: sectionLayouts.length,
      signatureSectionCount: sectionLayouts.filter((layout) => layout.sectionType === 'signature_zone').length,
      suppressedBodySectionCount: sectionLayouts.filter((layout) => layout.bodySuppressed).length,
      blankSafeOptionalSectionCount: sectionLayouts.filter((layout) => !layout.required && layout.blankSafe).length,
      maxEstimatedPages: Math.max(...scenarioEstimates.map((estimate) => estimate.pageCount)),
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    sectionLayouts,
    scenarioEstimates,
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

export function formatMandateTemplatePdfLayoutVNextMarkdown(report = buildMandateTemplatePdfLayoutVNextReport()) {
  return [
    '# Mandate Template vNext Phase 5 PDF Layout',
    '',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.summary.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Sections', report.summary.sectionCount],
        ['Signature sections', report.summary.signatureSectionCount],
        ['Suppressed body sections', report.summary.suppressedBodySectionCount],
        ['Blank-safe optional sections', report.summary.blankSafeOptionalSectionCount],
        ['Max estimated pages', report.summary.maxEstimatedPages],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Layout Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Scenario Estimates',
    '',
    table(
      ['Scenario', 'Pages', 'Signature Height', 'Remaining Height', 'Included Sections'],
      report.scenarioEstimates.map((estimate) => [
        estimate.label,
        estimate.pageCount,
        estimate.signatureBlockHeight,
        estimate.remainingContentHeight,
        estimate.consumedSections.join(', '),
      ]),
    ),
    '',
    '## Section Layout',
    '',
    table(
      ['Order', 'Section', 'Type', 'Required', 'Conditional', 'Body Suppressed', 'Estimated Height', 'Wrapped Lines'],
      report.sectionLayouts.map((layout) => [
        layout.sortOrder,
        layout.sectionKey,
        layout.sectionType,
        layout.required ? 'yes' : 'no',
        layout.conditional ? 'yes' : 'no',
        layout.bodySuppressed ? 'yes' : 'no',
        layout.estimatedHeight,
        layout.wrappedBodyLines,
      ]),
    ),
    '',
    '## Visual Verification Boundary',
    '',
    'This Phase 5 report is a deterministic pre-render layout gate. A rendered PDF must still be visually inspected before live rollout, using the native PDF artifact generated from the approved vNext template.',
    '',
  ].join('\n')
}
