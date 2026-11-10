// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { invokeDevelopmentWrite } from '../reliableWrites.js'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
const dev = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const actor = '30000000-0000-4000-8000-000000000001'
const unit = '40000000-0000-4000-8000-000000000001'
const tx = '50000000-0000-4000-8000-000000000001'
let db
beforeAll(async () => {
  db = new PGlite()
  const schema = readFileSync(new URL('../../../../sql/schema.sql', import.meta.url), 'utf8')
  const settingsDdl = schema.match(/create table if not exists development_settings \([\s\S]*?\n\);/)[0]
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    ${schema.match(/create table if not exists developments \([\s\S]*?\n\);/)[0]}
    ${schema.match(/^alter table if exists developments add column[^;]+;/gm).join('\n')}
    ${schema.match(/create table if not exists development_profiles \([\s\S]*?\n\);/)[0]}
    alter table development_profiles add column formatted_address text, add column street_address text, add column postal_code text, add column latitude numeric, add column longitude numeric, add column google_place_id text, add column seller_details jsonb;
    ${settingsDdl}
    create table units(id uuid primary key default gen_random_uuid(),development_id uuid references developments(id),unit_number text,unit_label text,
      phase text,block text,unit_type text,bedrooms numeric,list_price numeric,current_price numeric,price numeric,status text,vat_applicable boolean,notes text);
    create table transactions(id uuid primary key,development_id uuid,unit_id uuid,stage text,current_main_stage text,lifecycle_state text,updated_at timestamptz);
    create table transaction_lifecycle_workflows(transaction_id uuid primary key,current_stage text,status text,last_updated_by uuid,last_updated_at timestamptz,completed_at timestamptz);
    create table transaction_events(id uuid default gen_random_uuid(),transaction_id uuid,event_type text,created_by uuid,created_by_role text,event_data jsonb);
    create table developer_leads(developer_lead_id uuid,preferred_unit_id uuid,reservation_state text,converted_transaction_id uuid);
    create function bridge_current_profile_role() returns text language sql as $$select 'developer'::text$$;
    create function bridge_can_manage_development_record(target_development_id uuid) returns boolean language sql stable security invoker as $$select exists(select 1 from public.developments where id=target_development_id and organisation_id=auth.uid())$$;
    create function bridge_set_development_lead_reservation(lead_id uuid,unit_id uuid,reserved boolean) returns jsonb language plpgsql as $$begin
      update public.developer_leads set reservation_state='none' where developer_lead_id=lead_id;
      update public.units set status='Available' where id=unit_id; return jsonb_build_object('developerLeadId',lead_id,'unitId',unit_id,'reservationState','none','unitStatus','Available'); end$$;
    -- The existing canonical registration command is the authority; this fixture
    -- rejects missing evidence to verify that the stock path cannot bypass it.
    create function bridge_commit_transaction_lifecycle(transaction_id uuid,action text) returns jsonb language plpgsql as $$begin
      raise exception 'Registration evidence is required.' using errcode='23514'; end$$;
    grant usage on schema auth to authenticated;
    grant select,update on developments to authenticated;
    grant select,insert,update on development_profiles,development_settings,units,transactions,transaction_lifecycle_workflows,transaction_events,developer_leads to authenticated;
    alter table developments enable row level security;
    create policy owned on developments to authenticated using(organisation_id=auth.uid()) with check(organisation_id=auth.uid());
  `)
  for (const table of ['development_profiles','development_settings','units','transactions']) {
    await db.exec(`alter table ${table} enable row level security;
      create policy view_${table} on ${table} for select to authenticated using(bridge_can_manage_development_record(development_id));
      create policy insert_${table} on ${table} for insert to authenticated with check(bridge_can_manage_development_record(development_id) and current_setting('test.deny_table',true)<>'${table}');
      create policy update_${table} on ${table} for update to authenticated using(bridge_can_manage_development_record(development_id) and current_setting('test.deny_table',true)<>'${table}') with check(bridge_can_manage_development_record(development_id));`)
  }
  for (const table of ['transaction_lifecycle_workflows','transaction_events']) {
    await db.exec(`alter table ${table} enable row level security;
      create policy read_${table} on ${table} for select to authenticated using(exists(select 1 from transactions t where t.id=transaction_id));
      create policy insert_${table} on ${table} for insert to authenticated with check(current_setting('test.deny_table',true)<>'${table}' and exists(select 1 from transactions t where t.id=transaction_id));
      create policy update_${table} on ${table} for update to authenticated using(current_setting('test.deny_table',true)<>'${table}' and exists(select 1 from transactions t where t.id=transaction_id));`)
  }
  await db.exec(`create function reject_unit() returns trigger language plpgsql as $$ begin
    if new.unit_number='FAIL' then raise exception 'Fixture unit rejected.'; end if;
    if new.unit_number='IGNORE' then return null; end if; return new; end $$;
    create trigger reject_unit before insert or update on units for each row execute function reject_unit();`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261109185024_development_reliable_writes.sql', import.meta.url), 'utf8'))
}, 30_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`reset role; grant insert on arch9_private.development_write_receipts to authenticated; set test.deny_table=''; truncate arch9_private.development_write_receipts,development_profiles,development_settings,units,transactions,transaction_events,transaction_lifecycle_workflows,developer_leads,developments;`)
  await db.query('insert into developments(id,organisation_id,name) values($1,$2,\'Original\'),($3,$3,\'Other\')',[dev,actor,other])
  await db.query('insert into development_profiles(development_id,description,marketing_content) values($1,\'Original copy\',\'{"headline":"Original"}\')',[dev])
  await db.query('insert into development_settings(development_id,stakeholder_teams) values($1,\'{"agents":[{"name":"Preserve this agent"}]}\')',[dev])
  await db.query('insert into units(id,development_id,unit_number,status) values($1,$2,\'001\',\'OTP Signed\')',[unit,dev])
  await db.query('insert into transactions values($1,$2,$3,\'OTP Signed\',\'OTP\',\'active\',now())',[tx,dev,unit])
  await db.query("select set_config('test.actor',$1,false)",[actor]); await db.exec('set role authenticated;')
})
const details = (id = crypto.randomUUID(), drev = 0, prev = 0, d = { name: 'Updated' }, p = { marketing_content: { headline: 'Updated' } }, developmentId = dev) =>
  db.query('select bridge_save_development_details($1,$2,$3::jsonb,$4::jsonb,$5,$6) result',[developmentId,id,JSON.stringify(d),JSON.stringify(p),drev,prev]).then(r=>r.rows[0].result)
const status = (id = crypto.randomUUID(), value='Finance Pending', expected='OTP Signed', transactionId=tx, patch={}, reservationLeadId=null) =>
  db.query('select bridge_save_development_unit_status($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[dev,id,unit,transactionId,expected,value,JSON.stringify(patch),reservationLeadId]).then(r=>r.rows[0].bridge_save_development_unit_status)
const batch = (id=crypto.randomUUID(), rows=[{unitNumber:'002'},{unitNumber:'003'}]) =>
  db.query('select bridge_create_development_units_batch($1,$2,$3::jsonb) result',[dev,id,JSON.stringify(rows)]).then(r=>r.rows[0].result)
async function snapshot() {
  await db.exec('reset role;')
  const result = {}
  for (const table of ['developments','development_profiles','development_settings','units','transactions','transaction_lifecycle_workflows','transaction_events','arch9_private.development_write_receipts']) {
    result[table]=(await db.query(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`)).rows
  }
  await db.exec('set role authenticated;'); return result
}

