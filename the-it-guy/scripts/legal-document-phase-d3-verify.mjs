import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessDraftVersionLineage } from '../src/core/documents/draftVersionLineage.js'

const d2Run = spawnSync(process.execPath, ['scripts/legal-document-phase-d2-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let d2 = null
try { d2 = JSON.parse(d2Run.stdout) } catch {}
const blockers = []
const evidence = []
if (d2?.status !== 'READY_FOR_D3') blockers.push({ code: 'D3_D2_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for D3.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const draft of d2.evidence || []) {
    const [packetResult, versionsResult, eventsResult] = await Promise.all([
      client.from('document_packets').select('id, packet_type, current_version_number, source_context_json, status, updated_at').eq('id', draft.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, version_number, render_status, validation_summary_json, generated_at, created_at').eq('packet_id', draft.packetId).order('version_number'),
      client.from('document_packet_events').select('id, packet_id, version_id, event_type, event_payload_json, created_at').eq('packet_id', draft.packetId).in('event_type', ['generation_started', 'version_generated', 'packet_regenerated', 'generation_failed']).order('created_at'),
    ])
    if (packetResult.error) throw packetResult.error
    if (versionsResult.error) throw versionsResult.error
    if (eventsResult.error) throw eventsResult.error
    const packet = packetResult.data
    const versions = versionsResult.data || []
    const version = versions.find((row) => row.id === draft.versionId)
    if (!packet || !version) {
      blockers.push({ code: 'D3_LINEAGE_RECORD_MISSING', packetType: draft.packetType })
      continue
    }
    const assessment = assessDraftVersionLineage({ packet, version, versions, events: eventsResult.data || [] })
    if (!assessment.ready) blockers.push({ code: 'D3_VERSION_LINEAGE_INVALID', packetType: draft.packetType, reasons: assessment.reasons })
    evidence.push({ packetType: draft.packetType, packetId: packet.id, versionId: version.id, versionNumber: assessment.versionNumber, generationAttemptId: assessment.generationAttemptId, eventCount: (eventsResult.data || []).length, status: assessment.ready ? 'passed' : 'failed', reasons: assessment.reasons })
  }
}

const solutionByCode = {
  D3_D2_NOT_READY: 'Complete D2 persisted-artifact verification before validating version lineage.',
  D3_LINEAGE_RECORD_MISSING: 'Regenerate the controlled draft because its packet or selected version is missing.',
  D3_VERSION_LINEAGE_INVALID: 'Regenerate through the D3-enabled workflow and investigate duplicate, missing, or orphaned version/event records.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'D3', status: unique.length ? 'NO_GO' : 'READY_FOR_E1', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), d2Status: d2?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
