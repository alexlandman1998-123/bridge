import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_APP_URL = 'https://app.bridgenine.co.za'
const AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        if (index === -1) return [line, '']
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.staging.local'),
    ...process.env,
  }
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = String(env.VITE_SUPABASE_URL || '')
  if (!supabaseUrl.includes(STAGING_PROJECT_REF)) {
    throw new Error(`Refusing to run: VITE_SUPABASE_URL must point at staging project ${STAGING_PROJECT_REF}.`)
  }

  const email = String(env.STAGING_INTERNAL_EMAIL || '').trim()
  const password = String(env.STAGING_INTERNAL_PASSWORD || '').trim()
  if (!email || !password) {
    throw new Error('STAGING_INTERNAL_EMAIL and STAGING_INTERNAL_PASSWORD are required. Run the staging pilot fixture setup first.')
  }

  const appUrl = normalizeUrl(env.STAGING_APP_URL || DEFAULT_APP_URL)
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message)
  })

  try {
    await page.goto(`${appUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(password)
    await page.getByRole('button', { name: /launch workspace/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 60_000 })
    await page.context().storageState({ path: AUTH_STATE_PATH })
    console.log(safeJson({
      ok: true,
      appUrl,
      authStatePath: AUTH_STATE_PATH,
      email,
      passwordPrinted: false,
      finalUrl: page.url(),
      consoleErrorCount: consoleErrors.length,
      consoleErrorPreview: consoleErrors.slice(0, 5),
    }))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
