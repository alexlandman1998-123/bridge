import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentCanaryContinuation, LEGAL_DOCUMENT_N4_WATCHDOG_MAX_AGE_MINUTES } from '../src/core/documents/legalDocumentCanaryContinuationGate.js'

const now = Date.parse('2026-07-18T10:10:00.000Z')
const claim = { status: 'claimed', claimedAt: '2026-07-18T10:00:00.000Z', expiresAt: '2026-07-18T10:15:00.000Z' }
const n3 = { status: 'READY_FOR_N4', ready: true, acceptedCanaries: [{ packetType: 'otp' }, { packetType: 'mandate' }] }
const watchdog = { status: 'healthy', created_at: '2026-07-18T10:08:00.000Z', summary: { blockers: [] } }
const ready = assessLegalDocumentCanaryContinuation({ n3, claim, metrics: { generationFailures: 0, staleSigningPackets: 0 }, watchdog, targetAligned: true, storeAvailable: true, now })
assert.equal(ready.ready, true)
assert.equal(ready.decision, 'CONTINUE_CONTROLLED_COHORT')
assert.equal(LEGAL_DOCUMENT_N4_WATCHDOG_MAX_AGE_MINUTES, 5)

const upstream = assessLegalDocumentCanaryContinuation({ n3: { status: 'NO_GO', ready: false }, claim: null, now })
assert.equal(upstream.decision, 'HALT_AND_DEACTIVATE')
assert.ok(upstream.blockers.some((row) => row.code === 'N4_N3_NOT_READY'))
assert.ok(upstream.blockers.some((row) => row.code === 'N4_RELEASE_CLAIM_MISSING'))
const stop = assessLegalDocumentCanaryContinuation({ n3, claim, metrics: { generationFailures: 1, staleSigningPackets: 1 }, watchdog: { ...watchdog, status: 'alert' }, targetAligned: false, storeAvailable: true, now })
for (const code of ['N4_GENERATION_FAILURE_STOP', 'N4_STALE_SIGNING_STOP', 'N4_TARGET_DRIFT_STOP', 'N4_WATCHDOG_STOP']) assert.ok(stop.blockers.some((row) => row.code === code), code)
assert.equal(stop.decision, 'HALT_AND_DEACTIVATE')
const staleWatchdog = assessLegalDocumentCanaryContinuation({ n3, claim, metrics: {}, watchdog: { ...watchdog, created_at: '2026-07-18T10:04:00.000Z' }, targetAligned: true, storeAvailable: true, now })
assert.ok(staleWatchdog.blockers.some((row) => row.code === 'N4_WATCHDOG_STOP'))
const expired = assessLegalDocumentCanaryContinuation({ n3, claim: { ...claim, expiresAt: new Date(now).toISOString() }, metrics: {}, watchdog, targetAligned: true, storeAvailable: true, now })
assert.ok(expired.blockers.some((row) => row.code === 'N4_CLAIM_EXPIRED'))

const verifier = fs.readFileSync('scripts/legal-document-phase-n4-continuation-gate.mjs', 'utf8')
assert.match(verifier, /legal-document-phase-n3-canary-acceptance\.mjs/)
for (const table of ['document_packet_events', 'document_packets', 'system_health_snapshots']) assert.match(verifier, new RegExp(table))
assert.match(verifier, /HALT_AND_DEACTIVATE/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-n4', 'verify:legal-documents:phase-n4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document N4 post-canary continuation gate passed.')
