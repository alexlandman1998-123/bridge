import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CSV_PATH = path.resolve(process.cwd(), '..', 'output', 'imports', 'produktive-realty-agent-import.csv')
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), '..', 'output', 'imports', 'produktive-agent-password-reset-report.json')
const DEFAULT_WORKSPACE_REPORT_PATH = path.resolve(
  process.cwd(),
  '..',
  'output',
  'imports',
  'produktive-realty-agent-provision-active-workspace-report.json',
)

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseArgs(argv) {
  const options = {
    apply: false,
    csvPath: DEFAULT_CSV_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    workspaceReportPath: DEFAULT_WORKSPACE_REPORT_PATH,
    workspaceId: '',
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
    } else if (arg === '--workspace-report' || arg.startsWith('--workspace-report=')) {
      options.workspaceReportPath = path.resolve(process.cwd(), readValue('--workspace-report='))
    } else if (arg === '--workspace-id' || arg.startsWith('--workspace-id=')) {
      options.workspaceId = normalizeText(readValue('--workspace-id='))
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
  const anonKey = normalizeText(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  const password = normalizeText(process.env.PRODUKTIVE_AGENT_PASSWORD)
  const missing = []
  if (!supabaseUrl) missing.push('SUPABASE_URL/VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!anonKey) missing.push('SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY')
  if (!password) missing.push('PRODUKTIVE_AGENT_PASSWORD')
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`)
  return { supabaseUrl, serviceRoleKey, anonKey, password }
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

function loadWorkspaceFromReport(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!report?.workspace?.id) throw new Error(`Workspace report does not include workspace.id: ${filePath}`)
  return report.workspace
}

async function fetchRowsByEmail(client, table, emails, columns) {
  const result = await client.from(table).select(columns).in('email', emails)
  if (result.error) throw new Error(`${table} lookup failed: ${result.error.message}`)
  return new Map((result.data || []).map((row) => [normalizeEmail(row.email), row]))
}

async function fetchMemberships(client, emails, workspaceId) {
  const result = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, email, role, workspace_role, organisation_role, status, membership_status, branch_id')
    .eq('organisation_id', workspaceId)
    .in('email', emails)
  if (result.error) throw new Error(`organisation_users lookup failed: ${result.error.message}`)
  return new Map((result.data || []).map((row) => [normalizeEmail(row.email), row]))
}

function validateAgent({ email, profile, membership, workspaceId }) {
  const errors = []
  if (!profile?.id) errors.push('profile missing')
  if (profile?.role !== 'agent') errors.push(`profile role is ${profile?.role || 'blank'}`)
  if (!membership?.id) errors.push('workspace membership missing')
  if (membership?.organisation_id !== workspaceId) errors.push('workspace membership points at another organisation')
  if (membership?.user_id && profile?.id && membership.user_id !== profile.id) errors.push('profile and membership user ids differ')
  const roleValues = [membership?.role, membership?.workspace_role, membership?.organisation_role].filter(Boolean)
  if (roleValues.length && !roleValues.some((value) => normalizeText(value).toLowerCase() === 'agent')) {
    errors.push(`membership role is ${roleValues.join('/')}`)
  }
  const statusValues = [membership?.status, membership?.membership_status].filter(Boolean).map((value) => normalizeText(value).toLowerCase())
  if (statusValues.length && !statusValues.some((value) => value === 'active')) {
    errors.push(`membership status is ${statusValues.join('/')}`)
  }
  return { email, ok: errors.length === 0, errors }
}

async function resetAndVerifyAgent({ admin, config, row, profile, membership, workspaceId, apply }) {
  const result = {
    rowNumber: row.rowNumber,
    email: row.email,
    fullName: row.full_name,
    userId: profile?.id || null,
    membershipId: membership?.id || null,
    passwordUpdated: false,
    signInVerified: false,
    profileVerified: false,
    membershipVerified: false,
    ok: false,
    errors: [],
  }

  const validation = validateAgent({ email: row.email, profile, membership, workspaceId })
  if (!validation.ok) {
    result.errors.push(...validation.errors)
    return result
  }

  if (!apply) {
    result.ok = true
    return result
  }

  const update = await admin.auth.admin.updateUserById(profile.id, {
    password: config.password,
    email_confirm: true,
  })
  if (update.error) {
    result.errors.push(`auth password update failed: ${update.error.message}`)
    return result
  }
  result.passwordUpdated = true

  const userClient = createAnonClient(config)
  const signIn = await userClient.auth.signInWithPassword({
    email: row.email,
    password: config.password,
  })
  if (signIn.error) {
    result.errors.push(`sign-in failed: ${signIn.error.message}`)
    return result
  }
  result.signInVerified = signIn.data?.user?.id === profile.id

  const [profileCheck, membershipCheck] = await Promise.all([
    userClient.from('profiles').select('id, email, role, onboarding_completed').eq('id', profile.id).maybeSingle(),
    userClient
      .from('organisation_users')
      .select('id, organisation_id, user_id, email, role, status, membership_status')
      .eq('organisation_id', workspaceId)
      .eq('user_id', profile.id)
      .maybeSingle(),
  ])

  if (profileCheck.error) result.errors.push(`signed-in profile check failed: ${profileCheck.error.message}`)
  if (membershipCheck.error) result.errors.push(`signed-in membership check failed: ${membershipCheck.error.message}`)
  result.profileVerified = profileCheck.data?.id === profile.id && profileCheck.data?.role === 'agent'
  result.membershipVerified = membershipCheck.data?.id === membership.id

  await userClient.auth.signOut()

  if (!result.signInVerified) result.errors.push('signed-in user id did not match target profile')
  if (!result.profileVerified) result.errors.push('signed-in profile verification failed')
  if (!result.membershipVerified) result.errors.push('signed-in membership verification failed')
  result.ok = result.errors.length === 0
  return result
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const config = requireConfig()
  const rows = readCsv(options.csvPath)
  const emails = rows.map((row) => row.email)
  const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index)
  if (duplicates.length) throw new Error(`CSV has duplicate emails: ${[...new Set(duplicates)].join(', ')}`)
  const invalid = rows.filter((row) => !row.email || !row.full_name)
  if (invalid.length) throw new Error(`CSV has ${invalid.length} rows missing email or full_name.`)

  const reportWorkspace = options.workspaceId
    ? { id: options.workspaceId, name: 'CLI workspace override' }
    : loadWorkspaceFromReport(options.workspaceReportPath)
  const admin = createAdminClient(config)
  const [profilesByEmail, membershipsByEmail] = await Promise.all([
    fetchRowsByEmail(admin, 'profiles', emails, 'id, email, role, onboarding_completed'),
    fetchMemberships(admin, emails, reportWorkspace.id),
  ])

  const results = []
  for (const row of rows) {
    const profile = profilesByEmail.get(row.email) || null
    const membership = membershipsByEmail.get(row.email) || null
    results.push(
      await resetAndVerifyAgent({
        admin,
        config,
        row,
        profile,
        membership,
        workspaceId: reportWorkspace.id,
        apply: options.apply,
      }),
    )
  }

  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    csvPath: options.csvPath,
    workspace: reportWorkspace,
    totals: {
      rows: results.length,
      ok: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
      passwordsUpdated: results.filter((row) => row.passwordUpdated).length,
      signInsVerified: results.filter((row) => row.signInVerified).length,
      profilesVerified: results.filter((row) => row.profileVerified).length,
      membershipsVerified: results.filter((row) => row.membershipVerified).length,
    },
    results,
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    mode: report.mode,
    workspace: report.workspace,
    totals: report.totals,
    reportPath: options.reportPath,
  }, null, 2))
  if (report.totals.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
