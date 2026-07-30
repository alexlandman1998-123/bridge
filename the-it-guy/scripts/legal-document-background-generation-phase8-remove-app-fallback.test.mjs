import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const packetService = fs.readFileSync(path.join(root, 'src', 'core', 'documents', 'packetService.js'), 'utf8')
const workspace = fs.readFileSync(path.join(root, 'src', 'components', 'documents', 'LegalDocumentWorkspace.jsx'), 'utf8')

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

function assertMatches(source, pattern, label) {
  assert.match(source, pattern, `${label} did not match ${pattern}`)
}

assertIncludes(packetService, 'phase8ServerJobRequired: true', 'Phase 8 packet service enqueue failure marker')
assertIncludes(packetService, 'foreground fallback disabled', 'Phase 8 packet service fallback removal log')
assertMatches(
  packetService,
  /catch \(backgroundError\) \{[\s\S]+throw createPacketError[\s\S]+phase8ServerJobRequired: true/,
  'Packet service must throw when background generation cannot be queued',
)
assert.doesNotMatch(
  packetService,
  /continuing foreground generation/,
  'Packet service must not keep the old foreground fallback wording',
)

assert.doesNotMatch(
  workspace,
  /queueMandateSendAfterGeneration|queuedMandateSendRef|queuedContinuation/,
  'Workspace must not keep the browser-orchestrated generate-then-send continuation',
)
assertMatches(
  workspace,
  /if \(queueIfGenerationNeeded && isMandatePacket\) \{[\s\S]+onGenerate\([\s\S]+return \{[\s\S]+queued: true/,
  'Send-before-generated should queue generation and return without browser-orchestrated send continuation',
)
assert.doesNotMatch(
  workspace,
  /setActionProgressMessage\('Mandate PDF ready\. Sending signing email\.\.\.'\)/,
  'Workspace must not send automatically after a browser-held generation promise resolves',
)

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:legal-document-background-generation-phase8-remove-app-fallback'],
  'node scripts/legal-document-background-generation-phase8-remove-app-fallback.test.mjs',
)

console.log('Legal document background generation phase 8 app fallback removal contract passed.')
