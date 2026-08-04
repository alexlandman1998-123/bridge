import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_TEMPLATE_TARGET_FREEZE_RULES,
  OTP_TEMPLATE_TARGET_FREEZE_VERSION,
  OTP_TARGET_ROUTE_TEMPLATES,
  OTP_TRANSITION_TEMPLATE_KEY,
  buildOtpTemplateTargetFreezeAudit,
  getOtpTargetRouteTemplate,
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

const resaleTarget = getOtpTargetRouteTemplate('resale_existing_property')
assert.equal(resaleTarget.templateKey, 'otp_resale_existing_property_v1')
assert.equal(resaleTarget.defaultRole, 'primary_resale_otp')

const developmentTarget = getOtpTargetRouteTemplate('new_development')
assert.equal(developmentTarget.templateKey, 'otp_new_development_v1')
assert.equal(developmentTarget.defaultRole, 'primary_new_development_otp')

assert.deepEqual(listOtpTargetRouteTemplates(), OTP_TARGET_ROUTE_TEMPLATES.map((target) => ({ ...target })))
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_DEFAULT_TRANSITION_ONLY'),
  'Phase 0 should explicitly mark otp_default_v1 as transition-only.',
)
assert.ok(
  OTP_TEMPLATE_TARGET_FREEZE_RULES.some((rule) => rule.code === 'OTP_ROUTE_TEMPLATE_LOCK_REQUIRED'),
  'Phase 0 should require route metadata, content scan, render validation and approval before replacing the transition default.',
)

const audit = buildOtpTemplateTargetFreezeAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_TARGET_FREEZE_VERSION)
assert.equal(audit.status, 'OTP_TEMPLATE_TARGET_FROZEN')
assert.equal(audit.mutatedData, false)
assert.equal(audit.transitionTemplateKey, OTP_TRANSITION_TEMPLATE_KEY)
assert.equal(audit.transitionTemplateRole, 'starter_fallback_only')
assert.equal(audit.summary.routeVariantCount, 2)
assert.equal(audit.summary.targetRouteTemplateCount, 2)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

console.log('OTP template target freeze Phase 0 contract passed.')
