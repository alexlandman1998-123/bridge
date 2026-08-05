import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_REFERENCE_BRANDING_REQUIREMENTS,
  OTP_REFERENCE_EXTRACTION_VERSION,
  OTP_RESALE_REFERENCE_EXTRACTION_GUARDRAILS,
  OTP_RESALE_REFERENCE_FIELD_FAMILIES,
  OTP_RESALE_REFERENCE_SCHEDULES,
  OTP_RESALE_REFERENCE_SOURCE,
  OTP_RESALE_REFERENCE_TOC,
  buildOtpReferenceExtractionReport,
  listOtpReferenceBrandingRequirements,
  listOtpResaleReferenceFieldFamilies,
  listOtpResaleReferenceLegalSections,
  listOtpResaleReferenceSchedules,
  listOtpResaleReferenceToc,
} from '../src/core/documents/otpReferenceExtraction.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-reference-extraction-phase1'],
  'node scripts/otp-reference-extraction-phase1.test.mjs',
  'package.json should expose the OTP reference extraction Phase 1 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0 && npm run test:otp-reference-extraction-phase1 && npm run test:otp-template-shell-target-phase1'),
  'OTP vNext verification should run reference extraction after Phase 0 and before shell persistence.',
)

assert.equal(OTP_REFERENCE_EXTRACTION_VERSION, 'otp_reference_extraction_phase1_v1')
assert.equal(OTP_RESALE_REFERENCE_SOURCE.routeKey, 'resale_existing_property')
assert.equal(OTP_RESALE_REFERENCE_SOURCE.path, '/Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx')
assert.equal(OTP_RESALE_REFERENCE_SOURCE.sha256, 'a1f8f2e82611f44aead9b2f9ac6fdaa19c8577038b17ca1a6666f2cd4e9910cc')
assert.equal(OTP_RESALE_REFERENCE_SOURCE.renderedPageCount, 15)
assert.equal(OTP_RESALE_REFERENCE_SOURCE.paragraphCount, 416)
assert.equal(OTP_RESALE_REFERENCE_SOURCE.embeddedMediaCount, 3)
assert.match(OTP_RESALE_REFERENCE_SOURCE.footerTextSignal, /KINGSTONS REAL ESTATE/i)

assert.deepEqual(listOtpReferenceBrandingRequirements(), OTP_REFERENCE_BRANDING_REQUIREMENTS.map((requirement) => ({ ...requirement })))
assert.deepEqual(
  OTP_REFERENCE_BRANDING_REQUIREMENTS.map((requirement) => requirement.key),
  [
    'logo_top_left',
    'company_details_top_right',
    'agency_name_footer_left',
    'page_number_footer_middle',
    'website_footer_right',
  ],
)
assert.ok(
  OTP_REFERENCE_BRANDING_REQUIREMENTS.every((requirement) => requirement.targetRule.includes('Native PDF shell')),
  'Branding requirements should target the native PDF shell, not the DOCX renderer.',
)

assert.deepEqual(listOtpResaleReferenceToc(), OTP_RESALE_REFERENCE_TOC.map((item) => ({ ...item })))
assert.equal(OTP_RESALE_REFERENCE_TOC.length, 30)
assert.deepEqual(
  OTP_RESALE_REFERENCE_TOC.map((item) => item.number),
  Array.from({ length: 30 }, (_, index) => index + 1),
  'Reference table of contents should preserve the 1-30 section sequence.',
)

const legalSections = listOtpResaleReferenceLegalSections()
assert.equal(legalSections.length, 28)
assert.deepEqual(
  legalSections.map((section) => section.number),
  Array.from({ length: 28 }, (_, index) => index + 3),
  'Legal sections 3 through 30 must be captured for resale.',
)
for (const key of [
  'definitions',
  'interpretations',
  'sale',
  'acceptance',
  'purchase_price',
  'risk',
  'transfer',
  'occupation',
  'suspensive_conditions',
  'warranties',
  'commission',
  'certificates',
  'rates_taxes_consumption_charges',
  'breach',
  'cooling_off',
  'domicilium_notices',
  'consent_to_jurisdiction',
  'marital_status_purchaser',
  'special_conditions',
  'costs',
  'whole_agreement',
  'non_variation',
  'non_waiver',
  'severability',
  'applicable_law',
]) {
  assert.ok(legalSections.some((section) => section.key === key), `${key} should be represented in the resale reference extraction.`)
}

