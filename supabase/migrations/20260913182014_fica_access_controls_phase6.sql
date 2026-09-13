-- Phase 6: access control and audit boundary for FICA cases.
-- This migration deliberately contains no provider payload storage and does not
-- loosen the transaction document/storage audience controls.

begin;

alter table public.knowledge_factory_fica_cases
  add column if not exists subject_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_party_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists assigned_staff_user_ids uuid[] not null default '{}'::uuid[];

create table if not exists public.knowledge_factory_fica_audit_events (
  id uuid primary key default gen_random_uuid(),
  fica_case_id uuid not null references public.knowledge_factory_fica_cases(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null check (event_type in ('case_created', 'case_updated', 'provider_started', 'provider_result_recorded', 'staff_approved', 'certificate_generated', 'certificate_superseded')),
  actor_user_id uuid references auth.users(id) on delete set null,
  changed_fields text[] not null default '{}'::text[],
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint knowledge_factory_fica_audit_events_metadata_object check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists knowledge_factory_fica_audit_events_case_created_idx
  on public.knowledge_factory_fica_audit_events (fica_case_id, created_at desc);

alter table public.knowledge_factory_fica_audit_events enable row level security;
revoke all on public.knowledge_factory_fica_audit_events from anon, authenticated;
grant select on public.knowledge_factory_fica_audit_events to authenticated;

drop policy if exists knowledge_factory_fica_cases_read on public.knowledge_factory_fica_cases;
create policy knowledge_factory_fica_cases_read
on public.knowledge_factory_fica_cases for select to authenticated
using (
  subject_user_id = (select auth.uid())
  or (select auth.uid()) = any(shared_party_user_ids)
  or (select auth.uid()) = any(assigned_staff_user_ids)
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'compliance_officer', 'compliance_reviewer'])
);

drop policy if exists knowledge_factory_fica_cases_insert on public.knowledge_factory_fica_cases;
create policy knowledge_factory_fica_cases_insert
on public.knowledge_factory_fica_cases for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'agent', 'compliance_officer', 'compliance_reviewer'])
);

drop policy if exists knowledge_factory_fica_cases_update on public.knowledge_factory_fica_cases;
create policy knowledge_factory_fica_cases_update
on public.knowledge_factory_fica_cases for update to authenticated
using (
  created_by = (select auth.uid())
  or (select auth.uid()) = any(assigned_staff_user_ids)
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'compliance_officer', 'compliance_reviewer'])
)
with check (
  created_by = (select auth.uid())
  or (select auth.uid()) = any(assigned_staff_user_ids)
  or public.knowledge_factory_is_active_member(organisation_id, array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'compliance_officer', 'compliance_reviewer'])
);

create or replace function public.knowledge_factory_fica_is_privileged(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.knowledge_factory_is_active_member(
    p_organisation_id,
    array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin', 'compliance_officer', 'compliance_reviewer']
  );
$$;

create or replace function public.knowledge_factory_fica_guard_case_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.knowledge_factory_fica_is_privileged(old.organisation_id)
    and (to_jsonb(new) - array['document_checklist', 'status', 'updated_at'])
      is distinct from (to_jsonb(old) - array['document_checklist', 'status', 'updated_at']) then
    raise exception 'Only authorised compliance staff may change FICA verification, approval, certificate, sharing, or assignment fields.';
  end if;
  return new;
end;
$$;

create or replace function public.knowledge_factory_fica_write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields text[];
  event_name text := 'case_updated';
begin
  if tg_op = 'INSERT' then
    event_name := 'case_created';
    fields := array['created'];
  else
    select coalesce(array_agg(key order by key), '{}'::text[]) into fields
    from jsonb_object_keys(to_jsonb(new)) key
    where (to_jsonb(new)->key) is distinct from (to_jsonb(old)->key)
      and key not in ('updated_at');
    if 'verification_provider_status' = any(fields) then event_name := 'provider_started'; end if;
    if 'provider_overall_status' = any(fields) then event_name := 'provider_result_recorded'; end if;
    if 'staff_approval_status' = any(fields) then event_name := 'staff_approved'; end if;
    if 'certificate_document_id' = any(fields) then event_name := 'certificate_generated'; end if;
    if 'certificate_superseded_at' = any(fields) then event_name := 'certificate_superseded'; end if;
  end if;
  insert into public.knowledge_factory_fica_audit_events (fica_case_id, organisation_id, event_type, actor_user_id, changed_fields)
  values (new.id, new.organisation_id, event_name, auth.uid(), fields);
  return new;
end;
$$;

drop trigger if exists knowledge_factory_fica_cases_guard_update on public.knowledge_factory_fica_cases;
create trigger knowledge_factory_fica_cases_guard_update
before update on public.knowledge_factory_fica_cases
for each row execute function public.knowledge_factory_fica_guard_case_update();

drop trigger if exists knowledge_factory_fica_cases_audit_insert on public.knowledge_factory_fica_cases;
create trigger knowledge_factory_fica_cases_audit_insert
after insert on public.knowledge_factory_fica_cases
for each row execute function public.knowledge_factory_fica_write_audit_event();

drop trigger if exists knowledge_factory_fica_cases_audit_update on public.knowledge_factory_fica_cases;
create trigger knowledge_factory_fica_cases_audit_update
after update on public.knowledge_factory_fica_cases
for each row execute function public.knowledge_factory_fica_write_audit_event();

drop policy if exists knowledge_factory_fica_audit_events_read on public.knowledge_factory_fica_audit_events;
create policy knowledge_factory_fica_audit_events_read
on public.knowledge_factory_fica_audit_events for select to authenticated
using (exists (
  select 1 from public.knowledge_factory_fica_cases case_row
  where case_row.id = fica_case_id
    and (
      case_row.subject_user_id = (select auth.uid())
      or (select auth.uid()) = any(case_row.shared_party_user_ids)
      or (select auth.uid()) = any(case_row.assigned_staff_user_ids)
      or public.knowledge_factory_fica_is_privileged(case_row.organisation_id)
    )
));

revoke all on function public.knowledge_factory_fica_is_privileged(uuid) from public;
revoke all on function public.knowledge_factory_fica_guard_case_update() from public;
revoke all on function public.knowledge_factory_fica_write_audit_event() from public;
grant execute on function public.knowledge_factory_fica_is_privileged(uuid) to authenticated;

comment on table public.knowledge_factory_fica_audit_events is 'Immutable FICA workflow audit. Records field names only; never raw provider responses or document bytes.';
comment on column public.knowledge_factory_fica_cases.shared_party_user_ids is 'Named buyer/seller/co-party users may read their shared FICA case only.';
comment on column public.knowledge_factory_fica_cases.assigned_staff_user_ids is 'Assigned agency staff may review the case. Approval and provider fields remain guarded by the privileged update trigger.';

notify pgrst, 'reload schema';
commit;
