import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentAuthorityContinuity } from '../src/core/documents/legalDocumentAuthorityContinuity.js'

const fixture = {
  h2: { status: 'READY_FOR_H3' }, targetCount: 2, targetOrganisationCount: 1,
  authorisedActorAvailable: true, revokedActorAvailable: true, authorisedTargetCount: 2,
  authorisedPolicyProbes: [{ allowed: true }, { allowed: true }], authorisedTableProbes: [{ complete: true }],
  authorisedFunctionProbes: { mandateAccepted: true, otpAccepted: true },
  revokedMembershipOrganisationCount: 1, revokedActiveMembershipCount: 0,
  revokedPolicyProbes: [{ allowed: false }, { allowed: false }], revokedTableProbes: [{ protected: true }],
  revokedFunctionProbes: { mandateRejected: true, otpRejected: true },
}
assert.equal(assessLegalDocumentAuthorityContinuity(fixture).ready, true)
assert.ok(assessLegalDocumentAuthorityContinuity({ ...fixture, authorisedTargetCount: 1 }).reasons.includes('H3_AUTHORISED_ACTOR_INVALID'))
assert.ok(assessLegalDocumentAuthorityContinuity({ ...fixture, revokedActiveMembershipCount: 1 }).reasons.includes('H3_REVOKED_ACTOR_STILL_ACTIVE'))
assert.ok(assessLegalDocumentAuthorityContinuity({ ...fixture, revokedFunctionProbes: { mandateRejected: false, otpRejected: true } }).reasons.includes('H3_REVOKED_FINALISER_ACCESS_EXPOSED'))

for (const file of ['../supabase/functions/generate-final-signed-document/index.ts', '../supabase/functions/generate-final-signed-otp/index.ts']) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /FINALISER_CONTRACT = "h[34]-v1"/)
  assert.match(source, /\["active", "accepted"\]/)
  assert.match(source, /assigned_agent_id/)
  assert.match(source, /created_by/)
}
const verifier = fs.readFileSync('scripts/legal-document-phase-h3-authority-continuity.mjs', 'utf8')
assert.match(verifier, /H3_AUTHORISED_EMAIL/)
assert.match(verifier, /H3_REVOKED_EMAIL/)
assert.match(verifier, /NO_GENERATED_VERSION/)
assert.match(verifier, /FINALISATION_FORBIDDEN/)
assert.match(verifier, /00000000-0000-4000-8000-000000000000/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-h3', 'verify:legal-documents:phase-h3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document H3 authority-continuity contract passed.')
