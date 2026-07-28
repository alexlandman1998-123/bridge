import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const APP_ROOT = new URL('../', import.meta.url)
const DEFAULT_PORT = 5195
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const FAKE_SUPABASE_URL = 'https://agency-lead-workspace-smoke.supabase.co'
const FAKE_ANON_KEY = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoiYW5vbiJ9.smoke'
const DEV_AUTH_STORAGE_KEY = 'itg:dev-auth-role'

const ORGANISATION_ID = '00000000-0000-4000-8000-000000000202'
const LEAD_ID = '96be306b-d9d8-451f-8b60-79e6fe0e0cdd'
const CONTACT_ID = '0ba3b8bb-6d0c-442a-a116-041e3e2a01f1'
const LISTING_ID = '9dae2c87-9bb3-4615-8598-bda3d85422d9'
const MANDATE_PACKET_ID = 'b01aa8ad-0a00-4000-8000-000000000333'
const ONBOARDING_ID = '0b0aa8ad-0a00-4000-8000-000000000444'

const now = new Date('2026-07-27T12:00:00.000Z').toISOString()

const contactRow = {
  contact_id: CONTACT_ID,
  organisation_id: ORGANISATION_ID,
  assigned_agent_id: '00000000-0000-0000-0000-000000000102',
  first_name: 'Alexander',
  last_name: 'Landman',
  phone: '',
  email: 'alex.produktive.training@arch9.test',
  contact_type: 'Lead',
  notes: '',
  created_at: now,
  updated_at: now,
}

const staleLeadRow = {
  lead_id: LEAD_ID,
  organisation_id: ORGANISATION_ID,
  branch_id: null,
  assigned_user_id: '00000000-0000-0000-0000-000000000102',
  created_by: '00000000-0000-0000-0000-000000000102',
  assigned_agent_id: '00000000-0000-0000-0000-000000000102',
  assigned_agent_email: 'alex.produktive.training@arch9.test',
  contact_id: CONTACT_ID,
  lead_category: 'seller',
  lead_direction: 'Inbound',
  lead_source: 'Seller relationship',
  stage: 'Seller Onboarding Submitted',
  status: 'Submitted',
  priority: 'Medium',
  budget: 0,
  area_interest: '',
  property_interest: '',
  seller_property_address: null,
  estimated_value: 0,
  notes: '',
  converted_transaction_id: null,
  created_at: now,
  updated_at: now,
  listing_id: LISTING_ID,
  mandate_packet_id: MANDATE_PACKET_ID,
  seller_onboarding_token: 'seller-token-smoke',
  seller_onboarding_status: 'completed',
  enquired_listing_id: null,
  enquired_property_title: null,
  enquired_property_address: null,
  enquired_property_price: null,
  source_reference_id: null,
  raw_enquiry_payload: null,
  formatted_address: null,
  street_address: null,
  suburb: null,
  city: null,
  province: null,
  country: 'South Africa',
  postal_code: null,
  latitude: null,
  longitude: null,
  google_place_id: null,
}

let currentLeadRow = { ...staleLeadRow }

