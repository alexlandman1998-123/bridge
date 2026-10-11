import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
after(() => db.close())
const sql = name => readFile(new URL(`../../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const actor = randomUUID(), stranger = randomUUID(), org = randomUUID(), transaction = randomUUID(), lead = randomUUID(), listing = randomUUID()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema document_security;
create function auth.uid() returns uuid language sql set search_path=public as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql set search_path=public as $$select current_setting('request.jwt.claim.role',true)$$;
create table profiles(id uuid primary key,role text);
create table transactions(id uuid primary key,organisation_id uuid,originating_buyer_lead_id uuid,private_listing_id uuid);
create table private_listings(id uuid primary key,organisation_id uuid,seller_lead_id text,originating_crm_lead_id text);
create table leads(lead_id uuid primary key,organisation_id uuid,lead_category text);
create table onboarding_form_data(transaction_id uuid,form_data jsonb);
create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assignment_status text,status text);
create table attorney_firm_members(firm_id uuid,user_id uuid,status text,professional_role text,role text);
create function bridge_has_transaction_permission(uuid,text) returns boolean language sql set search_path=public as $$select $1='${transaction}'::uuid and auth.uid()='${actor}'::uuid and coalesce(current_setting('test.access',true),'allowed')<>'denied'$$;
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql set search_path=public as $$select false$$;
create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql set search_path=public as $$select auth.uid()='${actor}'::uuid and current_setting('test.attorney',true)='allowed'$$;
create function bridge_can_access_private_listing(uuid) returns boolean language sql set search_path=public as $$select auth.uid()='${actor}'::uuid$$;
create function bridge_can_access_assignment(uuid,uuid,uuid) returns boolean language sql set search_path=public as $$select auth.uid()='${actor}'::uuid$$;
create table documents(id uuid primary key,transaction_id uuid not null,name text not null,file_path text unique not null,file_bucket text,category text,document_type text,canonical_requirement_instance_id uuid,uploaded_by_user_id uuid,visibility_scope text,is_client_visible boolean,client_recipient_role text,source text);
create function document_security.can_read(documents) returns boolean language sql set search_path=public as $$select ($1).uploaded_by_user_id=auth.uid()$$;
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,user_metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage,auth to anon,authenticated;
grant all on storage.objects to authenticated;
create policy legacy_owner_all on storage.objects for all to authenticated using(owner_id=auth.uid()::text) with check(owner_id=auth.uid()::text);
`)
await db.exec((await sql('202605250001_canonical_document_system_phase1')).replace('create extension if not exists "pgcrypto";', ''))
await db.exec(await sql('202605250005_canonical_document_lifecycle_phase6'))
await db.exec(await sql('202605250007_canonical_document_reminders_phase8'))
await db.exec(`
create table document_requests(id uuid primary key default gen_random_uuid(),transaction_id uuid not null,canonical_requirement_instance_id uuid references document_requirement_instances(id),status text not null default 'requested',requested_document_id uuid references documents(id),updated_at timestamptz default now(),requested_from text,assigned_to_role text,requires_review boolean default true,completed_at timestamptz,rejected_reason text);
create table transaction_required_documents(canonical_requirement_instance_id uuid,is_uploaded boolean,uploaded_document_id uuid,status text,uploaded_at timestamptz,updated_at timestamptz);
`)
// Use the real linked-request lifecycle triggers; the remainder patches unrelated legacy RPCs.
await db.exec((await sql('20260927091054_unify_transaction_document_actions_phase4')).split('-- Guard existing browser RPCs:')[0] + '\ncommit;')
await db.exec(await sql('20261011112703_flexible_document_requirement_identity'))
await db.exec(await sql('20261011114048_flexible_document_requirement_commands'))
await db.query('insert into profiles values ($1,$2),($3,$2)', [actor, 'agent', stranger])
await db.query('insert into leads values ($1,$2,$3)', [lead, org, 'buyer'])
await db.query('insert into private_listings values ($1,$2,null,null)', [listing, org])
await db.query('insert into transactions values ($1,$2,$3,$4)', [transaction, org, lead, listing])
await db.exec("insert into storage.buckets values ('documents',false)")
await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [actor])
async function command({ id = randomUUID(), action = 'add', type = 'transaction', context = transaction, requirement = null, revision = null, payload = { party: 'buyer', label: 'Additional SARS correspondence' } } = {}) {
  await db.exec('set role authenticated')
  try {
    return (await db.query('select bridge_document_requirement_command($1,$2,$3,$4,$5,$6,$7) result', [id, action, type, context, requirement, revision, payload])).rows[0].result
  } finally { await db.exec('reset role') }
}
const row = async id => (await db.query('select * from document_requirement_instances where id=$1', [id])).rows[0]
const change = (r, action, payload = { reason: 'Not applicable to this matter' }, extra = {}) => command({ action, requirement: r.id, revision: r.command_revision, payload, ...extra })

