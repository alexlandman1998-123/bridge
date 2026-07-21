import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const appRoot = new URL('..', import.meta.url).pathname
const TARGET_PROJECT_REF = 'isdowlnollckzvltkasn'
const TARGET_ORGANISATION_NAME = 'Kingstons Real Estate'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const localEnv = parseEnvFile(`${appRoot}/.env`)
  const stagingEnv = parseEnvFile(`${appRoot}/.env.staging.local`)
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  return merged
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function requireConfig(env) {
  const config = {
    supabaseUrl: normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY),
    actorEmail: normalizeEmail(env.AGENCY_RUNTIME_AGENT_EMAIL || env.STAGING_INTERNAL_EMAIL),
    actorPassword: normalizeText(env.AGENCY_RUNTIME_AGENT_PASSWORD || env.STAGING_INTERNAL_PASSWORD),
    externalEmail: normalizeEmail(env.AGENCY_RUNTIME_UNRELATED_EMAIL),
    externalPassword: normalizeText(env.AGENCY_RUNTIME_UNRELATED_PASSWORD),
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)
  const missing = []
  for (const key of ['supabaseUrl', 'serviceRoleKey', 'anonKey', 'actorEmail', 'actorPassword', 'externalEmail', 'externalPassword']) {
    if (!config[key]) missing.push(key)
  }
  if (missing.length) throw new Error(`Missing runtime fixture configuration: ${missing.join(', ')}`)
  if (config.projectRef !== TARGET_PROJECT_REF) {
    throw new Error(`Refusing to repair fixtures on ${config.projectRef || 'unknown project'}; expected ${TARGET_PROJECT_REF}.`)
  }
  return config
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function findAuthUserByEmail(config, email) {
  const baseUrl = config.supabaseUrl.replace(/\/+$/, '')
  let page = 1
  const perPage = 50
  for (;;) {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    })
    if (!response.ok) {
      if (page > 1) return null
      const body = await response.text()
      throw new Error(`Auth user lookup failed: HTTP ${response.status} ${body.slice(0, 120)}`)
    }
    const payload = await response.json()
    const users = Array.isArray(payload?.users) ? payload.users : []
    const found = users.find((user) => normalizeEmail(user?.email) === email)
    if (found?.id) return found
    if (users.length < perPage) return null
    page += 1
  }
}

async function createOrResetAuthUser({ config, service, email, password, metadata }) {
  const existing = await findAuthUserByEmail(config, email)
  if (existing?.id) {
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) throw error
    return { userId: existing.id, created: false }
  }

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error) throw error
  const userId = data?.user?.id
  if (!userId) throw new Error('Auth user creation returned no user id.')
  return { userId, created: true }
}

async function upsertProfile(service, { userId, email, fullName, role }) {
  const [firstName, ...lastParts] = fullName.split(/\s+/)
  const { error } = await service
    .from('profiles')
    .upsert({
      id: userId,
      email,
      full_name: fullName,
      first_name: firstName || fullName,
      last_name: lastParts.join(' '),
      role,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (error) throw error
}

async function getTargetOrganisation(service) {
  const { data, error } = await service
    .from('organisations')
    .select('id, name')
    .ilike('name', TARGET_ORGANISATION_NAME)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error(`${TARGET_ORGANISATION_NAME} organisation was not found.`)
  return data
}

async function upsertActorMembership(service, { organisationId, userId, email }) {
  const now = new Date().toISOString()
  const { error } = await service
    .from('organisation_users')
    .upsert({
      organisation_id: organisationId,
      user_id: userId,
      first_name: 'Runtime',
      last_name: 'Probe',
      email,
      role: 'agent',
      status: 'active',
      accepted_at: now,
      joined_at: now,
      last_active_at: now,
      app_role: 'agent',
      workspace_type: 'agency',
      workspace_role: 'agent',
      organisation_role: 'agent',
      organization_role: 'agent',
      branch_scope: 'own',
      scope_level: 'organisation',
      membership_status: 'active',
      permissions_json: {},
      scope_metadata: {},
      module_metadata: { source: 'repair-agency-runtime-probe-fixtures' },
      is_demo_data: true,
      updated_at: now,
    }, { onConflict: 'organisation_id,email' })
  if (error) throw error
}

async function removeExternalMemberships(service, { userId, email }) {
  const existing = await service
    .from('organisation_users')
    .select('id')
    .or(`user_id.eq.${userId},email.eq.${email}`)
  if (existing.error) throw existing.error
  const ids = (existing.data || []).map((row) => row.id).filter(Boolean)
  if (!ids.length) return
  const { error } = await service
    .from('organisation_users')
    .update({
      user_id: null,
      status: 'removed',
      membership_status: 'removed',
      removed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (error) throw error
}

async function verifySignIn(config, email, password) {
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return Boolean(data?.session?.access_token)
}

const env = loadEnv()
const config = requireConfig(env)
const service = createServiceClient(config)

try {
  const organisation = await getTargetOrganisation(service)
  const actor = await createOrResetAuthUser({
    config,
    service,
    email: config.actorEmail,
    password: config.actorPassword,
    metadata: {
      fixture_namespace: 'agency_runtime_readiness',
      fixture_role: 'agency_member_probe',
      source: 'repair-agency-runtime-probe-fixtures',
    },
  })
  await upsertProfile(service, {
    userId: actor.userId,
    email: config.actorEmail,
    fullName: 'Runtime Probe',
    role: 'agent',
  })
  await upsertActorMembership(service, {
    organisationId: organisation.id,
    userId: actor.userId,
    email: config.actorEmail,
  })

  const external = await createOrResetAuthUser({
    config,
    service,
    email: config.externalEmail,
    password: config.externalPassword,
    metadata: {
      fixture_namespace: 'agency_runtime_readiness',
      fixture_role: 'unrelated_isolation_probe',
      source: 'repair-agency-runtime-probe-fixtures',
    },
  })
  await upsertProfile(service, {
    userId: external.userId,
    email: config.externalEmail,
    fullName: 'Runtime Isolation Probe',
    role: 'viewer',
  })
  await removeExternalMemberships(service, {
    userId: external.userId,
    email: config.externalEmail,
  })

  const actorSignIn = await verifySignIn(config, config.actorEmail, config.actorPassword)
  const externalSignIn = await verifySignIn(config, config.externalEmail, config.externalPassword)
  const membership = await service
    .from('organisation_users')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', actor.userId)
    .eq('organisation_id', organisation.id)
    .eq('status', 'active')
  if (membership.error) throw membership.error
  const externalMembership = await service
    .from('organisation_users')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', external.userId)
    .neq('status', 'removed')
  if (externalMembership.error) throw externalMembership.error

  console.log(JSON.stringify({
    status: 'RUNTIME_PROBE_FIXTURES_READY',
    projectRef: config.projectRef,
    organisation: TARGET_ORGANISATION_NAME,
    actor: {
      created: actor.created,
      signInVerified: actorSignIn,
      activeMemberships: membership.count || 0,
    },
    external: {
      created: external.created,
      signInVerified: externalSignIn,
      activeMemberships: externalMembership.count || 0,
    },
  }, null, 2))
} finally {
  // No persistent local resources to close.
}
