import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentCohortSoak, LEGAL_DOCUMENT_O2_SOAK_HOURS, LEGAL_DOCUMENT_O2_WATCHDOG_FRESHNESS_MINUTES } from '../src/core/documents/legalDocumentCohortSoakGate.js'

const now = Date.parse('2026-07-19T12:00:00.000Z')
const record = { status: 'continued', recordedAt: '2026-07-18T11:00:00.000Z' }
const o1 = { status: 'READY_FOR_O2', ready: true }
const metrics = { generationFailures: 0, staleSigningPackets: 0, completedOtp: 2, completedMandate: 1 }
const watchdogs = [{ status: 'healthy', created_at: '2026-07-18T12:00:00.000Z', summary: { blockers: [] } }, { status: 'healthy', created_at: '2026-07-19T11:50:00.000Z', summary: { blockers: [] } }]
const ready = assessLegalDocumentCohortSoak({ o1, record, metrics, watchdogs, targetAligned: true, now })
assert.equal(ready.ready, true)
assert.equal(ready.status, 'READY_FOR_O3')
assert.equal(ready.decision, 'SOAK_ACCEPTED')
assert.equal(LEGAL_DOCUMENT_O2_SOAK_HOURS, 24)
assert.equal(LEGAL_DOCUMENT_O2_WATCHDOG_FRESHNESS_MINUTES, 15)

const waiting = assessLegalDocumentCohortSoak({ o1, record: { ...record, recordedAt: '2026-07-19T00:00:00.000Z' }, metrics, watchdogs, targetAligned: true, now })
assert.equal(waiting.status, 'SOAK_IN_PROGRESS')
assert.ok(waiting.blockers.some((row) => row.code === 'O2_SOAK_PERIOD_INCOMPLETE'))
const upstream = assessLegalDocumentCohortSoak({ o1: { status: 'NO_GO', ready: false }, record: null, now })
assert.equal(upstream.status, 'NO_GO')
assert.equal(upstream.decision, 'HOLD_NOT_STARTED')
for (const code of ['O2_O1_NOT_READY', 'O2_CONTINUATION_RECORD_MISSING']) assert.ok(upstream.blockers.some((row) => row.code === code), code)
const stopped = assessLegalDocumentCohortSoak({ o1, record, metrics: { generationFailures: 1, staleSigningPackets: 1, completedOtp: 0, completedMandate: 0 }, watchdogs: [], targetAligned: false, storeAvailable: true, now })
assert.equal(stopped.status, 'HALT_AND_DEACTIVATE')
for (const code of ['O2_GENERATION_FAILURE_STOP', 'O2_STALE_SIGNING_STOP', 'O2_OTP_ACTIVITY_MISSING', 'O2_MANDATE_ACTIVITY_MISSING', 'O2_TARGET_DRIFT_STOP', 'O2_WATCHDOG_COVERAGE_STOP']) assert.ok(stopped.blockers.some((row) => row.code === code), code)

const verifier = fs.readFileSync('scripts/legal-document-phase-o2-soak-gate.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-o1-verify-continuation\.mjs/)
for (const table of ['document_packet_events', 'document_packets', 'system_health_snapshots']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-o2', 'verify:legal-documents:phase-o2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document O2 controlled-cohort soak gate passed.')
