import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const query=(q,args=[])=>db.query(q,args)
let checks=0
const check=async(label,fn)=>{await fn();checks++;console.log('PASS '+label)}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;create schema document_security;
 grant usage on schema auth,document_security to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text);
 create table attorney_firms(id uuid primary key);
 create table transactions(id uuid primary key,registered_at timestamptz,lifecycle_state text);
 create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,attorney_role text,assignment_type text,assignment_status text,status text,can_update_workflow_lane boolean);
 create function bridge_attorney_matter_team_access(uuid,uuid,text) returns boolean language sql as $$select $2::text=current_setting('test.firm',true)$$;
 create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select current_setting('test.can_write',true)='yes'$$;
 create table transaction_attorney_closeouts(id uuid primary key,transaction_id uuid,attorney_firm_id uuid,close_out_status text,actual_billed_amount numeric,invoice_reference text);
 create table transaction_attorney_closeout_documents(id uuid primary key,transaction_attorney_closeout_id uuid references transaction_attorney_closeouts(id),document_type_key text,file_path text,status text,is_required boolean);
 create table storage.objects(bucket_id text,name text);
 alter table transaction_attorney_closeouts enable row level security;alter table transaction_attorney_closeout_documents enable row level security;
 create function bridge_agency_transaction_scope(uuid) returns boolean language sql as $$select false$$;
 create policy agency_two_tier_transaction_id on transaction_attorney_closeouts as restrictive for all to authenticated using(bridge_agency_transaction_scope(transaction_id)) with check(bridge_agency_transaction_scope(transaction_id));
 create policy read_closeout on transaction_attorney_closeouts for select to authenticated using(true);
 create policy read_closeout_docs on transaction_attorney_closeout_documents for select to authenticated using(true);
 grant select on transaction_attorney_closeouts,transaction_attorney_closeout_documents to authenticated;`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104092346_attorney_financial_closeout_write_scope.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104094200_attorney_closeout_agency_scope_exception.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104095100_attorney_closeout_responsible_firm_identity.sql',import.meta.url),'utf8'))
 await query('insert into attorney_firms values($1),($2)',[id(20),id(21)])
 await query("insert into profiles values($1,'attorney'),($2,'agent')",[id(1),id(2)])
 await query("insert into transactions values($1,now(),'registered'),($2,now(),'registered'),($3,null,'active')",[id(10),id(11),id(12)])
 for(const [tx,firm]of [[10,20],[11,21],[12,20]])await query("insert into transaction_attorney_assignments values($1,$2,null,'transfer_attorney','transfer','active','active',true)",[id(tx),id(firm)])
 await db.exec(`select set_config('test.uid','${id(1)}',false);select set_config('test.firm','${id(20)}',false);select set_config('test.can_write','yes',false);set role authenticated;`)
 await check('responsible registered-matter attorney can create the financial record',async()=>{
  await query("insert into transaction_attorney_closeouts(id,transaction_id,responsible_attorney_firm_id,close_out_status,actual_billed_amount,invoice_reference) values($1,$2,$3,'not_started',null,null)",[id(30),id(10),id(20)])
 })
 await check('another firm cannot create a closeout',async()=>{
  await assert.rejects(query("insert into transaction_attorney_closeouts(id,transaction_id,responsible_attorney_firm_id,close_out_status,actual_billed_amount,invoice_reference) values($1,$2,$3,'not_started',null,null)",[id(31),id(11),id(21)]),/row-level security/)
 })
 await check('closeout is unavailable before canonical registration',async()=>{
  await assert.rejects(query("insert into transaction_attorney_closeouts(id,transaction_id,responsible_attorney_firm_id,close_out_status,actual_billed_amount,invoice_reference) values($1,$2,$3,'not_started',null,null)",[id(32),id(12),id(20)]),/row-level security/)
 })
 await check('transaction and firm identity cannot be reparented',async()=>{
  await assert.rejects(query('update transaction_attorney_closeouts set transaction_id=$1 where id=$2',[id(11),id(30)]),/cannot be moved/)
 })
 await check('closing without required saved files is refused',async()=>{
  await assert.rejects(query("update transaction_attorney_closeouts set close_out_status='closed',actual_billed_amount=15000,invoice_reference='STAGING' where id=$1",[id(30)]),/required saved closeout files/)
 })
 const path=`transaction-${id(10)}/closeout-${id(30)}/invoice.png`
 await check('document metadata cannot acknowledge absent or foreign Storage bytes',async()=>{
  await assert.rejects(query("insert into transaction_attorney_closeout_documents values($1,$2,'invoice',$3,'uploaded',true)",[id(40),id(30),path]),/row-level security/)
  await db.exec('reset role');await query("insert into storage.objects values('documents',$1)",[path]);await db.exec('set role authenticated')
  await assert.rejects(query("insert into transaction_attorney_closeout_documents values($1,$2,'invoice',$3,'uploaded',true)",[id(40),id(30),'transaction-'+id(11)+'/other.png']),/row-level security/)
  await query("insert into transaction_attorney_closeout_documents values($1,$2,'invoice',$3,'uploaded',true)",[id(40),id(30),path])
 })
 await check('complete evidence and billing permit closeout; document identity stays fixed',async()=>{
  await query("update transaction_attorney_closeouts set close_out_status='closed',actual_billed_amount=15000,invoice_reference='STAGING' where id=$1",[id(30)])
  await assert.rejects(query("update transaction_attorney_closeout_documents set document_type_key='statement' where id=$1",[id(40)]),/cannot be moved/)
 })
 await check('an agent cannot change the attorney financial closeout',async()=>{
  await db.exec(`select set_config('test.uid','${id(2)}',false)`)
  const result=await query("update transaction_attorney_closeouts set close_out_status='not_started' where id=$1 returning id",[id(30)])
  assert.equal(result.rows.length,0)
  await db.exec('reset role')
  assert.equal((await query('select close_out_status from transaction_attorney_closeouts where id=$1',[id(30)])).rows[0].close_out_status,'closed')
 })
 console.log(`${checks} attorney closeout authority and evidence scenarios passed`)
}finally{await db.close()}
