#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const RUN_ID = `enterprise-pentest-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
const WRITE_ENV_FLAG = 'ENTERPRISE_STAGING_PENTEST_WRITE'
const SUPPORT_ASSIGNMENTS_TABLE = 'agent_support_assignments'
const DOCUMENT_BUCKET_CANDIDATES = ['documents', 'private-documents', 'transaction-documents']

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

function normalizeText(value = '') {
  return String(value || '').trim()
}

function projectRefFromUrl(url = '') {
  return String(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
}

function loadEnv() {
  const localEnv = parseEnvFile('.env')
  const stagingEnv = parseEnvFile('.env.staging.local')
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeText(value)))
  const merged = { ...localEnv, ...stagingEnv, ...processOverrides }

  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.SUPABASE_ANON_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.SUPABASE_ANON_KEY

  return merged
}

function createReport() {
  return {
    runId: RUN_ID,
    targetProjectRef: STAGING_PROJECT_REF,
    mode: 'readiness',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    summary: {
      status: 'BLOCKED',
      recommendation: 'NO-GO',
      criticalCount: 0,
      warningCount: 0,
      passCount: 0,
      blockedCount: 0,
    },
    phases: [],
    fixtures: {},
  }
}

function addFinding(report, phase, status, title, detail = '') {
  const finding = { phase, status, title, detail }
  report.phases.push(finding)
  if (status === 'PASS') report.summary.passCount += 1
  if (status === 'WARN') report.summary.warningCount += 1
  if (status === 'BLOCKED') report.summary.blockedCount += 1
  if (status === 'FAIL' || status === 'CRITICAL') report.summary.criticalCount += 1
  return finding
}

function finalizeReport(report) {
  report.finishedAt = new Date().toISOString()
  if (report.summary.criticalCount === 0 && report.summary.blockedCount === 0) {
    report.summary.status = 'CERTIFIED'
    report.summary.recommendation = 'FULLY CERTIFIED FOR NATIONAL ROLLOUT'
  } else if (report.summary.criticalCount > 0) {
    report.summary.status = 'FAILED'
    report.summary.recommendation = 'NO-GO'
  } else {
    report.summary.status = 'BLOCKED'
    report.summary.recommendation = 'NO-GO until blocked live probes are completed'
  }
}

function requireConfig(env) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY)
  const projectRef = projectRefFromUrl(supabaseUrl)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY')
  if (projectRef && projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`Refusing to run outside staging project ${STAGING_PROJECT_REF}; resolved ${projectRef}.`)
  }
  return { supabaseUrl, serviceRoleKey, anonKey, projectRef, missing }
}

function createServiceClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

function createAnonClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function signIn(config, email, password) {
  const client = createAnonClient(config)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  if (!data?.session?.access_token) throw new Error(`No session returned for ${email}.`)
  return client
}

async function getOpenApiColumns(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`Unable to read staging OpenAPI schema: HTTP ${response.status}`)
  const spec = await response.json()
  const schemas = spec?.components?.schemas || spec?.definitions || {}
  const cache = new Map()
  return (table) => {
    if (cache.has(table)) return cache.get(table)
    const properties = schemas[table]?.properties || null
    const columns = properties ? new Set(Object.keys(properties)) : new Set()
    cache.set(table, columns)
    return columns
  }
}

