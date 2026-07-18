import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessLegalDocumentOperationalReadiness } from '../src/core/documents/legalDocumentOperationalReadiness.js'

const now = Date.parse('2026-07-18T10:00:00Z')
const config = { status: 'ready', maximumWatchdogAgeMinutes: 90, operationsOwner: 'Operations Lead', supportOwner: 'Support Lead', incidentChannelReference: 'INCIDENT-CHANNEL', monitoringReference: 'MONITOR-001', supportRunbookReference: 'docs/legal-document-phase5-operations.md', rollbackRunbookReference: 'docs/legal-document-phase4-controlled-launch.md#monitoring-and-rollback' }
const watchdog = { status: 'healthy', created_at: '2026-07-18T09:30:00Z', summary: { kind: 'legal_document_watchdog_v1', blockers: [], metrics: { unresolvedGenerationFailures: 0, staleSigningPackets: 0, missingFinalArtifacts: 0, missingFinalArtifactEvidence: 0, incompleteFinalDeliveries: 0, missingPortalPublications: 0 } } }
const ready = assessLegalDocumentOperationalReadiness({ config, g2: { status: 'READY_FOR_G3' }, monitor: { status: 'HEALTHY' }, reconciliation: { status: 'CLEAN', mutatedData: false }, watchdog, now })
assert.equal(ready.ready, true)
assert.ok(assessLegalDocumentOperationalReadiness({ config: { ...config, supportOwner: '' }, g2: { status: 'READY_FOR_G3' }, monitor: { status: 'HEALTHY' }, reconciliation: { status: 'CLEAN', mutatedData: false }, watchdog, now }).reasons.includes('G3_SUPPORT_OWNER_MISSING'))
assert.ok(assessLegalDocumentOperationalReadiness({ config, g2: { status: 'READY_FOR_G3' }, monitor: { status: 'HEALTHY' }, reconciliation: { status: 'CLEAN', mutatedData: false }, watchdog: { ...watchdog, created_at: '2026-07-18T07:00:00Z' }, now }).reasons.includes('G3_WATCHDOG_NOT_FRESH_HEALTHY'))
const uncovered = structuredClone(watchdog)
delete uncovered.summary.metrics.incompleteFinalDeliveries
assert.ok(assessLegalDocumentOperationalReadiness({ config, g2: { status: 'READY_FOR_G3' }, monitor: { status: 'HEALTHY' }, reconciliation: { status: 'CLEAN', mutatedData: false }, watchdog: uncovered, now }).reasons.includes('G3_WATCHDOG_COVERAGE_INVALID'))

const verifier = fs.readFileSync('scripts/legal-document-phase-g3-operational-readiness.mjs', 'utf8')
const watchdogSource = fs.readFileSync('../supabase/functions/legal-document-watchdog/index.ts', 'utf8')
for (const token of ['FINAL_ARTIFACT_EVIDENCE_MISSING', 'FINAL_DELIVERY_INCOMPLETE', 'PORTAL_PUBLICATION_MISSING', 'missingFinalArtifactEvidence', 'incompleteFinalDeliveries', 'missingPortalPublications']) assert.match(watchdogSource, new RegExp(token))
assert.match(verifier, /legal-document-phase-g2-browser-usability\.mjs/)
assert.match(verifier, /legal-document-phase5-reconcile\.mjs/)
assert.match(verifier, /system_health_snapshots/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-g3', 'verify:legal-documents:phase-g3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document G3 operational readiness contract passed.')
