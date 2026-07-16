import assert from 'node:assert/strict'
import fs from 'node:fs'

const finaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
const readiness = fs.readFileSync('scripts/legal-document-phase3-launch-readiness.mjs', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

for (const marker of [
  'SIGNATURE_ASSET_EMBED_FAILED',
  'VISIBLE SIGNATURE MARKS',
  'signatureEvidenceMode: "visual_and_audit"',
  'embeddedSignatureCount',
  'signatureAssetFingerprints',
  'SHA-256',
  'otp_finalisation_started',
  'otp_finalisation_completed',
  'otp_finalisation_failed',
]) {
  assert.ok(finaliser.includes(marker), `Phase 3 OTP finaliser must retain ${marker}.`)
}

assert.match(finaliser, /loadSignatureImages[\s\S]*buildPdf/, 'signature assets must be loaded before the final PDF is built')
assert.match(finaliser, /fields\.some[\s\S]*signature_asset_path/, 'required signature fields must fail closed without stored assets')
assert.doesNotMatch(finaliser, /signatureEvidenceMode:\s*"audit_only"/, 'Phase 3 must not silently fall back to audit-only final PDFs')

for (const marker of [
  'OTP_TEMPLATE_LEGAL_APPROVAL_PENDING',
  'SALES_MANDATE_TEMPLATE_LEGAL_APPROVAL_PENDING',
  'OTP_VISUAL_SIGNATURE_EVIDENCE_MISSING',
  'CONTROLLED_PARTIAL_PACKET_REMAINS',
  'isdowlnollckzvltkasn',
]) {
  assert.ok(readiness.includes(marker), `Phase 3 launch gate must retain ${marker}.`)
}
for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(']) {
  assert.equal(readiness.includes(forbidden), false, `Phase 3 readiness gate must remain read-only (${forbidden}).`)
}

assert.equal(packageJson.scripts['test:otp-phase3-launch-hardening'], 'node scripts/otp-phase3-launch-hardening.test.mjs')
assert.equal(packageJson.scripts['verify:legal-documents:phase3-launch-readiness'], 'node scripts/legal-document-phase3-launch-readiness.mjs')

console.log('OTP Phase 3 launch-hardening contract passed')
