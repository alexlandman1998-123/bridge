import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const RUN_ID = 'agency-principal-onboarding-smoke-2026-08-01'
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), 'private-evidence', 'agency-principal-onboarding-smoke-report.json')

const CLEANUP_AGENCIES = [
  {
    key: 'northpoint',
    agencyName: 'Bridge9 Northpoint Realty',
    registrationNumber: 'ONBOARDING-NORTHPOINT-2026-08-01',
    principalEmail: 'alex.northpoint.training@arch9.test',
  },
  {
    key: 'harbourline',
    agencyName: 'Bridge9 Harbourline Realty',
    registrationNumber: 'ONBOARDING-HARBOURLINE-2026-08-01',
    principalEmail: 'alex.harbourline.training@arch9.test',
  },
]

const AGENCIES = [
  {
    key: 'achiever',
    agencyName: 'Achiever Real Estate',
    tradingName: 'Achiever Real Estate',
    principalEmail: 'alex.achiever.training@arch9.test',
    businessEmail: 'hello@achiever-onboarding.test',
    principalFullName: 'Alexander Landman',
    principalPhone: '+27 82 000 0201',
    province: 'Gauteng',
    city: 'Johannesburg',
    address: 'Onboarding Test Office, Johannesburg',
    website: 'https://achiever-onboarding.test',
    registrationNumber: 'ONBOARDING-ACHIEVER-2026-08-01',
    ppraNumber: 'FFC-ACHIEVER-TEST',
    primaryColour: '#255c73',
    secondaryColour: '#143442',
    accentColour: '#d0a84f',
  },
  {
    key: 'daleens',
    agencyName: 'Daleens Properties',
    tradingName: 'Daleens Properties',
    principalEmail: 'alex.daleens.training@arch9.test',
    businessEmail: 'hello@daleens-onboarding.test',
    principalFullName: 'Alexander Landman',
    principalPhone: '+27 82 000 0202',
    province: 'Western Cape',
    city: 'Cape Town',
    address: 'Onboarding Test Office, Cape Town',
    website: 'https://daleens-onboarding.test',
    registrationNumber: 'ONBOARDING-DALEENS-2026-08-01',
    ppraNumber: 'FFC-DALEENS-TEST',
    primaryColour: '#3f5f57',
    secondaryColour: '#1f3430',
    accentColour: '#c9aa62',
  },
  {
    key: 'destinyhomes',
    agencyName: 'Destiny Homes',
    tradingName: 'Destiny Homes',
    principalEmail: 'alex.destinyhomes.training@arch9.test',
    businessEmail: 'hello@destinyhomes-onboarding.test',
    principalFullName: 'Alexander Landman',
    principalPhone: '+27 82 000 0203',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    address: 'Onboarding Test Office, Durban',
    website: 'https://destinyhomes-onboarding.test',
    registrationNumber: 'ONBOARDING-DESTINYHOMES-2026-08-01',
    ppraNumber: 'FFC-DESTINYHOMES-TEST',
    primaryColour: '#5b5540',
    secondaryColour: '#2e2d26',
    accentColour: '#6aa6a0',
  },
  {
    key: 'ctproperties',
    agencyName: 'CT Properties',
    tradingName: 'CT Properties',
    principalEmail: 'alex.ctproperties.training@arch9.test',
    businessEmail: 'hello@ctproperties-onboarding.test',
    principalFullName: 'Alexander Landman',
    principalPhone: '+27 82 000 0204',
    province: 'Western Cape',
    city: 'Cape Town',
    address: 'Onboarding Test Office, Cape Town',
    website: 'https://ctproperties-onboarding.test',
    registrationNumber: 'ONBOARDING-CTPROPERTIES-2026-08-01',
    ppraNumber: 'FFC-CTPROPERTIES-TEST',
    primaryColour: '#4d6780',
    secondaryColour: '#243546',
    accentColour: '#d7c35e',
  },
  {
    key: 'dkrealestate',
    agencyName: 'DK Real Estate',
    tradingName: 'DK Real Estate',
    principalEmail: 'alex.dkrealestate.training@arch9.test',
    businessEmail: 'hello@dkrealestate-onboarding.test',
    principalFullName: 'Alexander Landman',
    principalPhone: '+27 82 000 0205',
    province: 'Gauteng',
    city: 'Johannesburg',
    address: 'Onboarding Test Office, Johannesburg',
    website: 'https://dkrealestate-onboarding.test',
    registrationNumber: 'ONBOARDING-DKREALESTATE-2026-08-02',
    ppraNumber: 'FFC-DKREALESTATE-TEST',
    primaryColour: '#475f78',
    secondaryColour: '#233141',
    accentColour: '#c7a861',
  },
]

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function splitFullName(fullName = '') {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  }
}

