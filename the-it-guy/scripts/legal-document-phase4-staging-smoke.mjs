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
const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || ''
assert.ok(url.includes('isdowlnollckzvltkasn'), 'Refusing Phase 4 smoke outside canonical staging.')
assert.ok(anon && env.SUPABASE_SERVICE_ROLE_KEY, 'Staging anon and service role credentials are required.')
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const auth = await authClient.auth.signInWithPassword({ email: env.CANONICAL_BROWSER_EMAIL || env.STAGING_INTERNAL_EMAIL, password: env.CANONICAL_BROWSER_PASSWORD || env.STAGING_INTERNAL_PASSWORD })
assert.ifError(auth.error)
const token = auth.data.session?.access_token
assert.ok(token, 'Staging actor session is required.')

const templates = await admin.from('document_packet_templates').select('id, packet_type, template_key, template_storage_bucket, template_storage_path, metadata_json').in('packet_type', ['otp', 'mandate']).eq('status', 'published').neq('is_active', false)
assert.ifError(templates.error)
const otp = templates.data?.find((row) => row.packet_type === 'otp')
const packet = await admin.from('document_packets').select('id, template_id').eq('packet_type', 'mandate').not('template_id', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle()
assert.ifError(packet.error)
const mandate = templates.data?.find((row) => row.packet_type === 'mandate' && row.id === packet.data?.template_id)
assert.ok(otp && mandate && packet.data?.id, 'Published OTP and packet-linked mandate templates are required for the negative lock smoke.')

async function invoke(name, body) {
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${name}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

const otpResult = await invoke('generate-otp', { transactionId: 'cc6d15bb-1a5b-44f3-8809-1e066b5cb85b', templateId: otp.id, templatePath: otp.template_storage_path, templateBucket: otp.template_storage_bucket })
assert.equal(otpResult.status, 422)
assert.equal(otpResult.body.errorCode, 'LEGAL_TEMPLATE_APPROVAL_REQUIRED')

const mandateResult = await invoke('generate-mandate', { packetId: packet.data.id, templatePath: mandate.template_storage_path, templateBucket: mandate.template_storage_bucket, generationPayload: { template: { id: mandate.id } } })
assert.equal(mandateResult.status, 422)
assert.equal(mandateResult.body.errorCode, 'LEGAL_TEMPLATE_APPROVAL_REQUIRED')

console.log(JSON.stringify({ phase: 4, environment: 'staging', status: 'passed', assertions: { otpUnapprovedGenerationLocked: true, mandateUnapprovedGenerationLocked: true, expectedStatus: 422, expectedCode: 'LEGAL_TEMPLATE_APPROVAL_REQUIRED' }, templateIds: { otp: otp.id, mandate: mandate.id }, mutatedData: false }, null, 2))
