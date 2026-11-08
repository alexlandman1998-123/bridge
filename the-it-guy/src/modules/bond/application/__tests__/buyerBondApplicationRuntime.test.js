// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createBuyerBondApplicationRuntimeService, buildBuyerBondApplicationRuntimeState } from '../workspace/bondApplicationRuntimeService.js'
import { createEmptyBondApplicationState, buildNormalizedBondApplicationFromState, buildBondApplicationSubmissionSnapshot, resolveBondApplicationSignerIdentity, resolveBondApplicationDeclarations, buildBondApplicationDeclarationEvidence } from '../index.js'
const tx='10000000-0000-4000-8000-000000000001', app='20000000-0000-4000-8000-000000000001', primary='30000000-0000-4000-8000-000000000001', form='40000000-0000-4000-8000-000000000001'
let db
const call=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result
beforeAll(async()=>{
 db=new PGlite()
 await db.exec(`
 create role anon; create role authenticated; create schema storage; create schema extensions; create schema auth; create schema document_security; create schema journey_private;
 create function journey_private.can_read_professional_journey(uuid) returns boolean language sql as $$ select false $$;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid',true),'')::uuid $$;
 -- Test substitute for pgcrypto's hash primitive only; production uses SHA256.
 create function extensions.digest(text,text) returns bytea language sql as $$ select decode(md5($1)||md5($1),'hex') $$;
 create table transactions(id uuid primary key,buyer_id uuid,development_id uuid,unit_id uuid,primary_bond_consultant_user_id uuid);
 create table client_portal_links(id uuid default gen_random_uuid(),token text,transaction_id uuid,buyer_id uuid,development_id uuid,unit_id uuid,is_active boolean default true);
 create table bond_application_portal_access_links(id uuid,bond_application_id uuid,token text,is_active boolean default true,expires_at timestamptz);
 create function bridge_request_header(text) returns text language sql as $$ select nullif(current_setting('request.headers',true),'')::jsonb->>$1 $$;
 create function bridge_client_portal_request_token() returns text language sql as $$ select public.bridge_request_header('x-bridge-client-portal-token') $$;
 create function bridge_bond_application_portal_active_link() returns setof bond_application_portal_access_links language sql as $$ select * from public.bond_application_portal_access_links where token=public.bridge_request_header('x-bridge-bond-application-token') and is_active and (expires_at is null or expires_at>now()) $$;
 create table onboarding_form_data(id uuid primary key,transaction_id uuid,form_data jsonb,updated_at timestamptz);
 create table bond_applications(id uuid primary key,transaction_id uuid,onboarding_form_data_id uuid,status text default 'draft',revision integer default 1,metadata jsonb default '{}',locked_at timestamptz,active_submission_id uuid,submitted_at timestamptz,updated_at timestamptz,created_at timestamptz default now());
 create table bond_application_participants(id uuid primary key,bond_application_id uuid,role text,participant_key text,removed_at timestamptz,status text default 'in_progress');
 create table bond_application_sections(id uuid default gen_random_uuid(),bond_application_id uuid,participant_id uuid,scope text,section_key text,answers_json jsonb,version integer default 1,status text,updated_at timestamptz);
 create table transaction_required_documents(id uuid primary key default gen_random_uuid(),transaction_id uuid,document_key text,document_label text,is_required boolean,is_uploaded boolean,required_from_role text,visibility_scope text,uploaded_document_id uuid,uploaded_at timestamptz,reconciliation_source text,group_key text,group_label text,enabled boolean default true,status text default 'missing');
 create table document_definitions(key text primary key,display_label text,category text,pack_key text,applies_to_context text[],default_requirement_level text,default_visibility text[],default_upload_roles text[],review_required boolean,is_active boolean default true);
 create table document_requirement_instances(id uuid primary key default gen_random_uuid(),document_definition_key text,context_type text,context_id uuid,transaction_id uuid,pack_key text,requirement_level text,requested_from_role text,requested_from_contact_id uuid,visible_to_roles text[],uploadable_by_roles text[],reviewer_role text,resolver_version text,source_system text,status text default 'pending');
 alter table transaction_required_documents add column canonical_requirement_instance_id uuid;
 create table documents(id uuid primary key default gen_random_uuid(),name text,file_bucket text,mime_type text,client_recipient_role text,uploaded_by_user_id uuid,source text,transaction_id uuid,file_path text,status text,canonical_requirement_instance_id uuid,is_client_visible boolean default true,visibility_scope text default 'shared',uploaded_by_party text default 'buyer');
 create table bond_application_document_requirements(id uuid default gen_random_uuid(),bond_application_id uuid,participant_id uuid,requirement_key text,canonical_document_type text,rule_set_version text,required_before text,satisfaction_mode text,status text default 'active',source text default 'guided_rule',transaction_required_document_id uuid,linked_document_id uuid,linked_at timestamptz,updated_at timestamptz,inactive_at timestamptz,metadata jsonb default '{}');
 create unique index req_participant_key on bond_application_document_requirements(bond_application_id,participant_id,requirement_key) where participant_id is not null and status<>'superseded';
 create table transaction_bond_application_submissions(id uuid primary key default gen_random_uuid(),transaction_id uuid,onboarding_form_data_id uuid,bond_application_id uuid,source_application_revision integer,submission_version integer,application_schema_version text,flow_version text,document_rule_set_version text,declaration_contract_version text,status text,snapshot_json jsonb,snapshot_hash text,source_application_hash text,declarations_json jsonb,document_manifest_json jsonb,selected_bank_ids jsonb,signer_manifest_json jsonb,prepared_at timestamptz,signed_at timestamptz,submitted_at timestamptz,metadata jsonb,signing_request_id uuid,signed_document_id uuid,cancelled_at timestamptz,unique(transaction_id,submission_version));
 create table document_packet_signers(packet_id uuid,status text,signing_token text,token_expires_at timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text,id uuid default gen_random_uuid()); alter table storage.objects enable row level security;
 create function bridge_upload_buyer_portal_document(uuid,text,text,text,text,text,text) returns jsonb language plpgsql as $$ declare d public.documents%rowtype; begin
 if public.bridge_client_portal_request_token()<>'buyer' then raise exception 'Wrong internal credential'; end if;
 if not exists(select 1 from public.transaction_required_documents r join public.document_requirement_instances i on i.id=r.canonical_requirement_instance_id where r.transaction_id=$1 and r.document_key=$7 and i.uploadable_by_roles @> array['buyer']) then raise exception 'Missing canonical buyer requirement'; end if;
 insert into public.documents(transaction_id,file_path,status,canonical_requirement_instance_id) values($1,$2,'uploaded',(select canonical_requirement_instance_id from public.transaction_required_documents where transaction_id=$1 and document_key=$7 limit 1)) returning * into d;
 update public.transaction_required_documents set is_uploaded=true,uploaded_document_id=d.id where transaction_id=$1 and document_key=$7;
 update public.bond_application_document_requirements set linked_document_id=d.id,status='satisfied' where requirement_key=$7;
 return to_jsonb(d); end $$;
 insert into transactions(id) values('${tx}');
 insert into onboarding_form_data values('${form}','${tx}','{"unrelated":"preserved"}',now());
 insert into bond_applications(id,transaction_id,onboarding_form_data_id) values('${app}','${tx}','${form}');
 insert into bond_application_participants(id,bond_application_id,role,participant_key) values('${primary}','${app}','primary_applicant','primary_applicant:1');
 insert into client_portal_links(token,transaction_id) values('buyer','${tx}');
 insert into bond_application_portal_access_links values(gen_random_uuid(),'${app}','scoped',true,null);
 select set_config('request.headers','{"x-bridge-bond-application-token":"scoped"}',false);
 `)
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261005195031_buyer_portal_runtime_schema_compatibility.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261003182500_buyer_bond_application_runtime.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261003202419_bond_wet_ink_application_signing.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261004001000_bond_submission_pack_original.sql',import.meta.url),'utf8'))
 await db.exec(`create table bond_application_submission_readiness_assessments(id uuid default gen_random_uuid(),bond_application_id uuid,status text,blockers jsonb default '[]'); create table bond_application_external_submission_records(id uuid default gen_random_uuid(),bond_application_id uuid);`)
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261004002000_bond_submission_consultant_review.sql',import.meta.url),'utf8'))
 await db.exec(`
 alter table documents add metadata jsonb default '{}';
 alter table transactions add purchaser_type text default 'individual', add finance_type text default 'bond', add registered_at timestamptz, add cancelled_at timestamptz, add archived_at timestamptz, add lifecycle_state text;
 alter table bond_applications alter id set default gen_random_uuid();
 alter table bond_application_participants alter id set default gen_random_uuid();
 alter table onboarding_form_data alter id set default gen_random_uuid(), add purchaser_type text default 'individual';
 create function bridge_portal_matter_financial_transaction_id(text) returns uuid language sql as $$
   select l.transaction_id from public.client_portal_links l join public.transactions t on t.id=l.transaction_id
   where l.token=public.bridge_client_portal_request_token() and l.is_active and (l.expires_at is null or l.expires_at>now())
     and t.buyer_id is not distinct from l.buyer_id and t.development_id is not distinct from l.development_id and t.unit_id is not distinct from l.unit_id
 $$;
 `)
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261108153731_bond_buyer_start_and_document_continuity.sql',import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
it('preserves legacy buyer links and enforces optional expiry without portal credentials',async()=>{
 await db.exec(`select set_config('request.headers','{"x-bridge-client-portal-token":"buyer"}',false)`)
 expect((await call('bridge_buyer_bond_application_runtime_context')).application.id).toBe(app)
 await db.exec(`update client_portal_links set expires_at=now()-interval '1 minute'`)
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261005195031_buyer_portal_runtime_schema_compatibility.sql',import.meta.url),'utf8'))
 await expect(call('bridge_buyer_bond_application_runtime_context')).rejects.toMatchObject({code:'42501'})
 await db.exec(`update client_portal_links set expires_at=null; select set_config('request.headers','{}',false)`)
 await expect(call('bridge_buyer_bond_application_runtime_context')).rejects.toMatchObject({code:'42501'})
 await expect(call('bridge_bond_wet_ink_context')).rejects.toMatchObject({code:'42501'})
 await db.exec(`select set_config('request.headers','{"x-bridge-bond-application-token":"scoped"}',false)`)
})
it('rejects revoked access without leaking credentials',async()=>{
 const ctx=await call('bridge_buyer_bond_application_runtime_context');expect(ctx.application.id).toBe(app);expect(JSON.stringify(ctx)).not.toContain('scoped')
 await db.exec('update bond_application_portal_access_links set is_active=false')
 await expect(call('bridge_buyer_bond_application_runtime_context')).rejects.toMatchObject({code:'42501'})
 await db.exec('update bond_application_portal_access_links set is_active=true')
})
it('atomically saves, rejects stale writes and preserves unrelated/private answers',async()=>{
 await db.exec(`insert into bond_application_sections(bond_application_id,participant_id,scope,section_key,answers_json) values('${app}',gen_random_uuid(),'participant','personal_contact','{"private":true}')`)
 expect((await call('bridge_save_buyer_bond_application_draft',[{example:1},1,{selected_banks:['bank-a']},{personal_contact:{personal:{first_name:'Buyer'}}}])).revision).toBe(2)
 expect((await db.query('select form_data from onboarding_form_data')).rows[0].form_data).toEqual({unrelated:'preserved',bond_application:{example:1}})
 expect((await db.query(`select count(*)::int as n from bond_application_sections where answers_json->>'private'='true'`)).rows[0].n).toBe(1)
 await expect(call('bridge_save_buyer_bond_application_draft',[{},1,{},{}])).rejects.toMatchObject({code:'40001'})
 await expect(call('bridge_save_buyer_bond_application_draft',[{},2,{pre_approval:{}},{}])).rejects.toMatchObject({code:'22023'})
 expect((await call('bridge_buyer_bond_application_runtime_context')).application.revision).toBe(2)
})
it('reconciles once and restricts upload to the current application',async()=>{
 const req=[{key:'proof',title:'Proof',required:true,canonicalDocumentType:'buyer_id_document'}]
 await call('bridge_reconcile_buyer_bond_application_documents',[req]);await call('bridge_reconcile_buyer_bond_application_documents',[req])
 expect((await db.query('select count(*)::int as n from bond_application_document_requirements')).rows[0].n).toBe(1)
 const path=`client-portal/${tx}/${app}/file.pdf`
 expect(await call('bridge_buyer_bond_application_storage_can_insert',[path])).toBe(true)
 expect(await call('bridge_buyer_bond_application_storage_can_insert',[`client-portal/${tx}/other/file.pdf`])).toBe(false)
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['documents',path])
 await expect(call('bridge_upload_buyer_bond_application_document',['foreign',path,'file.pdf'])).rejects.toMatchObject({code:'42501'})
 expect((await call('bridge_upload_buyer_bond_application_document',['proof',path,'file.pdf'])).transaction_id).toBe(tx)
 expect(await call('bridge_request_header',['x-bridge-client-portal-token'])).toBeNull()
 expect((await call('bridge_buyer_bond_application_runtime_context')).documents).toHaveLength(1)
})
it('locks an immutable signed submission and makes retries idempotent',async()=>{
 const state=createEmptyBondApplicationState();state.application.transactionId=tx;state.application.finance.requestedBondAmount='1800000';state.application.selectedBankIds=['bank-a']
 Object.assign(state.participants.primaryApplicant.personal,{first_name:'Sample',surname:'Buyer',identity_number:'9001010000000'})
 Object.assign(state.participants.primaryApplicant.contact,{email:'buyer@example.test',phone:'0710000000'})
 const norm=buildNormalizedBondApplicationFromState({applicationState:state});delete norm.sharedSections.pre_approval
 const signature={dataUrl:'data:image/png;base64,YWJj',confirmed:true}
 await call('bridge_save_buyer_bond_application_draft',[{_meta:{bond_application_html_signature:signature}},2,norm.sharedSections,norm.participantSections['primary_applicant:1']])
 const docs=(await call('bridge_buyer_bond_application_runtime_context')).documents
 const declarations=resolveBondApplicationDeclarations({applicationState:state})
 const snapshot=buildBondApplicationSubmissionSnapshot({applicationState:state,signerIdentity:resolveBondApplicationSignerIdentity(state),signatureEvidence:signature,declarations:buildBondApplicationDeclarationEvidence({declarations,values:Object.fromEntries(declarations.map(d=>[d.key,true]))}),documentChecklist:{items:[{requirement:{key:'proof',canonicalDocumentType:'buyer_id_document'},documents:docs}]}})
 await expect(call('bridge_submit_buyer_bond_application',[2,JSON.stringify(snapshot)])).rejects.toMatchObject({code:'40001'})
 await expect(call('bridge_submit_buyer_bond_application',[3,JSON.stringify({...snapshot,finance:{requestedBondAmount:'99'}})])).rejects.toMatchObject({code:'40001'})
 const reviewedSnapshot=await sealBondReviewedVersion(snapshot)
 const result=await call('bridge_submit_buyer_bond_application',[3,JSON.stringify(reviewedSnapshot)])
 const storedSnapshot=(await db.query('select snapshot_json from transaction_bond_application_submissions')).rows[0].snapshot_json
 expect(storedSnapshot.reviewedVersion.version).toBe(1)
 expect(await assertBondReviewedVersionIntegrity(storedSnapshot)).toBe(true)
 expect(result.submission.status).toBe('submitted');expect(result.submission).not.toHaveProperty('snapshot_json')
 expect((await call('bridge_submit_buyer_bond_application',[3,JSON.stringify(snapshot)])).submission.id).toBe(result.submission.id)
 await expect(call('bridge_save_buyer_bond_application_draft',[{},3,{},{}])).rejects.toMatchObject({code:'23514'})
 await expect(call('bridge_cancel_buyer_bond_application_submission',[result.submission.id])).rejects.toMatchObject({code:'23514'})
 expect((await db.query('select count(*)::int as n from transaction_bond_application_submissions')).rows[0].n).toBe(1)
 const latePath=`client-portal/${tx}/${app}/late-file.pdf`
 expect(await call('bridge_buyer_bond_application_storage_can_insert',[latePath])).toBe(true)
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['documents',latePath])
 await call('bridge_upload_buyer_bond_application_document',['proof',latePath,'late-file.pdf'])
 expect((await call('bridge_buyer_bond_application_runtime_context')).documents).toHaveLength(2)
 expect((await db.query('select snapshot_json from transaction_bond_application_submissions')).rows[0].snapshot_json).toEqual(reviewedSnapshot)
})
it('never links failed storage uploads or signs an incomplete application',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{application:{id:app,transactionId:tx,revision:1},draft:{},requiredDocuments:[],documents:[]}})
 const upload=vi.fn().mockResolvedValue({error:new Error('Storage unavailable')})
 const service=createBuyerBondApplicationRuntimeService({client:{rpc,storage:{from:()=>({upload})}},validateFile:()=>({safeName:'proof.pdf'}),randomUUID:()=> 'unique'})
 await expect(service.upload({requirementKey:'proof',file:{type:'application/pdf'}})).rejects.toMatchObject({code:'document_save_unconfirmed'});expect(rpc).toHaveBeenCalledTimes(1)
 rpc.mockClear();await expect(service.submit({expectedRevision:1})).rejects.toThrow('Complete the required details');expect(rpc).toHaveBeenCalledTimes(1)
})

