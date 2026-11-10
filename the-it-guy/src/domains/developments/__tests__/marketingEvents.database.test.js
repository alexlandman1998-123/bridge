// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const dev='20000000-0000-4000-8000-000000000001', org='30000000-0000-4000-8000-000000000001', actor='40000000-0000-4000-8000-000000000001', other='50000000-0000-4000-8000-000000000001'
let db
beforeAll(async()=>{
  db=new PGlite()
  const events=readFileSync(new URL('../../../../../supabase/migrations/20260901165146_marketing_event_foundation_phase1.sql',import.meta.url),'utf8')
  const foundation=readFileSync(new URL('../../../../../supabase/migrations/20261109185024_development_reliable_writes.sql',import.meta.url),'utf8').split('create or replace function public.bridge_save_development_details')[0]
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table organisations(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create table developments(id uuid primary key,organisation_id uuid);
    create table development_profiles(development_id uuid primary key);
    create function bridge_has_organisation_membership(target uuid) returns boolean language sql stable set search_path='' as $$select target='${org}'::uuid and auth.uid()='${actor}'::uuid$$;
    create function bridge_can_manage_development_record(target uuid) returns boolean language sql stable set search_path='' as $$select exists(select 1 from public.developments where id=target and public.bridge_has_organisation_membership(organisation_id))$$;
    create table development_marketing_activity(id uuid default gen_random_uuid(),development_id uuid,actor_user_id uuid,action_type text,metadata jsonb);
    grant usage on schema auth to authenticated;
    grant select,update on developments to authenticated;
    grant insert on development_marketing_activity to authenticated;
    alter table developments enable row level security;
    create policy visible_development on developments to authenticated using(bridge_has_organisation_membership(organisation_id));
  `)
  await db.exec(events)
  await db.exec(foundation)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261109191146_development_marketing_event_retry_safety.sql',import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{
  await db.exec('reset role; grant insert on development_marketing_activity,arch9_private.development_write_receipts,marketing_events to authenticated; truncate arch9_private.development_write_receipts,marketing_events,development_marketing_activity,development_profiles,developments,organisations,auth.users;')
  await db.query('insert into auth.users values($1),($2)',[actor,other]);await db.query('insert into organisations values($1),($2)',[org,other]);await db.query('insert into developments(id,organisation_id) values($1,$2),($3,$3)',[dev,org,other])
  await db.query("select set_config('test.actor',$1,false)",[actor]);await db.exec('set role authenticated;')
})
const input=()=>({organisation_id:org,event_type:'show_day',status:'upcoming',title:'Sunday viewing',subject_label:'Development fixture',starts_at:'2026-11-15T10:00:00.000Z',location:'Sales centre',description:'Parking at reception'})
const save=(id=crypto.randomUUID(),event=input(),developmentId=dev)=>db.query('select bridge_create_development_marketing_event($1,$2,$3::jsonb) receipt',[developmentId,id,JSON.stringify(event)]).then(r=>r.rows[0].receipt)
async function counts(){await db.exec('reset role;');const result={};for(const table of ['marketing_events','development_marketing_activity','arch9_private.development_write_receipts'])result[table]=(await db.query(`select count(*)::int count from ${table}`)).rows[0].count;await db.exec('set role authenticated;');return result}
it('saves one scoped event, its organiser, activity and durable receipt',async()=>{
  const saved=await save()
  expect(saved).toMatchObject({developmentId:dev,activitySaved:true,event:{organisation_id:org,subject_type:'development',subject_id:dev,created_by:actor,title:'Sunday viewing'}})
  expect(await counts()).toEqual({marketing_events:1,development_marketing_activity:1,'arch9_private.development_write_receipts':1})
})
it('returns the original saved event after a lost reply without another activity entry',async()=>{
  const id=crypto.randomUUID(),first=await save(id)
  expect(await save(id)).toEqual(first)
  expect(await counts()).toEqual({marketing_events:1,development_marketing_activity:1,'arch9_private.development_write_receipts':1})
})
it('does not create another event if an uncertain draft is edited and resubmitted',async()=>{
  const id=crypto.randomUUID();await save(id)
  await expect(save(id,{...input(),description:'Changed after response loss'})).rejects.toThrow('already saved with different details')
  expect((await counts()).marketing_events).toBe(1)
})
it('allows a deliberately new event with identical details and a new request',async()=>{
  const first=await save(),second=await save()
  expect(first.event.id).not.toBe(second.event.id)
  expect((await counts()).marketing_events).toBe(2)
})
it('keeps the authoritative event when optional activity cannot be written',async()=>{
  await db.exec('reset role; revoke insert on development_marketing_activity from authenticated; set role authenticated;')
  const id=crypto.randomUUID(),saved=await save(id)
  expect(saved.activitySaved).toBe(false)
  expect(await save(id)).toEqual(saved)
  expect(await counts()).toEqual({marketing_events:1,development_marketing_activity:0,'arch9_private.development_write_receipts':1})
})
it.each(['marketing_events','arch9_private.development_write_receipts'])('leaves no partial creation when %s rejects the save',async table=>{
  await db.exec(`reset role; revoke insert on ${table} from authenticated; set role authenticated;`)
  await expect(save()).rejects.toMatchObject({code:'42501'})
  expect(await counts()).toEqual({marketing_events:0,development_marketing_activity:0,'arch9_private.development_write_receipts':0})
})
it('does not trust a client organisation, actor or foreign development',async()=>{
  await expect(save(undefined,{...input(),organisation_id:other})).rejects.toMatchObject({code:'22023'})
  await expect(save(undefined,{...input(),created_by:other})).rejects.toMatchObject({code:'22023'})
  await expect(save(undefined,input(),other)).rejects.toMatchObject({code:'42501'})
  expect((await counts()).marketing_events).toBe(0)
})
it('denies anonymous and signed-out execution without privilege escalation',async()=>{
  await db.exec('reset role;')
  const permissions=(await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon_allowed from pg_proc where proname='bridge_create_development_marketing_event'")).rows[0]
  expect(permissions.prosecdef).toBe(false);expect(permissions.proconfig).toContain('search_path=""');expect(permissions.anon_allowed).toBe(false)
  await db.exec('set role anon;');await expect(save()).rejects.toMatchObject({code:'42501'})
  await db.exec("reset role; set test.actor=''; set role authenticated;");await expect(save()).rejects.toMatchObject({code:'42501'})
})
