begin;
create or replace function public.bridge_current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
create or replace function public.bridge_membership_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(ou.role)
  from public.organisation_users ou
  where ou.organisation_id = target_org
    and ou.user_id = auth.uid()
    and ou.status = 'active'
  order by ou.created_at asc
  limit 1;
$$;
create or replace function public.bridge_is_active_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = target_org
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  );
$$;
create or replace function public.bridge_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_membership_role(target_org) in ('super_admin', 'principal', 'admin', 'developer', 'branch_manager'),
    false
  );
$$;
create or replace function public.bridge_claim_pending_org_invite()
returns table (
  id uuid,
  organisation_id uuid,
  role text,
  status text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_email text;
begin
  invite_email := public.bridge_current_email();
  if auth.uid() is null or coalesce(invite_email, '') = '' then
    return;
  end if;

  return query
  update public.organisation_users ou
    set user_id = auth.uid(),
        status = 'active',
        accepted_at = now(),
        joined_at = coalesce(ou.joined_at, now()),
        updated_at = now()
  where ou.id = (
    select inner_ou.id
    from public.organisation_users inner_ou
    where lower(inner_ou.email) = invite_email
      and inner_ou.status = 'invited'
      and (inner_ou.invitation_expires_at is null or inner_ou.invitation_expires_at > now())
    order by inner_ou.created_at asc
    limit 1
  )
  returning ou.id, ou.organisation_id, ou.role, ou.status, ou.email;
end;
$$;
grant execute on function public.bridge_current_email() to authenticated;
grant execute on function public.bridge_membership_role(uuid) to authenticated;
grant execute on function public.bridge_is_active_member(uuid) to authenticated;
grant execute on function public.bridge_is_org_admin(uuid) to authenticated;
grant execute on function public.bridge_claim_pending_org_invite() to authenticated;
alter table if exists public.organisations enable row level security;
alter table if exists public.organisation_users enable row level security;
alter table if exists public.organisation_settings enable row level security;
-- organisations

drop policy if exists organisations_agency_select on public.organisations;
create policy organisations_agency_select on public.organisations
for select to authenticated
using (
  public.bridge_is_active_member(id)
  or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = organisations.id
      and ou.status = 'invited'
      and lower(ou.email) = public.bridge_current_email()
  )
);
drop policy if exists organisations_agency_insert on public.organisations;
create policy organisations_agency_insert on public.organisations
for insert to authenticated
with check (auth.uid() is not null);
drop policy if exists organisations_agency_update on public.organisations;
create policy organisations_agency_update on public.organisations
for update to authenticated
using (public.bridge_is_org_admin(id))
with check (public.bridge_is_org_admin(id));
drop policy if exists organisations_agency_delete on public.organisations;
create policy organisations_agency_delete on public.organisations
for delete to authenticated
using (public.bridge_is_org_admin(id));
-- organisation_users

drop policy if exists organisation_users_agency_select on public.organisation_users;
create policy organisation_users_agency_select on public.organisation_users
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (status = 'invited' and lower(email) = public.bridge_current_email())
);
drop policy if exists organisation_users_agency_insert on public.organisation_users;
create policy organisation_users_agency_insert on public.organisation_users
for insert to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    auth.uid() is not null
    and user_id = auth.uid()
    and lower(email) = public.bridge_current_email()
  )
);
drop policy if exists organisation_users_agency_update on public.organisation_users;
create policy organisation_users_agency_update on public.organisation_users
for update to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));
drop policy if exists organisation_users_agency_delete on public.organisation_users;
create policy organisation_users_agency_delete on public.organisation_users
for delete to authenticated
using (public.bridge_is_org_admin(organisation_id));
-- organisation_settings

drop policy if exists organisation_settings_agency_select on public.organisation_settings;
create policy organisation_settings_agency_select on public.organisation_settings
for select to authenticated
using (public.bridge_is_active_member(organisation_id));
drop policy if exists organisation_settings_agency_write on public.organisation_settings;
create policy organisation_settings_agency_write on public.organisation_settings
for all to authenticated
using (public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_org_admin(organisation_id));
commit;
