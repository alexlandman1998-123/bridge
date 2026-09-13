begin;
create or replace function public.bridge_assess_bond_application_submission_readiness_phase7(
  p_export_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_application public.bond_applications%rowtype;
  v_blockers jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_status text;
begin
  if auth.uid() is null then raise exception 'An authenticated originator is required.' using errcode = '42501'; end if;
  select package.* into v_package
  from public.transaction_bond_application_export_packages package
  join public.transaction_bond_originator_workspace_assignments assignment on assignment.export_package_id = package.id
  where package.id = p_export_package_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
    and assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
  for update;
  if not found or v_package.bond_application_id is null then raise exception 'Assigned bond application package not found.' using errcode = '42501'; end if;
  select * into v_application from public.bond_applications where id = v_package.bond_application_id for update;
  if v_application.status in ('cancelled') then raise exception 'This application is no longer eligible for readiness assessment.' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_blockers from (
    select jsonb_build_object('key', 'outstanding_documents', 'count', count(*), 'message', 'Required documents are still outstanding.') item
    from public.bond_application_document_requirements requirement
    where requirement.bond_application_id = v_application.id and requirement.status = 'active'
      and requirement.required_before <> 'requested_after_originator_review'
      and coalesce(requirement.metadata->>'required', 'true') <> 'false'
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'pending_participants', 'count', count(*), 'message', 'Applicant or co-applicant actions are still pending.')
    from public.bond_application_participants participant
    where participant.bond_application_id = v_application.id and participant.status not in ('signed', 'completed', 'removed')
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'documents_awaiting_review', 'count', count(*), 'message', 'Originator-requested documents still need review.')
    from public.transaction_bond_originator_document_requests request
    where request.export_package_id = v_package.id and request.status not in ('accepted', 'cancelled', 'withdrawn', 'superseded')
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'current_signed_application_required', 'count', 1, 'message', 'Complete signatures on the current application revision before submission.')
    where not exists (
      select 1 from public.transaction_bond_application_submissions submission
      where submission.id = v_application.active_submission_id
        and submission.transaction_id = v_package.transaction_id
        and submission.bond_application_id = v_application.id
        and submission.status in ('signed', 'submitted')
        and submission.signed_at is not null
        and submission.source_application_revision = v_application.revision
        and jsonb_array_length(submission.signer_manifest_json) > 0
    )
    union all
    select jsonb_build_object('key', 'application_corrections', 'count', count(*), 'message', 'Application corrections need a new signed version and originator review.')
    from public.bond_application_change_requests correction
    where correction.bond_application_id = v_application.id and correction.status not in ('resolved','withdrawn','superseded','cancelled')
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'participants_required', 'count', 1, 'message', 'Add the required applicants before submission.')
    where not exists (select 1 from public.bond_application_participants participant where participant.bond_application_id = v_application.id and participant.status <> 'removed')
  ) blockers;
  v_status := case when jsonb_array_length(v_blockers) = 0 then 'ready' else 'blocked' end;
  v_snapshot := jsonb_build_object('applicationStatus', v_application.status, 'applicationRevision', v_application.revision, 'blockerCount', jsonb_array_length(v_blockers), 'bankWorkflowUnchanged', true, 'automaticBankSubmission', false);
  insert into public.bond_application_submission_readiness_assessments (export_package_id, bond_application_id, assessed_by, application_revision, status, blockers, snapshot, metadata)
  values (v_package.id, v_application.id, auth.uid(), v_application.revision, v_status, v_blockers, v_snapshot, jsonb_build_object('phase', 'bond_application_portal_phase7'))
  on conflict (export_package_id, application_revision) do update
  set assessed_by = excluded.assessed_by, status = excluded.status, blockers = excluded.blockers, snapshot = excluded.snapshot, assessed_at = now(), metadata = excluded.metadata
  returning jsonb_build_object('status', status, 'blockers', blockers, 'snapshot', snapshot, 'assessedAt', assessed_at) into v_snapshot;
  return v_snapshot;
end;
$$;