await db.exec(`
create schema extensions;
-- Only the digest is stubbed; production uses pgcrypto. Exercise session equality/expiry below.
create function extensions.digest(text,text) returns bytea language sql set search_path=public as $$select convert_to($1,'UTF8')$$;
create table private_listing_seller_onboarding(id uuid primary key default gen_random_uuid(),private_listing_id uuid,token text,seller_portal_token text,form_data jsonb default '{}',seller_portal_access_token_hash text,seller_portal_access_token_expires_at timestamptz);
create table client_portal_links(id uuid,transaction_id uuid,buyer_id uuid,development_id uuid,unit_id uuid,is_active boolean,token text,updated_at timestamptz);
create table buyers(id uuid,email text);
create table contacts(contact_id uuid,organisation_id uuid,email text);
alter table document_requests add column category text,add column document_type text,add column title text,add column description text,add column priority text,add column visibility_scope text,add column created_by uuid,add column created_by_role text;
create function bridge_private_listing_seller_portal_link_is_active(jsonb,jsonb) returns boolean language sql set search_path=public as $$select coalesce(current_setting('test.portal_active',true),'true')='true'$$;
create function bridge_resolve_private_listing_transaction_id(uuid) returns uuid language sql set search_path=public as $$select id from transactions where private_listing_id=$1 limit 1$$;
create function bridge_resolve_private_listing_seller_portal_token(text) returns table(onboarding_id uuid,token_valid boolean,token_kind text) language sql set search_path=public as $$select id,true,'stable'::text from private_listing_seller_onboarding where token=$1$$;
create function bridge_storage_request_header(text) returns text language sql set search_path=public as $$select nullif(current_setting('test.'||replace($1,'-','_'),true),'')$$;
alter table transactions add column listing_id uuid;
create function bridge_storage_seller_portal_listing_id() returns uuid language sql set search_path=public as $$select private_listing_id from private_listing_seller_onboarding where token=bridge_storage_request_header('x-bridge-seller-portal-token')$$;
create or replace function document_security.can_read(d documents) returns boolean language plpgsql set search_path=public as $$begin
 if d.uploaded_by_user_id=auth.uid() then return true; end if;
 if d.visibility_scope='client_visible' and d.client_recipient_role='seller' and exists(select 1 from public.transactions t where t.id=d.transaction_id and t.listing_id=public.bridge_storage_seller_portal_listing_id()) then return true; end if;
 return false;
end;$$;
create function bridge_private_listing_seller_portal_payload(text,text,boolean) returns jsonb language sql set search_path=public as $$select jsonb_build_object('listing',jsonb_build_object('id',private_listing_id),'requirements','[]'::jsonb,'documents','[]'::jsonb) from private_listing_seller_onboarding where token=$1$$;
create function document_requirement_private.read_context(text,uuid) returns jsonb language sql set search_path=public as $$select jsonb_build_object('requirements',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) from document_requirement_instances r where context_type=$1 and context_id=$2$$;
grant insert,select,update,delete on storage.objects to anon;
`)
// Load the real buyer RPC for compatibility; unrelated native storage policies
// depend on the full portal schema and are covered by their existing checks.
const buyerUploadMigration = await sql('20260831125409_atomic_buyer_portal_document_upload')
await db.exec(buyerUploadMigration.slice(buyerUploadMigration.indexOf('create or replace function'), buyerUploadMigration.indexOf('$$;') + 3))
await db.exec(await sql('20261011121724_flexible_document_request_delivery'))
await db.exec(await sql('20261011121850_flexible_seller_requirement_portal'))
await db.exec(`
create schema vault; create schema net; create schema cron;
create table vault.decrypted_secrets(name text,decrypted_secret text);
create table cron.jobs(name text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3);return 1;end$$;
create table net.requests(url text,headers jsonb,body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into net.requests values($1,$2,$3);return 1;end$$;
`)
await db.exec(await sql('20261011122133_schedule_document_requirement_delivery'))
await db.query("insert into private_listing_seller_onboarding(private_listing_id,token,seller_portal_token,form_data,seller_portal_access_token_hash,seller_portal_access_token_expires_at) values($1,'seller-link','seller-link',$2,encode(convert_to('session','UTF8'),'hex'),now()+interval '1 hour')",[listing,{sellerEmail:'seller@example.org'}])
const jobs=async()=>(await db.query('select * from document_requirement_private.delivery_jobs')).rows
const claim=async()=>(await db.query('select bridge_claim_requirement_deliveries(25) result')).rows[0].result
const prepareDelivery=async j=>(await db.query('select bridge_prepare_requirement_delivery($1,$2,$3) result',[j.id,j.claim_token,{to:'seller@example.org',html:'fixed',portalPath:'/client/seller-link/selling/documents'}])).rows[0].result

