import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const BOND_RUNTIME_AUTH_DEFAULT_PATH = process.env.BOND_RUNTIME_AUTH_STATE_PATH || '/tmp/bond-runtime-auth-state.json'
const ATTORNEY_FIXTURE_EMAIL = 'qa.attorney+canonical@bridgenine.co.za'
const ATTORNEY_AUTH_STATE_PATH = path.join('playwright', '.auth', 'staging-internal.json')
const DEFAULT_APP_URL = 'https://app.bridgenine.co.za'
const BOND_RUNTIME_FIXTURE_NAMESPACE = 'bond_runtime_phase5h'

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
    ...parseEnvFile('.env.local'),
    ...parseEnvFile('.env.staging.local'),
    ...process.env,
  }
}

function deriveProjectRef(supabaseUrl) {
  const match = String(supabaseUrl || '').match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
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

export function assertBondRuntimeCredentials({ email, password, outputPath }) {
  if (!email || !password) {
    throw new Error('BOND_RUNTIME_AUTH_EMAIL and BOND_RUNTIME_AUTH_PASSWORD are required')
  }
  if (email === ATTORNEY_FIXTURE_EMAIL) {
    throw new Error('Bond runtime auth bootstrap cannot reuse the attorney canonical fixture account')
  }
  if (!outputPath) {
    throw new Error('BOND_RUNTIME_AUTH_STATE_PATH is required')
  }
  if (outputPath.endsWith(ATTORNEY_AUTH_STATE_PATH)) {
    throw new Error('Bond runtime auth bootstrap cannot overwrite the attorney auth state path')
  }
}

export function buildBondRuntimeStorageState({
  appUrl = DEFAULT_APP_URL,
  projectRef,
  session,
}) {
  if (!projectRef) {
    throw new Error('Supabase project ref is required to build Bond runtime auth state')
  }
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('Verified Bond runtime session is required to build auth state')
  }

  return {
    cookies: [],
    origins: [
      {
        origin: appUrl,
        localStorage: [
          {
            name: buildAuthTokenStorageName(projectRef),
            value: JSON.stringify({
              access_token: session.access_token,
              token_type: session.token_type || 'bearer',
              expires_in: session.expires_in,
              expires_at: session.expires_at,
              refresh_token: session.refresh_token,
              user: session.user,
            }),
          },
        ],
      },
    ],
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
  if (payload.email !== config.email) {
    throw new Error('Bond runtime auth bootstrap verified a session for the wrong email address')
  }

  const storageState = buildBondRuntimeStorageState({
    appUrl: config.appUrl,
    projectRef: config.projectRef,
    session,
  })

  return {
    storageState,
    session,
  }
}

export function resolveAuthConfig(env = process.env) {
  const merged = {
    ...loadEnv(),
    ...env,
  }

  const supabaseUrl = String(merged.VITE_SUPABASE_URL || '').trim()
  const supabaseAnonKey = String(merged.VITE_SUPABASE_ANON_KEY || merged.VITE_SUPABASE_KEY || '').trim()
  const projectRef = deriveProjectRef(supabaseUrl)
  const appUrl = String(merged.BOND_RUNTIME_AUTH_APP_URL || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
  const email = String(merged.BOND_RUNTIME_AUTH_EMAIL || '').trim()
  const password = String(merged.BOND_RUNTIME_AUTH_PASSWORD || '').trim()
  const outputPath = String(merged.BOND_RUNTIME_AUTH_STATE_PATH || BOND_RUNTIME_AUTH_DEFAULT_PATH).trim()

  assertBondRuntimeCredentials({ email, password, outputPath })

  if (!supabaseUrl || !supabaseAnonKey || !projectRef) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for Bond runtime auth bootstrap')
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    projectRef,
    appUrl,
    email,
    password,
    outputPath,
  }
}

async function main() {
  const config = resolveAuthConfig(process.env)
  const { storageState, session } = await signInAndBuildState(config)

  const fixtureNamespace =
    session?.user?.user_metadata?.fixture_namespace ||
    session?.user?.user_metadata?.staging_fixture_namespace ||
    null

  if (fixtureNamespace && fixtureNamespace !== BOND_RUNTIME_FIXTURE_NAMESPACE) {
    throw new Error(`Bond runtime auth bootstrap signed into a non-Bond runtime fixture namespace: ${fixtureNamespace}`)
  }

  fs.mkdirSync(path.dirname(config.outputPath), { recursive: true })
  fs.writeFileSync(config.outputPath, `${JSON.stringify(storageState, null, 2)}\n`)

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        outputPath: config.outputPath,
        email: config.email,
        projectRef: config.projectRef,
        expiresAt: typeof session?.expires_at === 'number' ? new Date(session.expires_at * 1000).toISOString() : null,
        fixtureNamespace,
      },
      null,
      2,
    )}\n`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
