import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportTriageReadiness } from '../src/core/documents/legalDocumentSupportTriageReadiness.js'

const validPayload = { contract: 'j4-v1', supportReference: 'LD-OTP-12345678-PDFRENDERF', failureCode: 'PDF_RENDER_FAILED', packetType: 'otp', surface: 'workspace', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false, rawError: 'private@example.com provider stack' }
const events = [
  { id: 'new', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: validPayload, created_by: 'actor-1', created_at: '2026-07-17T12:00:00.000Z' },
  { id: 'old', packet_id: 'packet-2', event_type: 'legal_generation_support_handoff', event_payload_json: { ...validPayload, supportReference: 'LD-MAN-87654321-MISSINGTEM', packetType: 'mandate', failureCode: 'MISSING_TEMPLATE_FILE', escalationType: 'administrator', failureCount: 1 }, created_at: '2026-07-16T12:00:00.000Z' },
  { id: 'unsafe', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: { ...validPayload, rawDetailsIncluded: true }, created_at: '2026-07-18T12:00:00.000Z' },
  { id: 'wrong-contract', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: { ...validPayload, contract: 'unknown' }, created_at: '2026-07-18T12:00:00.000Z' },
  { id: 'wrong-type', packet_id: 'packet-1', event_type: 'generation_failed', event_payload_json: validPayload, created_at: '2026-07-18T12:00:00.000Z' },
]
const packets = [{ id: 'packet-1', title: 'OTP - Unit 4', packet_type: 'otp', status: 'generated' }, { id: 'packet-2', title: 'Seller mandate', packet_type: 'mandate', status: 'draft' }]
const snapshot = buildLegalDocumentSupportTriageSnapshot({ events, packets })
assert.equal(snapshot.handoffs.length, 2)
assert.equal(snapshot.handoffs[0].id, 'new')
assert.equal(snapshot.summary.total, 2)
assert.equal(snapshot.summary.otp, 1)
assert.equal(snapshot.summary.mandate, 1)
assert.equal(snapshot.summary.support, 1)
assert.equal(snapshot.summary.administrator, 1)
assert.equal(snapshot.summary.repeatedFailures, 1)
assert.deepEqual(Object.keys(snapshot.handoffs[0]).sort(), ['acknowledgedAt', 'acknowledgedBy', 'actorId', 'ageMinutes', 'caseStatus', 'createdAt', 'escalationType', 'failureCode', 'failureCount', 'id', 'nextAction', 'overdue', 'packetId', 'packetStatus', 'packetTitle', 'packetType', 'resolutionCode', 'resolutionDueAt', 'resolvedAt', 'resolvedBy', 'responseDueAt', 'slaState', 'supportReference', 'surface'].sort())
assert.doesNotMatch(JSON.stringify(snapshot), /private@example\.com|provider stack|rawError/)

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const functionStart = api.indexOf('export async function listLegalDocumentGenerationSupportHandoffs')
const functionSource = api.slice(functionStart, api.indexOf('export async function transitionLegalDocumentGenerationSupportHandoff', functionStart))
assert.ok(functionStart > 0)
assert.match(functionSource, /if \(!context\.isOrgAdmin\)/)
assert.match(functionSource, /SUPPORT_HANDOFF_ADMIN_REQUIRED/)
assert.match(functionSource, /\.eq\('organisation_id', context\.organisationId\)/)
assert.match(functionSource, /\.eq\('event_type', 'legal_generation_support_handoff'\)/)
assert.match(functionSource, /\.eq\('event_payload_json->>contract', 'j4-v1'\)/)
assert.doesNotMatch(functionSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
assert.match(page, /Legal generation support handoffs/)
assert.match(page, /listLegalDocumentGenerationSupportHandoffs/)
assert.match(page, /SUPPORT_HANDOFF_ADMIN_REQUIRED/)
assert.match(page, /handoff\.supportReference/)

const scenarios = ['valid_rows', 'unsafe_rejected', 'wrong_contract_rejected', 'summary', 'payload_whitelist'].map((name) => ({ name, passed: true }))
const fixture = { j4: { status: 'READY_FOR_K1' }, scenarios, apiAdminGuarded: true, organisationScoped: true, uiCovered: true, readOnly: true }
assert.equal(assessLegalDocumentSupportTriageReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentSupportTriageReadiness({ ...fixture, j4: { status: 'NO_GO' } }).reasons.includes('K1_J4_NOT_READY'))
assert.ok(assessLegalDocumentSupportTriageReadiness({ ...fixture, apiAdminGuarded: false }).reasons.includes('K1_ADMIN_BOUNDARY_MISSING'))
console.log('Legal document K1 support triage feed passed.')
