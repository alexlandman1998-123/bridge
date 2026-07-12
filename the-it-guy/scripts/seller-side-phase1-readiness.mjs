#!/usr/bin/env node
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = new URL('../', import.meta.url)
const PROJECT_ROOT_PATH = fileURLToPath(PROJECT_ROOT)
const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const DEFAULT_ATTORNEY_EMAIL = 'qa.attorney+canonical@bridgenine.co.za'
const DEFAULT_ATTORNEY_FIRM_NAME = 'Canonical QA Attorney Firm'
const DEFAULT_ATTORNEY_ROLE = 'transfer_attorney'
const DEFAULT_DEPARTMENT_TYPE = 'transfer'
const DEFAULT_DEPARTMENT_NAME = 'Transfer Department'
const WRITE_ENV_FLAG = 'SELLER_SIDE_PHASE1_STAGING_FIXTURE_WRITE'
const FIXTURE_SOURCE = 'seller_side_transaction_phase1_readiness'

const VALID_ATTORNEY_ROLES = new Set([
  'firm_admin',
  'director_partner',
  'transfer_attorney',
  'bond_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
])

const VALID_DEPARTMENT_TYPES = new Set(['transfer', 'bond', 'admin', 'management'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function cleanEnvValue(value = '') {
  return normalizeText(value).replace(/^["']|["']$/g, '').replace(/\\n$/g, '')
}

function envPath(name) {
  return new URL(name, PROJECT_ROOT)
}

function parseEnvFile(fileName) {
  const filePath = envPath(fileName)
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
        return [line.slice(0, separator), cleanEnvValue(line.slice(separator + 1))]
      }),
  )
}

function loadEnv() {
  const files = {
    example: parseEnvFile('.env.example'),
    base: parseEnvFile('.env'),
    staging: parseEnvFile('.env.staging.local'),
    production: parseEnvFile('.env.production.local'),
  }
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizeText(value)),
  )
  const stagingRuntime = { ...files.base, ...files.staging, ...processOverrides }
  const productionRuntime = { ...files.base, ...files.production, ...processOverrides }
  const merged = { ...stagingRuntime }

  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return { files, stagingRuntime, productionRuntime, merged }
}

function parseArgs(argv) {
  const options = {
    write: false,
    confirmStaging: false,
    checkVercelEnv: true,
  }

  for (const arg of argv) {
    if (arg === '--write') options.write = true
    else if (arg === '--confirm-staging') options.confirmStaging = true
    else if (arg === '--skip-vercel-env') options.checkVercelEnv = false
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function createReport(options, config = {}) {
  return {
    phase: '1',
    scope: 'seller-side-transaction-launch',
    generatedAt: new Date().toISOString(),
    mode: options.write ? 'write' : 'dry_run',
    targetProjectRef: STAGING_PROJECT_REF,
    fixtureSource: FIXTURE_SOURCE,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO until Phase 1 blockers are cleared',
      passCount: 0,
      warningCount: 0,
      blockedCount: 0,
      criticalCount: 0,
      mutatedData: false,
    },
    fixture: {
      email: config.email || null,
      userId: null,
      profileId: null,
      firmId: null,
      departmentId: null,
      membershipId: null,
      created: [],
      updated: [],
    },
    findings: [],
    envReadiness: [],
    routeGate: {
      authenticatedSignIn: false,
      attorneyValidationReady: false,
      setupRecoveryRedirectExpected: true,
    },
    controlledWriteCommand: `${WRITE_ENV_FLAG}=true npm run setup:seller-side-phase1-staging-fixture`,
  }
}

function addFinding(report, phase, status, title, detail = '', metadata = {}) {
  const finding = {
    phase,
    status,
    title,
    detail,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  }
  report.findings.push(finding)
  if (phase === 'Environment') report.envReadiness.push(finding)
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'WARN') report.summary.warningCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'CRITICAL') report.summary.criticalCount += 1
  return finding
}

function finalizeReport(report) {
  if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'NO-GO until critical Phase 1 issues are fixed'
  } else if (report.summary.blockedCount > 0) {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until Phase 1 blockers are cleared'
  } else if (report.summary.warningCount > 0) {
    report.summary.status = 'READY_WITH_WARNINGS'
    report.summary.recommendation = 'Phase 1 fixture is ready; review warnings before launch'
  } else {
    report.summary.status = 'READY'
    report.summary.recommendation = 'Phase 1 fixture and env readiness passed'
  }
  return report
}

