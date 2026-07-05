import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  page: await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8'),
  ui: await readFile(new URL('../src/pages/settings/contractStudioUi.jsx', import.meta.url), 'utf8'),
  packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
}

const previewStart = files.page.indexOf("activeStudioArea === 'templates' && activeTab === 'preview'")
const activityStart = files.page.indexOf("activeStudioArea === 'templates' && activeTab === 'activity'")

assert(previewStart > -1, 'SettingsSigningTemplatesPage should keep the template preview tab.')
assert(activityStart > previewStart, 'Preview tab block should be followed by the activity tab block.')

const previewBlock = files.page.slice(previewStart, activityStart)
const supportStart = files.ui.indexOf('export function SamplePreviewSupportPanel')
const documentCreationStart = files.ui.indexOf('export function DocumentCreationPanel')

assert(supportStart > -1, 'contractStudioUi should export SamplePreviewSupportPanel.')
assert(documentCreationStart > supportStart, 'SamplePreviewSupportPanel should be defined before DocumentCreationPanel.')

const supportBlock = files.ui.slice(supportStart, documentCreationStart)

assert.equal(
  files.packageJson.scripts?.['test:legal-template-preview-phase6'],
  'node scripts/legal-template-preview-phase6.test.mjs',
  'package.json should expose the legal template preview Phase 6 contract.',
)

assert(
  files.page.includes('SamplePreviewSupportPanel,'),
  'SettingsSigningTemplatesPage should import the extracted sample preview support panel.',
)

for (const token of [
  '<SamplePreviewSupportPanel',
  'previewState={previewState}',
  'validationSummary={validationSummary}',
  'previewReadinessIssueCount={previewReadinessIssueCount}',
  'setActiveStudioArea={setActiveStudioArea}',
]) {
  assert(previewBlock.includes(token), `Preview tab should delegate support-panel state through props: ${token}`)
}

for (const token of [
  'export function SamplePreviewSupportPanel',
  'const previewCritical = Array.isArray(previewState.critical) ? previewState.critical : []',
  'const templateIssueCount = templateBlockers.length + templateWarnings.length',
  '<TemplateStudioPanel',
  '<PreviewIssueSummary critical={previewCritical} warnings={previewWarnings} />',
  "onClick={() => setActiveStudioArea?.('documents')}",
  '<span>Open Documents</span>',
]) {
  assert(supportBlock.includes(token), `SamplePreviewSupportPanel should own the preview support UI safely: ${token}`)
}

for (const inlinedToken of [
  'Sample-preview status, template checks, and future data needs in one place.',
  '<span>Template checklist</span>',
  '<span>Fields used</span>',
  'Need real transaction details?',
  'Use Documents to test a linked record or create a draft from this template.',
]) {
  assert(!previewBlock.includes(inlinedToken), `SettingsSigningTemplatesPage should not inline support-panel UI after Phase 6: ${inlinedToken}`)
  assert(supportBlock.includes(inlinedToken), `SamplePreviewSupportPanel should retain support-panel UI after extraction: ${inlinedToken}`)
}

console.log('Legal template preview Phase 6 contract passed.')