const listingRow = {
  id: LISTING_ID,
  organisation_id: ORGANISATION_ID,
  listing_reference: 'LST-SMOKE-409',
  title: '409 Queens Cres',
  listing_status: 'draft',
  status: 'draft',
  listing_visibility: 'internal',
  seller_onboarding_status: 'completed',
  seller_onboarding_token: 'seller-token-smoke',
  mandate_status: 'signed',
  mandate_packet_id: MANDATE_PACKET_ID,
  asking_price: 2850000,
  estimated_value: 2850000,
  property_address: '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081',
  seller_property_address: '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081',
  address_line_1: '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081',
  address_line_2: '',
  formatted_address: '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081',
  street_address: '409 Queens Cres',
  suburb: 'Menlo',
  city: 'Pretoria',
  province: 'Gauteng',
  country: 'South Africa',
  postal_code: '0081',
  latitude: -25.7701,
  longitude: 28.2571,
  google_place_id: 'smoke-place-409',
  image_url: 'https://images.example.test/409-queens-cres.jpg',
  seller_type: 'individual',
  finance_context: {},
  mandate_type: 'sole',
  property_category: 'residential',
  property_type: 'House',
  property_structure_type: 'freehold',
  listing_category: 'residential_resale',
  listing_source: 'seller_onboarding',
  stock_source: 'private_listing',
  seller_canonical_facts_json: {},
  seller_canonical_fact_readiness_json: {},
  seller_lead_id: LEAD_ID,
  originating_crm_lead_id: LEAD_ID,
  seller_profile_id: null,
  property_profile_id: null,
  branch_id: null,
  assigned_agent_id: '00000000-0000-0000-0000-000000000102',
  assigned_agent_email: 'alex.produktive.training@arch9.test',
  is_active: false,
  created_at: now,
  updated_at: now,
}

const onboardingRow = {
  id: ONBOARDING_ID,
  private_listing_id: LISTING_ID,
  organisation_id: ORGANISATION_ID,
  token: 'seller-token-smoke',
  status: 'completed',
  form_data: {
    propertyAddress: '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081',
    preferredTransferAttorney: {},
  },
  created_at: now,
  updated_at: now,
  completed_at: now,
}

const mandatePacketRow = {
  id: MANDATE_PACKET_ID,
  organisation_id: ORGANISATION_ID,
  packet_type: 'mandate',
  title: 'Seller Mandate',
  status: 'completed',
  template_id: null,
  template_key_snapshot: 'seller_mandate',
  template_label_snapshot: 'Seller Mandate',
  transaction_id: null,
  lead_id: LEAD_ID,
  contact_id: CONTACT_ID,
  deal_id: null,
  unit_id: null,
  assigned_agent_id: '00000000-0000-0000-0000-000000000102',
  created_by: '00000000-0000-0000-0000-000000000102',
  current_version_number: 1,
  source_context_json: {
    mandateStatus: 'signed',
    signingStatus: 'fully_signed',
  },
  branding_snapshot_json: {},
  sent_at: now,
  completed_at: now,
  archived_at: null,
  created_at: now,
  updated_at: now,
}