function requireConfig(env, report) {
  const config = {
    supabaseUrl: normalizeText(env.merged.SUPABASE_URL || env.merged.VITE_SUPABASE_URL),
    serviceRoleKey: normalizeText(env.merged.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeText(env.merged.VITE_SUPABASE_ANON_KEY || env.merged.VITE_SUPABASE_KEY || env.merged.SUPABASE_ANON_KEY),
    email: normalizeEmail(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_EMAIL || env.merged.STAGING_INTERNAL_EMAIL || DEFAULT_ATTORNEY_EMAIL),
    password: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_PASSWORD || env.merged.STAGING_INTERNAL_PASSWORD),
    firmName: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_FIRM_NAME) || DEFAULT_ATTORNEY_FIRM_NAME,
    firmId: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_FIRM_ID),
    attorneyRole: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_ROLE) || DEFAULT_ATTORNEY_ROLE,
    departmentType: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_DEPARTMENT_TYPE) || DEFAULT_DEPARTMENT_TYPE,
    departmentName: normalizeText(env.merged.SELLER_SIDE_PHASE1_ATTORNEY_DEPARTMENT_NAME) || DEFAULT_DEPARTMENT_NAME,
  }
  config.projectRef = projectRefFromUrl(config.supabaseUrl)
  report.fixture.email = config.email

  const missing = []
  if (!config.supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!config.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!config.anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')
  if (!config.email) missing.push('SELLER_SIDE_PHASE1_ATTORNEY_EMAIL/STAGING_INTERNAL_EMAIL')
  if (!config.password) missing.push('SELLER_SIDE_PHASE1_ATTORNEY_PASSWORD/STAGING_INTERNAL_PASSWORD')

  if (missing.length) {
    addFinding(report, 'Environment', 'BLOCKED', 'Missing Phase 1 staging configuration.', missing.join(', '))
  } else {
    addFinding(report, 'Environment', 'PASS', 'Phase 1 staging credentials are configured.')
  }

  if (!config.projectRef) {
    addFinding(report, 'Environment', 'BLOCKED', 'Could not resolve Supabase project ref from the configured URL.')
  } else if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(
      report,
      'Environment',
      'CRITICAL',
      'Refusing to run against a non-staging Supabase project.',
      `Expected ${STAGING_PROJECT_REF}; resolved ${config.projectRef}.`,
    )
  } else {
    addFinding(report, 'Environment', 'PASS', 'Supabase URL points at the approved staging project.')
  }

  if (!VALID_ATTORNEY_ROLES.has(config.attorneyRole)) {
    addFinding(report, 'Environment', 'CRITICAL', 'Configured attorney fixture role is invalid.', config.attorneyRole)
  }

  if (!VALID_DEPARTMENT_TYPES.has(config.departmentType)) {
    addFinding(report, 'Environment', 'CRITICAL', 'Configured attorney department type is invalid.', config.departmentType)
  }

  return config
}

function hasKey(envMap, key) {
  return Object.prototype.hasOwnProperty.call(envMap, key)
}

function hasValue(envMap, key) {
  return normalizeText(envMap[key]).length > 0
}

function loadVercelEnvRegistry(report, options) {
  if (!options.checkVercelEnv) {
    addFinding(report, 'Environment', 'WARN', 'Vercel env registry check was skipped.')
    return null
  }

  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(npxBin, ['vercel', 'env', 'ls'], {
    cwd: PROJECT_ROOT_PATH,
    encoding: 'utf8',
    env: process.env,
  })

  if (result.error || result.status !== 0) {
    addFinding(
      report,
      'Environment',
      'WARN',
      'Could not inspect Vercel env registry.',
      result.error?.message || result.stderr || 'vercel env ls failed.',
    )
    return null
  }

  const registry = new Map()
  for (const line of String(result.stdout || '').split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('Vercel CLI') || trimmed.startsWith('Retrieving project') || trimmed.startsWith('>') || trimmed.startsWith('name ')) {
      continue
    }
    const name = trimmed.split(/\s+/)[0]
    if (!name || !/^[A-Z0-9_]+$/.test(name)) continue
    registry.set(name, {
      preview: /\bPreview\b/.test(trimmed),
      production: /\bProduction\b/.test(trimmed),
      development: /\bDevelopment\b/.test(trimmed),
      raw: trimmed,
    })
  }

  addFinding(report, 'Environment', 'PASS', 'Vercel env registry was inspected.')
  return registry
}

