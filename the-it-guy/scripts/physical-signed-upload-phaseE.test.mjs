import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function readProjectFile(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await readProjectFile('../package.json'))
const workspace = await readProjectFile('../src/components/documents/LegalDocumentWorkspace.jsx')
const builder = await readProjectFile('../src/pages/settings/SettingsSigningTemplatesPage.jsx')
const rolloutDoc = await readProjectFile('../docs/audits/physical-signed-upload-phase-E.md')

assert.equal(
  packageJson.scripts?.['test:physical-signed-upload-phaseE'],
  'node scripts/physical-signed-upload-phaseE.test.mjs',
  'package.json should expose the Phase E amendment handoff audit script',
)

for (const [needle, message] of [
  ['startAddendumFor', 'workspace should deep-link the original packet into Document Builder'],
  ['changeSummary', 'workspace should pass the recorded amendment summary into the handoff URL'],
  ['amendmentReason', 'workspace should pass the recorded amendment reason into the handoff URL'],
  ['source', 'workspace should label the handoff source'],
  ['post_signing_amendment_request', 'workspace should identify post-signing amendment handoffs'],
]) {
  assertIncludes(workspace, needle, message)
}

for (const [needle, message] of [
  ['function readPostSigningAmendmentHandoffFromLocation', 'Document Builder should parse post-signing amendment handoff parameters'],
  ['function clearPostSigningAmendmentHandoffParams', 'Document Builder should clear consumed amendment handoff parameters'],
  ['postSigningAmendmentHandoffRef', 'Document Builder should keep a stable amendment handoff ref'],
  ['consumedPostSigningAmendmentHandoffRef', 'Document Builder should consume each handoff once'],
  ['fetchDocumentPacket(handoff.packetId', 'Document Builder should fetch the original packet if it is not in the visible library page'],
  ['handleStartAddendumFromLibraryPacket(sourcePacket, handoff.addendumType', 'Document Builder should start the existing addendum flow from the handoff packet'],
  ['documentChangeSummary: handoff.changeSummary', 'Document Builder should prefill the addendum change summary'],
  ['amendmentReason: handoff.amendmentReason', 'Document Builder should pass the amendment reason into addendum details'],
  ['Post-signing amendment details are prefilled from the original document', 'Document Builder should show a handoff-specific success message'],
  ['clearPostSigningAmendmentHandoffParams()', 'Document Builder should remove handoff params after consumption'],
]) {
  assertIncludes(builder, needle, message)
}

for (const [needle, message] of [
  ['# Physical Signed Upload Phase E', 'rollout note should identify Phase E'],
  ['deep-link handoff', 'rollout note should describe the deep-link handoff'],
  ['prefills the addendum', 'rollout note should document addendum prefill behavior'],
  ['original packet', 'rollout note should document original packet linkage'],
  ['No original mutation', 'rollout note should document immutable original safety'],
]) {
  assertIncludes(rolloutDoc, needle, message)
}

console.log('Physical signed upload Phase E audit passed.')
