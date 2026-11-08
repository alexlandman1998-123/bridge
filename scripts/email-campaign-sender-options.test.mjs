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

await db.exec(table('email_campaigns') + table('email_campaign_audit_events'))
await db.exec(readFileSync('supabase/migrations/20261105160335_email_campaign_sender_options.sql','utf8'))

const one = async (sql,params=[]) => (await db.query(sql,params)).rows[0]
const asUser = async (scope=org) => { await db.exec('reset role'); await db.query("select set_config('test.org',$1,false)",[scope]); await db.exec('set role authenticated') }
const asService = () => db.exec('reset role; set role service_role')
const shared = async (scope=org,name='Agency',reply='office@agency.co.za',id=null) => one('select * from public.email_save_platform_sender($1,$2,$3,true,$4)',[scope,name,reply,id])
const reserve = async (scope,id,key) => (await one('select public.email_reserve_send($1,$2,$3) ok',[scope,id,key])).ok
try {
 await asUser()
 const sender=await shared()
 assert.equal(sender.sender_mode,'arch9'); assert.equal(sender.from_email,'noreply@updates.arch9.co.za'); assert.equal(sender.email_sending_domain_id,null)
 assert.equal(sender.reply_to_email,'office@agency.co.za')
 assert.equal((await one('select public.email_campaign_platform_sender_status($1) s',[org])).s.ready,false)
 await assert.rejects(db.query('select * from public.email_campaign_platform_sender'),/permission denied/)
 await assert.rejects(db.query("select public.email_campaign_apply_platform_status('platform','verified',true)"),/permission denied/)
 await assert.rejects(shared(other),/Only an organisation/)
 await assert.rejects(shared(org,'Bad\nName'),/display name/)
 await assert.rejects(shared(org,'Agency','invalid'),/inbox/)
 await asService()
 assert.equal(await reserve(org,sender.id,'disabled'),false)
 await db.query("select public.email_campaign_apply_platform_status('platform','verified',true)")
 await asUser()
 const updated=await shared(org,'Updated agency','new@agency.co.za')
 assert.equal(updated.id,sender.id)
 assert.equal((await one('select public.email_campaign_platform_sender_status($1) s',[org])).s.ready,true)
 const policy=await one('select * from email_sending_policies where organisation_id=$1',[org]); assert.ok(policy.approved_at)
 await asService()
 assert.equal(await reserve(org,sender.id,'shared1'),true)
 assert.equal(await reserve(other,sender.id,'foreign'),false)
 for(const name of ['arch9.co.za','updates.arch9.co.za','mail.updates.arch9.co.za','arch9.co.za.','updates.arch9.co.za.']) {
  await assert.rejects(db.query('insert into email_sending_domains(organisation_id,domain_name) values($1,$2)',[org,name]),/reserved/)
 }
 await assert.rejects(db.query("update email_sender_identities set from_email='spoof@updates.arch9.co.za' where id=$1",[sender.id]),/platform controlled/)
 const domain=await one("insert into email_sending_domains(organisation_id,domain_name,provider_domain_id) values($1,'updates.agency.co.za','custom-provider') returning *",[org])
 await db.query("select email_apply_domain_status($1,'verified','[]')",[domain.id])
 await asUser()
 const custom=await one("select * from email_save_sender($1,$2,'Custom','news@updates.agency.co.za','office@agency.co.za')",[org,domain.id])
 assert.equal(custom.sender_mode,'custom')
 await assert.rejects(shared(org,'Agency','office@agency.co.za',custom.id),/not found/)
 await assert.rejects(db.query("select * from email_save_sender($1,$2,'Custom','news@updates.agency.co.za','office@agency.co.za',true,$3)",[org,domain.id,sender.id]),/not found/)
 await asUser(other)
 const second=await shared(other,'Second organisation','office@second.co.za')
 assert.notEqual(second.id,sender.id)
 await assert.rejects(shared(other,'Wrong edit','office@second.co.za',sender.id),/not found/)
 await asService()
 assert.equal(await reserve(other,second.id,'second'),true)
 await db.query("select email_apply_domain_status($1,'failed','[]')",[domain.id])
 assert.equal(await reserve(org,custom.id,'custom-failed'),false)
 assert.equal(await reserve(org,sender.id,'shared-unaffected'),true)
 await db.query("select email_apply_domain_status($1,'verified','[]')",[domain.id])
 await db.query("select email_campaign_apply_platform_status('platform','failed',true)")
 assert.equal(await reserve(org,sender.id,'shared-failed'),false)
 assert.equal(await reserve(org,custom.id,'custom-unaffected'),true)
 await db.query('update email_sending_policies set paused_at=now() where organisation_id=$1',[org])
 assert.equal(await reserve(org,custom.id,'paused-custom'),false)
 await db.query("select email_campaign_apply_platform_status('platform','verified',true)")
 assert.equal(await reserve(org,sender.id,'paused-shared'),false)
 await asUser()
 await shared()
 assert.ok((await one('select paused_at from email_sending_policies where organisation_id=$1',[org])).paused_at)
 await asService()
 await db.query('update email_sending_policies set paused_at=null where organisation_id=$1',[org])
 await db.query("select email_campaign_apply_platform_status('platform','failed',true)")
 await db.exec("reset role; create function public.email_campaign_preview_audience(uuid,uuid,jsonb) returns integer language sql as $$ select 1 $$;")
 const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
 const campaign=await one("insert into email_campaigns(organisation_id,name,subject,created_by,sender_identity_id,subscription_type_id) values($1,'Shared campaign','News',$2,$3,$4) returning *",[org,user,sender.id,category.id])
 await asUser()
 const blocked=await one('select email_campaign_preflight($1) report',[campaign.id])
 assert.equal(blocked.report.checks.find(check=>check.key==='sender').ok,false)
 await assert.rejects(db.query('select email_campaign_prepare_dispatch($1,now())',[campaign.id]),/ready sender/)
 await asService(); await db.query("select email_campaign_apply_platform_status('platform','verified',true)"); await asUser()
 assert.equal((await one('select email_campaign_preflight($1) report',[campaign.id])).report.ready,true)
 console.log('Sender options database checks passed: fixed shared address, private platform state, activation, per-organisation identities, defaults, replies, ownership, reserved domains, pauses and independent verification.')
} finally { await db.close() }
