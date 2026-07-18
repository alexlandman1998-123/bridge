import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessDraftReviewApproval } from '../src/core/documents/draftReviewApproval.js'

const d3Run = spawnSync(process.execPath, ['scripts/legal-document-phase-d3-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let d3 = null
try { d3 = JSON.parse(d3Run.stdout) } catch {}
const blockers = []
const evidence = []
if (d3?.status !== 'READY_FOR_E1') blockers.push({ code: 'E1_D3_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for E1.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const draft of d3.evidence || []) {
    const [packetResult, versionResult, eventsResult] = await Promise.all([
      client.from('document_packets').select('id, packet_type, current_version_number, status, source_context_json').eq('id', draft.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, version_number, render_status, rendered_file_path, validation_summary_json, generated_at').eq('id', draft.versionId).maybeSingle(),
      client.from('document_packet_events').select('id, version_id, event_type, event_payload_json, created_at').eq('packet_id', draft.packetId).eq('event_type', 'draft_approved').order('created_at', { ascending: false }),
    ])
    if (packetResult.error) throw packetResult.error
    if (versionResult.error) throw versionResult.error
    if (eventsResult.error) throw eventsResult.error
    if (!packetResult.data || !versionResult.data) {
      blockers.push({ code: 'E1_REVIEW_TARGET_MISSING', packetType: draft.packetType })
      continue
    }
    const assessment = assessDraftReviewApproval({ packet: packetResult.data, version: versionResult.data })
    const snapshot = assessment.snapshot || {}
    const matchingEvent = (eventsResult.data || []).some((event) => event.version_id === versionResult.data.id
      && event.event_payload_json?.approvalReference === snapshot.approvalReference
      && event.event_payload_json?.approvedByUserId === snapshot.approvedByUserId
      && event.event_payload_json?.artifactSha256 === snapshot.artifactSha256)
    const reasons = [...assessment.reasons]
    if (!matchingEvent) reasons.push('E1_APPROVAL_EVENT_MISSING')
    if (reasons.length) blockers.push({ code: 'E1_DRAFT_APPROVAL_INVALID', packetType: draft.packetType, reasons })
    evidence.push({ packetType: draft.packetType, packetId: draft.packetId, versionId: draft.versionId, status: reasons.length ? 'failed' : 'passed', approvalReference: snapshot.approvalReference || null, approvedByUserId: snapshot.approvedByUserId || null, approvedAt: snapshot.approvedAt || null, artifactSha256: snapshot.artifactSha256 || null, reasons })
  }
}

const solutionByCode = {
  E1_D3_NOT_READY: 'Complete D3 draft lineage before accountable draft review.',
  E1_REVIEW_TARGET_MISSING: 'Regenerate the controlled draft because its review target is missing.',
  E1_DRAFT_APPROVAL_INVALID: 'Have an authorised reviewer approve the exact current generated version through the E1-enabled workspace.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'E1', status: unique.length ? 'NO_GO' : 'READY_FOR_E2', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), d3Status: d3?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
