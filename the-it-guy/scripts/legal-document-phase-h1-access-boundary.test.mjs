import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentAccessBoundary } from '../src/core/documents/legalDocumentAccessBoundary.js'

const ready = assessLegalDocumentAccessBoundary({ g4: { status: 'READY_FOR_H1' }, targetCount: 2, unrelatedMembershipCount: 0, tableProbes: [{ protected: true }], storageProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerContract: true, otpFinalizerContract: true, dispatcherRejected: true, watchdogRejected: true } })
assert.equal(ready.ready, true)
assert.ok(assessLegalDocumentAccessBoundary({ g4: { status: 'READY_FOR_H1' }, targetCount: 2, unrelatedMembershipCount: 0, tableProbes: [{ protected: false }], storageProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerContract: true, otpFinalizerContract: true, dispatcherRejected: true, watchdogRejected: true } }).reasons.includes('H1_CROSS_TENANT_TABLE_ACCESS_EXPOSED'))
for (const file of ['../supabase/functions/generate-final-signed-document/index.ts', '../supabase/functions/generate-final-signed-otp/index.ts']) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /authorizeFinalisation/)
  assert.match(source, /FINALISATION_FORBIDDEN/)
  assert.match(source, /assigned_agent_id/)
  assert.match(source, /created_by/)
  assert.match(source, /x-legal-finalizer-contract/)
}
const verifier = fs.readFileSync('scripts/legal-document-phase-h1-access-boundary.mjs', 'utf8')
assert.match(verifier, /AGENCY_RUNTIME_UNRELATED_EMAIL/)
assert.match(verifier, /document_packet_signers/)
assert.match(verifier, /legal_final_artifact_deliveries/)
assert.match(verifier, /storage\.from/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-h1', 'verify:legal-documents:phase-h1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document H1 access-boundary contract passed.')
