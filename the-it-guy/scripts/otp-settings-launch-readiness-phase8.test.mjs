import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_TEMPLATE_LAUNCH_READINESS_VERSION,
  buildOtpTemplateAuditTemplateRow,
  buildOtpTemplateLaunchReadiness,
  formatOtpTemplateLaunchReadinessIssue,
} from '../src/core/documents/otpTemplateLaunchReadiness.js'
import {
  OTP_CONTENT_PUBLISH_GATE_VERSION,
  buildOtpContentPublishGateReport,
} from '../src/core/documents/otpContentPublishGate.js'
import {
  OTP_CONTENT_RULE_VERSION,
} from '../src/core/documents/otpContentRules.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const settingsSource = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-settings-launch-readiness-phase8'],
  'node scripts/otp-settings-launch-readiness-phase8.test.mjs',
  'package.json should expose the OTP Settings launch readiness Phase 8 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-settings-launch-readiness-phase8'),
  'OTP vNext verification should include Phase 8 Settings launch readiness checks.',
)

assert.equal(OTP_TEMPLATE_LAUNCH_READINESS_VERSION, 'otp_template_launch_readiness_phase8_v1')

const resaleSections = listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalContentTemplateSections({ variant: 'new_development' })

function liveTemplate({ id, label, routeKey, sections, metadata = {} }) {
  return {
    id,
    packet_type: 'otp',
    template_key: id,
    template_label: label,
    template_status: 'published',
    is_active: true,
    is_default: false,
    metadata_json: {
      packet_type: 'otp',
      lifecycle_status: 'published',
      render_mode: 'native_structured',
      last_render_validation: { renderable: true, blockingIssues: [], warnings: [] },
      ...(routeKey ? { otp_document_variant: routeKey, otpDocumentVariant: routeKey } : {}),
      ...metadata,
    },
    sections,
  }
}

const resaleTemplate = liveTemplate({
  id: 'otp-resale',
  label: 'Resale OTP',
  routeKey: 'resale_existing_property',
  sections: resaleSections,
})
const developmentTemplate = liveTemplate({
  id: 'otp-development',
  label: 'Development OTP',
  routeKey: 'new_development',
  sections: developmentSections,
})

const ready = buildOtpTemplateLaunchReadiness([resaleTemplate, developmentTemplate])
assert.equal(ready.readinessVersion, OTP_TEMPLATE_LAUNCH_READINESS_VERSION)
assert.equal(ready.gateVersion, OTP_CONTENT_PUBLISH_GATE_VERSION)
assert.equal(ready.ruleVersion, OTP_CONTENT_RULE_VERSION)
assert.equal(ready.status, 'ready')
assert.equal(ready.canEnableOtpAutomation, true)
assert.equal(ready.summary.requiredRouteCount, 2)
assert.equal(ready.summary.readyRouteCount, 2)
assert.equal(ready.summary.blockerCount, 0)
assert.equal(ready.summary.unsafeFallbackCount, 0)
assert.equal(ready.summary.sourceOwnerGapCount, 0)
assert.deepEqual(ready.blockers, [])
assert.deepEqual(ready.routeRows.map((row) => row.routeKey), ['resale_existing_property', 'new_development'])

const resaleRow = buildOtpTemplateAuditTemplateRow(resaleTemplate)
assert.equal(resaleRow.validForGeneration, true)
assert.equal(resaleRow.fallback, false)
assert.equal(resaleRow.status, 'ready')

const fallbackOnly = liveTemplate({
  id: 'otp-default',
  label: 'Default OTP fallback',
  routeKey: '',
  sections: resaleSections,
})
fallbackOnly.is_default = true
delete fallbackOnly.metadata_json.otp_document_variant
delete fallbackOnly.metadata_json.otpDocumentVariant
const fallbackReadiness = buildOtpTemplateLaunchReadiness([fallbackOnly])
assert.equal(fallbackReadiness.status, 'blocked')
assert.ok(fallbackReadiness.blockers.some((issue) => issue.code === 'OTP_LAUNCH_ROUTE_MISSING' && issue.routeKey === 'new_development'))
assert.ok(fallbackReadiness.blockers.some((issue) => issue.code === 'OTP_LAUNCH_UNSAFE_FALLBACK'))
assert.equal(fallbackReadiness.summary.unsafeFallbackCount, 1)
assert.equal(fallbackReadiness.summary.liveFallbackTemplateCount, 1)

