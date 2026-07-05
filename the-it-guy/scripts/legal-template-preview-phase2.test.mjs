import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  page: await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8'),
  ui: await readFile(new URL('../src/pages/settings/contractStudioUi.jsx', import.meta.url), 'utf8'),
}

const previewStart = files.page.indexOf("activeStudioArea === 'templates' && activeTab === 'preview'")
const activityStart = files.page.indexOf("activeStudioArea === 'templates' && activeTab === 'activity'")

assert(previewStart > -1, 'SettingsSigningTemplatesPage should keep the template preview tab.')
assert(activityStart > previewStart, 'Preview tab block should be followed by the activity tab block.')

const previewBlock = files.page.slice(previewStart, activityStart)

for (const token of [
  'export function PreviewIssueSummary',
  'data-testid="preview-issue-summary"',
  'Preview issue summary',
  'Issues are shown here so the page preview stays readable.',
  'View all issues ({totalIssues})',
]) {
  assert(files.ui.includes(token), `contractStudioUi should expose the preview issue summary: ${token}`)
}

for (const token of [
  'PreviewIssueSummary',
  '<PreviewIssueSummary critical={previewState.critical} warnings={previewState.warnings} compact />',
  '<SamplePreviewSupportPanel',
]) {
  assert(files.page.includes(token), `SettingsSigningTemplatesPage should wire preview issues outside the page frame: ${token}`)
}

for (const token of [
  '<PreviewIssueSummary critical={previewCritical} warnings={previewWarnings} />',
  'Run a preview to see blockers and warnings here.',
]) {
  assert(files.ui.includes(token), `contractStudioUi should render preview issues outside the page frame: ${token}`)
}

for (const removedToken of [
  'live-preview-critical',
  'live-preview-warning',
  'test-preview-critical',
  'test-preview-warning',
  'previewState.critical.map((issue, index)',
  'previewState.warnings.map((issue, index)',
]) {
  assert(!previewBlock.includes(removedToken), `Preview tab should not render preview validation cards inside the document frame: ${removedToken}`)
}

assert(
  previewBlock.includes('<div dangerouslySetInnerHTML={{ __html: previewState.html }} />'),
  'Preview tab should render the document HTML directly inside the document frame.',
)

console.log('Legal template preview Phase 2 contract passed.')
