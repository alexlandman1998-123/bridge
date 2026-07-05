import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/pages/settings/contractStudioUi.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const previewStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'preview'")
const activityStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'activity'")

assert(previewStart > -1, 'SettingsSigningTemplatesPage should keep the template preview tab.')
assert(activityStart > previewStart, 'Preview tab block should be followed by the activity tab block.')

const previewBlock = page.slice(previewStart, activityStart)
const panelCount = (previewBlock.match(/<TemplateStudioPanel/g) || []).length
const supportStart = ui.indexOf('export function SamplePreviewSupportPanel')
const documentCreationStart = ui.indexOf('export function DocumentCreationPanel')
assert(supportStart > -1, 'contractStudioUi should expose the consolidated sample preview support panel.')
assert(documentCreationStart > supportStart, 'SamplePreviewSupportPanel should be defined before DocumentCreationPanel.')
const supportBlock = ui.slice(supportStart, documentCreationStart)

assert.equal(
  packageJson.scripts?.['test:legal-template-preview-phase4'],
  'node scripts/legal-template-preview-phase4.test.mjs',
  'package.json should expose the legal template preview Phase 4 contract.',
)

assert.equal(
  panelCount,
  1,
  'Preview tab should keep only the document canvas panel inline and delegate support content.',
)

assert(
  previewBlock.includes('<SamplePreviewSupportPanel'),
  'Preview tab should render the consolidated support panel through contractStudioUi.',
)

for (const token of [
  'previewReadinessIssueCount',
  '<SamplePreviewSupportPanel',
]) {
  assert(previewBlock.includes(token), `Preview tab should pass the consolidated support panel contract: ${token}`)
}

for (const token of [
  'Sample-preview status, template checks, and future data needs in one place.',
  "previewReadinessIssueCount ? 'Needs review' : 'Ready'",
  '<span>Template checklist</span>',
  'open={Boolean(templateIssueCount)}',
  '<span>Fields used</span>',
  '<PreviewIssueSummary critical={previewCritical} warnings={previewWarnings} />',
  'Preview uses safe sample values and never creates or changes live documents.',
  'Use Documents to test a linked record or create a draft from this template.',
  '<span>Open Documents</span>',
]) {
  assert(supportBlock.includes(token), `SamplePreviewSupportPanel should keep the consolidated support panel contract: ${token}`)
}

for (const removedToken of [
  'eyebrow="Health"',
  'title="Checklist"',
  'eyebrow="Field Coverage"',
  'title="Fields Used"',
]) {
  assert(!supportBlock.includes(removedToken), `Preview tab should not split support content back into the old separate panel: ${removedToken}`)
}

console.log('Legal template preview Phase 4 contract passed.')
