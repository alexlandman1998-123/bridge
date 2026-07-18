import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentRolloutSafetyEnvelope, LEGAL_DOCUMENT_N2_MIN_CLAIM_REMAINING_MINUTES } from '../src/core/documents/legalDocumentRolloutSafetyEnvelope.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const target = { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-2', 'org-1'] }
const n1 = { status: 'READY_FOR_N2', ready: true, launchTarget: target, mutatedData: false }
const claim = { status: 'claimed', releaseTarget: { ...target, organisationIds: ['org-1', 'org-2'] }, expiresAt: new Date(now + 5 * 60_000).toISOString() }
const pilot = { limits: { maxOrganisations: 2, maxGenerationFailures24h: 0, maxStaleSigningPackets: 0, staleSigningHours: 2 }, rollback: { requiresExplicitTemplateIds: true } }
const controls = { monitoringReady: true, rollbackReady: true }
const ready = assessLegalDocumentRolloutSafetyEnvelope({ n1, claim, pilot, controls, now })
assert.equal(ready.ready, true)
assert.deepEqual(ready.envelope.requiredCanaries, ['otp', 'mandate'])
assert.equal(ready.envelope.claimRemainingMinutes, 5)
assert.equal(ready.envelope.stopConditions.length, 4)
assert.equal(LEGAL_DOCUMENT_N2_MIN_CLAIM_REMAINING_MINUTES, 2)

const held = assessLegalDocumentRolloutSafetyEnvelope({ n1: { status: 'NO_GO', ready: false, launchTarget: { organisationIds: [] }, mutatedData: false }, claim: null, pilot: { limits: { maxOrganisations: 9, maxGenerationFailures24h: 1, maxStaleSigningPackets: 2, staleSigningHours: 4 }, rollback: {} }, controls: {}, now })
for (const code of ['N2_N1_NOT_READY', 'N2_RELEASE_CLAIM_MISSING', 'N2_CLAIM_TARGET_MISMATCH', 'N2_BLAST_RADIUS_LIMIT_INVALID', 'N2_FAILURE_STOP_NOT_ZERO', 'N2_STALE_SIGNING_STOP_NOT_ZERO', 'N2_STALE_SIGNING_WINDOW_INVALID', 'N2_MONITORING_CONTROL_UNAVAILABLE', 'N2_ROLLBACK_CONTROL_UNAVAILABLE', 'N2_CLAIM_WINDOW_TOO_SHORT']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))

const oversized = assessLegalDocumentRolloutSafetyEnvelope({ n1: { ...n1, launchTarget: { ...target, organisationIds: ['1', '2', '3'] } }, claim: { ...claim, releaseTarget: { ...target, organisationIds: ['1', '2', '3'] } }, pilot, controls, now })
assert.ok(oversized.blockers.some((row) => row.code === 'N2_COHORT_EXCEEDS_BLAST_RADIUS'))
const expiring = assessLegalDocumentRolloutSafetyEnvelope({ n1, claim: { ...claim, expiresAt: new Date(now + 119_000).toISOString() }, pilot, controls, now })
assert.ok(expiring.blockers.some((row) => row.code === 'N2_CLAIM_WINDOW_TOO_SHORT'))

const verifier = fs.readFileSync('scripts/legal-document-phase-n2-rollout-envelope.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-n1-launch-window\.mjs/)
assert.match(verifier, /legal-document-phase5-watchdog-staging-smoke\.mjs/)
assert.match(verifier, /legal-document-phase-a3-deactivate\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-n2', 'verify:legal-documents:phase-n2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document N2 rollout safety envelope passed.')
