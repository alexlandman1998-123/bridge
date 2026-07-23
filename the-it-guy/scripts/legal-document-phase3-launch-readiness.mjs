import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const FIXTURE_KEY = 'otp_phase2_launch_acceptance_v1'
const MAX_SIGNATURE_ASSET_BYTES = 20 * 1024 * 1024

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function normalize(value) {
  return String(value || '').trim()
}

function lower(value) {
  return normalize(value).toLowerCase()
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/.test(lower(value).replace(/^sha256:/, ''))
}

function normalizedSha256(value) {
  return lower(value).replace(/^sha256:/, '')
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canonicalSignatureAssetFingerprints(value) {
  if (!Array.isArray(value)) return null
  const fingerprints = value.map((entry) => {
    const row = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
    const fieldId = normalize(row.fieldId)
    const signerRole = lower(row.signerRole)
    const fieldType = lower(row.fieldType)
    const sha256 = normalizedSha256(row.sha256)
    const byteLength = Number(row.byteLength)
    const imageFormat = lower(row.imageFormat)
    if (
      !fieldId ||
      !signerRole ||
      !['signature', 'initial'].includes(fieldType) ||
      !isSha256(sha256) ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 1 ||
      byteLength > MAX_SIGNATURE_ASSET_BYTES ||
      !['png', 'jpeg'].includes(imageFormat)
    ) return null
    return { fieldId, signerRole, fieldType, sha256, byteLength, imageFormat }
  })
  if (fingerprints.some((entry) => !entry)) return null
  const canonical = fingerprints.sort((left, right) => (
    left.fieldId.localeCompare(right.fieldId) ||
    left.signerRole.localeCompare(right.signerRole) ||
    left.fieldType.localeCompare(right.fieldType) ||
    left.sha256.localeCompare(right.sha256)
  ))
  if (new Set(canonical.map((entry) => entry.fieldId)).size !== canonical.length) return null
  return canonical
}

function metadata(template = {}) {
  return template.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
}

function isNativeStructuredTemplate(template = {}) {
  const meta = metadata(template)
  return ['structured', 'json'].includes(lower(template.template_format)) &&
    normalize(meta.render_mode || meta.renderMode) === 'native_structured'
}

function hasRenderableTemplateSource(template = {}) {
  return Boolean(normalize(template.template_storage_path)) || isNativeStructuredTemplate(template)
}

function legalApproval(template = {}) {
  const meta = metadata(template)
  const review = meta.legal_review && typeof meta.legal_review === 'object' ? meta.legal_review : {}
  return {
    status: normalize(meta.legal_review_status || meta.legalApprovalStatus || review.status).toLowerCase(),
    approvedAt: normalize(meta.legal_approved_at || meta.legalApprovedAt || review.approvedAt),
    reference: normalize(meta.legal_approval_reference || meta.legalApprovalReference || review.reference),
    contentDigest: normalize(meta.legal_approval_content_digest || meta.legalApprovalContentDigest || review.contentDigest),
    reviewEvidenceDigest: normalize(meta.legal_counsel_review_evidence_digest || meta.legalCounselReviewEvidenceDigest || review.reviewEvidenceDigest),
  }
}

function approved(template) {
  const approval = legalApproval(template)
  const frozen = reviewManifestByTemplateId.get(template.id)
  return approval.status === 'approved' && Boolean(approval.approvedAt) && Boolean(approval.reference) && Boolean(approval.reviewEvidenceDigest) && Boolean(frozen?.contentDigest) && approval.contentDigest === frozen.contentDigest
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const pilotConfig = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const reviewManifest = JSON.parse(fs.readFileSync('config/legal-document-review-manifest.json', 'utf8'))
const reviewManifestByTemplateId = new Map((reviewManifest.templates || []).map((row) => [row.templateId, row]))
const candidateOrganisationIds = [...new Set(pilotConfig.cohortPreparation?.candidateOrganisationIds || [])]
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url.includes(STAGING_PROJECT_REF), 'Refusing Phase 3 readiness verification outside canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only release gate.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const blockers = []
const warnings = []
const evidence = {}

const templateResult = await client
  .from('document_packet_templates')
  .select('id, organisation_id, packet_type, template_key, template_label, template_format, status, is_active, template_storage_bucket, template_storage_path, metadata_json, updated_at')
  .in('packet_type', ['otp', 'mandate'])
  .eq('status', 'published')
  .neq('is_active', false)
assert.ifError(templateResult.error)
const templates = templateResult.data || []
const routableTemplates = templates.filter((row) => row.organisation_id === null || candidateOrganisationIds.includes(row.organisation_id))
const otpTemplates = routableTemplates.filter((row) => normalize(row.packet_type).toLowerCase() === 'otp')
const mandateTemplates = routableTemplates.filter((row) => normalize(row.packet_type).toLowerCase() === 'mandate')
if (!otpTemplates.length || otpTemplates.some((row) => !hasRenderableTemplateSource(row))) blockers.push({ code: 'OTP_TEMPLATE_SOURCE_MISSING', detail: 'Every published OTP route available to the pilot cohort must have a renderable canonical source.' })
if (otpTemplates.some((row) => !isNativeStructuredTemplate(row))) blockers.push({ code: 'OTP_CANONICAL_TEMPLATE_REQUIRED', detail: 'Every routable OTP template must be a structured/json template approved for the native PDF renderer.' })
if (!otpTemplates.length || otpTemplates.some((row) => !approved(row))) blockers.push({ code: 'OTP_TEMPLATE_LEGAL_APPROVAL_PENDING', detail: 'Every published OTP route available to the pilot cohort needs approved status, approval date, and counsel/reference metadata.' })
if (!mandateTemplates.length) blockers.push({ code: 'SALES_MANDATE_TEMPLATE_MISSING', detail: 'No published active SalesMandate template exists.' })
if (!mandateTemplates.length || mandateTemplates.some((row) => !approved(row))) blockers.push({ code: 'SALES_MANDATE_TEMPLATE_LEGAL_APPROVAL_PENDING', detail: 'Every published SalesMandate route available to the pilot cohort needs approved status, approval date, and counsel/reference metadata.' })
evidence.templates = {
  cohortOrganisationIds: candidateOrganisationIds,
  otp: otpTemplates.map((row) => ({ id: row.id, organisationId: row.organisation_id, key: row.template_key, sourcePresent: hasRenderableTemplateSource(row), nativeStructured: isNativeStructuredTemplate(row), legalApproval: legalApproval(row) })),
  mandate: mandateTemplates.map((row) => ({ id: row.id, organisationId: row.organisation_id, key: row.template_key, sourcePresent: hasRenderableTemplateSource(row), legalApproval: legalApproval(row) })),
}

const packetResult = await client
  .from('document_packets')
  .select('id, status, current_version_number, source_context_json, updated_at')
  .eq('packet_type', 'otp')
  .contains('source_context_json', { fixture: FIXTURE_KEY })
  .order('updated_at', { ascending: false })
assert.ifError(packetResult.error)
const packets = packetResult.data || []
const partials = packets.filter((row) => ['sent', 'partially_signed'].includes(normalize(row.status).toLowerCase()))
if (partials.length) blockers.push({ code: 'CONTROLLED_PARTIAL_PACKET_REMAINS', detail: `${partials.length} controlled acceptance packet(s) remain in a live signing state.` })
const completedPacket = packets.find((row) => normalize(row.status).toLowerCase() === 'completed')
if (!completedPacket) blockers.push({ code: 'OTP_COMPLETED_ACCEPTANCE_MISSING', detail: 'No completed controlled OTP acceptance packet exists.' })

let finalVersion = null
let finalEvent = null
let finalArtifactEvidence = null
let signatureFields = []
const phase3ArtifactEvidenceColumns = 'packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at, signature_evidence_contract, signature_evidence_mode, embedded_signature_count, signature_asset_evidence_sha256, signature_asset_fingerprints_json'
const baseArtifactEvidenceColumns = 'packet_id, packet_version_id, bucket, path, file_name, media_type, sha256, byte_length, generated_at'
if (completedPacket) {
  const currentVersionNumber = Number(completedPacket.current_version_number)
  if (!Number.isInteger(currentVersionNumber) || currentVersionNumber < 1) {
    blockers.push({ code: 'OTP_CURRENT_VERSION_INVALID', detail: 'Completed controlled OTP has no valid current version number.' })
  } else {
    const versionResult = await client
      .from('document_packet_versions')
      .select('id, packet_id, organisation_id, version_number, render_status, rendered_file_bucket, rendered_file_path, rendered_media_type, rendered_sha256, rendered_byte_length, render_input_verified, native_pdf_verified, transaction_pdf_persisted, final_signed_file_bucket, final_signed_file_path, final_signed_file_name, finalised_at')
      .eq('packet_id', completedPacket.id)
      .eq('version_number', currentVersionNumber)
      .maybeSingle()
    assert.ifError(versionResult.error)
    finalVersion = versionResult.data
  }
  if (!finalVersion) {
    blockers.push({ code: 'OTP_CURRENT_FINAL_VERSION_MISSING', detail: 'The current version of the completed controlled OTP is missing.' })
  } else if (!finalVersion.final_signed_file_path || !finalVersion.final_signed_file_bucket) {
    blockers.push({ code: 'OTP_FINAL_ARTIFACT_MISSING', detail: 'The exact current OTP version has no final signed artifact.' })
  }
  if (finalVersion) {
    let [eventResult, artifactEvidenceResult, signatureFieldsResult] = await Promise.all([
      client
        .from('document_packet_events')
        .select('id, event_type, event_payload_json, created_at')
        .eq('packet_id', completedPacket.id)
        .eq('version_id', finalVersion.id)
        .eq('event_type', 'final_signed_document_generated')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('legal_final_artifact_evidence')
        .select(phase3ArtifactEvidenceColumns)
        .eq('packet_id', completedPacket.id)
        .eq('packet_version_id', finalVersion.id)
        .maybeSingle(),
      client
        .from('document_signing_fields')
        .select('id, signer_role, field_type, required, status, signature_asset_path')
        .eq('packet_id', completedPacket.id)
        .eq('packet_version_id', finalVersion.id)
        .eq('required', true)
        .in('field_type', ['signature', 'initial']),
    ])
    assert.ifError(eventResult.error)
    assert.ifError(signatureFieldsResult.error)
    if (artifactEvidenceResult.error?.code === '42703') {
      blockers.push({ code: 'PHASE3_SCHEMA_NOT_DEPLOYED', detail: 'Staging is missing the immutable Phase 3 visual-signature evidence columns. Deploy the Phase 3 database migration after the canonical finaliser.' })
      artifactEvidenceResult = await client
        .from('legal_final_artifact_evidence')
        .select(baseArtifactEvidenceColumns)
        .eq('packet_id', completedPacket.id)
        .eq('packet_version_id', finalVersion.id)
        .maybeSingle()
    }
    assert.ifError(artifactEvidenceResult.error)
    finalEvent = eventResult.data
    finalArtifactEvidence = artifactEvidenceResult.data
    signatureFields = signatureFieldsResult.data || []

    const payload = finalEvent?.event_payload_json || {}
    const canonicalSourceReady =
      lower(finalVersion.render_status) === 'generated' &&
      finalVersion.render_input_verified === true &&
      finalVersion.native_pdf_verified === true &&
      finalVersion.transaction_pdf_persisted === true &&
      lower(finalVersion.rendered_media_type) === 'application/pdf' &&
      isSha256(finalVersion.rendered_sha256) &&
      Number(finalVersion.rendered_byte_length) > 0
    if (!canonicalSourceReady) {
      blockers.push({ code: 'OTP_CANONICAL_SOURCE_CERTIFICATION_MISSING', detail: 'The exact current completed OTP version is not backed by a D1/D2/D3-certified native PDF.' })
    }

    const f2EvidenceValid =
      finalArtifactEvidence &&
      normalize(finalArtifactEvidence.packet_id) === normalize(completedPacket.id) &&
      normalize(finalArtifactEvidence.packet_version_id) === normalize(finalVersion.id) &&
      normalize(finalArtifactEvidence.bucket) === normalize(finalVersion.final_signed_file_bucket) &&
      normalize(finalArtifactEvidence.path) === normalize(finalVersion.final_signed_file_path) &&
      normalize(finalArtifactEvidence.file_name) === normalize(finalVersion.final_signed_file_name) &&
      lower(finalArtifactEvidence.media_type) === 'application/pdf' &&
      isSha256(finalArtifactEvidence.sha256) &&
      Number(finalArtifactEvidence.byte_length) > 0 &&
      Number.isFinite(Date.parse(finalArtifactEvidence.generated_at || '')) &&
      Date.parse(finalArtifactEvidence.generated_at) === Date.parse(finalVersion.finalised_at || '')
    if (!finalArtifactEvidence) {
      blockers.push({ code: 'OTP_FINAL_ARTIFACT_EVIDENCE_MISSING', detail: 'The exact current OTP final artifact has no immutable F2 evidence.' })
    } else if (!f2EvidenceValid) {
      blockers.push({ code: 'OTP_FINAL_ARTIFACT_EVIDENCE_INVALID', detail: 'The F2 evidence does not bind the exact current OTP final artifact.' })
    }

    const canonicalFingerprints = canonicalSignatureAssetFingerprints(payload.signatureAssetFingerprints)
    const fingerprints = canonicalFingerprints || []
    const fingerprintByFieldId = new Map(
      fingerprints.map((fingerprint) => [fingerprint.fieldId, fingerprint]),
    )
    const fingerprintsCoverFields =
      fingerprints.length === signatureFields.length &&
      signatureFields.length > 0 &&
      signatureFields.every((field) => {
        const fingerprint = fingerprintByFieldId.get(normalize(field.id))
        return fingerprint &&
          normalize(fingerprint.signerRole) === normalize(field.signer_role) &&
          lower(fingerprint.fieldType) === lower(field.field_type) &&
          isSha256(fingerprint.sha256) &&
          Number.isSafeInteger(Number(fingerprint.byteLength)) &&
          Number(fingerprint.byteLength) > 0 &&
          Number(fingerprint.byteLength) <= MAX_SIGNATURE_ASSET_BYTES &&
          ['png', 'jpeg'].includes(lower(fingerprint.imageFormat))
      })
    const signatureAssetEvidenceMatches =
      Boolean(canonicalFingerprints) &&
      isSha256(payload.signatureAssetEvidenceSha256) &&
      await sha256Hex(JSON.stringify(canonicalFingerprints)) === normalizedSha256(payload.signatureAssetEvidenceSha256)
    const canonicalPersistedFingerprints = canonicalSignatureAssetFingerprints(finalArtifactEvidence?.signature_asset_fingerprints_json)
    const persistedEmbeddedSignatureCount = Number(finalArtifactEvidence?.embedded_signature_count)
    const persistedSignatureAssetEvidenceMatches =
      Boolean(canonicalPersistedFingerprints) &&
      isSha256(finalArtifactEvidence?.signature_asset_evidence_sha256) &&
      await sha256Hex(JSON.stringify(canonicalPersistedFingerprints)) === normalizedSha256(finalArtifactEvidence?.signature_asset_evidence_sha256)
    const durablePhase3EvidenceMatchesEvent =
      Boolean(finalArtifactEvidence) &&
      normalize(finalArtifactEvidence.signature_evidence_contract) === 'phase3-visual-signature-evidence-v1' &&
      normalize(finalArtifactEvidence.signature_evidence_mode) === 'visual_and_audit' &&
      Number.isSafeInteger(persistedEmbeddedSignatureCount) &&
      persistedEmbeddedSignatureCount === signatureFields.length &&
      persistedSignatureAssetEvidenceMatches &&
      Boolean(canonicalFingerprints) &&
      JSON.stringify(canonicalPersistedFingerprints) === JSON.stringify(canonicalFingerprints) &&
      normalize(finalArtifactEvidence.signature_evidence_contract) === normalize(payload.signatureEvidenceContract) &&
      normalize(finalArtifactEvidence.signature_evidence_mode) === normalize(payload.signatureEvidenceMode) &&
      persistedEmbeddedSignatureCount === Number(payload.embeddedSignatureCount) &&
      normalizedSha256(finalArtifactEvidence.signature_asset_evidence_sha256) === normalizedSha256(payload.signatureAssetEvidenceSha256)
    const eventArtifactPath = normalize(payload.finalArtifactPath || payload.generatedFilePath)
    const eventArtifactBucket = normalize(payload.finalArtifactBucket || payload.generatedFileBucket)
    const eventMatchesF2 =
      f2EvidenceValid &&
      normalizedSha256(payload.finalArtifactSha256) === normalizedSha256(finalArtifactEvidence.sha256) &&
      Number(payload.finalArtifactByteLength) === Number(finalArtifactEvidence.byte_length) &&
      eventArtifactPath === normalize(finalArtifactEvidence.path) &&
      eventArtifactBucket === normalize(finalArtifactEvidence.bucket)
    const visualEvidenceValid =
      Boolean(finalEvent) &&
      payload.signatureEvidenceContract === 'phase3-visual-signature-evidence-v1' &&
      payload.signatureEvidenceMode === 'visual_and_audit' &&
      Number(payload.embeddedSignatureCount) === signatureFields.length &&
      signatureAssetEvidenceMatches &&
      fingerprintsCoverFields &&
      durablePhase3EvidenceMatchesEvent &&
      eventMatchesF2
    if (!signatureFields.length) {
      blockers.push({ code: 'OTP_REQUIRED_SIGNATURE_FIELDS_MISSING', detail: 'The exact current completed OTP has no required signature or initial fields to verify visually.' })
    }
    if (finalArtifactEvidence && !durablePhase3EvidenceMatchesEvent) {
      blockers.push({ code: 'OTP_FINAL_ARTIFACT_PHASE3_EVIDENCE_MISMATCH', detail: 'The immutable F2 Phase 3 visual-signature evidence is incomplete or does not exactly match its finalisation event.' })
    }
    if (!visualEvidenceValid) {
      blockers.push({ code: 'OTP_VISUAL_SIGNATURE_EVIDENCE_MISSING', detail: 'The exact current OTP finalisation event lacks verified visual-and-audit evidence bound to F2.' })
    }
    if (finalVersion.final_signed_file_bucket && finalVersion.final_signed_file_path) {
      const artifact = await client.storage.from(finalVersion.final_signed_file_bucket).download(finalVersion.final_signed_file_path)
      if (artifact.error || !artifact.data) blockers.push({ code: 'OTP_FINAL_ARTIFACT_UNREADABLE', detail: 'Final OTP PDF could not be downloaded by the release gate.' })
      else {
        const bytes = new Uint8Array(await artifact.data.arrayBuffer())
        const pdfHeader = new TextDecoder().decode(bytes.subarray(0, 5))
        const pdfTail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 2_048)))
        const validPdf = bytes.length >= 100 && pdfHeader === '%PDF-' && pdfTail.includes('%%EOF')
        if (!validPdf) blockers.push({ code: 'OTP_FINAL_ARTIFACT_INVALID', detail: 'Final OTP artifact does not have a credible PDF envelope.' })
        const artifactSha256 = await sha256Hex(bytes)
        if (f2EvidenceValid && (artifactSha256 !== normalizedSha256(finalArtifactEvidence.sha256) || bytes.length !== Number(finalArtifactEvidence.byte_length))) {
          blockers.push({ code: 'OTP_FINAL_ARTIFACT_EVIDENCE_MISMATCH', detail: 'The stored final OTP bytes do not match immutable F2 evidence.' })
        }
        evidence.finalArtifact = { bytes: bytes.length, bucket: finalVersion.final_signed_file_bucket, path: finalVersion.final_signed_file_path, sha256: artifactSha256 }
      }
    }
  }
}
evidence.acceptance = {
  completedPacketId: completedPacket?.id || null,
  finalVersionId: finalVersion?.id || null,
  currentVersionNumber: completedPacket?.current_version_number || null,
  finalEvent: finalEvent ? { id: finalEvent.id, eventType: finalEvent.event_type, createdAt: finalEvent.created_at, signatureEvidenceMode: finalEvent.event_payload_json?.signatureEvidenceMode || null, embeddedSignatureCount: finalEvent.event_payload_json?.embeddedSignatureCount || 0, fingerprintCount: Array.isArray(finalEvent.event_payload_json?.signatureAssetFingerprints) ? finalEvent.event_payload_json.signatureAssetFingerprints.length : 0 } : null,
  finalArtifactEvidence: finalArtifactEvidence ? {
    sha256: finalArtifactEvidence.sha256,
    byteLength: Number(finalArtifactEvidence.byte_length),
    bucket: finalArtifactEvidence.bucket,
    path: finalArtifactEvidence.path,
    signatureEvidenceContract: finalArtifactEvidence.signature_evidence_contract || null,
    signatureEvidenceMode: finalArtifactEvidence.signature_evidence_mode || null,
    embeddedSignatureCount: Number(finalArtifactEvidence.embedded_signature_count) || 0,
    signatureAssetEvidenceSha256: finalArtifactEvidence.signature_asset_evidence_sha256 || null,
    fingerprintCount: Array.isArray(finalArtifactEvidence.signature_asset_fingerprints_json) ? finalArtifactEvidence.signature_asset_fingerprints_json.length : 0,
  } : null,
  requiredSignatureFieldCount: signatureFields.length,
  partialPacketIds: partials.map((row) => row.id),
}

if (!process.env.VERCEL_TOKEN) warnings.push({ code: 'DEPLOYMENT_LOG_SCAN_NOT_CONFIGURED', detail: 'VERCEL_TOKEN is unavailable, so post-deploy runtime log scanning must be performed manually.' })

const report = {
  phase: 3,
  environment: 'staging',
  status: blockers.length ? 'NO_GO' : 'GO',
  blockerCount: blockers.length,
  warningCount: warnings.length,
  blockers,
  warnings,
  evidence,
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 1