function vercelHas(registry, key, environment) {
  const entry = registry?.get(key)
  if (!entry) return false
  return Boolean(entry[environment])
}

function evaluateDeployEnvValue({ envMap, registry, key, deployEnvironment }) {
  if (hasValue(envMap, key)) return { ok: true, source: 'runtime_env_file' }
  if (vercelHas(registry, key, deployEnvironment)) return { ok: true, source: `vercel_${deployEnvironment}` }
  return { ok: false, source: '' }
}

function evaluateLaunchEnvReadiness(env, report, vercelRegistry = null) {
  if (hasKey(env.files.example, 'VITE_DOCUMENT_TITLE')) {
    addFinding(report, 'Environment', 'PASS', '.env.example declares VITE_DOCUMENT_TITLE.')
  } else {
    addFinding(report, 'Environment', 'WARN', '.env.example should declare VITE_DOCUMENT_TITLE.')
  }

  if (hasKey(env.files.example, 'VITE_GOOGLE_MAPS_API_KEY')) {
    addFinding(report, 'Environment', 'PASS', '.env.example declares VITE_GOOGLE_MAPS_API_KEY.')
  } else {
    addFinding(report, 'Environment', 'WARN', '.env.example should declare VITE_GOOGLE_MAPS_API_KEY.')
  }

  const stagingTitle = evaluateDeployEnvValue({
    envMap: env.stagingRuntime,
    registry: vercelRegistry,
    key: 'VITE_DOCUMENT_TITLE',
    deployEnvironment: 'preview',
  })
  if (stagingTitle.ok) {
    addFinding(report, 'Environment', 'PASS', 'Staging runtime has VITE_DOCUMENT_TITLE configured.', stagingTitle.source)
  } else {
    addFinding(report, 'Environment', 'BLOCKED', 'Staging runtime is missing VITE_DOCUMENT_TITLE.')
  }

  const productionTitle = evaluateDeployEnvValue({
    envMap: env.productionRuntime,
    registry: vercelRegistry,
    key: 'VITE_DOCUMENT_TITLE',
    deployEnvironment: 'production',
  })
  if (productionTitle.ok) {
    addFinding(report, 'Environment', 'PASS', 'Production runtime has VITE_DOCUMENT_TITLE configured.', productionTitle.source)
  } else {
    addFinding(report, 'Environment', 'BLOCKED', 'Production runtime is missing VITE_DOCUMENT_TITLE.')
  }

  const stagingMaps = evaluateDeployEnvValue({
    envMap: env.stagingRuntime,
    registry: vercelRegistry,
    key: 'VITE_GOOGLE_MAPS_API_KEY',
    deployEnvironment: 'preview',
  })
  if (stagingMaps.ok) {
    addFinding(report, 'Environment', 'PASS', 'Staging runtime has VITE_GOOGLE_MAPS_API_KEY configured.', stagingMaps.source)
  } else {
    addFinding(report, 'Environment', 'BLOCKED', 'Staging runtime is missing VITE_GOOGLE_MAPS_API_KEY.')
  }

  const productionMaps = evaluateDeployEnvValue({
    envMap: env.productionRuntime,
    registry: vercelRegistry,
    key: 'VITE_GOOGLE_MAPS_API_KEY',
    deployEnvironment: 'production',
  })
  if (productionMaps.ok) {
    addFinding(report, 'Environment', 'PASS', 'Production runtime has VITE_GOOGLE_MAPS_API_KEY configured.', productionMaps.source)
  } else {
    addFinding(report, 'Environment', 'BLOCKED', 'Production runtime is missing VITE_GOOGLE_MAPS_API_KEY.')
  }
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

function createAnonClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function getOpenApiColumns(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`Unable to read Supabase OpenAPI schema: HTTP ${response.status}`)
  const spec = await response.json()
  const cache = new Map()
  return (table) => {
    if (cache.has(table)) return cache.get(table)
    const properties = spec?.components?.schemas?.[table]?.properties || spec?.definitions?.[table]?.properties || null
    const columns = properties ? new Set(Object.keys(properties)) : new Set()
    cache.set(table, columns)
    return columns
  }
}

