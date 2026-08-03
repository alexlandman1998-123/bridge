import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_TEMPLATE_RUNTIME_ENFORCEMENT_VERSION,
  buildOtpTemplateRuntimeLaunchReadiness,
} from '../src/core/documents/otpTemplateLaunchReadiness.js'
import {
  OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION,
  OTP_TEMPLATE_LIVE_AUDIT_VERSION,
  buildOtpTemplateCorrectiveMigrationPlan,
  buildOtpTemplateLiveAudit,
  formatOtpTemplateLiveAuditMarkdown,
} from '../src/core/documents/otpTemplateLiveAudit.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-runtime-live-audit-migration-phase9'],
  'node scripts/otp-runtime-live-audit-migration-phase9.test.mjs',
  'package.json should expose the OTP runtime/live-audit/migration Phase 9 contract.',
)
assert.equal(
  packageJson.scripts?.['audit:otp-template-live-readiness'],
  'node --env-file=.env --env-file=.env.staging.local scripts/audit-otp-template-live-readiness.mjs',
  'package.json should expose the read-only OTP live audit.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-runtime-live-audit-migration-phase9'),
  'OTP vNext verification should include Phase 9 runtime/live-audit/migration checks.',
)

assert.equal(OTP_TEMPLATE_RUNTIME_ENFORCEMENT_VERSION, 'otp_template_runtime_enforcement_phase9_v1')
assert.equal(OTP_TEMPLATE_LIVE_AUDIT_VERSION, 'otp_template_live_audit_phase9_v1')
assert.equal(OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION, 'otp_template_corrective_migration_plan_phase9_v1')

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

const readyAudit = buildOtpTemplateLiveAudit({
  templates: [resaleTemplate, developmentTemplate],
  checkedAt: '2026-08-03T00:00:00.000Z',
})
assert.equal(readyAudit.auditVersion, OTP_TEMPLATE_LIVE_AUDIT_VERSION)
assert.equal(readyAudit.status, 'OTP_LIVE_AUDIT_READY_FOR_RUNTIME_LOCK')
assert.equal(readyAudit.mutatedData, false)
assert.equal(readyAudit.auditCompleted, true)
assert.equal(readyAudit.summary.readyRouteCount, 2)
assert.equal(readyAudit.summary.blockerCount, 0)
assert.deepEqual(readyAudit.actions, [])

const fallbackTemplate = liveTemplate({
  id: 'otp_default_v1',
  label: 'Default OTP fallback',
  routeKey: '',
  sections: resaleSections,
})
fallbackTemplate.template_key = 'otp_default_v1'
fallbackTemplate.is_default = true
delete fallbackTemplate.metadata_json.otp_document_variant
delete fallbackTemplate.metadata_json.otpDocumentVariant

const blockedAudit = buildOtpTemplateLiveAudit({
  templates: [fallbackTemplate],
  checkedAt: '2026-08-03T00:00:00.000Z',
})
assert.equal(blockedAudit.status, 'OTP_LIVE_AUDIT_REMEDIATION_REQUIRED')
assert.equal(blockedAudit.summary.baselineDefaultCount, 1)
assert.ok(blockedAudit.summary.unsafeFallbackCount >= 1)
assert.ok(blockedAudit.actions.some((action) => action.code === 'OTP_LAUNCH_UNSAFE_FALLBACK'))

const blockedPlanWithoutAudit = buildOtpTemplateCorrectiveMigrationPlan(null)
assert.equal(blockedPlanWithoutAudit.planVersion, OTP_TEMPLATE_CORRECTIVE_MIGRATION_PLAN_VERSION)
assert.equal(blockedPlanWithoutAudit.status, 'OTP_CORRECTIVE_MIGRATION_BLOCKED_AUDIT_REQUIRED')
assert.equal(blockedPlanWithoutAudit.canApply, false)
assert.ok(blockedPlanWithoutAudit.blockers.some((issue) => issue.code === 'OTP_LIVE_AUDIT_REQUIRED'))

const readyPlan = buildOtpTemplateCorrectiveMigrationPlan(readyAudit)
assert.equal(readyPlan.status, 'OTP_CORRECTIVE_MIGRATION_NOT_REQUIRED')
assert.equal(readyPlan.canApply, false)
assert.deepEqual(readyPlan.steps, [])

const ownerlessTemplate = liveTemplate({
  id: 'otp-ownerless',
  label: 'Ownerless Resale OTP',
  routeKey: 'resale_existing_property',
  sections: resaleSections.map((section) => ({
    ...section,
    source_owners: [],
    metadata_json: {
      ...section.metadata_json,
      source_owners: [],
    },
  })),
})
const ownerlessAudit = buildOtpTemplateLiveAudit({
  templates: [ownerlessTemplate, developmentTemplate],
  checkedAt: '2026-08-03T00:00:00.000Z',
})
const correctivePlan = buildOtpTemplateCorrectiveMigrationPlan(ownerlessAudit)
assert.equal(correctivePlan.status, 'OTP_CORRECTIVE_MIGRATION_READY_FOR_DRY_RUN')
assert.equal(correctivePlan.canApply, false)
assert.ok(correctivePlan.steps.some((step) => step.code === 'OTP_LAUNCH_SOURCE_OWNER_MISSING'))

