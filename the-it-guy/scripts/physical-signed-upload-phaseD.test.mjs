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
const packetApi = await readProjectFile('../src/lib/documentPacketsApi.js')
const rolloutDoc = await readProjectFile('../docs/audits/physical-signed-upload-phase-D.md')

assert.equal(
  packageJson.scripts?.['test:physical-signed-upload-phaseD'],
  'node scripts/physical-signed-upload-phaseD.test.mjs',
  'package.json should expose the Phase D post-signing amendment audit script',
)

for (const [needle, message] of [
  ['function PostSigningAmendmentPanel', 'workspace should expose a post-signing amendment panel'],
  ['Need to change this', 'panel should directly address post-signing change needs'],
  ['Record Amendment Need', 'panel should expose an explicit amendment request action'],
  ['postSigningAmendmentRequests', 'workspace should persist amendment requests in packet source context'],
  ['post_signing_amendment_requests', 'workspace should persist snake-case amendment request metadata for compatibility'],
  ['post_signing_amendment_requested', 'workspace should append a post-signing amendment audit event'],
  ['recommendedDocumentKind: \'addendum\'', 'workspace should recommend the existing addendum path'],
  ['originalRecordMutated: false', 'audit payload should state the signed original was not mutated'],
  ['downstreamWorkflowRetriggered: false', 'audit payload should state downstream handoff was not retriggered'],
  ['This document is still editable; use the controlled change flow before signing.', 'workspace should keep Phase C as the editable-document route'],
  ['Amendment request recorded.', 'workspace should record amendment work without linking agents to the hidden legal template builder'],
]) {
  assertIncludes(workspace, needle, message)
}

assert.doesNotMatch(
  workspace,
  /settings\/legal-templates|Open Document Builder|Open addendum builder/,
  'workspace should not expose the hidden legal template builder to agents',
)

for (const [needle, message] of [
  ['post_signing_amendment_requested', 'packet API should humanize post-signing amendment events'],
  ['Post-signing amendment requested', 'packet API should expose a readable post-signing amendment message'],
]) {
  assertIncludes(packetApi, needle, message)
}

for (const [needle, message] of [
  ['# Physical Signed Upload Phase D', 'rollout note should identify Phase D'],
  ['post-signing amendment', 'rollout note should describe post-signing amendment support'],
  ['original record is not mutated', 'rollout note should document immutable original safety'],
  ['Document Builder', 'rollout note should point to the existing addendum builder'],
  ['No downstream retrigger', 'rollout note should document downstream workflow behavior'],
]) {
  assertIncludes(rolloutDoc, needle, message)
}

console.log('Physical signed upload Phase D audit passed.')
