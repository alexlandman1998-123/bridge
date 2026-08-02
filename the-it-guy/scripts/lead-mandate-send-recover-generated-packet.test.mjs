import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assert.equal(
  packageJson.scripts?.['test:lead-mandate-send-recover-generated-packet'],
  'node scripts/lead-mandate-send-recover-generated-packet.test.mjs',
)

for (const token of [
  'findLatestLeadMandateStatusWithGeneratedVersion',
  'Recovered the latest generated mandate packet for this lead',
  'generated mandate packet recovery lookup failed before send',
  'recovered generated packet lead sync skipped',
]) {
  assertIncludes(pageSource, token, 'Quick-start send generated-packet recovery')
}

assertMatches(
  pageSource,
  /if \(isUuidLike\(mandatePacketId\) && !isUuidLike\(mandatePacketVersionId\)\) \{[\s\S]+findLatestLeadMandateStatusWithGeneratedVersion[\s\S]+setMandatePacketStatus\(recoveredGeneratedStatus\)[\s\S]+updateAgencyCrmLeadRecord/,
  'Quick-start send should recover a signable packet before deciding generation is needed',
)

assertMatches(
  pageSource,
  /const needsGeneration = \(currentStep === 'details' && actionKey === 'generate'\) \|\| !isUuidLike\(mandatePacketId\) \|\| !isUuidLike\(mandatePacketVersionId\)/,
  'Generation decision should run after recovered packet/version ids are applied',
)

console.log('Lead mandate send generated-packet recovery contract passed.')
