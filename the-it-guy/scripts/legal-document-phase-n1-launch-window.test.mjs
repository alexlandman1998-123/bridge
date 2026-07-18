import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentLaunchWindowPreflight, LEGAL_DOCUMENT_N1_MAX_RUNTIME_EVIDENCE_AGE_MINUTES } from '../src/core/documents/legalDocumentLaunchWindowPreflight.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const projectRef = 'project-ref'
const organisationIds = ['org-2', 'org-1']
const claim = { status: 'claimed', releaseTarget: { environment: 'production', projectRef, organisationIds } }
const m3 = { status: 'READY_FOR_M4', ready: true, mutatedData: false }
const activation = { status: 'HEALTHY', projectRef, organisationIds: ['org-1', 'org-2'], secretDigestsVerified: true, releaseStatus: 'GO', checkedAt: new Date(now - 60_000).toISOString(), mutatedData: false }
const pilot = { enabled: true, environment: 'production', organisationIds: ['org-1', 'org-2'], activation: { status: 'active', targetProjectRef: projectRef, activatedOrganisationIds: ['org-2', 'org-1'] }, rollback: { strategy: 'revoke_template_approval', requiresExplicitTemplateIds: true } }
const ready = assessLegalDocumentLaunchWindowPreflight({ m3, claim, activation, pilot, rollbackReady: true, now })
assert.equal(ready.ready, true)
assert.deepEqual(ready.launchTarget.organisationIds, ['org-1', 'org-2'])
assert.equal(LEGAL_DOCUMENT_N1_MAX_RUNTIME_EVIDENCE_AGE_MINUTES, 5)

const held = assessLegalDocumentLaunchWindowPreflight({ m3: { status: 'NO_GO', ready: false, mutatedData: false }, claim: null, activation: { status: 'NOT_HEALTHY', checkedAt: new Date(now - 10 * 60_000).toISOString(), mutatedData: false }, pilot: { enabled: false, environment: 'production', organisationIds: [], activation: { status: 'inactive' }, rollback: {} }, rollbackReady: false, now })
for (const code of ['N1_M3_NOT_READY', 'N1_RELEASE_CLAIM_MISSING', 'N1_RUNTIME_ACTIVATION_UNHEALTHY', 'N1_RUNTIME_SECRET_MISMATCH', 'N1_RELEASE_GATE_NOT_GO', 'N1_PROJECT_TARGET_MISMATCH', 'N1_COHORT_TARGET_MISMATCH', 'N1_ENVIRONMENT_TARGET_MISMATCH', 'N1_PILOT_STATE_INACTIVE', 'N1_ROLLBACK_CONTROL_UNAVAILABLE', 'N1_RUNTIME_EVIDENCE_STALE']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))

const drift = assessLegalDocumentLaunchWindowPreflight({ m3, claim: { ...claim, releaseTarget: { ...claim.releaseTarget, projectRef: 'other', organisationIds: ['other'] } }, activation, pilot, rollbackReady: true, now })
assert.ok(drift.blockers.some((row) => row.code === 'N1_PROJECT_TARGET_MISMATCH'))
assert.ok(drift.blockers.some((row) => row.code === 'N1_COHORT_TARGET_MISMATCH'))
const mutating = assessLegalDocumentLaunchWindowPreflight({ m3: { ...m3, mutatedData: true }, claim, activation, pilot, rollbackReady: true, now })
assert.ok(mutating.blockers.some((row) => row.code === 'N1_NON_READ_ONLY_EVIDENCE'))

const verifier = fs.readFileSync('scripts/legal-document-phase-n1-launch-window.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-m3-verify-claim\.mjs/)
assert.match(verifier, /legal-document-phase-a3-verify\.mjs/)
assert.match(verifier, /legal-document-phase-a3-deactivate\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-n1', 'verify:legal-documents:phase-n1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document N1 launch-window preflight passed.')