function pickColumns(columns, payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function queryRequired(label, query) {
  const { data, error } = await query
  if (error) {
    const wrapped = new Error(`${label}: ${error.message}`)
    wrapped.code = error.code
    wrapped.details = error.details
    wrapped.hint = error.hint
    throw wrapped
  }
  return data
}

async function findAuthUser(service, email) {
  let page = 1
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = (data?.users || []).find((user) => normalizeEmail(user.email) === email)
    if (found?.id) return found
    if ((data?.users || []).length < 200) break
    page += 1
  }
  return null
}

async function findProfileByEmail(service, email) {
  const rows = await queryRequired(
    'profile email lookup',
    service
      .from('profiles')
      .select('*')
      .eq('email', email)
      .order('updated_at', { ascending: false })
      .limit(1),
  )
  return rows?.[0] || null
}

async function ensureAuthUser(service, config, report, options) {
  const profile = await findProfileByEmail(service, config.email)
  if (profile?.id) {
    report.fixture.userId = profile.id
    addFinding(report, 'Fixture', 'PASS', 'Staging attorney profile resolves the auth user id.')
    return { id: profile.id, email: config.email, source: 'profile_lookup' }
  }

  let existing = null
  try {
    existing = await findAuthUser(service, config.email)
  } catch (error) {
    addFinding(
      report,
      'Fixture',
      'WARN',
      'Auth admin user listing failed; falling back to profile lookup.',
      error.message,
    )
  }
  if (existing?.id) {
    report.fixture.userId = existing.id
    addFinding(report, 'Fixture', 'PASS', 'Staging attorney auth user exists.')
    return existing
  }

  if (!options.write) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Staging attorney auth user is missing.', 'Run the controlled write command to create it.')
    return null
  }

  const { data, error } = await service.auth.admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    user_metadata: {
      fixture_source: FIXTURE_SOURCE,
      fixture_role: 'seller_side_phase1_attorney',
      updated_at: new Date().toISOString(),
    },
  })
  if (error) throw error
  const user = data?.user || null
  report.fixture.userId = user?.id || null
  report.fixture.created.push('auth_user')
  report.summary.mutatedData = true
  addFinding(report, 'Fixture', 'PASS', 'Created staging attorney auth user.')
  return user
}

async function loadProfile(service, userId) {
  return queryRequired(
    'profile lookup',
    service.from('profiles').select('*').eq('id', userId).maybeSingle(),
  )
}

async function ensureProfile(service, columnsFor, config, report, options, { userId, firmId = null } = {}) {
  const columns = columnsFor('profiles')
  const existing = await loadProfile(service, userId)
  const now = new Date().toISOString()
  const basePayload = pickColumns(columns, {
    id: userId,
    email: config.email,
    full_name: 'Canonical QA Attorney',
    first_name: 'Canonical',
    last_name: 'Attorney',
    role: 'attorney',
    onboarding_completed: true,
    primary_attorney_firm_id: firmId || existing?.primary_attorney_firm_id || null,
    attorney_role: config.attorneyRole,
    updated_at: now,
  })

  if (!existing?.id) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Attorney profile row is missing.', 'Run the controlled write command to create it.')
      return null
    }
    const insertPayload = pickColumns(columns, { ...basePayload, created_at: now })
    const inserted = await queryRequired(
      'profile insert',
      service.from('profiles').insert(insertPayload).select('*').single(),
    )
    report.fixture.profileId = inserted.id
    report.fixture.created.push('profile')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Created attorney profile row.')
    return inserted
  }

  report.fixture.profileId = existing.id
  const needsUpdate =
    existing.email !== config.email ||
    existing.role !== 'attorney' ||
    existing.onboarding_completed !== true ||
    normalizeText(existing.primary_attorney_firm_id) !== normalizeText(basePayload.primary_attorney_firm_id) ||
    normalizeText(existing.attorney_role) !== config.attorneyRole

  if (!needsUpdate) {
    addFinding(report, 'Fixture', 'PASS', 'Attorney profile is launch-ready.')
    return existing
  }

  if (!options.write) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Attorney profile needs launch fixture updates.', 'Run the controlled write command.')
    return existing
  }

  const updated = await queryRequired(
    'profile update',
    service.from('profiles').update(basePayload).eq('id', existing.id).select('*').single(),
  )
  report.fixture.updated.push('profile')
  report.summary.mutatedData = true
  addFinding(report, 'Fixture', 'PASS', 'Updated attorney profile launch fields.')
  return updated
}

