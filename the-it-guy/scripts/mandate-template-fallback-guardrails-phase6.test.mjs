import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-fallback-guardrails-phase6'],
  'node scripts/mandate-template-fallback-guardrails-phase6.test.mjs',
  'package.json should expose the mandate template fallback guardrails Phase 6 contract.',
)

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

for (const token of [
  'buildMandateTemplateFallbackWarning',
  'withMandateTemplateRoutingWarnings',
  'MANDATE_TEMPLATE_ROUTE_FALLBACK',
  'mandate_template_routing',
  "templateResolution?.source) !== 'mandate_scenario_fallback'",
  'Publish the route-specific template before relying on this packet as final.',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should include ${token}.`)
}

for (const token of [
  'const validation = withMandateTemplateRoutingWarnings(baseValidation, templateResolution)',
  'const rendered = withMandateTemplateRoutingWarnings(renderedPreview, templateResolution)',
  'templateResolutionSource: generationPayload.templateResolutionSource || null',
  'mandateTemplateFallback: Boolean(generationPayload.mandateTemplateFallback)',
  'mandateTemplateFallbackWarning: generationPayload.mandateTemplateFallbackWarning || null',
  'templateResolution: prepared.templateResolution || null',
]) {
  assert.ok(packetServiceSource.includes(token), `Packet generation should persist fallback guardrail field ${token}.`)
}

const summaryIndex = packetServiceSource.indexOf('mandateTemplateFallbackWarning: validation?.mandateTemplateFallbackWarning || null')
const warningIndex = packetServiceSource.indexOf('warnings: dedupeValidationIssues')
const startedEventIndex = packetServiceSource.indexOf("eventType: 'generation_started'")
assert.ok(summaryIndex > -1, 'Validation summaries should retain the fallback warning.')
assert.ok(warningIndex > summaryIndex, 'Fallback guardrail should add a normal warning after summary support exists.')
assert.ok(startedEventIndex > warningIndex, 'Generation events should run after fallback warnings are attached.')

console.log('Mandate template fallback guardrails Phase 6 contract passed.')
