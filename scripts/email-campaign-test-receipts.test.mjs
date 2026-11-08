import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {PGlite} from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
test('durable campaign test receipts and server-only access',async t=>{
 const db=new PGlite(),org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sender='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table organisations(id uuid primary key);create table email_sender_identities(id uuid primary key,organisation_id uuid);insert into auth.users values('${actor}');insert into organisations values('${org}'),('${other}');insert into email_sender_identities values('${sender}','${org}');grant usage on schema public to service_role;grant select on email_sender_identities to service_role;`)
 await db.exec(readFileSync('supabase/migrations/20261105195509_email_campaign_test_delivery_receipts.sql','utf8'))
 await db.exec('set role service_role')
 const claim=async(key='a'.repeat(64),hash='b'.repeat(64),scope=org)=>(await db.query('select email_campaign_test_claim($1,$2,$3,$4,$5) receipt',[scope,actor,sender,key,hash])).rows[0].receipt
 const done=async(id,status='accepted',receipt='provider-id',scope=org)=>(await db.query('select email_campaign_test_complete($1,$2,$3,$4,$5) ok',[scope,actor,id,status,receipt])).rows[0].ok
 let first
 await t.test('only one of simultaneous identical intents can submit',async()=>{
  const results=await Promise.all([claim(),claim()]);assert.deepEqual(results.map(row=>row.action),['send','pending']);first=results[0];assert.equal(results[1].id,first.id)
 })
 await t.test('accepted results survive subsequent requests without another send',async()=>{
  assert.equal(await done(first.id),true);assert.equal(await done(first.id),false);assert.deepEqual(await claim(),{action:'accepted',id:first.id,providerMessageId:'provider-id'})
 })
 await t.test('changed content and foreign scopes cannot reuse an intent',async()=>{
  assert.equal((await claim(undefined,'c'.repeat(64))).action,'conflict');await assert.rejects(claim(undefined,undefined,other),/Invalid test sender scope/);assert.equal(await done(first.id,'accepted','foreign',other),false)
 })
 await t.test('pending or uncertain intents never expire into a new send',async()=>{
  const pending=await claim('d'.repeat(64));await db.query("update email_campaign_test_receipts set created_at=now()-interval '2 years' where id=$1",[pending.id]);assert.equal((await claim('d'.repeat(64))).action,'pending');assert.equal(await done(pending.id,'uncertain',null),true);assert.equal((await claim('d'.repeat(64))).action,'uncertain')
 })
 await t.test('explicit new intent can send while preserving the old receipt',async()=>{
  assert.equal((await claim('e'.repeat(64))).action,'send');assert.equal((await claim()).action,'accepted');await assert.rejects(done(first.id,'accepted',''),/Invalid test receipt outcome/)
 })
 await t.test('safe pre-provider rejection can retry with the same reservation identity',async()=>{const pending=await claim('f'.repeat(64));assert.equal(await done(pending.id,'rejected',null),true);assert.deepEqual(await claim('f'.repeat(64)),{action:'send',id:pending.id})})
 await t.test('browser roles cannot read, alter, or claim server receipts',async()=>{
  for(const role of ['authenticated','anon']){await db.exec(`reset role;set role ${role}`);await assert.rejects(db.query('select * from email_campaign_test_receipts'),/permission denied/);await assert.rejects(claim(),/permission denied/)}
 })
 } finally {await db.close()}
})
