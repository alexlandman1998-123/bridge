import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
assert.match(source, /Ownership & FICA/)
assert.match(source, /Property Information/)
assert.match(source, /Disclosure & Confirmation/)
assert.match(source, /Review & Send/)
assert.match(source, /Send onboarding to agent/)
assert.match(source, /Submitting onboarding does not sign a mandate/)
assert.match(source, /submitSellerOnboarding\(token/)
assert.match(source, /updateSellerOnboardingProgress/)

console.log('seller onboarding signing Phase 1 checks passed')
