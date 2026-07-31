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
const rolloutDoc = await read('../docs/audits/otp-intake-phase-7.md')

assert.equal(
  packageJson.scripts?.['test:otp-intake-phase7'],
  'node scripts/otp-intake-phase7.test.mjs',
  'package.json should expose the OTP intake Phase 7 audit.',
)

for (const reference of [
  'buildGenerationDecision',
  'OtpGenerationDecisionBar',
  'Generation blocked',
  'Ready for generation',
  'Fix the highlighted details before generating.',
  'Generate the OTP draft from the workspace below.',
  'Jump to generate action',
  'Signing links are prepared only after that OTP PDF exists.',
  'handleJumpToWorkspace',
  'generationWorkspaceId',
  'hasGenerationWorkspaceTarget',
]) {
  assertIncludes(otpPanel, reference, `OtpDraftIntakePanel should keep Phase 7 decision handoff: ${reference}.`)
}

for (const reference of [
  'generationWorkspaceId="otp-generation-workspace"',
  "id={packetType === 'otp' ? 'otp-generation-workspace' : undefined}",
  '<LegalDocumentWorkspace',
  'packetType={packetType}',
  'onGenerate={handleGenerate}',
]) {
  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should keep OTP generation workspace anchor: ${reference}.`)
}

for (const reference of [
  'OTP intake Phase 7',
  'generation decision bar',
  'blocked vs ready',
  'workspace Generate action',
  'No signing workflow change',
  'No duplicate OTP editor',
]) {
  assertIncludes(rolloutDoc, reference, `OTP Phase 7 rollout note should keep ${reference}.`)
}

console.log('otp-intake-phase7 audit passed')
