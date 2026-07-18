import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportSlaReadiness } from '../src/core/documents/legalDocumentSupportSlaReadiness.js'

const now = Date.parse('2026-07-17T12:00:00.000Z')
function handoff(id, minutesAgo) {
  return { id, packet_id: id, event_type: 'legal_generation_support_handoff', event_payload_json: { contract: 'j4-v1', supportReference: `LD-OTP-${id.toUpperCase()}-PDFRENDERF`, failureCode: 'PDF_RENDER_FAILED', packetType: 'otp', surface: 'workspace', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false }, created_at: new Date(now - minutesAgo * 60000).toISOString() }
}
function ack(id, minutesAgo) {
  return { id: `ack-${id}`, packet_id: id, event_type: 'legal_generation_support_acknowledged', event_payload_json: { contract: 'k2-v1', supportReference: `LD-OTP-${id.toUpperCase()}-PDFRENDERF`, action: 'acknowledge', rawDetailsIncluded: false }, created_by: 'admin-owner', created_at: new Date(now - minutesAgo * 60000).toISOString() }
}
function resolved(id) {
  return { id: `resolved-${id}`, packet_id: id, event_type: 'legal_generation_support_resolved', event_payload_json: { contract: 'k2-v1', supportReference: `LD-OTP-${id.toUpperCase()}-PDFRENDERF`, action: 'resolve', resolutionCode: 'generation_succeeded', rawDetailsIncluded: false }, created_at: new Date(now - 1 * 60000).toISOString() }
}
const events = [
  handoff('OPEN29AA', 29),
  handoff('OPEN31AA', 31),
  handoff('ACK239AA', 500), ack('ACK239AA', 239),
  handoff('ACK241AA', 500), ack('ACK241AA', 241),
  handoff('RESOLVED', 1000), ack('RESOLVED', 500), resolved('RESOLVED'),
]
const packets = ['OPEN29AA', 'OPEN31AA', 'ACK239AA', 'ACK241AA', 'RESOLVED'].map((id) => ({ id, packet_type: 'otp', title: id, status: 'draft' }))
const snapshot = buildLegalDocumentSupportTriageSnapshot({ events, packets, now })
const byId = new Map(snapshot.handoffs.map((row) => [row.packetId, row]))
assert.equal(byId.get('OPEN29AA').slaState, 'response_due')
assert.equal(byId.get('OPEN29AA').overdue, false)
assert.equal(byId.get('OPEN31AA').slaState, 'response_overdue')
assert.equal(byId.get('ACK239AA').slaState, 'resolution_due')
assert.equal(byId.get('ACK241AA').slaState, 'resolution_overdue')
assert.equal(byId.get('RESOLVED').slaState, 'complete')
assert.equal(byId.get('RESOLVED').overdue, false)
assert.equal(snapshot.summary.overdue, 2)
assert.equal(snapshot.summary.responseOverdue, 1)
assert.equal(snapshot.summary.resolutionOverdue, 1)
assert.deepEqual(snapshot.handoffs.map((row) => row.packetId), ['OPEN31AA', 'ACK241AA', 'OPEN29AA', 'ACK239AA', 'RESOLVED'])
assert.deepEqual(snapshot.sla, { responseMinutes: 30, resolutionMinutes: 240 })
assert.equal(byId.get('OPEN29AA').ageMinutes, 29)
assert.match(byId.get('OPEN29AA').nextAction, /Acknowledge/)
assert.match(byId.get('ACK239AA').nextAction, /Resolve/)

const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
assert.match(page, /SLA overdue/)
assert.match(page, /handoff\.slaState/)
assert.match(page, /handoff\.responseDueAt/)
assert.match(page, /handoff\.resolutionDueAt/)
assert.match(page, /handoff\.acknowledgedBy/)
const scenarios = ['response_due', 'response_overdue', 'resolution_due', 'resolution_overdue', 'resolved_complete', 'boundary_priority'].map((name) => ({ name, passed: true }))
const fixture = { k2: { status: 'READY_FOR_K3' }, scenarios, queuePrioritized: true, uiCovered: true, nonMutating: true }
assert.equal(assessLegalDocumentSupportSlaReadiness(fixture).ready, true)
assert.ok(assessLegalDocumentSupportSlaReadiness({ ...fixture, k2: { status: 'NO_GO' } }).reasons.includes('K3_K2_NOT_READY'))
assert.ok(assessLegalDocumentSupportSlaReadiness({ ...fixture, queuePrioritized: false }).reasons.includes('K3_QUEUE_PRIORITY_INVALID'))
console.log('Legal document K3 support SLA queue passed.')
