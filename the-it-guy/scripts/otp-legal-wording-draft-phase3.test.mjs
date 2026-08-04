import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_LEGAL_WORDING_DRAFT_ANCHORS,
  OTP_LEGAL_WORDING_DRAFT_STATUS_READY,
  OTP_LEGAL_WORDING_DRAFT_VERSION,
  buildOtpLegalWordingDraftReport,
  formatOtpLegalWordingDraftMarkdown,
  listOtpLegalWordingDraftSections,
} from '../src/core/documents/otpLegalWordingDraft.js'
import {
  buildOtpTemplateRouteSplitAudit,
} from '../src/core/documents/otpTemplateRouteSplit.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-legal-wording-draft-phase3'],
  'node scripts/otp-legal-wording-draft-phase3.test.mjs',
  'package.json should expose the OTP legal wording draft Phase 3 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0 && npm run test:otp-template-shell-target-phase1 && npm run test:otp-template-route-split-phase2 && npm run test:otp-legal-wording-draft-phase3'),
  'OTP vNext verification should run the Phase 3 wording draft after the Phase 2 route split.',
)

assert.equal(OTP_LEGAL_WORDING_DRAFT_VERSION, 'otp_legal_wording_draft_phase3_v1')
assert.equal(OTP_LEGAL_WORDING_DRAFT_STATUS_READY, 'OTP_LEGAL_WORDING_DRAFT_READY_FOR_COUNSEL_REVIEW')
assert.equal(OTP_LEGAL_WORDING_DRAFT_ANCHORS.length, 4)
for (const anchor of OTP_LEGAL_WORDING_DRAFT_ANCHORS) {
  assert.ok(anchor.sourceUrl.startsWith('https://www.gov.za/'), `${anchor.code} should use an official source URL.`)
}
assert.deepEqual(
  OTP_LEGAL_WORDING_DRAFT_ANCHORS.map((anchor) => anchor.code),
  [
    'ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE',
    'PROPERTY_PRACTITIONERS_ACT_DISCLOSURE',
    'PROPERTY_PRACTITIONERS_REGULATION_36',
    'ECTA_EXCLUDED_ALIENATION_OF_LAND',
  ],
)

const allSections = listOtpLegalWordingDraftSections()
assert.equal(allSections.length, 20)
assert.ok(allSections.every((section) => section.metadata_json.wording_version === OTP_LEGAL_WORDING_DRAFT_VERSION))
assert.ok(allSections.every((section) => section.metadata_json.draft_status === 'draft_for_counsel_review'))
assert.ok(allSections.every((section) => section.metadata_json.legal_review_required === true))
assert.ok(allSections.every((section) => section.metadata_json.counsel_approval_required === true))
assert.ok(allSections.every((section) => section.anchor_codes.length > 0))

const resaleSections = listOtpLegalWordingDraftSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalWordingDraftSections({ variant: 'new_development' })
const resaleKeys = new Set(resaleSections.map((section) => section.section_key))
const developmentKeys = new Set(developmentSections.map((section) => section.section_key))

assert.equal(resaleSections.length, 14)
assert.equal(developmentSections.length, 14)
assert.ok(resaleKeys.has('formalities_and_signature_v1'))
assert.ok(developmentKeys.has('formalities_and_signature_v1'))
assert.ok(resaleKeys.has('resale_disclosure_voetstoots_v1'))
assert.equal(developmentKeys.has('resale_disclosure_voetstoots_v1'), false)
assert.ok(developmentKeys.has('development_unit_v1'))
assert.ok(developmentKeys.has('development_vat_v1'))
assert.ok(developmentKeys.has('development_handover_snagging_v1'))
assert.ok(developmentKeys.has('development_compliance_body_corporate_v1'))
assert.equal(resaleKeys.has('development_unit_v1'), false)
assert.equal(resaleKeys.has('development_handover_snagging_v1'), false)

const formalities = allSections.find((section) => section.section_key === 'formalities_and_signature_v1')
assert.ok(formalities.legal_text.includes('wet-ink signature'))
assert.ok(formalities.legal_text.includes('electronic signing workflow'))
assert.ok(formalities.anchor_codes.includes('ECTA_EXCLUDED_ALIENATION_OF_LAND'))

