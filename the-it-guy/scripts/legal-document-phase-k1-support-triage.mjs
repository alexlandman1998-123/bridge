import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentSupportTriageSnapshot } from '../src/core/documents/legalDocumentSupportTriage.js'
import { assessLegalDocumentSupportTriageReadiness } from '../src/core/documents/legalDocumentSupportTriageReadiness.js'

function runJson(script, timeout = 300_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return null }
}
const j4 = runJson('scripts/legal-document-phase-j4-support-handoff.mjs')
const payload = { contract: 'j4-v1', supportReference: 'LD-MAN-PROBEPAC-PDFRENDERF', failureCode: 'PDF_RENDER_FAILED', packetType: 'mandate', surface: 'packet_panel', failureCount: 2, escalationType: 'support', rawDetailsIncluded: false, rawError: 'private@example.com provider stack' }
const events = [
  { id: 'valid', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: payload, created_at: '2026-07-17T12:00:00.000Z' },
  { id: 'unsafe', packet_id: 'packet-1', event_type: 'legal_generation_support_handoff', event_payload_json: { ...payload, rawDetailsIncluded: true }, created_at: '2026-07-18T12:00:00.000Z' },
  { id: 'wrong', packet_id: 'packet-1', event_type: 'other', event_payload_json: payload, created_at: '2026-07-18T12:00:00.000Z' },
]
const snapshot = buildLegalDocumentSupportTriageSnapshot({ events, packets: [{ id: 'packet-1', packet_type: 'mandate', title: 'Probe mandate', status: 'draft' }] })
const snapshotText = JSON.stringify(snapshot)
const scenarios = [
  { name: 'valid_handoff_visible', passed: snapshot.handoffs.length === 1 && snapshot.handoffs[0].id === 'valid' },
  { name: 'unsafe_handoff_hidden', passed: !snapshotText.includes('unsafe') },
  { name: 'raw_payload_hidden', passed: !snapshotText.includes('private@example.com') && !snapshotText.includes('provider stack') && !snapshotText.includes('rawError') },
  { name: 'packet_context_joined', passed: snapshot.handoffs[0]?.packetTitle === 'Probe mandate' },
  { name: 'summary_correct', passed: snapshot.summary.total === 1 && snapshot.summary.repeatedFailures === 1 },
]
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const start = api.indexOf('export async function listLegalDocumentGenerationSupportHandoffs')
const source = api.slice(start, api.indexOf('export async function transitionLegalDocumentGenerationSupportHandoff', start))
const apiAdminGuarded = /if \(!context\.isOrgAdmin\)/.test(source) && /SUPPORT_HANDOFF_ADMIN_REQUIRED/.test(source)
const organisationScoped = (source.match(/\.eq\('organisation_id', context\.organisationId\)/g) || []).length >= 2
const readOnly = !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(source)
const page = fs.readFileSync('src/pages/PlatformDiagnosticsPage.jsx', 'utf8')
const uiCovered = page.includes('Legal generation support handoffs') && page.includes('listLegalDocumentGenerationSupportHandoffs') && page.includes('handoff.supportReference')
const assessment = assessLegalDocumentSupportTriageReadiness({ j4: j4 || {}, scenarios, apiAdminGuarded, organisationScoped, uiCovered, readOnly })
const solutions = {
  K1_J4_NOT_READY: 'Complete J4 durable handoff and its upstream gates before certifying the operator feed.',
  K1_TRIAGE_READ_MODEL_INCOMPLETE: 'Reject unsafe events and expose only whitelisted support-triage fields and summaries.',
  K1_ADMIN_BOUNDARY_MISSING: 'Require active organisation-administrator membership before querying support handoffs.',
  K1_ORGANISATION_SCOPE_MISSING: 'Scope event and packet queries to the active organisation.',
  K1_OPERATOR_FEED_MISSING: 'Expose the read-only legal-generation handoff feed in Operations Center.',
  K1_TRIAGE_FEED_MUTATING: 'Remove writes from K1; triage certification must remain read-only.',
}
console.log(JSON.stringify({ phase: 'K1', status: assessment.ready ? 'READY_FOR_K2' : 'NO_GO', blockerCount: assessment.reasons.length, blockers: assessment.reasons.map((code) => ({ code, solution: solutions[code] })), evidence: { j4Status: j4?.status || 'UNAVAILABLE', scenarios, summary: snapshot.summary, apiAdminGuarded, organisationScoped, uiCovered, readOnly }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