test('existing buyer upload RPC is patched so custom replacements require fresh review', async () => {
 const body=(await db.query("select pg_get_functiondef('public.bridge_upload_buyer_portal_document(uuid,text,text,text,text,text,text,uuid,uuid,text,text,text,uuid)'::regprocedure) body")).rows[0].body
 assert.match(body,/case when coalesce\(v_review_required,true\) then/)
 assert.match(body,/if v_requirement.document_definition_key is not null and v_previous_status in/)
})

test('scheduler skips missing Vault configuration and targets only the dispatcher when configured', async () => {
 assert.equal((await db.query('select schedule from cron.jobs')).rows[0].schedule,'* * * * *')
 assert.equal((await db.query('select document_requirement_private.run_delivery_dispatcher() result')).rows[0].result.scheduled,false)
 assert.equal((await db.query('select * from net.requests')).rows.length,0)
 await db.exec("insert into vault.decrypted_secrets values('arch9_project_url','https://fixture.invalid'),('arch9_service_role_key','fixture-only-key')")
 assert.equal((await db.query('select document_requirement_private.run_delivery_dispatcher() result')).rows[0].result.scheduled,true)
 assert.equal((await db.query('select url from net.requests')).rows[0].url,'https://fixture.invalid/functions/v1/document-requirement-dispatcher')
})

