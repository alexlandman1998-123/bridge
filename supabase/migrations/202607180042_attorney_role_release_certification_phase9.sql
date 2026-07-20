begin;

alter table public.attorney_firm_members
  drop constraint if exists attorney_firm_members_compatibility_role_derived_phase9;
alter table public.attorney_firm_members
  add constraint attorney_firm_members_compatibility_role_derived_phase9
  check (
    role = public.bridge_attorney_professional_to_compatibility_role(
      professional_role,
      practice_qualifications
    )
  ) not valid;

alter table public.attorney_firm_invitations
  drop constraint if exists attorney_firm_invitations_compatibility_role_derived_phase9;
alter table public.attorney_firm_invitations
  add constraint attorney_firm_invitations_compatibility_role_derived_phase9
  check (
    role = public.bridge_attorney_professional_to_compatibility_role(
      professional_role,
      practice_qualifications
    )
  ) not valid;

create table if not exists public.attorney_role_release_certifications (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  certification_version text not null default 'phase9-v1',
  status text not null default 'certified' check (status = 'certified'),
  integrity_row_count integer not null check (integrity_row_count > 0),
  integrity_snapshot jsonb not null default '{}'::jsonb,
  certified_by uuid not null references auth.users(id) on delete restrict,
  certified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, certification_version)
);

alter table public.attorney_role_release_certifications enable row level security;

drop policy if exists attorney_role_release_certifications_select_member_phase9
  on public.attorney_role_release_certifications;
create policy attorney_role_release_certifications_select_member_phase9
on public.attorney_role_release_certifications
for select to authenticated
using (public.attorney_user_is_active_member(firm_id));

revoke all on table public.attorney_role_release_certifications from public, anon, authenticated;
grant select on public.attorney_role_release_certifications to authenticated;

create or replace function public.certify_attorney_role_release_phase9(target_firm_id uuid)
returns public.attorney_role_release_certifications
language plpgsql
security definer
set search_path = public
as $$
declare
  integrity_row_count integer;
  blocking_count integer;
  status_counts jsonb;
  certification public.attorney_role_release_certifications;
begin
  if target_firm_id is null then
    raise exception 'Firm id is required.' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.attorney_user_is_firm_admin(target_firm_id) then
    raise exception 'Only an active canonical firm administrator may certify this release.' using errcode = '42501';
  end if;

  select
    coalesce(sum(status_count), 0)::integer,
    coalesce(sum(status_count) filter (where integrity_status <> 'healthy'), 0)::integer,
    coalesce(jsonb_object_agg(integrity_status, status_count), '{}'::jsonb)
  into integrity_row_count, blocking_count, status_counts
  from (
    select integrity_status, count(*)::integer as status_count
    from public.attorney_role_integrity_v1
    where firm_id = target_firm_id
    group by integrity_status
  ) integrity;

  if integrity_row_count = 0 then
    raise exception 'No attorney role integrity rows are visible for this firm.' using errcode = 'P0001';
  end if;
  if blocking_count > 0 then
    raise exception 'Attorney role integrity gate is blocked for this firm.' using errcode = 'P0001';
  end if;

  insert into public.attorney_role_release_certifications (
    firm_id, certification_version, status, integrity_row_count,
    integrity_snapshot, certified_by, certified_at, updated_at
  ) values (
    target_firm_id, 'phase9-v1', 'certified', integrity_row_count,
    jsonb_build_object(
      'gate', 'pass',
      'status_counts', status_counts,
      'integrity_view', 'attorney_role_integrity_v1',
      'compatibility_columns_removed', false
    ),
    auth.uid(), now(), now()
  )
  on conflict (firm_id, certification_version) do update set
    status = excluded.status,
    integrity_row_count = excluded.integrity_row_count,
    integrity_snapshot = excluded.integrity_snapshot,
    certified_by = excluded.certified_by,
    certified_at = excluded.certified_at,
    updated_at = now()
  returning * into certification;

  return certification;
end;
$$;

revoke all on function public.certify_attorney_role_release_phase9(uuid) from public, anon;
grant execute on function public.certify_attorney_role_release_phase9(uuid) to authenticated;

comment on table public.attorney_role_release_certifications is
  'Phase 9 per-firm evidence that the live Phase 8 integrity gate passed. Certification does not remove compatibility columns.';
comment on constraint attorney_firm_members_compatibility_role_derived_phase9 on public.attorney_firm_members is
  'Phase 9 derived-only compatibility mirror guard. NOT VALID avoids an unreviewed historical rewrite while enforcing new writes.';

commit;
