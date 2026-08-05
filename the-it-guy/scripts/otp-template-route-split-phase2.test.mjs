import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildLegalDocumentTemplateRouteSignature,
  buildLegalDocumentTemplateRoutingAudit,
  resolveLegalDocumentTemplateRoutingMetadata,
  scoreLegalDocumentTemplateCandidate,
  selectLegalDocumentTemplateCandidate,
} from '../src/core/documents/legalDocumentTemplateRouting.js'
import {
  OTP_TEMPLATE_ROUTE_SPLIT_STATUS_READY,
  OTP_TEMPLATE_ROUTE_SPLIT_VERSION,
  buildOtpTemplateRouteSplitAudit,
  buildOtpTemplateRouteSplitDecision,
  formatOtpTemplateRouteSplitMarkdown,
  resolveOtpRouteSplitSignal,
  resolveOtpRouteSplitTemplateKey,
} from '../src/core/documents/otpTemplateRouteSplit.js'
import {
  OTP_TRANSITION_TEMPLATE_KEY,
} from '../src/core/documents/otpTemplateTargetFreeze.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-template-route-split-phase2'],
  'node scripts/otp-template-route-split-phase2.test.mjs',
  'package.json should expose the OTP route split Phase 2 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0 && npm run test:otp-reference-extraction-phase1 && npm run test:otp-template-shell-target-phase1 && npm run test:otp-template-route-split-phase2'),
  'OTP vNext verification should run the Phase 2 route split after the Phase 1 shell target.',
)

assert.equal(OTP_TEMPLATE_ROUTE_SPLIT_VERSION, 'otp_template_route_split_phase2_v1')
assert.equal(OTP_TEMPLATE_ROUTE_SPLIT_STATUS_READY, 'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING')

const explicitResale = buildOtpTemplateRouteSplitDecision({
  placeholders: { otp_document_variant: 'resale_existing_property' },
})
assert.equal(explicitResale.status, 'route_split_ready')
assert.equal(explicitResale.routeKey, 'resale_existing_property')
assert.equal(explicitResale.source, 'explicit_route_signal')
assert.equal(explicitResale.selectedTemplateKey, 'otp_resale_existing_property_v1')
assert.equal(explicitResale.mayUseTransitionFallback, false)
assert.equal(explicitResale.transitionTemplateKey, OTP_TRANSITION_TEMPLATE_KEY)
assert.equal(explicitResale.legalDocumentScenarioProfile.otpDocumentVariant, 'resale_existing_property')
assert.equal(explicitResale.legalDocumentTemplateRouting.otpDocumentVariant, 'resale_existing_property')

const explicitDevelopment = buildOtpTemplateRouteSplitDecision({
  placeholders: { otp_document_variant: 'new_development' },
})
assert.equal(explicitDevelopment.status, 'route_split_ready')
assert.equal(explicitDevelopment.routeKey, 'new_development')
assert.equal(explicitDevelopment.source, 'explicit_route_signal')
assert.equal(explicitDevelopment.selectedTemplateKey, 'otp_new_development_v1')
assert.equal(explicitDevelopment.legalDocumentScenarioProfile.otpDocumentVariant, 'new_development')

const offPlan = buildOtpTemplateRouteSplitDecision({
  transaction: { transaction_type: 'off_plan' },
})
assert.equal(offPlan.status, 'route_split_ready')
assert.equal(offPlan.routeKey, 'new_development')
assert.equal(offPlan.source, 'explicit_route_signal')
assert.equal(offPlan.selectedTemplateKey, 'otp_new_development_v1')

const developmentIdentity = buildOtpTemplateRouteSplitDecision({
  property: { development_id: 'development-123' },
})
assert.equal(developmentIdentity.status, 'route_split_ready')
assert.equal(developmentIdentity.routeKey, 'new_development')
assert.equal(developmentIdentity.source, 'inferred_new_development_signal')
assert.equal(developmentIdentity.selectedTemplateKey, 'otp_new_development_v1')
assert.equal(developmentIdentity.developmentSignals[0].type, 'development_identity')

const developmentUnit = resolveOtpRouteSplitSignal({
  property: { title_type: 'new_development_unit' },
})
assert.equal(developmentUnit.routeKey, 'new_development')
assert.equal(developmentUnit.source, 'inferred_new_development_signal')
assert.equal(developmentUnit.developmentSignals[0].type, 'development_property_title')

const defaultResale = buildOtpTemplateRouteSplitDecision({})
assert.equal(defaultResale.status, 'route_split_ready')
assert.equal(defaultResale.routeKey, 'resale_existing_property')
assert.equal(defaultResale.source, 'default_resale_existing_property')
assert.equal(defaultResale.selectedTemplateKey, 'otp_resale_existing_property_v1')