create or replace function public.bridge_bond_application_external_submission_view_phase8() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('version','bond_application_portal_phase8','items',coalesce(jsonb_agg(jsonb_build_object('exportPackageId',package.id,'records',coalesce(records.items,'[]'::jsonb)) order by package.created_at desc),'[]'::jsonb)) from public.transaction_bond_originator_workspace_assignments assignment join public.transaction_bond_application_export_packages package on package.id=assignment.export_package_id left join lateral (select jsonb_agg(jsonb_build_object('id',record.id,'lenderNames',record.lender_names,'externalReference',record.external_reference,'submittedAt',record.submitted_at,'status',record.status,'confirmationDocumentId',record.confirmation_document_id,'submittedBy',record.submitted_by,'notes',record.notes,'version',record.metadata->'submittedVersion') order by record.submitted_at desc) items from public.bond_application_external_submission_records record where record.export_package_id=package.id) records on true where assignment.assigned_to_profile_id=auth.uid() and assignment.status in ('assigned','accepted') and package.destination_key='bond_originator_intake';
$$;

-- Version evidence is copied at insertion and never inferred later from a mutable assessment.
create or replace function public.bridge_capture_bond_handoff_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.transaction_bond_application_submissions%rowtype; a public.bond_applications%rowtype;
begin
 select * into a from public.bond_applications where id = new.bond_application_id for update;
 select * into s from public.transaction_bond_application_submissions where id = a.active_submission_id;
 if s.id is null or s.status not in ('signed','submitted') or s.signed_at is null or s.source_application_revision is distinct from a.revision then
   raise exception 'A current signed application version is required.';
 end if;
 if coalesce(cardinality(new.lender_names),0) = 0 or exists(select 1 from unnest(new.lender_names) lender where nullif(trim(lender),'') is null) then
   raise exception 'Add at least one lender or bank name.';
 end if;
 if new.confirmation_document_id is not null and not exists(select 1 from public.documents d where d.id = new.confirmation_document_id and d.transaction_id = s.transaction_id) then
   raise exception 'Confirmation document belongs to another transaction.';
 end if;
 new.metadata := coalesce(new.metadata,'{}') || jsonb_build_object('recordedAt',now(),'submittedVersion',jsonb_build_object(
   'submissionId',s.id,'submissionVersion',s.submission_version,'applicationRevision',a.revision,
   'snapshotHash',s.snapshot_hash,'signedDocumentId',s.signed_document_id,'signedAt',s.signed_at));
 return new;
end $$;
create trigger bond_handoff_capture_version before insert on public.bond_application_external_submission_records
for each row execute function public.bridge_capture_bond_handoff_version();
revoke all on function public.bridge_capture_bond_handoff_version() from public,anon,authenticated;

-- Review changes are preserved even when a replacement is uploaded later.
create or replace function public.bridge_audit_bond_document_review()
returns trigger language plpgsql set search_path = public as $$
begin
 if old.linked_document_id is distinct from new.linked_document_id and new.linked_document_id is not null and old.status not in ('withdrawn','cancelled') then
   new.status := 'awaiting_review'; new.reviewed_at := null; new.reviewed_by := null; new.resolved_at := null;
 end if;
 if old.status is distinct from new.status or old.linked_document_id is distinct from new.linked_document_id then
   new.metadata := coalesce(new.metadata,'{}') || jsonb_build_object('reviewHistory',coalesce(old.metadata->'reviewHistory','[]') || jsonb_build_array(jsonb_build_object(
     'fromStatus',old.status,'status',new.status,'documentId',new.linked_document_id,'actorId',auth.uid(),'at',now(),'feedback',new.buyer_safe_feedback)));
 end if;
 return new;
end $$;
create trigger bond_handoff_document_review_audit before update on public.transaction_bond_originator_document_requests
for each row execute function public.bridge_audit_bond_document_review();

