import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentPublicSurfaceBoundary } from '../src/core/documents/legalDocumentPublicSurfaceBoundary.js'

const fixture = { h3: { status: 'READY_FOR_H4' }, targetCount: 2, tableProbes: [{ protected: true }], storageProbes: [{ protected: true }, { protected: true }], publicUrlProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerRejected: true, otpFinalizerRejected: true, dispatcherRejected: true, watchdogRejected: true, fakeTokenResolveRejected: true, fakeTokenActionRejected: true, fakeTokenResponsesSanitised: true } }
assert.equal(assessLegalDocumentPublicSurfaceBoundary(fixture).ready, true)
assert.ok(assessLegalDocumentPublicSurfaceBoundary({ ...fixture, storageProbes: [{ protected: false }, { protected: true }] }).reasons.includes('H4_ANONYMOUS_STORAGE_ACCESS_EXPOSED'))
assert.ok(assessLegalDocumentPublicSurfaceBoundary({ ...fixture, functionProbes: { ...fixture.functionProbes, fakeTokenResponsesSanitised: false } }).reasons.includes('H4_PUBLIC_SIGNER_TOKEN_BOUNDARY_INVALID'))
const missing = assessLegalDocumentPublicSurfaceBoundary({ h3: { status: 'NO_GO' } })
assert.ok(missing.reasons.includes('H4_CONTROLLED_TARGETS_MISSING'))
assert.ok(!missing.reasons.includes('H4_PUBLIC_SIGNER_TOKEN_BOUNDARY_INVALID'))

for (const file of ['../supabase/functions/generate-final-signed-document/index.ts', '../supabase/functions/generate-final-signed-otp/index.ts']) assert.match(fs.readFileSync(file, 'utf8'), /FINALISER_CONTRACT = "h4-v1"/)
const verifier = fs.readFileSync('scripts/legal-document-phase-h4-public-surface.mjs', 'utf8')
assert.match(verifier, /randomBytes\(32\)/)
assert.match(verifier, /resolve-signer-token/)
assert.match(verifier, /signer-signing-action/)
assert.match(verifier, /final_signed_file_url/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-h4', 'verify:legal-documents:phase-h4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document H4 public-surface contract passed.')
