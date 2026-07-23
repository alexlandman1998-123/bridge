import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const raw = fs.readFileSync('.env', 'utf8')
  return Object.fromEntries(
    raw
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

const FINAL_ARTIFACT_TRANSPORT_KEYS = new Set([
  'finalsignedfilepath',
  'finalsignedfilebucket',
  'finalsignedfileurl',
  'finalsignedfileaccessurl',
  'finalsigneddownloadurl',
  'generatedpreviewfilepath',
  'generatedpreviewfilebucket',
  'generatedpreviewfileurl',
  'renderedfilepath',
  'renderedfilebucket',
  'renderedfileurl',
  'finalartifact',
  'finalartifactpath',
  'finalartifactbucket',
  'finalsignedartifactpath',
  'finalsignedartifactbucket',
  'mandatesigneddocumentpath',
  'mandatesigneddocumenturl',
  'mandatesigneddocumentbucket',
  'signedmandateurl',
  'mandatesignedurl',
  'mandateurl',
])

function normalizePayloadKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function findSellerFinalArtifactTransportFields(value, path = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSellerFinalArtifactTransportFields(item, `${path}[${index}]`))
  }
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, nested]) => {
    const nextPath = `${path}.${key}`
    if (FINAL_ARTIFACT_TRANSPORT_KEYS.has(normalizePayloadKey(key))) return [nextPath]
    return findSellerFinalArtifactTransportFields(nested, nextPath)
  })
}

const env = loadEnv()
const supabaseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY

if (!supabaseUrl || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY are required.')
}

const client = createClient(supabaseUrl, anonKey)
const nowIso = new Date().toISOString()

const activeTokenQuery = await client
  .from('private_listing_seller_onboarding')
  .select('token, status, token_expires_at')
  .gt('token_expires_at', nowIso)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (activeTokenQuery.error) throw activeTokenQuery.error
assert.ok(activeTokenQuery.data?.token, 'expected at least one active seller onboarding token')

const activeSellerRpc = await client.rpc('bridge_private_listing_seller_portal_payload', {
  p_token: activeTokenQuery.data.token,
})
assert.equal(activeSellerRpc.error, null, `active seller token should resolve without RPC error: ${activeSellerRpc.error?.message || ''}`)
assert.ok(activeSellerRpc.data?.listing?.id, 'active seller token should return a listing')
assert.ok(activeSellerRpc.data?.onboarding?.private_listing_id, 'active seller token should return onboarding context')
const sellerPayloadFinalArtifactTransportFields = findSellerFinalArtifactTransportFields(activeSellerRpc.data)
assert.deepEqual(
  sellerPayloadFinalArtifactTransportFields,
  [],
  `seller portal payload leaked a final-artifact transport field: ${sellerPayloadFinalArtifactTransportFields.join(', ')}`,
)

let sellerF2CoordinateComparison = 'skipped_no_service_role_or_final_version'
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || ''
const safeMandatePacket = activeSellerRpc.data?.mandatePacket || activeSellerRpc.data?.mandate_packet || null
const safeMandateVersionId = String(
  safeMandatePacket?.packetVersionId || safeMandatePacket?.packet_version_id || safeMandatePacket?.version?.id || '',
).trim()
if (serviceRoleKey && safeMandateVersionId) {
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const finalVersionQuery = await admin
    .from('document_packet_versions')
    .select('final_signed_file_path, final_signed_file_bucket, final_signed_file_url')
    .eq('id', safeMandateVersionId)
    .maybeSingle()
  if (finalVersionQuery.error) throw finalVersionQuery.error
  const finalCoordinates = [
    finalVersionQuery.data?.final_signed_file_path,
    finalVersionQuery.data?.final_signed_file_bucket,
    finalVersionQuery.data?.final_signed_file_url,
  ].filter((value) => String(value || '').trim())
  if (finalCoordinates.length) {
    const serializedSellerPayload = JSON.stringify(activeSellerRpc.data)
    for (const coordinate of finalCoordinates) {
      assert.equal(
        serializedSellerPayload.includes(String(coordinate)),
        false,
        'seller portal payload must not serialize an F2 final artifact coordinate',
      )
    }
    sellerF2CoordinateComparison = 'verified_against_current_final_version'
  } else {
    sellerF2CoordinateComparison = 'skipped_no_final_artifact_on_active_seller_fixture'
  }
}

const inactiveTokenQuery = await client
  .from('private_listing_seller_onboarding')
  .select('token, status, token_expires_at')
  .lte('token_expires_at', nowIso)
  .order('token_expires_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (inactiveTokenQuery.error) throw inactiveTokenQuery.error

let inactiveSellerTokenRejectedSafely = false
let inactiveSellerTokenCheck = 'skipped_no_visible_inactive_token'
if (inactiveTokenQuery.data?.token) {
  const inactiveSellerRpc = await client.rpc('bridge_private_listing_seller_portal_payload', {
    p_token: inactiveTokenQuery.data.token,
  })
  assert.equal(inactiveSellerRpc.error, null, `inactive seller token should fail safely without RPC error: ${inactiveSellerRpc.error?.message || ''}`)
  assert.equal(inactiveSellerRpc.data, null, 'inactive/expired seller token should return null')
  inactiveSellerTokenRejectedSafely = true
  inactiveSellerTokenCheck = 'verified_with_visible_inactive_token'
}

const invalidSellerRpc = await client.rpc('bridge_private_listing_seller_portal_payload', {
  p_token: `seller-invalid-${Date.now()}`,
})
assert.equal(invalidSellerRpc.error, null, `invalid seller token should fail safely without RPC error: ${invalidSellerRpc.error?.message || ''}`)
assert.equal(invalidSellerRpc.data, null, 'invalid seller token should return null')

const portalLinkQuery = await client
  .from('client_portal_links')
  .select('token, transaction_id, is_active, created_at')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (portalLinkQuery.error) throw portalLinkQuery.error
assert.ok(portalLinkQuery.data?.token, 'expected at least one active client_portal_links fixture')

console.log(safeJson({
  ok: true,
  activeSellerTokenResolved: true,
  sellerPayloadFinalArtifactTransportFields: sellerPayloadFinalArtifactTransportFields.length,
  sellerF2CoordinateComparison,
  inactiveSellerTokenRejectedSafely,
  inactiveSellerTokenCheck,
  invalidSellerTokenRejectedSafely: true,
  activeClientPortalLinkAvailable: true,
}))
