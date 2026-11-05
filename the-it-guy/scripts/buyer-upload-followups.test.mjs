import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const rows=async(q,args=[]) => (await db.query(q,args)).rows
const scalar=async(q,args=[])=>Object.values((await rows(q,args))[0])[0]
let checks=0
const check=async(label,fn)=>{await fn();checks++;console.log('PASS '+label)}
try {
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema document_security;create schema storage;
create table transactions(id uuid primary key);
create table client_portal_links(token text,transaction_id uuid,is_active boolean,expires_at timestamptz);
create table documents(id uuid primary key,transaction_id uuid references transactions(id),canonical_requirement_instance_id uuid,
 source text,uploaded_by_party text,document_type text,status text);
create table document_requests(id uuid primary key,transaction_id uuid,canonical_requirement_instance_id uuid,
 requires_review boolean,status text,requested_document_id uuid,completed_at timestamptz,rejected_reason text,updated_at timestamptz);
create table storage.objects(bucket_id text,name text);
create table notification_calls(document_id uuid);
create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('test.token',true)$$;
create function bridge_create_transaction_notifications_for_roles(uuid,text[],text,text,text,text,jsonb,text)
returns integer language plpgsql as $$begin insert into public.notification_calls values(($7->>'documentId')::uuid);return 1;end$$;`)
for(const [name,source] of [['bridge_upload_buyer_portal_document','client_portal_atomic_upload'],['bridge_upload_buyer_portal_requested_document','client_portal_requested_document_upload']]) {
await db.exec(`create function public.${name}(p_document_id uuid,p_transaction_id uuid,p_file_path text,p_requirement_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $stub$
declare v_document public.documents%rowtype;
begin
  insert into public.documents (id,transaction_id,canonical_requirement_instance_id,source,uploaded_by_party,document_type,status)
  values(p_document_id,p_transaction_id,p_requirement_id,'${source}','buyer','reservation_deposit_pop','under_review') returning * into v_document;
  return to_jsonb(v_document);
end $stub$;`)
}
const migration=await readFile(new URL('../../supabase/migrations/20261104080212_buyer_upload_server_owned_followups.sql',import.meta.url),'utf8')
await db.exec(migration)
await rows('insert into transactions values($1),($2)',[id(1),id(2)])
await rows("insert into client_portal_links values('own',$1,true,now()+interval '1 day'),('foreign',$2,true,null),('expired',$1,true,now()-interval '1 day')",[id(1),id(2)])
await rows("insert into document_requests(id,transaction_id,canonical_requirement_instance_id,requires_review,status) values($1,$2,$3,true,'requested'),($4,$5,$3,true,'requested'),($6,$2,$3,true,'completed')",[id(11),id(1),id(10),id(12),id(2),id(13)])
await db.exec("select set_config('test.token','own',false)")
await check('upload, exact request linkage and staff notice persist together; POP stays under review',async()=>{
 await rows("select bridge_upload_buyer_portal_document($1,$2,'saved.png',$3)",[id(20),id(1),id(10)])
 assert.equal(await scalar('select status from documents where id=$1',[id(20)]),'under_review')
 assert.equal(await scalar('select requested_document_id from document_requests where id=$1',[id(11)]),id(20))
 assert.equal(await scalar('select count(*) from notification_calls'),1)
})
await check('a similarly named foreign request and a completed review are unchanged',async()=>{
 assert.equal(await scalar('select requested_document_id from document_requests where id=$1',[id(12)]),null)
 assert.equal(await scalar('select status from document_requests where id=$1',[id(13)]),'completed')
 assert.equal(await scalar('select requested_document_id from document_requests where id=$1',[id(13)]),null)
})
await check('repeated follow-up deduplicates the exact saved document',async()=>{
 await rows('select document_security.record_buyer_upload_followup($1)',[id(20)])
 assert.equal(await scalar('select count(*) from notification_calls'),1)
 assert.equal(await scalar('select count(*) from document_security.buyer_upload_followups'),1)
})
await check('a token cannot create follow-up effects on another transaction',async()=>{
 await assert.rejects(rows("select bridge_upload_buyer_portal_document($1,$2,'saved.png',$3)",[id(21),id(2),id(10)]),/context is unavailable/)
 assert.equal(await scalar('select count(*) from documents where id=$1',[id(21)]),0)
})
await check('expired access rejects before any metadata or receipt persists',async()=>{
 await db.exec("select set_config('test.token','expired',false)")
 await assert.rejects(rows("select bridge_upload_buyer_portal_document($1,$2,'saved.png',$3)",[id(22),id(1),id(10)]),/context is unavailable/)
 assert.equal(await scalar('select count(*) from documents where id=$1',[id(22)]),0)
 await db.exec("select set_config('test.token','own',false)")
})
await check('requested uploads cannot acknowledge missing Storage bytes',async()=>{
 await assert.rejects(rows("select bridge_upload_buyer_portal_requested_document($1,$2,'missing.png',$3)",[id(23),id(1),id(10)]),/not found in storage/)
 assert.equal(await scalar('select count(*) from documents where id=$1',[id(23)]),0)
 await db.exec("insert into storage.objects values('documents','saved.png')")
 await rows("select bridge_upload_buyer_portal_requested_document($1,$2,'saved.png',$3)",[id(24),id(1),id(10)])
 assert.equal(await scalar('select count(*) from notification_calls'),2)
})
await check('portal SQL roles cannot invoke the private notification writer directly',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role)
  try{await assert.rejects(rows('select document_security.record_buyer_upload_followup($1)',[id(20)]),/permission denied/)}finally{await db.exec('reset role')}
 }
})
await check('a follow-up failure rolls back the same atomic document transaction',async()=>{
 await db.exec(`create or replace function bridge_create_transaction_notifications_for_roles(uuid,text[],text,text,text,text,jsonb,text)
 returns integer language plpgsql as $$begin raise exception 'controlled notice failure';end$$;`)
 await assert.rejects(rows("select bridge_upload_buyer_portal_document($1,$2,'saved.png',$3)",[id(25),id(1),id(10)]),/controlled notice failure/)
 assert.equal(await scalar('select count(*) from documents where id=$1',[id(25)]),0)
 assert.equal(await scalar('select count(*) from document_security.buyer_upload_followups where document_id=$1',[id(25)]),0)
})
await check('the forward correction can be reapplied without rewriting saved evidence',async()=>{
 const before=await rows('select * from documents order by id');await db.exec(migration)
 assert.deepEqual(await rows('select * from documents order by id'),before)
})
console.log(`${checks} buyer upload boundary scenarios passed`)
} finally {await db.close()}
