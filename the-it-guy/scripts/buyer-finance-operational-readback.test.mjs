import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
try{
 await db.exec(`create schema document_security;
 create table transactions(id uuid primary key,primary_bond_consultant_user_id uuid,bond_workspace_id uuid,bond_amount numeric);
 create table transaction_role_players(id uuid,transaction_id uuid,role_type text,updated_at timestamptz,snapshot_json jsonb);
 create table transaction_bond_originator_workspace_assignments(transaction_id uuid,status text,assigned_at timestamptz,accepted_at timestamptz,assigned_to_profile_id uuid);
 create table profiles(id uuid,full_name text,email text);create table organisations(id uuid,name text);
 create table transaction_bond_applications(id uuid,transaction_id uuid,bank_name text,status text,submitted_at timestamptz,updated_at timestamptz,application_type text);
 create table transaction_bond_application_export_packages(id uuid,transaction_id uuid,destination_key text,status text);
 create table bond_application_external_submission_records(id uuid,export_package_id uuid,lender_names text[],status text,submitted_at timestamptz);
 create table transaction_finance_workflows(id uuid,transaction_id uuid);
 create table transaction_finance_workflow_events(workflow_id uuid,created_by uuid,to_stage text);
 create table documents(id uuid primary key,transaction_id uuid,name text,file_path text,file_bucket text,is_client_visible boolean,client_recipient_role text);
 create table transaction_bond_quotes(id uuid primary key,transaction_id uuid,bank_name text,quoted_amount numeric,interest_rate numeric,interest_rate_display text,monthly_repayment numeric,valid_until date,quote_expiry_at timestamptz,quote_document_id uuid,quote_status text,approved_at timestamptz,quote_received_at timestamptz,created_at timestamptz);
 create table transaction_bond_originator_bank_offer_captures(id uuid,transaction_id uuid,export_package_id uuid,bank_name text,offered_amount numeric,interest_rate numeric,interest_rate_display text,monthly_repayment numeric,valid_until text,quote_document_id uuid,conditions_summary text,status text,buyer_decision text,published_at timestamptz,linked_bond_quote_id uuid);
 create table transaction_bond_originator_grant_captures(id uuid,transaction_id uuid,export_package_id uuid,bank_name text,approved_amount numeric,grant_document_id uuid,status text,published_at timestamptz);
 create table transaction_bond_instructions(id uuid,transaction_id uuid,accepted_bond_offer_id uuid,grant_document_id uuid,grant_received boolean,grant_signed boolean,grant_submitted boolean,grant_received_at timestamptz);
 create function bridge_portal_matter_financial_transaction_id(text) returns uuid language sql stable as $$select nullif(current_setting('test.buyer_tx',true),'')::uuid$$;
 create function document_security.can_read(doc public.documents) returns boolean language sql stable as $$select doc.transaction_id=bridge_portal_matter_financial_transaction_id('buyer') and doc.is_client_visible and coalesce(doc.client_recipient_role,'buyer')<>'seller'$$;
 select set_config('test.buyer_tx','${id(1)}',false);
 insert into transactions values('${id(1)}','${id(10)}','${id(11)}',2190000),('${id(2)}',null,null,100);
 insert into profiles values('${id(10)}','Consultant','consultant@example.test');insert into organisations values('${id(11)}','Originator');
 insert into transaction_finance_workflows values('${id(20)}','${id(1)}');
 insert into documents values('${id(30)}','${id(1)}','quote.pdf','own/quote.pdf','documents',true,'buyer'),('${id(31)}','${id(2)}','foreign.pdf','foreign.pdf','documents',true,'buyer'),('${id(32)}','${id(1)}','private.pdf','private.pdf','documents',false,'buyer'),('${id(33)}','${id(1)}','seller.pdf','seller.pdf','documents',true,'seller');
 insert into transaction_bond_quotes(id,transaction_id,bank_name,quoted_amount,quote_document_id,quote_status,quote_received_at,created_at) values
 ('${id(40)}','${id(1)}','Bank',2190000,'${id(30)}','received',now(),now()),('${id(41)}','${id(1)}','Foreign',100,'${id(31)}','received',now(),now()),('${id(42)}','${id(1)}','Private',100,'${id(32)}','received',now(),now()),('${id(43)}','${id(1)}','Seller',100,'${id(33)}','received',now(),now());`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104113200_buyer_finance_canonical_offers.sql',import.meta.url),'utf8'))
 const read=()=>scalar('select bridge_read_buyer_originator_finance($1)',[id(1)])
 let result=await read();assert.equal(result.offerCaptures.length,1);assert.equal(result.offerCaptures[0].id,id(40));assert.equal(result.applicationReceived,false)
 assert.equal((await scalar('select bridge_read_buyer_quote_document($1,$2)',[id(1),id(40)])).filePath,'own/quote.pdf')
 for(const offer of [id(41),id(42),id(43)])await assert.rejects(scalar('select bridge_read_buyer_quote_document($1,$2)',[id(1),offer]),/not available/)
 await db.exec(`insert into transaction_finance_workflow_events values('${id(20)}','${id(10)}','documents');`)
 assert.equal((await read()).applicationReceived,true)
 await db.exec(`insert into transaction_bond_application_export_packages values('${id(50)}','${id(1)}','bond_originator_intake','accepted');
 insert into transaction_bond_originator_bank_offer_captures(id,transaction_id,export_package_id,bank_name,quote_document_id,status,published_at,linked_bond_quote_id) values('${id(60)}','${id(1)}','${id(50)}','Bank','${id(30)}','published_to_buyer',now(),'${id(40)}');`)
 result=await read();assert.equal(result.offerCaptures.length,1);assert.equal(result.offerCaptures[0].id,id(60))
 await db.query("update transaction_bond_application_export_packages set status='cancelled' where id=$1",[id(50)])
 assert.equal((await read()).offerCaptures[0].id,id(40),'A cancelled capture cannot hide a valid operational quote.')
 await db.exec(`insert into transaction_bond_instructions values('${id(70)}','${id(1)}','${id(40)}','${id(30)}',true,true,true,now());`)
 assert.equal((await read()).grantCaptures[0].status,'submitted_for_instruction')
 await db.exec(`insert into transaction_bond_originator_grant_captures values('${id(71)}','${id(1)}','${id(50)}','Bank',2190000,'${id(30)}','published_to_buyer',now());`)
 assert.equal((await read()).grantCaptures[0].id,id(70),'A cancelled grant capture cannot hide a valid operational grant.')
 await db.exec("select set_config('test.buyer_tx','',false)")
 await assert.rejects(read(),/access denied/)
 await assert.rejects(scalar('select bridge_read_buyer_quote_document($1,$2)',[id(1),id(40)]),/access denied/)
 console.log('PASS operational quotes/grants and explicit consultant receipt are visible; capture deduplication, cancelled packages, document audiences, foreign files and expired/missing buyer context remain protected.')
}finally{await db.close()}
