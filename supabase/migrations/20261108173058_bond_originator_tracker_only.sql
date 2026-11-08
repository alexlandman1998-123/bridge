begin;

-- Product decision: the bond workspace tracks work performed externally. It
-- neither signs applications nor requires signing/statement-provider readiness.
-- Existing signing evidence is retained as history.
create table public.bond_originator_tracker_records (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.transactions(id),
 bank_application_id uuid not null unique references public.transaction_bond_applications(id),
 bank_name text not null,
 submitted_at timestamptz not null,
 reference text not null default '',
 notes text not null default '',
 recorded_by uuid not null,
 recorded_at timestamptz not null default now()
);
create unique index bond_originator_tracker_retry_idx on public.bond_originator_tracker_records(transaction_id,lower(bank_name),submitted_at,reference);
create index bond_originator_tracker_transaction_idx on public.bond_originator_tracker_records(transaction_id,recorded_at desc);
alter table public.bond_originator_tracker_records enable row level security;
revoke all on public.bond_originator_tracker_records from public,anon,authenticated;

-- Remove the signing gate from the canonical bank tracker, including the older
-- add/update form. Its existing RLS and assignment policies remain in force.
drop trigger if exists bond_manual_bank_row_guard on public.transaction_bond_applications;

create function public.bridge_bond_tracker_context(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; t public.transactions;
begin
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This bond tracker is not accessible.' using errcode='42501'; end if;
 select * into t from public.transactions where id=p_transaction;
 select * into a from public.bond_applications where transaction_id=p_transaction order by created_at desc limit 1;
 return jsonb_build_object('mode','originator_tracker','transactionId',p_transaction,'applicationId',a.id,
 'canEdit',lower(coalesce(t.finance_type,'')) in ('bond','hybrid','combination') and t.registered_at is null and t.cancelled_at is null and t.archived_at is null and lower(coalesce(t.lifecycle_state,'')) not in ('registered','completed','cancelled','archived'),
 'requirements',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'key',q.requirement_key,'title',coalesce(req.document_label,q.requirement_key),'instruction',q.metadata->>'instruction','canonicalId',req.canonical_requirement_instance_id,'document',case when d.id is not null then jsonb_build_object('id',d.id,'name',d.name,'file_path',d.file_path,'file_bucket',d.file_bucket,'status',coalesce(to_jsonb(d)->>'review_status',d.status)) else null end)) from public.bond_application_document_requirements q left join public.transaction_required_documents req on req.id=q.transaction_required_document_id left join public.documents d on d.id=coalesce(req.uploaded_document_id,q.linked_document_id) and d.transaction_id=p_transaction where q.bond_application_id=a.id and q.status not in ('inactive','superseded','waived')),'[]'),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'bank_name',b.bank_name,'submitted_at',b.submitted_at,'reference',coalesce(b.reference_number,b.application_reference,''),'notes',b.notes,'status',b.status) order by b.submitted_at desc nulls last,b.created_at desc) from public.transaction_bond_applications b where b.transaction_id=p_transaction and (b.application_type='bank_application' or (b.application_type is null and lower(trim(b.bank_name))<>'bond originator intake'))),'[]'));
end $$;

