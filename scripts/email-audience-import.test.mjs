import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
test('audience import is atomic, tenant-scoped, repeatable and preserves opt-outs',async()=>{
 const db=new PGlite(),org=id(1),other=id(2),user=id(3),category=id(4)
 try{
 const foundation=await readFile(new URL('../supabase/migrations/20260909113000_email_campaigns_foundation.sql',import.meta.url),'utf8')
 const table=name=>foundation.slice(foundation.indexOf(`create table if not exists public.${name} (`)).split('\n);')[0]+'\n);'
 await db.exec(`create role authenticated;create role anon;create schema private;create schema auth;grant usage on schema private,auth to authenticated;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table organisations(id uuid primary key);create table organisation_branches(id uuid primary key);
 create function bridge_is_active_member(o uuid) returns boolean language sql stable as $$select o::text=current_setting('test.org',true) and current_setting('test.active',true)='yes'$$;
 create function email_campaign_can_send(o uuid) returns boolean language sql stable as $$select public.bridge_is_active_member(o) and current_setting('test.manager',true)='yes'$$;
 ${['email_marketing_contacts','email_marketing_contact_sources','contact_marketing_preferences','email_subscription_types','contact_email_subscriptions','email_saved_audiences'].map(table).join('\n')}
 create table email_suppressions(organisation_id uuid,email text);
 create function email_campaign_preview_audience(o uuid,c uuid,f jsonb) returns integer language sql stable as $$select count(*)::integer from public.email_marketing_contacts m join public.contact_marketing_preferences p on p.organisation_id=m.organisation_id and p.email=m.email join public.contact_email_subscriptions s on s.organisation_id=m.organisation_id and s.email=m.email and s.subscription_type_id=c where m.organisation_id=o and m.id::text in(select jsonb_array_elements_text(f->'contact_ids')) and m.is_valid_email and p.marketing_consent_status='opted_in' and p.unsubscribed_at is null and s.status='subscribed' and not exists(select 1 from public.email_suppressions x where x.organisation_id=o and x.email=m.email)$$;
 insert into organisations values('${org}'),('${other}');insert into auth.users values('${user}');insert into email_subscription_types(id,organisation_id,name,slug) values('${category}','${org}','Updates','updates');
 insert into email_marketing_contacts(organisation_id,email,first_name) values('${org}','out@example.test','Original'),('${other}','new@example.test','Foreign');
 insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status,unsubscribed_at) values('${org}','out@example.test','opted_out',now()),('${org}','unsub@example.test','opted_in',null);
 insert into contact_email_subscriptions(organisation_id,subscription_type_id,email,status) values('${org}','${category}','unsub@example.test','unsubscribed');
 insert into email_suppressions values('${org}','blocked@example.test');`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261105190717_email_audience_contact_import.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261105200936_email_audience_import_shared_catalogue.sql',import.meta.url),'utf8'))
 await db.exec(`set role authenticated;set test.uid='${user}';set test.org='${org}';set test.active='yes';set test.manager='yes'`)
 const opted=email=>({email,firstName:'Imported',lastName:'Person',consent:'opted_in',consentSource:'Signup form',consentAt:'2026-01-01T00:00:00Z'})
 const rows=[opted('new@example.test'),opted('out@example.test'),opted('unsub@example.test'),opted('blocked@example.test'),{email:'unknown@example.test',consent:'unknown'}]
 const run=(request,name,data=rows,scope=org)=>db.query('select public.email_import_audience($1,$2,$3,$4,$5::jsonb) as receipt',[scope,request,name,category,JSON.stringify(data)])
 const receipt=(await run(id(10),'Imported audience')).rows[0].receipt
 assert.equal(receipt.total,5);assert.equal(receipt.added,4);assert.equal(receipt.existing,1);assert.equal(receipt.eligible,1)
 assert.deepEqual((await run(id(10),'Imported audience')).rows[0].receipt,receipt)
 await assert.rejects(run(id(10),'Changed audience'),/already used/)
 await assert.rejects(run(id(11),'Other organisation',rows,other),/active organisation sender/)
 await db.exec("set test.manager='no'");await assert.rejects(run(id(12),'Not a sender'),/active organisation sender/);await db.exec("set test.manager='yes'")
 await db.exec("set test.active='no'");await assert.rejects(run(id(13),'Inactive'),/active organisation sender/);await db.exec("set test.active='yes'")
 await assert.rejects(run(id(14),'Bad rows',[opted('valid-before-error@example.test'),{email:'invalid'}]),/invalid email/)
 await assert.rejects(run(id(15),'Bad permission',[{email:'badpermission@example.test',consent:'opted_in'}]),/source and recorded date/)
 await assert.rejects(run(id(16),'Duplicates',[opted('repeat@example.test'),opted('repeat@example.test')]),/duplicate email/)
 await assert.rejects(run(id(17),'Imported audience',[opted('rollback@example.test')]),/unique constraint/)
 await db.exec('reset role')
 assert.equal((await db.query("select count(*)::integer n from public.email_marketing_contacts where email in ('valid-before-error@example.test','rollback@example.test','badpermission@example.test','repeat@example.test')")).rows[0].n,0)
 assert.equal((await db.query("select first_name from public.email_marketing_contacts where organisation_id=$1 and email='out@example.test'",[org])).rows[0].first_name,'Original')
 assert.equal((await db.query("select marketing_consent_status from public.contact_marketing_preferences where organisation_id=$1 and email='out@example.test'",[org])).rows[0].marketing_consent_status,'opted_out')
 assert.equal((await db.query("select status from public.contact_email_subscriptions where organisation_id=$1 and email='unsub@example.test'",[org])).rows[0].status,'unsubscribed')
 assert.equal((await db.query('select count(*)::integer n from email_saved_audiences')).rows[0].n,1)
 await db.exec(`reset role; alter table public.email_saved_audiences rename to email_saved_audiences_old;
 create table public.marketing_audiences(id uuid primary key default gen_random_uuid(),organisation_id uuid,name text,description text,visibility text,definition jsonb,created_by uuid);
 create view public.email_saved_audiences as select id,organisation_id,name,description,definition->'emailFilter' filter_json,created_by from public.marketing_audiences;
 grant select on public.email_saved_audiences to authenticated;set role authenticated;`)
 const shared=(await run(id(30),'Shared catalogue import',[{email:'shared@example.test',consent:'unknown'}])).rows[0].receipt
 await db.exec('reset role')
 const canonical=(await db.query('select * from public.marketing_audiences where id=$1',[shared.audienceId])).rows[0]
 assert.equal(canonical.visibility,'personal');assert.deepEqual(canonical.definition,{emailFilter:{contact_ids:shared.contactIds}})
 assert.deepEqual((await run(id(30),'Shared catalogue import',[{email:'shared@example.test',consent:'unknown'}])).rows[0].receipt,shared)
 await db.exec(`set role authenticated;set test.org='${other}'`)
 assert.equal((await db.query('select count(*)::integer n from email_audience_imports')).rows[0].n,0)
 }finally{await db.close()}
})
