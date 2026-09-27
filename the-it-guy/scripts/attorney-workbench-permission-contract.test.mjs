import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const ids = {
  matter: '00000000-0000-0000-0000-000000003001',
  lane: '00000000-0000-0000-0000-000000003002',
  step: '00000000-0000-0000-0000-000000003003',
  requirement: '00000000-0000-0000-0000-000000003004',
  firm: '00000000-0000-0000-0000-000000003005',
  otherFirm: '00000000-0000-0000-0000-000000003006',
  principal: '00000000-0000-0000-0000-000000003007',
  conveyancer: '00000000-0000-0000-0000-000000003008',
  secretary: '00000000-0000-0000-0000-000000003009',
  unassigned: '00000000-0000-0000-0000-000000003010',
  candidate: '00000000-0000-0000-0000-000000003011',
  otherFirmUser: '00000000-0000-0000-0000-000000003012',
  client: '00000000-0000-0000-0000-000000003013',
}
const teamMigration = readFileSync(new URL('../../supabase/migrations/20260926131822_attorney_matter_team_scope.sql', import.meta.url), 'utf8')
const contractMigration = readFileSync(new URL('../../supabase/migrations/20260926175324_attorney_workbench_permission_contract.sql', import.meta.url), 'utf8')
const pendingFirmMigration = readFileSync(new URL('../../supabase/migrations/20260927074804_attorney_pending_firm_workflow_access.sql', import.meta.url), 'utf8')
const atomicMigration = readFileSync(new URL('../../supabase/migrations/20260908144636_shared_matter_journey_atomic_commands.sql', import.meta.url), 'utf8')
function definition(source, functionName) {
  const start = source.indexOf(`create or replace function public.${functionName}(`)
  assert.ok(start >= 0, `${functionName} definition exists`)
  const end = source.indexOf('\nrevoke all on function', start)
  assert.ok(end > start, `${functionName} definition has an access boundary`)
  return source.slice(start, end)
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key, role text, email text, full_name text, first_name text, last_name text, avatar_url text);
    create table public.attorney_firm_members(firm_id uuid, user_id uuid, status text, professional_role text, role text);
    create table public.transaction_attorney_assignments(
      transaction_id uuid, attorney_firm_id uuid, firm_id uuid, assignment_status text, status text,
      attorney_role text, assignment_type text, matter_type text, can_update_workflow_lane boolean,
      can_manage_documents boolean, can_add_internal_notes boolean, can_add_shared_updates boolean,
      is_primary boolean, created_at timestamptz default now());
    create table public.attorney_matter_team_members(
      transaction_id uuid, firm_id uuid, user_id uuid, added_by uuid, added_at timestamptz default now(),
      removed_at timestamptz, removed_by uuid, unique(transaction_id, firm_id, user_id));
    create table public.attorney_lane_delegations(
      transaction_id uuid, attorney_role text, responsible_firm_id uuid, delegate_user_id uuid,
      status text, starts_at timestamptz, expires_at timestamptz, capabilities text[]);
    create table public.transaction_subprocesses(id uuid primary key, transaction_id uuid, process_type text);
    create table public.transaction_subprocess_steps(id uuid primary key, subprocess_id uuid, status text);
    create table public.attorney_task_confirmations(
      step_id uuid primary key, subprocess_id uuid, task_confirmations jsonb not null default '{}'::jsonb);
    alter table public.attorney_task_confirmations enable row level security;
    create table public.document_requirement_instances(id uuid primary key, transaction_id uuid, reviewer_role text);
    create table public.review_audit(actor_id uuid, action text);
    create function public.bridge_review_canonical_requirement(
      p_requirement_instance_id uuid, p_document_id uuid default null, p_action text default 'approve',
      p_reason text default null, p_actor_role text default null, p_actor_user_id uuid default null)
    returns jsonb language plpgsql security definer set search_path = '' as $$
    begin
      if p_actor_role <> 'transferring_attorney' then
        raise exception 'This profile role cannot review the attorney requirement.' using errcode = '42501';
      end if;
      insert into public.review_audit values (auth.uid(), p_action);
      return jsonb_build_object('ok', true, 'actor', auth.uid());
    end; $$;
    grant select on public.transaction_subprocesses, public.transaction_attorney_assignments,
      public.attorney_firm_members to authenticated;
  `)
  for (const functionName of [
    'bridge_attorney_matter_team_access', 'bridge_get_attorney_matter_team',
    'bridge_set_attorney_matter_team', 'bridge_can_mutate_attorney_lane',
  ]) await db.exec(definition(teamMigration, functionName))
  await db.exec(`
    grant execute on function public.bridge_attorney_matter_team_access(uuid,uuid,text),
      public.bridge_get_attorney_matter_team(uuid), public.bridge_set_attorney_matter_team(uuid,uuid[]),
      public.bridge_can_mutate_attorney_lane(uuid,text,text) to authenticated;
    create function public.test_workbench_write(p_step_id uuid, p_status text, p_answers jsonb)
    returns void language plpgsql security definer set search_path = '' as $$
    declare v_transaction_id uuid;
    begin
      select lane.transaction_id into v_transaction_id
      from public.transaction_subprocess_steps step
      join public.transaction_subprocesses lane on lane.id = step.subprocess_id
      where step.id = p_step_id;
      if not public.bridge_can_mutate_attorney_lane(v_transaction_id, 'transfer_attorney', 'workflow') then
        raise exception 'You do not have permission to update this attorney workflow.' using errcode = '42501';
      end if;
      update public.transaction_subprocess_steps set status = p_status where id = p_step_id;
      update public.attorney_task_confirmations set task_confirmations = p_answers where step_id = p_step_id;
    end; $$;
    grant execute on function public.test_workbench_write(uuid,text,jsonb) to authenticated;
  `)
  await db.exec(contractMigration)
  await db.exec(pendingFirmMigration)
  assert.match(atomicMigration, /bridge_can_mutate_attorney_lane\(p_transaction_id, p_lane_key \|\| '_attorney', 'workflow'\)/)
  assert.match(atomicMigration, /bridge_update_attorney_workflow_step_v3\(/)

  for (const [name, role, firm, professionalRole] of [
    ['principal', 'attorney', 'firm', 'firm_admin'],
    ['conveyancer', 'attorney', 'firm', 'attorney_conveyancer'],
    ['secretary', 'attorney', 'firm', 'conveyancing_secretary'],
    ['unassigned', 'attorney', 'firm', 'attorney_conveyancer'],
    ['candidate', 'attorney', 'firm', 'candidate_attorney'],
    ['otherFirmUser', 'attorney', 'otherFirm', 'attorney_conveyancer'],
    ['client', 'client', null, null],
  ]) {
    await db.query('insert into public.profiles(id,role,email,full_name) values ($1,$2,$3,$4)',
      [ids[name], role, `${name}@example.invalid`, name])
    if (firm) await db.query('insert into public.attorney_firm_members values ($1,$2,$3,$4,$5)',
      [ids[firm], ids[name], 'active', professionalRole, professionalRole])
  }
  await db.query(`insert into public.transaction_attorney_assignments
    (transaction_id,attorney_firm_id,firm_id,assignment_status,status,attorney_role,
      can_update_workflow_lane,can_manage_documents,can_add_internal_notes,can_add_shared_updates,is_primary)
    values ($1,$2,$2,'active','active','transfer_attorney',true,true,true,true,true)`, [ids.matter, ids.firm])
  await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [ids.lane, ids.matter, 'transfer'])
  await db.query('insert into public.transaction_subprocess_steps values ($1,$2,$3)', [ids.step, ids.lane, 'not_started'])
  await db.query('insert into public.attorney_task_confirmations values ($1,$2,$3)',
    [ids.step, ids.lane, { received: { answer: 'yes' } }])
  await db.query('insert into public.document_requirement_instances values ($1,$2,$3)',
    [ids.requirement, ids.matter, 'transferring_attorney'])

  const as = async (actor, sql, params = []) => {
    await db.exec('reset role')
    await db.exec(`set test.actor = '${ids[actor]}'`)
    await db.exec('set role authenticated')
    return db.query(sql, params)
  }
  const access = async (actor, capability) => (await as(actor,
    'select public.bridge_attorney_matter_team_access($1,$2,$3) as allowed',
    [ids.matter, ids.firm, capability])).rows[0].allowed
  const canMutate = async (actor, capability) => (await as(actor,
    'select public.bridge_can_mutate_attorney_lane($1,$2,$3) as allowed',
    [ids.matter, 'transfer_attorney', capability])).rows[0].allowed
  const savedAnswers = async (actor) => (await as(actor,
    'select task_confirmations from public.attorney_task_confirmations where step_id=$1', [ids.step])).rows
  const review = (actor, action = 'approve', claimedRole = 'transferring_attorney') => as(actor,
    'select public.bridge_review_canonical_requirement($1,null,$2,null,$3,$4) as result',
    [ids.requirement, action, claimedRole, ids[actor]])
  const write = (actor, status, answers) => as(actor,
    'select public.test_workbench_write($1,$2,$3)', [ids.step, status, answers])

  for (const actor of ['principal', 'conveyancer', 'secretary', 'unassigned']) {
    assert.equal(await access(actor, 'view'), true, `${actor} can see an unallocated firm matter`)
    assert.equal(await canMutate(actor, 'workflow'), true, `${actor} can advance an unallocated firm matter`)
  }
  for (const actor of ['otherFirmUser', 'client']) {
    assert.equal(await access(actor, 'view'), false, `${actor} cannot see another firm's matter`)
    assert.equal(await canMutate(actor, 'workflow'), false, `${actor} cannot change another firm's matter`)
    await assert.rejects(as(actor, 'select public.bridge_get_attorney_matter_team($1)', [ids.matter]), /not available/)
  }
  await assert.rejects(as('secretary',
    'select public.bridge_set_attorney_matter_team($1,$2) as team',
    [ids.matter, [ids.secretary]]), /Only a principal/)
  const allocated = (await as('principal',
    'select public.bridge_set_attorney_matter_team($1,$2) as team',
    [ids.matter, [ids.conveyancer, ids.secretary, ids.candidate]])).rows[0].team
  assert.equal(allocated.members.length, 3)
  assert.equal((await as('principal',
    'select public.bridge_get_attorney_matter_team($1) as team', [ids.matter])).rows[0].team.members.length, 3,
  'team allocation reloads from the database')
  assert.equal(await access('unassigned', 'view'), false, 'allocation hides the matter from unassigned colleagues')
  assert.equal(await canMutate('unassigned', 'workflow'), false)
  assert.equal(await access('principal', 'manage'), true)
  assert.equal(await access('secretary', 'manage'), false)
  await write('secretary', 'in_progress', { received: { answer: 'no' } })
  assert.equal((await savedAnswers('principal'))[0].task_confirmations.received.answer, 'no',
    'an authorized answer write persists and reloads for another authorized team member')
  await assert.rejects(write('unassigned', 'completed', { received: { answer: 'yes' } }), /permission/)
  await assert.rejects(write('client', 'completed', { received: { answer: 'yes' } }), /permission/)
  await db.exec('reset role')
  assert.equal((await db.query('select status from public.transaction_subprocess_steps where id=$1', [ids.step])).rows[0].status,
    'in_progress', 'denied completion does not change task status')
  assert.equal((await savedAnswers('principal'))[0].task_confirmations.received.answer, 'no',
    'denied answer writes do not change saved answers')
  await write('principal', 'completed', { received: { answer: 'no' } })
  await db.exec('reset role')
  assert.equal((await db.query('select status from public.transaction_subprocess_steps where id=$1', [ids.step])).rows[0].status,
    'completed', 'an authorized completion persists')
  for (const actor of ['principal', 'conveyancer', 'secretary']) {
    assert.equal((await savedAnswers(actor)).length, 1, `${actor} can reload saved answers`)
    assert.equal(await canMutate(actor, 'workflow'), true)
    assert.equal((await review(actor)).rows[0].result.ok, true, `${actor} can review a document`)
  }
  for (const actor of ['unassigned', 'otherFirmUser', 'client']) {
    assert.equal((await savedAnswers(actor)).length, 0, `${actor} cannot read saved answers`)
    await assert.rejects(review(actor), /permission|requires an attorney account/i)
  }
  await assert.rejects(review('client', 'approve', 'agent'), /profile role cannot review/,
    'a client cannot claim another professional role through the RPC parameter')
  await assert.rejects(review('candidate'), /permission/,
    'a candidate attorney can move an allocated workflow but cannot approve documents')
  await assert.rejects(review('secretary', 'waive'), /Only a principal or conveyancer/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::integer as total from public.review_audit')).rows[0].total, 3,
    'denied review attempts do not write audit rows')
  assert.equal((await as('principal', `select has_function_privilege('authenticated',
    'public.bridge_review_canonical_requirement_pre_attorney_scope(uuid,uuid,text,text,text,uuid)', 'EXECUTE') as allowed`)).rows[0].allowed, false,
  'the preserved review function is not directly callable')
  assert.equal((await as('principal', `select has_function_privilege('anon',
    'public.bridge_review_canonical_requirement(uuid,uuid,text,text,text,uuid)', 'EXECUTE') as allowed`)).rows[0].allowed, false,
  'anonymous callers have no canonical review RPC grant')
  assert.equal((await as('principal', `select has_table_privilege('authenticated',
    'public.attorney_task_confirmations', 'UPDATE') as allowed`)).rows[0].allowed, false,
  'direct Data API answer writes remain unavailable')
  await db.exec('reset role')
  await db.query('update public.transaction_attorney_assignments set assignment_status=$2 where transaction_id=$1',
    [ids.matter, 'pending'])
  assert.equal((await savedAnswers('secretary')).length, 1, 'pending assignments remain readable')
  assert.equal(await canMutate('secretary', 'workflow'), true, 'instructed firm team can work before acceptance')
  await write('secretary', 'in_progress', { received: { answer: 'yes' } })
  assert.equal((await savedAnswers('principal'))[0].task_confirmations.received.answer, 'yes',
    'a pending-firm confirmation saves and reloads')
  assert.equal((await review('secretary')).rows[0].result.ok, true, 'pending-firm document review is allowed')
  assert.equal(await canMutate('unassigned', 'workflow'), false, 'allocation still hides pending matters from unassigned staff')
  assert.equal(await canMutate('otherFirmUser', 'workflow'), false)
  await db.exec('reset role')
  await db.query('update public.transaction_attorney_assignments set assignment_status=$2 where transaction_id=$1',
    [ids.matter, 'paused'])
  assert.equal(await canMutate('secretary', 'workflow'), false, 'paused matters stay read-only')
  console.log('Attorney Work permission contract: team allocation, answer reads, lane writes and document review PASS')
} finally {
  await db.close()
}
