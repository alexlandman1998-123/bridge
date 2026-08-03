import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_CONTENT_RULE_VERSION,
  listOtpContentRules,
  listOtpContentSignalGroups,
  resolveOtpContentRuleProfile,
} from '../src/core/documents/otpContentRules.js'
import {
  OTP_CONTENT_SCANNER_VERSION,
  detectOtpContentSectionSignals,
  scanOtpContentSections,
} from '../src/core/documents/otpContentScanner.js'
import {
  OTP_CONTENT_PUBLISH_GATE_VERSION,
  buildOtpContentPublishGateReport,
  serializeOtpContentPublishGateScan,
} from '../src/core/documents/otpContentPublishGate.js'
import {
  OTP_CONTENT_GATE_REPORT_VERSION,
  buildOtpContentGateReport,
  formatOtpContentGateReportMarkdown,
} from '../src/core/documents/otpContentGateReport.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-content-gate-scanner-phase7'],
  'node scripts/otp-content-gate-scanner-phase7.test.mjs',
  'package.json should expose the OTP content gate and scanner Phase 7 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-content-gate-scanner'],
  'node scripts/report-otp-content-gate-scanner.mjs',
  'package.json should expose the OTP content gate report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-content-gate-scanner-phase7'),
  'OTP vNext verification should include Phase 7 content gate checks.',
)

assert.equal(OTP_CONTENT_RULE_VERSION, 'otp_content_rules_phase7_v1')
assert.equal(OTP_CONTENT_SCANNER_VERSION, 'otp_content_scanner_phase7_v1')
assert.equal(OTP_CONTENT_PUBLISH_GATE_VERSION, 'otp_content_publish_gate_phase7_v1')
assert.equal(OTP_CONTENT_GATE_REPORT_VERSION, 'otp_content_gate_report_phase7_v1')

assert.deepEqual(
  listOtpContentRules().map((rule) => rule.key),
  ['resale_existing_property', 'new_development'],
)
assert.deepEqual(
  listOtpContentSignalGroups().map((group) => group.key),
  [
    'shared_offer',
    'parties',
    'finance_conditions',
    'transfer_conveyancer',
    'resale_property',
    'resale_disclosure_fixtures',
    'occupation_rent',
    'subject_to_sale',
    'development_unit',
    'development_vat',
    'development_handover',
    'development_body_corporate',
  ],
)

const resaleProfile = resolveOtpContentRuleProfile('resale_existing_property')
const developmentProfile = resolveOtpContentRuleProfile('new_development')
assert.ok(resaleProfile.requiredSignalGroups.some((group) => group.key === 'resale_disclosure_fixtures'))
assert.ok(resaleProfile.requiredSignalGroups.some((group) => group.key === 'subject_to_sale'))
assert.ok(resaleProfile.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'development_handover'))
assert.ok(developmentProfile.requiredSignalGroups.some((group) => group.key === 'development_unit'))
assert.ok(developmentProfile.requiredSignalGroups.some((group) => group.key === 'development_body_corporate'))
assert.ok(developmentProfile.forbiddenUnconditionalSignalGroups.some((group) => group.key === 'occupation_rent'))

const resaleSections = listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalContentTemplateSections({ variant: 'new_development' })
const resaleScan = scanOtpContentSections(resaleSections, { routeKey: 'resale_existing_property' })
const developmentScan = scanOtpContentSections(developmentSections, { routeKey: 'new_development' })

assert.equal(resaleScan.isValidForPublish, true)
assert.equal(resaleScan.blockingCount, 0)
assert.equal(resaleScan.warningCount, 0)
assert.deepEqual(resaleScan.missingRecommendedSectionKeys, [])
for (const groupKey of [
  'shared_offer',
  'parties',
  'finance_conditions',
  'transfer_conveyancer',
  'resale_property',
  'resale_disclosure_fixtures',
  'occupation_rent',
  'subject_to_sale',
]) {
  assert.ok(resaleScan.presentSignalGroupKeys.includes(groupKey), `resale scan should detect ${groupKey}.`)
}

assert.equal(developmentScan.isValidForPublish, true)
assert.equal(developmentScan.blockingCount, 0)
assert.equal(developmentScan.warningCount, 0)
assert.deepEqual(developmentScan.missingRecommendedSectionKeys, [])
for (const groupKey of [
  'shared_offer',
  'parties',
  'finance_conditions',
  'transfer_conveyancer',
  'development_unit',
  'development_vat',
  'development_handover',
  'development_body_corporate',
]) {
  assert.ok(developmentScan.presentSignalGroupKeys.includes(groupKey), `development scan should detect ${groupKey}.`)
}

const developmentUnit = developmentSections.find((section) => section.section_key === 'development_unit')
const resaleWithDevelopmentLeak = scanOtpContentSections(
  [...resaleSections, developmentUnit],
  { routeKey: 'resale_existing_property' },
)
assert.equal(resaleWithDevelopmentLeak.isValidForPublish, false)
assert.ok(resaleWithDevelopmentLeak.blockers.some((issue) => issue.code === 'OTP_FORBIDDEN_ROUTE_SIGNAL' && issue.signalGroupKey === 'development_unit'))

const resaleDisclosure = resaleSections.find((section) => section.section_key === 'resale_disclosure_fixtures_compliance')
const developmentWithResaleLeak = scanOtpContentSections(
  [...developmentSections, resaleDisclosure],
  { routeKey: 'new_development' },
)
assert.equal(developmentWithResaleLeak.isValidForPublish, false)
assert.ok(developmentWithResaleLeak.blockers.some((issue) => issue.code === 'OTP_FORBIDDEN_ROUTE_SIGNAL' && issue.signalGroupKey === 'resale_disclosure_fixtures'))

