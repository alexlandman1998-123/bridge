#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const APP_ROOT = new URL('../', import.meta.url)
const DEFAULT_PORT = 5196
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`
const FAKE_SUPABASE_URL = 'https://seller-phase5-smoke.supabase.co'
const FAKE_ANON_KEY = 'seller-phase5-smoke-anon-key'
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const PUBLIC_ROUTES = [
  {
    key: 'demo_links',
    path: '/demo/onboarding-links',
    expected: [/Client demo links/i, /Seller Onboarding/i, /Seller Portal/i],
  },
  {
    key: 'seller_onboarding_demo',
    path: '/seller/onboarding/demo-seller-onboarding',
    expected: [/Seller onboarding/i, /Property Details/i, /Review/i],
  },
  {
    key: 'seller_portal_demo',
    path: '/client/demo-seller-portal/selling',
    expected: [/seller portal/i, /Dashboard/i, /Documents/i, /Offers/i],
  },
  {
    key: 'auth_entry',
    path: '/auth',
    expected: [/sign in/i, /email/i, /password/i],
    allowAuthPath: true,
  },
]

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SELLER_SIDE_BROWSER_SMOKE_BASE_URL || '',
    authStatePath: process.env.SELLER_SIDE_BROWSER_SMOKE_AUTH_STATE || 'playwright/.auth/staging-internal.json',
    transactionId: process.env.SELLER_SIDE_BROWSER_SMOKE_TRANSACTION_ID || '',
    publicOnly: false,
    authenticatedOnly: false,
    skipAuthenticated: false,
  }

  for (const arg of argv) {
    if (arg === '--public-only') options.publicOnly = true
    else if (arg === '--authenticated-only') options.authenticatedOnly = true
    else if (arg === '--skip-authenticated') options.skipAuthenticated = true
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length)
    else if (arg.startsWith('--auth-state=')) options.authStatePath = arg.slice('--auth-state='.length)
    else if (arg.startsWith('--transaction-id=')) options.transactionId = arg.slice('--transaction-id='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
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

async function startViteServer(baseUrl = '') {
  const providedUrl = String(baseUrl || '').trim().replace(/\/$/, '')
  if (providedUrl) {
    await waitForServer(providedUrl, { value: 'Provided base URL did not respond.' })
    return { baseUrl: providedUrl, stop: async () => {} }
  }

  const outputRef = { value: '' }
  const child = spawn(NPM_BIN, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '--strictPort'], {
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
      VITE_DOCUMENT_TITLE: process.env.VITE_DOCUMENT_TITLE || 'Arch9 Seller Smoke',
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
    'download the react devtools',
    'dev auth bypass is enabled',
    'supabase',
    'networkerror',
    'failed to load resource',
  ].some((token) => text.includes(token))
}

async function stubSupabaseTraffic(context) {
  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const pathname = new URL(request.url()).pathname.toLowerCase()

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

    const body = pathname.includes('/rpc/') || ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) ? {} : []
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

async function hasAnyExpectedText(page, patterns = []) {
  for (const pattern of patterns) {
    const locator = page.getByText(pattern).first()
    if (await locator.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false)) return true
  }
  return false
}

async function assertNoRouteFailure(page, route) {
  const url = new URL(page.url())
  if (!route.allowAuthPath) {
    assert.notEqual(url.pathname, '/auth', `${route.key} bounced to /auth`)
  }
  assert.equal(
    await page.getByText(/seller onboarding link is invalid|invalid or inactive|failed to load|something went wrong/i).first().isVisible().catch(() => false),
    false,
    `${route.key} rendered an error state`,
  )
}

async function visitRoute(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => null)
  await assertNoRouteFailure(page, route)
  assert.equal(await hasAnyExpectedText(page, route.expected), true, `${route.key} did not render an expected marker`)
  return {
    key: route.key,
    path: route.path,
    finalUrl: page.url(),
    status: 'PASS',
  }
}

function resolveAuthenticatedRoutes(transactionId = '') {
  const id = String(transactionId || '').trim()
  if (!id) return []
  return [
    {
      key: 'transaction_overview',
      path: `/transactions/${id}`,
      expected: [/Overview/i, /Documents/i, /Finance/i, /Transfer/i],
    },
    {
      key: 'transaction_transfer_detail',
      path: `/transactions/${id}/transfer/transfer`,
      expected: [/Transfer/i, /Registration/i, /Documents/i, /Matter/i],
    },
  ]
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const server = await startViteServer(options.baseUrl)
  const browser = await chromium.launch({ headless: true })
  const consoleErrors = []
  const pageErrors = []
  const results = {
    ok: false,
    generatedAt: new Date().toISOString(),
    baseUrl: server.baseUrl,
    public: [],
    authenticated: [],
    authenticatedSkipped: false,
  }

  try {
    if (!options.authenticatedOnly) {
      const publicContext = await browser.newContext({ viewport: { width: 1366, height: 960 } })
      await stubSupabaseTraffic(publicContext)
      const publicPage = await publicContext.newPage()
      publicPage.on('console', (message) => {
        if (message.type() === 'error' && !isIgnorableConsoleMessage(message)) consoleErrors.push(message.text())
      })
      publicPage.on('pageerror', (error) => pageErrors.push(error.message))

      for (const route of PUBLIC_ROUTES) {
        results.public.push(await visitRoute(publicPage, server.baseUrl, route))
      }
      await publicContext.close()
    }

    const authRoutes = resolveAuthenticatedRoutes(options.transactionId)
    const canRunAuthenticated =
      !options.publicOnly &&
      !options.skipAuthenticated &&
      authRoutes.length > 0 &&
      options.authStatePath &&
      fs.existsSync(options.authStatePath)

    if (canRunAuthenticated) {
      const authContext = await browser.newContext({
        storageState: options.authStatePath,
        viewport: { width: 1440, height: 1000 },
      })
      const authPage = await authContext.newPage()
      authPage.on('console', (message) => {
        if (message.type() === 'error' && !isIgnorableConsoleMessage(message)) consoleErrors.push(message.text())
      })
      authPage.on('pageerror', (error) => pageErrors.push(error.message))

      for (const route of authRoutes) {
        results.authenticated.push(await visitRoute(authPage, server.baseUrl, route))
      }
      await authContext.close()
    } else if (!options.publicOnly) {
      results.authenticatedSkipped = true
      results.authenticatedSkipReason = authRoutes.length
        ? `auth state not found at ${options.authStatePath}`
        : 'transaction id not provided'
    }

    assert.deepEqual(pageErrors, [], `Browser page errors:\n${pageErrors.join('\n')}`)
    assert.deepEqual(consoleErrors, [], `Browser console errors:\n${consoleErrors.join('\n')}`)
    results.ok = true
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
    await server.stop()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack,
  }, null, 2))
  process.exitCode = 1
})
