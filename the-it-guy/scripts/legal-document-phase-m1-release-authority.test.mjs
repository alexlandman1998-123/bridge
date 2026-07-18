import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentProductionReleaseAuthority, LEGAL_DOCUMENT_M1_MAX_EVIDENCE_AGE_MINUTES } from '../src/core/documents/legalDocumentProductionReleaseAuthority.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const checkedAt = new Date(now - 60_000).toISOString()
const l3 = {
  status: 'READY_FOR_L4', gateComplete: true, checkedAt, mutatedData: false,
  evidence: { l1Status: 'READY_FOR_L2', l2Status: 'READY_FOR_L3', coverage: { otp: true, mandate: true }, activationProjectRef: 'project-ref', l1CheckedAt: checkedAt, l2CheckedAt: checkedAt, l1MutatedData: false, l2MutatedData: false },
}
const pilot = {
  enabled: true, environment: 'production', organisationIds: ['org-1'],
  activation: { status: 'active', targetProjectRef: 'project-ref', activatedOrganisationIds: ['org-1'] },
  releasePreparation: { status: 'approved', organisationIds: ['org-1'], approvedBy: 'owner', approvedAt: checkedAt, approvalReference: 'REL-1' },
}
const ready = assessLegalDocumentProductionReleaseAuthority({ l3, pilot, confirmation: { environment: 'production', projectRef: 'project-ref' }, now })
assert.equal(ready.authorized, true)
assert.deepEqual(ready.blockers, [])
assert.equal(ready.evidenceAgeLimitMinutes, 15)
assert.equal(LEGAL_DOCUMENT_M1_MAX_EVIDENCE_AGE_MINUTES, 15)

const held = assessLegalDocumentProductionReleaseAuthority({ l3: { ...l3, status: 'EXECUTION_WAVE_READY', gateComplete: false, evidence: { ...l3.evidence, l1Status: 'NO_GO', coverage: { otp: false, mandate: false } } }, pilot: { ...pilot, enabled: false, activation: { status: 'inactive', targetProjectRef: null, activatedOrganisationIds: [] }, releasePreparation: { status: 'pending_evidence', organisationIds: [] } }, confirmation: {}, now })
for (const code of ['M1_L1_NOT_CERTIFIED', 'M1_L3_GATE_NOT_COMPLETE', 'M1_OTP_COVERAGE_MISSING', 'M1_MANDATE_COVERAGE_MISSING', 'M1_RELEASE_ENVIRONMENT_UNCONFIRMED', 'M1_RELEASE_PROJECT_UNCONFIRMED', 'M1_TARGET_PROJECT_MISSING', 'M1_PILOT_NOT_ACTIVE', 'M1_RELEASE_PREPARATION_NOT_APPROVED', 'M1_RELEASE_COHORT_EMPTY']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))

const mismatch = assessLegalDocumentProductionReleaseAuthority({ l3, pilot, confirmation: { environment: 'staging', projectRef: 'other-ref' }, now })
assert.ok(mismatch.blockers.some((row) => row.code === 'M1_RELEASE_ENVIRONMENT_MISMATCH'))
assert.ok(mismatch.blockers.some((row) => row.code === 'M1_RELEASE_PROJECT_MISMATCH'))

const staleAt = new Date(now - 16 * 60_000).toISOString()
const stale = assessLegalDocumentProductionReleaseAuthority({ l3: { ...l3, checkedAt: staleAt, evidence: { ...l3.evidence, l1CheckedAt: staleAt, l2CheckedAt: staleAt } }, pilot, confirmation: { environment: 'production', projectRef: 'project-ref' }, now })
assert.ok(stale.blockers.some((row) => row.code === 'M1_EVIDENCE_STALE'))
const mutating = assessLegalDocumentProductionReleaseAuthority({ l3: { ...l3, mutatedData: true }, pilot, confirmation: { environment: 'production', projectRef: 'project-ref' }, now })
assert.ok(mutating.blockers.some((row) => row.code === 'M1_NON_READ_ONLY_EVIDENCE'))
const expansionPilot = { ...pilot, activation: { ...pilot.activation, expansionActivationDigest: 'sha256:activation' } }
const expansionHeld = assessLegalDocumentProductionReleaseAuthority({ l3, pilot: expansionPilot, confirmation: { environment: 'production', projectRef: 'project-ref' }, expansion: { required: true, activationDigest: 'sha256:activation', q3: { status: 'NO_GO', ready: false, mutatedData: false } }, now })
assert.ok(expansionHeld.blockers.some((row) => row.code === 'M1_Q3_EXPANSION_NOT_VERIFIED'))
const expansionReady = assessLegalDocumentProductionReleaseAuthority({ l3, pilot: expansionPilot, confirmation: { environment: 'production', projectRef: 'project-ref' }, expansion: { required: true, activationDigest: 'sha256:activation', q3: { status: 'READY_FOR_M1', ready: true, mutatedData: false, verification: { sourceActivationDigest: 'sha256:activation' } } }, now })
assert.equal(expansionReady.authorized, true)

const verifier = fs.readFileSync('scripts/legal-document-phase-m1-release-authority.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-l3-execution-gate\.mjs/)
assert.match(verifier, /LEGAL_DOCUMENT_RELEASE_ENVIRONMENT/)
assert.match(verifier, /LEGAL_DOCUMENT_RELEASE_PROJECT_REF/)
assert.match(verifier, /legal-document-phase-q3-verify-activation\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-m1', 'verify:legal-documents:phase-m1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document M1 production release authority passed.')
