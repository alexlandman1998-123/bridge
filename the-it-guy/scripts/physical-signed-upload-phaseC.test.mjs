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
const rolloutDoc = await readProjectFile('../docs/audits/physical-signed-upload-phase-C.md')

assert.equal(
  packageJson.scripts?.['test:physical-signed-upload-phaseC'],
  'node scripts/physical-signed-upload-phaseC.test.mjs',
  'package.json should expose the Phase C controlled document change audit script',
)

for (const [needle, message] of [
  ['function DocumentChangeRequestPanel', 'workspace should expose a controlled document change panel'],
  ['Change generated', 'change panel should clearly target generated documents'],
  ['Start Controlled Change', 'change panel should require an explicit start action'],
  ['controlledDocumentChangeRequired', 'workspace should gate generated draft edits behind a controlled change request'],
  ['document_change_request', 'workspace should persist the change request into editable revision metadata'],
  ['generated_document_change: true', 'workspace should mark generated document change revisions'],
  ['generated_document_change_requested', 'workspace should append an audit event when a controlled change starts'],
  ['downstreamWorkflowRetriggered: false', 'controlled change audit should not imply downstream handoff retriggering'],
  ['Capture a change reason before editing this generated document.', 'workspace should block generated draft edits until a reason is captured'],
  ['source: \'change_request\'', 'workspace should save the initial controlled-change revision with a distinct source'],
  ['ensureControlledDocumentChange', 'workspace should reuse a guard for clause/detail edits'],
  ['handleStartDocumentChange', 'workspace should implement a dedicated controlled-change handler'],
]) {
  assertIncludes(workspace, needle, message)
}

for (const [needle, message] of [
  ['# Physical Signed Upload Phase C', 'rollout note should identify Phase C'],
  ['controlled document change', 'rollout note should describe controlled document change support'],
  ['change reason', 'rollout note should document required reason capture'],
  ['generated document', 'rollout note should scope the behavior to generated documents'],
  ['No signed-record reopen', 'rollout note should document immutable signed-record safety'],
]) {
  assertIncludes(rolloutDoc, needle, message)
}

console.log('Physical signed upload Phase C audit passed.')
