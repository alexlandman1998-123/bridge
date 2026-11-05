import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Actual migration functions execute against PostgreSQL. Rows, auth, Storage
// path helpers and non-target services are synthetic; no network is used.
const db = new PGlite()
const sql = async (q, values = []) => (await db.query(q, values)).rows
const scalar = async (q, values = []) => Object.values((await sql(q, values))[0])[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let checks = 0
const verify = async (label, action) => { await action(); checks++; console.log(`PASS ${label}`) }
try {
await db.exec(`create schema auth; create schema storage; create schema extensions;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
create function public.bridge_request_header(text) returns text language sql as $$ select current_setting('request.headers',true)::jsonb->>$1 $$;
create function public.bridge_storage_request_header(text) returns text language sql as $$ select public.bridge_request_header($1) $$;
create function storage.foldername(text) returns text[] language sql as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create function storage.filename(text) returns text language sql as $$ select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)] $$;
create function public.bridge_portal_matter_financial_transaction_id(text default 'buyer') returns uuid language sql as $$ select null::uuid $$;
create function public.bridge_private_listing_seller_portal_payload(text,text default null,boolean default false) returns jsonb language sql as $$ select null::jsonb $$;
create function public.bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql as $$ select null::uuid $$;`)
await db.exec(await fs.readFile(new URL('./fixtures/portal-contracts.sql', import.meta.url),'utf8'))
await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261103203423_portal_token_expiry_and_originator_contract_repairs.sql',import.meta.url),'utf8'))
const header = token => sql(`select set_config('request.headers',$1,false)`,[JSON.stringify({'x-bridge-client-portal-token':token})])
await sql(`insert into client_portal_links(token,transaction_id,is_active,expires_at) values ('current',$1,true,now()+interval '1 day'),('permanent',$1,true,null),('expired',$1,true,now()-interval '1 day'),('revoked',$1,false,null)`,[id(1)])
await sql(`insert into documents(id,transaction_id,file_path,file_bucket,is_client_visible) values($1,$2,'transaction/shared.pdf','documents',true),($3,$2,'transaction/internal.pdf','documents',false)`,[id(2),id(1),id(3)])
for (const [token,allowed] of [['current',true],['permanent',true],['expired',false],['revoked',false]]) {
 await verify(`buyer token ${token}: header and Storage expiry`,async()=>{
  await header(token)
  assert.equal(await scalar('select bridge_client_portal_request_token()'),allowed?token:'')
  assert.equal(await scalar('select bridge_storage_buyer_portal_can_write($1)',[`client-portal/${id(1)}/file.pdf`]),allowed)
  assert.equal(await scalar("select bridge_storage_buyer_portal_can_read('transaction/shared.pdf')"),allowed)
  assert.equal(await scalar("select bridge_storage_buyer_portal_can_read('transaction/internal.pdf')"),false)
  assert.equal(await scalar('select bridge_storage_buyer_portal_can_write($1)',[`client-portal/${id(9)}/file.pdf`]),false)
 })
}
await verify('unknown seller token remains available to its separate secure resolver',async()=>{await header('seller-token');assert.equal(await scalar('select bridge_client_portal_request_token()'),'seller-token')})
await verify('expired buyer financial RPCs deny reads and access-event writes',async()=>{
 assert.deepEqual(await scalar("select bridge_attorney_client_financial_documents_by_token('expired','buyer')"),[])
 assert.deepEqual(await scalar("select bridge_attorney_client_financial_notifications_by_token('expired','buyer')"),[])
 await assert.rejects(sql("select bridge_record_attorney_client_financial_document_access('expired','buyer',$1)",[id(2)]),{code:'42501'})
})
await verify('current buyer financial reads and deduplicated access recording remain available',async()=>{
 await db.exec(`create function public.digest(text,text) returns bytea language sql as $$ select sha256(convert_to($1,'UTF8')) $$;
 alter table attorney_client_financial_document_access_events add unique(publication_event_id,recipient_role,event_type);
 alter table attorney_client_financial_document_access_events alter column id set default gen_random_uuid();`)
 await sql(`update documents set client_recipient_role='buyer' where id=$1`,[id(2)])
 await sql(`insert into transaction_attorney_client_financial_document_metadata(document_id,transaction_id,recipient_role,publication_status,document_definition_key,published_at) values($1,$2,'buyer','published','invoice',now())`,[id(2),id(1)])
 await sql(`insert into attorney_client_financial_document_publication_events(id,document_id,transaction_id,recipient_role,document_definition_key,action,created_at) values($1,$2,$3,'buyer','invoice','published',now())`,[id(4),id(2),id(1)])
 await sql(`insert into client_portal_notifications(id,transaction_id,client_role,visibility,status,related_entity_type) values($1,$2,'buyer','client_visible','new','attorney_client_financial_document')`,[id(5),id(1)])
 assert.equal((await scalar("select bridge_attorney_client_financial_documents_by_token('current','buyer')")).length,1)
 assert.equal((await scalar("select bridge_attorney_client_financial_notifications_by_token('current','buyer')")).length,1)
 const first=await scalar("select bridge_record_attorney_client_financial_document_access('current','buyer',$1)",[id(2)])
 assert.ok(first.id)
 assert.equal((await scalar("select bridge_record_attorney_client_financial_document_access('current','buyer',$1)",[id(2)])).id,first.id)
 assert.equal(await scalar('select count(*)::int from attorney_client_financial_document_access_events'),1)
})
await sql(`insert into transaction_bond_application_export_packages(id,bond_application_id,destination_key,status) values($1,$2,'bond_originator_intake','active')`,[id(10),id(11)])
await sql(`insert into transaction_bond_originator_workspace_assignments(export_package_id,assigned_to_profile_id,status) values($1,$2,'accepted')`,[id(10),id(12)])
await sql(`insert into bond_application_portal_access_links(id,bond_application_id) values($1,$2)`,[id(13),id(11)])
await sql(`insert into bond_application_document_requirements(id,bond_application_id,requirement_key,status,linked_document_id) values($1,$3,'identity','active',null),($2,$3,'address','linked',$4)`,[id(14),id(15),id(11),id(2)])
await sql(`insert into transaction_bond_originator_document_requests(id,bond_application_id,requirement_key,status) values($1,$3,'identity','awaiting_review'),($2,$3,'identity','awaiting_review')`,[id(16),id(17),id(11)])
await verify('unassigned actor cannot see continuity or revoke another originator link',async()=>{
 await sql("select set_config('test.actor',$1,false)",[id(90)])
 assert.deepEqual((await scalar('select bridge_bond_originator_document_continuity()')).items,[])
 await assert.rejects(sql('select bridge_revoke_bond_originator_portal_link($1)',[id(13)]),{code:'42501'})
})
await verify('assigned originator counts requirements once across multiple matching requests',async()=>{
 await sql("select set_config('test.actor',$1,false)",[id(12)])
 assert.deepEqual((await scalar('select bridge_bond_originator_document_continuity()')).items[0].summary,{total:2,linked:1,outstanding:1,awaitingReview:2})
})
await verify('assigned originator revocation is idempotent and respects removed assignment',async()=>{
 const first=await scalar('select bridge_revoke_bond_originator_portal_link($1)',[id(13)])
 assert.ok(first.revokedAt); assert.deepEqual(await scalar('select bridge_revoke_bond_originator_portal_link($1)',[id(13)]),first)
 await sql("update transaction_bond_originator_workspace_assignments set status='removed'")
 await assert.rejects(sql('select bridge_revoke_bond_originator_portal_link($1)',[id(13)]),{code:'42501'})
})
await verify('anonymous SQL role has no execution grant for partner actions',async()=>{
 for(const name of ['bridge_bond_originator_document_continuity()','bridge_revoke_bond_originator_portal_link(uuid)']) assert.equal(await scalar("select has_function_privilege('anon',$1,'execute')",[name]),false)
})
await db.exec(`create schema buyer_capture_private;
create table transactions(id uuid primary key,onboarding_status text,onboarding_completed_at timestamptz,external_onboarding_submitted_at timestamptz,current_main_stage text,finance_type text,finance_managed_by text,sales_price numeric,purchase_price numeric,cash_amount numeric,bond_amount numeric,deposit_amount numeric,reservation_required boolean,reservation_amount numeric,reservation_status text,reservation_paid_date date,purchaser_type text);
create table onboarding_form_data(transaction_id uuid primary key,form_data jsonb,updated_at timestamptz);
create table buyers(id uuid primary key,name text,email text,phone text);
create table transaction_participants(buyer_party_id uuid,participant_name text,participant_email text,participant_phone text,updated_at timestamptz,removed_at timestamptz);
create table buyer_profile_data(buyer_id uuid primary key,profile_data jsonb,profile_version integer,updated_at timestamptz);
create function bridge_onboarding_request_token() returns text language sql as $$ select ''::text $$;
create function buyer_capture_private.context(uuid,uuid) returns jsonb language plpgsql as $$ begin
 perform 1 from public.transactions where id=$1 for update;
 return jsonb_build_object('buyerId',current_setting('test.buyer'), 'participantId',current_setting('test.participant'),'buyer','{}'::jsonb,'revision',jsonb_build_object('profileVersion',(select coalesce(profile_version,1) from public.buyer_profile_data where buyer_id=current_setting('test.buyer')::uuid))); end $$;
create function buyer_capture_private.check_link_target(jsonb,text) returns void language plpgsql as $$ begin if $2 is distinct from 'nonce' then raise exception using errcode='42501'; end if; end $$;
create function buyer_capture_private.person_fields(jsonb) returns jsonb language sql as $$ select jsonb_build_object('email',$1->>'email') $$;
create function bridge_save_buyer_onboarding_snapshot_internal(jsonb,jsonb,jsonb,boolean,text) returns jsonb language plpgsql as $$ begin
 update public.transactions set onboarding_status=$2->>'onboarding_status',purchase_price=($2->>'purchase_price')::numeric,finance_type=$2->>'finance_type',deposit_amount=($2->>'deposit_amount')::numeric where id=current_setting('test.tx')::uuid;
 update public.onboarding_form_data set form_data=$1,updated_at=now() where transaction_id=current_setting('test.tx')::uuid;
 return jsonb_build_object('snapshot',$2,'form',$1); end $$;`)
await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261103204341_portal_onboarding_draft_preservation.sql',import.meta.url),'utf8'))
await sql("select set_config('test.tx',$1,false),set_config('test.buyer',$2,false),set_config('test.participant',$3,false)",[id(1),id(20),id(21)])
await header('current')
await db.exec(`insert into transactions(id,onboarding_status,current_main_stage,finance_type,purchase_price,sales_price,deposit_amount,purchaser_type) values('${id(1)}','signed_otp_received','FIN','bond',2000000,2000000,200000,'individual'); insert into buyers(id) values('${id(20)}');insert into buyer_profile_data(buyer_id,profile_data,profile_version) values('${id(20)}','{}',1);insert into transaction_participants(buyer_party_id) values('${id(20)}');insert into onboarding_form_data(transaction_id,form_data) values('${id(1)}','{"__bridge_seller_private":"unchanged"}')`)
const save = async (snapshot,submit=false,extra={})=>scalar('select bridge_save_buyer_onboarding_snapshot($1::jsonb,$2::jsonb,\'[]\'::jsonb,$3)',[JSON.stringify({first_name:'New',last_name:'Buyer',email:'NEW@EXAMPLE.TEST',phone:'0820000000',buyerTargetNonce:'nonce',__bridge_buyer_capture_revision:await scalar("select jsonb_build_object('formUpdatedAt',f.updated_at,'profileVersion',p.profile_version) from onboarding_form_data f cross join buyer_profile_data p"),purchase_price:1,purchase_finance_type:'cash',...extra}),JSON.stringify(snapshot),submit])
for(const submit of [false,true]) await verify(`post-OTP ${submit?'submit':'draft'} preserves signed terms and private metadata while syncing buyer contact`,async()=>{
 const r=await save({onboarding_status:'awaiting_client_onboarding',finance_type:'cash',purchase_price:1,deposit_amount:0},submit)
 assert.equal(r.snapshot.purchase_price,2000000);assert.equal(r.snapshot.onboarding_status,'signed_otp_received');assert.equal(r.form.purchase_price,2000000);assert.equal(r.form.purchase_finance_type,'bond');assert.equal(r.form.__bridge_seller_private,'unchanged')
 assert.equal(await scalar('select email from buyers'),'new@example.test');assert.equal(await scalar('select participant_email from transaction_participants'),'new@example.test')
})
await verify('a stale personal form cannot relabel a signed company buyer',async()=>{
 await sql("update transactions set purchaser_type='company'")
 await assert.rejects(save({},false,{purchaser_type:'individual'}),{code:'PT409'})
})
await verify('company contact saves keep the typed and mirrored legal type aligned',async()=>{
 const r=await save({purchase_price:1,finance_type:'cash'},false,{purchaser_type:'company',company_name:'Recorded Company',company_contact_email:'company@example.test',company_contact_phone:'0820000001'})
 assert.equal(r.snapshot.purchaser_type,'company');assert.equal(r.form.purchaser_type,'company')
 assert.equal(await scalar('select name from buyers'),'Recorded Company')
 assert.equal(await scalar('select participant_email from transaction_participants'),'company@example.test')
})
await verify('stale revisions and mismatched link nonce still reject before persistence',async()=>{
 await assert.rejects(save({},false,{__bridge_buyer_capture_revision:{profileVersion:999}}),{code:'PT409'})
 await assert.rejects(save({},false,{buyerTargetNonce:'wrong'}),{code:'42501'})
})
await verify('pre-OTP initial submission still accepts intended deal capture',async()=>{
 await db.exec("update public.transactions set onboarding_status='awaiting_client_onboarding',current_main_stage='OTP';update public.onboarding_form_data set form_data='{}'")
 const r=await save({onboarding_status:'client_onboarding_complete',purchase_price:3000000,finance_type:'cash'},true)
 assert.equal(r.snapshot.purchase_price,3000000);assert.equal(r.snapshot.onboarding_status,'client_onboarding_complete')
})
await verify('reapplying both forward corrections changes no existing fixture rows',async()=>{
 const snapshot=()=>scalar(`select jsonb_build_object('transactions',(select jsonb_agg(to_jsonb(t)) from transactions t),'buyers',(select jsonb_agg(to_jsonb(b)) from buyers b),'links',(select jsonb_agg(to_jsonb(l)) from client_portal_links l),'forms',(select jsonb_agg(to_jsonb(f)) from onboarding_form_data f))`)
 const before=await snapshot()
 for(const name of ['20261103203423_portal_token_expiry_and_originator_contract_repairs.sql','20261103204341_portal_onboarding_draft_preservation.sql']) await db.exec(await fs.readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'))
 assert.deepEqual(await snapshot(),before)
})
console.log(`${checks} isolated migration scenarios passed`)
} finally { await db.close() }