create function public.bridge_record_bond_tracker_submission(p_transaction uuid,p_bank_name text,p_submitted_at timestamptz,p_reference text default '',p_notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.bond_originator_tracker_records; allocation public.transaction_bond_applications; w public.transaction_finance_workflows; tx public.transactions; bank_app uuid;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 p_bank_name:=trim(coalesce(p_bank_name,'')); p_reference:=trim(coalesce(p_reference,'')); p_notes:=trim(coalesce(p_notes,''));
 if length(p_bank_name) not between 2 and 100 or p_submitted_at is null or p_submitted_at>now() or length(p_reference)>200 or length(p_notes)>2000 then raise exception 'Enter the bank and actual submission date. References are optional; notes may contain up to 2,000 characters.' using errcode='23514'; end if;
 select * into prior from public.bond_originator_tracker_records r where r.transaction_id=p_transaction and lower(r.bank_name)=lower(p_bank_name) and r.submitted_at=p_submitted_at and r.reference=p_reference;
 if prior.id is not null then return to_jsonb(prior)||jsonb_build_object('mode','originator_tracker'); end if;
 select * into tx from public.transactions where id=p_transaction;
 insert into public.transaction_finance_workflows(transaction_id,workflow_type,current_stage,status,last_updated_by) values(p_transaction,'bond_hybrid','intake','active',auth.uid()) on conflict(transaction_id,workflow_type) do nothing;
 select * into w from public.transaction_finance_workflows where transaction_id=p_transaction and workflow_type='bond_hybrid' for update;
 select * into allocation from public.transaction_bond_applications where transaction_id=p_transaction and application_type='originator_intake' and coalesce(assignment_status,'') not in ('revoked','inactive','unassigned','cancelled','removed') order by created_at desc limit 1;
 insert into public.transaction_bond_applications(transaction_id,workflow_id,bank_name,application_type,status,submitted_at,reference_number,application_reference,notes,created_by,updated_by,submitted_by,assigned_organisation_id,originator_organisation_id,assigned_user_id,assigned_region_id,assigned_workspace_unit_id,assigned_branch_id,assigned_team_id)
 values(p_transaction,w.id,p_bank_name,'bank_application','submitted',p_submitted_at,nullif(p_reference,''),nullif(p_reference,''),nullif(p_notes,''),auth.uid(),auth.uid(),auth.uid(),coalesce(allocation.assigned_organisation_id,tx.bond_workspace_id),coalesce(allocation.assigned_organisation_id,tx.bond_workspace_id),coalesce(allocation.assigned_user_id,tx.primary_bond_consultant_user_id),coalesce(allocation.assigned_region_id,tx.bond_region_id),coalesce(allocation.assigned_workspace_unit_id,tx.bond_workspace_unit_id),allocation.assigned_branch_id,allocation.assigned_team_id) returning id into bank_app;
 insert into public.bond_originator_tracker_records(transaction_id,bank_application_id,bank_name,submitted_at,reference,notes,recorded_by) values(p_transaction,bank_app,p_bank_name,p_submitted_at,p_reference,p_notes,auth.uid()) returning * into prior;
 if w.current_stage in ('intake','documents','documents_received','documents_reviewed','applications_submitted') then update public.transaction_finance_workflows set current_stage='submitted_to_banks',last_updated_by=auth.uid(),last_updated_at=now(),updated_at=now() where id=w.id; end if;
 insert into public.transaction_finance_workflow_events(workflow_id,from_stage,to_stage,event_type,notes,created_by) values(w.id,w.current_stage,case when w.current_stage in ('intake','documents','documents_received','documents_reviewed','applications_submitted') then 'submitted_to_banks' else w.current_stage end,'bank_submission_added','Bank submission tracked: '||p_bank_name||case when p_reference<>'' then ' / '||p_reference else '' end,auth.uid());
 return to_jsonb(prior)||jsonb_build_object('mode','originator_tracker');
end $$;

-- Compatibility for clients still using the previous names. Version, signature,
-- selected-bank and document readiness are not prerequisites for tracking.
create or replace function public.bridge_bond_manual_context(p_transaction uuid)
returns jsonb language sql security definer set search_path='' as $$ select public.bridge_bond_tracker_context(p_transaction) $$;
create or replace function public.bridge_record_manual_bond_submission(p_transaction uuid,p_submission uuid,p_context_hash text,p_bank_id text,p_bank_name text,p_submitted_at timestamptz,p_reference text)
returns jsonb language sql security definer set search_path='' as $$ select public.bridge_record_bond_tracker_submission(p_transaction,coalesce(nullif(trim(p_bank_name),''),p_bank_id),p_submitted_at,p_reference,'') $$;

-- Document collection is optional. Create its private buyer workspace lazily
-- when an originator explicitly requests a document, without asking for signing.
alter function public.bridge_request_manual_bond_document(uuid,uuid,text,text,text) rename to bridge_request_manual_bond_document_before_tracker;
revoke all on function public.bridge_request_manual_bond_document_before_tracker(uuid,uuid,text,text,text) from public,anon,authenticated;
create function public.bridge_request_manual_bond_document(p_transaction uuid,p_request uuid,p_type text,p_title text,p_instruction text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.bridge_prepare_originator_bond_application(p_transaction);
 return public.bridge_request_manual_bond_document_before_tracker(p_transaction,p_request,p_type,p_title,p_instruction);
end $$;

create or replace function public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tx uuid;
begin
 select p.transaction_id into tx from public.transaction_bond_application_export_packages p join public.transaction_bond_originator_workspace_assignments a on a.export_package_id=p.id where p.id=p_export_package_id and p.destination_key='bond_originator_intake' and p.status not in ('cancelled','superseded') and a.assigned_to_profile_id=auth.uid() and a.status in ('assigned','accepted');
 if tx is null then raise exception 'Assigned originator file not found.' using errcode='42501'; end if;
 perform public.bridge_assert_open_manual_bond(tx);
 return jsonb_build_object('status','ready','label','Tracking available','blockers','[]'::jsonb,'snapshot',jsonb_build_object('mode','originator_tracker','transactionId',tx,'automaticBankSubmission',false));
end $$;
create or replace function public.bridge_bond_application_submission_readiness_view_phase7()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','bond_originator_tracker','items',coalesce(jsonb_agg(jsonb_build_object('exportPackageId',p.id,'assessment',jsonb_build_object('mode','originator_tracker','status',case when lower(coalesce(t.finance_type,'')) in ('bond','hybrid','combination') and t.registered_at is null and t.cancelled_at is null and t.archived_at is null and lower(coalesce(t.lifecycle_state,'')) not in ('registered','completed','cancelled','archived') then 'ready' else 'blocked' end,'blockers','[]'::jsonb))),'[]'))
 from public.transaction_bond_application_export_packages p join public.transaction_bond_originator_workspace_assignments a on a.export_package_id=p.id join public.transactions t on t.id=p.transaction_id where a.assigned_to_profile_id=auth.uid() and a.status in ('assigned','accepted') and p.destination_key='bond_originator_intake' and p.status not in ('cancelled','superseded');
$$;
create or replace function public.bridge_record_bond_handoff_submission(p_export_package_id uuid,p_expected_submission_id uuid,p_lender_names text[],p_submitted_at timestamptz,p_external_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare available jsonb; lender text; recorded jsonb;
begin
 available:=public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id);
 if coalesce(cardinality(p_lender_names),0)=0 or cardinality(p_lender_names)>30 then raise exception 'Enter at least one bank (maximum 30).' using errcode='23514'; end if;
 foreach lender in array p_lender_names loop recorded:=public.bridge_record_bond_tracker_submission((available#>>'{snapshot,transactionId}')::uuid,lender,p_submitted_at,p_external_reference,p_notes); end loop;
 return recorded||jsonb_build_object('status','recorded','submittedAt',p_submitted_at,'submissionId',null,'mode','originator_tracker');
end $$;
create or replace function public.bridge_record_bond_application_external_submission_phase8(p_export_package_id uuid,p_lender_names text[] default '{}',p_external_reference text default null,p_confirmation_document_id uuid default null,p_notes text default null)
returns jsonb language sql security definer set search_path='' as $$ select public.bridge_record_bond_handoff_submission(p_export_package_id,null,p_lender_names,now(),p_external_reference,p_notes) $$;
create or replace function public.bridge_bond_application_external_submission_view_phase8()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version','bond_originator_tracker','items',coalesce(jsonb_agg(jsonb_build_object('exportPackageId',p.id,'records',coalesce((
  select jsonb_agg(history.item order by history.submitted_at desc) from (
   select b.submitted_at,jsonb_build_object('id',b.id,'lenderNames',jsonb_build_array(b.bank_name),'externalReference',coalesce(b.reference_number,b.application_reference),'submittedAt',b.submitted_at,'status',b.status,'submittedBy',coalesce(b.submitted_by,b.created_by),'notes',b.notes,'mode','originator_tracker') item
   from public.transaction_bond_applications b where b.transaction_id=p.transaction_id and (b.application_type='bank_application' or (b.application_type is null and lower(trim(b.bank_name))<>'bond originator intake'))
   union all
   select r.submitted_at,jsonb_build_object('id',r.id,'lenderNames',r.lender_names,'externalReference',r.external_reference,'submittedAt',r.submitted_at,'status',r.status,'submittedBy',r.submitted_by,'notes',r.notes,'version',r.metadata->'submittedVersion','mode','historical_record')
   from public.bond_application_external_submission_records r where r.export_package_id=p.id and (coalesce(cardinality(r.lender_names),0)=0 or exists(
    select 1 from unnest(r.lender_names) lender where not exists(select 1 from public.transaction_bond_applications b where b.transaction_id=p.transaction_id and b.submitted_at=r.submitted_at and coalesce(b.reference_number,b.application_reference,'')=coalesce(r.external_reference,'') and lower(trim(b.bank_name))=lower(trim(lender)))
   ))
  ) history
 ),'[]'))),'[]'))
 from public.transaction_bond_application_export_packages p join public.transaction_bond_originator_workspace_assignments a on a.export_package_id=p.id where a.assigned_to_profile_id=auth.uid() and a.status in ('assigned','accepted') and p.destination_key='bond_originator_intake' and p.status not in ('cancelled','superseded');
