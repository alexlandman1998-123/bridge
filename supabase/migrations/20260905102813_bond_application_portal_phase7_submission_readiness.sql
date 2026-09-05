begin;

create table if not exists public.bond_application_submission_readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  assessed_by uuid not null references public.profiles(id) on delete restrict,
  application_revision integer not null,
  status text not null check (status in ('ready', 'blocked')),
  blockers jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  assessed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (export_package_id, application_revision)
);

create index if not exists bond_application_submission_readiness_assessments_package_idx
  on public.bond_application_submission_readiness_assessments (export_package_id, assessed_at desc);
alter table public.bond_application_submission_readiness_assessments enable row level security;
revoke all on public.bond_application_submission_readiness_assessments from public, anon;
grant select on public.bond_application_submission_readiness_assessments to authenticated;
grant all on public.bond_application_submission_readiness_assessments to service_role;
create policy bond_application_submission_readiness_assessments_assigned_read
  on public.bond_application_submission_readiness_assessments for select to authenticated
  using (exists (
    select 1 from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.export_package_id = bond_application_submission_readiness_assessments.export_package_id
      and assignment.assigned_to_profile_id = (select auth.uid())
      and assignment.status in ('assigned', 'accepted')
  ));

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
  if v_application.status in ('submitted', 'cancelled') then raise exception 'This application is no longer eligible for readiness assessment.' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_blockers from (
    select jsonb_build_object('key', 'outstanding_documents', 'count', count(*), 'message', 'Required documents are still outstanding.') item
    from public.bond_application_document_requirements requirement
    where requirement.bond_application_id = v_application.id and requirement.status = 'active'
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'pending_participants', 'count', count(*), 'message', 'Applicant or co-applicant actions are still pending.')
    from public.bond_application_participants participant
    where participant.bond_application_id = v_application.id and participant.status not in ('ready_for_submission', 'awaiting_signature', 'signed', 'completed', 'removed')
    having count(*) > 0
    union all
    select jsonb_build_object('key', 'documents_awaiting_review', 'count', count(*), 'message', 'Originator-requested documents still need review.')
    from public.transaction_bond_originator_document_requests request
    where request.export_package_id = v_package.id and request.status = 'awaiting_review'
    having count(*) > 0
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
  left join lateral (select jsonb_build_object('status', item.status, 'blockers', item.blockers, 'assessedAt', item.assessed_at) value from public.bond_application_submission_readiness_assessments item where item.export_package_id = package.id order by item.assessed_at desc limit 1) assessment on true
  where assignment.assigned_to_profile_id = auth.uid() and assignment.status in ('assigned', 'accepted') and package.destination_key = 'bond_originator_intake' and package.status not in ('cancelled', 'superseded');
$$;

revoke all on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid) from public, anon;
revoke all on function public.bridge_bond_application_submission_readiness_view_phase7() from public, anon;
grant execute on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid) to authenticated;
grant execute on function public.bridge_bond_application_submission_readiness_view_phase7() to authenticated;
comment on function public.bridge_assess_bond_application_submission_readiness_phase7(uuid) is 'Phase 7 originator readiness assessment. It records blockers but never submits to a bank or mutates bank workflow.';
notify pgrst, 'reload schema';
commit;
