import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CSV_PATH = path.resolve(process.cwd(), '..', 'output', 'imports', 'produktive-realty-agent-import.csv')
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), '..', 'output', 'imports', 'produktive-realty-agent-provision-report.json')
const IMPORT_RUN_ID = 'produktive-realty-agent-bulk-import-2026-07-23'
const WORKSPACE_NAME = 'Produktive Realty'
const PAGE_SIZE = 200

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function parseArgs(argv) {
  const options = {
    apply: false,
    csvPath: DEFAULT_CSV_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    workspaceId: '',
    branchId: '',
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
    } else if (arg === '--csv' || arg.startsWith('--csv=')) {
      options.csvPath = path.resolve(process.cwd(), readValue('--csv='))
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      options.reportPath = path.resolve(process.cwd(), readValue('--report='))
    } else if (arg === '--workspace-id' || arg.startsWith('--workspace-id=')) {
      options.workspaceId = normalizeText(readValue('--workspace-id='))
    } else if (arg === '--branch-id' || arg.startsWith('--branch-id=')) {
      options.branchId = normalizeText(readValue('--branch-id='))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((line) => line.trim())
  const headers = parseCsvLine(lines[0]).map(normalizeText)
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line)
    const row = { rowNumber: index + 2 }
    headers.forEach((header, headerIndex) => {
      row[header] = normalizeText(cells[headerIndex] || '')
    })
    row.email = normalizeEmail(row.email)
    return row
  })
}

function requireConfig() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createServiceClient() {
  const { supabaseUrl, serviceRoleKey } = requireConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
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
  if (result.data?.[0]) return new Set(Object.keys(result.data[0]))
  return null
}

function pickColumns(columns, payload) {
  if (!columns) return payload
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)))
}

async function findExistingUserIdByEmail(client, email, workspaceId) {
  const profile = await client
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  if (profile.error) throw new Error(`${email}: profile lookup failed: ${profile.error.message}`)
  if (profile.data?.id) return { userId: profile.data.id, source: 'profiles' }

  let membershipQuery = client
    .from('organisation_users')
    .select('user_id, email')
    .ilike('email', email)
    .not('user_id', 'is', null)
    .limit(1)
  if (workspaceId) membershipQuery = membershipQuery.eq('organisation_id', workspaceId)
  const membership = await membershipQuery.maybeSingle()
  if (membership.error) throw new Error(`${email}: membership user lookup failed: ${membership.error.message}`)
  if (membership.data?.user_id) return { userId: membership.data.user_id, source: 'organisation_users' }

  return { userId: '', source: '' }
}

async function ensureAuthUser(client, row, { apply, workspace }) {
  const email = normalizeEmail(row.email)
  const existing = await findExistingUserIdByEmail(client, email, workspace?.id || '')
  if (!apply) {
    return {
      action: existing.userId ? 'would_update_auth_user' : 'would_create_auth_user',
      userId: existing.userId || null,
      resolvedFrom: existing.source || null,
      emailConfirmed: null,
    }
  }

  const metadata = {
    source: IMPORT_RUN_ID,
    imported_from: row.source_pdf || 'Agent List Report.pdf',
    full_name: row.full_name,
    first_name: row.first_name,
    last_name: row.last_name,
    phone_mobile: row.phone_mobile,
    workspace_name: WORKSPACE_NAME,
  }

  if (existing.userId) {
    const result = await client.auth.admin.updateUserById(existing.userId, {
      email_confirm: true,
      user_metadata: metadata,
    })
    if (result.error) throw new Error(`${email}: auth update failed: ${result.error.message}`)
    return {
      action: 'updated_auth_user',
      userId: existing.userId,
      resolvedFrom: existing.source || null,
      emailConfirmed: Boolean(result.data?.user?.email_confirmed_at),
    }
  }

  const password = randomUUID() + randomUUID()
  const result = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (result.error) {
    const message = normalizeText(result.error.message).toLowerCase()
    if (message.includes('already') || message.includes('registered')) {
      throw new Error(`${email}: auth user already exists, but no matching profile or organisation membership could resolve its user id.`)
    }
    throw new Error(`${email}: auth create failed: ${result.error.message}`)
  }
  const userId = result.data?.user?.id || ''
  if (!userId) throw new Error(`${email}: auth create did not return a user id.`)
  return {
    action: 'created_auth_user',
    userId,
    emailConfirmed: Boolean(result.data?.user?.email_confirmed_at),
  }
}

