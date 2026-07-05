import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const previewStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'preview'")
const activityStart = page.indexOf("activeStudioArea === 'templates' && activeTab === 'activity'")

assert(previewStart > -1, 'SettingsSigningTemplatesPage should keep the template preview tab.')
assert(activityStart > previewStart, 'Preview tab block should be followed by the activity tab block.')

const previewBlock = page.slice(previewStart, activityStart)

assert.equal(
  packageJson.scripts?.['test:legal-template-preview-phase5'],
  'node scripts/legal-template-preview-phase5.test.mjs',
  'package.json should expose the legal template preview Phase 5 contract.',
)

for (const token of [
  'data-testid="sample-preview-stage"',
  'data-testid="sample-preview-page"',
  'rounded-[20px] border border-[#dbe7f3] bg-[#f6f8fb] p-3 sm:p-5',
  'rounded-[10px] border border-[#e2eaf3] bg-white px-5 py-6',
  'aria-label="Generate sample preview"',
  "testingTemplate ? 'Preparing preview...' : 'Generate sample preview'",
  'onClick={() => void handleTestGenerate()}',
  'Run a preview to inspect the current template layout without affecting live transactions.',
]) {
  assert(previewBlock.includes(token), `Preview tab should keep the simplified preview stage and empty-state CTA: ${token}`)
}

for (const removedToken of [
  'bg-[radial-gradient',
  'min-h-[620px]',
  'rounded-[24px]',
  'rounded-[22px]',
  'rounded-[20px] border border-[#e2eaf3] bg-white p-8',
]) {
  assert(!previewBlock.includes(removedToken), `Preview tab should not reintroduce the heavier old document stage: ${removedToken}`)
}

console.log('Legal template preview Phase 5 contract passed.')
