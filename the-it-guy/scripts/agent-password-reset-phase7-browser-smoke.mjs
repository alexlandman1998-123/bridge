import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const FAKE_SUPABASE_URL = 'https://agent-password-reset-phase7.supabase.co'
const FAKE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.phase7'
const DEFAULT_OUTPUT_DIR = 'test-results/agent-password-reset-phase7'

function getArgValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

async function assertNoAppErrors(page, label, errors) {
  const overlayCount = await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count()
  const bodyText = await page.locator('body').innerText({ timeout: 10000 })
  assert.equal(overlayCount, 0, `${label} should not show a dev error overlay.`)
  assert.equal(errors.length, 0, `${label} should not emit browser errors:\n${errors.join('\n')}`)
  assert.ok(bodyText.trim().length > 0, `${label} should render visible text.`)
  return bodyText
}

async function startServer() {
  const providedBaseUrl = normalizeBaseUrl(
    getArgValue('--base-url') ||
      process.env.AGENT_PASSWORD_RESET_BASE_URL ||
      process.env.VITE_DEV_SERVER_URL,
  )
  if (providedBaseUrl) {
    return { baseUrl: providedBaseUrl, stop: async () => {} }
  }

  const previousEnv = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY,
  }
  process.env.VITE_SUPABASE_URL = FAKE_SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY = FAKE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_KEY = ''

  const vite = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  assert.ok(address && typeof address === 'object', 'Agent reset Phase 7 Vite server did not start.')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      await vite.close()
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    },
  }
}

const outDir = path.resolve(getArgValue('--out-dir') || process.env.AGENT_PASSWORD_RESET_SCREENSHOT_DIR || DEFAULT_OUTPUT_DIR)
await mkdir(outDir, { recursive: true })

const server = await startServer()
const browser = await chromium.launch({ headless: true })
const results = []

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.clearCookies()

  const authPage = await context.newPage()
  const authErrors = []
  authPage.on('console', (message) => {
    if (message.type() === 'error') authErrors.push(message.text())
  })
  authPage.on('pageerror', (error) => authErrors.push(error.message))
  await authPage.goto(`${server.baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await authPage.getByRole('button', { name: 'Forgot your password?', exact: true }).click()
  await authPage.getByRole('heading', { name: 'Reset your password', exact: true }).waitFor({ timeout: 15000 })
  await authPage.getByPlaceholder('you@company.com').fill('agent.phase7@example.test')
  await authPage.getByRole('button', { name: 'Send reset link', exact: true }).waitFor({ timeout: 10000 })
  const authText = await assertNoAppErrors(authPage, 'Forgot password screen', authErrors)
  const authScreenshot = path.join(outDir, 'forgot-password.png')
  await authPage.screenshot({ path: authScreenshot, fullPage: true })
  results.push({
    name: 'forgot-password-screen',
    url: authPage.url(),
    hasForgotPasswordAction: authText.includes('Reset your password'),
    hasSendResetLink: authText.includes('Send reset link'),
    screenshot: authScreenshot,
  })

  const resetPage = await context.newPage()
  const resetErrors = []
  resetPage.on('console', (message) => {
    if (message.type() === 'error') resetErrors.push(message.text())
  })
  resetPage.on('pageerror', (error) => resetErrors.push(error.message))
  await resetPage.goto(`${server.baseUrl}/auth/reset-password`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await resetPage.getByText(/This password reset link is invalid or has expired|Password reset is not available in this environment/).waitFor({ timeout: 15000 })
  await resetPage.getByRole('button', { name: 'Return to sign in', exact: true }).waitFor({ timeout: 10000 })
  const resetText = await assertNoAppErrors(resetPage, 'Reset password invalid-link screen', resetErrors)
  const disabledInputs = await resetPage.locator('input:disabled').count()
  const resetScreenshot = path.join(outDir, 'reset-password-invalid-link.png')
  await resetPage.screenshot({ path: resetScreenshot, fullPage: true })
  results.push({
    name: 'reset-password-invalid-link',
    url: resetPage.url(),
    hasInvalidLinkCopy: /This password reset link is invalid or has expired|Password reset is not available in this environment/.test(resetText),
    hasReturnToSignIn: resetText.includes('Return to sign in'),
    disabledInputs,
    screenshot: resetScreenshot,
  })

  await context.close()
} finally {
  await browser.close()
  await server.stop()
}

for (const result of results) {
  assert.equal(result.name ? true : false, true)
  if (result.name === 'forgot-password-screen') {
    assert.equal(result.hasForgotPasswordAction, true, 'Forgot password smoke should reach the reset request UI.')
    assert.equal(result.hasSendResetLink, true, 'Forgot password smoke should show the send reset link action.')
  }
  if (result.name === 'reset-password-invalid-link') {
    assert.equal(result.hasInvalidLinkCopy, true, 'Reset route smoke should explain invalid or unavailable reset sessions.')
    assert.equal(result.hasReturnToSignIn, true, 'Reset route smoke should offer a return to sign in.')
    assert.ok(result.disabledInputs >= 2, 'Reset route should disable password fields without a recovery session.')
  }
}

console.log(JSON.stringify({
  phase: 7,
  status: 'agent_password_reset_browser_smoke_passed',
  mutatedData: false,
  baseUrl: server.baseUrl,
  results,
}, null, 2))
