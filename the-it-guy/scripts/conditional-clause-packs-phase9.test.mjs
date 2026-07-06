import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packetPanel = await readFile(new URL('../src/components/documents/DocumentPacketWorkflowPanel.jsx', import.meta.url), 'utf8')
const phase8Test = await readFile(new URL('./conditional-clause-packs-phase8.test.mjs', import.meta.url), 'utf8')

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase9'],
  'node scripts/conditional-clause-packs-phase9.test.mjs',
  'package.json should expose the conditional clause packs Phase 9 contract.',
)

for (const token of [
  'function getConditionalPackAuditMissingFields',
  'function getConditionalPackAuditRequiredFields',
  'function buildConditionalPackAuditSignalRows',
  'showAuditDetails = false',
  'const conditionalPackAudit = validation?.conditionalPackAudit',
  'const activePackAudits = Array.isArray(conditionalPackAudit?.activePacks)',
  'const inactivePackAudits = Array.isArray(conditionalPackAudit?.inactivePacks)',
  'const conditionalPackRows = activePackAudits.length ? activePackAudits : conditionalPackDataRequirements',
  'Clause Pack Trace',
  'Activation signals',
  'Document triggers',
  'Inactive packs',
  'showAuditDetails={canManagePacketAdminActions}',
]) {
  assertIncludes(packetPanel, token, `DocumentPacketWorkflowPanel should surface admin audit trace: ${token}`)
}

assert.ok(
  packetPanel.indexOf('Active Conditional Packs') < packetPanel.indexOf('Clause Pack Trace'),
  'The active-pack readiness summary should remain the first thing users see before the deeper trace.',
)

assert.ok(
  packetPanel.indexOf('showAuditDetails && conditionalPackAudit') < packetPanel.indexOf('Clause Pack Trace'),
  'The Phase 9 trace should remain gated behind showAuditDetails.',
)

assert.ok(
  packetPanel.indexOf('conditionalPackAudit?.summary?.readyPackCount') <
    packetPanel.indexOf('Activation signals'),
  'Trace summary counts should appear before raw activation signals.',
)

for (const token of [
  'conditionalPackAudit,',
  'activePacks',
  'inactivePacks',
  'activationSignals',
  'documentTriggers',
]) {
  assertIncludes(phase8Test, token, `Phase 9 should preserve Phase 8 audit contract token: ${token}`)
}

console.log('Conditional clause packs Phase 9 contract passed.')
