// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createBuyerBondApplicationRuntimeService } from '../workspace/bondApplicationRuntimeService.js'
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
 create table client_portal_links(id uuid default gen_random_uuid(),token text,transaction_id uuid,buyer_id uuid,development_id uuid,unit_id uuid,is_active boolean default true,expires_at timestamptz);
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
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261003182500_buyer_bond_application_runtime.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261003202419_bond_wet_ink_application_signing.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261004001000_bond_submission_pack_original.sql',import.meta.url),'utf8'))
 await db.exec(`create table bond_application_submission_readiness_assessments(id uuid default gen_random_uuid(),bond_application_id uuid,status text,blockers jsonb default '[]'); create table bond_application_external_submission_records(id uuid default gen_random_uuid(),bond_application_id uuid);`)
 await db.exec(readFileSync(new URL('../../../../../../supabase/migrations/20261004002000_bond_submission_consultant_review.sql',import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
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
 await expect(service.upload({requirementKey:'proof',file:{type:'application/pdf'}})).rejects.toThrow('Storage unavailable');expect(rpc).toHaveBeenCalledTimes(1)
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