async function loadMemberRows(service, userId) {
  return queryRequired(
    'attorney member lookup',
    service
      .from('attorney_firm_members')
      .select('*, attorney_firms:firm_id(*)')
      .eq('user_id', userId)
      .limit(20),
  )
}

async function getFirmById(service, firmId) {
  if (!firmId) return null
  return queryRequired(
    'attorney firm lookup',
    service.from('attorney_firms').select('*').eq('id', firmId).maybeSingle(),
  )
}

async function getFirmByName(service, name) {
  if (!name) return null
  return queryRequired(
    'attorney firm name lookup',
    service.from('attorney_firms').select('*').eq('name', name).limit(1).maybeSingle(),
  )
}

async function ensureFirm(service, columnsFor, config, report, options, { profile = null, memberRows = [], userId } = {}) {
  const selectedFirmId =
    config.firmId ||
    normalizeText(profile?.primary_attorney_firm_id) ||
    normalizeText(memberRows.find((row) => row.status === 'active' && row.attorney_firms?.id)?.firm_id) ||
    normalizeText(memberRows.find((row) => row.attorney_firms?.id)?.firm_id)

  let firm = await getFirmById(service, selectedFirmId)
  if (!firm) firm = await getFirmByName(service, config.firmName)

  if (!firm?.id) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Attorney firm workspace is missing.', 'Run the controlled write command to create it.')
      return null
    }

    const columns = columnsFor('attorney_firms')
    const inserted = await queryRequired(
      'attorney firm insert',
      service
        .from('attorney_firms')
        .insert(
          pickColumns(columns, {
            name: config.firmName,
            email: config.email,
            country: 'South Africa',
            created_by: userId,
            is_active: true,
          }),
        )
        .select('*')
        .single(),
    )
    report.fixture.firmId = inserted.id
    report.fixture.created.push('attorney_firm')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Created attorney firm workspace fixture.')
    return inserted
  }

  report.fixture.firmId = firm.id
  if (firm.is_active === false) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Attorney firm workspace is inactive.', 'Run the controlled write command to reactivate it.')
      return firm
    }
    const updated = await queryRequired(
      'attorney firm activate',
      service.from('attorney_firms').update({ is_active: true }).eq('id', firm.id).select('*').single(),
    )
    report.fixture.updated.push('attorney_firm')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Reactivated attorney firm workspace fixture.')
    return updated
  }

  addFinding(report, 'Fixture', 'PASS', 'Attorney firm workspace exists and is active.')
  return firm
}

async function ensureDepartment(service, columnsFor, config, report, options, firm) {
  if (!firm?.id) return null
  const existing = await queryRequired(
    'attorney department lookup',
    service
      .from('attorney_firm_departments')
      .select('*')
      .eq('firm_id', firm.id)
      .eq('department_type', config.departmentType)
      .limit(1)
      .maybeSingle(),
  )

  if (!existing?.id) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Attorney firm active department is missing.', 'Run the controlled write command to create it.')
      return null
    }
    const columns = columnsFor('attorney_firm_departments')
    const inserted = await queryRequired(
      'attorney department insert',
      service
        .from('attorney_firm_departments')
        .insert(
          pickColumns(columns, {
            firm_id: firm.id,
            name: config.departmentName,
            department_type: config.departmentType,
            is_active: true,
          }),
        )
        .select('*')
        .single(),
    )
    report.fixture.departmentId = inserted.id
    report.fixture.created.push('attorney_firm_department')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Created attorney firm department fixture.')
    return inserted
  }

  report.fixture.departmentId = existing.id
  if (existing.is_active === false || normalizeText(existing.name) !== config.departmentName) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Attorney firm department needs fixture updates.', 'Run the controlled write command.')
      return existing
    }
    const updated = await queryRequired(
      'attorney department update',
      service
        .from('attorney_firm_departments')
        .update({ name: config.departmentName, is_active: true })
        .eq('id', existing.id)
        .select('*')
        .single(),
    )
    report.fixture.updated.push('attorney_firm_department')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Updated attorney firm department fixture.')
    return updated
  }

  addFinding(report, 'Fixture', 'PASS', 'Attorney firm department exists and is active.')
  return existing
}

