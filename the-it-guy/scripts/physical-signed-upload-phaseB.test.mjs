import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function readProjectFile(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await readProjectFile('../package.json'))
const packetApi = await readProjectFile('../src/lib/documentPacketsApi.js')
const workspace = await readProjectFile('../src/components/documents/LegalDocumentWorkspace.jsx')
const rolloutDoc = await readProjectFile('../docs/audits/physical-signed-upload-phase-B.md')

assert.equal(
  packageJson.scripts?.['test:physical-signed-upload-phaseB'],
  'node scripts/physical-signed-upload-phaseB.test.mjs',
  'package.json should expose the Phase B physical signed replacement audit script',
)

for (const [needle, message] of [
  ['export async function replacePhysicalSignedPacketArtifact', 'packet API should export a physical signed artifact replacement helper'],
  ['A replacement reason is required.', 'replacement helper should require an explicit replacement reason'],
  ['Signed copy replacement is allowed only after the packet is completed.', 'replacement helper should only allow completed packet replacement'],
  ['No existing signed artifact is available to replace.', 'replacement helper should require an existing signed artifact'],
  ['replacedPhysicalSignedArtifacts', 'replacement helper should preserve superseded physical signed artifacts'],
  ['physicalSigningReplacement', 'replacement helper should stamp replacement metadata in source context'],
  ['signed_physical_otp_replaced', 'replacement helper should emit OTP replacement audit events'],
  ['signed_physical_mandate_replaced', 'replacement helper should emit mandate replacement audit events'],
  ['canonicalPhysicalReplacement: true', 'replacement audit event should be marked canonical physical replacement'],
  ['downstreamWorkflowRetriggered: false', 'replacement audit event should explicitly avoid downstream workflow retriggering'],
]) {
  assertIncludes(packetApi, needle, message)
}

for (const [needle, message] of [
  ['replacePhysicalSignedPacketArtifact', 'workspace should call the canonical replacement helper'],
  ['function SignedCopyReplacementPanel', 'workspace should expose a signed-copy replacement panel'],
  ['Replace signed', 'replacement panel should be labelled for signed copy replacement'],
  ['previous signed artifact', 'replacement panel should explain previous artifact preservation'],
  ['does not retrigger downstream handoff', 'replacement panel should explain downstream handoff is not retriggered'],
  ['handleReplaceSignedCopy', 'workspace should have a dedicated replacement handler'],
  ['canReplaceSignedCopy', 'workspace should gate replacement access'],
  ['Add a reason before replacing the signed copy.', 'workspace should require an agent-facing replacement reason'],
  ['Upload Replacement', 'replacement panel should expose a clear upload action'],
  ['Replacement signed', 'workspace should confirm replacement completion'],
]) {
  assertIncludes(workspace, needle, message)
}

for (const [needle, message] of [
  ['# Physical Signed Upload Phase B', 'rollout note should identify Phase B'],
  ['replacement signed copy', 'rollout note should describe replacement signed copy support'],
  ['previous signed artifact', 'rollout note should document previous artifact preservation'],
  ['does not retrigger downstream handoff', 'rollout note should document downstream workflow behavior'],
  ['No overwrite', 'rollout note should document no-overwrite safety'],
]) {
  assertIncludes(rolloutDoc, needle, message)
}

console.log('Physical signed upload Phase B audit passed.')