function slugify(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'head-office'
}

function parseArgs(argv) {
  const options = {
    apply: false,
    reportPath: DEFAULT_REPORT_PATH,
    password: normalizeText(process.env.ONBOARDING_TEST_AGENCY_PASSWORD),
    only: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const readValue = (prefix) => {
      if (arg.includes('=')) return arg.slice(prefix.length)
      index += 1
      return argv[index] || ''
    }

    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--dry-run') {
      options.apply = false
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      options.reportPath = path.resolve(process.cwd(), readValue('--report='))
    } else if (arg === '--password' || arg.startsWith('--password=')) {
      options.password = normalizeText(readValue('--password='))
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      options.only = normalizeText(readValue('--only=')).toLowerCase()
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function requireConfig() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeText(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!anonKey) missing.push('SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY')
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`)
  return { supabaseUrl, serviceRoleKey, anonKey }
}

function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function createAnonClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function isMissingRelation(error = {}) {
  const code = normalizeText(error.code).toUpperCase()
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('could not find the table')
}

async function getTableColumns(client, table) {
  const result = await client.from(table).select('*').limit(1)
  if (result.error) {
    if (isMissingRelation(result.error)) return null
    throw new Error(`${table} column inspection failed: ${result.error.message}`)
  }
  return result.data?.[0] ? new Set(Object.keys(result.data[0])) : null
}

function pickColumns(columns, payload) {
  if (!columns) return payload
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function findUserIdByEmail(client, email) {
  const profile = await client
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (profile.error) throw new Error(`${email}: profile lookup failed: ${profile.error.message}`)
  if (profile.data?.id) return { userId: profile.data.id, source: 'profiles' }

  const membership = await client
    .from('organisation_users')
    .select('user_id, email')
    .ilike('email', email)
    .not('user_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (membership.error) throw new Error(`${email}: membership lookup failed: ${membership.error.message}`)
  if (membership.data?.user_id) return { userId: membership.data.user_id, source: 'organisation_users' }

  return { userId: '', source: '' }
}

async function ensureAuthUser(client, agency, password, apply) {
  const email = normalizeEmail(agency.principalEmail)
  const existing = await findUserIdByEmail(client, email)

  if (!apply) {
    return {
      action: existing.userId ? 'would_update_auth_user' : 'would_create_auth_user',
      userId: existing.userId || null,
      resolvedFrom: existing.source || null,
    }
  }

  const nameParts = splitFullName(agency.principalFullName)
  const metadata = {
    source: RUN_ID,
    full_name: agency.principalFullName,
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    phone_number: agency.principalPhone,
    workspace_name: agency.agencyName,
    app_role: 'agent',
    role: 'agent',
  }

  if (existing.userId) {
    const result = await client.auth.admin.updateUserById(existing.userId, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (result.error) throw new Error(`${email}: auth update failed: ${result.error.message}`)
    return { action: 'updated_auth_user', userId: existing.userId, resolvedFrom: existing.source || null }
  }

  const result = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (result.error) throw new Error(`${email}: auth create failed: ${result.error.message}`)
  const userId = result.data?.user?.id || ''
  if (!userId) throw new Error(`${email}: auth create did not return a user id.`)
  return { action: 'created_auth_user', userId }
}

async function upsertProfile(client, agency, userId, columns, apply) {
  const email = normalizeEmail(agency.principalEmail)
  const nameParts = splitFullName(agency.principalFullName)
  const payload = pickColumns(columns, {
    id: userId,
    email,
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    full_name: agency.principalFullName,
    phone_number: agency.principalPhone,
    role: 'agent',
    system_role: 'professional',
    company_name: agency.agencyName,
    onboarding_completed: false,
    updated_at: new Date().toISOString(),
  })

  if (!apply) return { action: 'would_upsert_profile' }
  const result = await client.from('profiles').upsert(payload, { onConflict: 'id' }).select('id').maybeSingle()
  if (result.error) throw new Error(`${email}: profile upsert failed: ${result.error.message}`)
  return { action: 'upserted_profile' }
}

async function findExistingWorkspace(client, agency) {
  const result = await client
    .from('organisations')
    .select('id, name, display_name, type, workspace_kind, status, registration_number')
    .or(`name.eq.${agency.agencyName},registration_number.eq.${agency.registrationNumber}`)
    .limit(10)
  if (result.error) throw new Error(`${agency.agencyName}: workspace lookup failed: ${result.error.message}`)
  return (result.data || []).find((row) => normalizeText(row.status).toLowerCase() !== 'archived') || result.data?.[0] || null
}

async function insertOrUpdateWorkspaceDirectly(client, agency, userId, columns) {
  const existingWorkspace = await findExistingWorkspace(client, agency)
  if (existingWorkspace?.id) {
    return { workspace: existingWorkspace, action: 'reused_existing_workspace' }
  }

  const settings = buildOnboardingPayload(agency, userId).settings
  const payload = pickColumns(columns, {
    name: agency.agencyName,
    display_name: agency.tradingName,
    legal_name: agency.agencyName,
    trading_name: agency.tradingName,
    type: 'agency',
    organization_type: 'agency',
    workspace_kind: 'agency',
    registration_number: agency.registrationNumber,
    email: normalizeEmail(agency.businessEmail),
    company_email: normalizeEmail(agency.businessEmail),
    billing_email: normalizeEmail(agency.businessEmail),
    support_email: normalizeEmail(agency.businessEmail),
    company_phone: agency.principalPhone,
    support_phone: agency.principalPhone,
    website: agency.website,
    address_line_1: agency.address,
    province: agency.province,
    country: 'South Africa',
    primary_contact_person: agency.principalFullName,
    status: 'active',
    created_by: userId,
    settings_json: {
      ...settings,
      workspaceType: 'agency',
      workspaceKind: 'agency',
      onboardingSource: RUN_ID,
    },
  })

  const result = await client.from('organisations').insert(payload).select('id, name, display_name, type, workspace_kind, status, registration_number').maybeSingle()
  if (result.error) throw new Error(`${agency.agencyName}: organisation insert failed: ${result.error.message}`)
  return { workspace: result.data, action: 'created_workspace_directly' }
}

async function ensureBranchDirectly(client, agency, workspaceId, userId, columns) {
  const branchName = `${agency.tradingName} Head Office`
  const branchSlug = slugify(branchName)
  const existing = await client
    .from('organisation_branches')
    .select('id, organisation_id, name, slug, is_default, is_head_office, is_active')
    .eq('organisation_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('is_head_office', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.error && !isMissingRelation(existing.error)) {
    throw new Error(`${agency.agencyName}: branch lookup failed: ${existing.error.message}`)
  }
  if (existing.data?.id) {
    const repairPayload = pickColumns(columns, {
      name: branchName,
      slug: branchSlug,
      province: agency.province,
      city: agency.city,
      address: agency.address,
      location: agency.city,
      manager_name: agency.principalFullName,
      principal_user_id: userId,
      phone: agency.principalPhone,
      email: normalizeEmail(agency.businessEmail),
      is_head_office: true,
      is_default: true,
      is_active: true,
      status: 'active',
      agent_count: 0,
      updated_at: new Date().toISOString(),
    })
    const repaired = await client
      .from('organisation_branches')
      .update(repairPayload)
      .eq('id', existing.data.id)
      .select('id, organisation_id, name, is_default, is_head_office, is_active')
      .maybeSingle()
    if (repaired.error) throw new Error(`${agency.agencyName}: branch repair failed: ${repaired.error.message}`)
    return { branch: repaired.data, action: 'repaired_existing_branch' }
  }

  const payload = pickColumns(columns, {
    organisation_id: workspaceId,
    name: branchName,
    slug: branchSlug,
    province: agency.province,
    city: agency.city,
    address: agency.address,
    location: agency.city,
    manager_name: agency.principalFullName,
    principal_user_id: userId,
    phone: agency.principalPhone,
    email: normalizeEmail(agency.businessEmail),
    is_head_office: true,
    is_default: true,
    is_active: true,
    status: 'active',
    agent_count: 0,
    metadata_json: {
      defaultStructure: true,
      source: RUN_ID,
    },
    created_by: userId,
  })

  const result = await client.from('organisation_branches').insert(payload).select('id, organisation_id, name, is_default, is_head_office, is_active').maybeSingle()
  if (result.error) throw new Error(`${agency.agencyName}: branch insert failed: ${result.error.message}`)
  return { branch: result.data, action: 'created_branch_directly' }
}

async function upsertSettingsDirectly(client, agency, workspaceId, userId, columns) {
  const settings = {
    ...buildOnboardingPayload(agency, userId).settings,
    workspaceType: 'agency',
    workspaceKind: 'agency',
    onboardingCompletedAt: new Date().toISOString(),
    onboardingSource: RUN_ID,
  }
  const payload = pickColumns(columns, {
    organisation_id: workspaceId,
    settings_json: settings,
  })
  const result = await client.from('organisation_settings').upsert(payload, { onConflict: 'organisation_id' }).select('organisation_id').maybeSingle()
  if (result.error) throw new Error(`${agency.agencyName}: settings upsert failed: ${result.error.message}`)
  return { action: 'upserted_settings_directly' }
}

async function upsertMembershipDirectly(client, agency, workspaceId, branchId, userId, columns) {
  const nameParts = splitFullName(agency.principalFullName)
  const now = new Date().toISOString()
  const existing = await client
    .from('organisation_users')
    .select('id')
    .eq('organisation_id', workspaceId)
    .ilike('email', agency.principalEmail)
    .limit(1)
    .maybeSingle()
  if (existing.error) throw new Error(`${agency.principalEmail}: membership lookup failed: ${existing.error.message}`)

  const payload = pickColumns(columns, {
    organisation_id: workspaceId,
    user_id: userId,
    branch_id: branchId,
    primary_branch_id: branchId,
    branch_scope: 'all_branches',
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    email: normalizeEmail(agency.principalEmail),
    role: 'principal',
    workspace_role: 'principal',
    organisation_role: 'principal',
    app_role: 'agent',
    workspace_type: 'agency',
    status: 'active',
    membership_status: 'active',
    permissions_json: {},
    scope_level: 'organisation',
    scope_metadata: {
      source: RUN_ID,
      workspaceKind: 'agency',
      roleContractKey: 'agency_owner',
    },
    active_workspace_selected_at: now,
    is_primary_owner: true,
    invited_by_user_id: userId,
    invited_at: now,
    joined_at: now,
    accepted_at: now,
    last_active_at: now,
    created_by: userId,
    updated_at: now,
    created_at: now,
  })

  const result = existing.data?.id
    ? await client.from('organisation_users').update(payload).eq('id', existing.data.id).select('id').maybeSingle()
    : await client.from('organisation_users').insert(payload).select('id').maybeSingle()
  if (result.error) throw new Error(`${agency.principalEmail}: membership upsert failed: ${result.error.message}`)
  return { action: existing.data?.id ? 'updated_membership_directly' : 'created_membership_directly', membershipId: result.data?.id || existing.data?.id || null }
}

async function completeUserStateDirectly(client, agency, workspaceId, branchId, membershipId, userId, columns) {
  const now = new Date().toISOString()
  const profileUpdate = await client
    .from('profiles')
    .update({ role: 'agent', system_role: 'professional', company_name: agency.agencyName, onboarding_completed: true, updated_at: now })
    .eq('id', userId)
  if (profileUpdate.error) throw new Error(`${agency.principalEmail}: profile completion update failed: ${profileUpdate.error.message}`)

  if (columns.onboardingStates) {
    const statePayload = pickColumns(columns.onboardingStates, {
      user_id: userId,
      onboarding_status: 'onboarding_completed',
      onboarding_step: 'onboarding_complete',
      onboarding_path: 'agency_owner',
      workspace_action: 'create_workspace',
      workspace_type: 'agency',
      app_role: 'agent',
      intended_org_role: 'principal',
      last_completed_step: 'onboarding_review',
      onboarding_context_json: {
        source: RUN_ID,
        workspaceId,
        membershipId,
        branchId,
        workspaceKind: 'agency',
        branchScope: 'all_branches',
      },
      recovery_reason: null,
      completed_at: now,
      updated_at: now,
    })
    const state = await client.from('onboarding_states').upsert(statePayload, { onConflict: 'user_id' }).select('user_id').maybeSingle()
    if (state.error) throw new Error(`${agency.principalEmail}: onboarding state upsert failed: ${state.error.message}`)
  }

  if (columns.preferences) {
    const preferencePayload = pickColumns(columns.preferences, {
      user_id: userId,
      active_workspace_id: workspaceId,
      active_workspace_source: 'system_recovery',
      updated_at: now,
    })
    const preference = await client.from('user_workspace_preferences').upsert(preferencePayload, { onConflict: 'user_id' }).select('user_id').maybeSingle()
    if (preference.error) throw new Error(`${agency.principalEmail}: active workspace preference upsert failed: ${preference.error.message}`)
  }

  if (columns.completions) {
    const completionPayload = pickColumns(columns.completions, {
      user_id: userId,
      signup_intent_id: null,
      idempotency_key: `${RUN_ID}:${agency.key}`,
      workspace_id: workspaceId,
      status: 'completed',
      result: {
        success: true,
        idempotent: false,
        workspace_id: workspaceId,
        organisation_id: workspaceId,
        branch_id: branchId,
        membership_id: membershipId,
        workspace_type: 'agency',
        workspace_kind: 'agency',
        workspace_role: 'principal',
        active_workspace_id: workspaceId,
        organisation: {
          id: workspaceId,
          name: agency.agencyName,
          display_name: agency.tradingName,
          type: 'agency',
          workspace_kind: 'agency',
        },
        source: RUN_ID,
      },
      updated_at: now,
      created_at: now,
    })
    const completion = await client
      .from('workspace_onboarding_completions')
      .upsert(completionPayload, { onConflict: 'user_id,idempotency_key' })
      .select('id')
      .maybeSingle()
    if (completion.error) throw new Error(`${agency.principalEmail}: onboarding completion upsert failed: ${completion.error.message}`)
  }

  if (columns.events) {
    const eventPayload = pickColumns(columns.events, {
      user_id: userId,
      workspace_id: workspaceId,
      onboarding_step: 'onboarding_complete',
      event_type: 'workspace_onboarding_completed',
      metadata: {
        source: RUN_ID,
        workspaceType: 'agency',
        workspaceRole: 'principal',
        membershipId,
        branchId,
      },
    })
    const event = await client.from('onboarding_events').insert(eventPayload).select('id').maybeSingle()
    if (event.error) throw new Error(`${agency.principalEmail}: onboarding event insert failed: ${event.error.message}`)
  }

  return { action: 'completed_user_state_directly' }
}

async function completeOnboardingDirectly(client, agency, userId, tableColumns) {
  const workspaceResult = await insertOrUpdateWorkspaceDirectly(client, agency, userId, tableColumns.organisations)
  const workspaceId = workspaceResult.workspace?.id
  if (!workspaceId) throw new Error(`${agency.agencyName}: direct workspace provisioning did not return a workspace id.`)

  const branchResult = await ensureBranchDirectly(client, agency, workspaceId, userId, tableColumns.branches)
  const branchId = branchResult.branch?.id || null
  const settingsResult = await upsertSettingsDirectly(client, agency, workspaceId, userId, tableColumns.settings)
  const membershipResult = await upsertMembershipDirectly(client, agency, workspaceId, branchId, userId, tableColumns.memberships)
  const stateResult = await completeUserStateDirectly(client, agency, workspaceId, branchId, membershipResult.membershipId, userId, tableColumns)

  return {
    action: 'completed_workspace_onboarding_directly',
    workspaceAction: workspaceResult.action,
    branchAction: branchResult.action,
    settingsAction: settingsResult.action,
    membershipAction: membershipResult.action,
    stateAction: stateResult.action,
    result: {
      success: true,
      workspace_id: workspaceId,
      organisation_id: workspaceId,
      branch_id: branchId,
      membership_id: membershipResult.membershipId,
      workspace_type: 'agency',
      workspace_kind: 'agency',
      workspace_role: 'principal',
    },
  }
}

function buildOnboardingPayload(agency, userId) {
  const nameParts = splitFullName(agency.principalFullName)
  const completedAt = new Date().toISOString()
  const branchName = `${agency.tradingName} Head Office`
  const agencyOnboarding = {
    schemaVersion: 1,
    organisationType: 'agency',
    agencyInformation: {
      agencyName: agency.agencyName,
      tradingName: agency.tradingName,
      agencyType: 'residential',
      businessFocus: 'sales',
      companyRegistrationNumber: agency.registrationNumber,
      vatNumber: '',
      eaabPpraNumber: agency.ppraNumber,
      website: agency.website,
      mainOfficeNumber: agency.principalPhone,
      mainEmailAddress: agency.businessEmail,
      physicalAddress: agency.address,
      province: agency.province,
      country: 'South Africa',
    },
    principalInformation: {
      principalFullName: agency.principalFullName,
      emailAddress: agency.principalEmail,
      phoneNumber: agency.principalPhone,
      position: 'Principal / Owner',
      ppraNumber: agency.ppraNumber,
      idNumber: '',
    },
    branchStructure: {
      branches: [
        {
          id: `branch-${agency.key}`,
          branchName,
          officeLocation: agency.address,
          branchManager: agency.principalFullName,
          numberOfAgents: '0',
        },
      ],
    },
    branding: {
      logoLight: '',
      logoDark: '',
      logoLightName: '',
      logoDarkName: '',
      brandColours: {
        primary: agency.primaryColour,
        secondary: agency.secondaryColour,
        accent: agency.accentColour,
      },
    },
    invitations: [],
    permissions: {
      principalScope: 'all',
      branchManagerScope: 'branch',
      agentScope: 'own',
      crmLeadVisibility: 'private',
      allowCrossBranchCollaboration: false,
      allowSharedLeadPools: false,
      allowSharedListings: false,
    },
    status: {
      completedAt,
      lastSavedAt: completedAt,
    },
  }

  return {
    signup_intent_id: null,
    idempotency_key: `${RUN_ID}:${agency.key}`,
    workspace_type: 'agency',
    workspace_kind: 'agency',
    workspace_action: 'create_workspace',
    onboarding_path: 'agency_owner',
    organisation: {
      name: agency.agencyName,
      legal_name: agency.agencyName,
      trading_name: agency.tradingName,
      registration_number: agency.registrationNumber,
      email: normalizeEmail(agency.businessEmail),
      phone: agency.principalPhone,
      website: agency.website,
      address: agency.address,
      province: agency.province,
      country: 'South Africa',
    },
    owner: {
      user_id: userId,
      workspace_role: 'principal',
      first_name: nameParts.firstName,
      last_name: nameParts.lastName,
      full_name: agency.principalFullName,
      email: normalizeEmail(agency.principalEmail),
      phone: agency.principalPhone,
    },
    branches: [
      {
        name: branchName,
        address: agency.address,
        location: agency.city,
        city: agency.city,
        manager_name: agency.principalFullName,
        agent_count: 0,
        province: agency.province,
        email: normalizeEmail(agency.businessEmail),
        phone: agency.principalPhone,
      },
    ],
    settings: {
      agencyOnboarding,
      agencyType: 'residential',
      enabledModules: {
        residential: true,
        commercial: false,
      },
      commercialWorkspace: {
        status: 'disabled',
        source: 'not_selected',
        mode: 'residential_only',
        signupOnboardingPath: 'agency_owner',
        enabledAt: null,
      },
      organisationBranches: agencyOnboarding.branchStructure.branches,
      organisationPermissions: agencyOnboarding.permissions,
      workspaceType: 'agency',
      workspaceKind: 'agency',
      onboardingSource: RUN_ID,
    },
    invites: [],
  }
}

async function completeOnboardingAsUser(config, agency, userId, password, apply) {
  const existingWorkspace = await findExistingWorkspace(createAdminClient(config), agency)
  if (!apply) {
    return {
      action: existingWorkspace?.id ? 'would_reuse_or_fail_duplicate_workspace' : 'would_complete_workspace_onboarding',
      existingWorkspaceId: existingWorkspace?.id || null,
    }
  }

  const userClient = createAnonClient(config)
  const signIn = await userClient.auth.signInWithPassword({
    email: normalizeEmail(agency.principalEmail),
    password,
  })
  if (signIn.error) throw new Error(`${agency.principalEmail}: sign-in before onboarding failed: ${signIn.error.message}`)
  if (signIn.data?.user?.id !== userId) {
    throw new Error(`${agency.principalEmail}: signed-in user id did not match created principal.`)
  }

  const payload = buildOnboardingPayload(agency, userId)
  const rpc = await userClient.rpc('bridge_complete_workspace_onboarding', { payload })
  await userClient.auth.signOut()
  if (rpc.error) throw new Error(`${agency.principalEmail}: onboarding RPC failed: ${rpc.error.message}`)
  if (!rpc.data?.success) {
    throw new Error(`${agency.principalEmail}: onboarding RPC returned ${rpc.data?.code || 'failure'}: ${rpc.data?.message || 'unknown error'}`)
  }

  return {
    action: rpc.data.idempotent ? 'reused_onboarding_completion' : 'completed_workspace_onboarding',
    result: rpc.data,
  }
}

async function verifyAgency(client, config, agency, userId, password, apply) {
  if (!apply) return { ok: true, skipped: true }

  const workspace = await findExistingWorkspace(client, agency)
  const workspaceId = workspace?.id || ''
  const [profile, membership, branch, settings, completion, preference] = await Promise.all([
    client.from('profiles').select('id, email, role, company_name, onboarding_completed').eq('id', userId).maybeSingle(),
    client.from('organisation_users').select('id, organisation_id, user_id, email, role, workspace_role, organisation_role, app_role, workspace_type, status, branch_scope, is_primary_owner').eq('organisation_id', workspaceId).eq('user_id', userId).maybeSingle(),
    client.from('organisation_branches').select('id, organisation_id, name, is_default, is_head_office, is_active').eq('organisation_id', workspaceId).order('created_at', { ascending: true }).limit(5),
    client.from('organisation_settings').select('organisation_id, settings_json').eq('organisation_id', workspaceId).maybeSingle(),
    client.from('workspace_onboarding_completions').select('id, user_id, workspace_id, status, result').eq('user_id', userId).eq('idempotency_key', `${RUN_ID}:${agency.key}`).maybeSingle(),
    client.from('user_workspace_preferences').select('user_id, active_workspace_id, active_workspace_source').eq('user_id', userId).maybeSingle(),
  ])

  const errors = []
  if (!workspaceId) errors.push('workspace missing')
  if (profile.error) errors.push(`profile query failed: ${profile.error.message}`)
  if (membership.error) errors.push(`membership query failed: ${membership.error.message}`)
  if (branch.error) errors.push(`branch query failed: ${branch.error.message}`)
  if (settings.error) errors.push(`settings query failed: ${settings.error.message}`)
  if (completion.error) errors.push(`completion query failed: ${completion.error.message}`)
  if (preference.error) errors.push(`preference query failed: ${preference.error.message}`)
  if (profile.data?.role !== 'agent') errors.push(`profile role is ${profile.data?.role || 'blank'}`)
  if (profile.data?.onboarding_completed !== true) errors.push('profile onboarding_completed is not true')
  if (membership.data?.role !== 'principal') errors.push(`membership role is ${membership.data?.role || 'blank'}`)
  if (membership.data?.workspace_role !== 'principal') errors.push(`membership workspace_role is ${membership.data?.workspace_role || 'blank'}`)
  if (membership.data?.organisation_role !== 'principal') errors.push(`membership organisation_role is ${membership.data?.organisation_role || 'blank'}`)
  if (membership.data?.app_role !== 'agent') errors.push(`membership app_role is ${membership.data?.app_role || 'blank'}`)
  if (membership.data?.status !== 'active') errors.push(`membership status is ${membership.data?.status || 'blank'}`)
  if (membership.data?.branch_scope !== 'all_branches') errors.push(`membership branch_scope is ${membership.data?.branch_scope || 'blank'}`)
  if (membership.data?.is_primary_owner !== true) errors.push('membership is_primary_owner is not true')
  if (!(branch.data || []).some((row) => row.is_active && (row.is_default || row.is_head_office))) errors.push('default/head-office branch missing')
  if (settings.data?.settings_json?.agencyType !== 'residential') errors.push('settings agencyType is not residential')
  if (completion.data?.status !== 'completed') errors.push('workspace onboarding completion is not completed')
  if (preference.data?.active_workspace_id !== workspaceId) errors.push('active workspace preference does not point at new workspace')

  const userClient = createAnonClient(config)
  const signIn = await userClient.auth.signInWithPassword({
    email: normalizeEmail(agency.principalEmail),
    password,
  })
  if (signIn.error) {
    errors.push(`verification sign-in failed: ${signIn.error.message}`)
  } else if (signIn.data?.user?.id !== userId) {
    errors.push('verification sign-in user id mismatch')
  }
  const signedInProfile = signIn.error
    ? { data: null, error: null }
    : await userClient.from('profiles').select('id, role, onboarding_completed').eq('id', userId).maybeSingle()
  const signedInMembership = signIn.error
    ? { data: null, error: null }
    : await userClient.from('organisation_users').select('id, organisation_id, user_id, role, status').eq('organisation_id', workspaceId).eq('user_id', userId).maybeSingle()
  if (signedInProfile.error) errors.push(`signed-in profile query failed: ${signedInProfile.error.message}`)
  if (signedInMembership.error) errors.push(`signed-in membership query failed: ${signedInMembership.error.message}`)
  if (!signIn.error && signedInProfile.data?.onboarding_completed !== true) errors.push('signed-in profile onboarding check failed')
  if (!signIn.error && signedInMembership.data?.id !== membership.data?.id) errors.push('signed-in membership check failed')
  await userClient.auth.signOut()

  return {
    ok: errors.length === 0,
    errors,
    workspace,
    profile: profile.data || null,
    membership: membership.data || null,
    branches: branch.data || [],
    completion: completion.data || null,
    preference: preference.data || null,
    signInVerified: !signIn.error && signIn.data?.user?.id === userId,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const config = requireConfig()
  const password = options.password || `${randomUUID()}${randomUUID()}`
  const admin = createAdminClient(config)
  const tableColumns = {
    profiles: await getTableColumns(admin, 'profiles'),
    organisations: await getTableColumns(admin, 'organisations'),
    branches: await getTableColumns(admin, 'organisation_branches'),
    settings: await getTableColumns(admin, 'organisation_settings'),
    memberships: await getTableColumns(admin, 'organisation_users'),
    onboardingStates: await getTableColumns(admin, 'onboarding_states'),
    preferences: await getTableColumns(admin, 'user_workspace_preferences'),
    completions: await getTableColumns(admin, 'workspace_onboarding_completions'),
    events: await getTableColumns(admin, 'onboarding_events'),
  }

  const selectedAgencies = options.only
    ? AGENCIES.filter((agency) =>
      [agency.key, agency.agencyName, agency.tradingName, agency.principalEmail]
        .map((value) => normalizeText(value).toLowerCase())
        .includes(options.only),
    )
    : AGENCIES
  if (!selectedAgencies.length) {
    throw new Error(`No agency matched --only=${options.only}`)
  }

  const results = []
  for (const agency of selectedAgencies) {
    const result = {
      key: agency.key,
      agencyName: agency.agencyName,
      principalEmail: normalizeEmail(agency.principalEmail),
      actions: [],
      ok: false,
    }

    try {
      const auth = await ensureAuthUser(admin, agency, password, options.apply)
      result.userId = auth.userId
      result.actions.push(auth)
      const userId = auth.userId || `dry-run:${agency.principalEmail}`
      result.actions.push(await upsertProfile(admin, agency, userId, tableColumns.profiles, options.apply))
      try {
        result.actions.push(await completeOnboardingAsUser(config, agency, userId, password, options.apply))
      } catch (onboardingError) {
        const message = onboardingError?.message || String(onboardingError)
        const canFallback = message.includes('branch_scope') || message.includes('duplicate_organisation_detected')
        if (!options.apply || !canFallback) throw onboardingError
        result.actions.push({
          action: message.includes('duplicate_organisation_detected')
            ? 'rpc_onboarding_duplicate_existing_workspace_fallback'
            : 'rpc_onboarding_failed_branch_scope_fallback',
          error: message,
        })
        result.actions.push(await completeOnboardingDirectly(admin, agency, userId, tableColumns))
      }
      result.validation = await verifyAgency(admin, config, agency, userId, password, options.apply)
      result.ok = Boolean(result.validation?.ok)
    } catch (error) {
      result.ok = false
      result.error = error?.message || String(error)
    }

    results.push(result)
  }

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    supabaseHost: new URL(config.supabaseUrl).host,
    password: options.apply ? password : options.password ? '[provided]' : '[generated-on-apply]',
    agencies: selectedAgencies.map((agency) => ({
      key: agency.key,
      agencyName: agency.agencyName,
      principalEmail: normalizeEmail(agency.principalEmail),
    })),
    totals: {
      rows: results.length,
      ok: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      createdAuthUsers: results.filter((row) => row.actions?.some((action) => action.action === 'created_auth_user')).length,
      updatedAuthUsers: results.filter((row) => row.actions?.some((action) => action.action === 'updated_auth_user')).length,
      completedWorkspaces: results.filter((row) => row.actions?.some((action) => action.action === 'completed_workspace_onboarding')).length,
      directlyCompletedWorkspaces: results.filter((row) => row.actions?.some((action) => action.action === 'completed_workspace_onboarding_directly')).length,
      reusedOnboardingCompletions: results.filter((row) => row.actions?.some((action) => action.action === 'reused_onboarding_completion')).length,
      signInsVerified: results.filter((row) => row.validation?.signInVerified).length,
    },
    results,
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    mode: report.mode,
    runId: report.runId,
    supabaseHost: report.supabaseHost,
    totals: report.totals,
    reportPath: options.reportPath,
    agencies: report.agencies,
  }, null, 2))
  if (report.totals.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