it('atomically saves profile and feature switches without changing the default team', async () => {
  const result=await details(undefined,0,0,{name:'Updated',snag_tracking_enabled:false},{description:'Updated copy',marketing_content:{headline:'Updated'}})
  expect(result).toMatchObject({developmentId:dev,developmentRevision:1,profileRevision:1})
  const row=(await db.query('select * from development_settings')).rows[0]
  expect(row.snag_reporting_enabled).toBe(false)
  expect(row.stakeholder_teams.agents[0].name).toBe('Preserve this agent')
})
it.each(['development_profiles','development_settings'])('rolls the entire details save back when %s is denied',async table=>{
  const before=await snapshot(); await db.query("select set_config('test.deny_table',$1,false)",[table])
  await expect(details(undefined,0,0,{name:'Updated',snag_tracking_enabled:false})).rejects.toThrow()
  expect(await snapshot()).toEqual(before)
})
it('rejects stale editors without changing any data',async()=>{
  await details(); const before=await snapshot()
  await expect(details()).rejects.toMatchObject({code:'40001'})
  expect(await snapshot()).toEqual(before)
})
it('detects writes by older clients through the revision triggers',async()=>{
  await db.query('update development_profiles set description=\'External edit\' where development_id=$1',[dev])
  const before=await snapshot(); await expect(details()).rejects.toMatchObject({code:'40001'}); expect(await snapshot()).toEqual(before)
})
it('replays the original details receipt after a lost reply without a second revision change',async()=>{
  const id=crypto.randomUUID(), first=await details(id), before=await snapshot()
  expect(await details(id)).toEqual(first); expect(await snapshot()).toEqual(before)
})
it('rejects reusing a committed request for different changes',async()=>{
  const id=crypto.randomUUID(); await details(id); const before=await snapshot()
  await expect(details(id,0,0,{name:'Different'})).rejects.toMatchObject({code:'22023'}); expect(await snapshot()).toEqual(before)
})
it('checks missing profile versions before first-save inserts',async()=>{
  await db.exec('reset role; delete from development_profiles; set role authenticated;')
  await expect(details()).rejects.toMatchObject({code:'40001'})
  expect(await details(undefined,0,null)).toMatchObject({profileRevision:0})
})
it('commits stock, transaction, workflow and audit together',async()=>{
  const result=await status(); expect(result.unit.status).toBe('Finance Pending')
  expect((await db.query('select current_main_stage from transactions')).rows[0].current_main_stage).toBe('FIN')
  expect((await db.query('select current_stage from transaction_lifecycle_workflows')).rows[0].current_stage).toBe('finance')
  expect((await db.query('select count(*)::int count from transaction_events')).rows[0].count).toBe(1)
})
it.each(['units','transactions','transaction_lifecycle_workflows','transaction_events'])('keeps all status records unchanged if %s rejects a write',async table=>{
  const before=await snapshot(); await db.query("select set_config('test.deny_table',$1,false)",[table])
  await expect(status()).rejects.toMatchObject({code:'42501'}); expect(await snapshot()).toEqual(before)
})
it('replays stock status safely with one lifecycle event',async()=>{
  const id=crypto.randomUUID(), first=await status(id), before=await snapshot()
  expect(await status(id)).toEqual(first); expect(await snapshot()).toEqual(before)
})
it('rejects stale stock and stale transaction associations',async()=>{
  const before=await snapshot()
  await expect(status(undefined,'Finance Pending','Available')).rejects.toMatchObject({code:'40001'})
  await expect(status(undefined,'Finance Pending','OTP Signed',null)).rejects.toMatchObject({code:'40001'})
  expect(await snapshot()).toEqual(before)
})
it('does not bypass canonical registration evidence checks',async()=>{
  const before=await snapshot(); await expect(status(undefined,'Registered')).rejects.toThrow('Registration evidence')
  expect(await snapshot()).toEqual(before)
})
it('does not reset transaction progress when only stock metadata is saved',async()=>{
  await status(undefined,'OTP Signed','OTP Signed',tx,{unit_label:'A1'})
  expect((await db.query('select count(*)::int count from transaction_events')).rows[0].count).toBe(0)
  expect((await db.query('select current_main_stage from transactions')).rows[0].current_main_stage).toBe('OTP')
})
it('creates the full batch and replays it with the same saved unit IDs',async()=>{
  const id=crypto.randomUUID(), first=await batch(id), before=await snapshot()
  expect(first.units.map(u=>u.unit_number)).toEqual(['002','003'])
  expect(await batch(id)).toEqual(first); expect(await snapshot()).toEqual(before)
})
it.each(['FAIL','IGNORE'])('rolls back every batch row and its receipt if a row is %s',async number=>{
  const before=await snapshot(); await expect(batch(undefined,[{unitNumber:'002'},{unitNumber:number}])).rejects.toThrow()
  expect(await snapshot()).toEqual(before)
})
it('rejects existing numbers, duplicate batch numbers and progressed initial statuses',async()=>{
  const before=await snapshot()
  await expect(batch(undefined,[{unitNumber:' 001 '}])).rejects.toMatchObject({code:'23505'})
  await expect(batch(undefined,[{unitNumber:'A'},{unitNumber:'a'}])).rejects.toMatchObject({code:'23505'})
  await expect(batch(undefined,[{unitNumber:'002',status:'Finance Pending'}])).rejects.toMatchObject({code:'22023'})
  expect(await snapshot()).toEqual(before)
})
it('denies another workspace and anonymous callers',async()=>{
  const before=await snapshot(); await expect(details(undefined,0,0,undefined,undefined,other)).rejects.toMatchObject({code:'42501'})
  expect(await snapshot()).toEqual(before)
  await db.exec('reset role; set role anon;'); await expect(details()).rejects.toMatchObject({code:'42501'})
})