$$;

-- Old readiness assessments no longer introduce a signing block. These are
-- tracker permissions only, not approval to send an application to a bank.
create or replace function public.bridge_bond_reviewed_readiness_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin return new; end $$;
create or replace function public.bridge_bond_reviewed_external_submission_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin return new; end $$;

-- No new bond signing operations in tracker mode. Read/cancel/history endpoints
-- and unrelated OTP, lease and legal-document signing are preserved.
create function public.bridge_bond_tracker_signing_disabled()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Bond signing is disabled in tracker mode. Record bank progress in the originator workspace.' using errcode='23514'; end $$;
create trigger bond_tracker_no_new_signing before insert on public.transaction_bond_application_submissions for each row execute function public.bridge_bond_tracker_signing_disabled();
revoke all on function public.bridge_bond_tracker_signing_disabled() from public,anon,authenticated;
create or replace function public.bridge_prepare_bond_wet_ink(p_revision integer,p_declarations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Bond signing is disabled. Your originator tracks progress and documents in Arch9.' using errcode='23514'; end $$;
create or replace function public.bridge_upload_bond_wet_ink(p_version uuid,p_upload uuid,p_name text,p_bytes integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Bond signing is disabled. Use the shared document workspace for requested files.' using errcode='23514'; end $$;
create or replace function public.bridge_bond_wet_ink_storage_access(p_path text,p_write boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.bond_wet_ink_versions; buyer uuid;
begin
 if p_write then return false; end if;
 if p_path !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$' then return false; end if;
 select * into v from public.bond_wet_ink_versions where id=(split_part(p_path,'/',2))::uuid and bond_application_id=(split_part(p_path,'/',1))::uuid;
 if v.id is null then return false; end if;
 begin buyer:=public.bridge_buyer_bond_application_runtime_id(); exception when others then buyer:=null; end;
 return buyer=v.bond_application_id or public.bridge_bond_wet_ink_consultant(v.bond_application_id);
end $$;
create or replace function public.bridge_submit_buyer_bond_application(p_revision integer,p_snapshot_canonical text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Bond signing is disabled. Your originator tracks progress in Arch9; no signed application is required here.' using errcode='23514'; end $$;
alter function public.bridge_review_bond_wet_ink(uuid,text,text,jsonb) rename to bridge_review_bond_wet_ink_before_tracker;
revoke all on function public.bridge_review_bond_wet_ink_before_tracker(uuid,text,text,jsonb) from public,anon,authenticated;
create function public.bridge_review_bond_wet_ink(p_upload uuid,p_action text,p_feedback text,p_checks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action='accepted' then raise exception 'Bond signing is disabled in the originator tracker.' using errcode='23514'; end if;
 return public.bridge_review_bond_wet_ink_before_tracker(p_upload,p_action,p_feedback,p_checks);
end $$;

create function public.bridge_buyer_bond_tracker_context()
returns jsonb language plpgsql security definer set search_path='' as $$
declare tx uuid; app uuid; context jsonb:='{}';
begin
 if nullif(public.bridge_request_header('x-bridge-bond-application-token'),'') is not null then
  app:=public.bridge_buyer_bond_application_runtime_id(); select transaction_id into tx from public.bond_applications where id=app;
 else
  tx:=public.bridge_portal_matter_financial_transaction_id('buyer');
 end if;
 if tx is null then raise exception 'An active buyer portal link is required.' using errcode='42501'; end if;
 if exists(select 1 from public.bond_applications where transaction_id=tx and status<>'cancelled') then context:=public.bridge_buyer_bond_application_runtime_context(); end if;
 return jsonb_build_object('mode','originator_tracker','transactionId',tx,'requiredDocuments',coalesce(context->'requiredDocuments','[]'),'additionalRequirements',coalesce(context->'additionalRequirements','[]'),'documents',coalesce(context->'documents','[]'),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('bankName',b.bank_name,'status',b.status,'submittedAt',b.submitted_at,'reference',coalesce(b.reference_number,b.application_reference)) order by b.submitted_at desc) from public.transaction_bond_applications b where b.transaction_id=tx and (b.application_type='bank_application' or (b.application_type is null and lower(trim(b.bank_name))<>'bond originator intake'))),'[]'));
end $$;

revoke all on function public.bridge_bond_tracker_context(uuid),public.bridge_record_bond_tracker_submission(uuid,text,timestamptz,text,text),public.bridge_buyer_bond_tracker_context(),public.bridge_request_manual_bond_document(uuid,uuid,text,text,text),public.bridge_review_bond_wet_ink(uuid,text,text,jsonb) from public,anon;
grant execute on function public.bridge_bond_tracker_context(uuid),public.bridge_record_bond_tracker_submission(uuid,text,timestamptz,text,text),public.bridge_request_manual_bond_document(uuid,uuid,text,text,text),public.bridge_review_bond_wet_ink(uuid,text,text,jsonb) to authenticated;
grant execute on function public.bridge_buyer_bond_tracker_context() to anon,authenticated;
revoke all on function public.bridge_bond_application_submission_readiness_view_phase7() from public,anon;
grant execute on function public.bridge_bond_application_submission_readiness_view_phase7() to authenticated;
-- A buyer has no application-completion task in tracker mode. Keep manual
-- progress links and delivery history, but do not create scheduled reminders.
create or replace function public.bridge_queue_bond_application_portal_reminders_phase5(
 p_limit integer default 100,p_now timestamptz default now(),p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
  raise exception 'Service role is required.' using errcode='42501';
 end if;
 return jsonb_build_object('mode','originator_tracker','considered',0,'queued',0,'dryRun',coalesce(p_dry_run,true),'processedAt',coalesce(p_now,now()));
end $$;

alter function public.bridge_prepare_bond_application_portal_delivery_phase5(uuid,text,integer,uuid) rename to bridge_prepare_bond_portal_delivery_before_tracker;
revoke all on function public.bridge_prepare_bond_portal_delivery_before_tracker(uuid,text,integer,uuid) from public,anon,authenticated,service_role;
create function public.bridge_prepare_bond_application_portal_delivery_phase5(
 p_export_package_id uuid,p_delivery_kind text,p_reminder_number integer default 0,p_actor_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if lower(trim(coalesce(p_delivery_kind,'')))='scheduled' then
  return jsonb_build_object('mode','originator_tracker','status','skipped','reason','bond_tracker_no_application_required');
 end if;
 -- Reuse the existing recipient, assignment, token and duplicate safeguards.
 result:=public.bridge_prepare_bond_portal_delivery_before_tracker(p_export_package_id,p_delivery_kind,p_reminder_number,p_actor_profile_id);
 update public.notification_events set subject='View your bond progress',
  message_preview='View bond progress and share documents requested by your originator.',
  payload_json=coalesce(payload_json,'{}')||jsonb_build_object('portalLabel','Bond progress')
 where id=(result->>'notificationEventId')::uuid;
 return result||jsonb_build_object('mode','originator_tracker');
end $$;
revoke all on function public.bridge_prepare_bond_application_portal_delivery_phase5(uuid,text,integer,uuid),public.bridge_queue_bond_application_portal_reminders_phase5(integer,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.bridge_prepare_bond_application_portal_delivery_phase5(uuid,text,integer,uuid),public.bridge_queue_bond_application_portal_reminders_phase5(integer,timestamptz,boolean) to service_role;

notify pgrst,'reload schema';
commit;
