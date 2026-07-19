import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

export const BOND_RUNTIME_AUTH_DEFAULT_PATH = process.env.BOND_RUNTIME_AUTH_STATE_PATH || '/tmp/bond-runtime-auth-state.json'
export const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'
export const ATTORNEY_FIXTURE_EMAIL = 'qa.attorney+canonical@arch9.co.za'
const ATTORNEY_AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')
const DEFAULT_APP_URL = 'https://app.arch9.co.za'

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.local'),
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

function deriveProjectRef(supabaseUrl) {
  const match = normalizeText(supabaseUrl).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match ? match[1] : ''
}

function buildAuthTokenStorageName(projectRef) {
  return `sb-${projectRef}-auth-token`
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function readFixtureMetadata(filePath) {
  if (!filePath) return null
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bond runtime fixture metadata missing at ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getFixtureUsers(metadata) {
  if (!metadata) return []
  return Array.isArray(metadata.users) ? metadata.users : []
}

export function assertFixtureUserIncluded(metadata, email) {
  if (!metadata) return
  const normalizedEmail = normalizeEmail(email)
  if (metadata.fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    throw new Error(`Bond runtime fixture metadata is not tagged as ${BOND_RUNTIME_FIXTURE_NAMESPACE}`)
  }
  const match = getFixtureUsers(metadata).find((item) => normalizeEmail(item.email) === normalizedEmail)
  if (!match) {
    throw new Error(`Bond runtime auth bootstrap user ${normalizedEmail} is not present in fixture metadata`)
  }
}

export function assertBondRuntimeCredentials({ email, password, outputPath }) {
  if (!normalizeEmail(email) || !normalizeText(password)) {
    throw new Error('BOND_RUNTIME_AUTH_EMAIL and BOND_RUNTIME_AUTH_PASSWORD are required')
  }
  if (normalizeEmail(email) === ATTORNEY_FIXTURE_EMAIL) {
    throw new Error('Bond runtime auth bootstrap cannot reuse the attorney canonical fixture account')
  }
  if (!normalizeText(outputPath)) {
    throw new Error('BOND_RUNTIME_AUTH_STATE_PATH is required')
  }
  if (normalizeText(outputPath).endsWith(ATTORNEY_AUTH_STATE_PATH)) {
    throw new Error('Bond runtime auth bootstrap cannot overwrite the attorney auth state path')
  }
}

export function buildBondRuntimeStorageState({
  appUrl = DEFAULT_APP_URL,
  projectRef,
  session,
  meta = null,
}) {
  if (!projectRef) {
    throw new Error('Supabase project ref is required to build Bond runtime auth state')
  }
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('Verified Bond runtime session is required to build auth state')
  }

  const payload = {
    access_token: session.access_token,
    token_type: session.token_type || 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }

  const storageState = {
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

  if (meta) {
    storageState.__bondRuntimeMeta = meta
  }

  return storageState
}

async function verifyBrowserSession({ appUrl, outputPath }) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ storageState: outputPath })
    const page = await context.newPage()
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 60_000 })
    const finalUrl = page.url()
    if (new URL(finalUrl).pathname.startsWith('/auth')) {
      throw new Error(`Bond runtime auth state did not unlock the app. Final URL remained ${finalUrl}`)
    }
    await context.close()
    return finalUrl
  } finally {
    await browser.close()
  }
}

async function signInAndBuildState(config) {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  })
  if (error) {
    throw new Error(`Bond runtime auth login failed: ${error.message}`)
  }

  const session = data?.session
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('Bond runtime auth bootstrap did not receive a usable session')
  }

  const payload = decodeJwtPayload(session.access_token)
  if (!payload?.sub || !payload?.email) {
    throw new Error('Bond runtime auth bootstrap could not verify the returned access token payload')
  }
  if (normalizeEmail(payload.email) !== normalizeEmail(config.email)) {
    throw new Error('Bond runtime auth bootstrap verified a session for the wrong email address')
  }

  return { session, payload }
}

export function resolveAuthConfig(env = process.env) {
  const merged = {
    ...loadEnv(),
    ...env,
  }

  const supabaseUrl = normalizeText(merged.SUPABASE_URL || merged.VITE_SUPABASE_URL)
  const supabaseAnonKey = normalizeText(merged.VITE_SUPABASE_ANON_KEY || merged.VITE_SUPABASE_KEY)
  const projectRef = deriveProjectRef(supabaseUrl)
  const appUrl = normalizeUrl(merged.BOND_RUNTIME_AUTH_APP_URL || DEFAULT_APP_URL)
  const email = normalizeEmail(merged.BOND_RUNTIME_AUTH_EMAIL || '')
  const password = normalizeText(merged.BOND_RUNTIME_AUTH_PASSWORD || '')
  const outputPath = normalizeText(merged.BOND_RUNTIME_AUTH_STATE_PATH || BOND_RUNTIME_AUTH_DEFAULT_PATH)
  const metadataPath = normalizeText(merged.BOND_RUNTIME_FIXTURE_METADATA || '')

  assertBondRuntimeCredentials({ email, password, outputPath })

  if (!supabaseUrl || !supabaseAnonKey || !projectRef) {
    throw new Error('SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for Bond runtime auth bootstrap')
  }

  const metadata = metadataPath ? readFixtureMetadata(metadataPath) : null
  assertFixtureUserIncluded(metadata, email)

  return {
    supabaseUrl,
    supabaseAnonKey,
    projectRef,
    appUrl,
    email,
    password,
    outputPath,
    metadataPath: metadataPath || null,
    metadata,
  }
}

async function main() {
  const config = resolveAuthConfig(process.env)
  const { session, payload } = await signInAndBuildState(config)

  const fixtureNamespace =
    session?.user?.user_metadata?.fixture_namespace ||
    session?.user?.user_metadata?.staging_fixture_namespace ||
    payload?.user_metadata?.fixture_namespace ||
    null

  if (fixtureNamespace && fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    throw new Error(`Bond runtime auth bootstrap signed into a non-Bond runtime fixture namespace: ${fixtureNamespace}`)
  }

  const storageState = buildBondRuntimeStorageState({
    appUrl: config.appUrl,
    projectRef: config.projectRef,
    session,
    meta: {
      source: 'real_staging_auth_bootstrap',
      fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
      generatedAt: new Date().toISOString(),
      email: config.email,
      metadataPath: config.metadataPath,
      stagingVerified: true,
    },
  })

  fs.mkdirSync(path.dirname(config.outputPath), { recursive: true })
  fs.writeFileSync(config.outputPath, `${JSON.stringify(storageState, null, 2)}\n`)
  const finalUrl = await verifyBrowserSession({ appUrl: config.appUrl, outputPath: config.outputPath })

  process.stdout.write(
    `${JSON.stringify(
      {
        email: config.email,
        outputPath: config.outputPath,
        fixtureNamespace: BOND_RUNTIME_FIXTURE_NAMESPACE,
        finalUrl,
      },
      null,
      2,
    )}\n`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