create or replace function public.bridge_review_bond_originator_workspace_document_request(
 p_request_id uuid,p_action text,p_buyer_safe_feedback text default null,p_internal_note text default null,p_originator_profile_id uuid default auth.uid()
) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.transaction_bond_originator_document_requests%rowtype; next_status text;
begin
 if auth.uid() is null or p_originator_profile_id is distinct from auth.uid() then raise exception 'Authenticated originator required.' using errcode='42501'; end if;
 -- Serialize with assessment/submission using the same package lock first.
 perform 1 from public.transaction_bond_application_export_packages p
 join public.transaction_bond_originator_workspace_assignments a on a.export_package_id=p.id
 join public.transaction_bond_originator_document_requests q on q.export_package_id=p.id
 where q.id=p_request_id and a.assigned_to_profile_id=auth.uid() and a.status in ('assigned','accepted')
 and p.status not in ('cancelled','superseded') and p.destination_key='bond_originator_intake' for update of p;
 if not found then raise exception 'Originator is not assigned to this package.' using errcode='42501'; end if;
 select * into r from public.transaction_bond_originator_document_requests where id=p_request_id for update;
 if r.status in ('accepted','withdrawn','cancelled') then raise exception 'This request is already closed.'; end if;
 next_status := case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' when 'more_information' then 'needs_more_information' when 'withdraw' then 'withdrawn' end;
 if next_status is null then raise exception 'Unsupported document review action.'; end if;
 if p_action in ('reject','more_information','withdraw') and nullif(trim(p_buyer_safe_feedback),'') is null then raise exception 'Explain what needs to change or why the request is withdrawn.'; end if;
 if p_action <> 'withdraw' and r.status <> 'awaiting_review' then raise exception 'Wait for a new upload before reviewing this request.'; end if;
 if p_action = 'accept' and not exists(select 1 from public.documents d where d.id=r.linked_document_id and d.transaction_id=r.transaction_id
 and coalesce(to_jsonb(d)->>'archived_at','')='' and lower(coalesce(to_jsonb(d)->>'status','')) not in ('rejected','deleted','archived','superseded')
 and lower(coalesce(to_jsonb(d)->>'review_status','')) not in ('rejected','needs_replacement','superseded')) then raise exception 'A usable linked document is required before acceptance.'; end if;
 update public.transaction_bond_originator_document_requests set status=next_status,buyer_safe_feedback=nullif(trim(p_buyer_safe_feedback),''),internal_note=nullif(trim(p_internal_note),''),
 reviewed_by=auth.uid(),reviewed_at=now(),withdrawn_at=case when next_status='withdrawn' then now() else withdrawn_at end,
 resolved_at=case when next_status in ('accepted','withdrawn') then now() else null end,last_originator_action_at=now(),updated_at=now() where id=r.id;
 return r.id;
end $$;

