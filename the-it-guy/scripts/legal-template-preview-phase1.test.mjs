import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/pages/settings/contractStudioUi.jsx', import.meta.url), 'utf8')

const previewStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'preview'")
const activityStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'activity'")

assert(previewStart > -1, 'SettingsSigningTemplatesPage should keep the template preview tab.')
assert(activityStart > previewStart, 'Preview tab block should be followed by the activity tab block.')

const previewBlock = page.slice(previewStart, activityStart)
const supportStart = ui.indexOf('export function SamplePreviewSupportPanel')
const documentCreationStart = ui.indexOf('export function DocumentCreationPanel')
assert(supportStart > -1, 'contractStudioUi should expose the sample preview support panel.')
assert(documentCreationStart > supportStart, 'SamplePreviewSupportPanel should be defined before DocumentCreationPanel.')
const supportBlock = ui.slice(supportStart, documentCreationStart)
const previewContract = `${previewBlock}\n${supportBlock}`
const documentsStart = page.indexOf("activeStudioArea === 'documents'")
const documentsBlock = documentsStart > -1 ? page.slice(documentsStart) : ''

for (const token of [
  'Refresh preview',
  'Sample Data',
  'Sample preview',
  'Preview uses safe sample values and never creates or changes live documents.',
  'Open Documents',
  'onClick={() => void handleTestGenerate()}',
]) {
  assert(previewContract.includes(token), `Preview tab should preserve the simplified sample-preview contract: ${token}`)
}

for (const removedToken of [
  'Preview With Real Details',
  'Preview linked record',
  'Preview details',
  'Create Draft Document',
  'DOCUMENT_RUN_SOURCE_OPTIONS.map',
  'handleTestGenerateFromRun()',
  'handleCreateDocumentPacketFromRun()',
]) {
  assert(!previewBlock.includes(removedToken), `Preview tab should not expose document-run controls: ${removedToken}`)
}

assert(
  page.includes('async function handleTestGenerateFromRun()') &&
    page.includes('async function handleCreateDocumentPacketFromRun'),
  'document-run functions should remain available for the Documents workflow.',
)

for (const token of [
  '<DocumentCreationPanel',
  'handleTestGenerateFromRun={handleTestGenerateFromRun}',
  'handleCreateDocumentPacketFromRun={handleCreateDocumentPacketFromRun}',
]) {
  assert(documentsBlock.includes(token), `Documents area should keep the linked-record and draft creation workflow: ${token}`)
}

console.log('Legal template preview Phase 1 contract passed.')