it('loads normalized originator answers instead of an older compatibility draft',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{application:{id:app,transactionId:tx,revision:5},draft:{},sharedSections:{application_finance:{requestedBondAmount:'1700000',financeType:'bond'},selected_banks:['recorded-bank']},primarySections:{personal_contact:{personal:{first_name:'Updated',surname:'Buyer'},contact:{email:'updated@example.test'}}}}})
 const service=createBuyerBondApplicationRuntimeService({client:{rpc}})
 const context=await service.load()
 const state=(await import('../workspace/bondApplicationRuntimeService.js')).buildBuyerBondApplicationRuntimeState(context)
 expect(state.application.finance.requestedBondAmount).toBe('1700000')
 expect(state.participants.primaryApplicant.personal.first_name).toBe('Updated')
 expect(state.application.selectedBankIds).toEqual(['recorded-bank'])
})
import { sealBondReviewedVersion, assertBondReviewedVersionIntegrity } from '../submission/bondApplicationReviewedVersion.js'

const consents = { loan_processing_consent: true, credit_bureau_fraud_bank_data_consent: true, insurance_third_party_communication_consent: true, application_information_accuracy: true }
const consultant = '50000000-0000-4000-8000-000000000001', co = '30000000-0000-4000-8000-000000000002'
let paper
const buyerHeaders = () => db.exec(`select set_config('request.headers','{"x-bridge-bond-application-token":"scoped"}',false); select set_config('request.uid','',false)`)
const consultantHeaders = () => db.exec(`select set_config('request.headers','{}',false); select set_config('request.uid','${consultant}',false)`)
it('freezes joint paper versions, cancels idempotently and never unlocks a newer version',async()=>{
 await buyerHeaders()
 await db.exec(`update bond_applications set status='draft',locked_at=null; update transactions set primary_bond_consultant_user_id='${consultant}'; delete from bond_application_sections where answers_json->>'private'='true';
 insert into bond_application_participants(id,bond_application_id,role,participant_key,status) values('${co}','${app}','co_applicant','co_applicant:1','in_progress');
 insert into bond_application_sections(bond_application_id,participant_id,scope,section_key,answers_json) select bond_application_id,'${co}',scope,section_key,answers_json from bond_application_sections where participant_id='${primary}';`)
 await expect(call('bridge_prepare_bond_wet_ink',[2,consents])).rejects.toMatchObject({code:'40001'})
 await expect(call('bridge_prepare_bond_wet_ink',[3,consents])).rejects.toThrow('Each applicant')
 await db.exec(`update bond_application_participants set status='ready_for_submission' where id in ('${co}','${primary}')`)
 await expect(call('bridge_prepare_bond_wet_ink',[3,{}])).rejects.toThrow('required declarations')
 const first=await call('bridge_prepare_bond_wet_ink',[3,consents])
 expect(first.version.version).toBe(2); expect(first.version.snapshot_json.signerManifest).toHaveLength(2)
 expect((await call('bridge_prepare_bond_wet_ink',[3,consents])).version.id).toBe(first.version.id)
 await expect(call('bridge_save_buyer_bond_application_draft',[{},3,{},{}])).rejects.toMatchObject({code:'23514'})
 await expect(db.query('update bond_wet_ink_versions set snapshot_json=$1 where id=$2',[{},first.version.id])).rejects.toThrow('immutable')
 await call('bridge_cancel_bond_wet_ink',[first.version.id]); await call('bridge_cancel_bond_wet_ink',[first.version.id])
 expect((await call('bridge_buyer_bond_application_runtime_context')).application.revision).toBe(4)
 paper=await call('bridge_prepare_bond_wet_ink',[4,consents]); expect(paper.version.version).toBe(3)
 await call('bridge_cancel_bond_wet_ink',[first.version.id])
 expect((await call('bridge_buyer_bond_application_runtime_context')).application.status).toBe('awaiting_signatures')
 expect(await call('bridge_bond_wet_ink_canonical',[paper.version.snapshot_json])).toBe(canonicalizeBondApplicationSnapshot(paper.version.snapshot_json))
})
it('preserves rejected originals and verifies every joint signature before acceptance',async()=>{
 const upload='60000000-0000-4000-8000-000000000001', replacement='60000000-0000-4000-8000-000000000002'
 const path=`${app}/${paper.version.id}/${upload}.pdf`
 await expect(call('bridge_upload_bond_wet_ink',[paper.version.id,upload,'signed.pdf',50,'a'.repeat(64)])).rejects.toThrow('secure storage')
 expect(await call('bridge_bond_wet_ink_storage_access',[path,true])).toBe(true)
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['bond-signed-applications',path])
 expect((await call('bridge_upload_bond_wet_ink',[paper.version.id,upload,'signed.pdf',50,'a'.repeat(64)])).version.status).toBe('awaiting_review')
 expect((await call('bridge_upload_bond_wet_ink',[paper.version.id,upload,'signed.pdf',50,'a'.repeat(64)])).uploads).toHaveLength(1)
 expect(await call('bridge_bond_wet_ink_storage_access',[path,true])).toBe(false)
 await expect(call('bridge_review_bond_wet_ink',[upload,'rejected','Missing page',{}])).rejects.toMatchObject({code:'42501'})
 await consultantHeaders()
 expect(await call('bridge_bond_wet_ink_storage_access',[path,false])).toBe(true)
 expect(await call('bridge_bond_wet_ink_review_queue')).toHaveLength(1)
 await expect(call('bridge_review_bond_wet_ink',[upload,'rejected','',{}])).rejects.toThrow('reason')
 await call('bridge_review_bond_wet_ink',[upload,'rejected','Missing signature page',{}])
 await expect(db.query('update bond_wet_ink_uploads set file_name=$1 where id=$2',['other.pdf',upload])).rejects.toThrow('immutable')
 await buyerHeaders()
 const newPath=`${app}/${paper.version.id}/${replacement}.pdf`
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['bond-signed-applications',newPath])
 const recorded=await call('bridge_upload_bond_wet_ink',[paper.version.id,replacement,'replacement.pdf',60,'b'.repeat(64)])
 expect(recorded.uploads.map(item=>item.status)).toEqual(['rejected','awaiting_review'])
 expect(recorded.uploads[0].feedback).toBe('Missing signature page')
 await consultantHeaders()
 const date=(await db.query(`select to_char(now() at time zone 'Africa/Johannesburg','YYYY-MM-DD') as d`)).rows[0].d
 const checks={versionMatches:true,allPagesPresent:true,noAlterations:true,signers:[{participantKey:'primary_applicant:1',signaturePresent:true,identityChecked:true,signedDate:date}]}
 await expect(call('bridge_review_bond_wet_ink',[replacement,'accepted','',checks])).rejects.toThrow('every required applicant')
 checks.signers.push({participantKey:'co_applicant:1',signaturePresent:true,identityChecked:true,signedDate:date,marketingAccepted:false})
 const accepted=await call('bridge_review_bond_wet_ink',[replacement,'accepted','',checks]); expect(accepted.status).toBe('accepted')
 const submitted=(await db.query(`select * from transaction_bond_application_submissions where submission_version=3`)).rows[0]
 expect(submitted.signed_document_id).toBe(accepted.document_id); expect(submitted.snapshot_json).toEqual(paper.version.snapshot_json)
 expect(submitted.metadata.signatureChecks.signers).toHaveLength(2)
 expect(submitted.declarations_json.filter(d=>d.required).every(d=>d.accepted && d.acceptedAt)).toBe(true)
 expect(submitted.declarations_json.filter(d=>d.key==='marketing_privacy_preference').every(d=>!d.accepted)).toBe(true)
 expect((await db.query('select document_security.can_read(d) as allowed from documents d where id=$1',[accepted.document_id])).rows[0].allowed).toBe(true)
 expect((await call('bridge_review_bond_wet_ink',[replacement,'accepted','',checks])).id).toBe(accepted.id)
 await buyerHeaders()
 await expect(call('bridge_cancel_bond_wet_ink',[paper.version.id])).rejects.toThrow('correction workflow')
 expect((await call('bridge_bond_wet_ink_context')).version.status).toBe('accepted')
 await db.exec(`select set_config('request.headers','{}',false); select set_config('request.uid','70000000-0000-4000-8000-000000000001',false)`)
 expect(await call('bridge_bond_wet_ink_review_queue')).toHaveLength(0)
 expect(await call('bridge_bond_wet_ink_storage_access',[newPath,false])).toBeFalsy()
})
import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
it('blocks unrelated storage readers and all browser overwrites even with an older permissive policy',async()=>{
 await db.exec(`grant usage on schema storage,auth to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;
 create policy old_permissive on storage.objects for all to anon,authenticated using(true) with check(true);`)
 const upload=(await db.query(`select * from bond_wet_ink_uploads where status='accepted'`)).rows[0]
 await db.exec('set role anon')
 try {
  await expect(db.query('select * from bond_wet_ink_versions')).rejects.toMatchObject({code:'42501'})
  expect((await db.query(`select * from storage.objects where bucket_id='bond-signed-applications'`)).rows).toHaveLength(0)
  await expect(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['bond-signed-applications',upload.file_path.replace(/[^/]+$/, '80000000-0000-4000-8000-000000000001.pdf')])).rejects.toMatchObject({code:'42501'})
  await buyerHeaders()
  expect((await db.query('select * from storage.objects where name=$1',[upload.file_path])).rows).toHaveLength(1)
  expect((await db.query('update storage.objects set name=$1 where name=$2 returning *',['overwritten',upload.file_path])).rows).toHaveLength(0)
  expect((await db.query('delete from storage.objects where name=$1 returning *',[upload.file_path])).rows).toHaveLength(0)
 } finally { await db.exec('reset role') }
})

