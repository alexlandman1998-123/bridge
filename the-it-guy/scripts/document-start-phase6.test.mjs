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
  'function buildOtpDraftGenerationOverrides',
  'const [otpDraftOverrides, setOtpDraftOverrides] = useState({})',
  'const effectiveOtpDraft = useMemo',
  'const showOtpDraftPanel =',
  "packetType === 'otp'",
  'mode === \'generate\'',
  'otpDraft: effectiveOtpDraft',
  'buildOtpDraftGenerationOverrides({',
  'generationContext.otpDraft = otpContext.otpDraft',
  'generationContext.sourceContext = {',
  '<OtpDraftIntakePanel',
  'draft={effectiveOtpDraft}',
  'onFieldChange={updateOtpDraftField}',
  'onReset={resetOtpDraftFields}',
]) {
  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should keep Phase 6 OTP intake wiring ${reference}.`)
}

for (const reference of [
  'Generate OTP',
  'Check the OTP details',
  'buildReadinessChecks',
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
