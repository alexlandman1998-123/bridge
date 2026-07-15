import assert from 'node:assert/strict'
import fs from 'node:fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const diagnostics = fs.readFileSync(new URL('../src/services/documents/legalClausePackOperationalDiagnosticsService.js', import.meta.url), 'utf8')
const assurance = fs.readFileSync(new URL('../src/core/documents/otpOperationalAssurance.js', import.meta.url), 'utf8')
const library = fs.readFileSync(new URL('../src/core/documents/legalDocumentLibraryModel.js', import.meta.url), 'utf8')
const overview = fs.readFileSync(new URL('../src/pages/settings/LegalDocumentOverviewPage.jsx', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-canonical-template-phase8'],
  'node src/core/documents/__tests__/otpOperationalAssurance.test.js && node src/services/documents/__tests__/legalClausePackOperationalDiagnosticsService.test.js && node src/core/documents/__tests__/legalDocumentLibraryModel.test.js && node scripts/otp-canonical-template-phase8-assurance.test.mjs && npm run test:otp-canonical-template-phase7',
)

for (const token of [
  'canonical_version_evidence_invalid',
  'templateVersionId',
  'templateContentHash',
  'document_packet_template_versions',
  'canonicalVersionEvidenceInvalid',
]) {
  assert.ok(diagnostics.includes(token), `canonical operational diagnostics should preserve ${token}`)
}

assert.match(assurance, /otp_operational_assurance_v2/)
assert.match(assurance, /immutable template-version evidence/i)
assert.match(library, /buildCanonicalOtpRecoveryReadiness/)
assert.match(library, /isCanonicalOtpTemplate\(liveTemplate/)
assert.match(overview, /Exact master versions/)
assert.match(overview, /exact approved master version/i)

console.log('Canonical OTP Phase 8 live operational assurance checks passed.')
