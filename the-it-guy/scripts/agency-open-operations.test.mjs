import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer } from 'vite'
import { PGlite } from '@electric-sql/pglite'

const appRoot = new URL('../', import.meta.url)
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
const server = await createServer({ root: appRoot.pathname, logLevel: 'silent', server: { middlewareMode: true } })
const db = new PGlite()

try {
  const { can, getPermissionScope } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const { canAccessAgentsModule, canManageAgentOrganisations } = await server.ssrLoadModule('/src/lib/roles.js')
  const { canPerformAgencyAuthorityAction, AGENCY_AUTHORITY_ACTIONS } = await server.ssrLoadModule('/src/services/agencyAuthorityService.js')
  const { canGovernOrganisationRoleChange } = await server.ssrLoadModule('/src/lib/organisationRoleGovernance.js')
  const roles = ['owner', 'principal', 'admin', 'branch_manager', 'team_lead', 'agent', 'assistant', 'viewer']
  const required = [PERMISSIONS.manageWorkspaceSettings, PERMISSIONS.manageUsers, PERMISSIONS.manageBranches,
    PERMISSIONS.viewCommissionStructures, PERMISSIONS.manageCommissionStructures, PERMISSIONS.manageCommissionProfiles,
    PERMISSIONS.partnersManageOrgDefaults, PERMISSIONS.assignmentAssign, PERMISSIONS.assignmentReassign, PERMISSIONS.assignmentTransfer]
  const context = (role, status = 'active', workspaceType = 'agency', appRole = 'agent') => ({
    appRole, workspaceType, organisationRole: role,
    currentMembership: { id: 'member', role, status, workspaceType, workspace: { id: 'agency', type: workspaceType } },
  })
  for (const role of roles) {
    for (const permission of required) assert.equal(getPermissionScope(permission, context(role)), 'all_workspace', `${role}: ${permission}`)
    assert.equal(canAccessAgentsModule({ role: 'agent', membershipRole: role }), true)
    assert.equal(canManageAgentOrganisations({ role: 'agent', membershipRole: role }), true)
    const actor = { userId: 'actor', role, workspaceType: 'agency', membershipStatus: 'active' }
    for (const action of ['assignBranch', 'transferAgent', 'assignLead', 'transferOwnership', 'reassignAssets']) {
      assert.equal(canPerformAgencyAuthorityAction(AGENCY_AUTHORITY_ACTIONS[action], actor, { userId: 'other', role: 'owner', branchId: 'another-branch' }), true)
    }
    assert.equal(canGovernOrganisationRoleChange({ actor, target: { userId: 'actor', role }, nextRole: 'principal' }), true)
  }
  for (const status of ['invited', 'pending', 'suspended', 'removed', 'deactivated']) {
    for (const permission of required) assert.equal(can(permission, context('agent', status)), false, status)
  }
  assert.equal(can(PERMISSIONS.manageUsers, context('viewer', 'active', 'attorney_firm', 'attorney')), false)
  assert.equal(can(PERMISSIONS.manageUsers, context('viewer', 'active', 'developer_company', 'developer')), false)
  assert.equal(can(PERMISSIONS.manageUsers, context('agent', 'active', 'agency', 'client')), false)
  console.log('PASS: frontend operations across eight agency roles; inactive, client and other-product boundaries retained')

  // Execute the actual migration in isolated PostgreSQL. No live records or credentials.
  const org = randomUUID(), otherOrg = randomUUID(), legalOrg = randomUUID()
  const actorId = randomUUID(), actorMember = randomUUID(), peerId = randomUUID(), peerMember = randomUUID()
  const outsiderId = randomUUID(), outsiderMember = randomUUID(), suspendedId = randomUUID(), suspendedMember = randomUUID()
  const branchId = randomUUID(), otherBranchId = randomUUID()
  const managedTables = ['organisation_branches', 'commission_levels', 'referral_commission_rules', 'commission_targets',
    'organisation_commission_structures', 'organisation_user_commission_profiles']
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
  `)
  await db.exec(`
    create table organisations(id uuid primary key, type text);
    create table organisation_users(id uuid primary key, organisation_id uuid references organisations(id), user_id uuid,
      role text, workspace_role text, organisation_role text, organization_role text, job_title text,
      status text default 'active', membership_status text, is_primary_owner boolean default false,
      scope_metadata jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
    alter table organisation_users add column scope_level text, add column region_id uuid,
      add column branch_id uuid, add column primary_branch_id uuid;
    create table organization_events(organization_id uuid, actor_user_id uuid, target_user_id uuid, event_type text, event_data jsonb);
    create function bridge_membership_role(target_org uuid) returns text language sql stable security definer as $$
      select role from organisation_users where organisation_id=target_org and user_id=auth.uid() and status='active' limit 1
    $$;
    insert into organisations values ('${org}','agency'),('${otherOrg}','agency'),('${legalOrg}','attorney_firm');
    insert into organisation_users(id,organisation_id,user_id,role,workspace_role,organisation_role,is_primary_owner) values
      ('${actorMember}','${org}','${actorId}','principal','principal','principal',true),
      ('${peerMember}','${org}','${peerId}','agent','agent','agent',false),
      ('${outsiderMember}','${otherOrg}','${outsiderId}','agent','agent','agent',false);
    insert into organisation_users(id,organisation_id,user_id,role,status) values ('${suspendedMember}','${org}','${suspendedId}','agent','suspended');
    grant usage on schema public,auth to authenticated,anon;
    grant select on organisations,organisation_users to authenticated;
  `)
  for (const table of managedTables) {
    await db.exec(`create table ${table}(id uuid primary key default gen_random_uuid(),organisation_id uuid references organisations(id),name text);
      alter table ${table} enable row level security;
      grant select,insert,update,delete on ${table} to authenticated;`)
  }
  await db.exec(`alter table organisation_branches add column region_id uuid;
    insert into organisation_branches(id,organisation_id,name) values ('${branchId}','${org}','Own'),('${otherBranchId}','${otherOrg}','Unrelated');`)
  await db.exec(await migration('20260907131142_organisation_multi_owner_contract_phase1.sql'))
  await db.exec(await migration('20260907155543_organisation_primary_owner_control_phase4.sql'))
  const hierarchySql = await migration('202606100012_enterprise_hierarchy_phase5.sql')
  await db.exec(hierarchySql.slice(hierarchySql.indexOf('create or replace function public.bridge_phase5_role_rank('),
    hierarchySql.indexOf('create or replace function public.bridge_phase5_membership_scope(')))
  await db.exec(await migration('20260913072739_agency_open_operations.sql'))
  const roleSql = await migration('202607170027_settings_role_permission_governance_phase3_2.sql')
  await db.exec(roleSql.slice(roleSql.indexOf('create or replace function public.bridge_set_organisation_user_role('), roleSql.lastIndexOf('commit;')))
  await db.exec(`create trigger test_role_guard before update on organisation_users for each row execute function bridge_guard_organisation_user_role_change();
    create trigger test_job_guard before insert or update on organisation_users for each row execute function bridge_guard_organisation_user_job_title();`)
  const asUser = async (id) => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(id ? { sub: id, role: 'authenticated' } : {})])
    await db.exec('set role authenticated')
  }
  await asUser(actorId)
  const claimed = await db.query('select bridge_grant_organisation_owner($1,false) as result', [actorMember])
  assert.equal(claimed.rows[0].result.owner.role, 'owner')
  assert.equal(claimed.rows[0].result.owner.is_primary_owner, true)
  await asUser(peerId)
  // Self-promotion/demotion must no longer be blocked by rank governance.
  assert.equal((await db.query("select (bridge_set_organisation_user_role($1,'principal')).role as role", [peerMember])).rows[0].role, 'principal')
  assert.equal((await db.query("select (bridge_set_organisation_user_role($1,'agent')).role as role", [peerMember])).rows[0].role, 'agent')
  const scope = (await db.query('select * from bridge_phase5_membership_scope($1)', [org])).rows[0]
  assert.equal(scope.role, 'agent')
  assert.equal(scope.can_manage_hierarchy, true)
  assert.equal(scope.can_manage_region, true)
  assert.equal(scope.can_manage_branch, true)
  assert.equal((await db.query('select bridge_phase5_can_manage_branch($1,$2) as allowed', [org, branchId])).rows[0].allowed, true)
  assert.equal((await db.query('select bridge_phase5_can_manage_branch($1,$2) as allowed', [org, otherBranchId])).rows[0].allowed, false)
  // Exercise the writes while the actor is still an ordinary agent, before claiming ownership.
  for (const table of managedTables) {
    const inserted = await db.query(`insert into ${table}(organisation_id,name) values ($1,'agent audit') returning id`, [org])
    const id = inserted.rows[0].id
    assert.equal((await db.query(`update ${table} set name='agent edited' where id=$1 returning id`, [id])).rows.length, 1)
    await assert.rejects(db.query(`insert into ${table}(organisation_id,name) values ($1,'forbidden')`, [otherOrg]), /row-level security/)
    assert.equal((await db.query(`select id from ${table} where organisation_id=$1`, [otherOrg])).rows.length, 0)
    assert.equal((await db.query(`delete from ${table} where id=$1 returning id`, [id])).rows.length, 1)
  }
  await db.query("select bridge_set_organisation_user_job_title($1,'principal')", [actorMember])
  const peerClaim = await db.query('select bridge_grant_organisation_owner($1,false) as result', [peerMember])
  assert.equal(peerClaim.rows[0].result.owner.role, 'owner')
  const transfer = await db.query('select bridge_transfer_organisation_ownership($1) as result', [peerMember])
  assert.equal(transfer.rows[0].result.newOwner.is_primary_owner, true)
  assert.equal(transfer.rows[0].result.previousOwner.id, actorMember)
  assert.equal((await db.query('select role from organisation_users where id=$1', [actorMember])).rows[0].role, 'owner')
  await db.query("select bridge_set_organisation_user_job_title($1,'principal')", [actorMember])
  console.log('PASS: claim from legacy primary-principal state, shared ownership, self primary claim and retained previous ownership')

  for (const table of managedTables) {
    const inserted = await db.query(`insert into ${table}(organisation_id,name) values ($1,'audit') returning id`, [org])
    const id = inserted.rows[0].id
    assert.equal((await db.query(`update ${table} set name='edited' where id=$1 returning id`, [id])).rows.length, 1)
    await assert.rejects(db.query(`insert into ${table}(organisation_id,name) values ($1,'forbidden')`, [otherOrg]), /row-level security/)
    assert.equal((await db.query(`select id from ${table} where organisation_id=$1`, [otherOrg])).rows.length, 0)
    assert.equal((await db.query(`delete from ${table} where id=$1 returning id`, [id])).rows.length, 1)
  }
  await asUser(suspendedId)
  assert.equal((await db.query('select bridge_agency_open_operations($1) as allowed', [org])).rows[0].allowed, false)
  await assert.rejects(db.query('select bridge_grant_organisation_owner($1,false)', [actorMember]), /Only the active primary/)
  await asUser(outsiderId)
  await assert.rejects(db.query('select bridge_grant_organisation_owner($1,false)', [peerMember]), /Only the active primary/)
  await asUser(null)
  await assert.rejects(db.query('select bridge_grant_organisation_owner($1,false)', [actorMember]), /Authentication is required/)
  console.log('PASS: actual SQL CRUD policies across six tables; unrelated agencies, suspended users and signed-out ownership denied')
} finally {
  await server.close()
  await db.close()
}
