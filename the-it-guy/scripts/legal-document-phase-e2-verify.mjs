import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessDraftLock } from '../src/core/documents/draftLockAssurance.js'

const e1Run = spawnSync(process.execPath, ['scripts/legal-document-phase-e1-verify.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
let e1 = null
try { e1 = JSON.parse(e1Run.stdout) } catch {}
const blockers = []
const evidence = []
if (e1?.status !== 'READY_FOR_E2') blockers.push({ code: 'E2_E1_NOT_READY' })

if (!blockers.length) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for E2.')
  const require = createRequire(path.resolve('package.json'))
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const draft of e1.evidence || []) {
    const [packetResult, versionResult, eventsResult] = await Promise.all([
      client.from('document_packets').select('id, packet_type, current_version_number, status, source_context_json').eq('id', draft.packetId).maybeSingle(),
      client.from('document_packet_versions').select('id, packet_id, version_number, render_status, rendered_file_path, validation_summary_json, generated_at').eq('id', draft.versionId).maybeSingle(),
      client.from('document_packet_events').select('id, version_id, event_type, event_payload_json, created_at').eq('packet_id', draft.packetId).eq('event_type', 'document_locked').order('created_at', { ascending: false }),
    ])
    if (packetResult.error) throw packetResult.error
    if (versionResult.error) throw versionResult.error
    if (eventsResult.error) throw eventsResult.error
    if (!packetResult.data || !versionResult.data) {
      blockers.push({ code: 'E2_LOCK_TARGET_MISSING', packetType: draft.packetType })
      continue
    }
    const assessment = assessDraftLock({ packet: packetResult.data, version: versionResult.data })
    const snapshot = assessment.snapshot || {}
    const matchingEvent = (eventsResult.data || []).some((event) => event.version_id === versionResult.data.id
      && event.event_payload_json?.lockReference === snapshot.lockReference
      && event.event_payload_json?.lockedByUserId === snapshot.lockedByUserId
      && event.event_payload_json?.artifactSha256 === snapshot.artifactSha256)
    const reasons = [...assessment.reasons]
    if (!matchingEvent) reasons.push('E2_LOCK_EVENT_MISSING')
    if (reasons.length) blockers.push({ code: 'E2_DRAFT_LOCK_INVALID', packetType: draft.packetType, reasons })
    evidence.push({ packetType: draft.packetType, packetId: draft.packetId, versionId: draft.versionId, status: reasons.length ? 'failed' : 'passed', lockReference: snapshot.lockReference || null, lockedByUserId: snapshot.lockedByUserId || null, lockedAt: snapshot.lockedAt || null, approvalReference: snapshot.approvalReference || null, artifactSha256: snapshot.artifactSha256 || null, reasons })
  }
}

const solutionByCode = {
  E2_E1_NOT_READY: 'Complete E1 accountable approval before locking any draft.',
  E2_LOCK_TARGET_MISSING: 'Regenerate and reapprove the controlled draft because its lock target is missing.',
  E2_DRAFT_LOCK_INVALID: 'Lock the exact current E1-approved version through the E2-enabled workspace; do not alter or supersede it afterward.',
}
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.packetType || ''}`, row])).values()]
console.log(JSON.stringify({ phase: 'E2', status: unique.length ? 'NO_GO' : 'READY_FOR_E3', blockerCount: unique.length, blockers: unique.map((row) => ({ ...row, solution: solutionByCode[row.code] })), e1Status: e1?.status || 'UNAVAILABLE', evidence, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (unique.length) process.exitCode = 1
