import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import {
  ensureHomeSeekersAgencyDemoWorkspace,
  HOME_SEEKERS_DEMO_EMAIL,
  HOME_SEEKERS_DEMO_PASSWORD,
} from './agencyDemoBootstrap.mjs'

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

const args = new Set(process.argv.slice(2))
const argValue = (name, fallback = '') => {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const ENVIRONMENT = String(argValue('--environment', process.env.AGENCY_DEMO_ENVIRONMENT || 'staging')).trim()

async function fetchDefinitions({ supabaseUrl, serviceRoleKey }) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) {
    throw new Error(`Could not fetch Supabase schema: ${response.status} ${await response.text()}`)
  }
  const spec = await response.json()
  return Object.fromEntries(
    Object.entries(spec.definitions || {}).map(([table, schema]) => [
      table,
      new Set(Object.keys(schema.properties || {})),
    ]),
  )
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

  const context = await ensureHomeSeekersAgencyDemoWorkspace(adminClient, {
    definitions: config.definitions,
    email: config.email,
    password: config.password,
  })

  return context.profile
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY)
  const projectRef = projectRefFromUrl(supabaseUrl)
  const appUrl = normalizeUrl(env.AGENCY_RUNTIME_AUTH_APP_URL || env.STAGING_APP_URL || DEFAULT_APP_URL)
  const email = normalizeText(env.AGENCY_DEMO_EMAIL || HOME_SEEKERS_DEMO_EMAIL).toLowerCase()
  const password = normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || HOME_SEEKERS_DEMO_PASSWORD)

  if (!supabaseUrl || !serviceRoleKey || !projectRef) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  if (!email || !password) {
    throw new Error('AGENCY_RUNTIME_AGENT_EMAIL and AGENCY_RUNTIME_AGENT_PASSWORD are required.')
  }
  if (!anonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is required.')
  }

  const definitions = await fetchDefinitions({ supabaseUrl, serviceRoleKey })

  const profile = await prepareAgencyPassword({
    supabaseUrl,
    serviceRoleKey,
    definitions,
    email,
    password,
  })

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  const authResult = await authClient.auth.signInWithPassword({ email, password })
  if (authResult.error) throw authResult.error
  const session = authResult.data?.session || null
  if (!session?.access_token) {
    throw new Error('Agency staging auth login did not return a session.')
  }

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true })
  fs.writeFileSync(AUTH_STATE_PATH, `${JSON.stringify(buildStorageState({ appUrl, projectRef, session }), null, 2)}\n`)

  const verifiedFinalUrl = await verifyBrowserSession({ appUrl, outputPath: AUTH_STATE_PATH })

  process.stdout.write(
    `${JSON.stringify(
      {
        email,
        profileId: profile.id,
        fullName: profile.full_name || null,
        projectRef,
        outputPath: AUTH_STATE_PATH,
        finalUrl: verifiedFinalUrl,
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