function pickColumns(columns, payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function insertRow(service, table, getColumns, payload, label = table) {
  const insertPayload = pickColumns(getColumns(table), payload)
  const { data, error } = await service.from(table).insert(insertPayload).select('*').single()
  if (error) throw new Error(`${label} insert failed: ${error.message}`)
  return data
}

async function updateRows(service, table, patch, matcher, label = table) {
  let query = service.from(table).update(patch)
  for (const [column, value] of Object.entries(matcher)) query = query.eq(column, value)
  const { error } = await query
  if (error) throw new Error(`${label} update failed: ${error.message}`)
}

async function ensureAuthUser(service, getColumns, { email, password, fullName, profileRole = 'agent' }) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'enterprise_staging_pentest', run_id: RUN_ID },
  })
  if (error) {
    throw new Error(`Could not create auth user ${email}: ${error.message}`)
  }
  const userId = data?.user?.id
  if (!userId) throw new Error(`Could not resolve user id for ${email}.`)

  const profilePayload = pickColumns(getColumns('profiles'), {
    id: userId,
    email,
    full_name: fullName,
    first_name: fullName.split(' ')[0],
    last_name: fullName.split(' ').slice(1).join(' '),
    role: profileRole,
    onboarding_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  const { error: profileError } = await service.from('profiles').upsert(profilePayload, { onConflict: 'id' })
  if (profileError) throw new Error(`Could not upsert profile for ${email}: ${profileError.message}`)
  return userId
}

async function createMembership(service, getColumns, { organisationId, branchId = null, userId, email, role, firstName, lastName }) {
  const elevatedRoles = new Set(['owner', 'principal'])
  const branchRoles = new Set(['branch_manager'])
  const scopeLevel = elevatedRoles.has(role) ? 'organisation' : branchRoles.has(role) ? 'branch' : 'assigned'
  const branchScope = elevatedRoles.has(role) ? 'all_branches' : branchRoles.has(role) ? 'assigned_branch' : 'own'
  return insertRow(
    service,
    'organisation_users',
    getColumns,
    {
      organisation_id: organisationId,
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      workspace_role: role,
      organisation_role: role,
      app_role: role === 'agent' || role === 'assistant' ? 'agent' : 'developer',
      workspace_type: 'agency',
      status: 'active',
      accepted_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
      branch_id: branchId,
      primary_branch_id: branchId,
      workspace_unit_id: null,
      scope_level: scopeLevel,
      branch_scope: branchScope,
      is_primary_owner: role === 'owner',
      is_demo_data: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    `${role} membership`,
  )
}

async function createFixture(config, report, service, getColumns) {
  const password = `Bridge-${crypto.randomUUID()}-8x!`
  const emailFor = (name) => `${RUN_ID}-${name}@example.test`
  const users = {
    ownerA: { email: emailFor('owner-a'), fullName: 'Pentest Owner A', profileRole: 'developer' },
    principalA: { email: emailFor('principal-a'), fullName: 'Pentest Principal A', profileRole: 'developer' },
    managerA: { email: emailFor('manager-benoni'), fullName: 'Pentest Branch Manager A', profileRole: 'developer' },
    agentA: { email: emailFor('agent-a'), fullName: 'Pentest Agent A', profileRole: 'agent' },
    agentB: { email: emailFor('agent-b'), fullName: 'Pentest Agent B', profileRole: 'agent' },
    assistantA: { email: emailFor('assistant-a'), fullName: 'Pentest Assistant A', profileRole: 'agent' },
    principalB: { email: emailFor('principal-b'), fullName: 'Pentest Principal B', profileRole: 'developer' },
    external: { email: emailFor('external'), fullName: 'Pentest External User', profileRole: 'agent' },
  }

  for (const user of Object.values(users)) {
    user.password = password
    user.id = await ensureAuthUser(service, getColumns, { ...user, password })
  }

  const orgA = await insertRow(service, 'organisations', getColumns, {
    name: `${RUN_ID} Harcourts East Rand`,
    display_name: `${RUN_ID} Harcourts East Rand`,
    legal_name: `${RUN_ID} Harcourts East Rand`,
    type: 'agency',
    workspace_kind: 'agency',
    status: 'active',
    city: 'Benoni',
    country: 'South Africa',
    created_by: users.ownerA.id,
    is_demo_data: true,
    settings_json: { enterprisePentest: true, runId: RUN_ID, workspaceKind: 'agency' },
  })
  const orgB = await insertRow(service, 'organisations', getColumns, {
    name: `${RUN_ID} RE/MAX Sandton`,
    display_name: `${RUN_ID} RE/MAX Sandton`,
    legal_name: `${RUN_ID} RE/MAX Sandton`,
    type: 'agency',
    workspace_kind: 'agency',
    status: 'active',
    city: 'Sandton',
    country: 'South Africa',
    created_by: users.principalB.id,
    is_demo_data: true,
    settings_json: { enterprisePentest: true, runId: RUN_ID, workspaceKind: 'agency' },
  })
  const benoni = await insertRow(service, 'organisation_branches', getColumns, {
    organisation_id: orgA.id,
    name: `${RUN_ID} Benoni`,
    slug: `${RUN_ID}-benoni`,
    city: 'Benoni',
    province: 'Gauteng',
    status: 'active',
    is_active: true,
    is_demo_data: true,
    created_by: users.ownerA.id,
  })
  const boksburg = await insertRow(service, 'organisation_branches', getColumns, {
    organisation_id: orgA.id,
    name: `${RUN_ID} Boksburg`,
    slug: `${RUN_ID}-boksburg`,
    city: 'Boksburg',
    province: 'Gauteng',
    status: 'active',
    is_active: true,
    is_demo_data: true,
    created_by: users.ownerA.id,
  })
  const sandton = await insertRow(service, 'organisation_branches', getColumns, {
    organisation_id: orgB.id,
    name: `${RUN_ID} Sandton`,
    slug: `${RUN_ID}-sandton`,
    city: 'Sandton',
    province: 'Gauteng',
    status: 'active',
    is_active: true,
    is_demo_data: true,
    created_by: users.principalB.id,
  })

  await createMembership(service, getColumns, { organisationId: orgA.id, userId: users.ownerA.id, email: users.ownerA.email, role: 'owner', firstName: 'Pentest', lastName: 'Owner A' })
  await createMembership(service, getColumns, { organisationId: orgA.id, userId: users.principalA.id, email: users.principalA.email, role: 'principal', firstName: 'Pentest', lastName: 'Principal A' })
  const managerMembership = await createMembership(service, getColumns, { organisationId: orgA.id, branchId: benoni.id, userId: users.managerA.id, email: users.managerA.email, role: 'branch_manager', firstName: 'Pentest', lastName: 'Manager A' })
  const agentAMembership = await createMembership(service, getColumns, { organisationId: orgA.id, branchId: benoni.id, userId: users.agentA.id, email: users.agentA.email, role: 'agent', firstName: 'Pentest', lastName: 'Agent A' })
  await createMembership(service, getColumns, { organisationId: orgA.id, branchId: boksburg.id, userId: users.agentB.id, email: users.agentB.email, role: 'agent', firstName: 'Pentest', lastName: 'Agent B' })
  try {
    await createMembership(service, getColumns, { organisationId: orgA.id, branchId: benoni.id, userId: users.assistantA.id, email: users.assistantA.email, role: 'assistant', firstName: 'Pentest', lastName: 'Assistant A' })
  } catch (error) {
    addFinding(report, 'Assistant Restriction', 'CRITICAL', 'Staging does not accept assistant as an organisation user role.', error.message)
    await createMembership(service, getColumns, { organisationId: orgA.id, branchId: benoni.id, userId: users.assistantA.id, email: users.assistantA.email, role: 'agent', firstName: 'Pentest', lastName: 'Assistant Fallback' })
  }
  await createMembership(service, getColumns, { organisationId: orgB.id, branchId: sandton.id, userId: users.principalB.id, email: users.principalB.email, role: 'principal', firstName: 'Pentest', lastName: 'Principal B' })

  if (getColumns(SUPPORT_ASSIGNMENTS_TABLE).size > 0) {
    await insertRow(service, SUPPORT_ASSIGNMENTS_TABLE, getColumns, {
      organisation_id: orgA.id,
      branch_id: benoni.id,
      assistant_user_id: users.assistantA.id,
      supported_user_id: users.agentA.id,
      support_role: 'assistant',
      status: 'active',
      notification_enabled: true,
      created_by: users.principalA.id,
      metadata_json: { enterprisePentest: true, runId: RUN_ID },
    })
    addFinding(report, 'Assistant Restriction', 'PASS', 'Assistant support assignment table exists and fixture assignment was created.')
  } else {
    addFinding(report, 'Assistant Restriction', 'CRITICAL', 'agent_support_assignments table is missing on staging.', 'Sprint 7 support-role visibility cannot be validated or enforced on this staging database.')
  }

  const leadA = await insertRow(service, 'leads', getColumns, {
    organisation_id: orgA.id,
    assigned_agent_id: users.agentA.id,
    assigned_user_id: users.agentA.id,
    assigned_agent_email: users.agentA.email,
    branch_id: benoni.id,
    lead_category: 'seller',
    lead_direction: 'seller',
    lead_source: 'enterprise_pentest',
    stage: 'lead',
    current_stage: 'Contacted',
    status: 'active',
    priority: 'high',
    seller_property_address: `${RUN_ID} Former Agent Property`,
    estimated_value: 1234567,
    seller_onboarding_token: `${RUN_ID}-seller-token`,
    seller_onboarding_status: 'sent',
    created_by: users.agentA.id,
    is_demo_data: true,
    notes: `${RUN_ID} former-agent kill test lead`,
  }, 'former agent lead')
  const branchOtherLead = await insertRow(service, 'leads', getColumns, {
    organisation_id: orgA.id,
    assigned_agent_id: users.agentB.id,
    assigned_user_id: users.agentB.id,
    assigned_agent_email: users.agentB.email,
    branch_id: boksburg.id,
    lead_category: 'seller',
    lead_direction: 'seller',
    lead_source: 'enterprise_pentest',
    stage: 'lead',
    current_stage: 'Contacted',
    status: 'active',
    priority: 'medium',
    seller_property_address: `${RUN_ID} Other Branch Property`,
    estimated_value: 7654321,
    created_by: users.agentB.id,
    is_demo_data: true,
  }, 'other branch lead')
  const listingA = await insertRow(service, 'private_listings', getColumns, {
    organisation_id: orgA.id,
    assigned_agent_id: users.agentA.id,
    seller_lead_id: leadA.lead_id,
    originating_crm_lead_id: leadA.lead_id,
    listing_reference: `${RUN_ID}-listing-a`,
    listing_status: 'mandate_signed',
    listing_visibility: 'internal',
    property_type: 'house',
    listing_category: 'residential_sale',
    title: `${RUN_ID} Former Agent Listing`,
    description: 'Enterprise penetration fixture listing',
    asking_price: 1234567,
    estimated_value: 1234567,
    address_line_1: '1 Pentest Street',
    suburb: 'Benoni',
    city: 'Benoni',
    province: 'Gauteng',
    mandate_status: 'signed',
    seller_onboarding_status: 'completed',
    branch_id: benoni.id,
    created_by: users.agentA.id,
    is_active: true,
    is_demo_data: true,
  }, 'former agent listing')
  const transactionA = await insertRow(service, 'transactions', getColumns, {
    organisation_id: orgA.id,
    assigned_branch_id: benoni.id,
    owner_user_id: users.agentA.id,
    assigned_user_id: users.agentA.id,
    assigned_agent_id: users.agentA.id,
    assigned_agent_email: users.agentA.email,
    created_by: users.agentA.id,
    listing_id: listingA.id,
    originating_lead_id: leadA.lead_id,
    transaction_reference: `${RUN_ID}-tx-a`,
    title: `${RUN_ID} Former Agent Transaction`,
    transaction_type: 'sale',
    lifecycle_state: 'active',
    operational_state: 'on_track',
    stage: 'Available',
    current_main_stage: 'AVAIL',
    sales_price: 1234567,
    purchase_price: 1234567,
    is_active: true,
    is_demo_data: true,
  }, 'former agent transaction')
  const documentA = await insertRow(service, 'documents', getColumns, {
    transaction_id: transactionA.id,
    related_entity_type: 'transaction',
    related_entity_id: transactionA.id,
    name: `${RUN_ID} Rates Account`,
    file_name: `${RUN_ID}-rates.txt`,
    file_path: `enterprise-pentest/${RUN_ID}/rates.txt`,
    file_bucket: 'documents',
    category: 'rates_account',
    document_type: 'rates_account',
    visibility_scope: 'internal',
    uploaded_by_user_id: users.agentA.id,
    uploaded_by_role: 'agent',
    uploaded_by_email: users.agentA.email,
    status: 'uploaded',
    is_demo_data: true,
  }, 'former agent document metadata')
  const appointmentA = await insertRow(service, 'appointments', getColumns, {
    organisation_id: orgA.id,
    lead_id: leadA.lead_id,
    agent_id: users.agentA.id,
    appointment_type: 'valuation',
    title: `${RUN_ID} Former Agent Valuation`,
    appointment_date: '2026-06-20',
    start_time: '10:00',
    end_time: '11:00',
    date_time: '2026-06-20T08:00:00.000Z',
    location: 'Benoni',
    listing_id: listingA.id,
    transaction_id: transactionA.id,
    status: 'confirmed',
    created_by: users.agentA.id,
    is_demo_data: true,
  }, 'former agent appointment')

  const onboardingToken = `${RUN_ID}-seller-portal`
  const onboarding = await insertRow(service, 'private_listing_seller_onboarding', getColumns, {
    private_listing_id: listingA.id,
    token: onboardingToken,
    token_expires_at: '2026-12-31T23:59:59.000Z',
    form_data: { enterprisePentest: true, runId: RUN_ID },
    status: 'sent',
    seller_type: 'individual',
    is_demo_data: true,
  }, 'seller portal onboarding')

  await updateRows(service, 'leads', { assigned_agent_id: users.agentB.id, assigned_user_id: users.agentB.id, assigned_agent_email: users.agentB.email }, { lead_id: leadA.lead_id }, 'transfer lead')
  await updateRows(service, 'private_listings', { assigned_agent_id: users.agentB.id }, { id: listingA.id }, 'transfer listing')
  await updateRows(service, 'transactions', { owner_user_id: users.agentB.id, assigned_user_id: users.agentB.id, assigned_agent_id: users.agentB.id, assigned_agent_email: users.agentB.email }, { id: transactionA.id }, 'transfer transaction')
  await updateRows(service, 'appointments', { agent_id: users.agentB.id }, { appointment_id: appointmentA.appointment_id }, 'transfer appointment')
  await updateRows(service, 'organisation_users', { status: 'deactivated', updated_at: new Date().toISOString() }, { id: agentAMembership.id }, 'deactivate former agent membership')

  await createMembership(service, getColumns, { organisationId: orgB.id, branchId: sandton.id, userId: users.agentA.id, email: users.agentA.email, role: 'agent', firstName: 'Pentest', lastName: 'Agent A Moved' })
  const orgBLead = await insertRow(service, 'leads', getColumns, {
    organisation_id: orgB.id,
    assigned_agent_id: users.agentA.id,
    assigned_user_id: users.agentA.id,
    assigned_agent_email: users.agentA.email,
    branch_id: sandton.id,
    lead_category: 'seller',
    lead_direction: 'seller',
    lead_source: 'enterprise_pentest',
    stage: 'lead',
    current_stage: 'Contacted',
    status: 'active',
    seller_property_address: `${RUN_ID} New Agency Property`,
    estimated_value: 2222222,
    created_by: users.agentA.id,
    is_demo_data: true,
  }, 'new agency lead')

  const publicFixtures = {
    users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, email: user.email }])),
    orgA: orgA.id,
    orgB: orgB.id,
    branches: { benoni: benoni.id, boksburg: boksburg.id, sandton: sandton.id },
    memberships: { agentA: agentAMembership.id, managerA: managerMembership.id },
    records: {
      leadA: leadA.lead_id,
      branchOtherLead: branchOtherLead.lead_id,
      listingA: listingA.id,
      transactionA: transactionA.id,
      documentA: documentA.id,
      appointmentA: appointmentA.appointment_id,
      onboarding: onboarding.id,
      orgBLead: orgBLead.lead_id,
    },
    onboardingToken,
  }
  report.fixtures = publicFixtures
  return { ...publicFixtures, password }
}