assert.deepEqual(listOtpResaleReferenceSchedules(), OTP_RESALE_REFERENCE_SCHEDULES.map((schedule) => ({
  ...schedule,
  subsections: [...schedule.subsections],
})))
assert.equal(OTP_RESALE_REFERENCE_SCHEDULES.length, 2)
assert.ok(OTP_RESALE_REFERENCE_SCHEDULES[0].subsections.includes('fixtures_and_fittings'))
assert.ok(OTP_RESALE_REFERENCE_SCHEDULES[0].subsections.includes('conveyancing_attorneys'))
assert.ok(OTP_RESALE_REFERENCE_SCHEDULES[1].subsections.includes('bond_documents_required'))

assert.deepEqual(listOtpResaleReferenceFieldFamilies(), OTP_RESALE_REFERENCE_FIELD_FAMILIES.map((family) => ({
  ...family,
  fields: [...family.fields],
})))
assert.equal(OTP_RESALE_REFERENCE_FIELD_FAMILIES.length, 10)
assert.ok(
  OTP_RESALE_REFERENCE_FIELD_FAMILIES.some((family) => family.key === 'structured_suspensive_conditions' && family.owner === 'transaction_offer_terms'),
  'Suspensive conditions should be captured as structured transaction-owned terms.',
)
assert.ok(
  OTP_RESALE_REFERENCE_FIELD_FAMILIES.some((family) => family.key === 'fixtures_fittings' && family.owner === 'seller_onboarding'),
  'Fixtures and fittings should be seller-owned, not buyer-link free text.',
)
assert.ok(
  OTP_RESALE_REFERENCE_FIELD_FAMILIES.some((family) => family.key === 'conveyancing_attorneys' && family.owner === 'conveyancer_transfer_assignment'),
  'Conveyancer details should be owned by the transfer assignment source.',
)

for (const guardrail of [
  'Do not treat the reference DOCX as a runtime renderer.',
  'Keep new-development extraction separate; resale reference content must not become the development default.',
]) {
  assert.ok(OTP_RESALE_REFERENCE_EXTRACTION_GUARDRAILS.includes(guardrail), `guardrail should include: ${guardrail}`)
}

const report = buildOtpReferenceExtractionReport({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(report.version, OTP_REFERENCE_EXTRACTION_VERSION)
assert.equal(report.status, 'OTP_REFERENCE_EXTRACTION_READY_FOR_PHASE2')
assert.equal(report.mutatedData, false)
assert.equal(report.summary.tocSectionCount, 30)
assert.equal(report.summary.legalSectionCount, 28)
assert.equal(report.summary.scheduleCount, 2)
assert.equal(report.summary.brandingRequirementCount, 5)
assert.equal(report.summary.fieldFamilyCount, 10)
assert.equal(report.summary.blockerCount, 0)
assert.deepEqual(report.blockers, [])

for (const code of [
  'PHASE1_REFERENCE_SOURCE_HASH_CAPTURED',
  'PHASE1_REFERENCE_RENDERED_PAGE_COUNT_CAPTURED',
  'PHASE1_REFERENCE_MEDIA_CAPTURED',
  'PHASE1_REFERENCE_FOOTER_SIGNAL_CAPTURED',
  'PHASE1_REFERENCE_TOC_30_SECTIONS',
  'PHASE1_REFERENCE_LEGAL_SECTIONS_3_TO_30',
  'PHASE1_REFERENCE_SCHEDULES_CAPTURED',
  'PHASE1_REFERENCE_BRANDING_REQUIREMENTS_CAPTURED',
  'PHASE1_REFERENCE_FIELD_FAMILIES_CAPTURED',
  'PHASE1_REFERENCE_EXTRACTION_IS_RESALE_ONLY',
]) {
  assert.equal(report.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

console.log('OTP reference extraction Phase 1 contract passed.')