const disclosure = allSections.find((section) => section.section_key === 'resale_disclosure_voetstoots_v1')
assert.ok(disclosure.legal_text.includes('mandatory disclosure form'))
assert.ok(disclosure.legal_text.includes('professional expertise or technical skill'))
assert.ok(disclosure.legal_text.includes('does not, by itself, constitute a warranty'))
assert.ok(disclosure.anchor_codes.includes('PROPERTY_PRACTITIONERS_REGULATION_36'))

const developmentHandover = allSections.find((section) => section.section_key === 'development_handover_snagging_v1')
assert.ok(developmentHandover.legal_text.includes('Snagging Period'))
assert.ok(developmentHandover.legal_text.includes('NHBRC Certificate Number'))
assert.ok(developmentHandover.counsel_notes.some((note) => note.includes('Project-specific warranty')))

const resaleSignature = allSections.find((section) => section.section_key === 'resale_acceptance_signature_blocks_v1')
assert.ok(resaleSignature.placeholder_keys.includes('seller_signature'))
assert.equal(resaleSignature.placeholder_keys.includes('developer_signature'), false)

const developmentSignature = allSections.find((section) => section.section_key === 'development_acceptance_signature_blocks_v1')
assert.ok(developmentSignature.placeholder_keys.includes('developer_signature'))
assert.equal(developmentSignature.placeholder_keys.includes('seller_signature'), false)

const routeSplitAudit = buildOtpTemplateRouteSplitAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(routeSplitAudit.status, 'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING')

const report = buildOtpLegalWordingDraftReport({ generatedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(report.version, OTP_LEGAL_WORDING_DRAFT_VERSION)
assert.equal(report.status, OTP_LEGAL_WORDING_DRAFT_STATUS_READY)
assert.equal(report.mutatedData, false)
assert.equal(report.summary.routeCount, 2)
assert.equal(report.summary.sectionCount, 20)
assert.equal(report.summary.anchorCount, 4)
assert.equal(report.summary.blockerCount, 0)
assert.deepEqual(report.blockers, [])
assert.equal(report.routeSplitAudit.status, 'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING')

for (const routeAudit of report.routeAudits) {
  assert.equal(routeAudit.sectionCount, 14)
  assert.deepEqual(routeAudit.registryValidation.unknown, [])
  assert.deepEqual(routeAudit.registryValidation.deprecated, [])
  assert.deepEqual(routeAudit.routeForbiddenTokens, [])
  assert.deepEqual(routeAudit.anchorGaps, [])
}

for (const code of [
  'PHASE3_ROUTE_SPLIT_READY',
  'PHASE3_BOTH_ROUTES_DRAFTED',
  'PHASE3_OFFICIAL_ANCHORS_CAPTURED',
  'PHASE3_CORE_LEGAL_ANCHORS_PRESENT',
  'PHASE3_COUNSEL_REVIEW_GATE_ON_EVERY_SECTION',
  'PHASE3_TOKENS_CANONICAL',
  'PHASE3_NO_FORBIDDEN_ROUTE_TOKENS',
  'PHASE3_ANCHORS_ON_EVERY_SECTION',
  'PHASE3_RESALE_DISCLOSURE_WORDING_PRESENT',
  'PHASE3_DEVELOPMENT_HANDOVER_WORDING_PRESENT',
  'PHASE3_FORMALITIES_WORDING_PRESENT',
]) {
  assert.equal(report.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatOtpLegalWordingDraftMarkdown(report)
for (const token of [
  'OTP Template vNext Phase 3 Legal Wording Draft',
  'OTP_LEGAL_WORDING_DRAFT_READY_FOR_COUNSEL_REVIEW',
  'ALIENATION_OF_LAND_ACT_WRITING_SIGNATURE',
  'PROPERTY_PRACTITIONERS_REGULATION_36',
  'ECTA_EXCLUDED_ALIENATION_OF_LAND',
  'Phase 3 produces recommended draft wording only',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP legal wording draft Phase 3 contract passed.')
