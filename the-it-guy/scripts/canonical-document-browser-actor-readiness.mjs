import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const REPAIR_RPC = 'bridge_repair_workspace_onboarding'
const ATTORNEY_ORG_RPC = 'bridge_ensure_attorney_firm_organisation'
const ATTORNEY_ADMIN_RPC = 'bootstrap_attorney_firm_admin_membership'
const WRITE_FLAG = 'CANONICAL_BROWSER_ACTOR_REPAIR_WRITE'
const ENV_FILES = ['.env', '.env.staging.local', '.env.production.local']

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function isTruthy(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(normalizeText(value).toLowerCase())
}

function parseArgs(argv) {
  const options = {
    repair: false,
    confirmStaging: false,
    failOnBlocked: false,
  }

  for (const arg of argv) {
    if (arg === '--repair') {
      options.repair = true
    } else if (arg === '--confirm-staging') {
      options.confirmStaging = true
    } else if (arg === '--fail-on-blocked') {
      options.failOnBlocked = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function cleanEnvValue(value = '') {
  const trimmed = normalizeText(value)
  let cleaned = trimmed
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    cleaned = trimmed.slice(1, -1)
  }
  return cleaned.replace(/(?:\\n)+$/g, '')
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        if (index === -1) return [line, '']
        return [line.slice(0, index), cleanEnvValue(line.slice(index + 1))]
      }),
  )
}

function loadEnv() {
  return {
    ...parseEnvFile('.env'),
    ...parseEnvFile('.env.staging.local'),
    ...parseEnvFile('.env.production.local'),
    ...process.env,
  }
}

