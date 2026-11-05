// Use the primary app's pinned PGlite runtime by default; an external runtime
// can be supplied with ARCH9_TEST_PGLITE_PATH. No remote database is contacted.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.ARCH9_TEST_PGLITE_PATH || '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js')
const db = new PGlite()
const foundation = readFileSync('supabase/migrations/20260909113000_email_campaigns_foundation.sql','utf8')
const domainSql = readFileSync('supabase/migrations/20260914073546_email_sending_domains_phase1.sql','utf8')
const org='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const table = (name) => foundation.slice(foundation.indexOf(`create table if not exists public.${name} (`)).split('\n);')[0]+'\n);'
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql as $$ select current_setting('role',true) $$;
create table public.organisations(id uuid primary key); create table public.organisation_branches(id uuid primary key);
create function public.email_campaign_can_send(id uuid) returns boolean language sql as $$ select id::text=current_setting('test.org',true) $$;
create function public.bridge_has_organisation_membership(id uuid) returns boolean language sql as $$ select id::text=current_setting('test.org',true) $$;
create function public.arch9_admin_access_level() returns jsonb language sql as $$ select jsonb_build_object('level',current_setting('test.level',true)) $$;
create function public.email_campaign_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
${table('email_sender_identities')}
${table('email_sending_policies')}
${table('email_subscription_types')}
create table public.email_campaign_recipients(id uuid primary key default gen_random_uuid(),organisation_id uuid, status text, sent_at timestamptz);
`)
await db.exec(domainSql.replace(/^begin;/,'').replace(/commit;\s*$/,''))
await db.exec(readFileSync('supabase/migrations/20260914073806_email_sending_domain_guard_fix_phase1.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20260914080640_email_sending_operator_console_phase6.sql','utf8').split('create or replace function public.arch9_admin_set_email_sending_policy')[0].replace(/^begin;/,'') + `
alter table public.email_sending_policies add column approved_at timestamptz,add column approved_by uuid,add column approval_note text;
create trigger email_sending_policies_approval_guard before insert or update on public.email_sending_policies for each row execute function public.email_sending_policy_protect_approval();
`)
const types=foundation.slice(foundation.indexOf('create or replace function public.email_campaign_ensure_subscription_types')).split('end $$;')[0]+'end $$;'
await db.exec(types)
await db.exec(`grant usage on schema public,auth to authenticated,service_role; grant execute on all functions in schema auth to authenticated,service_role;
grant select,insert,update on public.email_sender_identities,public.email_sending_policies to authenticated;
grant all on all tables in schema public to service_role;
insert into public.organisations values('${org}'),('${other}'); insert into auth.users values('${user}');
set request.jwt.claim.sub='${user}'; set test.org='${org}';`)
await db.exec(readFileSync('supabase/migrations/20261022081153_agency_self_service_email.sql','utf8'))
const one = async (sql,params=[]) => (await db.query(sql,params)).rows[0]
const d=(await one(`insert into public.email_sending_domains(organisation_id,domain_name,provider_domain_id) values($1,'updates.agency.co.za','provider') returning id`,[org])).id
await db.exec('set role authenticated')
const sender=await one(`select * from public.email_save_sender($1,$2,'Agency','news@updates.agency.co.za','office@agency.co.za')`,[org,d])
assert.equal(sender.verification_status,'pending'); assert.equal(sender.is_default,true)
await assert.rejects(db.query(`update public.email_sending_policies set approved_at=now()`), /permission denied/)
await assert.rejects(db.query(`update public.email_sender_identities set verification_status='verified'`), /permission denied/)
await assert.rejects(db.query(`select public.email_apply_domain_status($1,'verified','[]')`,[d]), /permission denied/)
await assert.rejects(db.query(`select public.email_save_sender($1,$2,'Agency','news@updates.agency.co.za','office@agency.co.za')`,[other,d]), /Only an agency/)
await assert.rejects(db.query(`select public.email_save_sender($1,$2,'Agency','news@other.co.za','office@agency.co.za')`,[org,d]), /matching agency domain/)
await assert.rejects(db.query(`select public.email_save_sender($1,$2,'Agency',null,null)`,[org,d]), /matching agency domain/)
await db.exec('reset role; set role service_role')
await db.query(`select public.email_apply_domain_status($1,'verified','[]')`,[d])
assert.equal((await one(`select verification_status from public.email_sender_identities where id=$1`,[sender.id])).verification_status,'verified')
const policy=await one(`select * from public.email_sending_policies where organisation_id=$1`,[org])
assert.ok(policy.approved_at); assert.equal(policy.daily_recipient_limit,500)
assert.equal((await one(`select count(*)::integer n from public.email_subscription_types where organisation_id=$1`,[org])).n,5)
await db.exec('reset role; set role authenticated')
const second=await one(`select * from public.email_save_sender($1,$2,'Other sender','other@updates.agency.co.za','office@agency.co.za')`,[org,d])
assert.equal(second.verification_status,'verified')
assert.equal((await one(`select count(*)::integer n from public.email_sender_identities where organisation_id=$1 and is_default`,[org])).n,1)
await db.exec('reset role; set role service_role')
for(let i=0;i<5;i++) assert.equal((await one(`select public.email_reserve_send($1,$2,$3,$4,true) ok`,[org,sender.id,`test:${i}`,user])).ok,true)
assert.equal((await one(`select public.email_reserve_send($1,$2,'test:6',$3,true) ok`,[org,sender.id,user])).ok,false)
// A repeated key remains idempotent and does not consume another quota slot.
assert.equal((await one(`select public.email_reserve_send($1,$2,'test:0',$3,true) ok`,[org,sender.id,user])).ok,true)
for(let i=5;i<500;i++) assert.equal((await one(`select public.email_reserve_send($1,$2,$3) ok`,[org,sender.id,`recipient:${i}`])).ok,true)
assert.equal((await one(`select public.email_reserve_send($1,$2,'over-limit') ok`,[org,sender.id])).ok,false)
await db.query(`update public.email_sending_policies set paused_at=now() where organisation_id=$1`,[org])
await db.query(`select public.email_apply_domain_status($1,'verified','[]')`,[d])
assert.ok((await one(`select paused_at from public.email_sending_policies where organisation_id=$1`,[org])).paused_at)
await db.query(`select public.email_apply_domain_status($1,'failed','[]')`,[d])
assert.equal((await one(`select verification_status from public.email_sender_identities where id=$1`,[sender.id])).verification_status,'failed')
await db.exec(`reset role; set test.level='executive'; set role authenticated;`)
await db.query(`select public.arch9_admin_set_email_sending_policy($1,false)`,[org])
await db.exec('reset role; set role service_role')
await db.query(`select public.email_apply_domain_status($1,'verified','[]')`,[d])
assert.equal((await one(`select approved_at from public.email_sending_policies where organisation_id=$1`,[org])).approved_at,null)
await db.exec('reset role;')
await db.query(`update public.email_sending_policies set approved_at=now(),paused_at=null,self_service_blocked=false where organisation_id=$1`,[org])
const recipient=await one(`insert into public.email_campaign_recipients(organisation_id,status,sent_at) values($1,'sent',now()) returning id`,[org])
await db.query(`update public.email_campaign_recipients set status='complained' where id=$1`,[recipient.id])
assert.ok((await one(`select paused_at from public.email_sending_policies where organisation_id=$1`,[org])).paused_at)
await db.close()
console.log('Self-service email database checks passed: ownership, automatic activation, defaults, privileges, quota, retries, domain loss and safety stops.')
