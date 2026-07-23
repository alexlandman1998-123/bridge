import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import process from 'node:process'

const APP_ROOT = new URL('../', import.meta.url)
const DEFAULT_PORT = 5194
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const FAKE_SUPABASE_URL = 'https://agency-smoke.supabase.co'
const FAKE_ANON_KEY = 'agency-smoke-anon-key'
const DEV_AUTH_STORAGE_KEY = 'itg:dev-auth-role'

const smokeSteps = [
  {
    key: 'seller_lead',
    label: 'Seller lead comes in -> lead -> listing process',
    route: '/pipeline/leads',
    actions: [
      'open Seller Leads tab',
      'open Create Lead menu',
      'open Create Seller Lead modal',
      'edit seller contact/property fields',
      'close modal safely',
    ],
  },
  {
    key: 'buyer_lead',
    label: 'Buyer lead comes in -> lead -> registration',
    route: '/pipeline/leads',
    actions: [
      'open Buyer Leads tab',
      'toggle quick filters',
      'open Create Buyer Lead modal',
      'edit buyer qualification fields',
    'confirm lead list remains interactive',
    ],
  },
  {
    key: 'listing',
    label: 'Listing workflows and data fields',
    route: '/listings',
    actions: [
      'confirm oversight strip is hidden',
      'open Quick Add Listing modal',
      'edit manual seller/property fields',
      'toggle mandate details',
      'close modal safely',
    ],
  },
]

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
  const providedUrl = String(process.env.AGENCY_BROWSER_SMOKE_BASE_URL || '').trim().replace(/\/$/, '')
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

async function stubSupabaseTraffic(context) {
  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname.toLowerCase()
    const method = request.method().toUpperCase()

    if (pathname.includes('/auth/v1')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null, session: null }),
      })
      return
    }

    if (method === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' })
      return
    }

    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    const body = pathname.includes('/rpc/') || isMutation ? {} : []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'content-range': '0-0/0',
      },
      body: JSON.stringify(body),
    })
  })
}

async function openAsAgent(page, baseUrl, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await expectNoAuthBounce(page, path)
}

async function expectNoAuthBounce(page, expectedPath) {
  const url = new URL(page.url())
  assert.notEqual(url.pathname, '/auth', `Agency browser smoke bounced to auth while opening ${expectedPath}`)
}

async function clickByRole(page, role, name, options = {}) {
  const locator = page.getByRole(role, { name, exact: options.exact ?? false })
  await locator.first().waitFor({ state: 'visible', timeout: options.timeout ?? 15_000 })
  await locator.first().click(options.clickOptions || {})
  return locator.first()
}

async function chooseLeadType(page, label) {
  const tab = page.getByRole('tab', { name: new RegExp(label), exact: false }).first()
  if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tab.click()
    return
  }
  const selector = page.locator('select').filter({ has: page.locator('option', { hasText: label }) }).first()
  await selector.waitFor({ state: 'visible', timeout: 10_000 })
  const optionValue = await selector.evaluate((element, targetLabel) => {
    const options = Array.from(element.options || [])
    return options.find((option) => option.textContent?.includes(targetLabel))?.value || ''
  }, label)
  assert.ok(optionValue, `Lead type option ${label} should be available.`)
  await selector.selectOption(optionValue)
}

async function fillByLabel(page, name, value) {
  const locator = page.getByLabel(name, { exact: false }).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await locator.fill(value)
  return locator
}

async function fillFirstByTextLabel(page, labelText, value) {
  const field = page.locator('label', { hasText: labelText }).locator('input, textarea, select').first()
  await field.waitFor({ state: 'visible', timeout: 10_000 })
  const tagName = await field.evaluate((element) => element.tagName.toLowerCase())
  if (tagName === 'select') {
    await field.selectOption({ index: 0 })
  } else {
    await field.fill(value)
  }
  return field
}

async function fillByPlaceholder(page, placeholder, value) {
  const field = page.getByPlaceholder(placeholder, { exact: false }).first()
  await field.waitFor({ state: 'visible', timeout: 10_000 })
  await field.fill(value)
  return field
}

