#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const args = process.argv.slice(2)

function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}

function readEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value) return value
  }
  return ''
}

const supabaseUrl = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/$/, '')
const anonKey = readEnv('STORAGE_SMOKE_ANON_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY')
const serviceRoleKey = readEnv('STORAGE_SMOKE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
const expectedProjectRef = option('--expected-project-ref') || readEnv('SUPABASE_STAGING_PROJECT_REF')

assert.ok(supabaseUrl, 'A Supabase URL is required.')
assert.ok(anonKey, 'An anonymous Supabase key is required.')
assert.ok(serviceRoleKey, 'A Supabase service-role key is required for isolated smoke fixtures.')
assert.ok(expectedProjectRef, 'Pass --expected-project-ref to pin this smoke test to the intended project.')

const hostname = new URL(supabaseUrl).hostname
assert.equal(
  hostname,
  `${expectedProjectRef}.supabase.co`,
  `Refusing to verify ${hostname}; expected ${expectedProjectRef}.supabase.co.`,
)

const runId = randomUUID()
const fixtureText = `arch9 portal storage smoke ${runId}`
const fixtureHash = createHash('sha256').update(fixtureText).digest('hex')
const cleanup = []

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function headersFor(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  }
}

async function parseJson(response) {
  const body = await response.text()
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function responseMessage(payload) {
  if (!payload) return 'no response body'
  if (typeof payload === 'string') return payload.slice(0, 240)
  return String(payload.message || payload.error || payload.msg || JSON.stringify(payload)).slice(0, 240)
}

async function apiFetch(path, { method = 'GET', key = anonKey, headers = {}, body } = {}) {
  return fetch(`${supabaseUrl}${path}`, {
    method,
    headers: headersFor(key, headers),
    body,
  })
}

async function serviceRest(path, { method = 'GET', body } = {}) {
  const response = await apiFetch(`/rest/v1/${path}`, {
    method,
    key: serviceRoleKey,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await parseJson(response)
  assert.ok(response.ok, `Service REST ${method} ${path} failed (${response.status}): ${responseMessage(payload)}`)
  return payload
}

async function buyerPortalRest(path, { method = 'GET', token, body } = {}) {
  const response = await apiFetch(`/rest/v1/${path}`, {
    method,
    headers: {
      'x-bridge-client-portal-token': token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await parseJson(response)
  return { response, payload }
}

async function rpc(functionName, payload, scopedHeaders = {}) {
  const response = await apiFetch(`/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: { ...scopedHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await parseJson(response)
  return { response, result }
}

async function uploadObject(path, scopedHeaders = {}) {
  const response = await apiFetch(`/storage/v1/object/documents/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      ...scopedHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'x-upsert': 'false',
    },
    body: fixtureText,
  })
  const payload = await parseJson(response)
  assert.ok(response.ok, `Storage upload failed (${response.status}): ${responseMessage(payload)}`)
  return payload
}

async function createSignedUrl(path, scopedHeaders = {}) {
  const response = await apiFetch(`/storage/v1/object/sign/documents/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      ...scopedHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  const payload = await parseJson(response)
  return { response, payload }
}

async function assertSignedDownload(path, scopedHeaders, label) {
  const { response, payload } = await createSignedUrl(path, scopedHeaders)
  assert.ok(response.ok, `${label} signed URL failed (${response.status}): ${responseMessage(payload)}`)
  const signedUrl = payload?.signedURL || payload?.signedUrl || ''
  assert.ok(signedUrl, `${label} signed URL response did not include a URL.`)
  const absoluteUrl = /^https?:\/\//i.test(signedUrl)
    ? signedUrl
    : `${supabaseUrl}/storage/v1${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`
  const downloadResponse = await fetch(absoluteUrl)
  const downloaded = await downloadResponse.text()
  assert.ok(downloadResponse.ok, `${label} signed download failed (${downloadResponse.status}).`)
  assert.equal(
    createHash('sha256').update(downloaded).digest('hex'),
    fixtureHash,
    `${label} signed download did not return the uploaded bytes.`,
  )
}

async function assertDenied(path, scopedHeaders, label) {
  const { response, payload } = await createSignedUrl(path, scopedHeaders)
  assert.equal(
    response.ok,
    false,
    `${label} unexpectedly created a signed URL: ${responseMessage(payload)}`,
  )
  assert.ok([400, 401, 403, 404].includes(response.status), `${label} denied with unexpected HTTP ${response.status}.`)
}

async function insertBuyerDocument(path, transactionId, token) {
  const { response, payload: rows } = await buyerPortalRest('documents', {
    method: 'POST',
    token,
    body: {
      transaction_id: transactionId,
      name: 'Portal storage smoke buyer document',
      file_path: path,
      category: 'Storage smoke',
      visibility_scope: 'shared',
      is_client_visible: true,
      file_bucket: 'documents',
    },
  })
  assert.ok(response.ok, `Buyer token metadata insert failed (${response.status}): ${responseMessage(rows)}`)
  const id = Array.isArray(rows) ? rows[0]?.id : rows?.id
  assert.ok(id, 'Buyer smoke metadata insert did not return an id.')
  cleanup.push(async () => {
    await serviceRest(`documents?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  })
}

async function assertBuyerMetadataForgeryDenied({ transactionId, token, foreignPath }) {
  const { response, payload } = await buyerPortalRest('documents', {
    method: 'POST',
    token,
    body: {
      transaction_id: transactionId,
      name: 'Blocked storage metadata forgery',
      file_path: foreignPath,
      category: 'Storage smoke',
      visibility_scope: 'shared',
      is_client_visible: true,
      file_bucket: 'documents',
    },
  })
  assert.equal(
    response.ok,
    false,
    `Buyer token unexpectedly inserted metadata for a foreign storage path: ${responseMessage(payload)}`,
  )
}

async function insertSellerDocument(path, listingId) {
  const rows = await serviceRest('private_listing_documents', {
    method: 'POST',
    body: {
      private_listing_id: listingId,
      document_type: 'storage_policy_smoke',
      document_name: 'Portal storage smoke seller document',
      storage_path: path,
      status: 'uploaded',
      visibility: 'seller_visible',
      uploaded_at: new Date().toISOString(),
    },
  })
  const id = Array.isArray(rows) ? rows[0]?.id : rows?.id
  assert.ok(id, 'Seller smoke metadata insert did not return an id.')
  cleanup.push(async () => {
    await serviceRest(`private_listing_documents?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  })
}

function scheduleObjectCleanup(path) {
  cleanup.push(async () => {
    const response = await apiFetch(`/storage/v1/object/documents/${encodeStoragePath(path)}`, {
      method: 'DELETE',
      key: serviceRoleKey,
    })
    const payload = await parseJson(response)
    assert.ok(response.ok || response.status === 404, `Smoke object cleanup failed (${response.status}): ${responseMessage(payload)}`)
  })
}

async function resolveSellerFixture() {
  const candidates = await serviceRest(
    'private_listing_seller_onboarding?select=token,seller_portal_token,private_listing_id&seller_portal_link_active=eq.true&seller_portal_password_hash=is.null&order=updated_at.desc&limit=100',
  )
  for (const candidate of candidates || []) {
    const token = String(candidate?.seller_portal_token || candidate?.token || '').trim()
    if (!token || !candidate?.private_listing_id) continue
    const { response, result } = await rpc('bridge_private_listing_seller_portal_payload', {
      p_token: token,
      p_access_token: null,
      p_require_access: true,
    })
    if (response.ok && result?.listing?.id && result?.authRequired !== true) {
      return { token, listingId: String(result.listing.id) }
    }
  }
  return createSellerFixture()
}

async function createSellerFixture() {
  const organisations = await serviceRest('organisations?select=id&order=created_at.asc&limit=1')
  const organisationId = Array.isArray(organisations) ? organisations[0]?.id : organisations?.id
  assert.ok(organisationId, 'A live organisation is required to create the isolated seller smoke fixture.')

  const listingRows = await serviceRest('private_listings', {
    method: 'POST',
    body: {
      organisation_id: organisationId,
      listing_reference: `storage-policy-smoke-${runId}`,
      listing_status: 'active',
      listing_visibility: 'internal',
      seller_onboarding_status: 'in_progress',
      mandate_status: 'not_started',
      is_active: true,
      title: 'Storage policy smoke fixture',
      address_line_1: 'Temporary smoke fixture',
      is_demo_data: true,
    },
  })
  const listingId = Array.isArray(listingRows) ? listingRows[0]?.id : listingRows?.id
  assert.ok(listingId, 'Seller smoke listing insert did not return an id.')
  cleanup.push(async () => {
    await serviceRest(`private_listings?id=eq.${encodeURIComponent(listingId)}`, { method: 'DELETE' })
  })

  const token = `seller-storage-smoke-${runId}`
  const sellerPortalToken = `seller-portal-storage-smoke-${runId}`
  const accessToken = `seller-storage-session-${randomUUID().replace(/-/g, '')}`
  const accessTokenHash = createHash('sha256').update(accessToken).digest('hex')
  const onboardingRows = await serviceRest('private_listing_seller_onboarding', {
    method: 'POST',
    body: {
      private_listing_id: listingId,
      token,
      seller_portal_token: sellerPortalToken,
      form_data: {},
      status: 'not_started',
      seller_portal_link_active: true,
      seller_portal_password_hash: 'storage-policy-smoke-session-only',
      seller_portal_access_token_hash: accessTokenHash,
      seller_portal_access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_demo_data: true,
    },
  })
  const onboardingId = Array.isArray(onboardingRows) ? onboardingRows[0]?.id : onboardingRows?.id
  assert.ok(onboardingId, 'Seller smoke onboarding insert did not return an id.')
  cleanup.push(async () => {
    await serviceRest(`private_listing_seller_onboarding?id=eq.${encodeURIComponent(onboardingId)}`, { method: 'DELETE' })
  })

  const { response, result } = await rpc('bridge_private_listing_seller_portal_payload', {
    p_token: sellerPortalToken,
    p_access_token: accessToken,
    p_require_access: true,
  })
  assert.ok(
    response.ok && result?.listing?.id && result?.authRequired !== true,
    `Dedicated seller smoke portal is not valid: ${responseMessage(result)}`,
  )
  return { token: sellerPortalToken, accessToken, listingId: String(listingId) }
}

async function resolveBuyerFixture() {
  const candidates = await serviceRest(
    'client_portal_links?select=token,transaction_id&is_active=eq.true&transaction_id=not.is.null&order=updated_at.desc&limit=100',
  )
  const candidate = (candidates || []).find((item) => String(item?.token || '').trim() && item?.transaction_id)
  if (!candidate) {
    throw new Error('No active buyer portal token is available for the storage smoke fixture.')
  }
  return { token: String(candidate.token), transactionId: String(candidate.transaction_id) }
}

async function run() {
  const seller = await resolveSellerFixture()
  const buyer = await resolveBuyerFixture()
  const sellerPath = `seller-portal/${seller.listingId}/storage-policy-smoke-${runId}.txt`
  const buyerPath = `client-portal/${buyer.transactionId}/storage-policy-smoke-${runId}.txt`
  const sellerHeaders = {
    'x-bridge-seller-portal-token': seller.token,
    ...(seller.accessToken ? { 'x-bridge-seller-portal-access-token': seller.accessToken } : {}),
  }
  const buyerHeaders = { 'x-bridge-client-portal-token': buyer.token }

  const sellerScope = await rpc('bridge_storage_seller_portal_listing_id', {}, sellerHeaders)
  assert.ok(
    sellerScope.response.ok && String(sellerScope.result || '') === seller.listingId,
    `Seller storage header scope could not be resolved: ${responseMessage(sellerScope.result)}`,
  )

  await uploadObject(sellerPath, sellerHeaders)
  scheduleObjectCleanup(sellerPath)
  await insertSellerDocument(sellerPath, seller.listingId)
  await assertSignedDownload(sellerPath, sellerHeaders, 'seller token')

  await uploadObject(buyerPath, buyerHeaders)
  scheduleObjectCleanup(buyerPath)
  await insertBuyerDocument(buyerPath, buyer.transactionId, buyer.token)
  await assertSignedDownload(buyerPath, buyerHeaders, 'anonymous buyer token')
  await assertBuyerMetadataForgeryDenied({
    transactionId: buyer.transactionId,
    token: buyer.token,
    foreignPath: sellerPath,
  })

  await assertDenied(sellerPath, {}, 'plain anonymous seller read')
  await assertDenied(buyerPath, {}, 'plain anonymous buyer read')
  await assertDenied(buyerPath, { 'x-bridge-client-portal-token': `invalid-${runId}` }, 'wrong buyer token read')

  const anonymousUploadPath = `client-portal/${buyer.transactionId}/storage-policy-smoke-unauthorised-${runId}.txt`
  const anonymousUploadResponse = await apiFetch(`/storage/v1/object/documents/${encodeStoragePath(anonymousUploadPath)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'x-upsert': 'false' },
    body: fixtureText,
  })
  const anonymousUploadPayload = await parseJson(anonymousUploadResponse)
  assert.equal(
    anonymousUploadResponse.ok,
    false,
    `Plain anonymous upload unexpectedly succeeded: ${responseMessage(anonymousUploadPayload)}`,
  )

  const publicResponse = await fetch(`${supabaseUrl}/storage/v1/object/public/documents/${encodeStoragePath(buyerPath)}`)
  assert.equal(publicResponse.ok, false, 'Private documents object unexpectedly had a public URL.')

  return {
    project: expectedProjectRef,
    bucket: 'documents',
    seller: { upload: true, signedDownload: true, plainReadDenied: true },
    buyer: {
      upload: true,
      metadataWrite: true,
      signedDownload: true,
      plainReadDenied: true,
      wrongTokenDenied: true,
      foreignMetadataDenied: true,
    },
    plainAnonymousUploadDenied: true,
    publicUrlDenied: true,
  }
}

let outcome
let failure
try {
  outcome = await run()
} catch (error) {
  failure = error
} finally {
  const cleanupFailures = []
  for (const cleanupStep of cleanup.reverse()) {
    try {
      await cleanupStep()
    } catch (error) {
      cleanupFailures.push(String(error?.message || error))
    }
  }
  if (cleanupFailures.length) {
    failure = failure || new Error(`Portal storage smoke cleanup failed: ${cleanupFailures.join('; ')}`)
  }
}

if (failure) {
  throw failure
}

console.log(JSON.stringify(outcome, null, 2))