assert.equal(
  resolveOtpRouteSplitTemplateKey({ transaction: { transaction_type: 'development_sale' } }),
  'otp_new_development_v1',
)
assert.equal(
  resolveOtpRouteSplitTemplateKey({ transaction: { transaction_type: 'normal_sale' } }),
  'otp_resale_existing_property_v1',
)

const conflict = buildOtpTemplateRouteSplitDecision({
  placeholders: { otp_document_variant: 'normal_sale' },
  property: { development_id: 'development-123' },
})
assert.equal(conflict.status, 'route_split_blocked')
assert.equal(conflict.routeKey, 'resale_existing_property')
assert.equal(conflict.selectedTemplateKey, 'otp_resale_existing_property_v1')
assert.ok(conflict.blockers.some((issue) => issue.code === 'OTP_ROUTE_SPLIT_CONFLICTING_DEVELOPMENT_SIGNALS'))

const resaleTemplate = {
  id: 'resale',
  packet_type: 'otp',
  template_key: 'otp_resale_existing_property_v1',
  metadata_json: {
    packet_type: 'otp',
    otp_document_variant: 'resale_existing_property',
  },
}
const developmentTemplate = {
  id: 'development',
  packet_type: 'otp',
  template_key: 'otp_new_development_v1',
  metadata_json: {
    packet_type: 'otp',
    otpDocumentVariant: 'new_development',
  },
}

const resaleMetadata = resolveLegalDocumentTemplateRoutingMetadata(resaleTemplate)
assert.deepEqual(resaleMetadata.otpDocumentVariants, ['resale_existing_property'])
assert.equal(resaleMetadata.hasRoutingMetadata, true)

const developmentMetadata = resolveLegalDocumentTemplateRoutingMetadata(developmentTemplate)
assert.deepEqual(developmentMetadata.otpDocumentVariants, ['new_development'])
assert.equal(developmentMetadata.hasRoutingMetadata, true)

const resaleSelection = selectLegalDocumentTemplateCandidate([
  developmentTemplate,
  resaleTemplate,
], {
  scenarioProfile: explicitResale.legalDocumentScenarioProfile,
})
assert.equal(resaleSelection.template.id, 'resale')
assert.ok(resaleSelection.reasons.includes('otp_document_variant_metadata'))

const developmentSelection = selectLegalDocumentTemplateCandidate([
  resaleTemplate,
  developmentTemplate,
], {
  scenarioProfile: explicitDevelopment.legalDocumentScenarioProfile,
})
assert.equal(developmentSelection.template.id, 'development')
assert.ok(developmentSelection.reasons.includes('otp_document_variant_metadata'))

const wrongDevelopmentForResale = scoreLegalDocumentTemplateCandidate(developmentTemplate, {
  scenarioProfile: explicitResale.legalDocumentScenarioProfile,
})
assert.equal(wrongDevelopmentForResale.compatible, false)
assert.deepEqual(wrongDevelopmentForResale.reasons, ['otp_document_variant_mismatch'])

const routingAudit = buildLegalDocumentTemplateRoutingAudit(resaleSelection)
assert.equal(routingAudit.otpDocumentVariant, 'resale_existing_property')
assert.deepEqual(routingAudit.otpTemplateRouteVariants, ['resale_existing_property'])

assert.ok(buildLegalDocumentTemplateRouteSignature(resaleTemplate).includes('otp_variant:resale_existing_property'))
assert.ok(buildLegalDocumentTemplateRouteSignature(developmentTemplate).includes('otp_variant:new_development'))

const audit = buildOtpTemplateRouteSplitAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_ROUTE_SPLIT_VERSION)
assert.equal(audit.status, OTP_TEMPLATE_ROUTE_SPLIT_STATUS_READY)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.transitionTemplateSelected, false)
assert.equal(audit.summary.conflictBlocked, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const code of [
  'PHASE2_ROUTE_TARGETS_AVAILABLE',
  'PHASE2_NO_TRANSITION_TEMPLATE_SELECTION',
  'PHASE2_DEFAULT_ROUTE_IS_RESALE',
  'PHASE2_DEVELOPMENT_SIGNALS_SELECT_DEVELOPMENT_TEMPLATE',
  'PHASE2_RESALE_SIGNALS_SELECT_RESALE_TEMPLATE',
  'PHASE2_CONFLICTING_ROUTE_SIGNALS_BLOCKED',
  'PHASE2_RESALE_CANNOT_SCORE_DEVELOPMENT_TEMPLATE',
  'PHASE2_DEVELOPMENT_CANNOT_SCORE_RESALE_TEMPLATE',
]) {
  assert.equal(audit.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatOtpTemplateRouteSplitMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 2 Route Split',
  'OTP_TEMPLATE_ROUTE_SPLIT_READY_FOR_RUNTIME_WIRING',
  'otp_resale_existing_property_v1',
  'otp_new_development_v1',
  'Transition template selected',
  'Conflict blocked',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template route split Phase 2 contract passed.')
