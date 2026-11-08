import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
test('only authors with mailbox work access can delete unsent drafts',async()=>{
 const db=new PGlite()
 const me='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
 try {
 await db.exec(`create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;grant usage on schema auth to authenticated;
 create table revo_inbox_messages(id text,organisation_id text default 'org',created_by uuid,direction text,message_type text,delivery_status text);
 alter table revo_inbox_messages enable row level security;grant select,delete on revo_inbox_messages to authenticated;
 create policy read_messages on revo_inbox_messages for select to authenticated using(true);
 create policy mailbox_boundary on revo_inbox_messages as restrictive for all to authenticated using(organisation_id='org');
 create policy mailbox_work on revo_inbox_messages as restrictive for delete to authenticated using(current_setting('test.work')='yes');
 insert into revo_inbox_messages(id,created_by,direction,message_type,delivery_status) values('own','${me}','internal','draft','queued'),('other','${other}','internal','draft','queued'),('inbound','${me}','inbound','message','received'),('sent','${me}','outbound','message','sent'),('note','${me}','internal','note','queued');
 insert into revo_inbox_messages values('other-org','other','${me}','internal','draft','queued');`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261105202500_inbox_delete_own_unsent_drafts.sql',import.meta.url),'utf8'))
 await db.exec(`set role authenticated;set test.uid='${me}';set test.work='no'`)
 assert.equal((await db.query('delete from revo_inbox_messages returning id')).rows.length,0)
 await db.exec("set test.work='yes'")
 assert.deepEqual((await db.query('delete from revo_inbox_messages returning id')).rows,[{id:'own'}])
 } finally {await db.close()}
})