async function closeDialog(page) {
  const cancel = page.getByRole('button', { name: /^Cancel$/ }).last()
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click()
    await page.waitForTimeout(250)
    return
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

async function openCreateLeadModal(page, categoryLabel) {
  const title = `Create ${categoryLabel} Lead`
  const createButton = page.getByRole('button', { name: /^Create Lead$/ }).first()
  if (await createButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await createButton.click()
  } else {
    await clickByRole(page, 'button', /^Add Lead$/)
  }
  if (await page.getByText(title).first().isVisible({ timeout: 1000 }).catch(() => false)) {
    return
  }
  if (await page.getByText(/^Create Lead$/).first().isVisible({ timeout: 1000 }).catch(() => false)) {
    return
  }
  await clickByRole(page, 'menuitem', new RegExp(`${categoryLabel} Lead`))
  await page.getByText(title).first().waitFor({ state: 'visible', timeout: 10_000 })
}

async function runLeadSmoke(page, baseUrl) {
  await openAsAgent(page, baseUrl, '/pipeline/leads')
  await chooseLeadType(page, 'Seller Leads')
  await openCreateLeadModal(page, 'Seller')
  await fillByPlaceholder(page, 'Name', 'Phase Four')
  await fillByPlaceholder(page, 'Surname', 'Seller')
  await fillByPlaceholder(page, 'Phone', '+27820000000')
  await fillByPlaceholder(page, 'Property Area', '12 Smoke Test Road')
  await closeDialog(page)

  await chooseLeadType(page, 'Buyer Leads')
  await clickByRole(page, 'button', /^Filter$/)
  await openCreateLeadModal(page, 'Buyer')
  await fillByPlaceholder(page, 'Name', 'Phase Four')
  await fillByPlaceholder(page, 'Surname', 'Buyer')
  await fillByPlaceholder(page, 'Email', 'buyer.phase4@example.test')
  await fillByPlaceholder(page, 'Budget', '2500000')
  await fillByPlaceholder(page, 'Area Interest', 'Sandton')
  await closeDialog(page)

  await page.getByRole('button', { name: /^Add Lead$/ }).first().waitFor({ state: 'visible', timeout: 10_000 })
}

async function runListingSmoke(page, baseUrl) {
  await openAsAgent(page, baseUrl, '/listings')
  await page.getByRole('button', { name: /^Quick Add Listing$/ }).first().waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await page.getByText('Follow-Up Oversight').count(), 0, 'Follow-Up Oversight strip should not render on listings.')
  assert.equal(await page.getByRole('button', { name: /Copy Chase List/ }).count(), 0, 'Copy Chase List action should not render on listings.')
  await clickByRole(page, 'button', /^Quick Add Listing$/)
  await page.getByText('Quick Add is for manual or external listings.').first().waitFor({ state: 'visible', timeout: 10_000 })
  await fillFirstByTextLabel(page, 'Seller name', 'Phase Four Seller')
  await fillFirstByTextLabel(page, 'Seller phone', '+27821111111')
  await fillByPlaceholder(page, 'Start typing the property address', '34 Listing Smoke Avenue')
  await fillFirstByTextLabel(page, 'Listing price', '3200000')
  await clickByRole(page, 'button', /Add mandate details/)
  await page.getByText('Mandate capture pack').first().waitFor({ state: 'visible', timeout: 10_000 })
  await clickByRole(page, 'button', /Generate Mandate/)
  await page.getByText('Mandate generation will be available from the listing workspace after save.').first().waitFor({ state: 'visible', timeout: 10_000 })
  await closeDialog(page)
}

const server = await startViteServer()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  permissions: ['clipboard-read', 'clipboard-write'],
})

const consoleErrors = []
const pageErrors = []

await context.addInitScript((storageKey) => {
  window.localStorage.setItem(storageKey, 'agent')
  window.localStorage.setItem('bridge:active-workspace', 'residential')
}, DEV_AUTH_STORAGE_KEY)
await stubSupabaseTraffic(context)

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
  console.log('Agency browser smoke')
  for (const step of smokeSteps) {
    console.log(`  - ${step.label}`)
    for (const action of step.actions) console.log(`    ${action}`)
  }

  await runLeadSmoke(page, server.baseUrl)
  await runListingSmoke(page, server.baseUrl)

  assert.deepEqual(pageErrors, [], `Browser page errors:\n${pageErrors.join('\n')}`)
  assert.deepEqual(consoleErrors, [], `Browser console errors:\n${consoleErrors.join('\n')}`)
  console.log('agency browser smoke tests passed')
} finally {
  await browser.close()
  await server.stop()
}