async function queryOne(client, table, idColumn, id) {
  return client.from(table).select('*').eq(idColumn, id).limit(1)
}

function isDeniedOrEmpty(result) {
  if (result.error) return true
  return !Array.isArray(result.data) || result.data.length === 0
}

async function assertVisible(report, phase, title, client, table, idColumn, id) {
  const result = await queryOne(client, table, idColumn, id)
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
    addFinding(report, phase, 'CRITICAL', title, result.error?.message || 'Expected one visible row; got none.')
    return false
  }
  addFinding(report, phase, 'PASS', title)
  return true
}

async function assertDenied(report, phase, title, client, table, idColumn, id) {
  const result = await queryOne(client, table, idColumn, id)
  if (isDeniedOrEmpty(result)) {
    addFinding(report, phase, 'PASS', title, result.error ? `Denied by database: ${result.error.message}` : 'Returned zero rows.')
    return true
  }
  addFinding(report, phase, 'CRITICAL', title, `Unauthorized row was visible in ${table}.`)
  return false
}

async function testForbiddenUpdate(report, phase, title, client, service, table, idColumn, id, forbiddenPatch, restorePatch) {
  const result = await client.from(table).update(forbiddenPatch).eq(idColumn, id).select('*')
  if (result.error || !Array.isArray(result.data) || result.data.length === 0) {
    addFinding(report, phase, 'PASS', title, result.error ? `Denied by database: ${result.error.message}` : 'Update returned zero rows.')
    return true
  }
  await updateRows(service, table, restorePatch, { [idColumn]: id }, `restore ${table}`)
  addFinding(report, phase, 'CRITICAL', title, `Forbidden update succeeded on ${table}; restored the fixture row with service role.`)
  return false
}