it('scopes accepted original pack evidence to the current assigned consultant', async()=>{
 await consultantHeaders()
 const proof=await call('bridge_bond_submission_pack_original',[tx])
 expect(await call('bridge_bond_submission_pack_queue')).toHaveLength(1)
 const accepted=(await db.query("select * from bond_wet_ink_uploads where status='accepted'")).rows[0]
 expect(proof.originalEvidence.documentId).toBe(accepted.document_id)
 expect(proof.originalEvidence.sha256).toBe(accepted.sha256)
 expect(proof.originalEvidence.status).toBe('accepted')
 expect(proof.originalEvidence.submissionId).toBe(proof.submissionId)
 expect(proof.statementHandoff.status).toBe('not_connected')
 await db.exec('set role authenticated')
 try { expect((await call('bridge_bond_submission_pack_original',[tx])).originalEvidence.documentId).toBe(accepted.document_id) } finally { await db.exec('reset role') }
 await buyerHeaders()
 await expect(call('bridge_bond_submission_pack_original',[tx])).rejects.toMatchObject({code:'42501'})
 expect(await call('bridge_bond_submission_pack_queue')).toHaveLength(0)
 await db.exec("select set_config('request.headers','{}',false); select set_config('request.uid','70000000-0000-4000-8000-000000000001',false)")
 await expect(call('bridge_bond_submission_pack_original',[tx])).rejects.toMatchObject({code:'42501'})
 expect(await call('bridge_bond_submission_pack_queue')).toHaveLength(0)
 await consultantHeaders()
 await expect(call('bridge_bond_submission_pack_original',['10000000-0000-4000-8000-000000000099'])).rejects.toMatchObject({code:'42501'})
 await db.exec('set role anon')
 try { await expect(call('bridge_bond_submission_pack_original',[tx])).rejects.toMatchObject({code:'42501'}) } finally { await db.exec('reset role') }
})

