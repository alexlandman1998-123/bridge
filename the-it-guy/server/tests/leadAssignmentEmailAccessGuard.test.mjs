import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(fileURLToPath(new URL('../../../supabase/migrations/20261027154740_lead_assignment_email_access_guard.sql', import.meta.url)), 'utf8')
const actor = '11111111-1111-4111-8111-111111111111'
const peer = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherOrg = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function fixture() {
  const db = new PGlite()
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create table public.memberships(organisation_id uuid,user_id uuid,role text,status text);
    create table public.support_grants(organisation_id uuid,user_id uuid,supported_user_id uuid);
    create function public.bridge_is_org_admin(p_org uuid) returns boolean language sql stable security definer as $$select exists(select 1 from memberships where organisation_id=p_org and user_id=auth.uid() and role='owner' and status='active')$$;
    create function public.bridge_support_can_access_record(p_org uuid,p_branch uuid,p_kind text,p_user_a uuid,p_user_b uuid,p_user_c uuid) returns boolean language sql stable security definer as $$select exists(select 1 from support_grants where organisation_id=p_org and user_id=auth.uid() and supported_user_id in(p_user_a,p_user_b,p_user_c))$$;
    create table public.leads(id text primary key,organisation_id uuid,branch_id uuid,assigned_user_id uuid,assigned_agent_id uuid,assigned_agent_email text);
    alter table leads enable row level security;
    grant usage on schema public,auth to authenticated,anon;
    grant select on leads to authenticated,anon;
    create policy leads_support_role_select on leads for select to authenticated using (
      bridge_is_org_admin(organisation_id) or assigned_user_id=auth.uid() or assigned_agent_id=auth.uid()
      or lower(coalesce(assigned_agent_email,''))=lower(coalesce(auth.jwt()->>'email',''))
      or bridge_support_can_access_record(organisation_id,branch_id,'lead',assigned_user_id,assigned_agent_id,null));
    insert into leads(id,organisation_id,assigned_user_id,assigned_agent_id,assigned_agent_email) values
      ('blank','${org}',null,null,''),('null','${org}',null,null,null),('spaces','${org}',null,null,'   '),
      ('email','${org}',null,null,'Agent@Example.test'),('mismatch','${org}',null,null,'other@example.test'),
      ('user','${org}','${actor}',null,null),('agent','${org}',null,'${actor}',null),
      ('support','${org}','${peer}',null,null),('outside','${otherOrg}',null,null,'');`)
  return db
}
async function visible(db, claims = { sub: actor, role: 'authenticated' }, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)])
  await db.exec(`set role ${role}`)
  return (await db.query('select id from public.leads order by id')).rows.map(row => row.id)
}

test('reproduces blank-email exposure, then denies missing/empty/whitespace claims', async () => {
  const db = await fixture()
  try {
    assert((await visible(db, { sub: outsider, role: 'authenticated' })).includes('outside'))
    await db.exec('reset role'); await db.exec(migration)
    for (const email of [undefined, null, '', '   ']) {
      assert.deepEqual(await visible(db, { sub: outsider, role: 'authenticated', email }), [])
    }
    assert.deepEqual(await visible(db, { role: 'authenticated', email: 'Agent@example.test' }), [])
    assert.deepEqual(await visible(db, { sub: outsider, role: 'authenticated' }, 'anon'), [])
  } finally { await db.close() }
})

test('retains explicit assignments, nonblank email assignment, admin and support paths', async () => {
  const db = await fixture()
  try {
    await db.exec(migration)
    assert.deepEqual(await visible(db), ['agent', 'user'])
    assert.deepEqual(await visible(db, { sub: actor, role: 'authenticated', email: 'agent@EXAMPLE.test' }), ['agent', 'email', 'user'])
    await db.exec('reset role'); await db.exec(`insert into support_grants values('${org}','${actor}','${peer}')`)
    assert.deepEqual(await visible(db), ['agent', 'support', 'user'])
    await db.exec('reset role'); await db.exec(`insert into memberships values('${org}','${actor}','owner','active')`)
    assert.deepEqual(await visible(db), ['agent','blank','email','mismatch','null','spaces','support','user'])
    await db.exec('reset role'); await db.exec(`update memberships set status='suspended'`)
    assert.deepEqual(await visible(db), ['agent','support','user'])
  } finally { await db.close() }
})

test('keeps restrictive policies and lead rows intact; migration is repeatable', async () => {
  const db = await fixture()
  try {
    await db.exec(`create policy agency_two_tier_records on leads as restrictive for all to authenticated using(organisation_id='${otherOrg}') with check(organisation_id='${otherOrg}')`)
    const before = (await db.query('select * from leads order by id')).rows
    await db.exec(migration); await db.exec(migration)
    assert.deepEqual((await db.query('select * from leads order by id')).rows, before)
    assert.deepEqual(await visible(db, { sub: actor, email: 'agent@example.test' }), [])
    await db.exec('reset role')
    assert.equal((await db.query("select count(*)::int as n from pg_policy where polrelid='leads'::regclass")).rows[0].n,2)
  } finally { await db.close() }
})

test('rejects an unexpected policy shape without changing access', async () => {
  const db = await fixture()
  try {
    await db.exec('alter policy leads_support_role_select on leads to anon')
    await assert.rejects(db.exec(migration), /Expected authenticated lead SELECT policy/)
    await db.exec('rollback')
    assert.equal((await db.query("select polroles[1]= 'anon'::regrole::oid as unchanged from pg_policy where polname='leads_support_role_select'")).rows[0].unchanged,true)
  } finally { await db.close() }
})
