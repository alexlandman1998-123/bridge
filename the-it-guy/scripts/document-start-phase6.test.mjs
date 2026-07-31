import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const workspacePage = await read('../src/pages/LegalDocumentWorkspacePage.jsx')
const otpPanel = await read('../src/components/documents/OtpDraftIntakePanel.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-6.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase6'],
  'node scripts/document-start-phase6.test.mjs',
  'package.json should expose the document-start Phase 6 audit.',
)

for (const reference of [
  "import OtpDraftIntakePanel from '../components/documents/OtpDraftIntakePanel'",
	  'function buildOtpDraftDefaults',
	  'function buildOtpDraftSourceSummary',
	  'function buildOtpDraftGenerationOverrides',
	  'const [otpDraftOverrides, setOtpDraftOverrides] = useState({})',
	  'const effectiveOtpDraft = useMemo',
	  'const otpDraftSourceSummary = useMemo',
	  'const showOtpDraftPanel =',
	  "packetType === 'otp'",
	  'mode === \'generate\'',
	  'otpDraft: effectiveOtpDraft',
	  'buildOtpDraftGenerationOverrides({',
	  'generationContext.otpDraft = otpContext.otpDraft',
	  'generationContext.sourceContext = {',
	  '<OtpDraftIntakePanel',
	  'draft={effectiveOtpDraft}',
	  'sourceSummary={otpDraftSourceSummary}',
	  'onFieldChange={updateOtpDraftField}',
	  'onReset={resetOtpDraftFields}',
	  'Manual override applied',
	  'From accepted offer',
	  'From transaction',
	  'From buyer onboarding',
	  'From saved details',
	  'Missing',
	]) {
	  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should keep Phase 6 OTP intake wiring ${reference}.`)
	}

for (const reference of [
  'Generate OTP',
  'Check the OTP details',
	  'buildReadinessGroups',
	  'buildSectionReadiness',
	  'OtpSectionHeader',
	  'OtpSectionNavigator',
	  'OtpGenerationReviewCard',
	  'buildGenerationSummaryItems',
	  'Final review before generation',
	  'manualChangeCount',
	  'Using defaults',
	  'Fix next blocker',
	  'handleJumpToSection',
	  'Review sections',
	  'otp-section-buyer',
	  'Fix next required field',
	  'required details complete',
	  'sourceSummary',
	  'handleJumpToField',
	  'scrollIntoView',
	  'fieldKey',
	  'aria-invalid',
	  'Required',
	  'Buyer details',
	  'Seller details',
	  'Property details',
	  'Finance terms',
	  'Legal route',
	  'Template readiness',
	  'Signing readiness',
	  'Checked on generate',
	  'After generation',
	  'Needs attention',
	  'OTP generation is blocked until the required buyer, seller, property and finance details are complete.',
  'Buyer',
  'Seller',
  'Property',
  'Commercial terms',
  'Suspensive conditions',
  'Special conditions',
  'Use defaults',
]) {
  assertIncludes(otpPanel, reference, `OtpDraftIntakePanel should keep ${reference}.`)
}

for (const reference of [
  'focused OTP intake panel',
  'buyer, seller, property, and commercial terms',
  'otpDraft',
  'No duplicate OTP editor',
  'No automatic send behavior',
  'No schema change',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 6 rollout note should keep ${reference}.`)
}

console.log('document-start-phase6 audit passed')
