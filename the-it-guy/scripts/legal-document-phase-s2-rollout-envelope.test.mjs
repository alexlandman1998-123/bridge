import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedRolloutSafetyEnvelope, LEGAL_DOCUMENT_S2_MIN_CLAIM_REMAINING_MINUTES } from '../src/core/documents/legalDocumentExpandedRolloutSafetyEnvelope.js'

const now = Date.parse('2026-07-18T10:00:00.000Z')
const target = { environment: 'production', projectRef: 'project-ref', organisationIds: ['org-2', 'org-1'] }
const s1 = { status: 'READY_FOR_S2', ready: true, launchTarget: target, mutatedData: false }
const claim = { status: 'claimed', sourceActivationDigest: 'sha256:activation', releaseTarget: { ...target, organisationIds: ['org-1', 'org-2'] }, expiresAt: new Date(now + 5 * 60_000).toISOString() }
const activation = { status: 'activated', activationDigest: 'sha256:activation', previousOrganisationIds: ['org-1'], addedOrganisationId: 'org-2', activatedOrganisationIds: ['org-1', 'org-2'] }
const pilot = { limits: { maxOrganisations: 2, maxGenerationFailures24h: 0, maxStaleSigningPackets: 0, staleSigningHours: 2 }, rollback: { requiresExplicitTemplateIds: true } }
const controls = { monitoringReady: true, rollbackReady: true }
const ready = assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1, claim, activation, pilot, controls, now })
assert.equal(ready.ready, true)
assert.deepEqual(ready.envelope.requiredCanaries, ['otp', 'mandate'])
assert.equal(ready.envelope.canaryOrganisationId, 'org-2')
assert.equal(ready.envelope.claimRemainingMinutes, 5)
assert.equal(ready.envelope.stopConditions.length, 4)
assert.equal(LEGAL_DOCUMENT_S2_MIN_CLAIM_REMAINING_MINUTES, 2)
const held = assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1: { status: 'NO_GO', ready: false, launchTarget: { organisationIds: [] }, mutatedData: false }, claim: null, activation: null, pilot: { limits: { maxOrganisations: 9, maxGenerationFailures24h: 1, maxStaleSigningPackets: 2, staleSigningHours: 4 }, rollback: {} }, controls: {}, now })
for (const code of ['S2_S1_NOT_READY', 'S2_RELEASE_CLAIM_MISSING', 'S2_ACTIVATION_RECORD_MISSING', 'S2_CLAIM_TARGET_MISMATCH', 'S2_EXPANSION_TRANCHE_INVALID', 'S2_ACTIVATION_BINDING_INVALID', 'S2_BLAST_RADIUS_LIMIT_INVALID', 'S2_FAILURE_STOP_NOT_ZERO', 'S2_STALE_SIGNING_STOP_NOT_ZERO', 'S2_STALE_SIGNING_WINDOW_INVALID', 'S2_MONITORING_CONTROL_UNAVAILABLE', 'S2_ROLLBACK_CONTROL_UNAVAILABLE', 'S2_CLAIM_WINDOW_TOO_SHORT']) assert.ok(held.blockers.some((row) => row.code === code), code)
assert.ok(held.blockers.every((row) => row.solution))
const wrongCanary = assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1, claim, activation: { ...activation, addedOrganisationId: 'org-3' }, pilot, controls, now })
assert.ok(wrongCanary.blockers.some((row) => row.code === 'S2_EXPANSION_TRANCHE_INVALID'))
const expiring = assessLegalDocumentExpandedRolloutSafetyEnvelope({ s1, claim: { ...claim, expiresAt: new Date(now + 119_000).toISOString() }, activation, pilot, controls, now })
assert.ok(expiring.blockers.some((row) => row.code === 'S2_CLAIM_WINDOW_TOO_SHORT'))
const verifier = fs.readFileSync('scripts/legal-document-phase-s2-rollout-envelope.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-s1-launch-window\.mjs/)
assert.match(verifier, /legal-document-expanded-release-claim\.json/)
assert.match(verifier, /legal-document-phase5-watchdog-staging-smoke\.mjs/)
assert.match(verifier, /legal-document-phase-a3-deactivate\.mjs/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /writeFileSync|renameSync|\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-s2', 'verify:legal-documents:phase-s2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document S2 expanded-cohort rollout safety envelope passed.')