async function resolveWorkspace(client, options = {}) {
  let result
  if (options.workspaceId) {
    result = await client
      .from('organisations')
      .select('*')
      .eq('id', options.workspaceId)
      .limit(1)
  } else {
    result = await client
      .from('organisations')
      .select('*')
      .or('name.ilike.%Produktive Realty%,display_name.ilike.%Produktive Realty%')
      .limit(20)
  }

  if (result.error) throw new Error(`Produktive Realty workspace lookup failed: ${result.error.message}`)
  const rows = result.data || []
  const exact = rows.find((row) =>
    [row.name, row.display_name].map((value) => normalizeText(value).toLowerCase()).includes(WORKSPACE_NAME.toLowerCase()),
  )
  const workspace = exact || rows[0] || null
  if (!workspace?.id) throw new Error('Could not find a Produktive Realty workspace in organisations.')

  const branchResult = await client
    .from('organisation_branches')
    .select('*')
    .eq('organisation_id', workspace.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(20)
  if (branchResult.error && !isMissingRelation(branchResult.error)) {
    throw new Error(`Produktive Realty branch lookup failed: ${branchResult.error.message}`)
  }
  const branches = branchResult.data || []
  const branch =
    branches.find((row) => options.branchId && row.id === options.branchId) ||
    branches.find((row) => normalizeText(row.name).toLowerCase() === WORKSPACE_NAME.toLowerCase()) ||
    branches.find((row) => row.is_default || row.is_head_office) ||
    branches[0] ||
    null

  if (!branch?.id) throw new Error('Could not find a default Produktive Realty branch for agent memberships.')
  return { workspace, branch }
}

async function upsertProfile(client, row, userId, { apply, columns }) {
  const payload = pickColumns(columns, {
    id: userId,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: row.full_name,
    phone_number: row.phone_mobile,
    role: 'agent',
    system_role: 'professional',
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  })

  if (!apply) return { action: 'would_upsert_profile' }
  const result = await client.from('profiles').upsert(payload, { onConflict: 'id' }).select('id').maybeSingle()
  if (result.error) throw new Error(`${row.email}: profile upsert failed: ${result.error.message}`)
  return { action: 'upserted_profile' }
}

async function ensureMembership(client, row, userId, { apply, workspace, branch, columns }) {
  let existingQuery = client
    .from('organisation_users')
    .select('*')
    .eq('organisation_id', workspace.id)
    .limit(5)
  existingQuery = isUuid(userId)
    ? existingQuery.or(`user_id.eq.${userId},email.eq.${row.email}`)
    : existingQuery.ilike('email', row.email)
  const existing = await existingQuery

  if (existing.error) throw new Error(`${row.email}: membership lookup failed: ${existing.error.message}`)
  const existingRow = existing.data?.[0] || null
  const now = new Date().toISOString()
  const payload = pickColumns(columns, {
    organisation_id: workspace.id,
    user_id: userId,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role: 'agent',
    workspace_role: 'agent',
    organisation_role: 'agent',
    app_role: 'agent',
    workspace_type: 'agency',
    status: 'active',
    membership_status: 'active',
    branch_id: branch.id,
    primary_branch_id: branch.id,
    branch_scope: 'own',
    scope_level: 'assigned',
    scope_metadata: {
      source: IMPORT_RUN_ID,
      importedFrom: row.source_pdf || 'Agent List Report.pdf',
      agentType: row.agent_type,
    },
    active_workspace_selected_at: now,
    updated_at: now,
    created_at: existingRow?.created_at || now,
  })

  if (!apply) {
    return { action: existingRow?.id ? 'would_update_membership' : 'would_create_membership', membershipId: existingRow?.id || null }
  }

  if (existingRow?.id) {
    const result = await client.from('organisation_users').update(payload).eq('id', existingRow.id).select('id').maybeSingle()
    if (result.error) throw new Error(`${row.email}: membership update failed: ${result.error.message}`)
    return { action: 'updated_membership', membershipId: existingRow.id }
  }

  const result = await client.from('organisation_users').insert(payload).select('id').maybeSingle()
  if (result.error) throw new Error(`${row.email}: membership insert failed: ${result.error.message}`)
  return { action: 'created_membership', membershipId: result.data?.id || null }
}

async function upsertOnboardingState(client, row, userId, { apply, workspace, branch, columns }) {
  if (!columns) return { action: 'skipped_missing_onboarding_states' }
  const now = new Date().toISOString()
  const payload = pickColumns(columns, {
    user_id: userId,
    onboarding_status: 'onboarding_completed',
    onboarding_step: 'onboarding_complete',
    onboarding_path: 'agency',
    workspace_action: 'join_workspace',
    workspace_type: 'agency',
    app_role: 'agent',
    intended_org_role: 'agent',
    last_completed_step: 'onboarding_review',
    onboarding_context_json: {
      source: IMPORT_RUN_ID,
      workspaceId: workspace.id,
      branchId: branch.id,
      importedFrom: row.source_pdf || 'Agent List Report.pdf',
    },
    recovery_reason: '',
    completed_at: now,
    updated_at: now,
  })

  if (!apply) return { action: 'would_upsert_onboarding_state' }
  const result = await client.from('onboarding_states').upsert(payload, { onConflict: 'user_id' }).select('user_id').maybeSingle()
  if (result.error) throw new Error(`${row.email}: onboarding state upsert failed: ${result.error.message}`)
  return { action: 'upserted_onboarding_state' }
}

async function upsertOnboardingCompletion(client, row, userId, { apply, workspace, columns }) {
  if (!columns) return { action: 'skipped_missing_workspace_onboarding_completions' }
  const now = new Date().toISOString()
  const payload = pickColumns(columns, {
    user_id: userId,
    idempotency_key: IMPORT_RUN_ID,
    workspace_id: workspace.id,
    status: 'completed',
    result: {
      success: true,
      source: IMPORT_RUN_ID,
      workspaceId: workspace.id,
      appRole: 'agent',
      workspaceRole: 'agent',
      email: row.email,
    },
    updated_at: now,
    created_at: now,
  })

  if (!apply) return { action: 'would_upsert_onboarding_completion' }
  const result = await client
    .from('workspace_onboarding_completions')
    .upsert(payload, { onConflict: 'user_id,idempotency_key' })
    .select('id')
    .maybeSingle()
  if (result.error) throw new Error(`${row.email}: onboarding completion upsert failed: ${result.error.message}`)
  return { action: 'upserted_onboarding_completion' }
}

async function insertOnboardingEvent(client, row, userId, { apply, workspace, columns }) {
  if (!columns) return { action: 'skipped_missing_onboarding_events' }
  const payload = pickColumns(columns, {
    user_id: userId,
    workspace_id: workspace.id,
    onboarding_step: 'onboarding_complete',
    event_type: 'completed',
    metadata: {
      source: IMPORT_RUN_ID,
      importedFrom: row.source_pdf || 'Agent List Report.pdf',
      appRole: 'agent',
      workspaceType: 'agency',
    },
  })

  if (!apply) return { action: 'would_insert_onboarding_event' }
  const result = await client.from('onboarding_events').insert(payload).select('id').maybeSingle()
  if (result.error) throw new Error(`${row.email}: onboarding event insert failed: ${result.error.message}`)
  return { action: 'inserted_onboarding_event', eventId: result.data?.id || null }
}

async function validateProvisioning(client, row, userId, workspaceId) {
  const [profile, membership, onboardingState, completion] = await Promise.all([
    client.from('profiles').select('id, email, role, onboarding_completed').eq('id', userId).maybeSingle(),
    client.from('organisation_users').select('id, organisation_id, user_id, email, role, status, branch_id').eq('organisation_id', workspaceId).eq('user_id', userId).maybeSingle(),
    client.from('onboarding_states').select('user_id, onboarding_status, recovery_reason').eq('user_id', userId).maybeSingle(),
    client.from('workspace_onboarding_completions').select('id, user_id, workspace_id, status').eq('user_id', userId).eq('idempotency_key', IMPORT_RUN_ID).maybeSingle(),
  ])

  const errors = []
  if (profile.error) errors.push(`profile: ${profile.error.message}`)
  if (membership.error) errors.push(`membership: ${membership.error.message}`)
  if (onboardingState.error && !isMissingRelation(onboardingState.error)) errors.push(`onboarding_states: ${onboardingState.error.message}`)
  if (completion.error && !isMissingRelation(completion.error)) errors.push(`workspace_onboarding_completions: ${completion.error.message}`)
  if (!profile.data?.onboarding_completed) errors.push('profile onboarding_completed is not true')
  if (profile.data?.role !== 'agent') errors.push('profile role is not agent')
  if (!membership.data?.id || membership.data.status !== 'active') errors.push('active organisation membership is missing')
  if (onboardingState.data && onboardingState.data.onboarding_status !== 'onboarding_completed') errors.push('onboarding state is not completed')
  if (completion.data && completion.data.status !== 'completed') errors.push('workspace onboarding completion is not completed')

  return {
    ok: errors.length === 0,
    errors,
    email: row.email,
    userId,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const rows = readCsv(options.csvPath)
  const invalidRows = rows.filter((row) => !row.email || !row.first_name || !row.last_name)
  if (invalidRows.length) {
    throw new Error(`CSV has ${invalidRows.length} invalid rows missing first_name, last_name, or email.`)
  }

  const duplicateEmails = rows
    .map((row) => row.email)
    .filter((email, index, emails) => emails.indexOf(email) !== index)
  if (duplicateEmails.length) throw new Error(`CSV has duplicate emails: ${[...new Set(duplicateEmails)].join(', ')}`)

  const client = createServiceClient()
  const [workspaceContext, tableColumns] = await Promise.all([
    resolveWorkspace(client, options),
    Promise.all([
      getTableColumns(client, 'profiles'),
      getTableColumns(client, 'organisation_users'),
      getTableColumns(client, 'onboarding_states'),
      getTableColumns(client, 'workspace_onboarding_completions'),
      getTableColumns(client, 'onboarding_events'),
    ]),
  ])
  const [profileColumns, membershipColumns, onboardingStateColumns, onboardingCompletionColumns, onboardingEventColumns] = tableColumns
  const { workspace, branch } = workspaceContext

  const results = []
  for (const row of rows) {
    const result = {
      rowNumber: row.rowNumber,
      email: row.email,
      fullName: row.full_name,
      actions: [],
      ok: false,
    }
    try {
      const auth = await ensureAuthUser(client, row, { apply: options.apply, workspace })
      result.userId = auth.userId
      result.actions.push(auth)

      const userId = auth.userId || `dry-run:${row.email}`
      result.actions.push(await upsertProfile(client, row, userId, { apply: options.apply, columns: profileColumns }))
      result.actions.push(await ensureMembership(client, row, userId, {
        apply: options.apply,
        workspace,
        branch,
        columns: membershipColumns,
      }))
      result.actions.push(await upsertOnboardingState(client, row, userId, {
        apply: options.apply,
        workspace,
        branch,
        columns: onboardingStateColumns,
      }))
      result.actions.push(await upsertOnboardingCompletion(client, row, userId, {
        apply: options.apply,
        workspace,
        columns: onboardingCompletionColumns,
      }))
      result.actions.push(await insertOnboardingEvent(client, row, userId, {
        apply: options.apply,
        workspace,
        columns: onboardingEventColumns,
      }))
      if (options.apply) result.validation = await validateProvisioning(client, row, userId, workspace.id)
      result.ok = options.apply ? Boolean(result.validation?.ok) : true
    } catch (error) {
      result.ok = false
      result.error = error?.message || String(error)
    }
    results.push(result)
  }

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    runId: IMPORT_RUN_ID,
    generatedAt: new Date().toISOString(),
    csvPath: options.csvPath,
    workspace: {
      id: workspace.id,
      name: workspace.display_name || workspace.name,
      type: workspace.type || workspace.workspace_kind || '',
    },
    branch: {
      id: branch.id,
      name: branch.name,
    },
    totals: {
      rows: results.length,
      ok: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      createdAuthUsers: results.filter((row) => row.actions?.some((action) => action.action === 'created_auth_user')).length,
      updatedAuthUsers: results.filter((row) => row.actions?.some((action) => action.action === 'updated_auth_user')).length,
      createdMemberships: results.filter((row) => row.actions?.some((action) => action.action === 'created_membership')).length,
      updatedMemberships: results.filter((row) => row.actions?.some((action) => action.action === 'updated_membership')).length,
    },
    results,
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    mode: report.mode,
    runId: report.runId,
    workspace: report.workspace,
    branch: report.branch,
    totals: report.totals,
    reportPath: options.reportPath,
  }, null, 2))

  if (report.totals.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
