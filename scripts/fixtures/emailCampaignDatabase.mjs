import { readFileSync as read } from 'node:fs'
const readFileSync = (path,encoding) => read(new URL('../../'+path,import.meta.url),encoding)
export async function createEmailCampaignDatabase() {
const { PGlite } = await import(process.env.ARCH9_TEST_PGLITE_PATH || new URL('../../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href)
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
create table public.organisations(id uuid primary key); create table public.organisation_branches(id uuid primary key,organisation_id uuid);
create function public.email_campaign_can_send(p_organisation_id uuid) returns boolean language sql as $$ select p_organisation_id::text=current_setting('test.org',true) $$;
create function public.bridge_has_organisation_membership(id uuid) returns boolean language sql as $$ select id::text=current_setting('test.org',true) $$;
create function public.arch9_admin_access_level() returns jsonb language sql as $$ select jsonb_build_object('level',current_setting('test.level',true)) $$;
create function public.email_campaign_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
${[...foundation.matchAll(/create table if not exists public\.[a-z_]+ \([\s\S]*?\n\);/g)].map(m=>m[0]).join('\n')}
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

await db.exec(readFileSync('supabase/migrations/20261105154612_email_campaign_delivery_reliability.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261105160335_email_campaign_sender_options.sql','utf8'))

const one = async (sql,params=[]) => (await db.query(sql,params)).rows[0]
const asUser = async (scope=org) => { await db.exec('reset role'); await db.query("select set_config('test.org',$1,false)",[scope]); await db.exec('set role authenticated') }
const asService = () => db.exec('reset role; set role service_role')
const shared = async (scope=org,name='Agency',reply='office@agency.co.za',id=null) => one('select * from public.email_save_platform_sender($1,$2,$3,true,$4)',[scope,name,reply,id])
const reserve = async (scope,id,key) => (await one('select public.email_reserve_send($1,$2,$3) ok',[scope,id,key])).ok
for (const [file,name] of [['20261009113022_email_campaign_image_assets.sql','email_campaign_assets'],['20260913133840_email_visual_builder.sql','email_campaign_revisions']]) {
 const sql=readFileSync('supabase/migrations/'+file,'utf8'); const start=sql.indexOf('create table public.'+name+' (');
 await db.exec(sql.slice(start).split('\n);')[0]+'\n);');
}
await db.exec('grant all on email_campaign_assets,email_campaign_revisions to service_role')
await db.exec(readFileSync('supabase/migrations/20261105164327_email_campaign_organisation_isolation.sql','utf8'))
// Load the actual creator-based policy, then verify the new restrictive policy.
await db.exec(`alter table email_campaigns enable row level security;
 grant select,insert,update on email_campaigns to authenticated;
 create policy creator on email_campaigns for all to authenticated using(created_by=auth.uid()) with check(created_by=auth.uid());`)
// Apply the actual member policies to exercise browser access as well as guards.
for (const name of ['email_templates','email_saved_audiences','contact_marketing_preferences','email_marketing_contacts','email_subscription_types','email_events','email_campaign_recipients','contact_email_subscriptions']) {
 await db.exec(`alter table ${name} enable row level security; grant select,insert,update on ${name} to authenticated`)
 for (const policy of foundation.split('\n').filter(line=>line.startsWith('create policy ') && line.includes(' on public.'+name+' '))) await db.exec(policy)
}
await db.exec(`alter table email_campaign_assets enable row level security; grant select on email_campaign_assets to authenticated;
 create policy email_campaign_assets_member_read on email_campaign_assets for select to authenticated using(public.bridge_has_organisation_membership(organisation_id));`)

await db.exec(readFileSync('supabase/migrations/20261105170104_email_campaign_final_readiness.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261108160845_email_campaign_delivery_diagnostics.sql','utf8'))
return { db, one, org, other, user, asUser, asService, shared, reserve, foundation }
}