const runtimeReady = buildOtpTemplateRuntimeLaunchReadiness({
  packetType: 'otp',
  validationAction: 'generate',
  legalDocumentScenarioProfile: { otpDocumentVariant: 'resale_existing_property' },
}, {
  source: 'legal_scenario_variant',
  packetType: 'otp',
  template: resaleTemplate,
})
assert.equal(runtimeReady.readinessVersion, OTP_TEMPLATE_RUNTIME_ENFORCEMENT_VERSION)
assert.equal(runtimeReady.status, 'ready')
assert.equal(runtimeReady.shouldBlockGeneration, false)
assert.equal(runtimeReady.canGenerateWithoutFallback, true)

const runtimeFallback = buildOtpTemplateRuntimeLaunchReadiness({
  packetType: 'otp',
  validationAction: 'generate',
  legalDocumentScenarioProfile: { otpDocumentVariant: 'new_development' },
}, {
  source: 'legal_scenario_fallback',
  packetType: 'otp',
  template: fallbackTemplate,
})
assert.equal(runtimeFallback.status, 'blocked')
assert.equal(runtimeFallback.shouldBlockGeneration, true)
assert.ok(runtimeFallback.blockers.some((issue) => issue.code === 'OTP_RUNTIME_UNAPPROVED_FALLBACK'))

const developmentFallbackTemplate = liveTemplate({
  id: 'otp_default_development',
  label: 'Default development-compatible fallback',
  routeKey: '',
  sections: developmentSections,
})
delete developmentFallbackTemplate.metadata_json.otp_document_variant
delete developmentFallbackTemplate.metadata_json.otpDocumentVariant
const runtimeFallbackPreview = buildOtpTemplateRuntimeLaunchReadiness({
  packetType: 'otp',
  validationAction: 'preview',
  legalDocumentScenarioProfile: { otpDocumentVariant: 'new_development' },
}, {
  source: 'legal_scenario_fallback',
  packetType: 'otp',
  template: developmentFallbackTemplate,
})
assert.equal(runtimeFallbackPreview.status, 'attention')
assert.equal(runtimeFallbackPreview.shouldBlockGeneration, false)
assert.ok(runtimeFallbackPreview.warnings.some((issue) => issue.code === 'OTP_RUNTIME_UNAPPROVED_FALLBACK'))

const markdown = formatOtpTemplateLiveAuditMarkdown(readyAudit)
for (const token of [
  'OTP Template vNext Phase 9 Runtime Enforcement, Live Audit, And Migration',
  'OTP_LIVE_AUDIT_READY_FOR_RUNTIME_LOCK',
  'Mutated data: false',
]) {
  assert.ok(markdown.includes(token), `live audit markdown should include ${token}`)
}

for (const token of [
  'buildOtpTemplateRuntimeContentGate',
  'buildOtpTemplateRuntimeLaunchReadiness',
  'mapOtpTemplateContentGateIssue',
  'mapOtpTemplateLaunchReadinessIssue',
  "source: 'otp_template_content_gate'",
  "source: 'otp_template_launch_readiness'",
  'otpTemplateContentGate',
  'otpTemplateLaunchReadiness',
  'OTP_TEMPLATE_CONTENT_GATE_BLOCKED',
  'OTP_TEMPLATE_LAUNCH_READINESS_BLOCKED',
  'OTP template wording does not match the selected route. Fix the template content before generation.',
  'OTP template launch readiness is blocked. Publish the verified resale or new-development route template before generation.',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include runtime OTP enforcement token ${token}.`)
}

const contentGateIndex = packetServiceSource.indexOf('const otpContentGate = buildOtpTemplateRuntimeContentGate(validation, templateResolution)')
const criticalIndex = packetServiceSource.indexOf('critical: dedupeValidationIssues([', contentGateIndex)
const validationBlockIndex = packetServiceSource.indexOf('if (!validation.isValidForGeneration) {')
const otpErrorIndex = packetServiceSource.indexOf('OTP_TEMPLATE_CONTENT_GATE_BLOCKED')
assert.ok(contentGateIndex > -1 && criticalIndex > contentGateIndex, 'OTP runtime content gate blockers should be added to critical validation issues.')
assert.ok(validationBlockIndex > criticalIndex, 'Generation must stop after OTP runtime validation decoration.')
assert.ok(otpErrorIndex > validationBlockIndex, 'OTP content-gate failures should throw a specific generation error.')

for (const token of [
  'otpTemplateContentGate: validation?.otpTemplateContentGate || null',
  'otpTemplateLaunchReadiness: validation?.otpTemplateLaunchReadiness || null',
  'otpTemplateContentGate: rendered.otpTemplateContentGate || null',
  'otpTemplateLaunchReadiness: rendered.otpTemplateLaunchReadiness || null',
  'otpTemplateContentGate: generationPayload.otpTemplateContentGate || null',
  'otpTemplateLaunchReadiness: generationPayload.otpTemplateLaunchReadiness || null',
]) {
  assert.ok(packetServiceSource.includes(token), `Runtime OTP gate should persist ${token}.`)
}

const auditScript = await readFile(new URL('../scripts/audit-otp-template-live-readiness.mjs', import.meta.url), 'utf8')
for (const token of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'document_packet_templates',
  'document_template_sections',
  'buildOtpTemplateLiveAudit',
  'buildOtpTemplateCorrectiveMigrationPlan',
  'mutatedData: false',
]) {
  assert.ok(auditScript.includes(token), `Live audit script should include ${token}.`)
}

console.log('OTP runtime enforcement, live audit and migration Phase 9 contract passed.')
