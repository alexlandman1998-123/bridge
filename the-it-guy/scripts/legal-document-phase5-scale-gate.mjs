import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const WATCHDOG_CONTRACT = 'phase5-f2-f3-f4-v2'
const CANONICAL_FINAL_EVENT = 'final_signed_document_generated'

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
function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function isSha256(value) { return /^[a-f0-9]{64}$/i.test(text(value)) }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

function runJson(script, env) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env, encoding: 'utf8', timeout: 300_000, maxBuffer: 10 * 1024 * 1024 })
  try { return { exitCode: Number.isInteger(result.status) ? result.status : 1, report: JSON.parse(result.stdout), stderr: result.stderr || '' } } catch { return { exitCode: Number.isInteger(result.status) ? result.status : 1, report: null, stderr: result.stderr || result.stdout || `${script} returned no JSON.` } }
}

function isF2Exact(packet, version, evidence, events) {
  const event = events.find((candidate) => {
    const payload = record(candidate.event_payload_json)
    return text(candidate.packet_id) === text(packet.id) && text(candidate.version_id) === text(version.id) && text(candidate.organisation_id) === text(packet.organisation_id) &&
      lower(candidate.event_type) === CANONICAL_FINAL_EVENT && text(payload.generatedFilePath) === text(version.final_signed_file_path) &&
      text(payload.generatedFileBucket) === text(version.final_signed_file_bucket) && lower(payload.finalArtifactSha256) === lower(evidence.sha256) &&
      Number(payload.finalArtifactByteLength) === Number(evidence.byte_length) && payload.signatureEvidenceContract === 'phase3-visual-signature-evidence-v1' &&
      payload.signatureEvidenceMode === 'visual_and_audit' && Number(payload.embeddedSignatureCount) === Number(evidence.embedded_signature_count) &&
      lower(payload.signatureAssetEvidenceSha256) === lower(evidence.signature_asset_evidence_sha256) &&
      stableJson(payload.signatureAssetFingerprints) === stableJson(evidence.signature_asset_fingerprints_json)
  })
  return Boolean(
    event && text(version.id) && text(version.final_signed_file_path) && text(version.final_signed_file_bucket) && text(version.final_signed_file_name) && text(version.final_signed_document_id) &&
    lower(packet.status) === 'completed' && Number(packet.current_version_number) === Number(version.version_number) && text(packet.organisation_id) === text(version.organisation_id) &&
    text(packet.organisation_id) === text(evidence.organisation_id) && text(evidence.packet_id) === text(packet.id) && text(evidence.packet_version_id) === text(version.id) &&
    text(evidence.path) === text(version.final_signed_file_path) && text(evidence.bucket) === text(version.final_signed_file_bucket) && text(evidence.file_name) === text(version.final_signed_file_name) &&
    lower(evidence.media_type) === 'application/pdf' && sameInstant(evidence.generated_at, version.finalised_at) && isSha256(evidence.sha256) &&
    Number(evidence.byte_length) > 0 && evidence.signature_evidence_contract === 'phase3-visual-signature-evidence-v1' && evidence.signature_evidence_mode === 'visual_and_audit' &&
    Number(evidence.embedded_signature_count) > 0 && isSha256(evidence.signature_asset_evidence_sha256) && Array.isArray(evidence.signature_asset_fingerprints_json) &&
    evidence.signature_asset_fingerprints_json.length === Number(evidence.embedded_signature_count),
  )
}

