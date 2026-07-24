import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const TARGET_EMAIL = 'leroy.slava@produktiverealty.co.za'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function createServiceClient() {
  const supabaseUrl = normalizeText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
  const serviceRoleKey = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function mergeScopeMetadata(row, promotedAt) {
  const metadata = row?.scope_metadata && typeof row.scope_metadata === 'object' ? row.scope_metadata : {}
  return {
    ...metadata,
    roleChangedBy: 'codex',
    roleChangedAt: promotedAt,
    previousRole: row.role || row.workspace_role || row.organisation_role || 'agent',
    promotedToRole: 'principal',
  }
}

async function main() {
  const client = createServiceClient()
  const promotedAt = new Date().toISOString()

  const organisations = await client
    .from('organisations')
    .select('id, name, display_name, type, workspace_kind')
    .or('name.ilike.%Produktive%,display_name.ilike.%Produktive%')
    .order('created_at', { ascending: true })
  if (organisations.error) throw new Error(`Produktive workspace lookup failed: ${organisations.error.message}`)

  const organisationIds = (organisations.data || []).map((row) => row.id).filter(Boolean)
  if (!organisationIds.length) throw new Error('No Produktive workspaces were found.')

  const memberships = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, email, role, workspace_role, organisation_role, app_role, status, membership_status, branch_id, primary_branch_id, branch_scope, scope_level, scope_metadata')
    .ilike('email', TARGET_EMAIL)
    .in('organisation_id', organisationIds)
  if (memberships.error) throw new Error(`Leroy membership lookup failed: ${memberships.error.message}`)
  if (!(memberships.data || []).length) throw new Error(`No Produktive memberships found for ${TARGET_EMAIL}.`)

  const updates = []
  for (const row of memberships.data || []) {
    const result = await client
      .from('organisation_users')
      .update({
        role: 'principal',
        workspace_role: 'principal',
        organisation_role: 'principal',
        app_role: 'agent',
        branch_scope: 'all_branches',
        scope_level: 'organisation',
        scope_metadata: mergeScopeMetadata(row, promotedAt),
        updated_at: promotedAt,
      })
      .eq('id', row.id)
      .select('id, organisation_id, user_id, email, role, workspace_role, organisation_role, app_role, status, membership_status, branch_id, primary_branch_id, branch_scope, scope_level, updated_at')
      .maybeSingle()
    if (result.error) throw new Error(`${row.organisation_id}: role update failed: ${result.error.message}`)
    updates.push(result.data)
  }

  const profile = await client
    .from('profiles')
    .select('id, email, first_name, last_name, full_name, role, system_role, onboarding_completed')
    .ilike('email', TARGET_EMAIL)
    .maybeSingle()
  if (profile.error) throw new Error(`Leroy profile verification failed: ${profile.error.message}`)

  const verified = await client
    .from('organisation_users')
    .select('id, organisation_id, user_id, email, role, workspace_role, organisation_role, app_role, status, membership_status, branch_scope, scope_level, updated_at')
    .ilike('email', TARGET_EMAIL)
    .in('organisation_id', organisationIds)
    .order('organisation_id')
  if (verified.error) throw new Error(`Leroy post-update verification failed: ${verified.error.message}`)

  const rows = verified.data || []
  const ok = rows.length === updates.length && rows.every((row) =>
    row.role === 'principal' &&
    row.workspace_role === 'principal' &&
    row.organisation_role === 'principal' &&
    row.branch_scope === 'all_branches' &&
    row.scope_level === 'organisation' &&
    ['active', 'accepted'].includes(normalizeText(row.membership_status || row.status).toLowerCase())
  )

  console.log(JSON.stringify({
    ok,
    targetEmail: TARGET_EMAIL,
    workspaces: organisations.data || [],
    profile,
    updatedMemberships: rows,
  }, null, 2))
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
