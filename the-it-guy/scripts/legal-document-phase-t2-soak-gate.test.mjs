import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortSoak, LEGAL_DOCUMENT_T2_SOAK_HOURS, LEGAL_DOCUMENT_T2_WATCHDOG_FRESHNESS_MINUTES } from '../src/core/documents/legalDocumentExpandedCohortSoakGate.js'

const now = Date.parse('2026-07-19T12:00:00.000Z')
const record = { status: 'continued', recordedAt: '2026-07-18T11:00:00.000Z' }
const t1 = { status: 'READY_FOR_T2', ready: true }
const metrics = { generationFailures: 0, staleSigningPackets: 0, addedOrganisationCompletedOtp: 2, addedOrganisationCompletedMandate: 1 }
const watchdogs = [{ status: 'healthy', created_at: '2026-07-18T12:00:00.000Z', summary: { blockers: [] } }, { status: 'healthy', created_at: '2026-07-19T11:50:00.000Z', summary: { blockers: [] } }]
const ready = assessLegalDocumentExpandedCohortSoak({ t1, record, metrics, watchdogs, targetAligned: true, activationAligned: true, now })
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_T3')
assert.equal(ready.decision, 'EXPANDED_SOAK_ACCEPTED')
assert.equal(LEGAL_DOCUMENT_T2_SOAK_HOURS, 24)
assert.equal(LEGAL_DOCUMENT_T2_WATCHDOG_FRESHNESS_MINUTES, 15)
const waiting = assessLegalDocumentExpandedCohortSoak({ t1, record: { ...record, recordedAt: '2026-07-19T00:00:00.000Z' }, metrics, watchdogs, targetAligned: true, activationAligned: true, now })
assert.equal(waiting.status, 'SOAK_IN_PROGRESS')
assert.ok(waiting.blockers.some((row) => row.code === 'T2_SOAK_PERIOD_INCOMPLETE'))
const upstream = assessLegalDocumentExpandedCohortSoak({ t1: { status: 'NO_GO', ready: false }, record: null, now })
assert.equal(upstream.status, 'NO_GO')
for (const code of ['T2_T1_NOT_READY', 'T2_CONTINUATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const stopped = assessLegalDocumentExpandedCohortSoak({ t1, record, metrics: { generationFailures: 1, staleSigningPackets: 1, addedOrganisationCompletedOtp: 0, addedOrganisationCompletedMandate: 0 }, watchdogs: [], targetAligned: false, activationAligned: false, storeAvailable: true, now })
assert.equal(stopped.status, 'HALT_AND_DEACTIVATE')
for (const code of ['T2_GENERATION_FAILURE_STOP', 'T2_STALE_SIGNING_STOP', 'T2_ADDED_ORGANISATION_OTP_ACTIVITY_MISSING', 'T2_ADDED_ORGANISATION_MANDATE_ACTIVITY_MISSING', 'T2_TARGET_DRIFT_STOP', 'T2_ACTIVATION_BINDING_STOP', 'T2_WATCHDOG_COVERAGE_STOP']) assert.ok(stopped.blockers.some((row) => row.code === code), code)
const verifier = fs.readFileSync('scripts/legal-document-phase-t2-soak-gate.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-t1-verify-continuation\.mjs/)
for (const table of ['document_packet_events', 'document_packets', 'system_health_snapshots']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /addedOrganisationCompletedOtp/)
assert.match(verifier, /sourceActivationDigest/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-t2', 'verify:legal-documents:phase-t2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document T2 expanded-cohort soak gate passed.')
