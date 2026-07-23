import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-runtime-gate-phase11'],
  'node scripts/mandate-template-runtime-gate-phase11.test.mjs',
  'package.json should expose the mandate template runtime gate Phase 11 contract.',
)

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

for (const token of [
  'buildMandateTemplateRuntimeContentGate',
  'resolveMandateTemplateRuntimeRouteKey',
  'mapMandateTemplateContentGateIssue',
  'buildMandateTemplatePublishGateReport',
  'formatMandateTemplatePublishGateIssue',
  "source: 'mandate_template_content_gate'",
  'mandateTemplateContentGate',
  'MANDATE_TEMPLATE_CONTENT_GATE_BLOCKED',
  'Mandate template wording does not match the selected route. Fix the template content before generation.',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include runtime content gate token ${token}.`)
}

for (const token of [
  'const contentGate = buildMandateTemplateRuntimeContentGate(validation, templateResolution)',
  'const contentGateBlockers = (contentGate?.blockers || [])',
  'critical: dedupeValidationIssues([',
  '...contentGateBlockers',
  'contentGateBlockers.length || launchReadinessBlockers.length ? false : validation?.isValidForGeneration,',
  'const hasMandateTemplateContentGateBlockingIssues = (validation.critical || []).some(',
  "(issue) => issue?.source === 'mandate_template_content_gate'",
  'if (!validation.isValidForGeneration) {',
]) {
  assert.ok(packetServiceSource.includes(token), `Runtime generation guard should include ${token}.`)
}

assert.doesNotMatch(
  packetServiceSource,
  /allowGenerationBypass|forceGenerate/,
  'Critical mandate validation must never be bypassed during generation.',
)

const contentGateIndex = packetServiceSource.indexOf('const contentGate = buildMandateTemplateRuntimeContentGate(validation, templateResolution)')
const criticalIndex = packetServiceSource.indexOf('critical: dedupeValidationIssues([', contentGateIndex)
const validationBlockIndex = packetServiceSource.indexOf('if (!validation.isValidForGeneration) {')
const errorIndex = packetServiceSource.indexOf('MANDATE_TEMPLATE_CONTENT_GATE_BLOCKED')
assert.ok(contentGateIndex > -1 && criticalIndex > contentGateIndex, 'Runtime content gate blockers should be added to validation critical issues.')
assert.ok(validationBlockIndex > criticalIndex, 'Generation must stop after evaluating decorated critical validation issues.')
assert.ok(errorIndex > validationBlockIndex, 'Content-gate failures should throw a specific generation error.')

const fallbackRouteIndex = packetServiceSource.indexOf("resolutionSource === 'mandate_scenario_fallback'")
const defaultRouteIndex = packetServiceSource.indexOf("return 'default'", fallbackRouteIndex)
assert.ok(fallbackRouteIndex > -1 && defaultRouteIndex > fallbackRouteIndex, 'Fallback default templates should be scanned as default templates.')

for (const token of [
  'mandateTemplateContentGate: validation?.mandateTemplateContentGate || null',
  'mandateTemplateContentGate: rendered.mandateTemplateContentGate || null',
  'mandateTemplateContentGate: generationPayload.mandateTemplateContentGate || null',
]) {
  assert.ok(packetServiceSource.includes(token), `Runtime content gate should persist ${token}.`)
}

console.log('Mandate template runtime gate Phase 11 contract passed.')
