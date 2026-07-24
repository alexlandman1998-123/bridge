import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const containment = await readFile(new URL('../src/core/documents/documentGenerationContainment.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:legal-template-platform-defaults-phase3'],
  'node scripts/legal-template-platform-defaults-phase3.test.mjs',
  'package.json should expose the Phase 3 platform-default routing contract.',
)

for (const token of [
  'assessLegalTemplateApproval',
  'requiresApprovedAutomaticLegalRoutingTemplate',
  'templateCanParticipateInAutomaticLegalRouting',
  'templateIsApprovedForAutomaticLegalRouting',
  "validationAction) && ['mandate', 'otp'].includes(normalizedPacketType)",
]) {
  assert.ok(packetService.includes(token), `packetService should enforce approved automatic routing: ${token}`)
}

assert.ok(
  packetService.match(/if \(!templateCanParticipateInAutomaticLegalRouting\(template,[\s\S]*?continue/g)?.length >= 2,
  'Both mandate and OTP automatic routing should skip unapproved candidates.',
)

for (const token of [
  'isDefaultTemplateRouteFallback',
  'platform_default_can_route_without_org_template',
  'mandate_scenario_fallback',
  'legal_scenario_fallback',
  'defaultFallbackAllowed',
]) {
  assert.ok(containment.includes(token), `containment policy should allow approved default fallback routing: ${token}`)
}

console.log('Legal template platform defaults Phase 3 contract passed.')