it('binds immutable consultant reviews to current application and document evidence', async()=>{
 await consultantHeaders()
 const context=await call('bridge_bond_submission_review_context',[tx])
 const checks={applicationChecked:true,documentsChecked:true,signaturesChecked:true,bankFormsChecked:true}
 await expect(call('bridge_record_bond_submission_review',[tx,context.submissionId,'a'.repeat(64),checks])).rejects.toMatchObject({code:'40001'})
 await expect(call('bridge_record_bond_submission_review',[tx,context.submissionId,context.contextHash,{...checks,documentsChecked:false}])).rejects.toMatchObject({code:'23514'})
 const review=await call('bridge_record_bond_submission_review',[tx,context.submissionId,context.contextHash,checks])
 expect((await call('bridge_record_bond_submission_review',[tx,context.submissionId,context.contextHash,checks])).id).toBe(review.id)
 expect((await call('bridge_bond_submission_review_context',[tx])).review.current).toBe(true)
 await expect(db.query('update bond_submission_consultant_reviews set checks_json=$1 where id=$2',[{},review.id])).rejects.toMatchObject({code:'23514'})
 await db.exec("update documents set status='rejected' where id=(select signed_document_id from transaction_bond_application_submissions where id='"+context.submissionId+"')")
 expect((await call('bridge_bond_submission_review_context',[tx])).review.current).toBe(false)
 await expect(call('bridge_record_bond_submission_review',[tx,context.submissionId,context.contextHash,checks])).rejects.toMatchObject({code:'40001'})
 await buyerHeaders()
 await expect(call('bridge_bond_submission_review_context',[tx])).rejects.toMatchObject({code:'42501'})
 await expect(call('bridge_record_bond_submission_review',[tx,context.submissionId,context.contextHash,checks])).rejects.toMatchObject({code:'42501'})
 await db.exec('set role authenticated')
 try { await expect(db.query('select * from bond_submission_consultant_reviews')).rejects.toMatchObject({code:'42501'}) } finally { await db.exec('reset role') }
})

it('prevents older readiness and external-submission paths from bypassing fixed-version release gates', async()=>{
 const assessment=(await db.query("insert into bond_application_submission_readiness_assessments(bond_application_id,status) values($1,'ready') returning *",[app])).rows[0]
 expect(assessment.status).toBe('blocked')
 expect(assessment.blockers[0].key).toBe('signing_release_pending')
 await expect(db.query('insert into bond_application_external_submission_records(bond_application_id) values($1)',[app])).rejects.toMatchObject({code:'23514'})
})

it('starts a buyer application once, preserves onboarding and rejects invalid, expired, closed and cash matters', async () => {
 const fresh='10000000-0000-4000-8000-000000000099'
 await db.query('insert into transactions(id) values($1)',[fresh])
 await db.query("insert into client_portal_links(token,transaction_id) values('new-buyer',$1)",[fresh])
 await db.query("insert into onboarding_form_data(transaction_id,form_data) values($1,$2)",[fresh,{first_name:'Existing buyer',purchase_price:'2000000',internal_note:'must stay private',bond_application:{personal_details:{surname:'Kept surname'}}}])
 const headers=async value=>db.query("select set_config('request.headers',$1,false)",[JSON.stringify(value)])
 await headers({'x-bridge-client-portal-token':'new-buyer'})
 await expect(call('bridge_buyer_bond_application_runtime_context')).rejects.toMatchObject({code:'P0002'})
 let started
 await db.exec('set role anon')
 try { started=await call('bridge_start_buyer_bond_application') } finally { await db.exec('reset role') }
 expect(started.application.status).toBe('draft')
 expect(started.onboardingFormData.formData.first_name).toBe('Existing buyer')
 expect(started.onboardingFormData.formData.internal_note).toBeUndefined()
 expect(started.draft.personal_details.surname).toBe('Kept surname')
 expect((await call('bridge_start_buyer_bond_application')).application.id).toBe(started.application.id)
 expect((await db.query('select count(*)::int n from bond_applications where transaction_id=$1',[fresh])).rows[0].n).toBe(1)
 expect((await db.query('select count(*)::int n from transaction_bond_application_submissions where transaction_id=$1',[fresh])).rows[0].n).toBe(0)
 await db.query("update transactions set finance_type='cash' where id=$1",[fresh])
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'22023'})
 await db.query("update transactions set finance_type='bond',registered_at=now() where id=$1",[fresh])
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'22023'})
 await db.query("update client_portal_links set expires_at=now()-interval '1 minute' where token='new-buyer'")
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'42501'})
 const blank='10000000-0000-4000-8000-000000000098'
 await db.query("insert into transactions(id,purchaser_type) values($1,'company')",[blank])
 await db.query("insert into client_portal_links(token,transaction_id) values('blank-buyer',$1)",[blank])
 await headers({'x-bridge-client-portal-token':'blank-buyer'})
 expect((await call('bridge_start_buyer_bond_application')).application.status).toBe('draft')
 expect((await db.query('select purchaser_type from onboarding_form_data where transaction_id=$1',[blank])).rows[0].purchaser_type).toBe('company')
 await db.query('update transactions set unit_id=gen_random_uuid() where id=$1',[blank])
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'42501'})
 await headers({'x-bridge-client-portal-token':'unrelated'})
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'42501'})
 await headers({'x-bridge-bond-application-token':'scoped'})
 await expect(call('bridge_start_buyer_bond_application')).rejects.toMatchObject({code:'42501'})
})
it('hydrates buyer prefill but honours an explicit normalized no-surety correction', () => {
 const context={application:{id:'app',transactionId:tx},draft:{applicants:[{key:'primary',first_name:'Saved'}]},onboardingFormData:{formData:{last_name:'Buyer',email:'buyer@example.test'}},sharedSections:{applicant_structure:{applicantStructure:'single',requiresSurety:false}},primarySections:{}}
 const state=buildBuyerBondApplicationRuntimeState(context)
 expect(state.participants.primaryApplicant.personal.first_name).toBe('Saved')
 expect(state.participants.primaryApplicant.personal.last_name).toBe('Buyer')
 expect(state.application.requiresSurety).toBe(false)
})

it('does not turn an old compatibility Submitted label into a new signed submission', async () => {
 const service=createBuyerBondApplicationRuntimeService({client:{rpc:async()=>({data:{application:{id:'new',transactionId:tx,status:'draft',revision:1},draft:{status:'Submitted',submitted_at:'2026-01-01',applicants:[{key:'primary',first_name:'Retained'}]}}})}})
 const loaded=await service.load()
 expect(loaded.draft.status).toBe('Not Started')
 expect(loaded.draft.submitted_at || null).toBeNull()
 expect(loaded.draft.applicants[0].first_name).toBe('Retained')
})

it('never exposes internal, seller-only or hidden files through a primary applicant requirement link', async () => {
 await db.exec(`select set_config('request.headers','{"x-bridge-bond-application-token":"scoped"}',false)`)
 for (const [scope,recipient,visible,metadata] of [['internal','buyer',true,{}],['shared','seller',true,{}],['shared','buyer',false,{}],['shared','buyer',true,{participant_key:'co_applicant:1'}],['shared','buyer',true,{participantKey:'co_applicant:1'}],['shared','buyer',true,{participantId:'30000000-0000-4000-8000-000000000099'}]]) {
   const doc=(await db.query("insert into documents(transaction_id,file_path,visibility_scope,client_recipient_role,is_client_visible,metadata) values($1,'private.pdf',$2,$3,$4,$5) returning id",[tx,scope,recipient,visible,metadata])).rows[0].id
   const req=(await db.query("insert into bond_application_document_requirements(bond_application_id,participant_id,requirement_key,linked_document_id) values($1,$2,$3,$4) returning id",[app,primary,'private_'+doc,doc])).rows[0].id
   const context=await call('bridge_buyer_bond_application_runtime_context')
   expect(context.documents.some(item=>item.id===doc)).toBe(false)
   await db.query('delete from bond_application_document_requirements where id=$1',[req])
   await db.query('delete from documents where id=$1',[doc])
 }
})


