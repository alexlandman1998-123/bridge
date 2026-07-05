import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const unitDetail = await read('../src/pages/UnitDetail.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-5.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase5'],
  'node scripts/document-start-phase5.test.mjs',
  'package.json should expose the document-start Phase 5 audit.',
)

for (const reference of [
  "import StartDocumentModal from '../components/documents/StartDocumentModal'",
  "from '../core/documents/documentStartRules'",
  'const [otpStartOpen, setOtpStartOpen] = useState(false)',
  'function buildOtpLegalWorkspacePath(mode = \'view\', options = {})',
  "params.set('sourceMode', sourceMode)",
  "params.set('documentStart', documentStart)",
  'function handleOtpPrimaryAction()',
  "if (actionKey === 'generate')",
  'setOtpStartOpen(true)',
  'async function handleStartTransactionOtpDocument',
  'DOCUMENT_START_SOURCE_MODES.onboarding',
  'await handleSendOnboardingEmail({ resend: onboardingEmailSent })',
  "documentStart: DOCUMENT_START_ENTRY_POINTS.transactionOtp",
  'const transactionOtpStartSummary = [',
  '<StartDocumentModal',
  'entryPoint={DOCUMENT_START_ENTRY_POINTS.transactionOtp}',
  'packetType={DOCUMENT_START_PACKET_TYPES.otp}',
  'title="Create OTP"',
  'onContinue={(selection) => void handleStartTransactionOtpDocument(selection)}',
]) {
  assertIncludes(unitDetail, reference, `UnitDetail should keep Phase 5 transaction OTP start wiring ${reference}.`)
}

for (const reference of [
  'Transaction Create OTP entry point',
  'Start Document modal',
  'Saved and manual paths open the existing routed legal workspace',
  'sourceMode',
  'documentStart',
  'No duplicate OTP editor',
  'No automatic send behavior',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 5 rollout note should keep ${reference}.`)
}

console.log('document-start-phase5 audit passed')
