begin;
-- Keep existing assignment authorization and grants; strengthen only readiness.
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
    where request.export_package_id = v_package.id and request.status not in ('accepted', 'cancelled', 'superseded')
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

create or replace function public.bridge_bond_application_submission_readiness_view_phase7()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', 'bond_application_portal_phase7', 'items', coalesce(jsonb_agg(jsonb_build_object('exportPackageId', package.id, 'assessment', assessment.value) order by package.created_at desc), '[]'::jsonb))
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package on package.id = assignment.export_package_id
  join public.bond_applications application on application.id = package.bond_application_id
  left join lateral (select jsonb_build_object('status', case when item.application_revision = application.revision then item.status else 'blocked' end, 'blockers', case when item.application_revision = application.revision then item.blockers else jsonb_build_array(jsonb_build_object('key','stale_assessment','message','Reassess the current application revision.')) end, 'assessedAt', item.assessed_at) value from public.bond_application_submission_readiness_assessments item where item.export_package_id = package.id order by item.assessed_at desc limit 1) assessment on true
  where assignment.assigned_to_profile_id = auth.uid() and assignment.status in ('assigned', 'accepted') and package.destination_key = 'bond_originator_intake' and package.status not in ('cancelled', 'superseded');
$$;

revoke all on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid) from public, anon;
revoke all on function public.bridge_bond_application_submission_readiness_view_phase7() from public, anon;
grant execute on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid) to authenticated;
grant execute on function public.bridge_bond_application_submission_readiness_view_phase7() to authenticated;
create or replace function public.bridge_record_bond_application_external_submission_phase8(p_export_package_id uuid, p_lender_names text[] default '{}', p_external_reference text default null, p_confirmation_document_id uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_package public.transaction_bond_application_export_packages%rowtype; v_assessment public.bond_application_submission_readiness_assessments%rowtype; v_record public.bond_application_external_submission_records%rowtype;
begin
 if auth.uid() is null then raise exception 'An authenticated originator is required.' using errcode='42501'; end if;
 select package.* into v_package from public.transaction_bond_application_export_packages package join public.transaction_bond_originator_workspace_assignments assignment on assignment.export_package_id=package.id where package.id=p_export_package_id and package.destination_key='bond_originator_intake' and assignment.assigned_to_profile_id=auth.uid() and assignment.status in ('assigned','accepted') for update;
 if not found or v_package.bond_application_id is null then raise exception 'Assigned application package not found.' using errcode='42501'; end if;
 -- Re-evaluate under the same transaction; a cached assessment is not permission to submit.
 perform public.bridge_assess_bond_application_submission_readiness_phase7(p_export_package_id);
 select * into v_assessment from public.bond_application_submission_readiness_assessments where export_package_id=v_package.id order by assessed_at desc limit 1;
 if v_assessment.id is null or v_assessment.status <> 'ready' then raise exception 'A current ready submission assessment is required before recording external submission.' using errcode='22023'; end if;
 insert into public.bond_application_external_submission_records (export_package_id,bond_application_id,readiness_assessment_id,submitted_by,lender_names,external_reference,confirmation_document_id,notes,metadata) values (v_package.id,v_package.bond_application_id,v_assessment.id,auth.uid(),coalesce(p_lender_names,'{}'),nullif(trim(p_external_reference),''),p_confirmation_document_id,nullif(trim(p_notes),''),jsonb_build_object('phase','bond_application_portal_phase8','externalOnly',true,'automaticBankSubmission',false)) returning * into v_record;
 return jsonb_build_object('id',v_record.id,'status',v_record.status,'submittedAt',v_record.submitted_at,'externalOnly',true);
end; $$;

notify pgrst, 'reload schema';
commit;