describe('manual originator workflow database commands', () => {
 let submissionId, bankId, reviewChecks, submittedAt
 beforeAll(async () => {
  await db.exec(`
   alter table documents add review_status text;
   alter table document_requirement_instances add rejection_reason text, add satisfied_by_document_id uuid, add updated_at timestamptz;
   alter table transaction_required_documents add notes text, add verified_at timestamptz, add rejected_at timestamptz, add updated_at timestamptz;
   create table document_requirement_reviews(id uuid default gen_random_uuid(),requirement_instance_id uuid,document_id uuid,review_status text,reviewer_role text,reviewer_user_id uuid,review_notes text,rejection_reason text,reviewed_at timestamptz);
   create table document_requirement_events(requirement_instance_id uuid,event_type text,actor_role text,actor_user_id uuid,message text,metadata_json jsonb);
   alter table transactions add bond_workspace_id uuid;
   alter table transactions add assigned_bond_originator_email text,add bond_originator text,add bond_region_id uuid,add bond_workspace_unit_id uuid,add bond_assignment_rule_id uuid,add bond_assignment_method text,add finance_managed_by text,add bond_assignment_status text,add bond_assignment_source text,add finance_status text,add last_meaningful_activity_at timestamptz,add updated_at timestamptz;

   create table transaction_bond_application_export_packages(id uuid,transaction_id uuid,bond_application_id uuid,destination_key text,status text);
   create table transaction_bond_originator_workspace_assignments(export_package_id uuid,assigned_to_profile_id uuid,status text);
   alter table bond_application_submission_readiness_assessments add export_package_id uuid,add assessed_by uuid,add application_revision integer,add snapshot jsonb,add metadata jsonb,add assessed_at timestamptz default now();
   create unique index readiness_package_revision on bond_application_submission_readiness_assessments(export_package_id,application_revision);
   alter table bond_application_external_submission_records add export_package_id uuid,add metadata jsonb default '{}',add lender_names text[],add external_reference text,add submitted_at timestamptz default now(),add status text default 'recorded',add notes text,add submitted_by uuid;
   create function bridge_record_bond_application_external_submission_phase8(uuid,text[],text,uuid,text) returns jsonb language plpgsql as $$
   declare result uuid;
   begin
    insert into public.bond_application_external_submission_records(export_package_id,bond_application_id,lender_names,external_reference,metadata)
    select $1,p.bond_application_id,$2,$3,jsonb_build_object('submittedVersion',jsonb_build_object('submissionId',a.active_submission_id)) from public.transaction_bond_application_export_packages p join public.bond_applications a on a.id=p.bond_application_id where p.id=$1 returning id into result;
    return jsonb_build_object('id',result,'status','recorded');
   end $$;
   create function bridge_can_manage_bond_assignment_phase5d(uuid) returns boolean language sql as $$ select false $$;
   create table transaction_finance_workflows(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_type text,current_stage text,status text,last_updated_by uuid,last_updated_at timestamptz,updated_at timestamptz,unique(transaction_id,workflow_type));
   create table transaction_bond_applications(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_id uuid,application_type text,bank_name text,status text,submitted_at timestamptz,reference_number text,notes text,created_by uuid,updated_by uuid,assigned_user_id uuid,assignment_status text,assigned_organisation_id uuid,originator_organisation_id uuid,submitted_by uuid,application_reference text,assigned_region_id uuid,assigned_workspace_unit_id uuid,assigned_branch_id uuid,assigned_team_id uuid,created_at timestamptz default now());
   create table transaction_finance_workflow_events(id uuid default gen_random_uuid(),workflow_id uuid,from_stage text,to_stage text,event_type text,notes text,created_by uuid);
   create table bond_application_change_requests(id uuid,bond_application_id uuid,status text);
   create table transaction_bond_originator_document_requests(id uuid,bond_application_id uuid,status text);
  `)
  await db.exec('alter table transaction_bond_applications add assignment_rule_id uuid,add assignment_method text,add scope_level text,add scope_metadata jsonb,add assignment_source text,add updated_at timestamptz;')
  await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261108164023_bond_manual_originator_workflow.sql',import.meta.url),'utf8'))
  const s=(await db.query('select * from transaction_bond_application_submissions where id=(select active_submission_id from bond_applications where id=$1)',[app])).rows[0]
  submissionId=s.id; bankId=s.selected_bank_ids[0]; submittedAt=s.signed_at
  reviewChecks={applicationChecked:true,documentsChecked:true,signaturesChecked:true,bankFormsChecked:true}
 },30000)
 beforeEach(async () => {
  await consultantHeaders()
  await db.exec(`delete from bond_manual_bank_submissions; delete from transaction_bond_applications; delete from transaction_finance_workflow_events; delete from transaction_finance_workflows; delete from bond_statement_receipts;`)
  await db.query("delete from bond_application_document_requirements where requirement_key like 'manual_test_%' or source='originator_request'")
  await db.query("update bond_application_document_requirements set status='inactive' where bond_application_id=$1",[app])
  await db.query("update documents set status='uploaded' where id=(select signed_document_id from transaction_bond_application_submissions where id=$1)",[submissionId])
 })
 const review = async () => {
  const c=await call('bridge_bond_submission_review_context',[tx])
  await call('bridge_record_bond_submission_review',[tx,submissionId,c.contextHash,reviewChecks])
  return call('bridge_bond_submission_review_context',[tx])
 }
 const record = async (context, bank=bankId, ref='BANK-001') => call('bridge_record_manual_bond_submission',[tx,submissionId,context.contextHash,bank,'Recorded bank',submittedAt,ref])
 it('records a reviewed signed version once, synchronises the canonical bank workflow and keeps retries idempotent', async () => {
  const org='a0000000-0000-4000-8000-000000000001', branch='a0000000-0000-4000-8000-000000000002'
  await db.query("insert into transaction_bond_applications(transaction_id,application_type,assigned_organisation_id,assigned_user_id,assignment_status,assigned_workspace_unit_id,assigned_branch_id) values($1,'originator_intake',$2,$3,'consultant_assigned',$4,$4)",[tx,org,consultant,branch])
  expect(await call('bridge_bond_manual_blockers',[app,false])).toEqual([])
  const context=await review()
  expect((await call('bridge_bond_manual_context',[tx])).blockers).toEqual([])
  const entry=await record(context)
  expect((await record(context)).id).toBe(entry.id)
  expect((await db.query('select assigned_organisation_id,assigned_workspace_unit_id,assigned_branch_id from transaction_bond_applications where id=$1',[entry.bank_application_id])).rows[0]).toEqual({assigned_organisation_id:org,assigned_workspace_unit_id:branch,assigned_branch_id:branch})
  expect((await db.query("select count(*)::int n from transaction_bond_applications where application_type='bank_application'")).rows[0].n).toBe(1)
  expect((await db.query('select current_stage from transaction_finance_workflows')).rows[0].current_stage).toBe('submitted_to_banks')
  expect((await db.query('select event_type from transaction_finance_workflow_events')).rows[0].event_type).toBe('bank_submission_added')
  expect((await call('bridge_bond_manual_context',[tx])).submissions[0].submission_id).toBe(submissionId)
  const resubmitted=await record(context,bankId,'SECOND-ACTUAL-SUBMISSION')
  expect(resubmitted.id).not.toBe(entry.id)
  expect((await record(context,bankId,'SECOND-ACTUAL-SUBMISSION')).id).toBe(resubmitted.id)
  expect((await db.query('select count(*)::int n from bond_manual_bank_submissions')).rows[0].n).toBe(2)
 })
 it('rejects stale application revisions, unsigned originals, unselected banks, future dates and stale review hashes without partial writes', async () => {
  const c=await review()
  await expect(record(c,'not-authorised')).rejects.toThrow('not authorised')
  await expect(call('bridge_record_manual_bond_submission',[tx,submissionId,c.contextHash,bankId,'Bank','1900-01-01','REF'])).rejects.toThrow('on or after')
  await expect(record({...c,contextHash:'a'.repeat(64)})).rejects.toMatchObject({code:'40001'})
  await expect(call('bridge_record_manual_bond_submission',[tx,submissionId,c.contextHash,bankId,'Bank','2999-01-01','REF'])).rejects.toThrow('actual submission date')
  await db.query('update bond_applications set revision=revision+1 where id=$1',[app])
  await expect(record(c)).rejects.toThrow('current application version')
  await db.query('update bond_applications set revision=revision-1 where id=$1',[app])
  await db.query("update documents set status='rejected' where id=(select signed_document_id from transaction_bond_application_submissions where id=$1)",[submissionId])
  await expect(record(c)).rejects.toThrow('signed original')
  expect((await db.query('select count(*)::int n from transaction_bond_applications')).rows[0].n).toBe(0)
 })
 it('requires current approved applicant-scoped evidence and excludes hidden or another applicant’s document', async () => {
  const d=(await db.query("insert into documents(transaction_id,file_path,status) values($1,'support.pdf','uploaded') returning id",[tx])).rows[0].id
  await db.query("insert into bond_application_document_requirements(bond_application_id,participant_id,requirement_key,canonical_document_type,required_before,satisfaction_mode,linked_document_id) values($1,$2,'manual_test_income','proof_of_income','required_before_bank_submission','accepted',$3)",[app,primary,d])
  expect((await call('bridge_bond_manual_blockers',[app,false]))[0].requirementKey).toBe('manual_test_income')
  await db.query("update documents set status='approved',metadata=$2 where id=$1",[d,{participant_key:'co_applicant:1'}])
  expect((await call('bridge_bond_manual_blockers',[app,false])).length).toBe(1)
  await db.query("update documents set metadata='{}',is_client_visible=false where id=$1",[d])
  expect((await call('bridge_bond_manual_blockers',[app,false])).length).toBe(1)
  await db.query("update documents set is_client_visible=true,client_recipient_role='seller' where id=$1",[d])
  expect((await call('bridge_bond_manual_blockers',[app,false])).length).toBe(1)
  await db.query('update documents set client_recipient_role=null where id=$1',[d])
  expect(await call('bridge_bond_manual_blockers',[app,false])).toEqual([])
  const c=await review()
  await db.query("update documents set status='rejected' where id=$1",[d])
  expect((await call('bridge_bond_submission_review_context',[tx])).review.current).toBe(false)
  await expect(record(c)).rejects.toThrow('manual_test_income')
 })
 it('binds manual statement confirmation to the current signed version, audits revocation and shows only safe status to the buyer', async () => {
  await db.query("insert into bond_application_document_requirements(bond_application_id,participant_id,requirement_key,canonical_document_type,required_before,satisfaction_mode,metadata) values($1,$2,'manual_test_statements','personal_bank_statements','required_before_bank_submission','accepted',$3)",[app,primary,{minimumFileCount:3}])
  const old=await call('bridge_bond_submission_review_context',[tx])
  await expect(call('bridge_record_bond_statement_receipt',[tx,'00000000-0000-4000-8000-000000000000','manual_test_statements','2026-11-01','external ref'])).rejects.toMatchObject({code:'40001'})
  await call('bridge_record_bond_statement_receipt',[tx,submissionId,'manual_test_statements','2026-11-01','Private external channel reference'])
  expect(await call('bridge_bond_manual_blockers',[app,false])).toEqual([])
  expect((await call('bridge_bond_submission_review_context',[tx])).contextHash).not.toBe(old.contextHash)
  const c=await review()
  await buyerHeaders()
  const receipt=(await call('bridge_buyer_bond_application_runtime_context')).externalReceipts[0]
  expect(receipt.status).toBe('verified'); expect(receipt.reference).toBeUndefined()
  await expect(call('bridge_record_bond_statement_receipt',[tx,submissionId,'manual_test_statements','2026-11-01','fake'])).rejects.toMatchObject({code:'42501'})
  await consultantHeaders()
  await call('bridge_revoke_bond_statement_receipt',[tx,submissionId,'manual_test_statements'])
  expect((await call('bridge_bond_submission_review_context',[tx])).review.current).toBe(false)
  await expect(record(c)).rejects.toThrow('manual_test_statements')
  expect((await db.query('select event_type from bond_statement_receipt_events order by created_at')).rows.map(r=>r.event_type)).toContain('DELETE')
 })
 it('denies unrelated users, buyer bearer credentials and direct authenticated evidence writes', async () => {
  await db.exec("select set_config('request.uid','70000000-0000-4000-8000-000000000099',false)")
  await expect(call('bridge_bond_manual_context',[tx])).rejects.toMatchObject({code:'42501'})
  await expect(call('bridge_prepare_originator_bond_application',[tx])).rejects.toMatchObject({code:'42501'})
  await consultantHeaders(); await buyerHeaders()
  await expect(call('bridge_bond_manual_context',[tx])).rejects.toMatchObject({code:'42501'})
  await db.exec('set role authenticated')
  try { await expect(db.query('select * from bond_statement_receipts')).rejects.toMatchObject({code:'42501'}); await expect(db.query('select * from bond_manual_bank_submissions')).rejects.toMatchObject({code:'42501'}) } finally { await db.exec('reset role') }
 })
 it('prepares a referral without signatures or submission and preserves onboarding answers', async () => {
  const fresh='10000000-0000-4000-8000-000000000097'
  await db.query('insert into transactions(id,primary_bond_consultant_user_id) values($1,$2)',[fresh,consultant])
  await db.query('insert into onboarding_form_data(transaction_id,form_data) values($1,$2)',[fresh,{first_name:'Retained'}])
  const a=await call('bridge_prepare_originator_bond_application',[fresh])
  expect((await call('bridge_prepare_originator_bond_application',[fresh])).applicationId).toBe(a.applicationId)
  expect((await db.query('select count(*)::int n from transaction_bond_application_submissions where transaction_id=$1',[fresh])).rows[0].n).toBe(0)
  expect((await db.query('select form_data from onboarding_form_data where transaction_id=$1',[fresh])).rows[0].form_data.first_name).toBe('Retained')
  await db.query("update transactions set finance_type='cash' where id=$1",[fresh])
  await expect(call('bridge_prepare_originator_bond_application',[fresh])).rejects.toThrow('open deal')
 })
 it('puts an originator document request in the buyer’s existing application and canonical upload path', async () => {
  const id='80000000-0000-4000-8000-000000000001'
  const req=await call('bridge_request_manual_bond_document',[tx,id,'payslips','Latest payslips','Upload all three recent payslips.'])
  expect((await call('bridge_request_manual_bond_document',[tx,id,'payslips','Latest payslips','Upload all three recent payslips.'])).requirementId).toBe(req.requirementId)
  expect((await call('bridge_bond_manual_context',[tx])).requirements.some(r=>r.title==='Latest payslips')).toBe(true)
  await buyerHeaders()
  const buyer=await call('bridge_buyer_bond_application_runtime_context')
  expect(buyer.additionalRequirements.find(r=>r.key==='bond_manual_request_'+id).satisfactionMode).toBe('accepted')
  expect(buyer.requiredDocuments.find(r=>r.id===req.requirementId).canonical_requirement_instance_id).toBeTruthy()
  expect(buyer.additionalRequirements.find(r=>r.key==='bond_manual_request_'+id).description).toBe('Upload all three recent payslips.')
  const canonical=buyer.requiredDocuments.find(r=>r.id===req.requirementId).canonical_requirement_instance_id
  const document=(await db.query("insert into documents(transaction_id,file_path,status,canonical_requirement_instance_id) values($1,'buyer/payslips.pdf','uploaded',$2) returning id",[tx,canonical])).rows[0].id
  await db.query('update transaction_required_documents set uploaded_document_id=$1,is_uploaded=true where id=$2',[document,req.requirementId])
  await consultantHeaders()
  const item=(await call('bridge_bond_manual_context',[tx])).requirements.find(r=>r.key==='bond_manual_request_'+id)
  await expect(call('bridge_review_manual_bond_document',[tx,item.id,document,'old-path.pdf','approve',''])).rejects.toMatchObject({code:'40001'})
  await expect(call('bridge_review_manual_bond_document',[tx,item.id,document,'buyer/payslips.pdf','reject',''])).rejects.toMatchObject({code:'23514'})
  const approved=await call('bridge_review_manual_bond_document',[tx,item.id,document,'buyer/payslips.pdf','approve',''])
  expect(approved.status).toBe('approved')
  expect((await db.query('select status from document_requirement_instances where id=$1',[canonical])).rows[0].status).toBe('approved')
  expect((await db.query('select status from transaction_required_documents where id=$1',[req.requirementId])).rows[0].status).toBe('approved')
  await call('bridge_review_manual_bond_document',[tx,item.id,document,'buyer/payslips.pdf','reject','Please include the missing page.'])
  await buyerHeaders()
  expect((await call('bridge_buyer_bond_application_runtime_context')).requiredDocuments.find(r=>r.id===req.requirementId).notes).toBe('Please include the missing page.')

 })
 it('uses the same readiness and canonical bank record from the older package workflow', async () => {
  const packageId='90000000-0000-4000-8000-000000000001'
  await db.query("insert into transaction_bond_application_export_packages(id,transaction_id,bond_application_id,destination_key,status) values($1,$2,$3,'bond_originator_intake','accepted_by_originator')",[packageId,tx,app])
  await db.query("insert into transaction_bond_originator_workspace_assignments values($1,$2,'accepted')",[packageId,consultant])
  await review()
  expect((await call('bridge_assess_bond_application_submission_readiness_phase7',[packageId])).status).toBe('ready')
  const record=await call('bridge_record_bond_handoff_submission',[packageId,submissionId,[bankId],submittedAt,'LEGACY-001',''])
  expect((await call('bridge_record_bond_handoff_submission',[packageId,submissionId,[bankId],submittedAt,'LEGACY-001',''])).id).toBe(record.id)
  expect((await db.query('select count(*)::int n from bond_manual_bank_submissions')).rows[0].n).toBe(1)
  await expect(call('bridge_record_bond_handoff_submission',[packageId,submissionId,['Unauthorised bank'],submittedAt,'LEGACY-002',''])).rejects.toThrow('authorised')
 })
 it('allows the active intake assignee before its parent projection is repaired, and rejects revoked assignments', async () => {
  await db.query('update transactions set primary_bond_consultant_user_id=null where id=$1',[tx])
  await db.query("insert into transaction_bond_applications(transaction_id,application_type,assigned_user_id,assignment_status) values($1,'originator_intake',$2,'consultant_assigned')",[tx,consultant])
  expect((await call('bridge_bond_manual_context',[tx])).applicationId).toBe(app)
  await db.query("update transaction_bond_applications set assignment_status='revoked'")
  await db.exec('delete from transaction_bond_originator_workspace_assignments')
  await expect(call('bridge_bond_manual_context',[tx])).rejects.toMatchObject({code:'42501'})
  await db.query('update transactions set primary_bond_consultant_user_id=$1 where id=$2',[consultant,tx])
 })
 it('keeps a recorded bank submission fixed while allowing later bank feedback', async () => {
  const c=await review(), recorded=await record(c)
  await db.query("update transaction_bond_applications set status='feedback_received' where id=$1",[recorded.bank_application_id])
  await expect(db.query("update transaction_bond_applications set reference_number='rewritten' where id=$1",[recorded.bank_application_id])).rejects.toMatchObject({code:'23514'})
  await db.query("update transactions set lifecycle_state='registered' where id=$1",[tx])
  await expect(call('bridge_record_bond_submission_review',[tx,submissionId,c.contextHash,reviewChecks])).rejects.toThrow('open deal')
  await db.query('update transactions set lifecycle_state=null where id=$1',[tx])
 })
 it('keeps the document rule quantity when reconciling the buyer runtime', async () => {
  const fresh='10000000-0000-4000-8000-000000000097'
  await db.query("update transactions set finance_type='bond' where id=$1",[fresh])
  await db.query("insert into client_portal_links(token,transaction_id) values('manual-counts',$1)",[fresh])
  await db.exec(`select set_config('request.headers','{"x-bridge-client-portal-token":"manual-counts"}',false)`)
  await call('bridge_reconcile_buyer_bond_application_documents',[[{key:'manual_test_payslips',title:'Three payslips',canonicalDocumentType:'payslips',participantRole:'primary_applicant',required:true,minimumFileCount:3,requiredBefore:'required_before_bank_submission'}]])
  expect((await db.query("select metadata from bond_application_document_requirements where requirement_key='manual_test_payslips'")).rows[0].metadata.minimumFileCount).toBe(3)
 })
 it('saves referral assignment atomically under RLS and rolls back every allocation when the deal update fails', async () => {
  const org='b0000000-0000-4000-8000-000000000001'
  await db.query("insert into transaction_bond_applications(transaction_id,application_type,assigned_user_id) values($1,'originator_intake',null)",[tx])
  const transactionChanges={primary_bond_consultant_user_id:consultant,bond_workspace_id:org,bond_assignment_status:'consultant_assigned',finance_managed_by:'bond_originator',finance_status:'Accepted by bond originator'}
  const applicationChanges={assigned_user_id:consultant,assigned_organisation_id:org,assignment_status:'consultant_assigned',updated_by:consultant}
  // A missing intake can be restored within the same explicit acceptance command.
  await db.query('delete from transaction_bond_applications where transaction_id=$1',[tx])
  expect((await call('bridge_save_bond_intake_assignment',[tx,transactionChanges,applicationChanges])).applications[0].application_type).toBe('originator_intake')
  await db.query('update transaction_bond_applications set assigned_user_id=null where transaction_id=$1',[tx])
  await db.exec(`alter table transactions enable row level security; alter table transaction_bond_applications enable row level security;
   grant select,update on transactions,transaction_bond_applications to authenticated;
   create policy manual_test_tx_read on transactions for select to authenticated using(id='${tx}');
   create policy manual_test_tx_update on transactions for update to authenticated using(id='${tx}') with check(finance_status is distinct from 'fail-check');
   create policy manual_test_apps_read on transaction_bond_applications for select to authenticated using(transaction_id='${tx}');
   create policy manual_test_apps_update on transaction_bond_applications for update to authenticated using(transaction_id='${tx}') with check(transaction_id='${tx}');
   set role authenticated;`)
  try {
   await expect(call('bridge_save_bond_intake_assignment',[tx,{...transactionChanges,finance_status:'fail-check'},applicationChanges])).rejects.toMatchObject({code:'42501'})
   expect((await db.query('select assigned_user_id from transaction_bond_applications')).rows[0].assigned_user_id).toBeNull()
   const result=await call('bridge_save_bond_intake_assignment',[tx,transactionChanges,applicationChanges])
   expect(result.transaction.primary_bond_consultant_user_id).toBe(consultant)
   expect(result.applications[0].assigned_user_id).toBe(consultant)
   await expect(call('bridge_save_bond_intake_assignment',[tx,{...transactionChanges,registered_at:'2026-01-01'},applicationChanges])).rejects.toMatchObject({code:'23514'})
  } finally { await db.exec('reset role; drop policy manual_test_tx_read on transactions; drop policy manual_test_tx_update on transactions; drop policy manual_test_apps_read on transaction_bond_applications; drop policy manual_test_apps_update on transaction_bond_applications; alter table transactions disable row level security; alter table transaction_bond_applications disable row level security; revoke select,update on transactions,transaction_bond_applications from authenticated;') }
 })
 it('does not rewind an advanced deal and still enforces the manual readiness guard in legacy paths', async () => {
  const c=await review()
  await db.query("insert into transaction_finance_workflows(transaction_id,workflow_type,current_stage,status) values($1,'bond_hybrid','grant_received','active')",[tx])
  await record(c)
  expect((await db.query('select current_stage from transaction_finance_workflows')).rows[0].current_stage).toBe('grant_received')
  const ready=(await db.query("insert into bond_application_submission_readiness_assessments(bond_application_id,status) values($1,'ready') returning *",[app])).rows[0]
  expect(ready.status).toBe('ready')
  await db.query('update bond_applications set revision=revision+1 where id=$1',[app])
  expect((await db.query("insert into bond_application_submission_readiness_assessments(bond_application_id,status) values($1,'ready') returning *",[app])).rows[0].status).toBe('blocked')
  await expect(db.query('insert into bond_application_external_submission_records(bond_application_id) values($1)',[app])).rejects.toMatchObject({code:'23514'})
  await db.query('update bond_applications set revision=revision-1 where id=$1',[app])
 })
})

