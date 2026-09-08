const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite')
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.organisations(id uuid primary key);
create table public.website_sites(id uuid primary key, organisation_id uuid, status text);
create table public.partner_routing_rules(id uuid primary key, source_organisation_id uuid, source_scope text, source_context_id uuid, target_organisation_id uuid, target_user_id uuid, is_active boolean, target_role_type text, is_default boolean, assignment_priority integer, target_scope text, assignment_mode text);
grant select on public.website_sites, public.partner_routing_rules to service_role;
grant select on public.partner_routing_rules to authenticated;
insert into auth.users values ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into public.organisations values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.website_sites values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','published');
insert into public.partner_routing_rules values ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','organisation',null,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',true,'bond_originator',true,1,'consultant','direct_consultant');
`)
await db.exec(readFileSync(new URL('../../../supabase/migrations/20260908102139_website_preapproval_intake.sql', import.meta.url),'utf8'))
await db.exec('set role service_role')
const payload = { version: 1, applicants: [{ name: 'Synthetic test' }] }
async function capture(key, data=payload) { return (await db.query('select public.website_capture_preapproval($1,$2,$3,$4) as result', ['00000000-0000-4000-8000-000000000005',JSON.stringify(data),key,'a'.repeat(64)])).rows[0].result }
const first=await capture('00000000-0000-4000-8000-000000000010'); assert.equal(first.accepted,true)
const retry=await capture('00000000-0000-4000-8000-000000000010'); assert.equal(retry.reference,first.reference);assert.equal(retry.duplicate,true)
assert.equal((await capture('00000000-0000-4000-8000-000000000010',{...payload,extra:true})).conflict,true)
await db.exec("reset role; set role authenticated; set test.uid='00000000-0000-4000-8000-000000000003'")
assert.equal((await db.query('select * from public.website_preapproval_applications')).rows.length,1)
await db.exec("set test.uid='00000000-0000-4000-8000-000000000004'")
assert.equal((await db.query('select * from public.website_preapproval_applications')).rows.length,0)
for (const sql of ['delete from public.website_preapproval_applications','update public.website_preapproval_applications set status=\'closed\'']) await assert.rejects(db.exec(sql),/permission denied/)
await assert.rejects(capture('00000000-0000-4000-8000-000000000011'),/permission denied/)
await db.exec('reset role; set role anon')
await assert.rejects(db.exec('select * from public.website_preapproval_applications'),/permission denied/)
await db.exec('reset role; update public.partner_routing_rules set is_active=false; set role service_role')
assert.equal((await capture('00000000-0000-4000-8000-000000000011')).allocationRequired,true)
await db.exec('reset role; update public.partner_routing_rules set is_active=true; set role service_role')
for(let i=11;i<15;i++) assert.equal((await capture(`00000000-0000-4000-8000-0000000000${i}`)).accepted,true)
assert.equal((await capture('00000000-0000-4000-8000-000000000015')).rateLimited,true)
console.log('PASS: migration, assigned-only reads, denied public reads/writes, idempotency, changed-payload conflict, missing allocation and rate limiting')
await db.close()
