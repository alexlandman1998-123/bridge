import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentLeastPrivilegeBoundary } from '../src/core/documents/legalDocumentLeastPrivilegeBoundary.js'

const fixture = { h1: { status: 'READY_FOR_H2' }, targetCount: 2, targetOrganisationCount: 1, actorMembershipOrganisationCount: 1, actorAuthorizedTargetCount: 0, policyProbes: [{ allowed: false }, { allowed: false }], tableProbes: [{ protected: true }], storageProbes: [{ protected: true }, { protected: true }], functionProbes: { mandateFinalizerRejected: true, otpFinalizerRejected: true, dispatcherRejected: true } }
assert.equal(assessLegalDocumentLeastPrivilegeBoundary(fixture).ready, true)
assert.ok(assessLegalDocumentLeastPrivilegeBoundary({ ...fixture, actorAuthorizedTargetCount: 1 }).reasons.includes('H2_ACTOR_HAS_PACKET_AUTHORITY'))
assert.ok(assessLegalDocumentLeastPrivilegeBoundary({ ...fixture, tableProbes: [{ protected: false }] }).reasons.includes('H2_SAME_TENANT_ROW_ACCESS_EXPOSED'))
const missingTargets = assessLegalDocumentLeastPrivilegeBoundary({ h1: { status: 'NO_GO' } })
assert.ok(missingTargets.reasons.includes('H2_CONTROLLED_TARGETS_MISSING'))
assert.ok(!missingTargets.reasons.includes('H2_OPERATION_AUTHORITY_INVALID'))

const migration = fs.readFileSync('../supabase/migrations/202607170025_legal_packet_least_privilege_h2.sql', 'utf8')
assert.match(migration, /bridge_can_access_legal_packet_h2/)
assert.match(migration, /assigned_agent_id = auth\.uid\(\)/)
assert.match(migration, /created_by = auth\.uid\(\)/)
assert.match(migration, /bridge_is_org_admin/)
assert.match(migration, /drop policy if exists document_packets_write/)
for (const table of ['document_packet_versions', 'document_packet_events', 'document_packet_signers', 'document_signing_fields']) assert.match(migration, new RegExp(table))
assert.match(fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8'), /FINALISER_CONTRACT = "h[234]-v1"/)
const verifier = fs.readFileSync('scripts/legal-document-phase-h2-least-privilege.mjs', 'utf8')
assert.match(verifier, /H2_UNASSIGNED_EMAIL/)
assert.match(verifier, /bridge_can_access_legal_packet_h2/)
assert.match(verifier, /FINALISATION_FORBIDDEN/)
assert.doesNotMatch(verifier, /generate-final-signed-otp/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-h2', 'verify:legal-documents:phase-h2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document H2 least-privilege contract passed.')
