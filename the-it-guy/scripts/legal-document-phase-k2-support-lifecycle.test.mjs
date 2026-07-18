import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot, LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportLifecycleReadiness } from '../src/core/documents/legalDocumentSupportLifecycleReadiness.js'

assert.deepEqual(LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES, ['generation_succeeded', 'template_corrected', 'access_restored', 'session_restored', 'platform_incident_resolved', 'duplicate_closed'])
const handoff = { id: 'handoff', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: { contract: 'j4-v1', supportReference: 'LD-MAN-12345678-PDFRENDERF', failureCode: 'PDF_RENDER_FAILED', packetType: 'mandate', surface: 'workspace', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false }, created_at: '2026-07-17T10:00:00.000Z' }
const acknowledged = { id: 'ack', packet_id: 'packet-1', event_type: 'legal_generation_support_acknowledged', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-MAN-12345678-PDFRENDERF', action: 'acknowledge', rawDetailsIncluded: false }, created_by: 'admin-1', created_at: '2026-07-17T11:00:00.000Z' }
const resolved = { id: 'resolved', packet_id: 'packet-1', event_type: 'legal_generation_support_resolved', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-MAN-12345678-PDFRENDERF', action: 'resolve', resolutionCode: 'template_corrected', rawDetailsIncluded: false }, created_by: 'admin-2', created_at: '2026-07-17T12:00:00.000Z' }
const packet = { id: 'packet-1', title: 'Seller mandate', packet_type: 'mandate', status: 'draft' }
const openSnapshot = buildLegalDocumentSupportTriageSnapshot({ events: [handoff], packets: [packet] })
assert.equal(openSnapshot.handoffs[0].caseStatus, 'open')
assert.equal(openSnapshot.summary.open, 1)
const acknowledgedSnapshot = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, acknowledged], packets: [packet] })
assert.equal(acknowledgedSnapshot.handoffs[0].caseStatus, 'acknowledged')
assert.equal(acknowledgedSnapshot.handoffs[0].acknowledgedBy, 'admin-1')
const resolvedSnapshot = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, acknowledged, resolved], packets: [packet] })
assert.equal(resolvedSnapshot.handoffs[0].caseStatus, 'resolved')
assert.equal(resolvedSnapshot.handoffs[0].resolutionCode, 'template_corrected')
assert.equal(resolvedSnapshot.summary.resolved, 1)
const unsafeResolution = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, acknowledged, { ...resolved, event_payload_json: { ...resolved.event_payload_json, resolutionCode: 'raw free text', rawNote: 'private@example.com' } }], packets: [packet] })
assert.equal(unsafeResolution.handoffs[0].caseStatus, 'acknowledged')
assert.doesNotMatch(JSON.stringify(unsafeResolution), /private@example\.com|rawNote/)

const migration = fs.readFileSync('../supabase/migrations/202607170031_legal_generation_support_triage_k2.sql', 'utf8')
assert.match(migration, /create unique index if not exists document_packet_events_legal_support_lifecycle_once_k2/)
assert.match(migration, /legal_generation_support_acknowledged/)
assert.match(migration, /legal_generation_support_resolved/)
assert.match(migration, /event_payload_json ->> 'supportReference'/)
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const start = api.indexOf('export async function transitionLegalDocumentGenerationSupportHandoff')
const source = api.slice(start, api.indexOf('export async function archiveDocumentPacket', start))
assert.match(source, /if \(!context\.isOrgAdmin\)/)
assert.match(source, /SUPPORT_HANDOFF_ACKNOWLEDGEMENT_REQUIRED/)
assert.match(source, /LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES\.includes/)
assert.match(source, /error\?\.code === '23505'/)
assert.match(source, /rawDetailsIncluded: false/)
const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
assert.match(page, /transitionLegalDocumentGenerationSupportHandoff/)
assert.match(page, /Acknowledge/)
assert.match(page, /LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES\.map/)
assert.match(page, /Resolve/)

const scenarios = ['open', 'acknowledged', 'resolved', 'invalid_resolution_rejected', 'duplicate_guard', 'append_only'].map((name) => ({ name, passed: true }))
const fixture = { k1: { status: 'READY_FOR_K2' }, scenarios, adminGuarded: true, transitionGuarded: true, databaseUnique: true, uiCovered: true }
assert.equal(assessLegalDocumentSupportLifecycleReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentSupportLifecycleReadiness({ ...fixture, k1: { status: 'NO_GO' } }).reasons.includes('K2_K1_NOT_READY'))
assert.ok(assessLegalDocumentSupportLifecycleReadiness({ ...fixture, databaseUnique: false }).reasons.includes('K2_DUPLICATE_LIFECYCLE_UNGUARDED'))
console.log('Legal document K2 support lifecycle passed.')
