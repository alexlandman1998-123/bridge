import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js'
const dev='00000000-0000-4000-8000-000000000001', org='00000000-0000-4000-8000-000000000002', unit='00000000-0000-4000-8000-000000000003', staff='00000000-0000-4000-8000-000000000004', outsider='00000000-0000-4000-8000-000000000005', secondUnit='00000000-0000-4000-8000-000000000006'
const settings={enabled:true,account_holder:'Test Trust',bank_name:'Test Bank',account_number:'123456',branch_code:'123456',proof_email:'proof@example.test',notification_email:'samlin@example.test',refund_terms:'The R10,000 is fully refundable. Contact Samlin to request a refund.'}
async function setup() {
 const db=new PGlite()
 await db.exec(`create schema auth; create schema private; create role anon; create role authenticated; create role service_role;
 create table organisations(id uuid primary key); create table profiles(id uuid primary key); create table leads(lead_id uuid primary key);
 create table developments(id uuid primary key,organisation_id uuid); create table units(id uuid primary key,development_id uuid,unit_number text,status text); create table transactions(id uuid primary key,unit_id uuid,lifecycle_state text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user',true),'')::uuid$$;
 create function bridge_has_organisation_membership(uuid) returns boolean language sql stable as $$ select auth.uid()='${staff}'::uuid and $1='${org}'::uuid $$;
 create function get_public_development_landing(text) returns jsonb language sql stable as $$select jsonb_build_object('id','${dev}')$$;
 insert into organisations values('${org}'); insert into profiles values('${staff}'),('${outsider}'); insert into developments values('${dev}','${org}'); insert into units values('${unit}','${dev}','042','Available'),('${secondUnit}','${dev}','043','Available');`)
 const foundation=await readFile(new URL('../supabase/migrations/20260816092532_developer_leads_phase10_foundation.sql',import.meta.url),'utf8')
 await db.exec(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('create index')))
 await db.exec('alter table developer_leads add column next_action_note text;')
 await db.exec(await readFile(new URL('../supabase/migrations/20261106071045_madison_place_trust_reservations.sql',import.meta.url),'utf8'))
 await db.query("select set_config('request.user',$1,false)",[staff])
 await db.query('select madison_save_reservation_settings($1,$2)',[dev,settings])
 return db
}
const request=(db,id='10000000-0000-4000-8000-000000000001',u=unit,email='buyer@example.test',hash='a')=>db.query('select madison_request_reservation($1,$2,$3,$4,$5,$6,$7,$8) as receipt',[id,u,'Buyer Name',email,'0820000000',hash.repeat(64),'b'.repeat(64),settings.refund_terms])

