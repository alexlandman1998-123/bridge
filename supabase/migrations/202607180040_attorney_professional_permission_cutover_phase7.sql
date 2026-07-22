begin;

create or replace function public.attorney_user_is_firm_admin(target_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.professional_role = 'firm_admin'
  );
$$;

create or replace function public.attorney_user_is_firm_lead(target_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attorney_firm_members m
    where m.firm_id = target_firm_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.professional_role in ('firm_admin', 'director_partner')
  );
$$;

revoke all on function public.attorney_user_is_firm_admin(uuid) from public, anon;
revoke all on function public.attorney_user_is_firm_lead(uuid) from public, anon;
grant execute on function public.attorney_user_is_firm_admin(uuid) to authenticated;
grant execute on function public.attorney_user_is_firm_lead(uuid) to authenticated;

create or replace function public.bridge_sync_attorney_professional_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.professional_role := public.bridge_normalize_attorney_professional_role(
    coalesce(new.professional_role, 'viewer')
  );
  new.practice_qualifications := public.bridge_normalize_attorney_practice_qualifications(
    null,
    new.practice_qualifications
  );
  new.role := public.bridge_attorney_professional_to_compatibility_role(
    new.professional_role,
    new.practice_qualifications
  );
  return new;
end;
$$;

create or replace function public.bootstrap_attorney_firm_admin_membership(target_firm_id uuid)
returns public.attorney_firm_members
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.attorney_firm_members;
begin
  if target_firm_id is null then
    raise exception 'Firm id is required.';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.attorney_firms f
    where f.id = target_firm_id and f.created_by = auth.uid()
  ) then
    raise exception 'Permission denied for attorney firm membership bootstrap.' using errcode = '42501';
  end if;

  insert into public.attorney_firm_members (
    firm_id, user_id, role, professional_role, practice_qualifications,
    status, invited_by, joined_at
  ) values (
    target_firm_id, auth.uid(), 'firm_admin', 'firm_admin', '{}'::text[],
    'active', auth.uid(), now()
  )
  on conflict (firm_id, user_id) do update set
    professional_role = 'firm_admin',
    practice_qualifications = '{}'::text[],
    status = 'active',
    invited_by = coalesce(public.attorney_firm_members.invited_by, auth.uid()),
    joined_at = coalesce(public.attorney_firm_members.joined_at, now()),
    updated_at = now()
  returning * into member_row;

  update public.profiles
  set primary_attorney_firm_id = target_firm_id,
      attorney_role = member_row.role,
      onboarding_completed = true,
      updated_at = now()
  where id = auth.uid();

  return member_row;
end;
$$;

revoke all on function public.bridge_sync_attorney_professional_profile() from public, anon, authenticated;
revoke all on function public.bootstrap_attorney_firm_admin_membership(uuid) from public, anon;
grant execute on function public.bootstrap_attorney_firm_admin_membership(uuid) to authenticated;

update public.attorney_firm_members
set role = public.bridge_attorney_professional_to_compatibility_role(professional_role, practice_qualifications)
where role is distinct from public.bridge_attorney_professional_to_compatibility_role(professional_role, practice_qualifications);

update public.attorney_firm_invitations
set role = public.bridge_attorney_professional_to_compatibility_role(professional_role, practice_qualifications)
where role is distinct from public.bridge_attorney_professional_to_compatibility_role(professional_role, practice_qualifications);

update public.organisation_users ou
set attorney_professional_role = afm.professional_role,
    attorney_practice_qualifications = afm.practice_qualifications,
    attorney_compatibility_role = afm.role,
    attorney_firm_member_id = afm.id,
    updated_at = now()
from public.attorney_firm_members afm
where afm.organisation_user_id = ou.id
  and (
    ou.attorney_professional_role is distinct from afm.professional_role
    or ou.attorney_practice_qualifications is distinct from afm.practice_qualifications
    or ou.attorney_compatibility_role is distinct from afm.role
    or ou.attorney_firm_member_id is distinct from afm.id
  );

comment on column public.attorney_firm_members.role is
  'Phase 7 derived compatibility mirror. Never use for authorization or direct writes; professional_role and practice_qualifications are canonical.';
comment on function public.attorney_user_is_firm_admin(uuid) is
  'Phase 7 RLS helper authorized exclusively by active canonical professional-role membership.';
comment on function public.attorney_user_is_firm_lead(uuid) is
  'Phase 7 RLS helper for active firm_admin and director_partner professional roles.';

commit;