test('add/replay commits one durable job and one transaction request; queue is service-only',async()=>{
 const id=randomUUID();const a=await command({id});await command({id})
 assert.equal((await jobs()).filter(j=>j.requirement_id===a.requirement.id).length,1)
 assert.equal((await db.query('select count(*)::int n from document_requests where canonical_requirement_instance_id=$1',[a.requirement.id])).rows[0].n,1)
 await db.exec('set role authenticated');await assert.rejects(db.query('select bridge_claim_requirement_deliveries(1)'),/permission denied/);await db.exec('reset role')
})
test('removal cancels a claimed job and restoration never resends',async()=>{
 const a=await command({payload:{party:'seller',label:'Divorce papers'}});const j=(await claim()).find(j=>j.requirement_id===a.requirement.id)
 await change(await row(a.requirement.id),'remove');assert.equal(await prepareDelivery(j),null)
 await change(await row(a.requirement.id),'restore');assert.equal((await jobs()).find(x=>x.id===j.id).status,'cancelled')
})
test('seller portal uploads use exact identities, immutable storage, session checks and replay receipts',async()=>{
 const a=await command({type:'private_listing',context:listing,payload:{party:'seller',label:'SARS letter'}});const r=await row(a.requirement.id)
 const read=async()=>(await db.query("select bridge_private_listing_seller_portal_payload('seller-link','session',true) result")).rows[0].result
 assert.equal((await read()).requirements.find(x=>x.id===r.id).requirement_name,'SARS letter')
 await assert.rejects(db.query("select bridge_private_listing_seller_portal_payload('seller-link','wrong',true)"),/authentication/)
 const id=randomUUID();const file={fileName:'letter.pdf',mimeType:'application/pdf',sizeBytes:5,sha256:'a'.repeat(64),replacesUploadId:null,filePath:`document-requirements/${r.id}/${listing}/${id}/letter.pdf`}
 await db.query("select set_config('test.x_bridge_seller_portal_token','seller-link',false),set_config('test.x_bridge_seller_portal_access_token','session',false)")
 await db.exec('set role anon')
 await db.query('insert into storage.objects(bucket_id,name,metadata,user_metadata) values($1,$2,$3,$4)',['documents',file.filePath,{size:5,mimetype:'application/pdf'},{sha256:file.sha256}])
 const args=['seller-link','session',id,r.id,r.command_revision,file], query='select bridge_seller_requirement_upload($1,$2,$3,$4,$5,$6) result'
 const saved=(await db.query(query,args)).rows[0].result;assert.equal(saved.requirement.status,'under_review');assert.deepEqual((await db.query(query,args)).rows[0].result,saved)
 assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[file.filePath])).rows.length,0)
 await db.exec('reset role');assert.equal((await jobs()).find(j=>j.requirement_id===r.id).status,'cancelled')
 assert.equal((await read()).documents.find(d=>d.id===id).storage_path,file.filePath)
 await change(await row(r.id),'remove',{reason:'Not needed'},{type:'private_listing',context:listing})
 assert.ok(!(await read()).requirements.some(x=>x.id===r.id))
 await db.query("update private_listing_seller_onboarding set seller_portal_access_token_expires_at=now()-interval '1 minute'")
 await assert.rejects(db.query('select bridge_seller_requirement_upload_receipt($1,$2,$3)',['seller-link','session',id]),/authentication/)
 await db.query("update private_listing_seller_onboarding set seller_portal_access_token_expires_at=now()+interval '1 hour'")
})
test('provider envelopes remain frozen and retries stop inside the provider idempotency window',async()=>{
 const a=await command({payload:{party:'seller',label:'Proof'}});const j=(await claim()).find(j=>j.requirement_id===a.requirement.id)
 const first=await prepareDelivery(j)
 assert.deepEqual((await db.query('select bridge_prepare_requirement_delivery($1,$2,$3) result',[j.id,j.claim_token,{to:'other@example.org',html:'changed'}])).rows[0].result,first)
 await db.query("update document_requirement_private.delivery_jobs set first_attempt_at=now()-interval '24 hours' where id=$1",[j.id])
 assert.equal(await prepareDelivery(j),null);assert.equal((await jobs()).find(x=>x.id===j.id).status,'needs_attention')
})
test('recipient resolution requires an active matching portal',async()=>{
 const a=await command({type:'private_listing',context:listing,payload:{party:'seller',label:'Personal request'}});const j=(await claim()).find(j=>j.requirement_id===a.requirement.id)
 const target=async()=>(await db.query('select bridge_requirement_delivery_target($1,$2) result',[j.id,j.claim_token])).rows[0].result
 assert.equal((await target()).to,'seller@example.org')
 await db.query("select set_config('test.portal_active','false',false)");assert.equal(await target(),null)
 await db.query("select set_config('test.portal_active','true',false)")
})
test('seller upload stays the same file through handover and a later native upload becomes current',async()=>{
 const a=await command({type:'private_listing',context:listing,payload:{party:'seller',label:'Handover file'}});const r=await row(a.requirement.id)
 const id=randomUUID(); const file={fileName:'handover.pdf',mimeType:'application/pdf',sizeBytes:5,sha256:'b'.repeat(64),replacesUploadId:null,filePath:`document-requirements/${r.id}/${listing}/${id}/handover.pdf`}
 await db.query('insert into storage.objects(bucket_id,name,metadata,user_metadata) values($1,$2,$3,$4)',['documents',file.filePath,{size:5,mimetype:'application/pdf'},{sha256:file.sha256}])
 await db.query('select bridge_seller_requirement_upload($1,$2,$3,$4,$5,$6)',['seller-link','session',id,r.id,r.command_revision,file])
 await db.query('select bridge_handoff_manual_document_requirements($1)',[transaction])
 assert.equal((await row(r.id)).latest_upload_id,id)
 assert.equal((await db.query('select file_path from documents where id=$1',[id])).rows[0].file_path,file.filePath)
 assert.equal((await db.query('select document_security.can_read(d) allowed from documents d where id=$1',[id])).rows[0].allowed,true)
 const next=randomUUID();await db.query('insert into documents(id,transaction_id,name,file_path,canonical_requirement_instance_id) values($1,$2,$3,$4,$5)',[next,transaction,'native.pdf','native/'+next,r.id])
 await db.query('update document_requirement_instances set satisfied_by_document_id=$1 where id=$2',[next,r.id])
 assert.equal((await row(r.id)).latest_upload_id,null)
 assert.equal((await row(r.id)).satisfied_by_document_id,next)
})
test('foreign seller sessions cannot see or upload another listing requirement',async()=>{
 const other=randomUUID();await db.query('insert into private_listings values($1,$2,null,null)',[other,org])
 await db.query("insert into private_listing_seller_onboarding(private_listing_id,token,seller_portal_access_token_hash,seller_portal_access_token_expires_at) values($1,'other-link',encode(convert_to('other-session','UTF8'),'hex'),now()+interval '1 hour')",[other])
 const a=await command({payload:{party:'seller',label:'Private seller paper'}})
 const result=(await db.query("select bridge_private_listing_seller_portal_payload('other-link','other-session',true) result")).rows[0].result
 assert.ok(!result.requirements.some(r=>r.id===a.requirement.id))
 await assert.rejects(db.query('select bridge_seller_requirement_upload($1,$2,$3,$4,$5,$6)',['other-link','other-session',randomUUID(),a.requirement.id,a.requirement.command_revision,{}]),/does not accept/)
})
test('recipient changes between rendering and send preparation cancel the frozen attempt',async()=>{
 const a=await command({payload:{party:'seller',label:'Recipient change'}});const j=(await claim()).find(j=>j.requirement_id===a.requirement.id)
 const envelope=await prepareDelivery(j);assert.ok(envelope)
 await db.query('update private_listing_seller_onboarding set form_data=$2 where private_listing_id=$1',[listing,{sellerEmail:'changed@example.org'}])
 assert.equal(await prepareDelivery(j),null);assert.equal((await jobs()).find(x=>x.id===j.id).status,'cancelled')
 await db.query('update private_listing_seller_onboarding set form_data=$2 where private_listing_id=$1',[listing,{sellerEmail:'seller@example.org'}])
})

