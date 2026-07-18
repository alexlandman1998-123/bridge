import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportSlaReadiness } from '../src/core/documents/legalDocumentSupportSlaReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const k2 = runJson('scripts/legal-document-phase-k2-support-lifecycle.mjs')
const now = Date.parse('2026-07-17T12:00:00.000Z')
function base(id, minutes, reference) { return { id, packet_id: id, event_type: 'legal_generation_support_handoff', event_payload_json: { contract: 'j4-v1', supportReference: reference, failureCode: 'PDF_RENDER_FAILED', packetType: 'mandate', surface: 'workspace', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false }, created_at: new Date(now - minutes * 60000).toISOString() } }
const events = [
  base('response-due', 29, 'LD-MAN-RESPDUE1-PDFRENDERF'),
  base('response-overdue', 31, 'LD-MAN-RESPOVER-PDFRENDERF'),
  base('resolution-due', 500, 'LD-MAN-RESDUE11-PDFRENDERF'),
  { id: 'ack-due', packet_id: 'resolution-due', event_type: 'legal_generation_support_acknowledged', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-MAN-RESDUE11-PDFRENDERF', rawDetailsIncluded: false }, created_at: new Date(now - 239 * 60000).toISOString() },
  base('resolution-overdue', 500, 'LD-MAN-RESOVER1-PDFRENDERF'),
  { id: 'ack-overdue', packet_id: 'resolution-overdue', event_type: 'legal_generation_support_acknowledged', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-MAN-RESOVER1-PDFRENDERF', rawDetailsIncluded: false }, created_at: new Date(now - 241 * 60000).toISOString() },
]
const snapshot = buildLegalDocumentSupportTriageSnapshot({ events, packets: events.filter((event) => event.event_type === 'legal_generation_support_handoff').map((event) => ({ id: event.packet_id, packet_type: 'mandate', title: event.packet_id, status: 'draft' })), now })
const states = new Map(snapshot.handoffs.map((row) => [row.packetId, row.slaState]))
const scenarios = [
  { name: 'response_due_boundary', passed: states.get('response-due') === 'response_due' },
  { name: 'response_overdue_boundary', passed: states.get('response-overdue') === 'response_overdue' },
  { name: 'resolution_due_boundary', passed: states.get('resolution-due') === 'resolution_due' },
  { name: 'resolution_overdue_boundary', passed: states.get('resolution-overdue') === 'resolution_overdue' },
  { name: 'summary', passed: snapshot.summary.overdue === 2 && snapshot.summary.responseOverdue === 1 && snapshot.summary.resolutionOverdue === 1 },
  { name: 'priority', passed: snapshot.handoffs[0]?.slaState === 'response_overdue' && snapshot.handoffs[1]?.slaState === 'resolution_overdue' },
]
const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
const uiCovered = page.includes('SLA overdue') && page.includes('handoff.slaState') && page.includes('handoff.responseDueAt') && page.includes('handoff.resolutionDueAt')
const model = fs.readFileSync('src/core/documents/legalDocumentSupportTriage.js', 'utf8')
const nonMutating = !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(model)
const priorityOrder = snapshot.handoffs.map((row) => row.slaState)
const queuePrioritized = priorityOrder.indexOf('response_overdue') < priorityOrder.indexOf('response_due') && priorityOrder.indexOf('resolution_overdue') < priorityOrder.indexOf('resolution_due')
const assessment = assessLegalDocumentSupportSlaReadiness({ k2: k2 || {}, scenarios, queuePrioritized, uiCovered, nonMutating })
const solutions = {
  K3_K2_NOT_READY: 'Complete K2 support lifecycle and its upstream gates before certifying SLA prioritisation.',
  K3_SLA_CONTRACT_INCOMPLETE: 'Apply the 30-minute response and four-hour resolution boundaries consistently.',
  K3_QUEUE_PRIORITY_INVALID: 'Sort overdue response and resolution work ahead of due and completed cases.',
  K3_SLA_VISIBILITY_MISSING: 'Show SLA state, due time, overdue totals, and acknowledged owner in Operations Center.',
  K3_SLA_EVALUATION_MUTATING: 'Keep SLA evaluation derived and read-only.',
}
console.log(JSON.stringify({ phase: 'K3', status: assessment.ready ? 'READY_FOR_L1' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { k2Status: k2?.status || 'UNAVAILABLE', scenarios, summary: snapshot.summary, priorityOrder, queuePrioritized, uiCovered, nonMutating }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
