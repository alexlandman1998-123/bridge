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
  inactiveSellerTokenRejectedSafely,
  inactiveSellerTokenCheck,
  invalidSellerTokenRejectedSafely: true,
  activeClientPortalLink: {
    token: portalLinkQuery.data.token,
    transactionId: portalLinkQuery.data.transaction_id,
    path: `/client/${portalLinkQuery.data.token}/documents`,
  },
}))