const noSectionsScan = scanOtpContentSections([], { routeKey: 'resale_existing_property' })
assert.equal(noSectionsScan.isValidForPublish, false)
assert.ok(noSectionsScan.blockers.some((issue) => issue.code === 'OTP_NO_TEMPLATE_SECTIONS'))

const resaleWithoutDisclosure = scanOtpContentSections(
  resaleSections.filter((section) => section.section_key !== 'resale_disclosure_fixtures_compliance'),
  { routeKey: 'resale_existing_property' },
)
assert.equal(resaleWithoutDisclosure.isValidForPublish, false)
assert.ok(resaleWithoutDisclosure.blockers.some((issue) => issue.code === 'OTP_MISSING_REQUIRED_SIGNAL_GROUP' && issue.signalGroupKey === 'resale_disclosure_fixtures'))

const subjectToSale = resaleSections.find((section) => section.section_key === 'subject_to_sale')
const subjectWithoutCondition = {
  ...subjectToSale,
  condition_json: {},
  metadata_json: {
    ...subjectToSale.metadata_json,
    condition_json: {},
  },
}
const resaleWithoutSubjectCondition = scanOtpContentSections(
  resaleSections.map((section) => section.section_key === 'subject_to_sale' ? subjectWithoutCondition : section),
  { routeKey: 'resale_existing_property' },
)
assert.equal(resaleWithoutSubjectCondition.isValidForPublish, false)
assert.ok(resaleWithoutSubjectCondition.blockers.some((issue) => issue.code === 'OTP_CONDITIONAL_ROUTE_SECTION_MISSING_CONDITION' && issue.signalGroupKey === 'subject_to_sale'))

const subjectSignals = detectOtpContentSectionSignals(subjectToSale)
assert.ok(subjectSignals.some((signal) => signal.signalGroupKey === 'subject_to_sale' && signal.hasCondition))

const resaleGate = buildOtpContentPublishGateReport({
  packet_type: 'otp',
  metadata_json: { otp_document_variant: 'resale_existing_property' },
  sections: resaleSections,
}, {
  packetType: 'otp',
  routeKey: 'resale_existing_property',
  scannedAt: '2026-08-03T00:00:00.000Z',
})
assert.equal(resaleGate.applies, true)
assert.equal(resaleGate.canPublish, true)
assert.equal(resaleGate.metadata.gateVersion, OTP_CONTENT_PUBLISH_GATE_VERSION)
assert.deepEqual(resaleGate.blockers, [])
assert.deepEqual(resaleGate.warnings, [])
assert.equal(Object.hasOwn(resaleGate.metadata, 'scan'), false)
assert.equal(Object.hasOwn(resaleGate.metadata, 'sectionAnalyses'), false)
assert.equal(Object.hasOwn(resaleGate.metadata, 'signalHits'), false)

const blockedGate = buildOtpContentPublishGateReport({
  packet_type: 'otp',
  metadata_json: { otp_document_variant: 'resale_existing_property' },
  sections: [...resaleSections, developmentUnit],
}, {
  packetType: 'otp',
  routeKey: 'resale_existing_property',
})
assert.equal(blockedGate.canPublish, false)
assert.ok(blockedGate.blockingMessages.some((message) => /outside the allowed OTP route/i.test(message)))
assert.ok(blockedGate.metadata.blockerCodes.includes('OTP_FORBIDDEN_ROUTE_SIGNAL'))

const nonOtpGate = buildOtpContentPublishGateReport({
  packet_type: 'mandate',
  sections: resaleSections,
}, {
  packetType: 'mandate',
})
assert.equal(nonOtpGate.applies, false)
assert.equal(nonOtpGate.canPublish, true)
assert.equal(nonOtpGate.metadata, null)
assert.equal(nonOtpGate.scan, null)

const serialized = serializeOtpContentPublishGateScan(resaleGate, { scannedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(serialized.gateVersion, OTP_CONTENT_PUBLISH_GATE_VERSION)
assert.equal(serialized.scannedAt, '2026-08-03T00:00:00.000Z')
assert.deepEqual(serialized.blockerCodes, [])
assert.equal(Object.hasOwn(serialized, 'scan'), false)
assert.equal(Object.hasOwn(serialized, 'sectionAnalyses'), false)
assert.equal(Object.hasOwn(serialized, 'signalHits'), false)

const report = buildOtpContentGateReport({ generatedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(report.version, OTP_CONTENT_GATE_REPORT_VERSION)
assert.equal(report.mutatedData, false)
assert.equal(report.status, 'OTP_CONTENT_GATE_READY_FOR_LAUNCH_READINESS')
assert.equal(report.summary.routeCount, 2)
assert.equal(report.summary.blockerCount, 0)
assert.equal(report.summary.warningCount, 0)
assert.equal(report.summary.publishableRouteCount, 2)
assert.deepEqual(report.blockers, [])
assert.deepEqual(report.warnings, [])

const markdown = formatOtpContentGateReportMarkdown(report)
for (const token of [
  'OTP Template vNext Phase 7 Content Gate And Scanner',
  'OTP_CONTENT_GATE_READY_FOR_LAUNCH_READINESS',
  'Existing / resale property OTP',
  'New development OTP',
  'development_body_corporate',
  'resale_disclosure_fixtures',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const sourceFiles = [
  '../src/core/documents/otpContentRules.js',
  '../src/core/documents/otpContentScanner.js',
  '../src/core/documents/otpContentPublishGate.js',
  '../src/core/documents/otpContentGateReport.js',
]
for (const sourceFile of sourceFiles) {
  const source = await readFile(new URL(sourceFile, import.meta.url), 'utf8')
  assert.ok(source.includes('phase7'), `${sourceFile} should include the Phase 7 contract version.`)
}

console.log('OTP content gate and scanner Phase 7 contract passed.')
