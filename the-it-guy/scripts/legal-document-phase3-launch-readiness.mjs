import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const FIXTURE_KEY = 'otp_phase2_launch_acceptance_v1'

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

function metadata(template = {}) {
  return template.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
}

function legalApproval(template = {}) {
  const meta = metadata(template)
  const review = meta.legal_review && typeof meta.legal_review === 'object' ? meta.legal_review : {}
  return {
    status: normalize(meta.legal_review_status || meta.legalApprovalStatus || review.status).toLowerCase(),
    approvedAt: normalize(meta.legal_approved_at || meta.legalApprovedAt || review.approvedAt),
    reference: normalize(meta.legal_approval_reference || meta.legalApprovalReference || review.reference),
  }
}

function approved(template) {
  const approval = legalApproval(template)
  return approval.status === 'approved' && Boolean(approval.approvedAt) && Boolean(approval.reference)
}

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
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
  .select('id, packet_type, template_key, template_label, status, is_active, template_storage_bucket, template_storage_path, metadata_json, updated_at')
  .in('packet_type', ['otp', 'mandate'])
  .eq('status', 'published')
  .neq('is_active', false)
assert.ifError(templateResult.error)
const templates = templateResult.data || []
const otpTemplate = templates.find((row) => normalize(row.packet_type).toLowerCase() === 'otp')
const mandateTemplates = templates.filter((row) => normalize(row.packet_type).toLowerCase() === 'mandate')
if (!otpTemplate?.template_storage_path) blockers.push({ code: 'OTP_TEMPLATE_SOURCE_MISSING', detail: 'Published OTP template has no renderable storage source.' })
if (!approved(otpTemplate)) blockers.push({ code: 'OTP_TEMPLATE_LEGAL_APPROVAL_PENDING', detail: 'OTP template needs approved status, approval date, and counsel/reference metadata.' })
if (!mandateTemplates.length) blockers.push({ code: 'SALES_MANDATE_TEMPLATE_MISSING', detail: 'No published active SalesMandate template exists.' })
if (!mandateTemplates.some(approved)) blockers.push({ code: 'SALES_MANDATE_TEMPLATE_LEGAL_APPROVAL_PENDING', detail: 'At least one published SalesMandate route needs approved status, approval date, and counsel/reference metadata.' })
evidence.templates = {
  otp: otpTemplate ? { id: otpTemplate.id, key: otpTemplate.template_key, sourcePresent: Boolean(otpTemplate.template_storage_path), legalApproval: legalApproval(otpTemplate) } : null,
  mandate: mandateTemplates.map((row) => ({ id: row.id, key: row.template_key, legalApproval: legalApproval(row) })),
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
if (completedPacket) {
  const versionResult = await client
    .from('document_packet_versions')
    .select('id, packet_id, version_number, render_status, rendered_file_path, final_signed_file_bucket, final_signed_file_path, finalised_at')
    .eq('packet_id', completedPacket.id)
    .not('final_signed_file_path', 'is', null)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  assert.ifError(versionResult.error)
  finalVersion = versionResult.data
  if (!finalVersion?.final_signed_file_path) blockers.push({ code: 'OTP_FINAL_ARTIFACT_MISSING', detail: 'Completed OTP packet has no final signed artifact.' })
  if (finalVersion) {
    const eventResult = await client
      .from('document_packet_events')
      .select('id, event_type, event_payload_json, created_at')
      .eq('packet_id', completedPacket.id)
      .eq('version_id', finalVersion.id)
      .eq('event_type', 'final_signed_otp_generated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    assert.ifError(eventResult.error)
    finalEvent = eventResult.data
    const payload = finalEvent?.event_payload_json || {}
    if (payload.signatureEvidenceMode !== 'visual_and_audit' || Number(payload.embeddedSignatureCount || 0) < 2) {
      blockers.push({ code: 'OTP_VISUAL_SIGNATURE_EVIDENCE_MISSING', detail: 'Latest completed OTP lacks verified visual-and-audit signature evidence.' })
    }
    if (finalVersion.final_signed_file_bucket && finalVersion.final_signed_file_path) {
      const artifact = await client.storage.from(finalVersion.final_signed_file_bucket).download(finalVersion.final_signed_file_path)
      if (artifact.error || !artifact.data) blockers.push({ code: 'OTP_FINAL_ARTIFACT_UNREADABLE', detail: 'Final OTP PDF could not be downloaded by the release gate.' })
      else {
        const bytes = new Uint8Array(await artifact.data.arrayBuffer())
        if (new TextDecoder().decode(bytes.subarray(0, 4)) !== '%PDF' || bytes.length < 10_000) blockers.push({ code: 'OTP_FINAL_ARTIFACT_INVALID', detail: 'Final OTP artifact is not a credible PDF payload.' })
        evidence.finalArtifact = { bytes: bytes.length, bucket: finalVersion.final_signed_file_bucket, path: finalVersion.final_signed_file_path }
      }
    }
  }
}
evidence.acceptance = {
  completedPacketId: completedPacket?.id || null,
  finalVersionId: finalVersion?.id || null,
  finalEvent: finalEvent ? { id: finalEvent.id, createdAt: finalEvent.created_at, signatureEvidenceMode: finalEvent.event_payload_json?.signatureEvidenceMode || null, embeddedSignatureCount: finalEvent.event_payload_json?.embeddedSignatureCount || 0 } : null,
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
