import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url);
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create table public.organisations(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.transactions(id uuid primary key);
create table public.organisation_users(organisation_id uuid,user_id uuid,status text,membership_status text,role text,workspace_role text,organization_role text,organisation_role text);
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(bucket_id text,name text,metadata jsonb);
create table public.knowledge_factory_report_purchase_intents(id uuid primary key);
create table public.knowledge_factory_report_results(id uuid primary key,organisation_id uuid,actor_id uuid,property_id bigint,report_data jsonb,request_context_snapshot jsonb,report_snapshot_version text,executed_at timestamptz);
`);
const schema=readFileSync(new URL('the-it-guy/sql/schema.sql',root),'utf8');
for(const name of ['contacts','leads','lead_activities']) {
 const create=schema.match(new RegExp(`create table if not exists ${name} \\([\\s\\S]*?\\n\\);`))[0];
 await db.exec(create);
}
await db.exec(`alter table leads add column listing_id text,add column branch_id uuid,add column assigned_agent_email text,add column source_reference_id text,add column lead_domain text,add column created_by uuid,add column assigned_user_id uuid,add column assigned_at timestamptz,add column ownership_status text,add column formatted_address text,add column suburb text,add column city text,add column province text,add column postal_code text;`);
const base=readFileSync(new URL('the-it-guy/sql/20260509_private_listing_foundation.sql',root),'utf8');
for(const name of ['private_listings','private_listing_seller_onboarding'])await db.exec(base.match(new RegExp(`create table if not exists public.${name} \\([\\s\\S]*?\\n\\);`))[0]);
await db.exec(`alter table private_listings add column branch_id uuid,add column listing_source text,add column formatted_address text;
create unique index onboarding_listing_unique on private_listing_seller_onboarding(private_listing_id);`);
const docs=readFileSync(new URL('supabase/migrations/202605130006_private_listing_requirement_engine.sql',root),'utf8');
for(const name of ['private_listing_document_requirements','private_listing_documents'])await db.exec(docs.match(new RegExp(`create table if not exists public.${name} \\([\\s\\S]*?\\n\\);`))[0]);
await db.exec('alter table private_listing_documents add column category text;');
await db.exec(readFileSync(new URL('supabase/migrations/20261019185816_knowledge_factory_seller_lead_filing.sql',root),'utf8'));
await db.exec(readFileSync(new URL('supabase/migrations/20261019191728_knowledge_factory_report_boundary_and_existing_seller.sql',root),'utf8'));
const org='10000000-0000-4000-8000-000000000001',org2='10000000-0000-4000-8000-000000000002',actor='20000000-0000-4000-8000-000000000001',actor2='20000000-0000-4000-8000-000000000002';
await db.query('insert into organisations values ($1),($2)',[org,org2]);
await db.query('insert into auth.users values ($1),($2)',[actor,actor2]);await db.query('insert into profiles values ($1),($2)',[actor,actor2]);
await db.query(`insert into organisation_users(organisation_id,user_id,status,role) values($1,$2,'active','agent'),($3,$4,'active','agent')`,[org,actor,org2,actor2]);
async function report(id,environment='live',property=123,owners=[{name:'Example A',type:'Natural person',share:0},{name:'Example B',type:'Company',share:50}]) {
 await db.query(`insert into knowledge_factory_report_results values($1,$2,$3,$4,$5,$6,'canvassing-report-v1',now())`,[id,org,actor,property,{property:{address:'24 Example Lane',suburb:'Sample Gardens',type:'Residential'},owners},{supplierEnvironment:environment}]);
}
const a='30000000-0000-4000-8000-000000000001',b='30000000-0000-4000-8000-000000000002',c='30000000-0000-4000-8000-000000000003';
const rpc=async(id,who=actor,fn='knowledge_factory_prepare_seller_filing')=>(await db.query(`select public.${fn}($1,$2) as receipt`,[id,who])).rows[0].receipt;
await report(a);const first=await rpc(a);assert.equal(first.status,'pending');
assert.equal((await rpc(a)).lead_id,first.lead_id);
let form=(await db.query('select form_data from private_listing_seller_onboarding')).rows[0].form_data;
assert.equal(form.multipleOwners.length,2);assert.equal(form.multipleOwners[0].ownershipShare,0);assert.equal(form.multipleOwners[1].supplierOwnerType,'Company');
assert.equal(form.ownershipRouteConfirmed,false);assert.equal(form.ownershipDeclarationPending,true);
await db.query(`update private_listing_seller_onboarding set form_data=form_data||'{"sellerFirstName":"Agent edit","phone":"0123456789"}'`);
await report(b);const second=await rpc(b);assert.equal(second.lead_id,first.lead_id);assert.notEqual(second.storage_path,first.storage_path);
form=(await db.query('select form_data from private_listing_seller_onboarding')).rows[0].form_data;assert.equal(form.sellerFirstName,'Agent edit');assert.equal(form.phone,'0123456789');
assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,1);
await assert.rejects(rpc(a,actor2),/membership/);
await report(c,'uat',999);assert.equal((await rpc(c)).status,'test_report');assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,1);
await assert.rejects(rpc(a,actor,'knowledge_factory_complete_seller_filing'),/PDF has not been saved/);
await db.query(`insert into storage.buckets values('documents',false)`);
await db.query(`insert into storage.objects values('documents',$1,'{"mimetype":"application/pdf"}')`,[first.storage_path]);
const done=await rpc(a,actor,'knowledge_factory_complete_seller_filing');assert.equal(done.status,'filed');assert.equal((await rpc(a,actor,'knowledge_factory_complete_seller_filing')).document_id,done.document_id);
assert.equal((await db.query('select count(*)::int n from private_listing_documents')).rows[0].n,1);
await db.exec('set role authenticated');
await assert.rejects(db.query('select knowledge_factory_prepare_seller_filing($1,$2)',[a,actor]),/permission denied/);
await assert.rejects(db.query('select * from knowledge_factory_report_seller_filings'),/permission denied/);
await db.exec('reset role');
console.log('PASS: migration executes; all owners and zero shares saved; repeat reports reuse one lead; edits retained; UAT isolated; tenant/role checks; private storage required; document completion idempotent.');
// An older manually captured seller has no supplier ID or listing yet.
const manual=(await db.query(`insert into leads(organisation_id,assigned_agent_id,lead_category,lead_source,seller_property_address) values($1,$2,'seller','Manual','24 Existing Lane') returning lead_id`,[org,actor])).rows[0].lead_id;
const targetArgs=[org,actor,456,manual];
assert.equal((await db.query('select knowledge_factory_validate_seller_target($1,$2,$3,$4) v',targetArgs)).rows[0].v.leadId,manual);
const options=(await db.query('select knowledge_factory_seller_lead_options($1,$2,$3) v',[org,actor,456])).rows[0].v;
assert.ok(options.items.some(x=>x.leadId===manual));assert.ok(!options.items.some(x=>x.leadId===first.lead_id));
await assert.rejects(db.query('select knowledge_factory_validate_seller_target($1,$2,$3,$4)',[org2,actor2,456,manual]),/not found/);
const manualReport='30000000-0000-4000-8000-000000000004';await report(manualReport,'live',456);
await db.query(`update knowledge_factory_report_results set request_context_snapshot=request_context_snapshot||jsonb_build_object('targetSellerLeadId',$1::text) where id=$2`,[manual,manualReport]);
const linked=await rpc(manualReport);assert.equal(linked.lead_id,manual);assert.equal((await rpc(manualReport)).private_listing_id,linked.private_listing_id);
assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,2);
assert.equal((await db.query('select form_data from private_listing_seller_onboarding where private_listing_id=$1',[linked.private_listing_id])).rows[0].form_data.knowledgeFactory.owners.length,2);
await assert.rejects(db.query('select knowledge_factory_validate_seller_target($1,$2,$3,$4)',[org,actor,789,manual]),/another property/);
await assert.rejects(db.query('select knowledge_factory_validate_seller_target($1,$2,$3,$4)',[org,actor,123,manual]),/different seller/);
// Retry the real PDF/storage service against real SQL; a lost upload response recovers without another lead/document.
const {fileKnowledgeFactorySellerReport}=await import('../server/services/knowledgeFactorySellerFiling.js');
const saved=(await db.query('select * from knowledge_factory_report_results where id=$1',[manualReport])).rows[0];saved.product_id='full_canvassing_report';
let uploaded,uploads=0;
const client={rpc:async(name,args)=>{try{return{data:(await db.query(`select public.${name}($1,$2) receipt`,[args.p_report_id,args.p_actor_id])).rows[0].receipt};}catch(error){return{error};}},storage:{getBucket:async()=>({data:{public:false}}),from:()=>({
 upload:async(path,bytes)=>{uploads++;uploaded=bytes;await db.query(`insert into storage.objects values('documents',$1,'{"mimetype":"application/pdf"}')`,[path]);return {error:{message:'Synthetic response lost after upload'}};},
 download:async()=>({data:new Blob([uploaded],{type:'application/pdf'})}),
})}};
const receipt=await fileKnowledgeFactorySellerReport({db:client,report:saved,actorId:actor});assert.equal(receipt.leadId,manual);assert.equal(receipt.status,'filed');
assert.match(new TextDecoder().decode(uploaded.slice(0,5)),/^%PDF-/);await fileKnowledgeFactorySellerReport({db:client,report:saved,actorId:actor});assert.equal(uploads,1);
console.log('PASS: explicit manual lead re-used; all owners linked; access and conflicting properties rejected; real PDF filed once after upload-response recovery.');
// Already captured seller answers and the original contact remain untouched.
const manual2=(await db.query(`insert into leads(organisation_id,assigned_agent_id,lead_category,lead_source,seller_property_address) values($1,$2,'seller','Manual','Older captured address') returning lead_id`,[org,actor])).rows[0].lead_id;
const listing2=(await db.query(`insert into private_listings(organisation_id,assigned_agent_id,seller_lead_id,originating_crm_lead_id,listing_reference,listing_status,listing_visibility,title) values($1,$2,$3,$3,'MANUAL-EXISTING','seller_lead','internal','Existing property') returning id`,[org,actor,manual2])).rows[0].id;
await db.query('update leads set listing_id=$1 where lead_id=$2',[listing2,manual2]);
await db.query(`insert into private_listing_seller_onboarding(private_listing_id,token,form_data) values($1,'manual-onboarding','{"sellerFirstName":"Captured Name","phone":"0123456789","owners":[{"name":"Agent owner answer"}]}')`,[listing2]);
const manualReport2='30000000-0000-4000-8000-000000000005';await report(manualReport2,'live',789);
await db.query(`update knowledge_factory_report_results set request_context_snapshot=request_context_snapshot||jsonb_build_object('targetSellerLeadId',$1::text) where id=$2`,[manual2,manualReport2]);
assert.equal((await rpc(manualReport2)).private_listing_id,listing2);
const captured=(await db.query('select form_data from private_listing_seller_onboarding where private_listing_id=$1',[listing2])).rows[0].form_data;
assert.equal(captured.sellerFirstName,'Captured Name');assert.equal(captured.phone,'0123456789');assert.equal(captured.owners[0].name,'Agent owner answer');assert.equal(captured.knowledgeFactory.owners.length,2);
await db.query(`insert into organisation_users(organisation_id,user_id,status,role) values($1,$2,'active','agent')`,[org,actor2]);
await assert.rejects(db.query('select knowledge_factory_validate_seller_target($1,$2,$3,$4)',[org,actor2,789,manual2]),/access denied/);
const found=(await db.query('select knowledge_factory_seller_lead_options($1,$2,$3,$4) v',[org,actor,789,'OLDER CAPTURED'])).rows[0].v;assert.equal(found.items[0].leadId,manual2);
await db.exec('set role authenticated');await assert.rejects(db.query('select knowledge_factory_seller_lead_options($1,$2,$3)',[org,actor,789]),/permission denied/);await db.exec('reset role');
console.log('PASS: existing listing reused; captured owner answers/phone preserved; search and same-agency assignment controls enforced.');
await db.close();
