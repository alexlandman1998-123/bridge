import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
let checks=0
const run=async(label,fn)=>{await fn();checks++;console.log('PASS '+label)}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema journey_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function journey_private.can_read_professional_journey(uuid) returns boolean language sql as $$select current_setting('test.professional',true)='yes'$$;
 create function bridge_has_onboarding_token_transaction_access(uuid) returns boolean language sql as $$select $1::text=current_setting('test.transaction',true)$$;
 create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql as $$select false$$;
 create table transaction_onboarding(transaction_id uuid,status text);
 create table targets(user_id uuid,role_type text);
 create function bridge_resolve_transaction_notification_targets(uuid,text[]) returns setof targets language sql as $$select * from public.targets where role_type=any($2)$$;
 create table transaction_notifications(transaction_id uuid,user_id uuid,role_type text,notification_type text,title text,message text,is_read boolean,dedupe_key text unique,event_type text,event_data jsonb);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104085018_scoped_transaction_role_notifications.sql',import.meta.url),'utf8'))
 await db.query('insert into targets values($1,\'agent\'),($2,\'developer\')',[id(1),id(2)])
 await db.query("insert into transaction_onboarding values($1,'In Progress')",[id(10)])
 const call=(extra={})=>db.query('select bridge_notify_transaction_roles($1,$2,$3,$4,$5,$6,$7,$8,$9) count',[
  extra.transaction||id(10),extra.roles||['agent','developer'],'readiness_updated','Allowed staff update','Staff message',
  'TransactionUpdated',{source:'staff'},extra.prefix||'test',extra.exclude||null])
 await db.exec(`select set_config('test.uid','${id(1)}',false);select set_config('test.professional','yes',false);`)
 await run('professional recipients are resolved on the server and sender exclusion is retained',async()=>{
  assert.equal((await call({exclude:id(1)})).rows[0].count,1)
  assert.equal((await db.query('select user_id from transaction_notifications')).rows[0].user_id,id(2))
 })
 await run('professional users cannot suppress another recipient by user ID',async()=>{
  await assert.rejects(call({exclude:id(2)}),/Only your own/)
 })
 await run('a professional without matter access cannot notify its recipients',async()=>{
  await db.exec("select set_config('test.professional','no',false)")
  await assert.rejects(call(),/access denied/)
 })
 await db.exec(`select set_config('test.uid','',false);select set_config('test.transaction','${id(10)}',false);`)
 await run('an unsubmitted buyer cannot manufacture a completion notification',async()=>{
  await assert.rejects(call(),/submitted buyer/)
 })
 await db.exec("update transaction_onboarding set status='Submitted'")
 await run('buyer copy, recipients and deduplication identity remain server-owned',async()=>{
  assert.equal((await call({roles:['attorney'],prefix:'forged'})).rows[0].count,2)
  const saved=(await db.query("select * from transaction_notifications where dedupe_key like 'buyer-onboarding-submitted:%' order by role_type")).rows
  assert.deepEqual(saved.map(r=>r.role_type),['agent','developer'])
  assert.ok(saved.every(r=>r.title==='Buyer onboarding submitted'&&r.event_data.source==='buyer_onboarding_completed'))
 })
 await run('a repeated buyer completion notification is idempotent',async()=>{
  assert.equal((await call({prefix:'another-attempt'})).rows[0].count,0)
 })
 await run('a token cannot notify another matter',async()=>{
  await assert.rejects(call({transaction:id(11)}),/submitted buyer/)
 })
 console.log(`${checks} scoped notification scenarios passed`)
}finally{await db.close()}