async function runStorageProbe(config, report, service, formerAgentClient, externalClient) {
  const { data: buckets, error: bucketError } = await service.storage.listBuckets()
  if (bucketError) {
    addFinding(report, 'Document Security', 'BLOCKED', 'Could not list staging storage buckets.', bucketError.message)
    return
  }
  const bucket = DOCUMENT_BUCKET_CANDIDATES.find((candidate) => (buckets || []).some((item) => item.name === candidate))
  if (!bucket) {
    addFinding(report, 'Document Security', 'BLOCKED', 'No known document storage bucket found.', `Available buckets: ${(buckets || []).map((item) => item.name).join(', ') || 'none'}`)
    return
  }

  const path = `enterprise-pentest/${RUN_ID}/rls-direct-download.txt`
  const body = new Blob([`Bridge enterprise penetration fixture ${RUN_ID}\n`], { type: 'text/plain' })
  const upload = await service.storage.from(bucket).upload(path, body, { upsert: true, contentType: 'text/plain' })
  if (upload.error) {
    addFinding(report, 'Document Security', 'BLOCKED', `Could not upload storage fixture to ${bucket}.`, upload.error.message)
    return
  }

  const formerDownload = await formerAgentClient.storage.from(bucket).download(path)
  if (formerDownload.error) {
    addFinding(report, 'Document Security', 'PASS', 'Former agent cannot directly download storage object.', formerDownload.error.message)
  } else {
    addFinding(report, 'Document Security', 'CRITICAL', 'Former agent downloaded storage object directly.', `Bucket ${bucket}, path ${path}`)
  }

  const externalDownload = await externalClient.storage.from(bucket).download(path)
  if (externalDownload.error) {
    addFinding(report, 'Document Security', 'PASS', 'External user cannot directly download storage object.', externalDownload.error.message)
  } else {
    addFinding(report, 'Document Security', 'CRITICAL', 'External user downloaded storage object directly.', `Bucket ${bucket}, path ${path}`)
  }

  const publicResponse = await fetch(`${config.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`)
  if (publicResponse.status === 200) {
    addFinding(report, 'Document Security', 'CRITICAL', 'Storage object is publicly reachable without auth.', `HTTP 200 from public object URL for ${bucket}/${path}`)
  } else {
    addFinding(report, 'Document Security', 'PASS', 'Storage object is not publicly reachable without auth.', `HTTP ${publicResponse.status}`)
  }

  await service.storage.from(bucket).remove([path]).catch(() => {})
}

