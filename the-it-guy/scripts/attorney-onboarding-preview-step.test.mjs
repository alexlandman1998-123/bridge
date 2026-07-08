import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ONBOARDING_STEPS } from '../src/components/attorney/onboarding/attorneyOnboardingGuidance.js'

const layoutSource = readFileSync(new URL('../src/components/attorney/onboarding/AttorneyOnboardingLayout.jsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/AttorneyOnboardingPage.jsx', import.meta.url), 'utf8')
const previewStepSource = readFileSync(new URL('../src/components/attorney/onboarding/WorkspacePreviewStep.jsx', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../src/components/attorney/onboarding/AttorneyFirmLivePreview.jsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

assert.equal(ONBOARDING_STEPS.at(-1).key, 'workspace_preview')
assert.equal(ONBOARDING_STEPS.at(-1).label, 'Workspace Preview')

assert.doesNotMatch(
  layoutSource,
  /AttorneyFirmLivePreview/,
  'The setup layout should not mount the live preview as a persistent right column.',
)

assert.match(
  pageSource,
  /else\s*\{[\s\S]*<WorkspacePreviewStep[\s\S]*preview=\{previewSnapshot\}/,
  'The onboarding page should render the live preview as the final step.',
)

assert.match(
  pageSource,
  /nextStep\?\.key === 'workspace_preview'[\s\S]*'Preview Workspace'/,
  'The review step should advance into the dedicated preview step.',
)

assert.match(
  previewStepSource,
  /<AttorneyFirmLivePreview[\s\S]*variant="stage"/,
  'The final preview step should render the live firm preview in stage mode.',
)

assert.match(
  previewStepSource,
  /activationGuard\.stepKey[\s\S]*onNavigateToStep\?\.\(activationGuard\.stepKey\)/,
  'Blocked activation from the preview step should expose a direct fix path.',
)

assert.match(
  previewSource,
  /variant = ''[\s\S]*attorney-firm-preview is-\$\{variant\}/,
  'The live preview component should support a stage variant.',
)

assert.match(
  cssSource,
  /\.attorney-setup-shell\s*\{[\s\S]*grid-template-columns: minmax\(220px, 280px\) minmax\(0, 1fr\);/,
  'The setup shell should be a two-column rail/workbench layout.',
)

assert.match(
  cssSource,
  /\.attorney-firm-preview\.is-stage\s*\{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  'The final preview should expand into a multi-column stage.',
)

console.log('attorney onboarding preview step contracts passed')
