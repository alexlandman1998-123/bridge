import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_LIVE_TEMPLATE_OUTPUT_FORMAT,
  OTP_LIVE_TEMPLATE_RENDER_MODE,
  OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS,
  OTP_PHASE0_ROUTE_SEPARATION_RULES,
  OTP_TEMPLATE_TARGET_FREEZE_RULES,
  OTP_TEMPLATE_TARGET_FREEZE_VERSION,
  OTP_TARGET_ROUTE_TEMPLATES,
  OTP_TRANSITION_TEMPLATE_KEY,
  assessOtpTemplatePhase0LaunchLock,
  buildOtpTemplateTargetFreezeAudit,
  getOtpRouteSeparationRule,
  getOtpTargetTemplateKeys,
  getOtpTargetRouteTemplate,
  isOtpTransitionTemplateKey,
  listOtpLiveTemplateRequirements,
  listOtpRouteSeparationRules,
  listOtpTargetRouteTemplates,
} from '../src/core/documents/otpTemplateTargetFreeze.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from '../src/core/documents/otpRouteUniverse.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-template-target-freeze-phase0'],
  'node scripts/otp-template-target-freeze-phase0.test.mjs',
  'package.json should expose the OTP template target freeze Phase 0 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0'),
  'OTP vNext verification should start with the Phase 0 target freeze.',
)

assert.equal(OTP_TEMPLATE_TARGET_FREEZE_VERSION, 'otp_template_target_freeze_phase0_v1')
assert.equal(OTP_TRANSITION_TEMPLATE_KEY, 'otp_default_v1')
assert.equal(OTP_LIVE_TEMPLATE_RENDER_MODE, 'native_structured')
assert.equal(OTP_LIVE_TEMPLATE_OUTPUT_FORMAT, 'pdf')
assert.equal(OTP_TARGET_ROUTE_TEMPLATES.length, 2)
assert.deepEqual(
  OTP_TARGET_ROUTE_TEMPLATES.map((target) => target.routeKey),
  OTP_DOCUMENT_VARIANTS.map((variant) => variant.key),
  'Every first-class OTP variant should have a frozen target template key.',
)
assert.deepEqual(
  OTP_TARGET_ROUTE_TEMPLATES.map((target) => target.templateKey),
  ['otp_resale_existing_property_v1', 'otp_new_development_v1'],
  'Phase 0 should freeze the route-specific OTP target template keys.',
)
assert.ok(
  !OTP_TARGET_ROUTE_TEMPLATES.some((target) => target.templateKey === OTP_TRANSITION_TEMPLATE_KEY),
  'The transition default must not be declared as a route-specific target template.',
)
assert.deepEqual(
  getOtpTargetTemplateKeys(),
  ['otp_resale_existing_property_v1', 'otp_new_development_v1'],
  'Phase 0 should expose the frozen route template keys to later launch locks.',
)
assert.equal(isOtpTransitionTemplateKey('otp_default_v1'), true)
assert.equal(isOtpTransitionTemplateKey('otp_resale_existing_property_v1'), false)

const resaleTarget = getOtpTargetRouteTemplate('resale_existing_property')
assert.equal(resaleTarget.templateKey, 'otp_resale_existing_property_v1')
assert.equal(resaleTarget.defaultRole, 'primary_resale_otp')

const developmentTarget = getOtpTargetRouteTemplate('new_development')
assert.equal(developmentTarget.templateKey, 'otp_new_development_v1')
assert.equal(developmentTarget.defaultRole, 'primary_new_development_otp')

assert.deepEqual(listOtpTargetRouteTemplates(), OTP_TARGET_ROUTE_TEMPLATES.map((target) => ({ ...target })))
assert.deepEqual(listOtpLiveTemplateRequirements(), OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS.map((requirement) => ({ ...requirement })))
assert.equal(OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS.length, 9)
assert.deepEqual(
  OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS.map((requirement) => requirement.code),
  [
    'route_specific_template_key',
    'canonical_packet_bound_pdf',
    'route_metadata',
    'branded_shell',
    'content_scan',
    'source_owner_metadata',
    'render_validation',
    'signature_geometry',
    'counsel_approval',
  ],
)
assert.equal(OTP_PHASE0_ROUTE_SEPARATION_RULES.length, 2)
assert.deepEqual(listOtpRouteSeparationRules(), OTP_PHASE0_ROUTE_SEPARATION_RULES.map((rule) => ({
  ...rule,
  requiredContentFamilies: [...rule.requiredContentFamilies],
  forbiddenContentFamilies: [...rule.forbiddenContentFamilies],
})))
assert.deepEqual(
  getOtpRouteSeparationRule('resale_existing_property').forbiddenContentFamilies,
  ['development_unit', 'development_defects', 'body_corporate'],
  'Resale OTP must explicitly exclude development-only clause families.',
)
assert.deepEqual(
  getOtpRouteSeparationRule('new_development').forbiddenContentFamilies,
  ['fixtures_defects_disclosure', 'occupation_rent'],
  'New-development OTP must explicitly exclude resale-only clause families.',
)
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_DEFAULT_TRANSITION_ONLY'),
  'Phase 0 should explicitly mark otp_default_v1 as transition-only.',
)
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_ROUTE_TEMPLATE_LOCK_REQUIRED'),
  'Phase 0 should require route metadata, content scan, render validation and approval before replacing the transition default.',
)
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_CANONICAL_PDF_ONLY'),
  'Phase 0 should make canonical packet-bound PDF output a blocking rule.',
)
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_RESALE_DEVELOPMENT_SEPARATION_REQUIRED'),
  'Phase 0 should make resale/new-development separation a blocking rule.',
)

