import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const packetPanel = await read('../src/components/documents/DocumentPacketWorkflowPanel.jsx')
const legalWorkspace = await read('../src/components/documents/LegalDocumentWorkspace.jsx')

assert.equal(
  packageJson.scripts?.['test:conditional-clause-packs-phase7'],
  'node scripts/conditional-clause-packs-phase7.test.mjs',
  'package.json should expose the conditional clause packs Phase 7 contract.',
)

for (const token of [
  'function groupConditionalPackIssues',
  'function getConditionalPackIssueCount',
  'conditionalPackMissingPlaceholders',
  'conditionalPackDataRequirements',
  'Active Conditional Packs',
  'Required pack data is present',
  'required field',
  'Conditional pack data missing',
  'Complete the active clause pack fields before generating',
]) {
  assertIncludes(packetPanel, token, `DocumentPacketWorkflowPanel should surface conditional pack readiness: ${token}`)
}

for (const token of [
  'const packMissing = Array.isArray(error?.validation?.conditionalPackMissingPlaceholders)',
  'groupConditionalPackIssues(packMissing)',
  'Active packs:',
  'groupedConditionalMissing.map',
  'getConditionalPackIssueCount(pack, groupedConditionalMissing)',
]) {
  assertIncludes(packetPanel, token, `DocumentPacketWorkflowPanel should use validation conditional-pack metadata: ${token}`)
}

for (const token of [
  'function groupConditionalPackIssues',
  'conditionalPackMissingPlaceholders',
  'Conditional Pack Data Missing',
  'Complete the missing information before continuing.',
  'group.fields.slice(0, 6).join',
]) {
  assertIncludes(legalWorkspace, token, `LegalDocumentWorkspace should explain conditional-pack blockers: ${token}`)
}

assert.ok(
  packetPanel.indexOf('Conditional pack data missing') < packetPanel.indexOf("label: 'Validation blocked'"),
  'Conditional-pack missing data should be prioritized before generic validation-blocked feedback.',
)

assert.ok(
  legalWorkspace.indexOf('Conditional Pack Data Missing') < legalWorkspace.indexOf('Missing Required Information'),
  'Legal workspace should prioritize conditional-pack blockers before generic missing fields.',
)

console.log('Conditional clause packs Phase 7 contract passed.')
