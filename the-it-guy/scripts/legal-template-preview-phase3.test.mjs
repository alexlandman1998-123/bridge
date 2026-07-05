import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  page: await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8'),
  ui: await readFile(new URL('../src/pages/settings/contractStudioUi.jsx', import.meta.url), 'utf8'),
}

const documentsStart = files.page.indexOf("activeStudioArea === 'documents'")
assert(documentsStart > -1, 'SettingsSigningTemplatesPage should keep the Documents workflow.')

const documentCreationStart = files.ui.indexOf('export function DocumentCreationPanel')
const templateCreationStart = files.ui.indexOf('export function TemplateCreationPanel')
assert(documentCreationStart > -1, 'contractStudioUi should keep DocumentCreationPanel.')
assert(templateCreationStart > documentCreationStart, 'DocumentCreationPanel should be followed by TemplateCreationPanel.')

const documentCreationPanel = files.ui.slice(documentCreationStart, templateCreationStart)

for (const token of [
  '<span>Advanced preview data</span>',
  'Use sample data',
  'Advanced overrides',
  "testingTemplate ? 'Testing...' : 'Test linked record'",
  'handleTestGenerateFromRun()',
  'handleCreateDocumentPacketFromRun({ autoGenerate: true })',
  'handleCreateDocumentPacketFromRun()',
]) {
  assert(documentCreationPanel.includes(token), `DocumentCreationPanel should preserve the simplified advanced preview-data contract: ${token}`)
}

for (const removedToken of [
  '<span>More options</span>',
  'Use safe example values',
  'Extra details JSON',
  "testingTemplate ? 'Previewing...' : 'Preview'",
]) {
  assert(!documentCreationPanel.includes(removedToken), `DocumentCreationPanel should not expose old advanced preview labels: ${removedToken}`)
}

for (const token of [
  'Saved-details document start is ready. Confirm the linked IDs in Advanced preview data, then create the document.',
  'Complete the addendum readiness checklist before generating. You can still save it as a draft from Advanced preview data.',
]) {
  assert(files.page.includes(token), `SettingsSigningTemplatesPage should point document-start recovery to Advanced preview data: ${token}`)
}

for (const removedToken of [
  'Confirm the linked IDs in More options',
  'save it as a draft from More options',
]) {
  assert(!files.page.includes(removedToken), `SettingsSigningTemplatesPage should not point users to the old More options label: ${removedToken}`)
}

console.log('Legal template preview Phase 3 contract passed.')
