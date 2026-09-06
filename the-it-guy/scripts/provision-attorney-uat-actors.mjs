#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { ATTORNEY_RELEASE_ROLES } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { assertAttorneyStagingTarget } from './lib/attorney-staging-safety.mjs'

const apply = process.argv.includes('--apply')
const text = (value) => String(value || '').trim()
const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
const sharedPassword = text(process.env.ATTORNEY_DEMO_PASSWORD)
const actorDefinitions = ATTORNEY_RELEASE_ROLES.map((role) => ({
  ...role,
  email: text(process.env[`${role.envPrefix}_EMAIL`]) || `${role.key}.attorney.uat@arch9.co.za`,
  password: text(process.env[`${role.envPrefix}_PASSWORD`]) || sharedPassword,
  firstName: role.key === 'transfer' ? 'Transfer' : role.key === 'bond' ? 'Bond' : 'Cancellation',
  lastName: 'Attorney UAT',
  departmentType: role.key === 'bond' ? 'bond' : 'transfer',
}))

assertAttorneyStagingTarget({
  supabaseUrl: url,
  expectedProjectRef: process.env.SUPABASE_STAGING_PROJECT_REF,
  productionProjectRef: process.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF,
  environment: 'staging',
  recoveryConfirmation: process.env.SUPABASE_STAGING_RECOVERY_CONFIRMED,
  requireRecovery: apply,
})
if (!url || !serviceKey) throw new Error('Staging Supabase URL and service-role key are required.')
if (apply && actorDefinitions.some((actor) => !actor.password)) throw new Error('Configure ATTORNEY_DEMO_PASSWORD or each role-specific UAT password before --apply.')

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const seedProfile = await db.from('profiles').select('*').ilike('email', 'attorney.demo@arch9.co.za').maybeSingle()
if (seedProfile.error || !seedProfile.data?.id) throw new Error(seedProfile.error?.message || 'Seed attorney profile is missing.')
const seedMembership = await db.from('organisation_users').select('*').eq('user_id', seedProfile.data.id).eq('workspace_type', 'attorney_firm').eq('status', 'active').limit(1).maybeSingle()
if (seedMembership.error || !seedMembership.data?.organisation_id) throw new Error(seedMembership.error?.message || 'Seed attorney-firm membership is missing.')
const firm = await db.from('attorney_firms').select('id,organisation_id').or(`id.eq.${seedMembership.data.organisation_id},organisation_id.eq.${seedMembership.data.organisation_id}`).limit(1).maybeSingle()
if (firm.error || !firm.data?.id) throw new Error(firm.error?.message || 'Seed attorney firm is missing.')
const departments = await db.from('attorney_firm_departments').select('id,department_type').eq('firm_id', firm.data.id)
if (departments.error) throw new Error(departments.error.message)
const seededTransactions = await db.from('transactions').select('id').eq('is_demo_data', true).contains('demo_metadata', { seedKey: 'attorney-demo-full-workflows-v1' })
if (seededTransactions.error || seededTransactions.data?.length !== 6) throw new Error(seededTransactions.error?.message || 'Expected exactly six seeded attorney transactions.')
const transactionIds = seededTransactions.data.map(({ id }) => id)

const plan = actorDefinitions.map((actor) => ({
  role: actor.transactionRole,
  email: actor.email,
  departmentId: departments.data.find((department) => department.department_type === actor.departmentType)?.id || null,
  seededTransactionCount: transactionIds.length,
}))

if (!apply) {
  console.log(JSON.stringify({ phase: 1, mode: 'dry_run', projectRef: process.env.SUPABASE_STAGING_PROJECT_REF, firmId: firm.data.id, actors: plan }, null, 2))
  process.exit(0)
}

async function ensureAuthUser(actor) {
  const existingProfile = await db.from('profiles').select('id').ilike('email', actor.email).maybeSingle()
  if (existingProfile.error) throw existingProfile.error
  if (existingProfile.data?.id) {
    const updated = await db.auth.admin.updateUserById(existingProfile.data.id, {
      password: actor.password,
      email_confirm: true,
      app_metadata: { arch9_uat_actor: true },
    })
    if (updated.error) throw updated.error
    return existingProfile.data.id
  }
  const created = await db.auth.admin.createUser({
    email: actor.email,
    password: actor.password,
    email_confirm: true,
    app_metadata: { arch9_uat_actor: true },
  })
  if (created.error || !created.data.user?.id) throw created.error || new Error(`Unable to create ${actor.transactionRole}.`)
  return created.data.user.id
}