it('rolls a buyer reservation release back when its stock change fails',async()=>{
  const lead='60000000-0000-4000-8000-000000000001'
  await db.query("update transactions set lifecycle_state='cancelled' where id=$1",[tx])
  await db.query("update units set status='Reserved' where id=$1",[unit])
  await db.query("insert into developer_leads values($1,$2,'reserved',null)",[lead,unit])
  const before=await snapshot()
  const beforeLeads=(await db.query('select * from developer_leads')).rows
  await db.exec("set test.deny_table='units';")
  await expect(status(undefined,'Not Released','Reserved',null,{},lead)).rejects.toMatchObject({code:'42501'})
  expect(await snapshot()).toEqual(before)
  expect((await db.query('select * from developer_leads')).rows).toEqual(beforeLeads)
  await db.exec("set test.deny_table='';")
  const saved=await status(undefined,'Not Released','Reserved',null,{},lead)
  expect(saved.reservation.reservationState).toBe('none')
  expect(saved.unit.status).toBe('Not Released')
})
it('recovers a committed bulk save through the real SDK after losing its HTTP response',async()=>{
  let loseResponse=true, requests=0
  const client=createClient('https://fixture.invalid','fixture-public-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,options)=>{
      const request=new Request(input,options), args=await request.json(); requests+=1
      expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/bridge_create_development_units_batch')
      const saved=await db.query('select bridge_create_development_units_batch($1,$2,$3::jsonb) result',[args.p_development_id,args.p_request_id,JSON.stringify(args.p_units)])
      if(loseResponse){loseResponse=false;throw new TypeError('Network response lost after commit')}
      return new Response(JSON.stringify(saved.rows[0].result),{headers:{'Content-Type':'application/json'}})
    }},
  })
  client.auth.getSession=async()=>({data:{session:{user:{id:actor}}},error:null})
  const saved=await invokeDevelopmentWrite(client,'bridge_create_development_units_batch',dev,{p_units:[{unitNumber:'SDK-001'},{unitNumber:'SDK-002'}]})
  expect(saved.units.map(row=>row.unit_number)).toEqual(['SDK-001','SDK-002'])
  expect(requests).toBe(2)
  expect((await db.query("select count(*)::int count from units where unit_number like 'SDK-%'")).rows[0].count).toBe(2)
  expect((await db.query('select count(*)::int count from arch9_private.development_write_receipts')).rows[0].count).toBe(1)
})