async function runLivePenetration(config, report, service, getColumns) {
  const fixtures = await createFixture(config, report, service, getColumns)
  const { users, records, password, onboardingToken } = fixtures

  const formerAgentClient = await signIn(config, users.agentA.email, password)
  const agentBClient = await signIn(config, users.agentB.email, password)
  const managerClient = await signIn(config, users.managerA.email, password)
  const principalClient = await signIn(config, users.principalA.email, password)
  const assistantClient = await signIn(config, users.assistantA.email, password)
  const externalClient = await signIn(config, users.external.email, password)
  const anonClient = createAnonClient(config)

  await assertDenied(report, 'Former Agent Kill Test', 'Former agent cannot read transferred lead created by themselves.', formerAgentClient, 'leads', 'lead_id', records.leadA)
  await assertDenied(report, 'Former Agent Kill Test', 'Former agent cannot read transferred listing created by themselves.', formerAgentClient, 'private_listings', 'id', records.listingA)
  await assertDenied(report, 'Former Agent Kill Test', 'Former agent cannot read transferred transaction created by themselves.', formerAgentClient, 'transactions', 'id', records.transactionA)
  await assertDenied(report, 'Former Agent Kill Test', 'Former agent cannot read transferred transaction document metadata.', formerAgentClient, 'documents', 'id', records.documentA)
  await assertDenied(report, 'Former Agent Kill Test', 'Former agent cannot read transferred appointment created by themselves.', formerAgentClient, 'appointments', 'appointment_id', records.appointmentA)

  await assertVisible(report, 'Agency Transfer Kill Test', 'Transferred agent can read new agency lead.', formerAgentClient, 'leads', 'lead_id', records.orgBLead)
  await assertDenied(report, 'Agency Transfer Kill Test', 'External user cannot read Organisation A lead.', externalClient, 'leads', 'lead_id', records.leadA)
  await assertDenied(report, 'Agency Transfer Kill Test', 'Organisation A agent cannot read Organisation B lead unless moved there.', agentBClient, 'leads', 'lead_id', records.orgBLead)

  await assertVisible(report, 'Branch Isolation', 'Branch manager can read own branch lead.', managerClient, 'leads', 'lead_id', records.leadA)
  await assertDenied(report, 'Branch Isolation', 'Branch manager cannot read another branch lead.', managerClient, 'leads', 'lead_id', records.branchOtherLead)
  await assertVisible(report, 'Organisation Isolation', 'Principal can read agency transferred lead.', principalClient, 'leads', 'lead_id', records.leadA)
  await assertDenied(report, 'Organisation Isolation', 'External user cannot read agency listing.', externalClient, 'private_listings', 'id', records.listingA)

  if (getColumns(SUPPORT_ASSIGNMENTS_TABLE).size > 0) {
    await assertVisible(report, 'Assistant Restriction', 'Assistant can read supported agent lead.', assistantClient, 'leads', 'lead_id', records.leadA)
    await assertDenied(report, 'Assistant Restriction', 'Assistant cannot read unsupported branch lead.', assistantClient, 'leads', 'lead_id', records.branchOtherLead)
    await testForbiddenUpdate(
      report,
      'Assistant Restriction',
      'Assistant cannot transfer lead ownership.',
      assistantClient,
      service,
      'leads',
      'lead_id',
      records.leadA,
      { assigned_user_id: users.assistantA.id, assigned_agent_id: users.assistantA.id },
      { assigned_user_id: users.agentB.id, assigned_agent_id: users.agentB.id, assigned_agent_email: users.agentB.email },
    )
    await testForbiddenUpdate(
      report,
      'Assistant Restriction',
      'Assistant cannot transfer listing ownership.',
      assistantClient,
      service,
      'private_listings',
      'id',
      records.listingA,
      { assigned_agent_id: users.assistantA.id },
      { assigned_agent_id: users.agentB.id },
    )
  } else {
    await assertDenied(report, 'Assistant Restriction', 'Assistant has no accidental organisation-wide lead access.', assistantClient, 'leads', 'lead_id', records.branchOtherLead)
  }

  await runStorageProbe(config, report, service, formerAgentClient, externalClient)

  await assertVisible(report, 'Document Security', 'New owner can read transferred document metadata.', agentBClient, 'documents', 'id', records.documentA)
  await assertDenied(report, 'Document Security', 'External user cannot read transferred document metadata.', externalClient, 'documents', 'id', records.documentA)

  const activePortal = await anonClient.rpc('bridge_private_listing_seller_portal_payload', { p_token: onboardingToken })
  if (activePortal.error || !activePortal.data?.listing?.id) {
    addFinding(report, 'Portal Security', 'CRITICAL', 'Seller portal token failed for active transferred listing.', activePortal.error?.message || 'No listing payload returned.')
  } else if (activePortal.data.listing.assigned_agent_id !== users.agentB.id) {
    addFinding(report, 'Portal Security', 'CRITICAL', 'Seller portal payload did not follow reassigned listing owner.', `Expected ${users.agentB.id}, got ${activePortal.data.listing.assigned_agent_id || 'empty'}.`)
  } else {
    addFinding(report, 'Portal Security', 'PASS', 'Seller portal payload remains valid and points at reassigned listing owner.')
  }

  const invalidPortal = await anonClient.rpc('bridge_private_listing_seller_portal_payload', { p_token: `${onboardingToken}-invalid` })
  if (invalidPortal.error) {
    addFinding(report, 'Portal Security', 'PASS', 'Invalid seller portal token is denied by RPC.', invalidPortal.error.message)
  } else if (invalidPortal.data == null) {
    addFinding(report, 'Portal Security', 'PASS', 'Invalid seller portal token returns no payload.')
  } else {
    addFinding(report, 'Portal Security', 'CRITICAL', 'Invalid seller portal token returned a payload.')
  }
}

