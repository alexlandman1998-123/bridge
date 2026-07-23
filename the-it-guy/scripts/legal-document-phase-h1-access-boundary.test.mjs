import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentAccessBoundary } from '../src/core/documents/legalDocumentAccessBoundary.js'

const ready = assessLegalDocumentAccessBoundary({ g4: { status: 'READY_FOR_H1' }, targetCount: 2, unrelatedMembershipCount: 0, tableProbes: [{ protected: true }], storageProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerContract: true, otpFinalizerContract: true, dispatcherRejected: true, watchdogRejected: true } })
assert.equal(ready.ready, true)
assert.ok(assessLegalDocumentAccessBoundary({ g4: { status: 'READY_FOR_H1' }, targetCount: 2, unrelatedMembershipCount: 0, tableProbes: [{ protected: false }], storageProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerContract: true, otpFinalizerContract: true, dispatcherRejected: true, watchdogRejected: true } }).reasons.includes('H1_CROSS_TENANT_TABLE_ACCESS_EXPOSED'))
const mandateFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otpFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
for (const marker of [/authorizeFinalisation/, /FINALISATION_FORBIDDEN/, /assigned_agent_id/, /created_by/, /x-legal-finalizer-contract/]) {
  assert.match(mandateFinaliser, marker)
}
assert.match(otpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.match(otpFinaliser, /x-legal-finalizer-contract/)
const verifier = fs.readFileSync('scripts/legal-document-phase-h1-access-boundary.mjs', 'utf8')
assert.match(verifier, /AGENCY_RUNTIME_UNRELATED_EMAIL/)
assert.match(verifier, /document_packet_signers/)
assert.match(verifier, /legal_final_artifact_deliveries/)
assert.match(verifier, /storage\.from/)
assert.match(verifier, /generate-final-signed-document/)
assert.doesNotMatch(verifier, /generate-final-signed-otp/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-h1', 'verify:legal-documents:phase-h1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document H1 access-boundary contract passed.')
