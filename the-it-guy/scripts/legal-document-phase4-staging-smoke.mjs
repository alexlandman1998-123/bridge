import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assessLegalTemplateApproval } from '../src/core/documents/legalTemplateApproval.js'

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || ''
const text = (value) => typeof value === 'string' ? value.trim() : ''
const fixturePacketIds = {
  otp: text(env.LEGAL_DOCUMENT_PHASE4_OTP_SMOKE_PACKET_ID),
  mandate: text(env.LEGAL_DOCUMENT_PHASE4_MANDATE_SMOKE_PACKET_ID),
}
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Refusing Phase 4 smoke outside canonical staging.')
assert.ok(anon && env.SUPABASE_SERVICE_ROLE_KEY, 'Staging anon and service role credentials are required.')
assert.equal(env.LEGAL_DOCUMENT_PHASE4_AUDIT_SMOKE_APPROVED, 'true', 'Set LEGAL_DOCUMENT_PHASE4_AUDIT_SMOKE_APPROVED=true before this smoke writes its bounded packet audit events.')
assert.ok(fixturePacketIds.otp && fixturePacketIds.mandate, 'Set designated OTP and mandate staging fixture packet IDs before running this audit-writing smoke.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const LOCKED_TEMPLATE_PROBE_ID = '00000000-0000-4000-8000-000000000099'
const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const auth = await authClient.auth.signInWithPassword({ email: env.CANONICAL_BROWSER_EMAIL || env.STAGING_INTERNAL_EMAIL, password: env.CANONICAL_BROWSER_PASSWORD || env.STAGING_INTERNAL_PASSWORD })
assert.ifError(auth.error)
const token = auth.data.session?.access_token
assert.ok(token, 'Staging actor session is required.')
const actorId = auth.data.user?.id
assert.ok(actorId, 'Staging actor identity is required.')

const PRIVILEGED_PACKET_ROLES = new Set(['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'manager', 'agency_admin', 'agent_admin'])
const membershipIsActive = (membership) => ['active', 'accepted'].includes(text(membership?.membership_status || membership?.status).toLowerCase())
const membershipIsPrivileged = (membership) => [membership?.role, membership?.workspace_role, membership?.organisation_role, membership?.app_role].some((role) => PRIVILEGED_PACKET_ROLES.has(text(role).toLowerCase()))
const canGeneratePacket = (packet, membership) => membershipIsActive(membership) && (membershipIsPrivileged(membership) || actorId === text(packet.assigned_agent_id) || actorId === text(packet.created_by))

const templatesResult = await admin
  .from('document_packet_templates')
  .select('id, packet_type, status, is_active, template_storage_bucket, template_storage_path, metadata_json')
  .in('packet_type', ['otp', 'mandate'])
assert.ifError(templatesResult.error)
const templates = templatesResult.data || []

async function findUnapprovedPacketProbe(packetType) {
  const packetResult = await admin
    .from('document_packets')
    .select('id, template_id, packet_type, transaction_id, organisation_id, assigned_agent_id, created_by')
    .eq('id', fixturePacketIds[packetType])
    .maybeSingle()
  assert.ifError(packetResult.error)
  const packet = packetResult.data
  assert.ok(packet?.id && packet.packet_type === packetType, `The designated ${packetType.toUpperCase()} fixture must exist and have the matching packet type.`)

  const membershipResult = await admin
    .from('organisation_users')
    .select('organisation_id, role, workspace_role, organisation_role, app_role, status, membership_status')
    .eq('organisation_id', packet.organisation_id)
    .eq('user_id', actorId)
    .maybeSingle()
  assert.ifError(membershipResult.error)
  assert.ok(canGeneratePacket(packet, membershipResult.data), `The staging actor must be authorized to generate the designated ${packetType.toUpperCase()} fixture.`)

  const template = templates.find((row) => row.id === packet.template_id)
  assert.ok(template, `The selected ${packetType.toUpperCase()} approval-lock probe template could not be resolved.`)
  const assessment = assessLegalTemplateApproval(template, { expectedPacketType: packetType })
  assert.ok(String(template.status || '').toLowerCase() === 'published' && template.is_active === true && !assessment.approved, `The designated ${packetType.toUpperCase()} fixture must use a published, active template blocked only by legal approval or runtime approval evidence.`)
  const hasNonRuntimeFailure = assessment.reasons.some((reason) => !reason.startsWith('LEGAL_B1_') && !reason.startsWith('LEGAL_B3_'))
  return {
    packet,
    template,
    expectedLockCode: hasNonRuntimeFailure ? 'LEGAL_TEMPLATE_APPROVAL_REQUIRED' : 'LEGAL_TEMPLATE_RUNTIME_APPROVAL_REQUIRED',
  }
}

const [otpProbe, mandateProbe] = await Promise.all([
  findUnapprovedPacketProbe('otp'),
  findUnapprovedPacketProbe('mandate'),
])

async function invoke(bearer, body) {
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/generate-mandate`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

function canonicalProbePayload(probe, { requestedTemplateId = probe.template.id } = {}) {
  return {
    packetId: probe.packet.id,
    transactionId: probe.packet.transaction_id || undefined,
    renderMode: 'native_structured',
    generationPayload: { template: { id: requestedTemplateId } },
  }
}

async function countApprovalBlockEvents(packetId) {
  const result = await admin
    .from('document_packet_events')
    .select('id', { count: 'exact', head: true })
    .eq('packet_id', packetId)
    .eq('event_type', 'legal_template_approval_blocked')
  assert.ifError(result.error)
  return Number(result.count || 0)
}

// These designated fixtures have already been checked for the actor's packet
// authority. The canonical release guard rejects before rendering, uploads,
// or document-version writes.
// Do not use capacityProbe here: service-only diagnostics intentionally bypass
// release/pilot checks and would not prove the production enforcement path.
const auditCountsBefore = await Promise.all([countApprovalBlockEvents(otpProbe.packet.id), countApprovalBlockEvents(mandateProbe.packet.id)])
const approvalResults = await Promise.all([
  invoke(token, canonicalProbePayload(otpProbe)).then((result) => ({ probe: otpProbe, result })),
  invoke(token, canonicalProbePayload(mandateProbe)).then((result) => ({ probe: mandateProbe, result })),
])
for (const [index, { probe, result }] of approvalResults.entries()) {
  assert.equal(result.status, 422)
  assert.equal(result.body.errorCode, probe.expectedLockCode)
  const auditCountAfter = await countApprovalBlockEvents(probe.packet.id)
  assert.ok(auditCountAfter >= auditCountsBefore[index] + 1, `The ${probe.packet.packet_type.toUpperCase()} approval-lock request must record its non-PII packet audit event.`)
}

// A normal authenticated caller must still be unable to substitute an
// arbitrary template ID. This stops before rendering and performs no write.
const [otpSourceResult, mandateSourceResult] = await Promise.all([
  invoke(token, canonicalProbePayload(otpProbe, { requestedTemplateId: LOCKED_TEMPLATE_PROBE_ID })),
  invoke(token, canonicalProbePayload(mandateProbe, { requestedTemplateId: LOCKED_TEMPLATE_PROBE_ID })),
])
for (const result of [otpSourceResult, mandateSourceResult]) {
  assert.equal(result.status, 422)
  assert.equal(result.body.errorCode, 'LEGAL_TEMPLATE_SOURCE_MISMATCH')
}

console.log(JSON.stringify({ phase: 4, environment: 'staging', status: 'passed', assertions: {
  otpUnapprovedGenerationLocked: true,
  mandateUnapprovedGenerationLocked: true,
  otpTemplateSourceLocked: true,
  mandateTemplateSourceLocked: true,
  canonicalGenerator: 'generate-mandate',
  approvalProbeMode: 'authenticated_pre_render',
  expectedStatus: 422,
  expectedApprovalCodes: { otp: otpProbe.expectedLockCode, mandate: mandateProbe.expectedLockCode },
  expectedSourceCode: 'LEGAL_TEMPLATE_SOURCE_MISMATCH',
}, mutation: {
  // Every normal approval-lock rejection intentionally records this bounded,
  // non-PII event. No generated artifact, storage object, template, packet
  // version, or pilot configuration is changed.
  mutatedData: true,
  eventType: 'legal_template_approval_blocked',
  auditEventsExpected: approvalResults.length,
  auditEventsRecorded: true,
  containsPii: false,
  generatedArtifacts: false,
  storageObjects: false,
  pilotConfiguration: false,
}, mutatedData: true }, null, 2))
