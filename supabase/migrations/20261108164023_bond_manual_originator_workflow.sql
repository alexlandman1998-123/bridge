begin;

-- One RLS-protected transaction for the operational allocation and deal spine.
-- Failure in either update rolls back both, including projection triggers.
create function public.bridge_save_bond_intake_assignment(p_transaction uuid,p_transaction_changes jsonb,p_application_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.transactions; application public.transaction_bond_applications; saved public.transactions; apps jsonb:='[]'; expected integer; v_workflow uuid;
begin
 if auth.uid() is null or nullif(public.bridge_request_header('x-bridge-client-portal-token'),'') is not null or nullif(public.bridge_request_header('x-bridge-bond-application-token'),'') is not null then raise exception 'An authenticated originator is required.' using errcode='42501'; end if;
 if jsonb_typeof(p_transaction_changes) is distinct from 'object' or jsonb_typeof(p_application_changes) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_transaction_changes) key where not(key=any(array['assigned_bond_originator_email','bond_originator','bond_workspace_id','bond_region_id','bond_workspace_unit_id','primary_bond_consultant_user_id','bond_assignment_rule_id','bond_assignment_method','finance_managed_by','bond_assignment_status','bond_assignment_source','finance_status','last_meaningful_activity_at','updated_at'])))
  or exists(select 1 from jsonb_object_keys(p_application_changes) key where not(key=any(array['assigned_organisation_id','assigned_region_id','assigned_workspace_unit_id','assigned_branch_id','assigned_team_id','assigned_user_id','assignment_rule_id','assignment_method','scope_level','scope_metadata','assignment_status','assignment_source','updated_by','updated_at'])))
  or p_transaction_changes->>'primary_bond_consultant_user_id' is distinct from p_application_changes->>'assigned_user_id'
  or p_transaction_changes->>'bond_workspace_id' is distinct from p_application_changes->>'assigned_organisation_id'
  or p_application_changes->>'updated_by' is distinct from auth.uid()::text
  or p_transaction_changes->>'bond_assignment_status' is distinct from 'consultant_assigned'
  or p_transaction_changes->>'finance_managed_by' is distinct from 'bond_originator' then raise exception 'The assignment details do not match. Refresh the referral and retry.' using errcode='23514'; end if;
 select * into t from public.transactions where id=p_transaction;
 if t.id is null then raise exception 'This application could not be updated. Refresh and check your assignment.' using errcode='42501'; end if;
 if lower(coalesce(t.finance_type,'')) not in ('bond','hybrid','combination') or t.registered_at is not null or t.cancelled_at is not null or t.archived_at is not null or lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','cancelled','archived') then raise exception 'An open deal with bond finance is required.' using errcode='23514'; end if;
 if not exists(select 1 from public.transaction_bond_applications where transaction_id=p_transaction and application_type='originator_intake') then
 update public.transactions target set (assigned_bond_originator_email,bond_originator,bond_workspace_id,bond_region_id,bond_workspace_unit_id,primary_bond_consultant_user_id,bond_assignment_rule_id,bond_assignment_method,finance_managed_by,bond_assignment_status,bond_assignment_source,finance_status,last_meaningful_activity_at,updated_at)=(select changes.assigned_bond_originator_email,changes.bond_originator,changes.bond_workspace_id,changes.bond_region_id,changes.bond_workspace_unit_id,changes.primary_bond_consultant_user_id,changes.bond_assignment_rule_id,changes.bond_assignment_method,changes.finance_managed_by,changes.bond_assignment_status,changes.bond_assignment_source,changes.finance_status,changes.last_meaningful_activity_at,changes.updated_at from jsonb_populate_record(null::public.transactions,to_jsonb(target)||p_transaction_changes) changes) where target.id=p_transaction and lower(coalesce(target.finance_type,'')) in ('bond','hybrid','combination') and target.registered_at is null and target.cancelled_at is null and target.archived_at is null and lower(coalesce(target.lifecycle_state,'')) not in ('registered','completed','cancelled','archived') returning target.* into saved;
  if saved.id is null then raise exception 'This referral could not be updated. No changes were saved.' using errcode='42501'; end if;
  if not exists(select 1 from public.transaction_bond_applications where transaction_id=p_transaction and application_type='originator_intake') then
   insert into public.transaction_finance_workflows(transaction_id,workflow_type,current_stage,status,last_updated_by) values(p_transaction,'bond_hybrid','intake','active',auth.uid()) on conflict(transaction_id,workflow_type) do nothing;
   select id into v_workflow from public.transaction_finance_workflows where transaction_id=p_transaction and workflow_type='bond_hybrid';
   insert into public.transaction_bond_applications(transaction_id,workflow_id,bank_name,application_type,status,created_by,assigned_organisation_id,assigned_region_id,assigned_workspace_unit_id,assigned_branch_id,assigned_team_id,assigned_user_id,assignment_rule_id,assignment_method,scope_level,scope_metadata,assignment_status,assignment_source,updated_by,updated_at)
   select p_transaction,v_workflow,'Bond Originator Intake','originator_intake','pending',auth.uid(),changes.assigned_organisation_id,changes.assigned_region_id,changes.assigned_workspace_unit_id,changes.assigned_branch_id,changes.assigned_team_id,changes.assigned_user_id,changes.assignment_rule_id,changes.assignment_method,changes.scope_level,changes.scope_metadata,changes.assignment_status,changes.assignment_source,changes.updated_by,changes.updated_at from jsonb_populate_record(null::public.transaction_bond_applications,p_application_changes) changes;
  end if;
 end if;
 select count(*) into expected from public.transaction_bond_applications where transaction_id=p_transaction;
 for application in update public.transaction_bond_applications target set (assigned_organisation_id,assigned_region_id,assigned_workspace_unit_id,assigned_branch_id,assigned_team_id,assigned_user_id,assignment_rule_id,assignment_method,scope_level,scope_metadata,assignment_status,assignment_source,updated_by,updated_at)=(select changes.assigned_organisation_id,changes.assigned_region_id,changes.assigned_workspace_unit_id,changes.assigned_branch_id,changes.assigned_team_id,changes.assigned_user_id,changes.assignment_rule_id,changes.assignment_method,changes.scope_level,changes.scope_metadata,changes.assignment_status,changes.assignment_source,changes.updated_by,changes.updated_at from jsonb_populate_record(null::public.transaction_bond_applications,to_jsonb(target)||p_application_changes) changes) where target.transaction_id=p_transaction returning target.* loop
  apps:=apps||jsonb_build_array(to_jsonb(application));
 end loop;
 if jsonb_array_length(apps)<>expected then raise exception 'An assignment could not be updated. No assignment changes were saved.' using errcode='42501'; end if;
 if saved.id is null then
 update public.transactions target set (assigned_bond_originator_email,bond_originator,bond_workspace_id,bond_region_id,bond_workspace_unit_id,primary_bond_consultant_user_id,bond_assignment_rule_id,bond_assignment_method,finance_managed_by,bond_assignment_status,bond_assignment_source,finance_status,last_meaningful_activity_at,updated_at)=(select changes.assigned_bond_originator_email,changes.bond_originator,changes.bond_workspace_id,changes.bond_region_id,changes.bond_workspace_unit_id,changes.primary_bond_consultant_user_id,changes.bond_assignment_rule_id,changes.bond_assignment_method,changes.finance_managed_by,changes.bond_assignment_status,changes.bond_assignment_source,changes.finance_status,changes.last_meaningful_activity_at,changes.updated_at from jsonb_populate_record(null::public.transactions,to_jsonb(target)||p_transaction_changes) changes) where target.id=p_transaction and lower(coalesce(target.finance_type,'')) in ('bond','hybrid','combination') and target.registered_at is null and target.cancelled_at is null and target.archived_at is null and lower(coalesce(target.lifecycle_state,'')) not in ('registered','completed','cancelled','archived') returning target.* into saved;
 end if;
 if saved.id is null then raise exception 'This application could not be updated. No assignment changes were saved.' using errcode='42501'; end if;
 return jsonb_build_object('transaction',to_jsonb(saved),'applications',apps);
