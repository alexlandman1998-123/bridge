import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_APP_URL = 'https://app.arch9.co.za'
const AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-agency.json')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
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

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeUrl(value) {
  return normalizeText(value).replace(/\/+$/, '')
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1] || ''
}

function buildAuthTokenStorageName(projectRef) {
  return `sb-${projectRef}-auth-token`
}

function decodeJwtPayload(token = '') {
  try {
    const [, payload = ''] = String(token).split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function buildStorageState({ appUrl, projectRef, session }) {
  const payload = {
    access_token: session.access_token,
    token_type: session.token_type || 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }

  return {
    cookies: [],
    origins: [
      {
        origin: appUrl,
        localStorage: [
          {
            name: buildAuthTokenStorageName(projectRef),
            value: JSON.stringify(payload),
          },
        ],
      },
    ],
  }
}

async function verifyBrowserSession({ appUrl, outputPath }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ storageState: outputPath })
    const page = await context.newPage()
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 60_000 })
    const finalUrl = page.url()
    if (new URL(finalUrl).pathname.startsWith('/auth')) {
      throw new Error(`Agency staging auth state did not unlock the app. Final URL remained ${finalUrl}`)
    }
    await context.close()
    return finalUrl
  } finally {
    await browser.close()
  }
}

async function prepareAgencyPassword(config) {
  const adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const profileResult = await adminClient
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', config.email)
    .maybeSingle()
  if (profileResult.error) throw new Error(`Could not resolve agency profile: ${profileResult.error.message}`)
  if (!profileResult.data?.id) {
    throw new Error(`No profile found for ${config.email}.`)
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(profileResult.data.id, {
    password: config.password,
  })
  if (updateError) {
    throw new Error(`Could not update agency demo password: ${updateError.message}`)
  }

  return profileResult.data
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const projectRef = projectRefFromUrl(supabaseUrl)
  const appUrl = normalizeUrl(env.AGENCY_RUNTIME_AUTH_APP_URL || env.STAGING_APP_URL || DEFAULT_APP_URL)
  const email = normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || '')
  const password = normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || '')

  if (!supabaseUrl || !serviceRoleKey || !projectRef) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  if (!email || !password) {
    throw new Error('AGENCY_RUNTIME_AGENT_EMAIL and AGENCY_RUNTIME_AGENT_PASSWORD are required.')
  }

  const profile = await prepareAgencyPassword({
    supabaseUrl,
    serviceRoleKey,
    email,
    password,
  })

  const browser = await chromium.launch({ headless: true })
  let finalUrl = appUrl
  try {
    const page = await browser.newPage()
    await page.goto(`${appUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).fill(password)
    await page.getByRole('button', { name: /^(sign in|sign in securely|launch workspace)$/i }).click()
    finalUrl = page.url()

    let authKeyPreview = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.waitForTimeout(2500)
      authKeyPreview = await page.evaluate(() =>
        Object.keys(window.localStorage || {})
          .filter((key) => key.includes('auth') || key.startsWith('sb-'))
          .slice(0, 8),
      )
      if (authKeyPreview.length > 0) break
    }

    if (authKeyPreview.length === 0) {
      throw new Error('Agency staging auth login did not persist an auth session in browser storage.')
    }

    await page.context().storageState({ path: AUTH_STATE_PATH })
  } finally {
    await browser.close()
  }

  const verifiedFinalUrl = await verifyBrowserSession({ appUrl, outputPath: AUTH_STATE_PATH })

  process.stdout.write(
    `${JSON.stringify(
      {
        email,
        profileId: profile.id,
        fullName: profile.full_name || null,
        projectRef,
        outputPath: AUTH_STATE_PATH,
        finalUrl: verifiedFinalUrl || finalUrl,
      },
      null,
      2,
    )}\n`,
  )
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