test('duplicate guard preserves replay, subject boundaries and one request/email job', async () => {
 await db.exec(await sql('20261011124827_prevent_duplicate_document_requests'))
 const id=randomUUID(), payload={party:'buyer',label:'Duplicate guard papers'}
 const original=await command({id,payload})
 const before=(await jobs()).length
 assert.equal((await command({id,payload})).requirement.id,original.requirement.id)
 await assert.rejects(command({payload:{party:'buyer',label:'  DUPLICATE   guard papers  '}}),error=>error.code==='P0001' && error.detail==='document_requirement_duplicate')
 assert.equal((await jobs()).length,before)
 assert.equal((await db.query('select count(*)::int n from document_requests where canonical_requirement_instance_id=$1',[original.requirement.id])).rows[0].n,1)
 await change(await row(original.requirement.id),'remove')
 await assert.rejects(command({payload}),/already requested/)
 await change(await row(original.requirement.id),'restore')
 assert.equal((await jobs()).length,before)
 // Party, person and source-matter differences must remain independent.
 await command({payload:{...payload,party:'seller'}})
 const people=[randomUUID(),randomUUID()]
 await db.query('insert into onboarding_form_data values($1,$2)',[transaction,{__bridge_transaction_parties:{buyer:{people:people.map(id=>({id}))}}}])
 for(const person of people) await command({payload:{...payload,subjectKind:'person',subjectId:person}})
 await assert.rejects(command({payload:{...payload,subjectKind:'person',subjectId:people[0]}}),/already requested/)
 const other=randomUUID();await db.query('insert into private_listings values($1,$2,null,null)',[other,org])
 await command({type:'private_listing',context:other,payload:{...payload,party:'seller'}})
 // Catalogue identity is preserved; choosing custom with its exact name cannot bypass it.
 await db.exec("insert into document_packs(key,display_label) values('duplicate_test','Test'); insert into document_definitions(key,display_label,category,pack_key,default_requirement_level,default_upload_roles) values('duplicate_test_type','Catalogue papers','General','duplicate_test','required',array['buyer'])")
 await command({payload:{party:'buyer',definitionKey:'duplicate_test_type'}})
 await assert.rejects(command({payload:{party:'buyer',definitionKey:'duplicate_test_type'}}),/already requested/)
 await assert.rejects(command({payload:{party:'buyer',label:'Catalogue papers'}}),/already requested/)
 await db.exec('set role authenticated')
 await assert.rejects(db.query("select document_requirement_private.assert_new_requirement('transaction',$1,'buyer','party',null,null,'test')",[transaction]),/permission denied/)
 await db.exec('reset role')
})