create or replace function public.bridge_review_bond_handoff_document(p_request_id uuid,p_expected_document_id uuid,p_action text,p_feedback text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 -- The existing command authorizes and locks the package and request before checking the viewed file.
 result := public.bridge_review_bond_originator_workspace_document_request(p_request_id,p_action,p_feedback);
 if not exists(select 1 from public.transaction_bond_originator_document_requests where id=p_request_id and linked_document_id is not distinct from p_expected_document_id) then
   raise exception 'The document changed while you were reviewing it. Refresh and review the replacement.' using errcode='40001';
 end if;
 return result;
end $$;
revoke all on function public.bridge_review_bond_handoff_document(uuid,uuid,text,text) from public,anon;
grant execute on function public.bridge_review_bond_handoff_document(uuid,uuid,text,text) to authenticated;

create or replace function public.bridge_bond_handoff_correction(p_export_package_id uuid,p_action text,p_instruction text default null,p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.transaction_bond_application_export_packages%rowtype; a public.bond_applications%rowtype; r public.bond_application_change_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'Authenticated originator required.' using errcode='42501'; end if;
 select package.* into p from public.transaction_bond_application_export_packages package
 join public.transaction_bond_originator_workspace_assignments assignment on assignment.export_package_id=package.id
 where package.id=p_export_package_id and assignment.assigned_to_profile_id=auth.uid() and assignment.status in ('assigned','accepted')
 and package.status not in ('cancelled','superseded') and package.destination_key='bond_originator_intake' for update of package;
 if not found then raise exception 'Originator is not assigned to this package.' using errcode='42501'; end if;
 select * into a from public.bond_applications where id=p.bond_application_id for update;
 if a.id is null or a.status='cancelled' then raise exception 'Application is unavailable.'; end if;
 if p_action='request' then
   if nullif(trim(p_instruction),'') is null then raise exception 'Describe the application correction.'; end if;
   if exists(select 1 from public.bond_application_change_requests where bond_application_id=a.id and status not in ('resolved','withdrawn','cancelled','superseded')) then raise exception 'Review the existing correction request first.'; end if;
   if not exists(select 1 from public.transaction_bond_application_submissions where id=a.active_submission_id and status in ('signed','submitted') and signed_at is not null) then raise exception 'A signed application is required for a formal correction. Finish or cancel any pending signing first.'; end if;
   insert into public.bond_application_change_requests(bond_application_id,base_submission_id,request_type,status,requires_new_submission,target_application_revision,requested_by,requested_by_role,buyer_visible_summary,sent_at,metadata)
   values(a.id,a.active_submission_id,'application_correction','sent',true,a.revision+1,auth.uid(),'bond_originator',trim(p_instruction),now(),jsonb_build_object('exportPackageId',p.id)) returning * into r;
   insert into public.bond_application_change_request_items(change_request_id,target_scope,target_type,title,buyer_instruction,requires_new_submission)
   values(r.id,'shared_application','general','Application correction',trim(p_instruction),true);
   update public.bond_applications set status='changes_requested',submitted_at=null,locked_at=null,revision=revision+1,active_change_request_id=r.id,revision_base_submission_id=a.active_submission_id,
     metadata=coalesce(metadata,'{}')||jsonb_build_object('revisionStatus','revision_in_progress','revisionEditScope',jsonb_build_object('allSections',true)),revision_status='changes_requested',revision_opened_at=now(),revision_opened_by=auth.uid(),updated_at=now() where id=a.id;
   update public.onboarding_form_data set form_data=jsonb_set(coalesce(form_data,'{}'),'{bond_application}',
     coalesce(form_data->'bond_application','{}')||jsonb_build_object('status','Draft','submitted_at',null,'_meta',coalesce(form_data#>'{bond_application,_meta}','{}')||jsonb_build_object('originator_correction_id',r.id)),true),updated_at=now()
     where transaction_id=p.transaction_id;
 elsif p_action='resolve' then
   select * into r from public.bond_application_change_requests where id=p_request_id and bond_application_id=a.id for update;
   if r.id is null or r.status in ('resolved','withdrawn','cancelled','superseded') then raise exception 'Open correction request not found.'; end if;
   if not exists(select 1 from public.transaction_bond_application_submissions s where s.id=a.active_submission_id and s.id is distinct from r.base_submission_id and s.bond_application_id=a.id and s.transaction_id=p.transaction_id
     and s.status in ('signed','submitted') and s.signed_at is not null and s.source_application_revision=a.revision and jsonb_array_length(s.signer_manifest_json)>0) then
     raise exception 'A newly signed current application version is required before resolving corrections.';
   end if;
   update public.bond_application_change_requests set status='resolved',resolved_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('reviewedBy',auth.uid(),'resolvedSubmissionId',a.active_submission_id) where id=r.id;
   update public.bond_application_change_request_items set status='accepted',reviewed_at=now(),reviewed_by=auth.uid() where change_request_id=r.id and status not in ('withdrawn','superseded');
   update public.bond_applications set active_change_request_id=null,revision_status='revision_submitted',metadata=metadata - 'revisionEditScope' - 'revisionStatus' where id=a.id;
 else raise exception 'Unsupported correction action.'; end if;
 return r.id;
end $$;
revoke all on function public.bridge_bond_handoff_correction(uuid,text,text,uuid) from public,anon;
grant execute on function public.bridge_bond_handoff_correction(uuid,text,text,uuid) to authenticated;

create or replace function public.bridge_bond_handoff_view(p_export_package_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare app_id uuid;
begin
 select p.bond_application_id into app_id from public.transaction_bond_application_export_packages p
 join public.transaction_bond_originator_workspace_assignments a on a.export_package_id=p.id
 where p.id=p_export_package_id and a.assigned_to_profile_id=auth.uid() and a.status in ('assigned','accepted') and p.destination_key='bond_originator_intake' and p.status not in ('cancelled','superseded');
 if auth.uid() is null or app_id is null then raise exception 'Originator is not assigned to this package.' using errcode='42501'; end if;
 return jsonb_build_object('currentVersion',(select jsonb_build_object('id',s.id,'number',s.submission_version,'signedAt',s.signed_at) from public.bond_applications a join public.transaction_bond_application_submissions s on s.id=a.active_submission_id where a.id=app_id),'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'instruction',r.buyer_instruction,'feedback',r.buyer_safe_feedback,'documentId',r.linked_document_id,'dueAt',r.due_at,'history',coalesce(r.metadata->'reviewHistory','[]')) order by r.created_at desc) from public.transaction_bond_originator_document_requests r where r.export_package_id=p_export_package_id),'[]'),
 'corrections',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'instruction',r.buyer_visible_summary,'createdAt',r.created_at,'resolvedAt',r.resolved_at,'baseSubmissionId',r.base_submission_id) order by r.created_at desc) from public.bond_application_change_requests r where r.bond_application_id=app_id),'[]'));
end $$;
revoke all on function public.bridge_bond_handoff_view(uuid) from public,anon;
grant execute on function public.bridge_bond_handoff_view(uuid) to authenticated;

create or replace function public.bridge_sync_bond_application_document_continuity_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.bond_application_document_requirements%rowtype;
  v_document_id uuid := new.uploaded_document_id;
  v_event_type text;
begin
  if new.transaction_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.uploaded_document_id is not distinct from new.uploaded_document_id
    and old.is_uploaded is not distinct from new.is_uploaded then
    if coalesce(current_setting('bridge.phase6_force_sync', true), '') <> 'true' then
      return new;
    end if;
  end if;

  for v_requirement in
    select requirement.*
    from public.bond_application_document_requirements requirement
    join public.bond_applications application on application.id = requirement.bond_application_id
    where application.transaction_id = new.transaction_id
      and application.status <> 'cancelled'
      and requirement.status not in ('inactive', 'superseded', 'waived')
      and (
        requirement.transaction_required_document_id = new.id
        or (
          requirement.transaction_required_document_id is null
          and lower(coalesce(requirement.requirement_key, '')) = lower(coalesce(new.document_key, ''))
        )
      )
  loop
    v_event_type := case when coalesce(new.is_uploaded, false) and v_document_id is not null then 'linked' else 'unlinked' end;
    if v_requirement.linked_document_id is not distinct from (case when v_event_type = 'linked' then v_document_id else null end)
      and ((v_event_type = 'linked' and v_requirement.status = 'satisfied') or (v_event_type = 'unlinked' and v_requirement.status = 'active')) then
      continue;
    end if;
    update public.bond_application_document_requirements
    set linked_document_id = case when v_event_type = 'linked' then v_document_id else null end,
        linked_at = case when v_event_type = 'linked' then now() else null end,
        linked_by = case when v_event_type = 'linked' then auth.uid() else null end,
        status = case when v_event_type = 'linked' then 'satisfied' else 'active' end,
        continuity_version = 'bond_application_portal_phase6',
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'continuitySource', 'transaction_required_document_sync',
          'continuitySyncedAt', now(),
          'transactionRequiredDocumentId', new.id
        )
    where id = v_requirement.id;

    insert into public.bond_application_document_continuity_events (
      bond_application_id, transaction_id, bond_application_document_requirement_id,
      transaction_required_document_id, document_id, event_type, metadata
    ) values (
      v_requirement.bond_application_id, new.transaction_id, v_requirement.id,
      new.id, case when v_event_type = 'linked' then v_document_id else null end, v_event_type,
      jsonb_build_object('documentKey', new.document_key, 'requiredDocumentStatus', new.status)
    );

    if v_event_type = 'linked' then
      update public.transaction_bond_originator_document_requests request
      set linked_document_id = v_document_id,
          uploaded_at = coalesce(request.uploaded_at, now()),
          submitted_for_review_at = coalesce(request.submitted_for_review_at, now()),
          status = case when request.linked_document_id is distinct from v_document_id then 'awaiting_review' when request.status in ('sent', 'viewed', 'in_progress', 'needs_more_information', 'rejected') then 'awaiting_review' else request.status end,
          updated_at = now(),
          metadata = coalesce(request.metadata, '{}'::jsonb) || jsonb_build_object(
            'continuityLinkedAt', now(),
            'continuityRequirementId', v_requirement.id,
            'continuitySource', 'transaction_required_document_sync'
          )
      where request.transaction_id = new.transaction_id
        and request.bond_application_id = v_requirement.bond_application_id
        and request.status not in ('withdrawn', 'cancelled')
        and (
          request.transaction_required_document_id = new.id
          or lower(coalesce(request.requirement_key, '')) = lower(coalesce(v_requirement.requirement_key, ''))
          or (request.transaction_required_document_id is null and request.requirement_key is null
            and request.participant_id is not distinct from v_requirement.participant_id
            and lower(coalesce(request.canonical_document_type, '')) = lower(coalesce(v_requirement.canonical_document_type, '')))
        );
    end if;
  end loop;
  return new;
end;
$$;


-- Buyer projection deliberately excludes internal notes, reviewer identities and storage coordinates.
create or replace function public.bridge_bond_handoff_buyer_notices()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare app_id uuid; transaction_key uuid;
begin
 select bond_application_id into app_id from public.bridge_bond_application_portal_active_link();
 if app_id is null then
   select transaction_id into transaction_key from public.client_portal_links where token=public.bridge_client_portal_request_token() and is_active=true limit 1;
   if transaction_key is not null then select id into app_id from public.bond_applications where transaction_id=transaction_key and status<>'cancelled' order by created_at desc limit 1; end if;
 end if;
 if app_id is null then raise exception 'Valid buyer application access is required.' using errcode='42501'; end if;
 return jsonb_build_object('corrections',coalesce((select jsonb_agg(jsonb_build_object('id',id,'instruction',buyer_visible_summary,'status',status) order by created_at desc)
 from public.bond_application_change_requests where bond_application_id=app_id and status not in ('resolved','withdrawn','cancelled','superseded')),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'instruction',buyer_instruction,'feedback',buyer_safe_feedback,'status',status,'dueAt',due_at) order by created_at desc)
 from public.transaction_bond_originator_document_requests where bond_application_id=app_id and status not in ('accepted','withdrawn','cancelled')
 and (target_scope='application_documents' or participant_role='primary_applicant')),'[]'));
