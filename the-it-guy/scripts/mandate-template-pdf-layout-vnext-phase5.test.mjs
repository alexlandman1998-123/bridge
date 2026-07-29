import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT,
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'
import {
  MANDATE_NATIVE_PDF_LAYOUT_BASELINE,
  MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION,
  buildMandateTemplatePdfLayoutVNextReport,
  estimateMandatePdfSectionLayout,
  formatMandateTemplatePdfLayoutVNextMarkdown,
} from '../src/core/documents/mandateTemplatePdfLayoutVNext.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-pdf-layout-vnext-phase5'],
  'node scripts/mandate-template-pdf-layout-vnext-phase5.test.mjs',
  'package.json should expose the mandate template PDF layout vNext Phase 5 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-pdf-layout-vnext'],
  'node scripts/report-mandate-template-pdf-layout-vnext.mjs',
  'package.json should expose the mandate template PDF layout reporter.',
)

assert.equal(MANDATE_NATIVE_PDF_LAYOUT_BASELINE.pageWidth, 595.28)
assert.equal(MANDATE_NATIVE_PDF_LAYOUT_BASELINE.pageHeight, 841.89)
assert.equal(MANDATE_NATIVE_PDF_LAYOUT_BASELINE.signatureBlockHeight, 220)
assert.equal(MANDATE_NATIVE_PDF_LAYOUT_BASELINE.spouseSignatureBlockHeight, 360)
assert.equal(MANDATE_NATIVE_PDF_LAYOUT_BASELINE.signatureFieldHeight, 56)

const sections = listMandateTemplateWordingVNextSections()
const signature = sections.find((section) => section.section_key === 'signature_pages')
assert.ok(signature, 'vNext wording should include a signature section.')
assert.equal(signature.section_type, 'signature_zone')
assert.equal(signature.metadata_json.native_pdf_layout.contract, MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT)
assert.equal(signature.metadata_json.native_pdf_layout.render_mode, 'signature_zone_only')
assert.equal(signature.metadata_json.native_pdf_layout.suppress_section_body, true)
assert.equal(signature.metadata_json.native_pdf_layout.signature_layout_contract, 'arch9-mandate-branded-signature-layout-v1')
assert.deepEqual(
  signature.metadata_json.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}`),
  ['agent:signature:true', 'seller:signature:true'],
)

for (const section of sections) {
  assert.equal(section.metadata_json.native_pdf_layout.contract, MANDATE_TEMPLATE_WORDING_PDF_LAYOUT_CONTRACT)
  assert.equal(section.metadata_json.native_pdf_layout.keep_heading_with_body, true)
  assert.equal(section.metadata_json.native_pdf_layout.avoid_orphan_heading, true)
}

for (const key of ['marketing_listing_terms', 'special_conditions']) {
  const section = sections.find((item) => item.section_key === key)
  assert.equal(section.metadata_json.native_pdf_layout.avoid_page_break_inside, true)
}

const signatureEstimate = estimateMandatePdfSectionLayout(signature)
assert.equal(signatureEstimate.bodySuppressed, true)
assert.equal(signatureEstimate.estimatedHeight, 0)

const partiesEstimate = estimateMandatePdfSectionLayout(sections.find((section) => section.section_key === 'parties'))
assert.ok(partiesEstimate.estimatedHeight > 0)
assert.ok(partiesEstimate.wrappedBodyLines > 10)

const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const report = buildMandateTemplatePdfLayoutVNextReport({
  sections,
  rendererSource,
  generatedAt: '2026-07-28T12:00:00.000Z',
})

assert.equal(report.version, MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION)
assert.equal(report.mutatedData, false)
assert.equal(report.summary.status, 'PDF_LAYOUT_PRESERVED_AND_REFINED')
assert.equal(report.summary.sectionCount, 16)
assert.equal(report.summary.signatureSectionCount, 1)
assert.equal(report.summary.suppressedBodySectionCount, 1)
assert.equal(report.summary.blankSafeOptionalSectionCount, 7)
assert.equal(report.summary.blockerCount, 0)
assert.equal(report.summary.warningCount, 0)
assert.ok(report.summary.maxEstimatedPages <= 6)
assert.ok(report.scenarioEstimates.some((row) => row.key === 'individual_spouse_full_title' && row.signatureBlockHeight === 360))
assert.ok(report.scenarioEstimates.some((row) => row.key === 'company_sectional_rich' && row.consumedSections.includes('property_sectional_title_pack')))

for (const check of [
  'PHASE5_SECTION_SEQUENCE_PRESERVED',
  'PHASE5_SINGLE_SIGNATURE_ZONE',
  'PHASE5_SIGNATURE_ZONE_LAST',
  'PHASE5_SIGNATURE_BODY_SUPPRESSED',
  'PHASE5_SIGNATURE_LAYOUT_CONTRACT_BOUND',
  'PHASE5_CLIENT_HEADINGS_CLEAN',
  'PHASE5_OPTIONAL_SECTIONS_BLANK_SAFE',
  'PHASE5_LAYOUT_CONTRACT_ON_EVERY_SECTION',
  'PHASE5_ESTIMATED_PAGE_BUDGET',
  'PHASE5_RENDERER_METADATA_GUARD_PRESENT',
]) {
  assert.equal(report.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

for (const token of [
  'function shouldRenderNativePdfSectionBody',
  'nativePdfLayout.suppress_section_body === true',
  'signature_zone_only',
  'plannedSigningFields',
]) {
  assert.ok(rendererSource.includes(token), `native mandate renderer should include ${token}`)
}

const markdown = formatMandateTemplatePdfLayoutVNextMarkdown(report)
for (const token of [
  'Mandate Template vNext Phase 5 PDF Layout',
  'PDF_LAYOUT_PRESERVED_AND_REFINED',
  'Visual Verification Boundary',
  'signature_pages',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplatePdfLayoutVNext.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_PDF_LAYOUT_VNEXT_VERSION',
  'MANDATE_NATIVE_PDF_LAYOUT_BASELINE',
  'buildMandateTemplatePdfLayoutVNextReport',
  'formatMandateTemplatePdfLayoutVNextMarkdown',
  'signature_zone_only',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('Mandate template PDF layout vNext Phase 5 contract passed.')
