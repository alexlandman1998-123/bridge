begin;

alter table if exists public.workspace_access_requests
  add column if not exists requested_attorney_professional_role text,
  add column if not exists requested_attorney_practice_qualifications text[] not null default '{}'::text[];

alter table if exists public.workspace_access_requests
  drop constraint if exists workspace_access_requests_attorney_professional_role_check,
  drop constraint if exists workspace_access_requests_attorney_practice_qualifications_check;

alter table if exists public.workspace_access_requests
  add constraint workspace_access_requests_attorney_professional_role_check
    check (
      requested_attorney_professional_role is null
      or requested_attorney_professional_role in (
        'firm_admin', 'director_partner', 'attorney_conveyancer', 'candidate_attorney',
        'conveyancing_secretary', 'admin_staff', 'reception_scheduling', 'viewer'
      )
    ),
  add constraint workspace_access_requests_attorney_practice_qualifications_check
    check (requested_attorney_practice_qualifications <@ array['transfer', 'bond', 'cancellation']::text[]);

update public.workspace_access_requests
set
  requested_attorney_professional_role = 'viewer',
  requested_attorney_practice_qualifications = '{}'::text[]
where workspace_type = 'attorney_firm'
  and app_role = 'attorney'
  and requested_attorney_professional_role is null;

create or replace function public.bridge_apply_accepted_attorney_invitation_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select p.id
  into v_user_id
  from public.profiles p
  where lower(trim(coalesce(p.email, ''))) = lower(trim(coalesce(new.email, '')))
  order by p.created_at asc
  limit 1;

  if v_user_id is null and auth.uid() is not null then
    select u.id
    into v_user_id
    from auth.users u
    where u.id = auth.uid()
      and lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(new.email, '')))
    limit 1;
  end if;

  if v_user_id is not null then
    update public.attorney_firm_members
    set
      professional_role = public.bridge_normalize_attorney_professional_role(new.professional_role),
      practice_qualifications = public.bridge_normalize_attorney_practice_qualifications(
        null,
        new.practice_qualifications
      ),
      updated_at = now()
    where firm_id = new.firm_id
      and user_id = v_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists attorney_firm_invitations_apply_accepted_profile on public.attorney_firm_invitations;
create trigger attorney_firm_invitations_apply_accepted_profile
after insert or update of status
on public.attorney_firm_invitations
for each row
when (new.status = 'accepted')
execute function public.bridge_apply_accepted_attorney_invitation_profile();

comment on column public.workspace_access_requests.requested_attorney_professional_role is
  'Requested attorney profile only. Public signup is fixed to viewer until a protected invitation or administrator approval assigns a professional role.';
comment on column public.workspace_access_requests.requested_attorney_practice_qualifications is
  'Requested qualifications do not grant firm or matter authority and must be confirmed by a firm administrator.';

commit;