async function ensureMembership(service, columnsFor, config, report, options, { userId, firm, department }) {
  if (!userId || !firm?.id) return null
  const existing = await queryRequired(
    'attorney membership lookup',
    service
      .from('attorney_firm_members')
      .select('*')
      .eq('firm_id', firm.id)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  )

  const payload = {
    firm_id: firm.id,
    user_id: userId,
    department_id: department?.id || null,
    role: config.attorneyRole,
    status: 'active',
    joined_at: new Date().toISOString(),
  }

  if (!existing?.id) {
    if (!options.write) {
      addFinding(report, 'Fixture', 'BLOCKED', 'Active attorney firm membership is missing.', 'Run the controlled write command to create it.')
      return null
    }
    const columns = columnsFor('attorney_firm_members')
    const inserted = await queryRequired(
      'attorney membership insert',
      service.from('attorney_firm_members').insert(pickColumns(columns, payload)).select('*').single(),
    )
    report.fixture.membershipId = inserted.id
    report.fixture.created.push('attorney_firm_member')
    report.summary.mutatedData = true
    addFinding(report, 'Fixture', 'PASS', 'Created active attorney firm membership fixture.')
    return inserted
  }

  report.fixture.membershipId = existing.id
  const needsUpdate =
    existing.status !== 'active' ||
    existing.role !== config.attorneyRole ||
    normalizeText(existing.department_id) !== normalizeText(payload.department_id)

  if (!needsUpdate) {
    addFinding(report, 'Fixture', 'PASS', 'Active attorney firm membership is launch-ready.')
    return existing
  }

  if (!options.write) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Attorney firm membership needs launch fixture updates.', 'Run the controlled write command.')
    return existing
  }

  const updated = await queryRequired(
    'attorney membership update',
    service.from('attorney_firm_members').update(payload).eq('id', existing.id).select('*').single(),
  )
  report.fixture.updated.push('attorney_firm_member')
  report.summary.mutatedData = true
  addFinding(report, 'Fixture', 'PASS', 'Updated attorney firm membership fixture.')
  return updated
}