end $$;
revoke all on function public.bridge_save_bond_intake_assignment(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.bridge_save_bond_intake_assignment(uuid,jsonb,jsonb) to authenticated;

-- Manual receipt evidence contains no statements or bank credentials. It is
-- bound to one signed version and is readable/writable only through scoped RPCs.
create table public.bond_statement_receipts (
 id uuid primary key default gen_random_uuid(),
 bond_application_id uuid not null references public.bond_applications(id),
 submission_id uuid not null references public.transaction_bond_application_submissions(id),
 requirement_key text not null,
 received_at timestamptz not null,
 reference text not null check(length(trim(reference)) between 3 and 500),
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 unique(submission_id,requirement_key)
);
alter table public.bond_statement_receipts enable row level security;
revoke all on public.bond_statement_receipts from public,anon,authenticated;

create table public.bond_statement_receipt_events (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null,
 submission_id uuid not null,
 event_type text not null,
 evidence jsonb not null,
 actor_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.bond_statement_receipt_events enable row level security;
revoke all on public.bond_statement_receipt_events from public,anon,authenticated;
create function public.bridge_audit_bond_statement_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.bond_statement_receipt_events(receipt_id,submission_id,event_type,evidence,actor_id)
 values(case when tg_op='DELETE' then old.id else new.id end,case when tg_op='DELETE' then old.submission_id else new.submission_id end,tg_op,case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end,auth.uid());
 return null;
end $$;
create trigger bond_statement_receipt_audit after insert or update or delete on public.bond_statement_receipts for each row execute function public.bridge_audit_bond_statement_receipt();
revoke all on function public.bridge_audit_bond_statement_receipt() from public,anon,authenticated;

create table public.bond_manual_bank_submissions (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null references public.transactions(id),
 bond_application_id uuid not null references public.bond_applications(id),
 submission_id uuid not null references public.transaction_bond_application_submissions(id),
 bank_application_id uuid not null references public.transaction_bond_applications(id),
 context_hash text not null,
 bank_id text not null,
 bank_name text not null,
 submitted_at timestamptz not null,
 reference text not null,
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 unique(submission_id,bank_id,context_hash,submitted_at,reference),
 unique(bank_application_id)
);
create index bond_manual_bank_submissions_application_idx on public.bond_manual_bank_submissions(bond_application_id,submitted_at desc);
alter table public.bond_manual_bank_submissions enable row level security;
revoke all on public.bond_manual_bank_submissions from public,anon,authenticated;

create function public.bridge_bond_manual_actor(p_transaction uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and nullif(public.bridge_request_header('x-bridge-client-portal-token'),'') is null
 and nullif(public.bridge_request_header('x-bridge-bond-application-token'),'') is null
 and exists(select 1 from public.transactions t where t.id=p_transaction and (
  t.primary_bond_consultant_user_id=auth.uid()
  or public.bridge_can_manage_bond_assignment_phase5d(t.id)
  or exists(select 1 from public.transaction_bond_applications b where b.transaction_id=t.id
    and b.application_type='originator_intake' and b.assigned_user_id=auth.uid()
    and b.assignment_status in ('consultant_assigned','accepted','assigned'))
  or exists(select 1 from public.transaction_bond_originator_workspace_assignments allocation join public.transaction_bond_application_export_packages package on package.id=allocation.export_package_id
   where package.transaction_id=t.id and package.destination_key='bond_originator_intake' and package.status not in ('cancelled','superseded')
    and allocation.assigned_to_profile_id=auth.uid() and allocation.status in ('assigned','accepted'))))
$$;
create or replace function public.bridge_bond_wet_ink_consultant(p_application uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bond_applications a where a.id=p_application and public.bridge_bond_manual_actor(a.transaction_id))
$$;

create function public.bridge_assert_open_manual_bond(p_transaction uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t public.transactions;
begin
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'Only the assigned originator or manager can change this bond file.' using errcode='42501'; end if;
 select * into t from public.transactions where id=p_transaction for update;
 if t.id is null or lower(coalesce(t.finance_type,'')) not in ('bond','hybrid','combination') or t.registered_at is not null or t.cancelled_at is not null or t.archived_at is not null or lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','cancelled','archived') then raise exception 'An open deal with bond finance is required.' using errcode='23514'; end if;
end $$;
revoke all on function public.bridge_assert_open_manual_bond(uuid) from public,anon,authenticated;

create function public.bridge_prepare_originator_bond_application(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.transactions; a public.bond_applications; f public.onboarding_form_data;
begin
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'Only the assigned originator or their manager can prepare this application.' using errcode='42501'; end if;
 select * into t from public.transactions where id=p_transaction for update;
 if lower(coalesce(t.finance_type,'')) not in ('bond','hybrid','combination') or t.registered_at is not null or t.cancelled_at is not null or t.archived_at is not null or lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','cancelled','archived') then raise exception 'An open deal with bond finance is required.' using errcode='23514'; end if;
 select * into a from public.bond_applications where transaction_id=t.id order by created_at desc limit 1;
 if a.id is null then
  select * into f from public.onboarding_form_data where transaction_id=t.id order by updated_at desc limit 1 for update;
  if f.id is null then insert into public.onboarding_form_data(transaction_id,purchaser_type) values(t.id,coalesce(nullif(to_jsonb(t)->>'purchaser_type',''),'individual')) returning * into f; end if;
  insert into public.bond_applications(transaction_id,onboarding_form_data_id,metadata) values(t.id,f.id,'{"source":"originator_manual_referral"}') returning * into a;
  insert into public.bond_application_participants(bond_application_id,participant_key,role,status) values(a.id,'primary_applicant:1','primary_applicant','in_progress');
 end if;
 if a.status='cancelled' then raise exception 'This application was cancelled. Review the referral before continuing.' using errcode='23514'; end if;
 return jsonb_build_object('applicationId',a.id,'transactionId',t.id);
end $$;

-- Add receipt evidence to the existing server-owned review fingerprint. Any
-- changed/revoked receipt invalidates review, just like a changed document.
alter function public.bridge_bond_submission_review_context(uuid) rename to bridge_bond_submission_review_context_without_receipts;
revoke all on function public.bridge_bond_submission_review_context_without_receipts(uuid) from public,anon,authenticated;
create function public.bridge_bond_submission_review_context(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; h text;
begin
 c:=public.bridge_bond_submission_review_context_without_receipts(p_transaction);
 h:=encode(extensions.digest(public.bridge_bond_wet_ink_canonical(jsonb_build_object('baseHash',c->>'contextHash','statementReceipts',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.bond_statement_receipts r where r.submission_id::text=c->>'submissionId'),'[]'))),'sha256'),'hex');
 c:=jsonb_set(c,'{contextHash}',to_jsonb(h));
 if c->'review'<>'null'::jsonb then c:=jsonb_set(c,'{review,current}',to_jsonb(c#>>'{review,context_hash}'=h)); end if;
 return c;
end $$;

create function public.bridge_record_bond_statement_receipt(p_transaction uuid,p_submission uuid,p_requirement_key text,p_received_at timestamptz,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; r public.bond_statement_receipts;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This statement receipt is not accessible.' using errcode='42501'; end if;
 select * into a from public.bond_applications where transaction_id=p_transaction for update;
 if a.active_submission_id is distinct from p_submission or not exists(select 1 from public.transaction_bond_application_submissions s where s.id=p_submission and s.bond_application_id=a.id and s.status in ('signed','submitted') and s.source_application_revision=a.revision) then raise exception 'The signed application changed. Refresh before confirming receipt.' using errcode='40001'; end if;
 if not exists(select 1 from public.bond_application_document_requirements q where q.bond_application_id=a.id and q.requirement_key=p_requirement_key and q.status not in ('inactive','superseded','waived') and (q.canonical_document_type||' '||q.requirement_key) ~* '(bank.?statement|bankStatement)') then raise exception 'Choose a current bank-statement requirement.' using errcode='23514'; end if;
 if p_received_at is null or p_received_at>now() or length(trim(coalesce(p_reference,''))) not between 3 and 500 then raise exception 'Enter the receipt date and a reference to the external channel used. Do not enter bank credentials.' using errcode='23514'; end if;
 insert into public.bond_statement_receipts(bond_application_id,submission_id,requirement_key,received_at,reference,recorded_by) values(a.id,p_submission,p_requirement_key,p_received_at,trim(p_reference),auth.uid())
 on conflict(submission_id,requirement_key) do update set received_at=excluded.received_at,reference=excluded.reference,recorded_by=excluded.recorded_by,recorded_at=now() returning * into r;
 return to_jsonb(r);
end $$;
create function public.bridge_revoke_bond_statement_receipt(p_transaction uuid,p_submission uuid,p_requirement_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This statement receipt is not accessible.' using errcode='42501'; end if;
 perform 1 from public.bond_applications where transaction_id=p_transaction for update;
 delete from public.bond_statement_receipts r using public.bond_applications a where r.bond_application_id=a.id and a.transaction_id=p_transaction and r.submission_id=p_submission and r.requirement_key=p_requirement_key;
end $$;

-- Retain the rule's evidence quantity in the canonical requirement so bank
-- readiness does not reduce three payslips to a single uploaded file.
alter function public.bridge_reconcile_buyer_bond_application_documents(jsonb) rename to bridge_reconcile_buyer_bond_documents_without_counts;
revoke all on function public.bridge_reconcile_buyer_bond_documents_without_counts(jsonb) from public,anon,authenticated;
create function public.bridge_reconcile_buyer_bond_application_documents(p_requirements jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; item jsonb; result jsonb; minimum integer;
begin
 result:=public.bridge_reconcile_buyer_bond_documents_without_counts(p_requirements);
 a:=public.bridge_buyer_bond_application_runtime_id();
 for item in select * from jsonb_array_elements(p_requirements) loop
  minimum:=greatest(1,least(100,coalesce((item->>'minimumFileCount')::integer,1)));
  update public.bond_application_document_requirements r set metadata=r.metadata||jsonb_build_object('minimumFileCount',minimum,'title',item->>'title','evidencePeriodMonths',item->'evidencePeriodMonths')
   where r.bond_application_id=a and r.requirement_key=item->>'key' and r.source='guided_rule' and r.status not in ('inactive','superseded');
 end loop;
 return public.bridge_buyer_bond_application_runtime_context();
end $$;
revoke all on function public.bridge_reconcile_buyer_bond_application_documents(jsonb) from public;
grant execute on function public.bridge_reconcile_buyer_bond_application_documents(jsonb) to anon,authenticated;

-- Requests reuse the buyer's canonical upload/review path; no export package is
-- needed merely to ask for a missing primary-applicant document.
create function public.bridge_request_manual_bond_document(p_transaction uuid,p_request uuid,p_type text,p_title text,p_instruction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; p public.bond_application_participants; d public.document_definitions; canonical_id uuid; req_id uuid; key text;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This bond file is not accessible.' using errcode='42501'; end if;
 perform 1 from public.transactions where id=p_transaction for update;
 select * into a from public.bond_applications where transaction_id=p_transaction for update;
 if a.id is null or a.status='cancelled' then raise exception 'Prepare an active buyer application first.' using errcode='23514'; end if;
 if p_request is null or length(trim(coalesce(p_title,''))) not between 3 and 150 or length(trim(coalesce(p_instruction,''))) not between 3 and 1000 then raise exception 'Enter a document title and clear instructions for the buyer.' using errcode='23514'; end if;
 select * into d from public.document_definitions definition where definition.key=p_type and definition.is_active;
 if d.key is null or not(p_type=any(array['buyer_id_document','buyer_proof_of_address','payslips','employment_contract','proof_of_income','proof_of_funds','tax_documents','financial_statements','offer_to_purchase','assets_liabilities_statement'])) then raise exception 'Choose a supported buyer document type.' using errcode='23514'; end if;
 select * into p from public.bond_application_participants where bond_application_id=a.id and role='primary_applicant' and removed_at is null;
 if p.id is null then raise exception 'The primary applicant is missing. Refresh the application.' using errcode='23514'; end if;
 key:='bond_manual_request_'||p_request::text;
 select id into req_id from public.transaction_required_documents where transaction_id=p_transaction and document_key=key;
 if req_id is not null then return jsonb_build_object('requirementId',req_id); end if;
 insert into public.document_requirement_instances(document_definition_key,context_type,context_id,transaction_id,pack_key,requirement_level,requested_from_role,visible_to_roles,uploadable_by_roles,reviewer_role,resolver_version,source_system)
 values(d.key,'transaction',p_transaction,p_transaction,d.pack_key,'required','buyer',array['buyer','agent','bond_originator'],array['buyer'],'bond_originator','bond_manual_v1','bond_originator_manual') returning id into canonical_id;
 insert into public.transaction_required_documents(transaction_id,document_key,document_label,is_required,is_uploaded,required_from_role,visibility_scope,reconciliation_source,group_key,group_label,canonical_requirement_instance_id)
 values(p_transaction,key,trim(p_title),true,false,'buyer','shared','bond_originator_manual','finance','Bond application documents',canonical_id) returning id into req_id;
 insert into public.bond_application_document_requirements(bond_application_id,participant_id,requirement_key,canonical_document_type,rule_set_version,required_before,satisfaction_mode,source,transaction_required_document_id,metadata)
 values(a.id,p.id,key,p_type,'bond_manual_v1','required_before_bank_submission','accepted','originator_request',req_id,jsonb_build_object('required',true,'instruction',trim(p_instruction),'requestedBy',auth.uid()));
 return jsonb_build_object('requirementId',req_id);
end $$;

create function public.bridge_review_manual_bond_document(p_transaction uuid,p_requirement uuid,p_document uuid,p_expected_path text,p_action text,p_feedback text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; q public.bond_application_document_requirements; t public.transaction_required_documents; d public.documents; owner public.bond_application_participants; next_status text; review_id uuid;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'Only the assigned originator or manager can review this evidence.' using errcode='42501'; end if;
 if p_action not in ('approve','reject') or (p_action='reject' and length(trim(coalesce(p_feedback,'')))<3) or length(coalesce(p_feedback,''))>1000 then raise exception 'Choose approve or request replacement, with a clear reason for replacement.' using errcode='23514'; end if;
 perform 1 from public.transactions where id=p_transaction for update;
 select * into a from public.bond_applications where transaction_id=p_transaction for update;
 select * into q from public.bond_application_document_requirements where id=p_requirement and bond_application_id=a.id and status not in ('inactive','superseded','waived') for update;
 if q.id is null or (q.canonical_document_type||' '||q.requirement_key) ~* '(bank.?statement|bankStatement)' then raise exception 'Choose a current supporting-document requirement. Statements use external receipt confirmation.' using errcode='23514'; end if;
 select * into t from public.transaction_required_documents where id=q.transaction_required_document_id and transaction_id=p_transaction for update;
 select * into d from public.documents where id=p_document and transaction_id=p_transaction for update;
 select * into owner from public.bond_application_participants where id=q.participant_id and removed_at is null;
 if t.canonical_requirement_instance_id is null or d.id is null or coalesce(t.uploaded_document_id,q.linked_document_id) is distinct from p_document or d.canonical_requirement_instance_id is distinct from t.canonical_requirement_instance_id or d.file_path is distinct from p_expected_path or nullif(d.file_path,'') is null
  or coalesce(to_jsonb(d)->>'archived_at',to_jsonb(d)->>'deleted_at','')<>'' or not coalesce(d.is_client_visible,true) or d.visibility_scope not in ('shared','client','client_visible')
  or lower(coalesce(d.client_recipient_role,'')) not in ('','buyer','client','both','all','shared')
  or lower(coalesce(d.uploaded_by_party,'')) not in ('','buyer','client','primary_applicant','co_applicant','surety')
  or lower(coalesce(to_jsonb(d)->>'category','')) ~ '(seller|attorney)'
  or (q.participant_id is not null and (owner.id is null
   or coalesce(d.metadata->>'participant_key',d.metadata->>'participantKey',case when owner.role='primary_applicant' then owner.participant_key end) is distinct from owner.participant_key
   or coalesce(d.metadata->>'participant_id',d.metadata->>'participantId',case when owner.role='primary_applicant' then owner.id::text end) is distinct from owner.id::text)) then raise exception 'The upload or applicant changed. Refresh and review the current file.' using errcode='40001'; end if;
 next_status:=case when p_action='approve' then 'approved' else 'rejected' end;
 perform 1 from public.document_requirement_instances where id=t.canonical_requirement_instance_id for update;
 insert into public.document_requirement_reviews(requirement_instance_id,document_id,review_status,reviewer_role,reviewer_user_id,review_notes,rejection_reason,reviewed_at)
 values(t.canonical_requirement_instance_id,d.id,case when p_action='approve' then 'approved' else 'needs_reupload' end,'bond_originator',auth.uid(),case when p_action='approve' then nullif(trim(p_feedback),'') end,case when p_action='reject' then trim(p_feedback) end,now()) returning id into review_id;
 update public.documents set status=next_status,review_status=next_status where id=d.id;
 update public.document_requirement_instances set status=next_status,rejection_reason=case when p_action='reject' then trim(p_feedback) end,satisfied_by_document_id=d.id,updated_at=now() where id=t.canonical_requirement_instance_id;
 update public.transaction_required_documents set status=next_status,notes=case when p_action='reject' then trim(p_feedback) end,verified_at=case when p_action='approve' then now() end,rejected_at=case when p_action='reject' then now() end,updated_at=now() where id=t.id;
 update public.bond_application_document_requirements set status=case when p_action='approve' then 'satisfied' else 'active' end,linked_document_id=d.id,updated_at=now() where id=q.id;
 insert into public.document_requirement_events(requirement_instance_id,event_type,actor_role,actor_user_id,message,metadata_json)
 values(t.canonical_requirement_instance_id,case when p_action='approve' then 'approved' else 'needs_reupload' end,'bond_originator',auth.uid(),case when p_action='approve' then 'Originator approved the current supporting document.' else trim(p_feedback) end,jsonb_build_object('source','bond_originator_manual','reviewId',review_id,'documentId',d.id));
 return jsonb_build_object('reviewId',review_id,'status',next_status,'documentId',d.id);
end $$;

-- Authoritative readiness is reused by both the checklist and record command.
-- A browser-supplied ready flag or a satisfied requirement alone is insufficient.
create function public.bridge_bond_manual_blockers(p_application uuid,p_require_review boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; s public.transaction_bond_application_submissions; q record; signer jsonb; check_row jsonb; c jsonb; problems jsonb:='[]'; n integer;
begin
 select * into a from public.bond_applications where id=p_application;
 if a.id is null or not public.bridge_bond_manual_actor(a.transaction_id) then raise exception 'This application is not accessible.' using errcode='42501'; end if;
 if exists(select 1 from public.transactions t where t.id=a.transaction_id and (t.registered_at is not null or t.cancelled_at is not null or t.archived_at is not null or lower(coalesce(t.lifecycle_state,'')) in ('registered','completed','cancelled','archived') or lower(coalesce(t.finance_type,'')) not in ('bond','hybrid','combination'))) then problems:=problems||jsonb_build_array(jsonb_build_object('code','open_bond_deal_required','message','Confirm an open deal with bond finance.')); end if;
 select * into s from public.transaction_bond_application_submissions where id=a.active_submission_id and bond_application_id=a.id and transaction_id=a.transaction_id;
 if s.id is null or s.status not in ('signed','submitted') or s.signed_at is null or s.source_application_revision is distinct from a.revision then return problems||jsonb_build_array(jsonb_build_object('code','current_signature_required','message','Complete and accept the signed copy of the current application version.')); end if;
 if s.metadata->>'signingMethod' is distinct from 'wet_ink_upload' or (public.bridge_bond_submission_pack_original(a.transaction_id)->'originalEvidence'->>'status') is distinct from 'accepted' then problems:=problems||jsonb_build_array(jsonb_build_object('code','accepted_original_required','message','Review and accept the original signed paper application.')); end if;
 if not exists(select 1 from public.bond_wet_ink_versions v join public.bond_wet_ink_uploads u on u.id::text=s.metadata->>'originalUploadId' join public.documents d on d.id=s.signed_document_id
  where v.submission_id=s.id and v.status='accepted' and v.snapshot_json=s.snapshot_json and v.snapshot_hash=s.snapshot_hash and s.selected_bank_ids=s.snapshot_json->'selectedBanks' and v.source_revision=a.revision
  and u.version_id=v.id and u.document_id=d.id and u.file_path=d.file_path and u.status='accepted' and d.transaction_id=a.transaction_id
  and coalesce(to_jsonb(d)->>'review_status',d.status) not in ('rejected','superseded','cancelled','inactive') and coalesce(to_jsonb(d)->>'archived_at',to_jsonb(d)->>'deleted_at','')='') then problems:=problems||jsonb_build_array(jsonb_build_object('code','signed_version_changed','message','The accepted signed original or fixed answers changed. Obtain and review the current signed version.')); end if;
 if coalesce(jsonb_array_length(s.selected_bank_ids),0)=0 then problems:=problems||jsonb_build_array(jsonb_build_object('code','selected_banks_required','message','Select and authorise banks in the signed application.')); end if;
 if coalesce(jsonb_array_length(s.signer_manifest_json),0)=0 or exists(select 1 from public.bond_application_participants p where p.bond_application_id=a.id and p.removed_at is null and p.status not in ('signed','completed','removed')) then problems:=problems||jsonb_build_array(jsonb_build_object('code','participants_incomplete','message','Every required applicant must finish and sign their details.')); end if;
 if s.metadata#>'{signatureChecks,versionMatches}' is distinct from 'true'::jsonb or s.metadata#>'{signatureChecks,allPagesPresent}' is distinct from 'true'::jsonb or s.metadata#>'{signatureChecks,noAlterations}' is distinct from 'true'::jsonb then problems:=problems||jsonb_build_array(jsonb_build_object('code','signature_checks_required','message','Verify all pages, the application version and unaltered answers.')); end if;
 for signer in select * from jsonb_array_elements(coalesce(s.signer_manifest_json,'[]')) loop
  select value into check_row from jsonb_array_elements(coalesce(s.metadata#>'{signatureChecks,signers}','[]')) where value->>'participantKey'=signer->>'participantKey';
  if check_row->'signaturePresent' is distinct from 'true'::jsonb or check_row->'identityChecked' is distinct from 'true'::jsonb or coalesce(check_row->>'signedDate','') !~ '^\d{4}-\d{2}-\d{2}$' then problems:=problems||jsonb_build_array(jsonb_build_object('code','applicant_signature_required','message','Verify the signature and identity for '||coalesce(signer->>'fullName','every applicant')||'.')); end if;
 end loop;
 for q in select r.*,t.canonical_requirement_instance_id,t.uploaded_document_id,t.document_label from public.bond_application_document_requirements r left join public.transaction_required_documents t on t.id=r.transaction_required_document_id where r.bond_application_id=a.id and r.status not in ('inactive','superseded','waived') and r.required_before<>'requested_after_originator_review' and coalesce(r.metadata->>'required',t.is_required::text,'true')<>'false' loop
  if (q.canonical_document_type||' '||q.requirement_key) ~* '(bank.?statement|bankStatement)' then
   n:=case when exists(select 1 from public.bond_statement_receipts r where r.submission_id=s.id and r.requirement_key=q.requirement_key) then greatest(1,coalesce((q.metadata->>'minimumFileCount')::integer,1)) else 0 end;
  else
   select count(distinct d.id) into n from public.documents d where d.transaction_id=a.transaction_id and (d.id=q.linked_document_id or d.id=q.uploaded_document_id or (q.canonical_requirement_instance_id is not null and d.canonical_requirement_instance_id=q.canonical_requirement_instance_id))
    and coalesce(to_jsonb(d)->>'review_status',d.status) in ('approved','accepted','verified') and nullif(d.file_path,'') is not null
    and coalesce(to_jsonb(d)->>'archived_at',to_jsonb(d)->>'deleted_at','')='' and coalesce(d.is_client_visible,true) and d.visibility_scope in ('shared','client','client_visible')
    and lower(coalesce(d.client_recipient_role,'')) in ('','buyer','client','both','all','shared')
    and lower(coalesce(d.uploaded_by_party,'')) in ('','buyer','client','primary_applicant','co_applicant','surety')
    and lower(coalesce(to_jsonb(d)->>'category','')) !~ '(seller|attorney)'
    and (q.participant_id is null or exists(select 1 from public.bond_application_participants owner where owner.id=q.participant_id
     and coalesce(to_jsonb(d)#>>'{metadata,participant_key}',to_jsonb(d)#>>'{metadata,participantKey}',to_jsonb(d)->>'participant_key',case when owner.role='primary_applicant' then owner.participant_key end)=owner.participant_key
     and coalesce(to_jsonb(d)#>>'{metadata,participant_role}',to_jsonb(d)#>>'{metadata,participantRole}',case when d.uploaded_by_party in ('co_applicant','surety') then d.uploaded_by_party else owner.role end)=owner.role))
    and (q.participant_id is null or coalesce(to_jsonb(d)#>>'{metadata,participant_id}',to_jsonb(d)->>'participant_id',case when exists(select 1 from public.bond_application_participants p where p.id=q.participant_id and p.role='primary_applicant') then q.participant_id::text end)=q.participant_id::text);
  end if;
  if n<greatest(1,coalesce((q.metadata->>'minimumFileCount')::integer,1)) then problems:=problems||jsonb_build_array(jsonb_build_object('code','approved_document_required','requirementKey',q.requirement_key,'message',coalesce(q.document_label,q.requirement_key)||': supply and approve the required evidence, or confirm statement receipt through your external channel.')); end if;
 end loop;
 if exists(select 1 from public.bond_application_change_requests r where r.bond_application_id=a.id and r.status not in ('resolved','withdrawn','superseded','cancelled')) then problems:=problems||jsonb_build_array(jsonb_build_object('code','corrections_pending','message','Resolve the requested corrections and obtain a new signed version.')); end if;
 if exists(select 1 from public.transaction_bond_originator_document_requests r where r.bond_application_id=a.id and r.status not in ('accepted','cancelled','withdrawn','superseded')) then problems:=problems||jsonb_build_array(jsonb_build_object('code','document_requests_pending','message','Review the outstanding requested documents.')); end if;
 if p_require_review then
  c:=public.bridge_bond_submission_review_context(a.transaction_id);
  if c#>'{review,current}' is distinct from 'true'::jsonb then problems:=problems||jsonb_build_array(jsonb_build_object('code','consultant_review_required','message','Review the current application, documents, signatures and bank forms.')); end if;
 end if;
 return problems;
end $$;

alter function public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb) rename to bridge_record_bond_submission_review_unchecked;
revoke all on function public.bridge_record_bond_submission_review_unchecked(uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.bridge_record_bond_submission_review(p_transaction uuid,p_submission uuid,p_context_hash text,p_checks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; issues jsonb;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This application is not accessible.' using errcode='42501'; end if;
 perform 1 from public.transactions where id=p_transaction for update;
 select * into a from public.bond_applications where transaction_id=p_transaction for update;
 issues:=public.bridge_bond_manual_blockers(a.id,false);
 if jsonb_array_length(issues)>0 then raise exception '%',issues->0->>'message' using errcode='23514'; end if;
 return public.bridge_record_bond_submission_review_unchecked(p_transaction,p_submission,p_context_hash,p_checks);
end $$;

create function public.bridge_bond_manual_context(p_transaction uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications;
begin
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'This bond file is not accessible.' using errcode='42501'; end if;
 select * into a from public.bond_applications where transaction_id=p_transaction order by created_at desc limit 1;
 return jsonb_build_object('applicationId',a.id,'submissionId',a.active_submission_id,'externalReceipts',coalesce((select jsonb_agg(jsonb_build_object('requirementKey',r.requirement_key,'submissionId',r.submission_id,'receivedAt',r.received_at,'status','verified','reference',r.reference)) from public.bond_statement_receipts r where r.submission_id=a.active_submission_id),'[]'),
 'requirements',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'key',q.requirement_key,'title',coalesce(t.document_label,q.requirement_key),'instruction',q.metadata->>'instruction','canonicalId',t.canonical_requirement_instance_id,'document',case when d.id is not null then jsonb_build_object('id',d.id,'name',d.name,'file_path',d.file_path,'file_bucket',d.file_bucket,'status',coalesce(to_jsonb(d)->>'review_status',d.status)) else null end)) from public.bond_application_document_requirements q left join public.transaction_required_documents t on t.id=q.transaction_required_document_id left join public.documents d on d.id=coalesce(t.uploaded_document_id,q.linked_document_id) and d.transaction_id=p_transaction where q.bond_application_id=a.id and q.status not in ('inactive','superseded','waived')),'[]'),
 'blockers',case when a.id is null then jsonb_build_array(jsonb_build_object('code','application_required','message','Prepare the buyer application, then ask the buyer to complete it.')) else public.bridge_bond_manual_blockers(a.id) end,
 'submissions',coalesce((select jsonb_agg(to_jsonb(b) order by b.submitted_at desc) from public.bond_manual_bank_submissions b where b.bond_application_id=a.id),'[]'));
end $$;

create function public.bridge_record_manual_bond_submission(p_transaction uuid,p_submission uuid,p_context_hash text,p_bank_id text,p_bank_name text,p_submitted_at timestamptz,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.bond_applications; s public.transaction_bond_application_submissions; assignment public.transaction_bond_applications; prior public.bond_manual_bank_submissions; w public.transaction_finance_workflows; b uuid; c jsonb; issues jsonb;
begin
 perform public.bridge_assert_open_manual_bond(p_transaction);
 if not public.bridge_bond_manual_actor(p_transaction) then raise exception 'Only the assigned originator or manager can record this submission.' using errcode='42501'; end if;
 -- All workflow commands lock in transaction -> application order.
 perform 1 from public.transactions where id=p_transaction for update;
 select * into a from public.bond_applications where transaction_id=p_transaction for update;
 if a.active_submission_id is distinct from p_submission then raise exception 'The signed application changed. Refresh before recording submission.' using errcode='40001'; end if;
 select * into s from public.transaction_bond_application_submissions where id=p_submission;
 select coalesce(bank->>'name',bank->>'label',replace(coalesce(bank->>'id',bank->>'key',bank#>>'{}'),'_',' ')) into p_bank_name from jsonb_array_elements(coalesce(s.selected_bank_ids,'[]')) bank where coalesce(bank->>'id',bank->>'key',bank#>>'{}')=p_bank_id;
 if p_bank_name is null then raise exception 'This bank was not authorised in the signed application.' using errcode='23514'; end if;
 select * into prior from public.bond_manual_bank_submissions where submission_id=p_submission and bank_id=p_bank_id and context_hash=p_context_hash and submitted_at=p_submitted_at and reference=trim(p_reference);
 if prior.id is not null then return to_jsonb(prior); end if;
 if p_submitted_at is null or p_submitted_at>now() or length(trim(coalesce(p_reference,''))) not between 1 and 200 or length(trim(coalesce(p_bank_name,''))) not between 1 and 100 then raise exception 'Enter the bank, actual submission date and bank reference.' using errcode='23514'; end if;
 select * into s from public.transaction_bond_application_submissions where id=p_submission;
 if (p_submitted_at at time zone 'Africa/Johannesburg')::date < (s.signed_at at time zone 'Africa/Johannesburg')::date then raise exception 'The bank submission date must be on or after the current application was signed.' using errcode='23514'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(s.selected_bank_ids,'[]')) bank where coalesce(bank->>'id',bank->>'key',bank#>>'{}')=p_bank_id) then raise exception 'This bank was not authorised in the signed application.' using errcode='23514'; end if;
 perform 1 from public.bond_application_document_requirements where bond_application_id=a.id order by id for share;
 perform 1 from public.transaction_required_documents where transaction_id=p_transaction order by id for share;
 perform 1 from public.documents where transaction_id=p_transaction order by id for share;
 issues:=public.bridge_bond_manual_blockers(a.id);
 if jsonb_array_length(issues)>0 then raise exception '%',issues->0->>'message' using errcode='23514',detail=issues::text; end if;
 c:=public.bridge_bond_submission_review_context(p_transaction);
 if c->>'contextHash' is distinct from p_context_hash then raise exception 'Application or documents changed. Refresh and review before recording submission.' using errcode='40001'; end if;
 insert into public.transaction_finance_workflows(transaction_id,workflow_type,current_stage,status,last_updated_by) values(p_transaction,'bond_hybrid','intake','active',auth.uid()) on conflict(transaction_id,workflow_type) do nothing;
 select * into w from public.transaction_finance_workflows where transaction_id=p_transaction and workflow_type='bond_hybrid' for update;
 select * into assignment from public.transaction_bond_applications where transaction_id=p_transaction and application_type='originator_intake' order by created_at desc limit 1;
 insert into public.transaction_bond_applications(transaction_id,workflow_id,bank_name,application_type,status,submitted_at,reference_number,notes,created_by,updated_by,assigned_organisation_id,assigned_user_id,originator_organisation_id,submitted_by,application_reference,assigned_region_id,assigned_workspace_unit_id,assigned_branch_id,assigned_team_id)
 values(p_transaction,w.id,trim(p_bank_name),'bank_application','submitted',p_submitted_at,trim(p_reference),'Recorded external bank submission. Signed application: '||p_submission::text,auth.uid(),auth.uid(),coalesce(assignment.assigned_organisation_id,(select t.bond_workspace_id from public.transactions t where t.id=p_transaction)),coalesce(assignment.assigned_user_id,(select t.primary_bond_consultant_user_id from public.transactions t where t.id=p_transaction)),coalesce(assignment.assigned_organisation_id,(select t.bond_workspace_id from public.transactions t where t.id=p_transaction)),auth.uid(),trim(p_reference),assignment.assigned_region_id,assignment.assigned_workspace_unit_id,assignment.assigned_branch_id,assignment.assigned_team_id) returning id into b;
 insert into public.bond_manual_bank_submissions(transaction_id,bond_application_id,submission_id,bank_application_id,context_hash,bank_id,bank_name,submitted_at,reference,recorded_by) values(p_transaction,a.id,p_submission,b,p_context_hash,p_bank_id,trim(p_bank_name),p_submitted_at,trim(p_reference),auth.uid()) returning * into prior;
 if w.current_stage in ('intake','documents','documents_received','documents_reviewed','applications_submitted') then
  update public.transaction_finance_workflows set current_stage='submitted_to_banks',last_updated_by=auth.uid(),last_updated_at=now(),updated_at=now() where id=w.id;
 end if;
 insert into public.transaction_finance_workflow_events(workflow_id,from_stage,to_stage,event_type,notes,created_by) values(w.id,w.current_stage,case when w.current_stage in ('intake','documents','documents_received','documents_reviewed','applications_submitted') then 'submitted_to_banks' else w.current_stage end,'bank_submission_added','External submission recorded: '||trim(p_bank_name)||' / '||trim(p_reference),auth.uid());
 return to_jsonb(prior);
end $$;

-- Older export-package screens use the same readiness and recording commands.
-- Their package audit remains visible, and the buyer/finance workspace receives
-- the same canonical bank record as the transaction-based manual route.
create or replace function public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare package public.transaction_bond_application_export_packages; a public.bond_applications; issues jsonb; result jsonb;
begin
 select p.* into package from public.transaction_bond_application_export_packages p join public.transaction_bond_originator_workspace_assignments allocation on allocation.export_package_id=p.id
 where p.id=p_export_package_id and p.destination_key='bond_originator_intake' and p.status not in ('cancelled','superseded') and allocation.assigned_to_profile_id=auth.uid() and allocation.status in ('assigned','accepted');
 if package.id is null then raise exception 'Assigned application package not found.' using errcode='42501'; end if;
 perform public.bridge_assert_open_manual_bond(package.transaction_id);
 select * into a from public.bond_applications where id=package.bond_application_id and transaction_id=package.transaction_id for update;
 if a.id is null then raise exception 'The package application is no longer accessible.' using errcode='42501'; end if;
 issues:=public.bridge_bond_manual_blockers(a.id);
 insert into public.bond_application_submission_readiness_assessments(export_package_id,bond_application_id,assessed_by,application_revision,status,blockers,snapshot,metadata)
 values(package.id,a.id,auth.uid(),a.revision,case when jsonb_array_length(issues)=0 then 'ready' else 'blocked' end,issues,jsonb_build_object('applicationRevision',a.revision,'submissionId',a.active_submission_id,'automaticBankSubmission',false),'{"mode":"manual_external"}')
 on conflict(export_package_id,application_revision) do update set assessed_by=excluded.assessed_by,status=excluded.status,blockers=excluded.blockers,snapshot=excluded.snapshot,assessed_at=now(),metadata=excluded.metadata
 returning jsonb_build_object('status',status,'blockers',blockers,'snapshot',snapshot,'assessedAt',assessed_at) into result;
 return result;
end $$;
create or replace function public.bridge_record_bond_handoff_submission(p_export_package_id uuid,p_expected_submission_id uuid,p_lender_names text[],p_submitted_at timestamptz,p_external_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare package public.transaction_bond_application_export_packages; s public.transaction_bond_application_submissions; context jsonb; lender text; bank_id text; result jsonb;
begin
 perform public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id);
 select * into package from public.transaction_bond_application_export_packages where id=p_export_package_id;
 select submission.* into s from public.bond_applications a join public.transaction_bond_application_submissions submission on submission.id=a.active_submission_id where a.id=package.bond_application_id;
 if s.id is distinct from p_expected_submission_id then raise exception 'The signed application changed. Refresh before recording submission.' using errcode='40001'; end if;
 if coalesce(cardinality(p_lender_names),0)=0 then raise exception 'Choose at least one bank authorised in the signed application.' using errcode='23514'; end if;
 context:=public.bridge_bond_submission_review_context(package.transaction_id);
 foreach lender in array p_lender_names loop
  select coalesce(bank->>'id',bank->>'key',bank#>>'{}') into bank_id from jsonb_array_elements(s.selected_bank_ids) bank where lower(trim(lender))=lower(trim(coalesce(bank->>'name',bank->>'label',replace(coalesce(bank->>'id',bank->>'key',bank#>>'{}'),'_',' '))));
  if bank_id is null then raise exception 'Choose banks authorised in the signed application.' using errcode='23514'; end if;
  perform public.bridge_record_manual_bond_submission(package.transaction_id,s.id,context->>'contextHash',bank_id,lender,p_submitted_at,p_external_reference);
 end loop;
 -- Retain the established package history while preventing duplicate retries.
 select jsonb_build_object('id',r.id,'status',r.status,'submittedAt',r.submitted_at,'submissionId',s.id) into result from public.bond_application_external_submission_records r
 where r.export_package_id=package.id and r.metadata#>>'{submittedVersion,submissionId}'=s.id::text and r.lender_names=p_lender_names and r.external_reference=trim(p_external_reference) and r.submitted_at=p_submitted_at and r.metadata->>'manualContextHash'=context->>'contextHash' order by r.submitted_at desc limit 1;
 if result is not null then return result; end if;
 result:=public.bridge_record_bond_application_external_submission_phase8(p_export_package_id,p_lender_names,p_external_reference,null,p_notes);
 update public.bond_application_external_submission_records set submitted_at=p_submitted_at,metadata=coalesce(metadata,'{}')||jsonb_build_object('manualContextHash',context->>'contextHash') where id=(result->>'id')::uuid;
 return result||jsonb_build_object('submittedAt',p_submitted_at,'submissionId',s.id);
end $$;
revoke all on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid),public.bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamptz,text,text) from public,anon;
grant execute on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid),public.bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamptz,text,text) to authenticated;

-- The older bank-application form/API cannot bypass readiness on a matter
-- using a normalised application. Existing feedback/quote updates remain usable.
create function public.bridge_guard_manual_bond_bank_row() returns trigger language plpgsql security definer set search_path='' as $$
declare app_id uuid; issues jsonb;
begin
 if coalesce(new.application_type,'bank_application')<>'bank_application' then return new; end if;
 if tg_op='UPDATE' and exists(select 1 from public.bond_manual_bank_submissions r where r.bank_application_id=old.id)
  and (new.bank_name is distinct from old.bank_name or new.submitted_at is distinct from old.submitted_at or new.reference_number is distinct from old.reference_number) then raise exception 'The recorded external submission is fixed. Record feedback against it or create a submission for a new signed version.' using errcode='23514'; end if;
 if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from new.status) then
  select id into app_id from public.bond_applications where transaction_id=new.transaction_id;
  if app_id is not null then
   issues:=public.bridge_bond_manual_blockers(app_id);
   if jsonb_array_length(issues)>0 then raise exception '%',issues->0->>'message' using errcode='23514'; end if;
   if not exists(select 1 from public.bond_applications a join public.transaction_bond_application_submissions s on s.id=a.active_submission_id cross join lateral jsonb_array_elements(s.selected_bank_ids) bank where a.id=app_id and lower(trim(new.bank_name))=lower(trim(coalesce(bank->>'name',bank->>'label',replace(coalesce(bank->>'id',bank->>'key',bank#>>'{}'),'_',' '))))) then raise exception 'Choose a bank authorised in the current signed application.' using errcode='23514'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger bond_manual_bank_row_guard before insert or update on public.transaction_bond_applications for each row execute function public.bridge_guard_manual_bond_bank_row();
revoke all on function public.bridge_guard_manual_bond_bank_row() from public,anon,authenticated;

-- Replace the fixed blanket block with the same per-file checks used above.
create or replace function public.bridge_bond_reviewed_readiness_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare issues jsonb;
begin
 if new.status='ready' and public.bridge_bond_reviewed_release_pending(new.bond_application_id) then
  issues:=public.bridge_bond_manual_blockers(new.bond_application_id);
  if jsonb_array_length(issues)>0 then new.status:='blocked'; new.blockers:=coalesce(new.blockers,'[]')||issues; end if;
 end if;
 return new;
end $$;
create or replace function public.bridge_bond_reviewed_external_submission_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare issues jsonb;
begin
 if public.bridge_bond_reviewed_release_pending(new.bond_application_id) then
  issues:=public.bridge_bond_manual_blockers(new.bond_application_id);
  if jsonb_array_length(issues)>0 then raise exception '%',issues->0->>'message' using errcode='23514'; end if;
 end if;
 return new;
end $$;

-- Buyer runtime exposes only receipt status for their current primary requirements.
alter function public.bridge_buyer_bond_application_runtime_context() rename to bridge_buyer_bond_application_runtime_context_without_receipts;
revoke all on function public.bridge_buyer_bond_application_runtime_context_without_receipts() from public,anon,authenticated;
create function public.bridge_buyer_bond_application_runtime_context()
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; a uuid;
begin
 c:=public.bridge_buyer_bond_application_runtime_context_without_receipts();
 a:=public.bridge_buyer_bond_application_runtime_id();
 c:=jsonb_set(c,'{additionalRequirements}',coalesce((select jsonb_agg(item||jsonb_build_object('description',coalesce((select q.metadata->>'instruction' from public.bond_application_document_requirements q where q.bond_application_id=a and q.requirement_key=item->>'key' limit 1),''))) from jsonb_array_elements(c->'additionalRequirements') item),'[]'));
 return c||jsonb_build_object('externalReceipts',coalesce((select jsonb_agg(jsonb_build_object('requirementKey',r.requirement_key,'submissionId',r.submission_id,'receivedAt',r.received_at,'status','verified')) from public.bond_statement_receipts r join public.bond_applications app on app.id=r.bond_application_id where app.id=a and app.active_submission_id=r.submission_id and exists(select 1 from public.bond_application_document_requirements q left join public.bond_application_participants p on p.id=q.participant_id where q.bond_application_id=a and q.requirement_key=r.requirement_key and (q.participant_id is null or p.role='primary_applicant'))),'[]'));
end $$;

revoke all on function public.bridge_bond_manual_actor(uuid),public.bridge_bond_manual_blockers(uuid,boolean) from public,anon,authenticated;
revoke all on function public.bridge_review_manual_bond_document(uuid,uuid,uuid,text,text,text),public.bridge_request_manual_bond_document(uuid,uuid,text,text,text),public.bridge_prepare_originator_bond_application(uuid),public.bridge_bond_manual_context(uuid),public.bridge_record_bond_statement_receipt(uuid,uuid,text,timestamptz,text),public.bridge_revoke_bond_statement_receipt(uuid,uuid,text),public.bridge_record_manual_bond_submission(uuid,uuid,text,text,text,timestamptz,text),public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb),public.bridge_bond_submission_review_context(uuid) from public,anon;
grant execute on function public.bridge_review_manual_bond_document(uuid,uuid,uuid,text,text,text),public.bridge_request_manual_bond_document(uuid,uuid,text,text,text),public.bridge_prepare_originator_bond_application(uuid),public.bridge_bond_manual_context(uuid),public.bridge_record_bond_statement_receipt(uuid,uuid,text,timestamptz,text),public.bridge_revoke_bond_statement_receipt(uuid,uuid,text),public.bridge_record_manual_bond_submission(uuid,uuid,text,text,text,timestamptz,text),public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb),public.bridge_bond_submission_review_context(uuid) to authenticated;
revoke all on function public.bridge_buyer_bond_application_runtime_context() from public;
grant execute on function public.bridge_buyer_bond_application_runtime_context() to anon,authenticated;
notify pgrst,'reload schema';
commit;