const transitionAssessment = assessOtpTemplatePhase0LaunchLock({
  template: {
    packet_type: 'otp',
    template_key: 'otp_default_v1',
    metadata_json: {
      otp_document_variant: 'resale_existing_property',
      render_mode: 'legacy_docx',
    },
  },
})
assert.equal(transitionAssessment.launchReady, false)
assert.equal(transitionAssessment.status, 'OTP_PHASE0_LAUNCH_LOCK_BLOCKED')
assert.ok(
  transitionAssessment.blockers.some((blocker) => blocker.code === 'OTP_PHASE0_TRANSITION_TEMPLATE_BLOCKED'),
  'The transition default must be blocked from live launch.',
)
assert.ok(
  transitionAssessment.blockers.some((blocker) => blocker.code === 'OTP_PHASE0_NATIVE_STRUCTURED_RENDER_REQUIRED'),
  'Legacy DOCX-style render metadata must be blocked from live OTP launch.',
)

const routeMismatchAssessment = assessOtpTemplatePhase0LaunchLock({
  template: {
    packet_type: 'otp',
    template_key: 'otp_resale_existing_property_v1',
    metadata_json: {
      otp_document_variant: 'new_development',
      render_mode: 'native_structured',
      canonical_packet_bound_pdf: true,
      shell_layout_contract: 'otp_branded_shell_layout_phase5_v1',
      signature_layout_contract: 'otp_branded_shell_signature_layout_phase5_v1',
      otp_content_scan: { current: true, passed: true },
      render_validation: { current: true, renderable: true },
      source_owner_metadata_current: true,
      counsel_approved: true,
      content_families: ['definitions', 'parties', 'development_unit', 'purchase_price', 'suspensive_conditions', 'development_defects', 'body_corporate', 'transfer_conveyancer', 'special_conditions', 'offer_acceptance'],
    },
  },
})
assert.equal(routeMismatchAssessment.launchReady, false)
assert.ok(
  routeMismatchAssessment.blockers.some((blocker) => blocker.code === 'OTP_PHASE0_ROUTE_TEMPLATE_MISMATCH'),
  'A resale template key cannot be used for a new-development route.',
)

const wrongRouteContentAssessment = assessOtpTemplatePhase0LaunchLock({
  template: {
    packet_type: 'otp',
    template_key: 'otp_new_development_v1',
    metadata_json: {
      otp_document_variant: 'new_development',
      render_mode: 'native_structured',
      canonical_packet_bound_pdf: true,
      shell_layout_contract: 'otp_branded_shell_layout_phase5_v1',
      signature_layout_contract: 'otp_branded_shell_signature_layout_phase5_v1',
      otp_content_scan: { current: true, passed: true },
      render_validation: { current: true, renderable: true },
      source_owner_metadata_current: true,
      counsel_approved: true,
      content_families: ['definitions', 'parties', 'development_unit', 'purchase_price', 'suspensive_conditions', 'development_defects', 'body_corporate', 'transfer_conveyancer', 'special_conditions', 'offer_acceptance', 'fixtures_defects_disclosure'],
    },
  },
})
assert.equal(wrongRouteContentAssessment.launchReady, false)
assert.ok(
  wrongRouteContentAssessment.blockers.some((blocker) => blocker.code === 'OTP_PHASE0_ROUTE_FORBIDDEN_CONTENT_PRESENT'),
  'New-development OTP must be blocked when resale-only content families are present.',
)

const compliantResaleAssessment = assessOtpTemplatePhase0LaunchLock({
  template: {
    packet_type: 'otp',
    template_key: 'otp_resale_existing_property_v1',
    metadata_json: {
      otp_document_variant: 'resale_existing_property',
      render_mode: 'native_structured',
      output_format: 'pdf',
      canonical_packet_bound_pdf: true,
      shell_layout_contract: 'otp_branded_shell_layout_phase5_v1',
      signature_layout_contract: 'otp_branded_shell_signature_layout_phase5_v1',
      otp_content_scan: { current: true, passed: true },
      render_validation: { current: true, renderable: true },
      source_owner_metadata_current: true,
      counsel_approved: true,
      content_families: ['definitions', 'parties', 'property', 'purchase_price', 'suspensive_conditions', 'occupation_rent', 'fixtures_defects_disclosure', 'transfer_conveyancer', 'special_conditions', 'offer_acceptance'],
    },
  },
})
assert.equal(compliantResaleAssessment.launchReady, true)
assert.equal(compliantResaleAssessment.status, 'OTP_PHASE0_LAUNCH_LOCK_READY')
assert.deepEqual(compliantResaleAssessment.blockers, [])

const audit = buildOtpTemplateTargetFreezeAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_TARGET_FREEZE_VERSION)
assert.equal(audit.status, 'OTP_TEMPLATE_TARGET_FROZEN')
assert.equal(audit.mutatedData, false)
assert.equal(audit.transitionTemplateKey, OTP_TRANSITION_TEMPLATE_KEY)
assert.equal(audit.transitionTemplateRole, 'starter_fallback_only')
assert.equal(audit.summary.routeVariantCount, 2)
assert.equal(audit.summary.targetRouteTemplateCount, 2)
assert.equal(audit.summary.liveTemplateRequirementCount, 9)
assert.equal(audit.summary.routeSeparationRuleCount, 2)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

console.log('OTP template target freeze Phase 0 contract passed.')