async function verifyAuthenticatedRouteGate(config, service, report, options, userId) {
  if (!userId) return
  const anon = createAnonClient(config)
  let login = await anon.auth.signInWithPassword({ email: config.email, password: config.password })

  if (login.error && options.write) {
    const update = await service.auth.admin.updateUserById(userId, {
      password: config.password,
      email_confirm: true,
      user_metadata: {
        fixture_source: FIXTURE_SOURCE,
        fixture_role: 'seller_side_phase1_attorney',
        updated_at: new Date().toISOString(),
      },
    })
    if (update.error) throw update.error
    report.fixture.updated.push('auth_user_password')
    report.summary.mutatedData = true
    login = await anon.auth.signInWithPassword({ email: config.email, password: config.password })
  }

  if (login.error || !login.data?.user?.id) {
    addFinding(report, 'Route Gate', 'BLOCKED', 'Authenticated QA login failed.', login.error?.message || 'No user returned.')
    return
  }

  report.routeGate.authenticatedSignIn = true
  addFinding(report, 'Route Gate', 'PASS', 'Authenticated QA login succeeds.')

  const profile = await queryRequired(
    'authenticated profile lookup',
    anon
      .from('profiles')
      .select('id, email, role, onboarding_completed, primary_attorney_firm_id, attorney_role')
      .eq('id', login.data.user.id)
      .maybeSingle(),
  )

  const memberships = await queryRequired(
    'authenticated attorney membership lookup',
    anon
      .from('attorney_firm_members')
      .select('id, firm_id, user_id, department_id, role, status, attorney_firms:firm_id(id, name, is_active)')
      .eq('user_id', login.data.user.id)
      .eq('status', 'active')
      .limit(10),
  )

  const membership = (memberships || []).find((row) => row.attorney_firms?.is_active !== false) || memberships?.[0] || null
  let department = null
  if (membership?.firm_id) {
    department = await queryRequired(
      'authenticated department lookup',
      anon
        .from('attorney_firm_departments')
        .select('id, firm_id, department_type, is_active')
        .eq('firm_id', membership.firm_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    )
  }

  const ready =
    profile?.role === 'attorney' &&
    profile?.onboarding_completed === true &&
    Boolean(membership?.id) &&
    membership?.attorney_firms?.is_active !== false &&
    Boolean(department?.id)

  if (ready) {
    report.routeGate.attorneyValidationReady = true
    report.routeGate.setupRecoveryRedirectExpected = false
    addFinding(report, 'Route Gate', 'PASS', 'Authenticated attorney validation prerequisites are ready.')
  } else {
    addFinding(
      report,
      'Route Gate',
      'BLOCKED',
      'Authenticated attorney validation prerequisites are incomplete.',
      'The app may still redirect this user to /setup/recovery.',
      {
        profileRole: profile?.role || null,
        onboardingCompleted: profile?.onboarding_completed === true,
        activeMembership: Boolean(membership?.id),
        activeFirm: membership?.attorney_firms?.is_active !== false,
        activeDepartment: Boolean(department?.id),
      },
    )
  }

  await anon.auth.signOut().catch(() => {})
}

async function runPhase1(options = parseArgs(process.argv.slice(2))) {
  if (options.write && (!options.confirmStaging || process.env[WRITE_ENV_FLAG] !== 'true')) {
    throw new Error(`Write mode requires --confirm-staging and ${WRITE_ENV_FLAG}=true.`)
  }

  const env = loadEnv()
  const report = createReport(options)
  const config = requireConfig(env, report)
  const vercelRegistry = loadVercelEnvRegistry(report, options)
  evaluateLaunchEnvReadiness(env, report, vercelRegistry)

  if (
    !config.supabaseUrl ||
    !config.serviceRoleKey ||
    !config.anonKey ||
    !config.email ||
    !config.password ||
    !config.projectRef ||
    config.projectRef !== STAGING_PROJECT_REF
  ) {
    return finalizeReport(report)
  }

  const service = createServiceClient(config)
  let columnsFor
  try {
    columnsFor = await getOpenApiColumns(config)
  } catch (error) {
    addFinding(report, 'Fixture', 'BLOCKED', 'Could not load staging schema metadata.', error.message)
    return finalizeReport(report)
  }

  const authUser = await ensureAuthUser(service, config, report, options)
  if (!authUser?.id) return finalizeReport(report)

  let profile = await ensureProfile(service, columnsFor, config, report, options, { userId: authUser.id })
  let memberRows = await loadMemberRows(service, authUser.id)
  const firm = await ensureFirm(service, columnsFor, config, report, options, {
    profile,
    memberRows,
    userId: authUser.id,
  })
  const department = await ensureDepartment(service, columnsFor, config, report, options, firm)
  const membership = await ensureMembership(service, columnsFor, config, report, options, {
    userId: authUser.id,
    firm,
    department,
  })

  if (firm?.id) {
    profile = await ensureProfile(service, columnsFor, config, report, options, {
      userId: authUser.id,
      firmId: firm.id,
    })
  }

  report.fixture.userId = authUser.id
  report.fixture.profileId = profile?.id || report.fixture.profileId
  report.fixture.firmId = firm?.id || report.fixture.firmId
  report.fixture.departmentId = department?.id || report.fixture.departmentId
  report.fixture.membershipId = membership?.id || report.fixture.membershipId

  await verifyAuthenticatedRouteGate(config, service, report, options, authUser.id)

  return finalizeReport(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2))
  const report = await runPhase1(options)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (report.summary.criticalCount > 0 || report.summary.blockedCount > 0) {
    process.exitCode = 1
  }
}

export { runPhase1 }
