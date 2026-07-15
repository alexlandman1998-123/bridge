import assert from 'node:assert/strict'
import fs from 'node:fs'

const edgeSource = fs.readFileSync('../supabase/functions/generate-otp/index.ts', 'utf8')
const apiSource = fs.readFileSync('src/lib/api.js', 'utf8')
const packetSource = fs.readFileSync('src/core/documents/packetService.js', 'utf8')

for (const marker of [
  'buildCanonicalOtpRuntimeBinding',
  'OTP_CANONICAL_RUNTIME_BINDING_VERSION',
  'CANONICAL_OTP_BINDING_BLOCKED',
  'attorneyReviewRequiredTokens',
  'canonicalBinding',
]) {
  assert.ok(edgeSource.includes(marker), `generate-otp must retain canonical runtime marker ${marker}`)
}

assert.ok(apiSource.includes('templateContractVersion'), 'the API must pass the canonical runtime contract explicitly')
assert.ok(packetSource.includes("documentModel !== 'single_master_document'"), 'legacy templates must remain outside canonical enforcement')
assert.ok(packetSource.includes('resolveCanonicalOtpRuntimeConfig(effectiveTemplate)'), 'canonical templates must resolve their own runtime and storage configuration')
assert.ok(packetSource.includes('templateContractVersion: canonicalRuntime.templateContractVersion'), 'canonical generation must opt into strict binding')

console.log('Canonical OTP Phase 4 runtime integration passed.')
