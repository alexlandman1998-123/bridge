import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildInviteAcceptanceAudit } from '../src/lib/invitationAcceptanceAudit.js'

const PAGE_SIZE = 1000
const MAX_ROWS = Number(process.env.INVITE_ACCEPTANCE_AUDIT_MAX_ROWS || 5000)
const INPUT_PATH = process.env.INVITE_ACCEPTANCE_AUDIT_INPUT || ''
const OUTPUT_PATH = process.env.INVITE_ACCEPTANCE_AUDIT_OUTPUT || ''

const TABLES = Object.freeze([
  ['partner_invitations', 'partnerInvitations'],
  ['transaction_partner_invitations', 'transactionPartnerInvitations'],
  ['organisation_partners', 'organisationPartners'],
  ['organisation_users', 'organisationUsers'],
  ['profiles', 'profiles'],
  ['transactions', 'transactions'],
  ['transaction_user_access', 'transactionUserAccess'],
  ['transaction_participants', 'transactionParticipants'],
  ['transaction_role_players', 'transactionRolePlayers'],
  ['organisations', 'organisations'],
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function isMissingTableOrColumn(error = {}) {
  const code = normalizeText(error.code)
  const message = normalizeText(error.message || error.details || error.hint).toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  )
}

async function fetchTableRows(client, table) {
  const rows = []
  let from = 0
  while (from < MAX_ROWS) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1)
    const result = await client.from(table).select('*').range(from, to)
    if (result.error) {
      if (isMissingTableOrColumn(result.error)) {
        return { rows, warning: `${table}: ${result.error.message}` }
      }
      throw new Error(`${table}: ${result.error.message}`)
    }
    rows.push(...(result.data || []))
    if (!result.data?.length || result.data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return {
    rows,
    warning: rows.length >= MAX_ROWS ? `${table}: truncated at ${MAX_ROWS} rows` : '',
  }
}

async function fetchAuthUsers(client) {
  const users = []
  let page = 1
  while (users.length < MAX_ROWS) {
    const result = await client.auth.admin.listUsers({
      page,
      perPage: Math.min(PAGE_SIZE, MAX_ROWS - users.length),
    })
    if (result.error) {
      return { users, warning: `auth.users: ${result.error.message}` }
    }
    users.push(...(result.data?.users || []))
    if (!result.data?.users?.length || result.data.users.length < PAGE_SIZE) break
    page += 1
  }
  return {
    users,
    warning: users.length >= MAX_ROWS ? `auth.users: truncated at ${MAX_ROWS} rows` : '',
  }
}

async function fetchLivePayload() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing INVITE_ACCEPTANCE_AUDIT_INPUT or SUPABASE_URL/VITE_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const payload = { source: 'live_supabase', warnings: [] }
  for (const [table, key] of TABLES) {
    const result = await fetchTableRows(client, table)
    payload[key] = result.rows
    if (result.warning) payload.warnings.push(result.warning)
  }

  const authUsers = await fetchAuthUsers(client)
  payload.authUsers = authUsers.users
  if (authUsers.warning) payload.warnings.push(authUsers.warning)

  return payload
}

function readInputPayload() {
  if (!INPUT_PATH) return null
  const resolvedPath = path.resolve(process.cwd(), INPUT_PATH)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`INVITE_ACCEPTANCE_AUDIT_INPUT does not exist: ${resolvedPath}`)
  }
  return {
    source: `file:${resolvedPath}`,
    ...JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
  }
}

async function main() {
  const payload = readInputPayload() || await fetchLivePayload()
  const report = buildInviteAcceptanceAudit(payload, { source: payload.source || 'live_supabase' })
  if (Array.isArray(payload.warnings) && payload.warnings.length) {
    report.warnings = payload.warnings
  }

  const output = `${safeJson(report)}\n`
  if (OUTPUT_PATH) {
    fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_PATH), output)
  }
  process.stdout.write(output)
}

main().catch((error) => {
  console.error('Invite acceptance audit failed:', error?.message || error)
  process.exitCode = 1
})