const mandatePacketVersionRow = {
  id: '0c0aa8ad-0a00-4000-8000-000000000555',
  packet_id: MANDATE_PACKET_ID,
  version_number: 1,
  render_status: 'completed',
  rendered_file_path: 'mandates/smoke-preview.pdf',
  rendered_file_name: 'Seller Mandate.pdf',
  rendered_file_bucket: 'documents',
  final_signed_file_path: 'mandates/smoke-signed.pdf',
  final_signed_file_name: 'Signed Mandate.pdf',
  final_signed_file_bucket: 'documents',
  finalised_at: now,
  generated_at: now,
  created_at: now,
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(baseUrl, outputRef) {
  const deadline = Date.now() + 45_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }
  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || 'no response'}\nVite output:\n${outputRef.value}`)
}

async function startViteServer() {
  const providedUrl = String(process.env.AGENCY_LEAD_WORKSPACE_SMOKE_BASE_URL || '').trim().replace(/\/$/, '')
  if (providedUrl) {
    await waitForServer(providedUrl, { value: 'Provided base URL did not respond.' })
    return { baseUrl: providedUrl, stop: async () => {} }
  }

  const outputRef = { value: '' }
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '--strictPort'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      VITE_APP_ENV: 'development',
      VITE_SUPABASE_URL: FAKE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
      VITE_SUPABASE_KEY: '',
      VITE_ENABLE_DEV_AUTH_BYPASS: 'true',
      VITE_ENABLE_LOCAL_FALLBACKS: 'true',
      VITE_ALLOW_UNSAFE_LOCAL_FALLBACKS: 'true',
      VITE_ENABLE_MOCK_DATA: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    outputRef.value += chunk.toString()
  })

  try {
    await waitForServer(DEFAULT_BASE_URL, outputRef)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  return {
    baseUrl: DEFAULT_BASE_URL,
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(3000),
      ])
      if (child.exitCode === null) child.kill('SIGKILL')
    },
  }
}

function tableFromPath(pathname = '') {
  return pathname.split('/').filter(Boolean).at(-1) || ''
}

function isObjectResponse(request) {
  const accept = request.headers().accept || ''
  return accept.includes('application/vnd.pgrst.object+json')
}

function jsonResponse(body, request, status = 200) {
  return {
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'content-range': Array.isArray(body) ? `0-${Math.max(body.length - 1, 0)}/${body.length}` : '0-0/1',
      preference: 'return=representation',
    },
    body: JSON.stringify(body),
  }
}

function rowsForRequest(url, request) {
  const table = tableFromPath(url.pathname)
  const wantsSingle = isObjectResponse(request)
  const leadIdFilter = url.searchParams.get('lead_id') || ''
  const listingIdFilter = url.searchParams.get('id') || ''

  if (table === 'contacts') {
    return wantsSingle ? contactRow : [contactRow]
  }

  if (table === 'leads') {
    if (leadIdFilter.includes(LEAD_ID)) return wantsSingle ? currentLeadRow : [currentLeadRow]
    return [currentLeadRow]
  }

  if (table === 'private_listings') {
    if (listingIdFilter.includes(LISTING_ID)) return wantsSingle ? listingRow : [listingRow]
    return [listingRow]
  }

  if (table === 'private_listing_seller_onboarding') return [onboardingRow]
  if (table === 'lead_activities') {
    return [
      {
        activity_id: '0a000000-0000-4000-8000-000000000001',
        organisation_id: ORGANISATION_ID,
        lead_id: LEAD_ID,
        agent_id: '00000000-0000-0000-0000-000000000102',
        activity_type: 'Mandate Signed',
        activity_note: 'Smoke activity',
        activity_date: now,
        outcome: 'Completed',
        created_at: now,
      },
    ]
  }

  if (table === 'document_packets') return wantsSingle ? mandatePacketRow : [mandatePacketRow]
  if (table === 'document_packet_versions') return [mandatePacketVersionRow]

  return []
}

async function stubSupabaseTraffic(context, observed) {
  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname.toLowerCase()
    const method = request.method().toUpperCase()
    observed.requests.push(`${method} ${url.pathname}?${url.searchParams.toString()}`)

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        },
      })
      return
    }

    if (pathname.includes('/auth/v1')) {
      await route.fulfill(jsonResponse({ user: null, session: null }, request))
      return
    }

    if (method === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' })
      return
    }

    if (method === 'PATCH' && tableFromPath(url.pathname) === 'leads') {
      const patch = JSON.parse(request.postData() || '{}')
      observed.leadPatchBodies.push(patch)
      currentLeadRow = {
        ...currentLeadRow,
        ...patch,
        lead_id: currentLeadRow.lead_id || LEAD_ID,
        organisation_id: currentLeadRow.organisation_id || ORGANISATION_ID,
      }
      await route.fulfill(jsonResponse([{ ...currentLeadRow }], request))
      return
    }

    if (pathname.includes('/rpc/')) {
      await route.fulfill(jsonResponse({}, request))
      return
    }

    await route.fulfill(jsonResponse(rowsForRequest(url, request), request))
  })
}

function isIgnorableConsoleMessage(message) {
  const text = `${message.type()} ${message.text()}`.toLowerCase()
  return [
    'dev auth bypass is enabled',
    'download the react devtools',
    'supabase',
    'failed to load resource',
    'networkerror',
    '404',
  ].some((token) => text.includes(token))
}

const server = await startViteServer()
const browser = await chromium.launch({ headless: true })
const observed = { leadPatchBodies: [], requests: [] }
const consoleErrors = []
const pageErrors = []

async function prepareContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await context.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, 'agent')
    window.localStorage.setItem('bridge:active-workspace', 'residential')
  }, DEV_AUTH_STORAGE_KEY)
  return context
}

const warmupContext = await prepareContext()
await stubSupabaseTraffic(warmupContext, { leadPatchBodies: [], requests: [] })
const warmupPage = await warmupContext.newPage()
await warmupPage.goto(`${server.baseUrl}/pipeline/leads`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
await warmupPage.getByText('Preparing workspace').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => null)
await warmupContext.close().catch(() => {})

const context = await prepareContext()
await stubSupabaseTraffic(context, observed)

const page = await context.newPage()
page.on('console', (message) => {
  if (message.type() === 'error' && !isIgnorableConsoleMessage(message)) {
    consoleErrors.push(message.text())
  }
})
page.on('pageerror', (error) => {
  pageErrors.push(error.message)
})

try {
  const route = `/pipeline/leads/${LEAD_ID}`
  const started = Date.now()
  await page.goto(`${server.baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.getByRole('heading', { name: 'Alexander Landman' }).waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByText('409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByText('Complete Missing Details').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByText('40%').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.getByText('Seller Onboarding Submitted').first().waitFor({ state: 'visible', timeout: 10_000 })

  const hydratedMs = Date.now() - started
  assert.ok(hydratedMs < 30_000, `Lead workspace should hydrate from linked listing within the route smoke budget; took ${hydratedMs}ms.`)
  assert.equal(await page.getByText(/^Lead Workspace$/).count(), 0, 'Generic Lead Workspace placeholder should not remain after hydration.')
  assert.equal(await page.getByRole('heading', { name: 'Unnamed Lead' }).count(), 0, 'Hydrated seller lead should keep its CRM contact name.')

  await page.waitForFunction(() => window.__leadWorkspaceSmokePatched === true, null, { timeout: 1 }).catch(() => null)
  await page.waitForTimeout(500)
  const syncPatch = observed.leadPatchBodies.find((body) => body?.lead_id !== null)
    || observed.leadPatchBodies.find((body) => body?.seller_property_address)
  assert.ok(syncPatch, 'Lead workspace should PATCH the stale CRM lead from linked listing data.')
  assert.equal(syncPatch.stage, 'Listing Created')
  assert.equal(syncPatch.status, 'Draft')
  assert.equal(syncPatch.seller_property_address, '409 Queens Cres, Nr3, Menlo, Pretoria, Gauteng, 0081')
  if (syncPatch.listing_id) assert.equal(syncPatch.listing_id, LISTING_ID)
  if (syncPatch.mandate_packet_id) assert.equal(syncPatch.mandate_packet_id, MANDATE_PACKET_ID)
  if (syncPatch.seller_onboarding_status) assert.equal(syncPatch.seller_onboarding_status, 'completed')

  assert.deepEqual(pageErrors, [], `Unexpected page errors:\n${pageErrors.join('\n')}`)
  assert.deepEqual(consoleErrors, [], `Unexpected console errors:\n${consoleErrors.join('\n')}`)
  console.log(`Agency lead workspace hydration smoke passed in ${hydratedMs}ms`)
} catch (error) {
  const text = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')
  console.error('Agency lead workspace hydration smoke failed')
  console.error('Current URL:', page.url())
  console.error('Observed requests:', JSON.stringify(observed.requests, null, 2))
  console.error('Observed lead patches:', JSON.stringify(observed.leadPatchBodies, null, 2))
  console.error('Page errors:', JSON.stringify(pageErrors, null, 2))
  console.error('Console errors:', JSON.stringify(consoleErrors, null, 2))
  console.error('Visible text excerpt:', text.slice(0, 3000))
  throw error
} finally {
  await browser.close().catch(() => {})
  await server.stop().catch(() => {})
}
