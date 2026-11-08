import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002'
test('personal defaults, shared defaults, backfill and manual assignments remain distinct',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create schema private;create role anon;create role authenticated;
 create table organisation_users(organisation_id text,user_id uuid,status text);
 create table revo_inbox_channels(id text,organisation_id text,channel text,access_scope text,owner_user_id uuid);
 create table revo_inbox_conversations(id text,organisation_id text default 'org',channel_id text,assigned_user_id uuid,assigned_team_id uuid,status text default 'open');
 create table revo_inbox_activity(organisation_id text,conversation_id text,action text);
 insert into organisation_users values('org','${owner}','active');
 insert into revo_inbox_channels values('personal','org','email','private','${owner}'),('shared','org','email','workspace','${owner}'),('selected','org','email','selected','${owner}'),('inactive','org','email','private','${other}'),('whatsapp','org','whatsapp','private','${owner}');
 insert into revo_inbox_conversations(id,channel_id) values('old-personal','personal'),('old-shared','shared'),('manual-unassigned','personal');
 insert into revo_inbox_activity values('org','manual-unassigned','assignment_changed');`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261105195000_personal_mailbox_default_assignment.sql',import.meta.url),'utf8'))
 await db.exec(`insert into revo_inbox_conversations(id,channel_id) values('new-personal','personal'),('new-shared','shared'),('new-selected','selected'),('new-inactive','inactive'),('new-whatsapp','whatsapp');
 insert into revo_inbox_conversations(id,channel_id,assigned_user_id) values('explicit','personal','${other}');
 insert into revo_inbox_conversations(id,channel_id,assigned_team_id) values('team','personal','${other}');
 insert into revo_inbox_conversations(id,organisation_id,channel_id) values('wrong-org','other','personal');`)
 const rows=Object.fromEntries((await db.query('select id,assigned_user_id from revo_inbox_conversations')).rows.map(r=>[r.id,r.assigned_user_id]))
 assert.equal(rows['old-personal'],owner);assert.equal(rows['new-personal'],owner)
 for(const id of ['old-shared','manual-unassigned','new-shared','new-selected','new-inactive','new-whatsapp','team','wrong-org'])assert.equal(rows[id],null,id)
 assert.equal(rows.explicit,other)
 await db.exec("update revo_inbox_conversations set assigned_user_id=null where id='new-personal';update revo_inbox_conversations set status='snoozed' where id='new-personal'")
 assert.equal((await db.query("select assigned_user_id from revo_inbox_conversations where id='new-personal'")).rows[0].assigned_user_id,null)
 } finally {await db.close()}
})