end $$;
revoke all on function public.bridge_bond_handoff_buyer_notices() from public;
grant execute on function public.bridge_bond_handoff_buyer_notices() to anon,authenticated;

create or replace function public.bridge_record_bond_handoff_submission(p_export_package_id uuid,p_expected_submission_id uuid,p_lender_names text[],p_submitted_at timestamptz,p_external_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; s public.transaction_bond_application_submissions%rowtype;
begin
 -- This takes the authorized package/application locks before comparing the version shown to the originator.
 perform public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id);
 select submission.* into s from public.transaction_bond_application_export_packages p
 join public.bond_applications a on a.id=p.bond_application_id
 join public.transaction_bond_application_submissions submission on submission.id=a.active_submission_id where p.id=p_export_package_id;
 if p_expected_submission_id is null or s.id is distinct from p_expected_submission_id then raise exception 'The signed application changed. Refresh and confirm which version was submitted.' using errcode='40001'; end if;
 if p_submitted_at is null or p_submitted_at > now()+interval '5 minutes' or p_submitted_at < s.signed_at then raise exception 'Submission time must be after signing and cannot be in the future.'; end if;
 result := public.bridge_record_bond_application_external_submission_phase8(p_export_package_id,p_lender_names,p_external_reference,null,p_notes);
 update public.bond_application_external_submission_records set submitted_at=p_submitted_at where id=(result->>'id')::uuid;
 return result||jsonb_build_object('submittedAt',p_submitted_at,'submissionId',s.id);
end $$;
revoke all on function public.bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamptz,text,text) from public,anon;
grant execute on function public.bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamptz,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
