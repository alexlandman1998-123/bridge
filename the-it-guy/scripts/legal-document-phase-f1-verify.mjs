import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessSignerSession } from '../src/core/documents/signerSessionAssurance.js'

const e4Run = spawnSync(process.execPath, ['scripts/legal-document-phase-e4-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let e4 = null
try { e4 = JSON.parse(e4Run.stdout) } catch {}
const blockers = []
const evidence = []
if (e4?.status !== 'READY_FOR_F1') blockers.push({ code: 'F1_E4_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for F1.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const draft of e4.evidence || []) {
    const [packetResult, versionResult, signersResult, fieldsResult, eventsResult] = await Promise.all([
      client.from('document_packets').select('id, organisation_id, packet_type, current_version_number, status, source_context_json').eq('id', draft.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, render_status, placeholders_resolved_json, validation_summary_json, generated_at').eq('id', draft.versionId).maybeSingle(),
      client.from('document_packet_signers').select('id, organisation_id, packet_id, packet_version_id, signer_role, signer_name, signer_email, signing_order, status, signing_token, token_expires_at, token_used_at, viewed_at, signed_at').eq('packet_id', draft.packetId).eq('packet_version_id', draft.versionId),
      client.from('document_signing_fields').select('id, organisation_id, packet_id, packet_version_id, signer_role, signer_name, signer_email, field_type, page_number, x_position, y_position, width, height, required, status').eq('packet_id', draft.packetId).eq('packet_version_id', draft.versionId),
      client.from('document_packet_events').select('version_id, event_type, event_payload_json, created_at').eq('packet_id', draft.packetId).eq('event_type', 'signer_link_viewed').order('created_at', { ascending: false }),
    ])
    for (const result of [packetResult, versionResult, signersResult, fieldsResult, eventsResult]) if (result.error) throw result.error
    if (!packetResult.data || !versionResult.data) { blockers.push({ code: 'F1_SESSION_TARGET_MISSING', packetType: draft.packetType }); continue }
    const viewEvent = (eventsResult.data || []).find((event) => event.version_id === draft.versionId) || null
    const signer = (signersResult.data || []).find((row) => row.id === viewEvent?.event_payload_json?.signerId) || null
    const assessment = assessSignerSession({ packet: packetResult.data, version: versionResult.data, signers: signersResult.data || [], fields: fieldsResult.data || [], signer: signer || {}, issuedAt: draft.issuedAt || '' })
    const reasons = [...assessment.reasons]
    if (!viewEvent) reasons.push('F1_SIGNER_VIEW_EVENT_MISSING')
    if (viewEvent && (!viewEvent.event_payload_json?.signerId || !viewEvent.event_payload_json?.viewedAt)) reasons.push('F1_SIGNER_VIEW_EVENT_INVALID')
    if (reasons.length) blockers.push({ code: 'F1_SIGNER_SESSION_INVALID', packetType: draft.packetType, reasons })
    evidence.push({ packetType: draft.packetType, packetId: draft.packetId, versionId: draft.versionId, signerId: signer?.id || null, signerRole: assessment.signerRole || null, scopedFieldCount: assessment.scopedFieldCount, viewedAt: viewEvent?.event_payload_json?.viewedAt || null, status: reasons.length ? 'failed' : 'passed', reasons })
  }
}

const solutions = { F1_E4_NOT_READY: 'Complete secure E4 dispatch before exercising signer sessions.', F1_SESSION_TARGET_MISSING: 'Regenerate and repeat the governed workflow because the F1 session target is missing.', F1_SIGNER_SESSION_INVALID: 'Open a fresh controlled signer link and verify the exact locked preview and role-scoped fields without completing production signatures.' }
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'F1', status: unique.length ? 'NO_GO' : 'READY_FOR_F2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutions[row.code] })), e4Status: e4?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
