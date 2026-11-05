import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',number='11111111-1111-4111-8111-111111111111',thread='22222222-2222-4222-8222-222222222222',owner='33333333-3333-4333-8333-333333333333',agent='44444444-4444-4444-8444-444444444444'
test('personal-number assignment guard blocks reassignment and unassignment while preserving shared routing and ownership transfers',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create table public.organisation_communication_channels(id uuid,organisation_id uuid,owner_user_id uuid);create table public.whatsapp_inbox_conversations(id uuid,organisation_id uuid,channel_id uuid,assigned_user_id uuid,status text);insert into public.organisation_communication_channels values('${number}','${org}',null);insert into public.whatsapp_inbox_conversations values('${thread}','${org}','${number}',null,'open');`)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261103193901_whatsapp_personal_number_assignment_guard.sql',import.meta.url),'utf8'))
  await db.exec(`update public.whatsapp_inbox_conversations set assigned_user_id='${agent}' where id='${thread}';update public.whatsapp_inbox_conversations set assigned_user_id=null where id='${thread}';`)
  assert.equal((await db.query('select assigned_user_id from public.whatsapp_inbox_conversations')).rows[0].assigned_user_id,null)
  await db.exec(`update public.organisation_communication_channels set owner_user_id='${owner}';update public.whatsapp_inbox_conversations set assigned_user_id='${owner}';`)
  await assert.rejects(db.exec(`update public.whatsapp_inbox_conversations set assigned_user_id='${agent}'`),/personal business number/)
  await assert.rejects(db.exec('update public.whatsapp_inbox_conversations set assigned_user_id=null'),/personal business number/)
  assert.equal((await db.query('select assigned_user_id from public.whatsapp_inbox_conversations')).rows[0].assigned_user_id,owner)
  await db.exec("update public.whatsapp_inbox_conversations set status='closed'")
  // Existing ownership transfer triggers update the channel first, then its chats.
  await db.exec(`update public.organisation_communication_channels set owner_user_id='${agent}';update public.whatsapp_inbox_conversations set assigned_user_id='${agent}';`)
  assert.equal((await db.query('select assigned_user_id from public.whatsapp_inbox_conversations')).rows[0].assigned_user_id,agent)
  await db.exec(`update public.organisation_communication_channels set owner_user_id=null;update public.whatsapp_inbox_conversations set assigned_user_id=null;`)
  assert.equal((await db.query('select assigned_user_id from public.whatsapp_inbox_conversations')).rows[0].assigned_user_id,null)
  await assert.rejects(db.exec(`update public.whatsapp_inbox_conversations set organisation_id='${agent}',assigned_user_id='${agent}'`),/unavailable in this organisation/)
 }finally{await db.close()}
})
