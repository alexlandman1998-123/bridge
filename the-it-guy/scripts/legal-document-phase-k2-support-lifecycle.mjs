import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportLifecycleReadiness } from '../src/core/documents/legalDocumentSupportLifecycleReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const k1 = runJson('scripts/legal-document-phase-k1-support-triage.mjs')
const handoff = { id: 'handoff', packet_id: 'packet', event_type: 'legal_generation_support_handoff', event_payload_json: { contract: 'j4-v1', supportReference: 'LD-OTP-PROBEPAC-PDFRENDERF', failureCode: 'PDF_RENDER_FAILED', packetType: 'otp', surface: 'workspace', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false }, created_at: '2026-07-17T10:00:00.000Z' }
const ack = { id: 'ack', packet_id: 'packet', event_type: 'legal_generation_support_acknowledged', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-OTP-PROBEPAC-PDFRENDERF', action: 'acknowledge', rawDetailsIncluded: false }, created_at: '2026-07-17T11:00:00.000Z' }
const resolution = { id: 'resolved', packet_id: 'packet', event_type: 'legal_generation_support_resolved', event_payload_json: { contract: 'k2-v1', supportReference: 'LD-OTP-PROBEPAC-PDFRENDERF', action: 'resolve', resolutionCode: 'generation_succeeded', rawDetailsIncluded: false }, created_at: '2026-07-17T12:00:00.000Z' }
const packet = { id: 'packet', packet_type: 'otp', title: 'Probe OTP', status: 'generated' }
const open = buildLegalDocumentSupportTriageSnapshot({ events: [handoff], packets: [packet] })
const acknowledged = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, ack], packets: [packet] })
const resolved = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, ack, resolution], packets: [packet] })
const invalid = buildLegalDocumentSupportTriageSnapshot({ events: [handoff, ack, { ...resolution, event_payload_json: { ...resolution.event_payload_json, resolutionCode: 'free_text', rawNote: 'secret' } }], packets: [packet] })
const migration = fs.readFileSync('../supabase/migrations/202607170031_legal_generation_support_triage_k2.sql', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const start = api.indexOf('export async function transitionLegalDocumentGenerationSupportHandoff')
const source = api.slice(start, api.indexOf('export async function archiveDocumentPacket', start))
const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
const scenarios = [
  { name: 'open_state', passed: open.handoffs[0]?.caseStatus === 'open' },
  { name: 'acknowledged_state', passed: acknowledged.handoffs[0]?.caseStatus === 'acknowledged' },
  { name: 'resolved_state', passed: resolved.handoffs[0]?.caseStatus === 'resolved' && resolved.handoffs[0]?.resolutionCode === 'generation_succeeded' },
  { name: 'invalid_resolution_rejected', passed: invalid.handoffs[0]?.caseStatus === 'acknowledged' && !JSON.stringify(invalid).includes('secret') },
  { name: 'duplicate_guard', passed: /create unique index[\s\S]*event_payload_json ->> 'supportReference'/.test(migration) && /error\?\.code === '23505'/.test(source) },
  { name: 'append_only', passed: /appendDocumentPacketEvent/.test(source) && !/\.update\(|\.delete\(/.test(source) },
]
const adminGuarded = /if \(!context\.isOrgAdmin\)/.test(source)
const transitionGuarded = /SUPPORT_HANDOFF_ACKNOWLEDGEMENT_REQUIRED/.test(source) && /LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES\.includes/.test(source)
const databaseUnique = /document_packet_events_legal_support_lifecycle_once_k2/.test(migration)
const uiCovered = page.includes('transitionLegalDocumentGenerationSupportHandoff') && page.includes('LEGAL_DOCUMENT_SUPPORT_RESOLUTION_CODES.map') && page.includes('Acknowledge')
const assessment = assessLegalDocumentSupportLifecycleReadiness({ k1: k1 || {}, scenarios, adminGuarded, transitionGuarded, databaseUnique, uiCovered })
const solutions = {
  K2_K1_NOT_READY: 'Complete K1 support triage and its upstream gates before certifying case lifecycle actions.',
  K2_LIFECYCLE_CONTRACT_INCOMPLETE: 'Fold append-only acknowledgement and resolution events into Open, Acknowledged, and Resolved states.',
  K2_ADMIN_BOUNDARY_MISSING: 'Require organisation-administrator access for support lifecycle transitions.',
  K2_STATE_TRANSITION_UNSAFE: 'Require acknowledgement before resolution and allow only predefined resolution categories.',
  K2_DUPLICATE_LIFECYCLE_UNGUARDED: 'Deploy the K2 unique lifecycle index and handle concurrent duplicate actions idempotently.',
  K2_OPERATOR_ACTIONS_MISSING: 'Expose acknowledge and categorized resolve actions in Operations Center.',
}
console.log(JSON.stringify({ phase: 'K2', status: assessment.ready ? 'READY_FOR_K3' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { k1Status: k1?.status || 'UNAVAILABLE', scenarios, adminGuarded, transitionGuarded, databaseUnique, uiCovered }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
