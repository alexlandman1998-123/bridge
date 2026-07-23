import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function lower(value) { return text(value).toLowerCase() }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function dateValue(value) { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : 0 }
function sameInstant(left, right) { return Boolean(dateValue(left) && dateValue(right) && dateValue(left) === dateValue(right)) }
function isSha256(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const apply = process.argv.includes('--apply')
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Reconciliation is currently restricted to canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'Service role key is required.')
assert.ok(!apply, 'Automatic archival is disabled. Reconciliation is read-only until fixture archival is implemented as one service-owned transaction.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const packetsResult = await client.from('document_packets').select('id, organisation_id, transaction_id, packet_type, status, current_version_number, source_context_json, completed_at').in('packet_type', ['otp', 'mandate']).eq('status', 'completed').gte('completed_at', since).order('completed_at', { ascending: false })
assert.ifError(packetsResult.error)
const packets = packetsResult.data || []
const ids = packets.map((row) => row.id)
const versionsResult = ids.length ? await client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at').in('packet_id', ids) : { data: [], error: null }
assert.ifError(versionsResult.error)
const currentVersions = packets.map((packet) => (versionsResult.data || []).find((version) => version.packet_id === packet.id && Number(version.version_number) === Number(packet.current_version_number))).filter(Boolean)
const versionIds = currentVersions.map((row) => row.id)
const documentIds = currentVersions.map((row) => text(row.final_signed_document_id)).filter(Boolean)
const [evidenceResult, eventsResult, documentsResult] = versionIds.length ? await Promise.all([
  client.from('legal_final_artifact_evidence').select('organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json').in('packet_version_id', versionIds),
  client.from('document_packet_events').select('id, packet_id, version_id, organisation_id, event_type, event_payload_json').in('version_id', versionIds).eq('event_type', 'final_signed_document_generated'),
  documentIds.length ? client.from('documents').select('id, transaction_id, file_path, file_bucket, status, visibility_scope, is_client_visible, stage_key, final_legal_packet_id, final_legal_packet_version_id, final_artifact_bucket, final_artifact_media_type, final_artifact_byte_length, final_artifact_sha256').in('id', documentIds) : Promise.resolve({ data: [], error: null }),
]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
for (const result of [evidenceResult, eventsResult, documentsResult]) assert.ifError(result.error)
const versionByPacket = new Map(currentVersions.map((row) => [row.packet_id, row]))
const evidenceByVersion = new Map((evidenceResult.data || []).map((row) => [row.packet_version_id, row]))
const documentById = new Map((documentsResult.data || []).map((row) => [row.id, row]))
const eventsByVersion = new Map(versionIds.map((versionId) => [versionId, (eventsResult.data || []).filter((row) => row.version_id === versionId)]))

function hasCanonicalFinal(packet) {
  const version = versionByPacket.get(packet.id)
  const evidence = evidenceByVersion.get(version?.id)
  const document = documentById.get(version?.final_signed_document_id)
  const event = (eventsByVersion.get(version?.id) || []).find((candidate) => {
    const payload = record(candidate.event_payload_json)
    return text(candidate.packet_id) === text(packet.id) && text(candidate.version_id) === text(version?.id) && text(candidate.organisation_id) === text(packet.organisation_id) &&
      text(payload.generatedFilePath) === text(version?.final_signed_file_path) && text(payload.generatedFileBucket) === text(version?.final_signed_file_bucket) &&
      lower(payload.finalArtifactSha256) === lower(evidence?.sha256) && Number(payload.finalArtifactByteLength) === Number(evidence?.byte_length)
  })
  return Boolean(
    version && evidence && document && event && text(version.final_signed_file_path) && text(version.final_signed_file_bucket) && text(version.final_signed_file_name) && text(version.final_signed_document_id) &&
    text(evidence.packet_id) === text(packet.id) && text(evidence.packet_version_id) === text(version.id) && text(evidence.organisation_id) === text(packet.organisation_id) &&
    text(evidence.path) === text(version.final_signed_file_path) && text(evidence.bucket) === text(version.final_signed_file_bucket) && text(evidence.file_name) === text(version.final_signed_file_name) &&
    lower(evidence.media_type) === 'application/pdf' && sameInstant(evidence.generated_at, version.finalised_at) && isSha256(evidence.sha256) && Number(evidence.byte_length) > 0 &&
    evidence.signature_evidence_contract === 'phase3-visual-signature-evidence-v1' && evidence.signature_evidence_mode === 'visual_and_audit' && Number(evidence.embedded_signature_count) > 0 && isSha256(evidence.signature_asset_evidence_sha256) &&
    Array.isArray(evidence.signature_asset_fingerprints_json) && evidence.signature_asset_fingerprints_json.length === Number(evidence.embedded_signature_count) &&
    text(document.id) === text(version.final_signed_document_id) && text(document.transaction_id) === text(packet.transaction_id) && text(document.file_path) === text(evidence.path) && text(document.file_bucket) === text(evidence.bucket) &&
    text(document.final_legal_packet_id) === text(packet.id) && text(document.final_legal_packet_version_id) === text(version.id) && text(document.final_artifact_bucket) === text(evidence.bucket) &&
    lower(document.final_artifact_media_type) === lower(evidence.media_type) && Number(document.final_artifact_byte_length) === Number(evidence.byte_length) && lower(document.final_artifact_sha256) === lower(evidence.sha256) &&
    lower(document.status) === 'signed' && lower(document.visibility_scope) === 'shared' && document.is_client_visible === true && lower(document.stage_key) === 'final_signed',
  )
}

const canonicalFinalPacketIds = new Set(packets.filter(hasCanonicalFinal).map((packet) => packet.id))
const missing = packets.filter((packet) => !canonicalFinalPacketIds.has(packet.id))
console.log(JSON.stringify({
  phase: 5,
  mode: 'dry-run',
  windowHours: 24,
  completedPackets: packets.length,
  canonicalFinalArtifacts: canonicalFinalPacketIds.size,
  missingFinalArtifacts: missing.map((packet) => packet.id),
  safeToArchiveIds: [],
  manualReviewIds: missing.map((packet) => packet.id),
  automaticArchiveDisabled: true,
  mutatedData: false,
  status: missing.length ? 'REVIEW_REQUIRED' : 'CLEAN',
}, null, 2))
if (missing.length) process.exitCode = 1