function isPublishedDocumentExact(packet, version, evidence, document) {
  return Boolean(
    text(document.id) === text(version.final_signed_document_id) && text(document.transaction_id) === text(packet.transaction_id) &&
    text(document.file_path) === text(evidence.path) && text(document.file_bucket) === text(evidence.bucket) && text(document.final_legal_packet_id) === text(packet.id) &&
    text(document.final_legal_packet_version_id) === text(version.id) && text(document.final_artifact_bucket) === text(evidence.bucket) &&
    lower(document.final_artifact_media_type) === lower(evidence.media_type) && Number(document.final_artifact_byte_length) === Number(evidence.byte_length) &&
    lower(document.final_artifact_sha256) === lower(evidence.sha256) && lower(document.status) === 'signed' && lower(document.visibility_scope) === 'shared' &&
    document.is_client_visible === true && lower(document.stage_key) === 'final_signed',
  )
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url && env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase configuration is required.')
const config = JSON.parse(fs.readFileSync('config/legal-document-scale.json', 'utf8'))
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const requiredWatchdogContract = text(config.requiredWatchdogContract) || WATCHDOG_CONTRACT
const phase4 = runJson('scripts/legal-document-phase4-release-gate.mjs', env)
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const now = Date.now()
const projectRef = new URL(url).hostname.split('.')[0]
const configuredCohort = [...new Set((pilot.organisationIds || []).map(text).filter(Boolean))]
const activatedCohort = [...new Set((pilot.activation?.activatedOrganisationIds || []).map(text).filter(Boolean))]
const cohort = activatedCohort.length ? activatedCohort : configuredCohort
const cohortDigest = cohort.length ? sha256([...cohort].sort().join(',')) : null
const activationAt = dateValue(pilot.activation?.activatedAt)
const observationStartMs = Math.max(now - Number(config.minimumObservationHours || 0) * 60 * 60 * 1000, activationAt || 0)
const observationStart = new Date(observationStartMs).toISOString()
const maximumGapMinutes = Number(config.maximumWatchdogGapMinutes || 90)
const blockers = []

if (phase4.exitCode !== 0 || phase4.report?.status !== 'GO') blockers.push({ code: 'PHASE4_RELEASE_GATE_NOT_GO', detail: phase4.report?.status || phase4.stderr || 'Phase 4 gate did not return GO.' })
if (!config.enabled) blockers.push({ code: 'SCALE_UP_DISABLED', detail: 'Scale-up remains deliberately disabled.' })
if (!pilot.enabled || pilot.activation?.status !== 'active') blockers.push({ code: 'PILOT_NOT_ACTIVE', detail: 'The approved pilot is not active.' })
if (!activationAt || activationAt > now) blockers.push({ code: 'PILOT_ACTIVATION_TIME_INVALID', detail: 'The pilot needs a valid past activation timestamp.' })
if (text(pilot.activation?.targetProjectRef) !== projectRef) blockers.push({ code: 'PILOT_TARGET_PROJECT_MISMATCH', detail: `Expected ${text(pilot.activation?.targetProjectRef) || 'an explicit target'}, received ${projectRef}.` })
if (!cohort.length) blockers.push({ code: 'PILOT_COHORT_EMPTY', detail: 'No activated pilot organisations are configured.' })
if (cohort.length > Number(config.maximumOrganisationCohort || 0)) blockers.push({ code: 'PILOT_COHORT_TOO_LARGE', detail: `${cohort.length}/${config.maximumOrganisationCohort} organisations.` })
if (activatedCohort.length && stableJson([...activatedCohort].sort()) !== stableJson([...configuredCohort].sort())) blockers.push({ code: 'PILOT_COHORT_ACTIVATION_DRIFT', detail: 'The activated cohort does not match the approved cohort.' })

const [snapshotsResult, packetsResult] = await Promise.all([
  client.from('system_health_snapshots').select('id, status, summary, created_at').gte('created_at', observationStart).contains('summary', { kind: 'legal_document_watchdog_v1' }).order('created_at'),
  cohort.length
    ? client.from('document_packets').select('id, organisation_id, transaction_id, packet_type, status, current_version_number, completed_at').in('organisation_id', cohort).in('packet_type', ['otp', 'mandate']).eq('status', 'completed').gte('completed_at', observationStart)
    : Promise.resolve({ data: [], error: null }),
])
assert.ifError(snapshotsResult.error)
assert.ifError(packetsResult.error)
const snapshots = snapshotsResult.data || []
const packets = packetsResult.data || []
const contractSnapshots = snapshots.filter((snapshot) => record(snapshot.summary).contract === requiredWatchdogContract)
const nonConformantSnapshots = snapshots.filter((snapshot) => record(snapshot.summary).contract !== requiredWatchdogContract)
const nonHealthySnapshots = snapshots.filter((snapshot) => snapshot.status !== 'healthy')
const scopeMismatches = contractSnapshots.filter((snapshot) => {
  const scope = record(record(snapshot.summary).scope)
  return scope.mode !== 'all_legal_documents' && !(scope.mode === 'configured_organisations' && Number(scope.organisationCount) === cohort.length && text(scope.organisationDigest) === cohortDigest)
})
const healthy = contractSnapshots.filter((snapshot) => snapshot.status === 'healthy')
const healthySpanHours = healthy.length > 1 ? (dateValue(healthy.at(-1)?.created_at) - dateValue(healthy[0]?.created_at)) / 3_600_000 : 0
const gaps = []
let previousSnapshotAt = observationStartMs
for (const snapshot of contractSnapshots) {
  const snapshotAt = dateValue(snapshot.created_at)
  if (!snapshotAt || snapshotAt - previousSnapshotAt > maximumGapMinutes * 60_000) gaps.push({ after: previousSnapshotAt || null, before: snapshotAt || null })
  previousSnapshotAt = snapshotAt || previousSnapshotAt
}
if (!contractSnapshots.length || now - previousSnapshotAt > maximumGapMinutes * 60_000) gaps.push({ after: previousSnapshotAt || null, before: now })
if (nonConformantSnapshots.length) blockers.push({ code: 'WATCHDOG_CONTRACT_HISTORY_INVALID', detail: `${nonConformantSnapshots.length} snapshot(s) lack ${requiredWatchdogContract}.` })
if (nonHealthySnapshots.length) blockers.push({ code: 'WATCHDOG_NON_HEALTHY_SNAPSHOT', detail: `${nonHealthySnapshots.length} warning or critical snapshot(s).` })
if (scopeMismatches.length) blockers.push({ code: 'WATCHDOG_SCOPE_MISMATCH', detail: `${scopeMismatches.length} snapshot(s) did not cover the active cohort.` })
if (healthy.length < Number(config.minimumHealthySnapshots || 0)) blockers.push({ code: 'HEALTHY_SNAPSHOT_HISTORY_INSUFFICIENT', detail: `${healthy.length}/${config.minimumHealthySnapshots} healthy snapshots.` })
if (healthySpanHours < Number(config.minimumObservationHours || 0)) blockers.push({ code: 'OBSERVATION_WINDOW_INSUFFICIENT', detail: `${healthySpanHours.toFixed(1)}/${config.minimumObservationHours} hours.` })
if (gaps.length) blockers.push({ code: 'WATCHDOG_CADENCE_GAP', detail: `${gaps.length} watchdog gap(s) above ${maximumGapMinutes} minutes.` })

const packetIds = packets.map((packet) => packet.id)
const versionsResult = packetIds.length ? await client.from('document_packet_versions').select('id, packet_id, organisation_id, version_number, final_signed_file_path, final_signed_file_bucket, final_signed_file_name, final_signed_document_id, finalised_at').in('packet_id', packetIds) : { data: [], error: null }
assert.ifError(versionsResult.error)
const currentVersions = packets.map((packet) => (versionsResult.data || []).find((version) => version.packet_id === packet.id && Number(version.version_number) === Number(packet.current_version_number))).filter(Boolean)
const versionIds = currentVersions.map((version) => version.id)
const documentIds = currentVersions.map((version) => text(version.final_signed_document_id)).filter(Boolean)
const [evidenceResult, eventsResult, documentsResult, signersResult, deliveriesResult, publicationsResult, transactionPublicationsResult, receiptsResult] = versionIds.length ? await Promise.all([
  client.from('legal_final_artifact_evidence').select('organisation_id, packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json').in('packet_version_id', versionIds),
  client.from('document_packet_events').select('id, packet_id, version_id, organisation_id, event_type, event_payload_json, created_at').in('version_id', versionIds).eq('event_type', CANONICAL_FINAL_EVENT),
  documentIds.length ? client.from('documents').select('id, transaction_id, file_path, file_bucket, status, visibility_scope, is_client_visible, stage_key, final_legal_packet_id, final_legal_packet_version_id, final_artifact_bucket, final_artifact_media_type, final_artifact_byte_length, final_artifact_sha256').in('id', documentIds) : Promise.resolve({ data: [], error: null }),
  client.from('document_packet_signers').select('id, packet_version_id, status').in('packet_version_id', versionIds),
  client.from('legal_final_artifact_deliveries').select('packet_version_id, signer_id, status, artifact_sha256, artifact_path').in('packet_version_id', versionIds),
  client.from('legal_final_artifact_publications').select('packet_version_id, artifact_sha256, artifact_path, portal_surface, verified_at').in('packet_version_id', versionIds),
  client.from('legal_final_transaction_publications').select('organisation_id, packet_id, packet_version_id, transaction_id, document_id, artifact_sha256, artifact_bucket, artifact_path').in('packet_version_id', versionIds),
  client.from('legal_final_completion_receipts').select('packet_id, packet_version_id, transaction_id, document_id, artifact_sha256, transaction_visible, client_visible, canonical_satisfied').in('packet_version_id', versionIds),
]) : Array.from({ length: 8 }, () => ({ data: [], error: null }))
for (const result of [evidenceResult, eventsResult, documentsResult, signersResult, deliveriesResult, publicationsResult, transactionPublicationsResult, receiptsResult]) assert.ifError(result.error)

const versionByPacket = new Map(currentVersions.map((version) => [version.packet_id, version]))
const evidenceByVersion = new Map((evidenceResult.data || []).map((evidence) => [evidence.packet_version_id, evidence]))
const eventsByVersion = new Map(versionIds.map((versionId) => [versionId, (eventsResult.data || []).filter((event) => event.version_id === versionId)]))
const documentById = new Map((documentsResult.data || []).map((document) => [document.id, document]))
const publicationByVersion = new Map((publicationsResult.data || []).map((publication) => [publication.packet_version_id, publication]))
const transactionPublicationByVersion = new Map((transactionPublicationsResult.data || []).map((publication) => [publication.packet_version_id, publication]))
const receiptByVersion = new Map((receiptsResult.data || []).map((receipt) => [receipt.packet_version_id, receipt]))
const artifactStates = packets.map((packet) => {
  const version = versionByPacket.get(packet.id) || {}
  const evidence = evidenceByVersion.get(version.id) || {}
  const f2Exact = Boolean(version.id && isF2Exact(packet, version, evidence, eventsByVersion.get(version.id) || []))
  const document = documentById.get(version.final_signed_document_id) || {}
  const documentExact = f2Exact && isPublishedDocumentExact(packet, version, evidence, document)
  const signers = (signersResult.data || []).filter((signer) => signer.packet_version_id === version.id)
  const deliveriesExact = f2Exact && signers.length > 0 && signers.every((signer) => lower(signer.status) === 'signed' && (deliveriesResult.data || []).some((delivery) => delivery.packet_version_id === version.id && delivery.signer_id === signer.id && lower(delivery.status) === 'sent' && lower(delivery.artifact_sha256) === lower(evidence.sha256) && text(delivery.artifact_path) === text(evidence.path)))
  const publication = publicationByVersion.get(version.id) || {}
  const expectedSurface = lower(packet.packet_type) === 'mandate' ? 'seller_portal' : 'client_portal'
  const portalExact = f2Exact && lower(publication.artifact_sha256) === lower(evidence.sha256) && text(publication.artifact_path) === text(evidence.path) && lower(publication.portal_surface) === expectedSurface && Boolean(dateValue(publication.verified_at))
  const transactionPublication = transactionPublicationByVersion.get(version.id) || {}
  const transactionExact = documentExact && text(transactionPublication.organisation_id) === text(packet.organisation_id) && text(transactionPublication.packet_id) === text(packet.id) && text(transactionPublication.transaction_id) === text(packet.transaction_id) && text(transactionPublication.document_id) === text(version.final_signed_document_id) && lower(transactionPublication.artifact_sha256) === lower(evidence.sha256) && text(transactionPublication.artifact_bucket) === text(evidence.bucket) && text(transactionPublication.artifact_path) === text(evidence.path)
  const receipt = receiptByVersion.get(version.id) || {}
  const receiptExact = transactionExact && text(receipt.packet_id) === text(packet.id) && text(receipt.transaction_id) === text(transactionPublication.transaction_id) && text(receipt.document_id) === text(transactionPublication.document_id) && lower(receipt.artifact_sha256) === lower(transactionPublication.artifact_sha256) && receipt.transaction_visible === true && receipt.client_visible === true && receipt.canonical_satisfied === true
  return { packet, version, evidence, f2Exact, documentExact, deliveriesExact, portalExact, transactionExact, receiptExact, storageVerified: false }
})
await Promise.all(artifactStates.filter((state) => state.f2Exact).map(async (state) => {
  try {
    const download = await client.storage.from(text(state.evidence.bucket)).download(text(state.evidence.path))
    if (!download.error && download.data) {
      const bytes = Buffer.from(await download.data.arrayBuffer())
      state.storageVerified = bytes.length === Number(state.evidence.byte_length) && sha256(bytes) === lower(state.evidence.sha256)
    }
  } catch { state.storageVerified = false }
}))
const canonicalArtifacts = artifactStates.filter((state) => state.f2Exact && state.documentExact && state.storageVerified)
const operationallyComplete = artifactStates.filter((state) => state.f2Exact && state.documentExact && state.storageVerified && state.deliveriesExact && state.portalExact && state.transactionExact && state.receiptExact)
const integrity = packets.length ? Math.round(canonicalArtifacts.length / packets.length * 10000) / 100 : 0
if (packets.length < Number(config.minimumCompletedPackets || 0)) blockers.push({ code: 'PILOT_VOLUME_INSUFFICIENT', detail: `${packets.length}/${config.minimumCompletedPackets} completed packets.` })
if (integrity < Number(config.requiredFinalArtifactIntegrityPercent || 100)) blockers.push({ code: 'FINAL_ARTIFACT_INTEGRITY_BELOW_SLO', detail: `${integrity}/${config.requiredFinalArtifactIntegrityPercent}%.` })
if (operationallyComplete.length !== packets.length) blockers.push({ code: 'PILOT_FINAL_SURFACE_INTEGRITY_INVALID', detail: `${operationallyComplete.length}/${packets.length} completed packets have exact F2–F4 evidence.` })

const unique = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || ''}`, item])).values()]
console.log(JSON.stringify({
  phase: 5,
  status: unique.length ? 'NO_GO' : 'GO',
  blockerCount: unique.length,
  blockers: unique,
  evidence: {
    phase4Status: phase4.report?.status || 'UNAVAILABLE',
    phase4ExitCode: phase4.exitCode,
    targetProjectRef: projectRef,
    pilotCohortSize: cohort.length,
    pilotCohortDigest: cohortDigest,
    observationStart,
    healthySnapshots: healthy.length,
    watchdogSnapshots: contractSnapshots.length,
    observationHours: Math.round(healthySpanHours * 10) / 10,
    watchdogGaps: gaps.length,
    completedPackets: packets.length,
    canonicalFinalArtifacts: canonicalArtifacts.length,
    operationallyCompletePackets: operationallyComplete.length,
    finalArtifactIntegrityPercent: integrity,
  },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}, null, 2))
if (unique.length) process.exitCode = 1