const badResaleTemplate = liveTemplate({
  id: 'otp-resale-bad',
  label: 'Bad Resale OTP',
  routeKey: 'resale_existing_property',
  sections: [...resaleSections, developmentSections.find((section) => section.section_key === 'development_unit')],
})
const badReadiness = buildOtpTemplateLaunchReadiness([badResaleTemplate, developmentTemplate])
assert.equal(badReadiness.status, 'blocked')
assert.ok(badReadiness.blockers.some((issue) => issue.code === 'OTP_FORBIDDEN_ROUTE_SIGNAL'))

const staleScanTemplate = {
  id: 'otp-stale',
  packet_type: 'otp',
  template_key: 'otp-stale',
  template_label: 'Stale Resale OTP',
  template_status: 'published',
  is_active: true,
  metadata_json: {
    packet_type: 'otp',
    lifecycle_status: 'published',
    otp_document_variant: 'resale_existing_property',
    render_mode: 'native_structured',
    last_render_validation: { renderable: true, blockingIssues: [], warnings: [] },
    last_otp_content_scan: {
      gateVersion: 'old_gate',
      ruleVersion: OTP_CONTENT_RULE_VERSION,
      routeKey: 'resale_existing_property',
      isValidForPublish: true,
      blockers: [],
      warnings: [],
    },
  },
}
const staleReadiness = buildOtpTemplateLaunchReadiness([staleScanTemplate, developmentTemplate])
assert.equal(staleReadiness.status, 'blocked')
assert.ok(staleReadiness.blockers.some((issue) => issue.code === 'OTP_LAUNCH_LIVE_TEMPLATE_STALE_SCAN'))
assert.equal(staleReadiness.summary.staleScanCount, 1)

const ownerlessSections = resaleSections.map((section) => ({
  ...section,
  source_owners: [],
  metadata_json: {
    ...section.metadata_json,
    source_owners: [],
  },
}))
const ownerlessTemplate = liveTemplate({
  id: 'otp-ownerless',
  label: 'Ownerless Resale OTP',
  routeKey: 'resale_existing_property',
  sections: ownerlessSections,
})
const ownerlessReadiness = buildOtpTemplateLaunchReadiness([ownerlessTemplate, developmentTemplate])
assert.equal(ownerlessReadiness.status, 'blocked')
assert.ok(ownerlessReadiness.blockers.some((issue) => issue.code === 'OTP_LAUNCH_SOURCE_OWNER_MISSING'))
assert.ok(ownerlessReadiness.summary.sourceOwnerGapCount > 0)

const blankRiskTemplate = {
  id: 'otp-blank-risk',
  packet_type: 'otp',
  template_key: 'otp-blank-risk',
  template_label: 'Blank Risk OTP',
  template_status: 'published',
  is_active: true,
  metadata_json: {
    packet_type: 'otp',
    lifecycle_status: 'published',
    otp_document_variant: 'resale_existing_property',
    render_mode: 'native_structured',
    last_otp_content_scan: buildOtpContentPublishGateReport({
      packet_type: 'otp',
      metadata_json: { otp_document_variant: 'resale_existing_property' },
      sections: resaleSections,
    }, {
      packetType: 'otp',
      routeKey: 'resale_existing_property',
    }).metadata,
  },
}
const blankRiskReadiness = buildOtpTemplateLaunchReadiness([blankRiskTemplate, developmentTemplate])
assert.equal(blankRiskReadiness.status, 'blocked')
assert.ok(blankRiskReadiness.blockers.some((issue) => issue.code === 'OTP_LAUNCH_BLANK_RENDER_RISK'))
assert.equal(blankRiskReadiness.summary.blankRenderRiskCount, 1)

assert.match(
  formatOtpTemplateLaunchReadinessIssue({
    message: 'OTP route is blocked.',
    remediation: 'Publish a verified route template.',
  }),
  /Publish a verified route template/,
)

for (const token of [
  'buildOtpContentPublishGateReport',
  'serializeOtpContentPublishGateScan',
  'buildOtpTemplateLaunchReadiness',
  'resolveOtpTemplateLaunchRouteKey',
  'otpLaunchReadiness',
  'OTP automation is locked',
  'Unsafe fallback',
  'Source gaps',
  'OTP Content Gate',
  'OTP content scanner found blockers',
  'last_otp_content_scan',
  'otp_content_publish_gate_version',
  'OTP Scan',
]) {
  assert.ok(settingsSource.includes(token), `SettingsSigningTemplatesPage should include ${token}.`)
}

const coverageIndex = settingsSource.indexOf('OTP Template Coverage')
const readinessIndex = settingsSource.indexOf('OTP automation is locked')
assert.ok(coverageIndex > -1, 'Settings page should keep OTP routing coverage.')
assert.ok(readinessIndex > coverageIndex, 'Settings page should place OTP launch readiness after routing coverage.')

console.log('OTP Settings launch readiness Phase 8 contract passed.')