describe('current bond originator tracker (no signing)',()=>{
 const trackerTx='c0000000-0000-4000-8000-000000000001'
 const otherTx='c0000000-0000-4000-8000-000000000002'
 const packageId='c0000000-0000-4000-8000-000000000003'
 beforeAll(async()=>{
  // The full delivery/token implementation has separate tests. This fixture
  // isolates the tracker's queue suppression and exact-event copy rewrite.
  await db.exec(`
   create role service_role;
   create table notification_events(id uuid primary key default gen_random_uuid(),subject text,message_preview text,payload_json jsonb);
   create function bridge_prepare_bond_application_portal_delivery_phase5(uuid,text,integer default 0,uuid default null) returns jsonb language plpgsql as $$
   declare event_id uuid;
   begin
    insert into public.notification_events(subject,message_preview,payload_json) values('Complete your bond application','Complete securely','{"accessToken":"test-token"}') returning id into event_id;
    return jsonb_build_object('notificationEventId',event_id,'status','queued');
   end $$;
  `)
  await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261108173058_bond_originator_tracker_only.sql',import.meta.url),'utf8'))
  await db.query('insert into transactions(id,primary_bond_consultant_user_id) values($1,$2),($3,$2)',[trackerTx,consultant,otherTx])
  await db.query("insert into client_portal_links(token,transaction_id) values('tracker-buyer',$1),('tracker-other',$2)",[trackerTx,otherTx])
 },30000)
 beforeEach(async()=>{await consultantHeaders()})
 const track=(tx=trackerTx,bank='Any external lender',ref='')=>call('bridge_record_bond_tracker_submission',[tx,bank,'2026-11-01T00:00:00Z',ref,'Tracked externally'])
 it('records a bank submission with no application, signature, selected banks, documents or statement service',async()=>{
  expect((await call('bridge_bond_tracker_context',[trackerTx])).applicationId).toBeNull()
  const first=await track()
  expect(first.mode).toBe('originator_tracker')
  expect((await track()).id).toBe(first.id)
  const canonical=(await db.query('select * from transaction_bond_applications where id=$1',[first.bank_application_id])).rows[0]
  expect(canonical.status).toBe('submitted');expect(canonical.bank_name).toBe('Any external lender')
  expect((await db.query('select count(*)::int n from transaction_bond_application_submissions where transaction_id=$1',[trackerTx])).rows[0].n).toBe(0)
  expect((await db.query('select count(*)::int n from bond_applications where transaction_id=$1',[trackerTx])).rows[0].n).toBe(0)
  expect((await db.query('select current_stage from transaction_finance_workflows where transaction_id=$1',[trackerTx])).rows[0].current_stage).toBe('submitted_to_banks')
 })
 it('allows genuine resubmissions and reference/status edits without introducing a signing requirement',async()=>{
  const entry=await track(trackerTx,'Any external lender','SECOND')
  expect((await track(trackerTx,'Any external lender','SECOND')).id).toBe(entry.id)
  await db.query("update transaction_bond_applications set reference_number='REF-RECEIVED-LATER',status='feedback_received' where id=$1",[entry.bank_application_id])
  const row=(await call('bridge_bond_tracker_context',[trackerTx])).submissions.find(item=>item.id===entry.bank_application_id)
  expect(row.reference).toBe('REF-RECEIVED-LATER');expect(row.status).toBe('feedback_received')
 })
 it('keeps permissions, closed-deal checks and valid submission inputs',async()=>{
  await expect(track(trackerTx,'')).rejects.toMatchObject({code:'23514'})
  await expect(call('bridge_record_bond_tracker_submission',[trackerTx,'FNB','2999-01-01','',''])).rejects.toMatchObject({code:'23514'})
  await db.query("update transactions set lifecycle_state='registered' where id=$1",[otherTx])
  await expect(track(otherTx)).rejects.toThrow('open deal')
  expect((await call('bridge_bond_tracker_context',[otherTx])).canEdit).toBe(false)
  await db.query('update transactions set lifecycle_state=null where id=$1',[otherTx])
  await db.exec("select set_config('request.uid','70000000-0000-4000-8000-000000000099',false)")
  await expect(track()).rejects.toMatchObject({code:'42501'})
  await expect(call('bridge_bond_tracker_context',[trackerTx])).rejects.toMatchObject({code:'42501'})
  await consultantHeaders();await db.exec('set role authenticated')
  try{await expect(db.query('select * from bond_originator_tracker_records')).rejects.toMatchObject({code:'42501'})}finally{await db.exec('reset role')}
 })
 it('shares actual canonical progress through the bound buyer link without preparing an application',async()=>{
  await db.exec(`select set_config('request.headers','{"x-bridge-client-portal-token":"tracker-buyer"}',false)`)
  const data=await call('bridge_buyer_bond_tracker_context')
  expect(data.transactionId).toBe(trackerTx);expect(data.submissions.some(row=>row.bankName==='Any external lender')).toBe(true)
  expect(data).not.toHaveProperty('snapshot_json');expect(data).not.toHaveProperty('signerManifest')
  await expect(track()).rejects.toMatchObject({code:'42501'})
  await db.exec(`select set_config('request.headers','{"x-bridge-client-portal-token":"tracker-other"}',false)`)
  expect((await call('bridge_buyer_bond_tracker_context')).submissions).toEqual([])
  await db.query("update client_portal_links set is_active=false where token='tracker-other'")
  await expect(call('bridge_buyer_bond_tracker_context')).rejects.toMatchObject({code:'42501'})
 })
 it('creates the document workspace only when explicitly requesting an optional file, and keeps tracking available',async()=>{
  await db.query("update client_portal_links set is_active=true where token='tracker-other'")
  const request='c0000000-0000-4000-8000-000000000004'
  const req=await call('bridge_request_manual_bond_document',[otherTx,request,'payslips','Latest payslips','Please include every page.'])
  expect(req.requirementId).toBeTruthy()
  const ctx=await call('bridge_bond_tracker_context',[otherTx]);expect(ctx.applicationId).toBeTruthy()
  expect(ctx.requirements.length).toBe(1)
  await db.query("insert into bond_application_participants(bond_application_id,participant_key,role,status) values($1,'surety:1','surety','in_progress')",[ctx.applicationId])
  expect((await track(otherTx,'A different bank')).mode).toBe('originator_tracker')
  expect((await call('bridge_record_manual_bond_submission',[otherTx,null,null,'external','Backward-compatible tracker entry','2026-11-01',''])).mode).toBe('originator_tracker')
  await db.exec(`select set_config('request.headers','{"x-bridge-client-portal-token":"tracker-other"}',false)`)
  expect((await call('bridge_buyer_bond_tracker_context')).requiredDocuments[0].document_label).toBe('Latest payslips')
 })
 it('keeps older package recording available even with no signed version or normalised application',async()=>{
  await db.query("insert into transaction_bond_application_export_packages(id,transaction_id,destination_key,status) values($1,$2,'bond_originator_intake','accepted_by_originator')",[packageId,trackerTx])
  await db.query("insert into transaction_bond_originator_workspace_assignments values($1,$2,'accepted')",[packageId,consultant])
  expect((await call('bridge_assess_bond_application_submission_readiness_phase7',[packageId])).status).toBe('ready')
  expect((await call('bridge_bond_application_submission_readiness_view_phase7')).items.some(row=>row.exportPackageId===packageId)).toBe(true)
  const record=await call('bridge_record_bond_handoff_submission',[packageId,null,['Unlisted bank'],'2026-11-01','TRACKER-OLD-UI',''])
  expect(record.mode).toBe('originator_tracker')
  const view=await call('bridge_bond_application_external_submission_view_phase8')
  expect(view.items.find(row=>row.exportPackageId===packageId).records.some(row=>row.lenderNames[0]==='Unlisted bank')).toBe(true)
 })
 it('preserves historical package-only submissions when displaying tracker history',async()=>{
  const legacyPackage='c0000000-0000-4000-8000-000000000009'
  await db.query("insert into transaction_bond_application_export_packages(id,transaction_id,bond_application_id,destination_key,status) values($1,$2,$3,'bond_originator_intake','accepted_by_originator')",[legacyPackage,tx,app])
  await db.query("insert into transaction_bond_originator_workspace_assignments values($1,$2,'accepted')",[legacyPackage,consultant])
  await db.query("insert into bond_application_external_submission_records(export_package_id,bond_application_id,lender_names,external_reference,submitted_at) values($1,$2,$3,'LEGACY-ONLY','2026-11-01')",[legacyPackage,app,['Unmigrated historical bank']])
  const view=await call('bridge_bond_application_external_submission_view_phase8')
  expect(view.items.find(row=>row.exportPackageId===legacyPackage).records.some(row=>row.externalReference==='LEGACY-ONLY')).toBe(true)
  await call('bridge_record_bond_tracker_submission',[tx,'Partially migrated bank A','2026-11-01','LEGACY-PARTIAL',''])
  await db.query("insert into bond_application_external_submission_records(export_package_id,bond_application_id,lender_names,external_reference,submitted_at) values($1,$2,$3,'LEGACY-PARTIAL','2026-11-01')",[legacyPackage,app,['Partially migrated bank A','Partially migrated bank B']])
  const partial=await call('bridge_bond_application_external_submission_view_phase8')
  expect(partial.items.find(row=>row.exportPackageId===legacyPackage).records.some(row=>row.externalReference==='LEGACY-PARTIAL' && row.lenderNames.length===2)).toBe(true)

 })
 it('blocks new signing at the database boundary but preserves the historical evidence',async()=>{
  const before=(await db.query('select count(*)::int n from transaction_bond_application_submissions')).rows[0].n
  await expect(call('bridge_prepare_bond_wet_ink',[1,{}])).rejects.toThrow('signing is disabled')
  await expect(call('bridge_submit_buyer_bond_application',[1,'{}'])).rejects.toThrow('signing is disabled')
  await expect(call('bridge_upload_bond_wet_ink',['00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000001','old.pdf',10,'a'.repeat(64)])).rejects.toThrow('signing is disabled')
  const path=(await db.query("select file_path from bond_wet_ink_uploads where status='accepted' limit 1")).rows[0].file_path
  expect(await call('bridge_bond_wet_ink_storage_access',[path,false])).toBe(true)
  expect(await call('bridge_bond_wet_ink_storage_access',[path,true])).toBe(false)
  await expect(call('bridge_review_bond_wet_ink',['00000000-0000-4000-8000-000000000000','accepted','',{}])).rejects.toThrow('signing is disabled')
  await expect(db.query("insert into transaction_bond_application_submissions(transaction_id,submission_version,status) values($1,9999,'submitted')",[trackerTx])).rejects.toThrow('signing is disabled')
  expect((await db.query('select count(*)::int n from transaction_bond_application_submissions')).rows[0].n).toBe(before)
 })
 it('does not rewind later workflow progress when recording another bank',async()=>{
  await db.query("update transaction_finance_workflows set current_stage='grant_received' where transaction_id=$1",[trackerTx])
  await track(trackerTx,'Another real bank','AFTER-GRANT')
  expect((await db.query('select current_stage from transaction_finance_workflows where transaction_id=$1',[trackerTx])).rows[0].current_stage).toBe('grant_received')
 })
 it('stops scheduled application reminders while preserving manually requested progress links',async()=>{
  await expect(call('bridge_queue_bond_application_portal_reminders_phase5')).rejects.toMatchObject({code:'42501'})
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)")
  try {
   expect(await call('bridge_queue_bond_application_portal_reminders_phase5',[100,null,false])).toMatchObject({mode:'originator_tracker',considered:0,queued:0,dryRun:false})
   expect(await call('bridge_prepare_bond_application_portal_delivery_phase5',[packageId,'scheduled',1,null])).toMatchObject({status:'skipped'})
   expect((await db.query('select count(*)::int n from notification_events')).rows[0].n).toBe(0)
   const manual=await call('bridge_prepare_bond_application_portal_delivery_phase5',[packageId,'manual',0,consultant])
   const event=(await db.query('select * from notification_events where id=$1',[manual.notificationEventId])).rows[0]
   expect(event.subject).toBe('View your bond progress')
   expect(event.payload_json).toEqual({accessToken:'test-token',portalLabel:'Bond progress'})
  } finally { await db.exec("select set_config('request.jwt.claim.role','',false)") }
 })
})
