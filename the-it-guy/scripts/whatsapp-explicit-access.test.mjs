import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fixture} from './lib/whatsappInboxFixture.mjs'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),owner=id(3),sender=id(4),agent=id(8)
const db=await fixture({workspace:true,integrations:true})
try {
 await db.exec(`alter table organisation_users add column team_id uuid; create table commercial_teams(id uuid,organisation_id uuid,name text,status text);`)
 for(const file of ['20261118064502_whatsapp_explicit_number_access.sql','20261118085241_whatsapp_private_scope_release_guards.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
 await db.query("insert into auth.users values($1)",[agent]);await db.query("insert into organisation_users(user_id,organisation_id,status,role) values($1,$2,'active','agent')",[agent,org])
 await db.exec(`set request.jwt.claim.role='service_role';`)
 const access=async(actor,permission)=>(await db.query('select whatsapp_sender_access_check($1,$2,$3,$4) ok',[org,actor,sender,permission])).rows[0].ok
 assert.equal(await access(agent,'view'),false)
 assert.equal(await access(owner,'view'),true)
 assert.equal(await access(owner,'reply'),false)
 await db.query("select whatsapp_sender_access_request($1,$2,$3,'save',$4)",[org,owner,sender,JSON.stringify({scope:'selected',grants:[{userId:agent,role:'responder'}]})])
 assert.equal(await access(agent,'view'),true);assert.equal(await access(agent,'reply'),true);assert.equal(await access(agent,'campaign'),false)
 await db.query('update organisation_communication_channels set owner_user_id=$1 where id=$2',[owner,sender])
 assert.equal(await access(agent,'view'),false)
 await db.query("select whatsapp_sender_access_request($1,$2,$3,'save',$4)",[org,owner,sender,JSON.stringify({scope:'private',grants:[{userId:agent,role:'responder'}]})])
 assert.equal(await access(agent,'view'),false)
 assert.equal((await db.query('select count(*)::integer n from whatsapp_sender_access_grants')).rows[0].n,0)
 await db.query("select whatsapp_sender_access_request($1,$2,$3,'save',$4)",[org,owner,sender,JSON.stringify({scope:'selected',grants:[{userId:agent,role:'responder'}]})])
 const created=(await db.query("select whatsapp_workspace_command($1,$2,'create',null,$3) result",[org,agent,JSON.stringify({senderId:sender,phone:'27821234567',name:'Synthetic privacy test'})])).rows[0].result
 assert.equal(created.conversation.assigned_user_id,agent)
 assert.equal(await access(agent,'reply'),true)
 const thread=(await db.query("select whatsapp_workspace_page($1,$2,'thread',$3) result",[org,agent,created.conversation.id])).rows[0].result
 assert.equal(thread.canSend,true)
 // Non-WhatsApp channels retain the pre-existing tenant policy.
 await db.query("insert into organisation_communication_channels(id,organisation_id,provider,channel_type) values($1,$2,'smtp','email')",[id(90),org])
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${agent}';set test.org='${org}'`)
 assert.equal((await db.query('select id from organisation_communication_channels where id=$1',[id(90)])).rows.length,1)
 console.log('WhatsApp release access checks passed: selected grants, reply/campaign separation, transfer reset, private restoration and non-WhatsApp isolation.')
} finally {await db.close()}