test('48-hour hold, private buyer lead, immutable queued emails and replay without duplicates',async()=>{
 const db=await setup();try{
 const receipt=(await request(db)).rows[0].receipt
 assert.equal(receipt.state,'awaiting_deposit')
 assert.equal((await db.query('select extract(epoch from expires_at-created_at)::int as seconds from madison_reservations')).rows[0].seconds,172800)
 assert.equal((await db.query('select status from units where id=$1',[unit])).rows[0].status,'Reserved')
 assert.equal((await db.query('select reservation_state from developer_leads')).rows[0].reservation_state,'provisional')
 assert.equal((await db.query('select count(*)::int as n from madison_reservation_emails')).rows[0].n,2)
 assert.deepEqual((await request(db)).rows[0].receipt,receipt)
 assert.equal((await db.query('select count(*)::int as n from developer_leads')).rows[0].n,1)
 await assert.rejects(request(db,receipt.id,unit,'changed@example.test','c'),/already been used/)
 const publicData=(await db.query('select madison_public_reservation_availability() as v')).rows[0].v
 assert(!JSON.stringify(publicData).includes('buyer@example'))
 assert.equal(publicData.holds[0].state,'awaiting_deposit')
 await assert.rejects(db.query("update units set status='Sold' where id=$1",[unit]),/pending/)
 await assert.rejects(db.query("update developer_leads set reservation_state='reserved'"),/first/)
 await assert.rejects(db.query('insert into transactions(id,unit_id) values(gen_random_uuid(),$1)',[unit]),/before creating a sale/)
 }finally{await db.close()}
})
test('competing request cannot double-book and another-development unit cannot be held',async()=>{
 const db=await setup();try{
 await request(db)
 await assert.rejects(request(db,'20000000-0000-4000-8000-000000000001',unit,'second@example.test','c'),/no longer available/)
 await assert.rejects(request(db,'30000000-0000-4000-8000-000000000001',secondUnit),/review your reservation/)
 await db.exec(`update units set development_id=null where id='${secondUnit}'`)
 await assert.rejects(request(db,'30000000-0000-4000-8000-000000000001',secondUnit,'other@example.test','d'),/unavailable/)
 }finally{await db.close()}
})
test('only Samlin staff can configure and confirm; a bank receipt is required; confirmation is durable',async()=>{
 const db=await setup();try{
 const r=(await request(db)).rows[0].receipt
 await db.query("select set_config('request.user',$1,false)",[outsider])
 await assert.rejects(db.query("select madison_manage_reservation($1,'confirm','receipt-1')",[r.id]),/Only the Madison/)
 await assert.rejects(db.query('select madison_save_reservation_settings($1,$2)',[dev,settings]),/Only the Madison/)
 await db.query("select set_config('request.user',$1,false)",[staff])
 await assert.rejects(db.query("select madison_manage_reservation($1,'confirm','')",[r.id]),/receipt reference/)
 await db.query("select madison_manage_reservation($1,'confirm','TUCKERS-123')",[r.id])
 const saved=(await db.query('select * from madison_reservations')).rows[0]
 assert.equal(saved.state,'confirmed');assert.equal(saved.confirmed_by,staff);assert.equal(saved.bank_reference,'TUCKERS-123')
 assert.equal((await db.query('select reservation_state from developer_leads')).rows[0].reservation_state,'reserved')
 assert.equal((await db.query("select count(*)::int as n from madison_reservation_emails where kind='confirmed'")).rows[0].n,1)
 await assert.rejects(db.query("select madison_manage_reservation($1,'confirm','TUCKERS-123')",[r.id]),/hold has ended/)
 await db.query('select private.expire_madison_reservations()')
 assert.equal((await db.query('select status from units where id=$1',[unit])).rows[0].status,'Reserved')
 }finally{await db.close()}
})
test('expired holds reject late confirmation, release stock and can be requested again',async()=>{
 const db=await setup();try{
 const r=(await request(db)).rows[0].receipt
 await db.exec("update madison_reservations set created_at=now()-interval '49 hours',expires_at=now()-interval '1 hour'")
 await assert.rejects(db.query("select madison_manage_reservation($1,'confirm','late-payment')",[r.id]),/hold has ended/)
 await db.query('select private.expire_madison_reservations()')
 assert.equal((await db.query('select state from madison_reservations')).rows[0].state,'expired')
 assert.equal((await db.query('select status from units where id=$1',[unit])).rows[0].status,'Available')
 assert.equal((await db.query('select reservation_state from developer_leads')).rows[0].reservation_state,'expired')
 assert.equal((await request(db,'20000000-0000-4000-8000-000000000001',unit,'buyer@example.test','d')).rows[0].receipt.state,'awaiting_deposit')
 }finally{await db.close()}
})
test('missing trust settings fail closed; public roles cannot read PII, write holds or call worker/intake RPCs',async()=>{
 const db=await setup();try{
 await assert.rejects(db.query('select madison_save_reservation_settings($1,$2)',[dev,{enabled:true}]),/Complete the confirmed/)
 await request(db)
 await db.exec('grant usage on schema public,auth to anon,authenticated; grant select on developments to authenticated;')
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`)
  await assert.rejects(db.query('select madison_claim_reservation_emails()'),/permission denied/)
  await assert.rejects(request(db),/permission denied/)
  await assert.rejects(db.query('delete from madison_reservations'),/permission denied/)
  if(role==='anon')await assert.rejects(db.query('select buyer_email from madison_reservations'),/permission denied/)
  else { await db.query("select set_config('request.user',$1,false)",[outsider]);assert.equal((await db.query('select * from madison_reservations')).rows.length,0) }
  await db.exec('reset role')
 }
 await db.query("select set_config('request.user',$1,false)",[staff])
 await db.query('select madison_save_reservation_settings($1,$2)',[dev,{...settings,enabled:false}])
 await assert.rejects(request(db,'20000000-0000-4000-8000-000000000001',secondUnit,'other@example.test','c'),/not open/)
 }finally{await db.close()}
})
test('worker leases, safe retry window and manual release preserve stock and email state',async()=>{
 const db=await setup();try{
 const r=(await request(db)).rows[0].receipt
 assert.equal((await db.query('select * from madison_claim_reservation_emails()')).rows.length,2)
 assert.equal((await db.query('select * from madison_claim_reservation_emails()')).rows.length,0)
 await db.exec("update madison_reservation_emails set last_attempt_at=now()-interval '6 minutes'")
 assert.equal((await db.query('select * from madison_claim_reservation_emails()')).rows.length,2)
 await db.exec("update madison_reservation_emails set first_attempt_at=now()-interval '24 hours',last_attempt_at=now()-interval '6 minutes'")
 assert.equal((await db.query('select * from madison_claim_reservation_emails()')).rows.length,0)
 assert.equal((await db.query("select count(*)::int as n from madison_reservation_emails where state='review'")).rows[0].n,2)
 await db.query("select madison_manage_reservation($1,'release','')",[r.id])
 assert.equal((await db.query('select status from units where id=$1',[unit])).rows[0].status,'Available')
 assert.equal((await db.query('select reservation_state from developer_leads')).rows[0].reservation_state,'none')
 }finally{await db.close()}
})
test('accepted refund terms are frozen and a stale form cannot accept changed terms',async()=>{
 const db=await setup();try{
 await db.query('select madison_save_reservation_settings($1,$2)',[dev,{...settings,refund_terms:'Updated refund terms'}])
 await assert.rejects(request(db),/terms changed/)
 await db.query('select madison_save_reservation_settings($1,$2)',[dev,settings]);const r=(await request(db)).rows[0].receipt
 await db.query('select madison_save_reservation_settings($1,$2)',[dev,{...settings,refund_terms:'Updated refund terms',account_number:'changed'}])
 await db.query("select madison_manage_reservation($1,'confirm','BANK-001')",[r.id])
 const message=(await db.query("select payload from madison_reservation_emails where kind='confirmed'")).rows[0].payload
 assert.equal(message.refundTerms,settings.refund_terms);assert.equal(message.accountNumber,settings.account_number)
 await db.exec("update developer_leads set reservation_state='none';update units set status='Available'")
 assert.equal((await db.query('select state from madison_reservations')).rows[0].state,'released')
 }finally{await db.close()}
})
test('confirmed reservations hand off to the existing sale workflow without leaving an orphan stock claim',async()=>{
 const db=await setup();try{
 const r=(await request(db)).rows[0].receipt
 await db.query("select madison_manage_reservation($1,'confirm','BANK-001')",[r.id])
 await db.query('insert into transactions(id,unit_id) values($1,$2)',[r.id,unit])
 await db.query('update developer_leads set converted_transaction_id=$1',[r.id])
 assert.equal((await db.query('select state from madison_reservations')).rows[0].state,'converted')
 await db.exec("update transactions set lifecycle_state='cancelled';update units set status='Available'")
 assert.equal((await request(db,'20000000-0000-4000-8000-000000000001',unit,'next@example.test','c')).rows[0].receipt.state,'awaiting_deposit')
 }finally{await db.close()}
})
