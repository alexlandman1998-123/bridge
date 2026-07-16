import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function envFile(file) { if (!fs.existsSync(file)) return {}; return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')] })) }
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const apply = process.argv.includes('--apply')
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Reconciliation is currently restricted to canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Service role key is required.')
assert.ok(!apply || (process.argv.includes('--confirm-staging') && process.env.LEGAL_DOCUMENT_RECONCILIATION_WRITE === 'true'), 'Apply requires --confirm-staging and LEGAL_DOCUMENT_RECONCILIATION_WRITE=true.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const packets = await client.from('document_packets').select('id, organisation_id, packet_type, status, source_context_json, completed_at, updated_at').in('packet_type', ['otp', 'mandate']).eq('status', 'completed').gte('updated_at', since).order('updated_at', { ascending: false })
assert.ifError(packets.error)
const ids = (packets.data || []).map((row) => row.id)
const versions = ids.length ? await client.from('document_packet_versions').select('packet_id, final_signed_file_path, finalised_at').in('packet_id', ids) : { data: [], error: null }
assert.ifError(versions.error)
const finalIds = new Set((versions.data || []).filter((row) => row.final_signed_file_path).map((row) => row.packet_id))
const healthyFixtures = new Set((packets.data || []).filter((row) => finalIds.has(row.id)).map((row) => row.source_context_json?.fixture).filter(Boolean))
const missing = (packets.data || []).filter((row) => !finalIds.has(row.id))
const safeToArchive = missing.filter((row) => row.source_context_json?.fixture && healthyFixtures.has(row.source_context_json.fixture))
const manualReview = missing.filter((row) => !safeToArchive.some((candidate) => candidate.id === row.id))
const archivedAt = new Date().toISOString()
if (apply) {
  for (const packet of safeToArchive) {
    const update = await client.from('document_packets').update({ status: 'archived', archived_at: archivedAt }).eq('id', packet.id).eq('status', 'completed')
    assert.ifError(update.error)
    const event = await client.from('document_packet_events').insert({ packet_id: packet.id, organisation_id: packet.organisation_id, event_type: 'packet_archive_metadata', event_payload_json: { reason: 'Phase 5 reconciliation archived a superseded controlled fixture without a final artifact.', archivedAt, source: 'legal_document_phase5_reconciliation' } })
    assert.ifError(event.error)
  }
}
console.log(JSON.stringify({ phase: 5, mode: apply ? 'applied' : 'dry-run', windowHours: 24, completedPackets: ids.length, finalArtifactHealthy: finalIds.size, missingFinalArtifacts: missing.map((row) => row.id), safeToArchiveIds: safeToArchive.map((row) => row.id), manualReviewIds: manualReview.map((row) => row.id), mutatedData: apply, status: manualReview.length ? 'REVIEW_REQUIRED' : 'CLEAN' }, null, 2))
if (manualReview.length) process.exitCode = 1
