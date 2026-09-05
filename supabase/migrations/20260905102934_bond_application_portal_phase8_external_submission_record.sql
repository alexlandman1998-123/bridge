begin;
create table if not exists public.bond_application_external_submission_records (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  readiness_assessment_id uuid references public.bond_application_submission_readiness_assessments(id) on delete set null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  lender_names text[] not null default '{}'::text[],
  external_reference text,
  submitted_at timestamptz not null default now(),
  confirmation_document_id uuid references public.documents(id) on delete set null,
  notes text,
  status text not null default 'recorded' check (status in ('recorded', 'withdrawn')),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists bond_application_external_submission_records_package_idx on public.bond_application_external_submission_records (export_package_id, submitted_at desc);
alter table public.bond_application_external_submission_records enable row level security;
revoke all on public.bond_application_external_submission_records from public, anon;
grant select on public.bond_application_external_submission_records to authenticated;
grant all on public.bond_application_external_submission_records to service_role;
create policy bond_application_external_submission_records_assigned_read on public.bond_application_external_submission_records for select to authenticated using (exists (select 1 from public.transaction_bond_originator_workspace_assignments assignment where assignment.export_package_id = bond_application_external_submission_records.export_package_id and assignment.assigned_to_profile_id = (select auth.uid()) and assignment.status in ('assigned','accepted')));
create or replace function public.bridge_record_bond_application_external_submission_phase8(p_export_package_id uuid, p_lender_names text[] default '{}', p_external_reference text default null, p_confirmation_document_id uuid default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_package public.transaction_bond_application_export_packages%rowtype; v_assessment public.bond_application_submission_readiness_assessments%rowtype; v_record public.bond_application_external_submission_records%rowtype;
begin
 if auth.uid() is null then raise exception 'An authenticated originator is required.' using errcode='42501'; end if;
 select package.* into v_package from public.transaction_bond_application_export_packages package join public.transaction_bond_originator_workspace_assignments assignment on assignment.export_package_id=package.id where package.id=p_export_package_id and package.destination_key='bond_originator_intake' and assignment.assigned_to_profile_id=auth.uid() and assignment.status in ('assigned','accepted') for update;
 if not found or v_package.bond_application_id is null then raise exception 'Assigned application package not found.' using errcode='42501'; end if;
 select * into v_assessment from public.bond_application_submission_readiness_assessments where export_package_id=v_package.id order by assessed_at desc limit 1;
 if v_assessment.id is null or v_assessment.status <> 'ready' then raise exception 'A current ready submission assessment is required before recording external submission.' using errcode='22023'; end if;
 insert into public.bond_application_external_submission_records (export_package_id,bond_application_id,readiness_assessment_id,submitted_by,lender_names,external_reference,confirmation_document_id,notes,metadata) values (v_package.id,v_package.bond_application_id,v_assessment.id,auth.uid(),coalesce(p_lender_names,'{}'),nullif(trim(p_external_reference),''),p_confirmation_document_id,nullif(trim(p_notes),''),jsonb_build_object('phase','bond_application_portal_phase8','externalOnly',true,'automaticBankSubmission',false)) returning * into v_record;
 return jsonb_build_object('id',v_record.id,'status',v_record.status,'submittedAt',v_record.submitted_at,'externalOnly',true);
end; $$;
create or replace function public.bridge_bond_application_external_submission_view_phase8() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('version','bond_application_portal_phase8','items',coalesce(jsonb_agg(jsonb_build_object('exportPackageId',package.id,'records',coalesce(records.items,'[]'::jsonb)) order by package.created_at desc),'[]'::jsonb)) from public.transaction_bond_originator_workspace_assignments assignment join public.transaction_bond_application_export_packages package on package.id=assignment.export_package_id left join lateral (select jsonb_agg(jsonb_build_object('id',record.id,'lenderNames',record.lender_names,'externalReference',record.external_reference,'submittedAt',record.submitted_at,'status',record.status,'confirmationDocumentId',record.confirmation_document_id) order by record.submitted_at desc) items from public.bond_application_external_submission_records record where record.export_package_id=package.id) records on true where assignment.assigned_to_profile_id=auth.uid() and assignment.status in ('assigned','accepted') and package.destination_key='bond_originator_intake';
$$;
revoke all on function public.bridge_record_bond_application_external_submission_phase8(uuid,text[],text,uuid,text) from public,anon;
revoke all on function public.bridge_bond_application_external_submission_view_phase8() from public,anon;
grant execute on function public.bridge_record_bond_application_external_submission_phase8(uuid,text[],text,uuid,text) to authenticated;
grant execute on function public.bridge_bond_application_external_submission_view_phase8() to authenticated;
comment on function public.bridge_record_bond_application_external_submission_phase8(uuid,text[],text,uuid,text) is 'Phase 8 records an originator-confirmed external bank submission after readiness. It never sends an application, credential, or payload to a bank.';
notify pgrst,'reload schema'; commit;
