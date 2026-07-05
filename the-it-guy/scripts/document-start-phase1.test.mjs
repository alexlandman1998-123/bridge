import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function assertNotIncludes(source, needle, message) {
  assert.ok(!source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const modalSource = await read('../src/components/documents/StartDocumentModal.jsx')
const rulesSource = await read('../src/core/documents/documentStartRules.js')
const rolloutDoc = await read('../docs/audits/document-start-phase-1.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase1'],
  'node scripts/document-start-phase1.test.mjs',
  'package.json should expose the document-start Phase 1 audit.',
)

for (const reference of [
  "import Modal from '../ui/Modal'",
  "import Button from '../ui/Button'",
  "getDocumentStartEntryPointRule(entryPoint)",
  'getDocumentStartModeOptions({',
  'validateDocumentStartRequest({',
  'What happens next',
  'Needed for this path',
  'Drafts stay editable until you generate or send.',
  'data-testid="start-document-modal"',
  'data-testid={`document-start-mode-${option.key}`}',
  'role="radiogroup"',
  'aria-pressed={active}',
  'disabledReason',
  'contextSummary',
  'requiredFields',
  'onSelectSourceMode?.(option.key, option)',
  'onContinue?.({',
  'sourceMode: selectedSourceMode',
  'packetType: resolvedPacketType',
  'documentKind: resolvedDocumentKind',
  'validation',
]) {
  assertIncludes(modalSource, reference, `StartDocumentModal should keep ${reference}.`)
}

for (const reference of [
  'createDocumentPacket(',
  'generatePacketVersion(',
  'navigate(',
  'window.location',
  'fetch(',
  'supabase',
  'JSON editor',
  'contextJson',
]) {
  assertNotIncludes(modalSource, reference, `Phase 1 modal should not wire side effects or raw context editing through ${reference}.`)
}

for (const reference of [
  'DOCUMENT_START_SOURCE_MODES.saved',
  'DOCUMENT_START_SOURCE_MODES.manual',
  'DOCUMENT_START_SOURCE_MODES.onboarding',
  'Use saved details',
  'Enter details manually',
  'Ask client to complete',
  'legal_workspace_document',
  'document_library_document',
]) {
  assertIncludes(rulesSource, reference, `Phase 1 should continue to rely on Phase 0 rules for ${reference}.`)
}

for (const reference of [
  'Reusable UI shell only',
  'No packet creation',
  'No onboarding send',
  'No navigation',
  'No raw JSON',
  'One choice screen',
  'Phase 2 can wire Create Mandate',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 1 rollout note should keep ${reference}.`)
}

console.log('document-start-phase1 audit passed')