function projectRefFromUrl(url = '') {
  return normalizeText(url).match(/^https:\/\/([^.]+)/)?.[1] || ''
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

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function maskEmail(email = '') {
  const normalized = normalizeEmail(email)
  const [local = '', domain = ''] = normalized.split('@')
  if (!local || !domain) return normalized ? '[configured]' : ''
  const visible = local.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}

function sanitizeError(error) {
  if (!error) return null
  return {
    code: error.code || error.status || null,
    message: error.message || String(error),
    hint: error.hint || null,
    details: error.details || null,
  }
}

function normalizeSupabaseKey(value = '') {
  return normalizeText(value).replace(/\\n/g, '').replace(/\s+/g, '')
}

async function suppressExpectedAuthFetchNoise(callback) {
  const originalConsoleError = console.error
  console.error = (...args) => {
    const text = args.map((arg) => arg?.message || String(arg)).join(' ')
    if (/fetch failed|authretryablefetcherror|getaddrinfo|enotfound/i.test(text)) return
    originalConsoleError(...args)
  }

  try {
    return await callback()
  } finally {
    console.error = originalConsoleError
  }
}

function sanitizeProfile(row = null) {
  if (!row?.id) return null
  return {
    id: row.id,
    emailMasked: maskEmail(row.email),
    role: row.role || null,
    systemRole: row.system_role || row.systemRole || null,
    onboardingCompleted: Boolean(row.onboarding_completed ?? row.onboardingCompleted),
    companyNamePresent: Boolean(normalizeText(row.company_name || row.companyName)),
    fullNamePresent: Boolean(normalizeText(row.full_name || row.fullName)),
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function sanitizeOnboardingState(row = null) {
  if (!row?.user_id) return null
  const context = row.onboarding_context_json && typeof row.onboarding_context_json === 'object'
    ? row.onboarding_context_json
    : {}
  return {
    userId: row.user_id,
    onboardingStatus: row.onboarding_status || null,
    onboardingStep: row.onboarding_step || null,
    workspaceAction: row.workspace_action || null,
    workspaceType: row.workspace_type || null,
    appRole: row.app_role || null,
    intendedOrgRole: row.intended_org_role || null,
    recoveryReason: row.recovery_reason || null,
    completedAt: row.completed_at || null,
    contextWorkspaceId: context.workspaceId || context.workspace_id || null,
    contextMembershipId: context.membershipId || context.membership_id || null,
    contextBranchId: context.branchId || context.branch_id || null,
    updatedAt: row.updated_at || null,
  }
}

function sanitizeSignupIntent(row = null) {
  if (!row?.id) return null
  return {
    id: row.id,
    authUserId: row.auth_user_id || null,
    appRole: row.app_role || null,
    workspaceType: row.workspace_type || null,
    workspaceKind: row.workspace_kind || null,
    workspaceAction: row.workspace_action || null,
    intendedOrgRole: row.intended_org_role || null,
    onboardingPath: row.onboarding_path || null,
    consumedAt: row.consumed_at || null,
    updatedAt: row.updated_at || null,
  }
}

function sanitizeMembership(row = {}, userId = '', email = '') {
  const rowEmail = normalizeEmail(row.email)
  return {
    id: row.id || null,
    organisationId: row.organisation_id || row.organization_id || null,
    hasUserId: Boolean(row.user_id),
    userIdMatches: normalizeText(row.user_id) === userId,
    emailMatches: Boolean(rowEmail && rowEmail === normalizeEmail(email)),
    status: row.status || row.membership_status || null,
    membershipStatus: row.membership_status || null,
    workspaceType: row.workspace_type || null,
    workspaceRole: row.workspace_role || row.organisation_role || row.organization_role || row.role || null,
    branchId: row.branch_id || null,
    primaryBranchId: row.primary_branch_id || null,
    branchScope: row.branch_scope || null,
    scopeLevel: row.scope_level || null,
    isPrimaryOwner: Boolean(row.is_primary_owner),
    activeWorkspaceSelectedAt: row.active_workspace_selected_at || null,
    acceptedAt: row.accepted_at || null,
    joinedAt: row.joined_at || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  }
}

function sanitizeWorkspace(row = {}) {
  return {
    id: row.id || null,
    name: row.display_name || row.name || null,
    type: row.type || null,
    workspaceKind: row.workspace_kind || null,
    status: row.status || null,
    isDemoData: Boolean(row.is_demo_data),
    updatedAt: row.updated_at || null,
  }
}

function sanitizeBranch(row = {}) {
  return {
    id: row.id || null,
    organisationId: row.organisation_id || null,
    name: row.name || null,
    isActive: Boolean(row.is_active),
    status: row.status || null,
    isDefault: Boolean(row.is_default),
    isHeadOffice: Boolean(row.is_head_office),
  }
}

function sanitizePreference(row = null) {
  if (!row?.user_id) return null
  return {
    userId: row.user_id,
    activeWorkspaceId: row.active_workspace_id || null,
    activeWorkspaceSource: row.active_workspace_source || null,
    updatedAt: row.updated_at || null,
  }
}

function sanitizeAttorneyFirmMember(row = {}, userId = '') {
  return {
    id: row.id || null,
    firmId: row.firm_id || null,
    userIdMatches: normalizeText(row.user_id) === userId,
    role: row.role || null,
    status: row.status || null,
    departmentId: row.department_id || null,
    updatedAt: row.updated_at || null,
  }
}

function sanitizeAttorneyFirm(row = {}) {
  return {
    id: row.id || null,
    name: row.display_name || row.name || null,
    isActive: row.is_active ?? null,
    status: row.status || null,
    updatedAt: row.updated_at || null,
  }
}

function sanitizeAttorneyDepartment(row = {}) {
  return {
    id: row.id || null,
    firmId: row.firm_id || null,
    name: row.name || null,
    isActive: row.is_active ?? null,
    status: row.status || null,
  }
}

function sanitizeRepairResult(data = null) {
  if (!data || typeof data !== 'object') return data || null
  return {
    success: Boolean(data.success),
    code: data.code || null,
    message: data.message || null,
    workspaceId: data.workspace_id || data.organisation_id || null,
    membershipId: data.membership_id || null,
    branchId: data.branch_id || null,
    workspaceKind: data.workspace_kind || null,
    workspaceRole: data.workspace_role || null,
    scopeLevel: data.scope_level || null,
    branchScope: data.branch_scope || null,
    systemRole: data.system_role || null,
    repaired: Boolean(data.repaired),
  }
}

function sanitizePreferenceWrite(row = null) {
  if (!row?.user_id) return null
  return {
    userId: row.user_id,
    activeWorkspaceId: row.active_workspace_id || null,
    activeWorkspaceSource: row.active_workspace_source || null,
    updatedAt: row.updated_at || null,
  }
}

function requireConfig(env, report) {
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY)
  const anonKey = normalizeSupabaseKey(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY)
  const email = normalizeEmail(
    env.CANONICAL_BROWSER_EMAIL ||
      env.AGENCY_RUNTIME_AGENT_EMAIL ||
      env.STAGING_INTERNAL_EMAIL,
  )
  const password = normalizeText(
    env.CANONICAL_BROWSER_PASSWORD ||
      env.AGENCY_RUNTIME_AGENT_PASSWORD ||
      env.STAGING_INTERNAL_PASSWORD,
  )
  const projectRef = projectRefFromUrl(supabaseUrl)
  const serviceRole = normalizeText(decodeJwtPayload(serviceRoleKey)?.role).toLowerCase()

  report.runtime.projectRef = projectRef || null
  report.actor.emailMasked = maskEmail(email)
  report.actor.credentialsConfigured = Boolean(email && password)

  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY/SUPABASE_ANON_KEY')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!email) missing.push('CANONICAL_BROWSER_EMAIL/AGENCY_RUNTIME_AGENT_EMAIL/STAGING_INTERNAL_EMAIL')
  if (!password) missing.push('CANONICAL_BROWSER_PASSWORD/AGENCY_RUNTIME_AGENT_PASSWORD/STAGING_INTERNAL_PASSWORD')

  if (missing.length) {
    report.readiness.blockingReasons.push({
      code: 'missing_environment',
      detail: missing.join(', '),
    })
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    report.readiness.blockingReasons.push({
      code: 'wrong_supabase_project',
      detail: `Expected ${STAGING_PROJECT_REF}; resolved ${projectRef || 'unknown'}.`,
    })
  }
  if (serviceRoleKey && serviceRole !== 'service_role') {
    report.readiness.blockingReasons.push({
      code: 'service_role_required',
      detail: 'SUPABASE_SERVICE_ROLE_KEY must be a service_role key for read-only diagnostics.',
    })
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    email,
    password,
    projectRef,
    usable: !missing.length && projectRef === STAGING_PROJECT_REF && serviceRole === 'service_role',
  }
}

function createClientForKey(supabaseUrl, key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function readRows(client, table, buildQuery, limit = 50) {
  try {
    let query = client.from(table).select('*')
    if (buildQuery) query = buildQuery(query)
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (error) return { rows: [], error: sanitizeError(error) }
    return { rows: data || [], error: null }
  } catch (error) {
    return { rows: [], error: sanitizeError(error) }
  }
}

async function readSingle(client, table, buildQuery) {
  try {
    let query = client.from(table).select('*')
    if (buildQuery) query = buildQuery(query)
    const { data, error } = await query.maybeSingle()
    if (error) return { row: null, error: sanitizeError(error) }
    return { row: data || null, error: null }
  } catch (error) {
    return { row: null, error: sanitizeError(error) }
  }
}

function dedupeRows(rows = []) {
  const byId = new Map()
  for (const row of rows) {
    const key = row?.id || JSON.stringify(row)
    if (key) byId.set(key, row)
  }
  return [...byId.values()]
}

async function signInActor(config) {
  const client = createClientForKey(config.supabaseUrl, config.anonKey)
  try {
    const { data, error } = await suppressExpectedAuthFetchNoise(() => (
      client.auth.signInWithPassword({
        email: config.email,
        password: config.password,
      })
    ))
    if (error) return { client, user: null, error: sanitizeError(error) }
    return { client, user: data?.user || null, error: null }
  } catch (error) {
    return { client, user: null, error: sanitizeError(error) }
  }
}

async function collectDiagnostics(serviceClient, userId, email) {
  const normalizedEmail = normalizeEmail(email)
  const [
    profile,
    onboardingState,
    signupIntent,
    workspacePreference,
    membershipsByUser,
    membershipsByEmail,
    currentSchemaMemberships,
    attorneyFirmMembers,
  ] = await Promise.all([
    readSingle(serviceClient, 'profiles', (query) => query.eq('id', userId)),
    readSingle(serviceClient, 'onboarding_states', (query) => query.eq('user_id', userId)),
    readSingle(serviceClient, 'signup_intents', (query) => query.eq('auth_user_id', userId)),
    readSingle(serviceClient, 'user_workspace_preferences', (query) => query.eq('user_id', userId)),
    readRows(serviceClient, 'organisation_users', (query) => query.eq('user_id', userId), 50),
    normalizedEmail
      ? readRows(serviceClient, 'organisation_users', (query) => query.eq('email', normalizedEmail), 50)
      : { rows: [], error: null },
    readRows(serviceClient, 'organization_members', (query) => query.eq('user_id', userId), 50),
    readRows(serviceClient, 'attorney_firm_members', (query) => query.eq('user_id', userId), 50),
  ])

  const memberships = dedupeRows([...(membershipsByUser.rows || []), ...(membershipsByEmail.rows || [])])
  const organisationIds = [...new Set(memberships.map((row) => row.organisation_id || row.organization_id).filter(Boolean))]
  const currentSchemaOrganisationIds = [...new Set((currentSchemaMemberships.rows || []).map((row) => row.organization_id).filter(Boolean))]
  const allOrganisationIds = [...new Set([...organisationIds, ...currentSchemaOrganisationIds])]

  const attorneyFirmIds = [...new Set((attorneyFirmMembers.rows || []).map((row) => row.firm_id).filter(Boolean))]

  const [workspaces, branches, settings] = allOrganisationIds.length
    ? await Promise.all([
        readRows(serviceClient, 'organisations', (query) => query.in('id', allOrganisationIds), 100),
        readRows(serviceClient, 'organisation_branches', (query) => query.in('organisation_id', allOrganisationIds), 200),
        readRows(serviceClient, 'organisation_settings', (query) => query.in('organisation_id', allOrganisationIds), 100),
      ])
    : [
        { rows: [], error: null },
        { rows: [], error: null },
        { rows: [], error: null },
      ]
  const [attorneyFirms, attorneyDepartments] = attorneyFirmIds.length
    ? await Promise.all([
        readRows(serviceClient, 'attorney_firms', (query) => query.in('id', attorneyFirmIds), 100),
        readRows(serviceClient, 'attorney_firm_departments', (query) => query.in('firm_id', attorneyFirmIds), 200),
      ])
    : [
        { rows: [], error: null },
        { rows: [], error: null },
      ]

  return {
    raw: {
      profile: profile.row,
      onboardingState: onboardingState.row,
      signupIntent: signupIntent.row,
      workspacePreference: workspacePreference.row,
      memberships,
      currentSchemaMemberships: currentSchemaMemberships.rows || [],
      workspaces: workspaces.rows || [],
      branches: branches.rows || [],
      settings: settings.rows || [],
      attorneyFirmMembers: attorneyFirmMembers.rows || [],
      attorneyFirms: attorneyFirms.rows || [],
      attorneyDepartments: attorneyDepartments.rows || [],
    },
    errors: {
      profile: profile.error,
      onboardingState: onboardingState.error,
      signupIntent: signupIntent.error,
      workspacePreference: workspacePreference.error,
      membershipsByUser: membershipsByUser.error,
      membershipsByEmail: membershipsByEmail.error,
      currentSchemaMemberships: currentSchemaMemberships.error,
      attorneyFirmMembers: attorneyFirmMembers.error,
      workspaces: workspaces.error,
      branches: branches.error,
      settings: settings.error,
      attorneyFirms: attorneyFirms.error,
      attorneyDepartments: attorneyDepartments.error,
    },
  }
}

function isActiveStatus(value = '') {
  return normalizeKey(value) === 'active'
}

function membershipStatus(row = {}) {
  row = row || {}
  return row.status || row.membership_status || ''
}

function membershipRole(row = {}) {
  row = row || {}
  return normalizeKey(row.workspace_role || row.organisation_role || row.organization_role || row.role)
}

function getMembershipMetadata(membership = {}) {
  membership = membership || {}
  if (membership.module_metadata && typeof membership.module_metadata === 'object') return membership.module_metadata
  if (membership.metadata && typeof membership.metadata === 'object') return membership.metadata
  return {}
}

function hasCommercialMembershipMarker(membership = {}) {
  membership = membership || {}
  const metadata = getMembershipMetadata(membership)
  const moduleContext = normalizeKey(
    membership.module_context ||
      membership.module ||
      membership.module_type ||
      metadata.module_context ||
      metadata.module ||
      metadata.module_type,
  )
  if (['commercial', 'commercial_brokerage', 'commercial_agency'].includes(moduleContext)) return true

  const commercialRole = normalizeKey(metadata.commercial_role || metadata.role_label)
  if (commercialRole.startsWith('commercial_') || commercialRole === 'broker' || commercialRole === 'commercial_broker') return true

  const role = membershipRole(membership)
  return role.startsWith('commercial_') || role.includes('commercial_broker')
}

function selectActiveMembership(activeMemberships = [], preference = null) {
  const preferredWorkspaceId = normalizeText(preference?.active_workspace_id)
  if (preferredWorkspaceId) {
    const preferred = activeMemberships.find((row) => normalizeText(row.organisation_id || row.organization_id) === preferredWorkspaceId)
    if (preferred) return preferred
  }

  return [...activeMemberships].sort((left, right) => {
    if (Boolean(right.is_primary_owner) !== Boolean(left.is_primary_owner)) return Boolean(right.is_primary_owner) - Boolean(left.is_primary_owner)
    return normalizeText(right.active_workspace_selected_at || right.updated_at || right.created_at)
      .localeCompare(normalizeText(left.active_workspace_selected_at || left.updated_at || left.created_at))
  })[0] || null
}

function addCheck(evaluation, code, ok, detail, severity = 'blocking') {
  evaluation.checks.push({ code, ok, severity: ok ? 'pass' : severity, detail })
  if (!ok && severity === 'blocking') {
    evaluation.blockingReasons.push({ code, detail })
  } else if (!ok) {
    evaluation.warnings.push({ code, detail })
  }
}

function buildEvaluation(diagnostics, userId, email) {
  const raw = diagnostics.raw
  const evaluation = {
    status: 'BLOCKED',
    checks: [],
    blockingReasons: [],
    warnings: [],
    selectedMembershipId: null,
    selectedWorkspaceId: null,
    repairCandidate: false,
  }
  const blockingDiagnosticErrors = Object.entries(diagnostics.errors || {})
    .filter(([key, error]) => error && !['workspaces', 'branches', 'settings'].includes(key))
    .map(([key, error]) => `${key}: ${error.message}`)

  addCheck(
    evaluation,
    'service_role_diagnostics_available',
    blockingDiagnosticErrors.length === 0,
    blockingDiagnosticErrors.length
      ? `Service-role diagnostics failed for ${blockingDiagnosticErrors.join('; ')}.`
      : 'Service-role diagnostics can read browser actor setup tables.',
  )
  if (blockingDiagnosticErrors.length) return evaluation

  const profile = raw.profile
  const onboardingState = raw.onboardingState
  const memberships = raw.memberships || []
  const activeUserMemberships = memberships.filter((row) => (
    normalizeText(row.user_id) === userId &&
    isActiveStatus(membershipStatus(row))
  ))
  const claimableActiveMemberships = memberships.filter((row) => (
    !row.user_id &&
    normalizeEmail(row.email) === normalizeEmail(email) &&
    isActiveStatus(membershipStatus(row))
  ))
  const pendingMemberships = memberships.filter((row) => ['pending', 'invited'].includes(normalizeKey(membershipStatus(row))))
  const selectedMembership = selectActiveMembership(activeUserMemberships, raw.workspacePreference)
  const selectedWorkspaceId = selectedMembership?.organisation_id || selectedMembership?.organization_id || ''
  const selectedWorkspace = raw.workspaces.find((row) => row.id === selectedWorkspaceId) || null
  const selectedWorkspaceType = normalizeKey(selectedWorkspace?.type || selectedMembership?.workspace_type)
  const selectedRole = membershipRole(selectedMembership)
  const appRole = normalizeKey(profile?.role)
  const usesAttorneyValidation = appRole === 'attorney' || selectedWorkspaceType === 'attorney_firm'
  const activeBranches = raw.branches.filter((row) => row.organisation_id === selectedWorkspaceId && (row.is_active === true || isActiveStatus(row.status)))
  const settings = raw.settings.find((row) => row.organisation_id === selectedWorkspaceId) || null
  const activeAttorneyFirmMembers = (raw.attorneyFirmMembers || []).filter((row) => (
    normalizeText(row.user_id) === userId &&
    isActiveStatus(row.status)
  ))
  const selectedAttorneyMember = activeAttorneyFirmMembers.find((row) => row.firm_id === selectedWorkspaceId) || activeAttorneyFirmMembers[0] || null
  const selectedAttorneyFirmId = selectedAttorneyMember?.firm_id || ''
  const selectedAttorneyFirm = (raw.attorneyFirms || []).find((row) => row.id === selectedAttorneyFirmId) || null
  const activeAttorneyDepartments = (raw.attorneyDepartments || []).filter((row) => (
    row.firm_id === selectedAttorneyFirmId &&
    (row.is_active === true || isActiveStatus(row.status || 'active'))
  ))
  const needsBranch = ['agency', 'bond_originator'].includes(selectedWorkspaceType) && !hasCommercialMembershipMarker(selectedMembership)
  const needsSettings = ['agency', 'developer_company', 'bond_originator'].includes(selectedWorkspaceType)
  const ownerLikeRoles = ['owner', 'principal', 'director', 'partner']
  const managementRoles = ['owner', 'principal', 'director', 'partner', 'admin', 'firm_admin', 'hq_manager']
  const hasManagementAuthority = Boolean(selectedRole && managementRoles.includes(selectedRole))
  const needsBranchAssignment = needsBranch && selectedRole && !ownerLikeRoles.includes(selectedRole)

  evaluation.selectedMembershipId = selectedMembership?.id || null
  evaluation.selectedWorkspaceId = selectedWorkspaceId || null
  evaluation.repairCandidate = Boolean(
    profile?.id &&
      (profile.onboarding_completed || onboardingState?.onboarding_status === 'onboarding_completed') &&
      (!activeUserMemberships.length || claimableActiveMemberships.length || !selectedWorkspace?.id),
  )

  addCheck(evaluation, 'profile_exists', Boolean(profile?.id), 'A profile row exists for the browser actor.')
  addCheck(
    evaluation,
    'professional_role_present',
    Boolean(profile?.role && normalizeKey(profile.role) !== 'client'),
    'The actor has a professional app role suitable for workspace/admin routes.',
  )
  addCheck(
    evaluation,
    'profile_onboarding_completed',
    Boolean(profile?.onboarding_completed),
    'profiles.onboarding_completed is true.',
  )
  if (onboardingState?.user_id) {
    addCheck(
      evaluation,
      'onboarding_state_completed',
      onboardingState.onboarding_status === 'onboarding_completed',
      'onboarding_states.onboarding_status is onboarding_completed.',
    )
    addCheck(
      evaluation,
      'onboarding_recovery_reason_clear',
      !normalizeText(onboardingState.recovery_reason),
      'onboarding_states.recovery_reason is clear.',
      'warning',
    )
  } else {
    addCheck(
      evaluation,
      'onboarding_state_present',
      false,
      'No persisted onboarding_states row exists; runtime auth can still derive completion if membership validation passes.',
      'warning',
    )
  }
  addCheck(
    evaluation,
    'active_user_membership',
    activeUserMemberships.length > 0,
    activeUserMemberships.length
      ? `${activeUserMemberships.length} active organisation_users membership row(s) are linked to the actor.`
      : claimableActiveMemberships.length
        ? 'An active email-matched membership exists but is not claimed by user_id.'
        : pendingMemberships.length
          ? 'Only pending/invited membership rows are visible for this actor.'
          : 'No active organisation_users membership row is linked to the actor.',
  )
  addCheck(
    evaluation,
    'workspace_exists',
    Boolean(selectedWorkspace?.id),
    'The selected active membership points to an organisations row.',
  )
  addCheck(
    evaluation,
    'workspace_active',
    Boolean(selectedWorkspace?.id && isActiveStatus(selectedWorkspace.status || 'active')),
    'The selected workspace is active.',
  )
  addCheck(
    evaluation,
    'workspace_management_authority',
    hasManagementAuthority,
    hasManagementAuthority
      ? 'The selected workspace membership has management authority for settings/legal templates.'
      : selectedRole
        ? `Selected workspace role "${selectedRole}" does not have management authority for settings/legal templates.`
        : 'No selected workspace role is available for settings/legal templates authority.',
  )
  if (needsBranch) {
    addCheck(
      evaluation,
      'active_branch_exists',
      activeBranches.length > 0,
      'The selected workspace has at least one active branch.',
    )
  }
  if (needsSettings) {
    addCheck(
      evaluation,
      'organisation_settings_exists',
      Boolean(settings?.organisation_id),
      'The selected workspace has organisation_settings.',
    )
  }
  if (usesAttorneyValidation) {
    addCheck(
      evaluation,
      'active_attorney_firm_member',
      activeAttorneyFirmMembers.length > 0,
      activeAttorneyFirmMembers.length
        ? `${activeAttorneyFirmMembers.length} active attorney_firm_members row(s) are linked to the actor.`
        : 'No active attorney_firm_members row is linked to this attorney actor.',
    )
    addCheck(
      evaluation,
      'attorney_workspace_matches_firm',
      Boolean(selectedWorkspaceId && selectedAttorneyFirmId && selectedWorkspaceId === selectedAttorneyFirmId),
      selectedWorkspaceId && selectedAttorneyFirmId
        ? 'The selected workspace id matches the active attorney firm id used by onboarding validation.'
        : 'The attorney actor needs both a selected workspace and an active attorney firm membership.',
    )
    addCheck(
      evaluation,
      'attorney_firm_active',
      Boolean(selectedAttorneyFirm?.id && (selectedAttorneyFirm.is_active === true || isActiveStatus(selectedAttorneyFirm.status || 'active'))),
      'The selected attorney firm is active.',
    )
    addCheck(
      evaluation,
      'attorney_department_active',
      activeAttorneyDepartments.length > 0,
      'The selected attorney firm has at least one active department.',
    )
  }
  if (needsBranchAssignment) {
    addCheck(
      evaluation,
      'membership_branch_assignment',
      Boolean(selectedMembership?.branch_id),
      'The selected non-owner membership has a branch assignment.',
    )
  }
  addCheck(
    evaluation,
    'workspace_preference_valid',
    !raw.workspacePreference?.active_workspace_id || activeUserMemberships.some((row) => (row.organisation_id || row.organization_id) === raw.workspacePreference.active_workspace_id),
    'The stored active workspace preference points to one of the actor memberships.',
    'warning',
  )

  if (!evaluation.blockingReasons.length) {
    evaluation.status = evaluation.warnings.length ? 'READY_WITH_WARNINGS' : 'READY'
  }

  return evaluation
}

function buildSanitizedDiagnostics(diagnostics, userId, email) {
  const raw = diagnostics.raw
  return {
    profile: sanitizeProfile(raw.profile),
    onboardingState: sanitizeOnboardingState(raw.onboardingState),
    signupIntent: sanitizeSignupIntent(raw.signupIntent),
    workspacePreference: sanitizePreference(raw.workspacePreference),
    memberships: (raw.memberships || []).map((row) => sanitizeMembership(row, userId, email)),
    currentSchemaMemberships: (raw.currentSchemaMemberships || []).map((row) => ({
      id: row.id || null,
      organizationId: row.organization_id || null,
      userIdMatches: normalizeText(row.user_id) === userId,
      membershipStatus: row.membership_status || null,
      organizationRole: row.organization_role || null,
      updatedAt: row.updated_at || null,
    })),
    workspaces: (raw.workspaces || []).map(sanitizeWorkspace),
    branches: (raw.branches || []).map(sanitizeBranch),
    settings: (raw.settings || []).map((row) => ({
      organisationId: row.organisation_id || null,
      updatedAt: row.updated_at || null,
    })),
    attorneyFirmMembers: (raw.attorneyFirmMembers || []).map((row) => sanitizeAttorneyFirmMember(row, userId)),
    attorneyFirms: (raw.attorneyFirms || []).map(sanitizeAttorneyFirm),
    attorneyDepartments: (raw.attorneyDepartments || []).map(sanitizeAttorneyDepartment),
    errors: diagnostics.errors,
  }
}

function getAttorneyAlignmentTarget(diagnostics = {}, userId = '') {
  const raw = diagnostics.raw || {}
  const profile = raw.profile || {}
  if (normalizeKey(profile.role) !== 'attorney') return null

  const activeAttorneyMembers = (raw.attorneyFirmMembers || []).filter((row) => (
    normalizeText(row.user_id) === userId &&
    isActiveStatus(row.status)
  ))
  const profileFirmId = normalizeText(profile.primary_attorney_firm_id || profile.primaryAttorneyFirmId)
  const member = activeAttorneyMembers.find((row) => row.firm_id === profileFirmId) || activeAttorneyMembers[0] || null
  const firmId = normalizeText(member?.firm_id)
  if (!firmId) return null

  const selectedWorkspaceId = normalizeText(raw.workspacePreference?.active_workspace_id)
  if (selectedWorkspaceId === firmId) return null

  return {
    firmId,
    currentWorkspaceId: selectedWorkspaceId || null,
    memberId: member.id || null,
    memberRole: member.role || null,
  }
}

async function writeActorWorkspacePreference(actorClient, userId, workspaceId) {
  const table = actorClient.from('user_workspace_preferences')
  const result = await table
    .upsert(
      {
        user_id: userId,
        active_workspace_id: workspaceId,
        active_workspace_source: 'user_selected',
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, active_workspace_id, active_workspace_source, updated_at')
    .single()

  return {
    data: result.data || null,
    error: sanitizeError(result.error),
  }
}

async function alignAttorneyWorkspace(actorClient, target, userId) {
  const output = {
    attempted: Boolean(target?.firmId),
    targetFirmId: target?.firmId || null,
    previousWorkspaceId: target?.currentWorkspaceId || null,
    adminBootstrap: null,
    ensureOrganisation: null,
    preference: null,
    error: null,
  }
  if (!target?.firmId) return output

  if (!['firm_admin', 'director_partner'].includes(normalizeKey(target.memberRole))) {
    let adminResult = { data: null, error: null }
    try {
      adminResult = await actorClient.rpc(ATTORNEY_ADMIN_RPC, { target_firm_id: target.firmId })
    } catch (error) {
      adminResult = { data: null, error }
    }
    output.adminBootstrap = {
      membershipId: adminResult.data?.id || null,
      role: adminResult.data?.role || null,
      status: adminResult.data?.status || null,
      error: sanitizeError(adminResult.error),
    }
    if (adminResult.error) {
      output.error = output.adminBootstrap.error
      return output
    }
  }

  let ensureResult = { data: null, error: null }
  try {
    ensureResult = await actorClient.rpc(ATTORNEY_ORG_RPC, { target_firm_id: target.firmId })
  } catch (error) {
    ensureResult = { data: null, error }
  }
  output.ensureOrganisation = {
    workspaceId: ensureResult.data || null,
    error: sanitizeError(ensureResult.error),
  }
  if (ensureResult.error || !ensureResult.data) {
    output.error = output.ensureOrganisation.error || { message: 'Attorney firm organisation RPC returned no workspace id.' }
    return output
  }

  const preferenceResult = await writeActorWorkspacePreference(actorClient, userId, ensureResult.data)
  output.preference = {
    row: sanitizePreferenceWrite(preferenceResult.data),
    error: preferenceResult.error,
  }
  if (preferenceResult.error) output.error = preferenceResult.error
  return output
}

function finalizeReport(report, options) {
  const latest = report.afterRepair || report.beforeRepair
  if (latest?.evaluation) {
    report.readiness.status = latest.evaluation.status
    report.readiness.checks = latest.evaluation.checks
    report.readiness.blockingReasons.push(...latest.evaluation.blockingReasons)
    report.readiness.warnings.push(...latest.evaluation.warnings)
    report.readiness.selectedMembershipId = latest.evaluation.selectedMembershipId
    report.readiness.selectedWorkspaceId = latest.evaluation.selectedWorkspaceId
    report.readiness.repairCandidate = latest.evaluation.repairCandidate
  }

  const uniqueBlockingReasons = new Map()
  for (const reason of report.readiness.blockingReasons) {
    uniqueBlockingReasons.set(`${reason.code}:${reason.detail}`, reason)
  }
  report.readiness.blockingReasons = [...uniqueBlockingReasons.values()]

  const uniqueWarnings = new Map()
  for (const warning of report.readiness.warnings) {
    uniqueWarnings.set(`${warning.code}:${warning.detail}`, warning)
  }
  report.readiness.warnings = [...uniqueWarnings.values()]

  const blockerCodes = new Set(report.readiness.blockingReasons.map((reason) => reason.code))
  report.ok = ['READY', 'READY_WITH_WARNINGS'].includes(report.readiness.status)
  report.nextCommand = report.ok
    ? 'npm run verify:canonical-documents:browser-staging -- --skip-parity'
    : options.repair
      ? 'Review readiness.blockingReasons before rerunning browser smoke.'
      : blockerCodes.has('workspace_management_authority')
        ? 'Set CANONICAL_BROWSER_EMAIL/PASSWORD to a staging actor with legal-template management authority, or explicitly authorize firm-admin staging fixture bootstrap before running repair.'
        : `${WRITE_FLAG}=true npm run repair:canonical-documents:browser-actor`

  return report
}

function createReport(options) {
  return {
    ok: false,
    phase: '5',
    scope: 'canonical-document-browser-actor-readiness',
    generatedAt: new Date().toISOString(),
    mode: options.repair ? 'guarded_staging_repair' : 'read_only_staging_readiness',
    mutatedData: false,
    targetProjectRef: STAGING_PROJECT_REF,
    safety: {
      stagingProjectGuard: STAGING_PROJECT_REF,
      directTableWrites: false,
      actorScopedWrites: ['user_workspace_preferences'],
      repairRpc: REPAIR_RPC,
      attorneyOrganisationRpc: ATTORNEY_ORG_RPC,
      attorneyAdminRpc: ATTORNEY_ADMIN_RPC,
      repairRequires: ['--repair', '--confirm-staging', `${WRITE_FLAG}=true`],
    },
    runtime: {
      projectRef: null,
    },
    actor: {
      credentialsConfigured: false,
      emailMasked: '',
      signedIn: false,
      userId: null,
    },
    readiness: {
      status: 'BLOCKED',
      blockingReasons: [],
      warnings: [],
      checks: [],
      selectedMembershipId: null,
      selectedWorkspaceId: null,
      repairCandidate: false,
    },
    beforeRepair: null,
    repair: {
      attempted: false,
      allowed: false,
      rpc: null,
      attorneyAlignment: null,
      error: null,
    },
    afterRepair: null,
    nextCommand: null,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const env = loadEnv()
  const report = createReport(options)
  const config = requireConfig(env, report)

  if (options.repair) {
    const repairAllowed = options.confirmStaging && isTruthy(env[WRITE_FLAG])
    report.repair.allowed = repairAllowed
    if (!repairAllowed) {
      throw new Error(`Repair mode requires --confirm-staging and ${WRITE_FLAG}=true.`)
    }
  }

  if (!config.usable) {
    const finalReport = finalizeReport(report, options)
    console.log(safeJson(finalReport))
    if (options.failOnBlocked) process.exitCode = 1
    return
  }

  const serviceClient = createClientForKey(config.supabaseUrl, config.serviceRoleKey)
  const signIn = await signInActor(config)
  if (signIn.error || !signIn.user?.id) {
    report.actor.signedIn = false
    report.readiness.blockingReasons.push({
      code: 'actor_sign_in_failed',
      detail: signIn.error?.message || 'Supabase auth returned no user.',
    })
    const finalReport = finalizeReport(report, options)
    console.log(safeJson(finalReport))
    if (options.failOnBlocked) process.exitCode = 1
    return
  }

  report.actor.signedIn = true
  report.actor.userId = signIn.user.id

  const beforeDiagnostics = await collectDiagnostics(serviceClient, signIn.user.id, config.email)
  const beforeEvaluation = buildEvaluation(beforeDiagnostics, signIn.user.id, config.email)
  report.beforeRepair = {
    evaluation: beforeEvaluation,
    diagnostics: buildSanitizedDiagnostics(beforeDiagnostics, signIn.user.id, config.email),
  }

  if (options.repair) {
    report.repair.attempted = true
    let repairResult = { data: null, error: null }
    try {
      repairResult = await signIn.client.rpc(REPAIR_RPC, { target_user_id: signIn.user.id })
    } catch (error) {
      repairResult = { data: null, error }
    }
    report.mutatedData = true
    report.repair.rpc = sanitizeRepairResult(repairResult.data)
    report.repair.error = sanitizeError(repairResult.error)

    let afterDiagnostics = await collectDiagnostics(serviceClient, signIn.user.id, config.email)
    let afterEvaluation = buildEvaluation(afterDiagnostics, signIn.user.id, config.email)
    const attorneyTarget = getAttorneyAlignmentTarget(afterDiagnostics, signIn.user.id)
    if (attorneyTarget) {
      report.repair.attorneyAlignment = await alignAttorneyWorkspace(signIn.client, attorneyTarget, signIn.user.id)
      afterDiagnostics = await collectDiagnostics(serviceClient, signIn.user.id, config.email)
      afterEvaluation = buildEvaluation(afterDiagnostics, signIn.user.id, config.email)
    }
    report.afterRepair = {
      evaluation: afterEvaluation,
      diagnostics: buildSanitizedDiagnostics(afterDiagnostics, signIn.user.id, config.email),
    }
  }

  const finalReport = finalizeReport(report, options)
  console.log(safeJson(finalReport))
  if (options.failOnBlocked && !finalReport.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