it.each([{name:'details',write:details},{name:'stock status',write:status},{name:'bulk stock',write:batch}])('rolls back $name if its durable receipt cannot be stored',async({write})=>{
  const before=await snapshot()
  await db.exec('reset role; revoke insert on arch9_private.development_write_receipts from authenticated; set role authenticated;')
  await expect(write()).rejects.toMatchObject({code:'42501'})
  expect(await snapshot()).toEqual(before)
})
it('restricts the new endpoints and immutable private receipts to their intended roles',async()=>{
  await db.exec('reset role;')
  const functions=(await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon_allowed,has_function_privilege('authenticated',oid,'execute') auth_allowed from pg_proc where proname in ('bridge_save_development_details','bridge_save_development_unit_status','bridge_create_development_units_batch')")).rows
  expect(functions).toHaveLength(3)
  for(const f of functions){expect(f.prosecdef).toBe(false);expect(f.proconfig).toContain('search_path=""');expect(f.anon_allowed).toBe(false);expect(f.auth_allowed).toBe(true)}
  const permissions=(await db.query("select has_table_privilege('anon','arch9_private.development_write_receipts','select') anon_read,has_table_privilege('authenticated','arch9_private.development_write_receipts','update') auth_update,has_table_privilege('authenticated','arch9_private.development_write_receipts','delete') auth_delete")).rows[0]
  expect(permissions).toEqual({anon_read:false,auth_update:false,auth_delete:false})
})