async function ensureActor(actor) {
  const userId = await ensureAuthUser(actor)
  const departmentId = departments.data.find((department) => department.department_type === actor.departmentType)?.id || null
  const compatibilityRole = actor.key === 'bond' ? 'bond_attorney' : 'transfer_attorney'
  const profilePayload = {
    id: userId,
    email: actor.email,
    full_name: `${actor.firstName} ${actor.lastName}`,
    first_name: actor.firstName,
    last_name: actor.lastName,
    company_name: seedProfile.data.company_name,
    role: 'attorney',
    onboarding_completed: true,
    primary_attorney_firm_id: seedMembership.data.organisation_id,
    attorney_role: compatibilityRole,
    system_role: 'attorney',
    department: actor.departmentType,
  }
  const profileWrite = await db.from('profiles').upsert(profilePayload, { onConflict: 'id' })
  if (profileWrite.error) throw profileWrite.error

  let membership = await db.from('organisation_users').select('id,attorney_firm_member_id').eq('organisation_id', seedMembership.data.organisation_id).eq('user_id', userId).maybeSingle()
  if (membership.error) throw membership.error
  const membershipPayload = {
    organisation_id: seedMembership.data.organisation_id,
    user_id: userId,
    first_name: actor.firstName,
    last_name: actor.lastName,
    email: actor.email,
    role: 'attorney',
    status: 'active',
    permissions_json: {},
    is_demo_data: true,
    app_role: 'attorney',
    workspace_type: 'attorney_firm',
    organisation_role: 'member',
    workspace_role: 'member',
    department_id: departmentId,
    attorney_professional_role: 'attorney_conveyancer',
    attorney_practice_qualifications: [actor.key],
    attorney_compatibility_role: compatibilityRole,
  }
  if (membership.data?.id) {
    const write = await db.from('organisation_users').update(membershipPayload).eq('id', membership.data.id)
    if (write.error) throw write.error
  } else {
    const write = await db.from('organisation_users').insert(membershipPayload).select('id,attorney_firm_member_id').single()
    if (write.error) throw write.error
    membership = write
  }

  let firmMember = await db.from('attorney_firm_members').select('id').eq('firm_id', firm.data.id).eq('user_id', userId).maybeSingle()
  if (firmMember.error) throw firmMember.error
  const firmMemberPayload = {
    firm_id: firm.data.id,
    user_id: userId,
    department_id: departmentId,
    role: compatibilityRole,
    status: 'active',
    professional_role: 'attorney_conveyancer',
    practice_qualifications: [actor.key],
  }
  if (firmMember.data?.id) {
    const write = await db.from('attorney_firm_members').update(firmMemberPayload).eq('id', firmMember.data.id)
    if (write.error) throw write.error
  } else {
    const write = await db.from('attorney_firm_members').insert(firmMemberPayload).select('id').single()
    if (write.error) throw write.error
    firmMember = write
  }
  const membershipId = membership.data?.id || membership.data?.[0]?.id
  if (membershipId) {
    const link = await db.from('organisation_users').update({ attorney_firm_member_id: firmMember.data.id }).eq('id', membershipId)
    if (link.error) throw link.error
  }

  const assignment = await db.from('transaction_attorney_assignments').update({
    attorney_user_id: userId,
    assigned_user_id: userId,
    primary_attorney_id: userId,
    attorney_department_id: departmentId,
    department_id: departmentId,
    assignment_status: 'active',
    status: 'active',
  }).in('transaction_id', transactionIds).eq('attorney_role', actor.transactionRole).eq('is_demo_data', true).select('id')
  if (assignment.error) throw assignment.error
  return { role: actor.transactionRole, email: actor.email, userId, activeMembership: true, assignmentCount: assignment.data?.length || 0 }
}

const actors = []
for (const actor of actorDefinitions) actors.push(await ensureActor(actor))
console.log(JSON.stringify({ phase: 1, mode: 'applied', projectRef: process.env.SUPABASE_STAGING_PROJECT_REF, actors }, null, 2))