async function main() {
  const report = createReport()
  const env = loadEnv()
  const config = requireConfig(env)
  const writeRequested = process.argv.includes('--confirm-staging') && normalizeText(env[WRITE_ENV_FLAG]).toLowerCase() === 'true'

  if (config.projectRef !== STAGING_PROJECT_REF) {
    addFinding(report, 'Staging Preparation', 'BLOCKED', 'Could not resolve staging project ref.', `Resolved ${config.projectRef || 'unknown'}.`)
    finalizeReport(report)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
    return
  }

  if (config.missing.length > 0) {
    addFinding(report, 'Staging Preparation', 'BLOCKED', 'Missing staging credentials.', config.missing.join(', '))
    finalizeReport(report)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
    return
  }

  const service = createServiceClient(config)
  const getColumns = await getOpenApiColumns(config)
  addFinding(report, 'Staging Preparation', 'PASS', 'Connected to staging OpenAPI schema.', `Project ref ${config.projectRef}.`)

  for (const table of ['organisations', 'organisation_users', 'organisation_branches', 'leads', 'private_listings', 'transactions', 'documents', 'appointments', 'private_listing_seller_onboarding']) {
    if (getColumns(table).size === 0) addFinding(report, 'Staging Preparation', 'CRITICAL', `Required table is not exposed: ${table}.`)
    else addFinding(report, 'Staging Preparation', 'PASS', `Required table is exposed: ${table}.`)
  }

  if (!writeRequested) {
    addFinding(
      report,
      'Staging Preparation',
      'BLOCKED',
      'Live mutation probes were not run.',
      `Run with ${WRITE_ENV_FLAG}=true and --confirm-staging to create isolated staging fixtures and perform the penetration tests.`,
    )
    finalizeReport(report)
    console.log(JSON.stringify(report, null, 2))
    return
  }

  report.mode = 'live-staging-fixture'
  await runLivePenetration(config, report, service, getColumns)
  finalizeReport(report)
  console.log(JSON.stringify(report, null, 2))
  if (report.summary.criticalCount > 0 || report.summary.blockedCount > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
