import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const lyle = '39b18f3e-5352-4b73-acdd-014e12f3924c'
const org = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'
const other = '11111111-1111-4111-8111-111111111111'
const agent = '22222222-2222-4222-8222-222222222222'
const principal = '33333333-3333-4333-8333-333333333333'
const manager = '44444444-4444-4444-8444-444444444444'
const outsider = '55555555-5555-4555-8555-555555555555'
const read = file => readFileSync(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8')
const foundation = read('20260906163615_corrective_development_org_relationships.sql')
function fn(name) {
  const at = foundation.indexOf('create or replace function public.' + name + '(')
  assert.ok(at >= 0)
  return foundation.slice(at, foundation.indexOf('$$;', foundation.indexOf('as $$', at)) + 3)
}
const one = async sql => (await db.query(sql)).rows[0]
const as = async user => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`) }
try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table organisation_users(user_id uuid,organisation_id uuid,status text,role text,workspace_role text,organisation_role text);
    create table development_organisation_relationships(development_id uuid,organisation_id uuid,status text,can_view boolean default true,can_operate boolean default true,can_manage boolean default true,can_manage_inventory boolean default true,can_manage_pricing boolean default true,can_manage_reservations boolean default true,can_view_financials boolean default true);
    create function bridge_is_admin() returns boolean language sql stable as $$ select false $$;
    create function bridge_is_active_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where user_id=auth.uid() and organisation_id=org and status='active') $$;
    create function bridge_has_development_access(dev uuid) returns boolean language sql stable as $$ select false $$;
    create table developments(id uuid primary key,name text);
    create table units(id int primary key,development_id uuid,status text);
    create table development_settings(development_id uuid primary key,setting text);
    create table developer_leads(id int primary key,developer_org_id uuid,source_agency_org_id uuid,primary_development_id uuid,lead_owner text,ownership_model text,visibility_state text,selling_model text,stage text);
  `)
  for (const name of ['bridge_has_development_relationship_capability','bridge_can_manage_development_record','bridge_can_manage_development_units','bridge_can_view_development_record']) await db.exec(fn(name))
  await db.exec(`
    insert into organisation_users values ('${agent}','${org}','active','principal','agent','agent'),('${principal}','${org}','active','principal','principal','principal'),('${manager}','${org}','active','agent','manager','manager'),('${outsider}','${other}','active','principal','principal','principal');
    insert into development_organisation_relationships(development_id,organisation_id,status) values ('${lyle}','${org}','active'),('${other}','${org}','active');
    insert into developments values('${lyle}','The Lyle');
    insert into units values (1,'${lyle}','Available'),(2,'${other}','Available');
    insert into development_settings values('${lyle}','unchanged');
    alter table units enable row level security;
    -- Simulate a legacy permissive path: the new restrictive boundary must win.
    create policy legacy_unit_access on units for all to authenticated using(true) with check(true);
    alter table developments enable row level security;
    create policy development_read on developments for select to authenticated using(bridge_can_view_development_record(id));
    create policy development_update on developments for update to authenticated using(bridge_can_manage_development_record(id)) with check(bridge_can_manage_development_record(id));
    alter table development_settings enable row level security;
    create policy settings_read on development_settings for select to authenticated using(bridge_can_view_development_record(development_id));
    create policy settings_update on development_settings for update to authenticated using(bridge_can_manage_development_record(development_id)) with check(bridge_can_manage_development_record(development_id));
    alter table developer_leads enable row level security;
    create policy developer_leads_insert_scoped on developer_leads for insert to authenticated with check(false);
    create policy leads_read on developer_leads for select to authenticated using(bridge_is_active_member(developer_org_id) or bridge_is_active_member(source_agency_org_id));
    create policy leads_update on developer_leads for update to authenticated using(bridge_is_active_member(developer_org_id) or bridge_is_active_member(source_agency_org_id)) with check(bridge_is_active_member(developer_org_id) or bridge_is_active_member(source_agency_org_id));
    grant usage on schema auth to authenticated;
    grant select,insert,update,delete on units,developments,development_settings,developer_leads to authenticated;
  `)
  await as(agent)
  assert.equal((await one(`select bridge_can_manage_development_units('${lyle}') allowed`)).allowed, true, 'reproduces original agent stock access')
  await db.exec('reset role')
  await db.exec(read('20261109060606_revo_lyle_management_roles.sql'))
  await as(agent)
  assert.equal((await one(`select bridge_can_manage_development_units('${lyle}') allowed`)).allowed, false)
  assert.equal((await one(`select bridge_can_manage_development_record('${lyle}') allowed`)).allowed, false, 'workspace agent cannot use legacy principal role')
  for (const capability of ['view','operate','reservations']) assert.equal((await one(`select bridge_has_development_relationship_capability('${lyle}','${capability}') allowed`)).allowed, true)
  assert.equal((await one(`select bridge_has_development_relationship_capability('${lyle}','pricing') allowed`)).allowed, false)
  assert.equal((await db.query('select * from units')).rows.length, 2, 'stock remains readable')
  assert.equal((await db.query("update units set status='Sold' where id=1 returning id")).rows.length, 0, 'legacy write policy cannot bypass restriction')
  assert.equal((await db.query('delete from units where id=1 returning id')).rows.length, 0)
  await assert.rejects(db.exec(`insert into units values(3,'${lyle}','Available')`), /row-level security/)
  assert.equal((await db.query("update development_settings set setting='changed' returning *")).rows.length, 0)
  assert.equal((await db.query("update developments set name='Changed' returning *")).rows.length, 0)
  await db.exec(`insert into developer_leads values(1,'${org}',null,'${lyle}','developer','developer_direct','full','developer_led','New Lead')`)
  await db.exec(`insert into developer_leads values(2,'${other}','${org}','${lyle}','agency','agency_introduced','limited','agent_led','New Lead')`)
  assert.equal((await db.query("update developer_leads set stage='Viewing' returning id")).rows.length, 2, 'lead processing remains available')
  assert.equal((await db.query("update units set status='Reserved' where id=2 returning id")).rows.length, 1, 'other developments unchanged')
  for (const user of [principal,manager]) {
    await as(user)
    assert.equal((await one(`select bridge_can_manage_development_record('${lyle}') allowed`)).allowed, true)
    assert.equal((await db.query("update units set status='Available' where id=1 returning id")).rows.length, 1)
    assert.equal((await db.query("update development_settings set setting='reviewed' returning *")).rows.length, 1)
  }
  await as(outsider)
  assert.equal((await one(`select bridge_can_manage_development_units('${lyle}') allowed`)).allowed, false)
  await assert.rejects(db.exec(`insert into developer_leads values(3,'${org}','${org}','${lyle}','agency','agency_introduced','limited','agent_led','New Lead')`), /row-level security/)
  await db.exec(`reset role;update organisation_users set status='inactive' where user_id='${manager}';`)
  await as(manager)
  assert.equal((await one(`select bridge_can_manage_development_record('${lyle}') allowed`)).allowed, false)
  console.log('Revo development access: role restriction, real RLS stock/settings denial, lead capture/update, legacy bypass, organisation boundary and inactive membership passed')
} finally { await db.close() }
