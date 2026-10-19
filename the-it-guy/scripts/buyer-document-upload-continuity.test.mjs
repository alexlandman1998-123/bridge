import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const tx='11111111-1111-4111-8111-111111111111', buyer='22222222-2222-4222-8222-222222222222', req='33333333-3333-4333-8333-333333333333', other='44444444-4444-4444-8444-444444444444'
try {
 await db.exec(`create schema storage;create table storage.objects(bucket_id text,name text);
 create table transactions(id uuid,development_id uuid,unit_id uuid,buyer_id uuid);
 create table buyers(id uuid,email text);
 create table client_portal_links(transaction_id uuid,is_active boolean,token text,buyer_id uuid,development_id uuid,unit_id uuid);
 create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('qa.portal_token',true)$$;
 create table document_requirement_instances(id uuid primary key,transaction_id uuid,document_definition_key text,status text,uploadable_by_roles text[],created_at timestamptz default now(),satisfied_by_document_id uuid,rejection_reason text,source_system text,updated_at timestamptz);
 create table document_definitions(key text,review_required boolean);
 create table documents(id uuid primary key default gen_random_uuid(),transaction_id uuid,name text,file_name text,file_path text,category text,document_type text,status text,visibility_scope text,is_client_visible boolean,uploaded_by_role text,uploaded_by_email text,uploaded_by_party text,client_recipient_role text,bucket_key text,source text,file_bucket text,finance_lane text,related_entity_type text,related_entity_id uuid,canonical_requirement_instance_id uuid,uploaded_at timestamptz);
 create table transaction_required_documents(transaction_id uuid,document_key text,enabled boolean,canonical_requirement_instance_id uuid,sort_order integer,created_at timestamptz,is_uploaded boolean default false,uploaded_document_id uuid,status text,uploaded_at timestamptz,rejected_at timestamptz,rejected_note text,updated_at timestamptz);
 create table document_requirement_events(requirement_instance_id uuid,event_type text,actor_role text,actor_user_id uuid,message text,metadata_json jsonb);
 create table transaction_events(transaction_id uuid,event_type text,event_data jsonb,created_by uuid,created_by_role text,visibility_scope text);
 create table document_requests(id uuid,transaction_id uuid,status text,requires_review boolean,requested_document_id uuid,completed_at timestamptz,rejected_reason text,updated_at timestamptz);
 insert into transactions values('${tx}',null,null,'${buyer}');insert into buyers values('${buyer}','qa@example.invalid');
 insert into client_portal_links values('${tx}',true,'synthetic-token','${buyer}',null,null);set qa.portal_token='synthetic-token';
 insert into document_requirement_instances values('${req}','${tx}','buyer_id_document','approved',array['buyer'],now(),gen_random_uuid(),null,null,null);
 insert into document_definitions values('buyer_id_document',true);
 insert into transaction_required_documents(transaction_id,document_key,enabled,canonical_requirement_instance_id,status) values('${tx}','id_document',true,'${req}','approved'),('${tx}','id_document',true,'${other}','missing');
 insert into storage.objects values('documents','client-portal/${tx}/qa.pdf');`)
 await db.exec("alter table document_requirement_instances add column visible_to_roles text[] default array['buyer']")
 const original=readFileSync('../supabase/migrations/20260831125409_atomic_buyer_portal_document_upload.sql','utf8').match(/create or replace function public\.bridge_upload_buyer_portal_document\([\s\S]*?\$\$;/i)[0]
 await db.exec(original)
 const upload=(path=`client-portal/${tx}/qa.pdf`,target=req)=>db.query('select bridge_upload_buyer_portal_document($1,$2,$3,$4,$5,$6,$7,$8) as result',[tx,path,'documents','qa.pdf','Buyer','buyer_id_document','id_document',target])
 // Demonstrate the deployed regression before applying the correction.
 const before=(await upload()).rows[0].result
 assert.equal(before.requirementStatus,'approved')
 assert.equal(before.client_recipient_role,null)
 assert.equal((await db.query('select is_uploaded from transaction_required_documents where canonical_requirement_instance_id=$1',[other])).rows[0].is_uploaded,true)
 await db.exec(`truncate documents,document_requirement_events,transaction_events;update document_requirement_instances set status='approved';update transaction_required_documents set is_uploaded=false,status='missing';`)
 await db.exec(`insert into documents(transaction_id,name,file_path,canonical_requirement_instance_id,source,uploaded_by_party) values('${tx}','Historic private buyer evidence','historic/private.pdf','${req}','client_portal_atomic_upload','buyer')`)
 await db.exec(readFileSync('../supabase/migrations/20261019210931_buyer_document_upload_continuity.sql','utf8'))
 assert.equal((await db.query("select client_recipient_role from documents where file_path='historic/private.pdf'")).rows[0].client_recipient_role,'buyer')
 const after=(await upload()).rows[0].result
 assert.equal(after.requirementStatus,'under_review','replacement needs a new review')
 assert.equal(after.client_recipient_role,'buyer','buyer evidence cannot enter seller audience')
 assert.equal((await db.query('select is_uploaded from transaction_required_documents where canonical_requirement_instance_id=$1',[other])).rows[0].is_uploaded,false,'same label cannot satisfy another party')
 await db.exec(`update document_requirement_instances set visible_to_roles=array['buyer','seller'] where id='${req}'`)
 const shared=(await upload()).rows[0].result
 assert.equal(shared.client_recipient_role,null,'a shared agreement must remain available to both parties')
 const count=(await db.query('select count(*)::int n from documents')).rows[0].n
 await assert.rejects(upload(`client-portal/${tx}/missing.pdf`),/not found in storage/)
 assert.equal((await db.query('select count(*)::int n from documents')).rows[0].n,count)
 await db.exec(`set qa.portal_token='wrong-token'`)
 await assert.rejects(upload(),/cannot upload/)
 await db.exec(`set qa.portal_token='synthetic-token'`)
 await assert.rejects(upload(`client-portal/${other}/qa.pdf`),/outside this buyer/)
 await db.exec(`insert into document_requirement_instances(id,transaction_id,document_definition_key,status,uploadable_by_roles) values('${other}','${tx}','buyer_id_document','pending',array['buyer'])`)
 await assert.rejects(db.query('select bridge_upload_buyer_portal_document($1,$2,$3,$4,$5,$6)',[tx,`client-portal/${tx}/qa.pdf`,'documents','qa.pdf','Buyer','buyer_id_document']),/canonical buyer document requirement is required/)
 await db.exec(readFileSync('../supabase/migrations/20261019210931_buyer_document_upload_continuity.sql','utf8'))
 console.log('Buyer document persistence SQL checks passed: replacement review, exact-party projection, buyer-only audience, missing bytes rollback, token/path rejection, idempotent migration.')
} finally {await db.close()}
