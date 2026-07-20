#!/usr/bin/env node

import assert from 'node:assert/strict'
import pg from 'pg'

const { Client } = pg

const stage = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : 'complete'
const dbUrl = process.env.SUPABASE_TARGET_DB_URL || process.env.SUPABASE_STAGING_DB_URL
if (!dbUrl) throw new Error('SUPABASE_TARGET_DB_URL or SUPABASE_STAGING_DB_URL is required.')
if (!['foundation', 'cutover', 'complete'].includes(stage)) throw new Error(`Unknown verification stage: ${stage}`)

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 })
await client.connect()

async function scalar(sql) {
  const result = await client.query(sql)
  return result.rows[0]
}

try {
  const foundation = await scalar(`
    select
      (select count(*)::integer
       from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in (
           ('attorney_firm_members', 'professional_role'),
           ('attorney_firm_members', 'practice_qualifications'),
           ('attorney_firm_members', 'organisation_user_id'),
           ('attorney_firm_invitations', 'professional_role'),
           ('attorney_firm_invitations', 'practice_qualifications'),
           ('organisation_users', 'attorney_professional_role'),
           ('organisation_users', 'attorney_practice_qualifications'),
           ('organisation_users', 'attorney_compatibility_role'),
           ('organisation_users', 'attorney_firm_member_id')
         )) as professional_profile_columns,
      (select count(*)::integer from pg_constraint
       where conname in (
         'attorney_firm_members_role_check',
         'attorney_firm_members_professional_role_check',
         'attorney_firm_members_practice_qualifications_check',
         'attorney_firm_invitations_role_check',
         'attorney_firm_invitations_professional_role_check',
         'attorney_firm_invitations_practice_qualifications_check',
         'organisation_users_attorney_professional_role_check',
         'organisation_users_attorney_practice_qualifications_check',
         'organisation_users_attorney_compatibility_role_check',
         'profiles_attorney_role_check'
       ) and convalidated) as validated_constraints,
      (select count(*)::integer from pg_trigger
       where tgname in (
         'attorney_firm_members_sync_professional_profile',
         'attorney_firm_invitations_sync_professional_profile',
         'attorney_firm_members_link_organisation_user',
         'attorney_firm_members_sync_organisation_extension',
         'organisation_users_link_attorney_member_extension'
       ) and tgenabled <> 'D') as enabled_sync_triggers,
      (select count(*)::integer from pg_indexes
       where schemaname = 'public' and indexname in (
         'attorney_firm_members_professional_role_idx',
         'attorney_firm_members_practice_qualifications_idx',
         'attorney_firm_members_organisation_user_idx',
         'organisation_users_attorney_professional_role_idx'
       )) as supporting_indexes,
      (select count(*)::integer from public.attorney_firm_members) as attorney_members,
      (select count(*)::integer from public.attorney_firm_members where professional_role = 'firm_admin' and status = 'active') as canonical_firm_administrators,
      (select count(*)::integer from public.attorney_firm_members where organisation_user_id is null) as missing_organisation_links,
      (select count(*)::integer from public.attorney_firm_members
       where role is distinct from public.bridge_attorney_professional_to_compatibility_role(professional_role, practice_qualifications)) as compatibility_mismatches,
      (select count(*)::integer
       from public.attorney_firm_members member
       join public.organisation_users organisation_user on organisation_user.id = member.organisation_user_id
       where organisation_user.attorney_professional_role is distinct from member.professional_role
          or organisation_user.attorney_practice_qualifications is distinct from member.practice_qualifications
          or organisation_user.attorney_compatibility_role is distinct from member.role
          or organisation_user.attorney_firm_member_id is distinct from member.id) as organisation_extension_mismatches,
      public.bridge_normalize_attorney_professional_role('transfer_attorney') = 'attorney_conveyancer' as normalization_pass
  `)
  assert.equal(foundation.professional_profile_columns, 9)
  assert.equal(foundation.validated_constraints, 10)
  assert.equal(foundation.enabled_sync_triggers, 5)
  assert.equal(foundation.supporting_indexes, 4)
  assert.equal(foundation.missing_organisation_links, 0)
  assert.equal(foundation.compatibility_mismatches, 0)
  assert.equal(foundation.organisation_extension_mismatches, 0)
  assert.equal(foundation.normalization_pass, true)

  let cutover = null
  if (stage !== 'foundation') {
    cutover = await scalar(`
      select
        position('professional_role' in pg_get_functiondef('public.attorney_user_is_firm_admin(uuid)'::regprocedure)) > 0 as admin_uses_professional_role,
        position('professional_role' in pg_get_functiondef('public.attorney_user_is_firm_lead(uuid)'::regprocedure)) > 0 as lead_uses_professional_role,
        position('professional_role' in pg_get_functiondef('public.bootstrap_attorney_firm_admin_membership(uuid)'::regprocedure)) > 0 as bootstrap_writes_professional_role,
        not has_function_privilege('anon', 'public.bootstrap_attorney_firm_admin_membership(uuid)', 'EXECUTE') as anonymous_bootstrap_revoked,
        has_function_privilege('authenticated', 'public.bootstrap_attorney_firm_admin_membership(uuid)', 'EXECUTE') as authenticated_bootstrap_granted
    `)
    for (const value of Object.values(cutover)) assert.equal(value, true)
  }

  let complete = null
  if (stage === 'complete') {
    complete = await scalar(`
      select
        (select count(*)::integer from information_schema.columns
         where table_schema = 'public' and table_name = 'workspace_access_requests'
           and column_name in ('requested_attorney_professional_role', 'requested_attorney_practice_qualifications')) as request_profile_columns,
        to_regprocedure('public.bridge_apply_accepted_attorney_invitation_profile()') is not null as invitation_profile_function,
        exists (select 1 from pg_trigger where tgname = 'attorney_firm_invitations_apply_accepted_profile' and tgenabled <> 'D') as invitation_profile_trigger,
        to_regprocedure('public.bridge_attorney_member_assignment_eligible(uuid,uuid,text,text,boolean)') is not null as assignment_eligibility_function,
        exists (select 1 from pg_trigger where tgname = 'trg_attorney_assignment_professional_profile_phase6' and tgenabled <> 'D') as assignment_guard_trigger,
        to_regclass('public.attorney_role_integrity_v1') is not null as integrity_view,
        to_regclass('public.attorney_role_release_certifications') is not null as certification_table,
        to_regprocedure('public.certify_attorney_role_release_phase9(uuid)') is not null as certification_function,
        (select count(*)::integer from public.attorney_role_integrity_v1 where integrity_status <> 'healthy') as blocking_integrity_rows,
        (select coalesce(sum(ineligible_open_assignment_count), 0)::integer from public.attorney_role_integrity_v1) as ineligible_open_assignments
    `)
    assert.equal(complete.request_profile_columns, 2)
    assert.equal(complete.invitation_profile_function, true)
    assert.equal(complete.invitation_profile_trigger, true)
    assert.equal(complete.assignment_eligibility_function, true)
    assert.equal(complete.assignment_guard_trigger, true)
    assert.equal(complete.integrity_view, true)
    assert.equal(complete.certification_table, true)
    assert.equal(complete.certification_function, true)
  }

  console.log(JSON.stringify({ stage, catalogChecks: 'pass', foundation, cutover, complete }, null, 2))
} finally {
  await client.end()
}
