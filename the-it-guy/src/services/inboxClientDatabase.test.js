// Run serially: an isolated Postgres instance verifies the migration's access rules.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',person='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',listing='33333333-3333-4333-8333-333333333333',dev='44444444-4444-4444-8444-444444444444',actor='55555555-5555-4555-8555-555555555555',kept='66666666-6666-4666-8666-666666666666'
test('shared client tags and property enquiries enforce tenant, author, target access and merge preservation',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema arch9_client_private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.actor',true),'')::uuid $$;
 create table public.agency_client_profiles(id uuid primary key,organisation_id uuid,merged_into uuid,unique(organisation_id,id));
 create table public.private_listings(id uuid primary key,organisation_id uuid);create table public.developments(id uuid primary key,organisation_id uuid);
 create function arch9_client_private.can_read_client(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.agency_client_profiles p where p.id=p_id and p.organisation_id=nullif(current_setting('app.org',true),'')::uuid) $$;
 grant usage on schema auth,arch9_client_private to authenticated;grant select on public.agency_client_profiles,public.private_listings,public.developments to authenticated;
 alter table public.private_listings enable row level security;alter table public.developments enable row level security;
 create policy listings_read on public.private_listings for select to authenticated using(organisation_id=nullif(current_setting('app.org',true),'')::uuid);
 create policy developments_read on public.developments for select to authenticated using(organisation_id=nullif(current_setting('app.org',true),'')::uuid);
 insert into public.agency_client_profiles values('${person}','${a}',null),('${other}','${b}',null),('${kept}','${a}',null);
 insert into public.private_listings values('${listing}','${a}');insert into public.developments values('${dev}','${b}');`)
 await db.exec(await readFile(new URL('../../../supabase/migrations/20261103192636_inbox_shared_client_tags_and_enquiries.sql',import.meta.url),'utf8'))
 await db.exec(`set role authenticated;set app.org='${a}';set app.actor='${actor}';`)
 await db.exec(`insert into public.agency_client_tags(organisation_id,client_id,tag) values('${a}','${person}','vip');insert into public.agency_client_property_enquiries(organisation_id,client_id,listing_id) values('${a}','${person}','${listing}');`)
 assert.equal((await db.query('select * from public.agency_client_tags')).rows.length,1)
 await assert.rejects(db.exec(`insert into public.agency_client_tags(organisation_id,client_id,tag) values('${b}','${other}','private')`),/row-level security/)
 await assert.rejects(db.exec(`insert into public.agency_client_tags(organisation_id,client_id,tag,created_by) values('${a}','${person}','fraud','${other}')`),/row-level security/)
 await assert.rejects(db.exec(`insert into public.agency_client_property_enquiries(organisation_id,client_id,development_id) values('${a}','${person}','${dev}')`),/row-level security/)
 await db.exec(`set app.org='${b}';`);assert.equal((await db.query('select * from public.agency_client_tags')).rows.length,0);assert.equal((await db.query('select * from public.agency_client_property_enquiries')).rows.length,0)
 await db.exec(`reset role;update public.agency_client_profiles set merged_into='${kept}' where id='${person}';set role authenticated;set app.org='${a}';`)
 // Retained rows remain available through the client redirect/alias IDs.
 assert.equal((await db.query(`select tag from public.agency_client_tags where client_id='${person}'`)).rows[0].tag,'vip')
 await assert.rejects(db.exec(`insert into public.agency_client_tags(organisation_id,client_id,tag) values('${a}','${person}','stale-profile')`),/row-level security/)
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from public.agency_client_tags'),/permission denied/)
 }finally{await db.close()}
})
