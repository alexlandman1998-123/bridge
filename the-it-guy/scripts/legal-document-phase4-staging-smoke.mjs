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
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Refusing Phase 4 smoke outside canonical staging.')
assert.ok(anon && env.SUPABASE_SERVICE_ROLE_KEY, 'Staging anon and service role credentials are required.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const LOCKED_TEMPLATE_PROBE_ID = '00000000-0000-4000-8000-000000000099'
const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const auth = await authClient.auth.signInWithPassword({ email: env.CANONICAL_BROWSER_EMAIL || env.STAGING_INTERNAL_EMAIL, password: env.CANONICAL_BROWSER_PASSWORD || env.STAGING_INTERNAL_PASSWORD })
assert.ifError(auth.error)
const token = auth.data.session?.access_token
assert.ok(token, 'Staging actor session is required.')

const mandateTemplates = await admin.from('document_packet_templates').select('id, packet_type, status, is_active, template_storage_bucket, template_storage_path, metadata_json').eq('packet_type', 'mandate')
assert.ifError(mandateTemplates.error)
const unapprovedMandateIds = (mandateTemplates.data || []).filter((row) => !assessLegalTemplateApproval(row, { expectedPacketType: 'mandate' }).approved).map((row) => row.id)
const packet = unapprovedMandateIds.length
  ? await admin.from('document_packets').select('id, template_id').eq('packet_type', 'mandate').in('template_id', unapprovedMandateIds).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  : { data: null, error: null }
assert.ifError(packet.error)
const packetTemplate = (mandateTemplates.data || []).find((row) => row.id === packet.data?.template_id) || null

async function invoke(name, body) {
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

const otpResult = await invoke('generate-otp', { transactionId: 'cc6d15bb-1a5b-44f3-8809-1e066b5cb85b', templateId: LOCKED_TEMPLATE_PROBE_ID })
assert.equal(otpResult.status, 422)
assert.equal(otpResult.body.errorCode, 'LEGAL_TEMPLATE_APPROVAL_REQUIRED')

const fallbackPacket = packet.data?.id
  ? null
  : await admin.from('document_packets').select('id, template_id').eq('packet_type', 'mandate').not('template_id', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
assert.ifError(fallbackPacket?.error)
assert.ok(packet.data?.id || fallbackPacket?.data?.id, 'A packet is required for the negative lock smoke.')
const mandateProbe = packet.data?.id ? 'unapproved_packet_template' : 'template_source_mismatch'
const expectedMandateCode = packet.data?.id ? 'LEGAL_TEMPLATE_APPROVAL_REQUIRED' : 'LEGAL_TEMPLATE_SOURCE_MISMATCH'
const mandateTemplateId = packetTemplate?.id || LOCKED_TEMPLATE_PROBE_ID
const mandateResult = await invoke('generate-mandate', {
  packetId: packet.data?.id || fallbackPacket.data.id,
  templatePath: packetTemplate?.template_storage_path || '',
  templateBucket: packetTemplate?.template_storage_bucket || '',
  generationPayload: { template: { id: mandateTemplateId } },
})
assert.equal(mandateResult.status, 422)
assert.equal(mandateResult.body.errorCode, expectedMandateCode)

console.log(JSON.stringify({ phase: 4, environment: 'staging', status: 'passed', assertions: { otpUnapprovedGenerationLocked: true, mandateUnapprovedGenerationLocked: true, otpProbe: 'nonexistent_template', mandateProbe, expectedStatus: 422, expectedOtpCode: 'LEGAL_TEMPLATE_APPROVAL_REQUIRED', expectedMandateCode }, templateIds: { otp: LOCKED_TEMPLATE_PROBE_ID, mandate: mandateTemplateId }, mutatedData: false }, null, 2))
